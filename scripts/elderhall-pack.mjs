import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pngjs from "pngjs";
import { ELDERHALL_ENVIRONMENT_IDS as CANDIDATE_IDS } from "../src/game/elderhall-assets.ts";
import contract from "./environment_pack.required-ids.json" with { type: "json" };

export { CANDIDATE_IDS };

const PROVENANCE_SOURCE_TYPES = new Set(["original_programmatic", "reference_conditioned", "owner_provided", "external", "native_recipe"]);
const ASSET_PREFIX = "elderhall.";
const PACK_ID = "reliquary.elderhall";
if (contract.contract_revision !== 3) throw new Error("Unsupported Elderhall contract revision");
const PROFILE = contract.profiles[PACK_ID];
const ASSET_ID = new RegExp(contract.asset_id_pattern);
const PACK_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const REQUIRED_LANDMARKS = PROFILE.required.filter((name) => name.endsWith("-reference") || PROFILE.placeholder_ok.includes(name));
const PLACEHOLDER_IDS = new Set(PROFILE.placeholder_ok.map((name) => ASSET_PREFIX + name));
const KNOWN_STAND_INS = new Set(PROFILE.known_stand_in_sha256);
const KNOWN_STAND_IN_PIXELS = new Set(PROFILE.known_stand_in_rgba8_sha256);
const REGISTERED_ORIGINALS = new Set(Object.values(PROFILE.original_landmarks).flatMap(Object.values));

function matchesEntireValue(pattern, value) {
  return typeof value === "string" && pattern.exec(value)?.[0] === value;
}

function checkFields(value, field, label, allowedException) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  const unknown = Object.keys(value).find((key) => key !== allowedException && !contract.allowed_fields[field].includes(key));
  if (unknown !== undefined) throw new Error(`Unknown ${label} field: ${unknown}`);
}

function hasGeneratorText(value) {
  if (typeof value !== "string") return false;
  // The Python validator's strip() also treats NEL and four C0 separators as whitespace.
  for (const character of value) {
    const code = character.codePointAt(0);
    if (character.trim() && code !== 0x85 && (code < 0x1c || code > 0x1f)) return true;
  }
  return false;
}

function checkManifestFields(manifest) {
  checkFields(manifest, "manifest", "manifest");
  const art = manifest.art_direction;
  if (art == null) return;
  const legacyReference = PROFILE.legacy_art_reference_sha256[manifest.version];
  const allowedException = legacyReference && art.reference_sha256 === legacyReference ? "reference_sha256" : undefined;
  checkFields(art, "art_direction", "art_direction", allowedException);
  if (art.generator != null) {
    checkFields(art.generator, "generator", "art_direction.generator");
    if (!Object.values(art.generator).every(hasGeneratorText)) {
      throw new Error("Invalid art_direction.generator value");
    }
  }
  if (art.palette != null && (!Array.isArray(art.palette) || art.palette.some((value) => typeof value !== "string"))) {
    throw new Error("Invalid art_direction.palette");
  }
}

function isKnownStandIn({ width, height, data }) {
  const dimensions = Buffer.alloc(8);
  dimensions.writeUInt32BE(width, 0);
  dimensions.writeUInt32BE(height, 4);
  // PNG encoders can preserve different RGB values behind zero alpha.
  for (let pixel = 0; pixel < data.length; pixel += 4) {
    if (data[pixel + 3] === 0) data.fill(0, pixel, pixel + 3);
  }
  const fingerprint = createHash("sha256").update(dimensions).update(data).digest("hex");
  return KNOWN_STAND_IN_PIXELS.has(fingerprint);
}

