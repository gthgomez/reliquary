import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pngjs from "pngjs";

export const CANDIDATE_IDS = ["grass-atlas", "dirt-atlas", "stone-atlas", "well-reference", "cottage-reference", "guild-reference", "shop-reference", "tree-reference", "gate-reference", "bench", "flowers"];

const PROVENANCE_SOURCE_TYPES = new Set(["original_programmatic", "reference_conditioned", "owner_provided", "external", "native_recipe"]);

// This checks the presence and shape of recorded claims; it does not approve rights or verify attestations.
function validateProvenance(asset) {
  const provenance = asset.provenance;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance) || !PROVENANCE_SOURCE_TYPES.has(provenance.source_type)) {
    throw new Error(`Invalid provenance source_type: ${asset.id}`);
  }
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
      if (typeof provenance[key] !== "string" || !/^[0-9a-f]{64}$/.test(provenance[key])) throw new Error(`Invalid provenance ${key}: ${asset.id}`);
    }
    requireText("reference_attestation");
  }
  if (provenance.source_type === "external") requireText("license_evidence");
}

/** Validate the versioned AGES interchange and every file before exporting any. */
export function validateElderhallPack(root) {
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  if (manifest.schema_version !== "ages.environment-pack/1" || manifest.id !== "reliquary.elderhall" || manifest.tile_size !== 32 || !Array.isArray(manifest.assets)) throw new Error("Invalid Elderhall pack identity");
  const ids = new Set();
  if (!lstatSync(join(root, "assets")).isDirectory()) throw new Error("Invalid assets directory path");
  for (const asset of manifest.assets) {
    if (typeof asset.id !== "string" || !/^elderhall\.[a-z0-9-]+$/.test(asset.id) || ids.has(asset.id)) throw new Error("Invalid or duplicate asset identity");
    ids.add(asset.id);
    validateProvenance(asset);
    if (asset.file !== `assets/${asset.id}.png`) throw new Error(`Invalid asset path: ${asset.file}`);
    const filename = join(root, asset.file);
    if (!lstatSync(filename).isFile()) throw new Error(`Invalid asset path: ${asset.file}`);
    const bytes = readFileSync(filename);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error(`Asset hash mismatch: ${asset.id}`);
    if (bytes.length < 24 || bytes.length > 8 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
        !Array.isArray(asset.dimensions) || bytes.readUInt32BE(16) !== asset.dimensions[0] || bytes.readUInt32BE(20) !== asset.dimensions[1] ||
        asset.dimensions.some((n) => !Number.isInteger(n) || n < 1 || n > 4096)) throw new Error(`Invalid PNG dimensions: ${asset.id}`);
    if (!Array.isArray(asset.anchor) || asset.anchor.length !== 2 || asset.anchor.some((n, i) => !Number.isFinite(n) || n < 0 || n > asset.dimensions[i])) throw new Error(`Invalid anchor: ${asset.id}`);
    if (!Array.isArray(asset.render_size_tiles) || asset.render_size_tiles.length !== 2 || asset.render_size_tiles.some((n) => !Number.isFinite(n) || n <= 0 || n > 128)) throw new Error(`Invalid render size: ${asset.id}`);
    if (asset.atlas) {
      const { columns, rows, cell_size: cell } = asset.atlas;
      if (!Number.isInteger(columns) || columns <= 0 || !Number.isInteger(rows) || rows <= 0 || !Array.isArray(cell) || cell.length !== 2 || cell.some((n) => !Number.isInteger(n) || n <= 0) || columns * cell[0] !== asset.dimensions[0] || rows * cell[1] !== asset.dimensions[1]) throw new Error(`Invalid atlas: ${asset.id}`);
    }
    if (["elderhall.grass-atlas", "elderhall.dirt-atlas", "elderhall.stone-atlas"].includes(asset.id) &&
        (!asset.atlas || asset.atlas.columns !== 2 || asset.atlas.rows !== 2 || asset.atlas.cell_size[0] !== 32 || asset.atlas.cell_size[1] !== 32)) throw new Error(`Unsupported terrain atlas: ${asset.id}`);
    try { pngjs.PNG.sync.read(bytes, { checkCRC: true }); }
    catch { throw new Error(`Invalid PNG data: ${asset.id}`); }
  }
  for (const id of CANDIDATE_IDS) if (!ids.has(`elderhall.${id}`)) throw new Error(`Missing candidate: ${id}`);
  return manifest;
}

/** Copy only explicitly selected, validated runtime candidates into a preview. */
export function copyElderhallCandidate(source, output) {
  const manifest = validateElderhallPack(source);
  const selected = manifest.assets.filter((asset) => CANDIDATE_IDS.includes(asset.id.slice("elderhall.".length)));
  mkdirSync(join(output, "assets"), { recursive: true });
  for (const asset of selected) copyFileSync(join(source, asset.file), join(output, asset.file));
  writeFileSync(join(output, "manifest.json"), JSON.stringify({ ...manifest, assets: selected }, null, 2) + "\n");
}