// This checks the presence and shape of recorded claims; it does not approve rights or verify attestations.
function validateProvenance(asset) {
  const provenance = asset.provenance;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance) || !PROVENANCE_SOURCE_TYPES.has(provenance.source_type)) {
    throw new Error(`Invalid provenance source_type: ${asset.id}`);
  }
  checkFields(provenance, "provenance", `provenance for ${asset.id}`);
  if (provenance.repair != null) checkFields(provenance.repair, "repair", `provenance repair for ${asset.id}`);
  const requireText = (key) => {
    const value = provenance[key];
    const characters = typeof value === "string" ? Array.from(value) : [];
    // Python's str.strip also treats control characters 28–31 as whitespace.
    const blank = characters.every((character) => /\p{White_Space}/u.test(character) || (character.codePointAt(0) >= 28 && character.codePointAt(0) <= 31));
    if (typeof value !== "string" || !value.trim() || blank || characters.length > 1024) throw new Error(`Invalid provenance ${key}: ${asset.id}`);
  };
  for (const key of ["method", "rights_holder", "license", "authorization"]) requireText(key);
  if (provenance.source_type === "reference_conditioned") {
    for (const key of ["source_sha256", "reference_sha256"]) {
      if (!matchesEntireValue(/^[0-9a-f]{64}$/, provenance[key])) throw new Error(`Invalid provenance ${key}: ${asset.id}`);
    }
    requireText("reference_attestation");
  }
  if (provenance.source_type === "external") requireText("license_evidence");
}

function validateLandmarkPolicy(version, records, decodedStandIns) {
  for (const [id, asset] of records) {
    if (asset.placeholder !== true) continue;
    if (!PLACEHOLDER_IDS.has(id)) throw new Error(`Placeholder not permitted by the contract: ${id}`);
    if (asset.provenance.source_type !== "original_programmatic") throw new Error(`Placeholder must be original_programmatic: ${id}`);
  }

  const originals = PROFILE.original_landmarks[version];
  for (const name of REQUIRED_LANDMARKS) {
    const id = ASSET_PREFIX + name;
    const asset = records.get(id);
    const { source_type: sourceType, review_status: reviewStatus } = asset.provenance;
    const isDeclaredStandIn = typeof reviewStatus === "string" && reviewStatus.toLowerCase().includes("stand-in");
    if (REGISTERED_ORIGINALS.has(asset.sha256) && originals?.[name] !== asset.sha256) {
      throw new Error(`Registered original landmark has wrong pack version or slot: ${id}`);
    }
    if (originals?.[name] === asset.sha256) {
      if (sourceType !== "original_programmatic" || asset.placeholder === true || isDeclaredStandIn) {
        throw new Error(`Registered original landmark has conflicting provenance: ${id}`);
      }
      continue;
    }
    if (sourceType === "reference_conditioned") {
      if (KNOWN_STAND_INS.has(asset.sha256) || decodedStandIns.has(id) || isDeclaredStandIn) {
        throw new Error(`Known stand-in cannot claim reference_conditioned provenance: ${id}`);
      }
      continue;
    }
    if (PLACEHOLDER_IDS.has(id) && sourceType === "original_programmatic") {
      if (asset.placeholder !== true || !isDeclaredStandIn) {
        throw new Error(`Procedural stand-in needs placeholder: true and a stand-in review status: ${id}`);
      }
      continue;
    }
    throw new Error(`Required reference slot needs reference_conditioned provenance: ${id}`);
  }
}

/** Validate the versioned AGES interchange and every file before exporting any. */
export function validateElderhallPack(root) {
  const manifestPath = join(root, "manifest.json");
  const manifestFile = lstatSync(manifestPath);
  if (!manifestFile.isFile() || manifestFile.size > 2 * 1024 * 1024) throw new Error("Invalid Elderhall manifest path or size");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest?.schema_version !== contract.schema_version || manifest.id !== PACK_ID || manifest.tile_size !== PROFILE.tile_size ||
      !matchesEntireValue(PACK_VERSION, manifest.version) || !Array.isArray(manifest.assets) ||
      manifest.assets.length < 1 || manifest.assets.length > 512) throw new Error("Invalid Elderhall pack identity");
  checkManifestFields(manifest);
  const records = new Map();
  const decodedStandIns = new Set();
  const assetsDir = join(root, "assets");
  if (!lstatSync(assetsDir).isDirectory()) throw new Error("Invalid assets directory path");
  for (const asset of manifest.assets) {
    if (!matchesEntireValue(ASSET_ID, asset?.id) || records.has(asset.id)) throw new Error("Invalid or duplicate asset identity");
    checkFields(asset, "asset", `asset ${asset.id}`);
    records.set(asset.id, asset);
    if ("placeholder" in asset && typeof asset.placeholder !== "boolean") throw new Error(`Invalid placeholder flag: ${asset.id}`);
    validateProvenance(asset);
    if (asset.file !== `assets/${asset.id}.png`) throw new Error(`Invalid asset path: ${asset.file}`);
    const filename = join(root, asset.file);
    const file = lstatSync(filename);
    if (!file.isFile() || file.size > 8 * 1024 * 1024) throw new Error(`Invalid asset path or size: ${asset.file}`);
    const bytes = readFileSync(filename);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error(`Asset hash mismatch: ${asset.id}`);
    if (bytes.length < 24 || bytes.length > 8 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
        !Array.isArray(asset.dimensions) || asset.dimensions.length !== 2 ||
        bytes.readUInt32BE(16) !== asset.dimensions[0] || bytes.readUInt32BE(20) !== asset.dimensions[1] ||
        asset.dimensions.some((n) => !Number.isInteger(n) || n < 1 || n > 4096)) throw new Error(`Invalid PNG dimensions: ${asset.id}`);
    if (!Array.isArray(asset.anchor) || asset.anchor.length !== 2 || asset.anchor.some((n, i) => !Number.isFinite(n) || n < 0 || n > asset.dimensions[i])) throw new Error(`Invalid anchor: ${asset.id}`);
    if (!Array.isArray(asset.render_size_tiles) || asset.render_size_tiles.length !== 2 || asset.render_size_tiles.some((n) => !Number.isFinite(n) || n <= 0 || n > 128)) throw new Error(`Invalid render size: ${asset.id}`);
    const depth = asset.depth_baseline;
    if (depth != null && (!Number.isFinite(depth) || depth < 0 || depth > asset.dimensions[1])) throw new Error(`Invalid depth baseline: ${asset.id}`);
    if (asset.atlas != null) {
      const { columns, rows, cell_size: cell } = asset.atlas;
      if (!Number.isInteger(columns) || columns <= 0 || !Number.isInteger(rows) || rows <= 0 || !Array.isArray(cell) || cell.length !== 2 || cell.some((n) => !Number.isInteger(n) || n <= 0) || columns * cell[0] !== asset.dimensions[0] || rows * cell[1] !== asset.dimensions[1]) throw new Error(`Invalid atlas: ${asset.id}`);
    }
    if (["elderhall.grass-atlas", "elderhall.dirt-atlas", "elderhall.stone-atlas"].includes(asset.id) &&
        (!asset.atlas || asset.atlas.columns !== 2 || asset.atlas.rows !== 2 || asset.atlas.cell_size[0] !== 32 || asset.atlas.cell_size[1] !== 32)) throw new Error(`Unsupported terrain atlas: ${asset.id}`);
    let decoded;
    try { decoded = pngjs.PNG.sync.read(bytes, { checkCRC: true }); }
    catch { throw new Error(`Invalid PNG data: ${asset.id}`); }
    if (asset.provenance.source_type === "reference_conditioned" &&
        REQUIRED_LANDMARKS.includes(asset.id.slice(ASSET_PREFIX.length)) && isKnownStandIn(decoded)) {
      decodedStandIns.add(asset.id);
    }
  }
  for (const name of PROFILE.required) {
    if (!records.has(ASSET_PREFIX + name)) throw new Error(`Missing candidate: ${name}`);
  }
  const declared = new Set([...records.keys()].map((id) => `${id}.png`));
  for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !declared.has(entry.name)) throw new Error(`Undeclared asset path: ${entry.name}`);
  }
  validateLandmarkPolicy(manifest.version, records, decodedStandIns);
  return manifest;
}

/** Copy only explicitly selected, validated runtime candidates into a preview. */
export function copyElderhallCandidate(source, output) {
  const manifest = validateElderhallPack(source);
  const selected = manifest.assets.filter((asset) => CANDIDATE_IDS.includes(asset.id.slice(ASSET_PREFIX.length)));
  const selectedIds = new Set(selected.map((asset) => asset.id));
  for (const name of CANDIDATE_IDS) {
    if (!selectedIds.has(ASSET_PREFIX + name)) throw new Error(`Missing runtime candidate: ${name}`);
  }
  mkdirSync(join(output, "assets"), { recursive: true });
  for (const asset of selected) copyFileSync(join(source, asset.file), join(output, asset.file));
  writeFileSync(join(output, "manifest.json"), JSON.stringify({ ...manifest, assets: selected }, null, 2) + "\n");
}
