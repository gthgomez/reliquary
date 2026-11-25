import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { CANDIDATE_IDS, validateElderhallPack } from "./elderhall-pack.mjs";
import { validateElderhallPortraits } from "./elderhall-portraits.mjs";

export function selectElderhallWorld(release, env) {
  assert.ok([2, 5].includes(release.revision), "Unsupported Elderhall release revision");
  if (release.revision === 5) {
    const { evidence, candidateCommit, manifestSha256, worldSha256, portraitsSha256, artifactSha256 } = release.approval ?? {};
    assert.ok(typeof evidence === "string" && evidence.trim() &&
      typeof candidateCommit === "string" && /^[a-f0-9]{40}$/.test(candidateCommit) &&
      [manifestSha256, worldSha256, portraitsSha256, artifactSha256].every((hash) =>
        typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)),
    "Elderhall revision 5 requires recorded visual and provenance approval for the candidate commit, world, art and artifact");
    return 5;
  }
  const candidate = env.VERCEL_ENV !== "production" &&
    (env.VERCEL_ENV === "preview" || env.RELIQUARY_ELDERHALL_CANDIDATE === "1");
  return candidate ? 5 : 2;
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** Bind the exact served bytes, including the shell, service worker and images. */
export function elderhallArtifactDigest(staticDir) {
  const files = readdirSync(staticDir, { recursive: true, withFileTypes: true })
    .filter((file) => file.isFile() && !file.name.endsWith(".map"))
    .map((file) => join(file.parentPath, file.name));
  return sha256(JSON.stringify(files.map((file) => [
    relative(staticDir, file).replaceAll("\\", "/"), sha256(readFileSync(file)),
  ]).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)));
}

export function elderhallVisualGeometry(manifest) {
  const ids = new Set(["well-reference", "tree-reference", "cottage-reference",
    "guild-reference", "shop-reference", "gate-reference", "bench", "inn"]);
  const entries = manifest.assets.map(({ id, dimensions, anchor, render_size_tiles }) =>
    [id.slice("elderhall.".length), { dimensions, anchor, render_size_tiles }]);
  return Object.fromEntries(entries.filter(([id]) => ids.has(id)));
}

export async function approvedElderhallDigests(sourcePack) {
  const manifest = readFileSync(join(sourcePack, "manifest.json"));
  const geometry = elderhallVisualGeometry(validateElderhallPack(sourcePack));
  const { elderhallBase, MAPS } = await import("../src/game/maps/registry.ts");
  const { makeElderhallCandidate, makeElderhallCandidateInterior } = await import("../src/game/maps/elderhall-candidate.ts");
  const { elderhallCandidateObject } = await import("../src/game/render/elderhall-visual.ts");
  const { isOccupied } = await import("../src/game/world/movement.ts");
  const interiors = ["home", "guild_in", "shop_in", "inn_in"].map((id) => makeElderhallCandidateInterior(MAPS[id]));
  const worlds = [makeElderhallCandidate(elderhallBase, geometry), MAPS.grove, ...interiors].map((world) => ({
    world,
    visuals: world.objects.map((object) => elderhallCandidateObject(world.id, object, true, geometry)),
    collision: world.ground.map((row, y) => [...row].map((_, x) => isOccupied(world, {}, x, y))),
  }));
  const portraits = validateElderhallPortraits(join(dirname(sourcePack), "elderhall-portraits"), join(sourcePack, "../.."));
  return { manifestSha256: sha256(manifest), worldSha256: sha256(JSON.stringify(worlds)), portraitsSha256: portraits.sha256 };
}

export async function assertApprovedElderhall(sourcePack, approval) {
  const digests = await approvedElderhallDigests(sourcePack);
  assert.equal(digests.manifestSha256, approval.manifestSha256, "Elderhall manifest differs from the approved pack");
  assert.equal(digests.worldSha256, approval.worldSha256, "Elderhall or Binding Grove differs from the approved world");
  assert.equal(digests.portraitsSha256, approval.portraitsSha256, "Elderhall dialogue portraits differ from the approved art");
}

export function assertElderhallArtifact(staticDir, revision, sourcePack) {
  const shell = readFileSync(join(staticDir, "index.html"), "utf8");
  const entry = shell.match(/\/assets\/(index-[^"']+\.js)/)?.[1];
  assert.ok(entry, "Elderhall artifact has no game entry");
  const bundle = readFileSync(join(staticDir, "assets", entry), "utf8");
  const sourceMap = JSON.parse(readFileSync(join(staticDir, "assets", entry + ".map"), "utf8"));
  const candidate = revision === 5;
  for (const path of ["maps/elderhall-candidate", "render/elderhall-visual"]) {
    const hasSource = (suffix) => sourceMap.sources.some((source) => source.endsWith(`/${path}${suffix}.ts`));
    assert.equal(hasSource(""), candidate, `Unexpected Elderhall implementation: ${path}`);
    assert.equal(hasSource(".stub"), !candidate, `Unexpected Elderhall stub: ${path}`);
  }
  const projectRoot = join(dirname(sourcePack), "..");
  const variant = candidate ? "" : ".stub";
  for (const file of [
    "maps/registry.ts", "maps/helpers.ts", `maps/elderhall-candidate${variant}.ts`,
    `render/elderhall-visual${variant}.ts`, "world/movement.ts", "world/object-state.ts", "world/tiles.ts", "save.ts",
  ]) {
    const source = sourceMap.sources.findIndex((path) => path.endsWith(`/src/game/${file}`));
    assert.ok(sourceMap.sourcesContent[source]?.replace(/\r\n/g, "\n") ===
      readFileSync(join(projectRoot, "src/game", file), "utf8").replace(/\r\n/g, "\n"),
      `The emitted Elderhall artifact does not match its qualified source: ${file}`);
  }
  assert.ok(bundle.includes(`WORLD_REVISION = ${revision};`), "Bundled Elderhall save revision mismatch");
  assert.match(bundle, new RegExp(`function isElderhallCandidateBuild\\(\\) \\{\\s+return ${candidate};`),
    "Bundled Elderhall map and renderer selection mismatch");

  const pack = join(staticDir, "game/elderhall");
  const worker = readFileSync(join(staticDir, "sw.js"), "utf8");
  if (!candidate) {
    assert.equal(existsSync(pack), false, "Unapproved Elderhall pack in revision 2 artifact");
    assert.equal(worker.includes("game/elderhall/"), false, "Unapproved Elderhall pack in offline cache");
    return;
  }

  const manifest = validateElderhallPack(pack);
  const source = JSON.parse(readFileSync(join(sourcePack, "manifest.json"), "utf8"));
  // The public build intentionally emits readable JavaScript. Read the actual
  // inlined metadata object and reject a changed replacement even if its
  // source map still records the correct TypeScript.
  const inlineGeometry = bundle.match(/function assetMetadata\(id\) \{\s*const asset = (\{[\s\S]*?\})\[id\];/)?.[1];
  assert.ok(inlineGeometry, "Missing bundled Elderhall visual geometry");
  const geometry = JSON.parse(inlineGeometry.replace(/([[,\s])(-?)\.(\d+)/g, (_match, prefix, sign, digits) =>
    `${prefix}${sign}0.${digits}`));
  assert.deepEqual(geometry, elderhallVisualGeometry(source), "Bundled Elderhall visual geometry differs from the pack");
  const selected = source.assets.filter((asset) => CANDIDATE_IDS.includes(asset.id.slice("elderhall.".length)));
  assert.deepEqual(manifest, { ...source, assets: selected }, "Bundled Elderhall manifest differs from the selected pack");
  const urls = new Set([...worker.matchAll(/url"?\s*:\s*"\/?([^"]+)"/g)].map((match) => match[1]));
  for (const file of ["manifest.json", ...manifest.assets.map((asset) => asset.file)]) {
    assert.ok(urls.has(`game/elderhall/${file}`), `Elderhall precache is missing ${file}`);
  }
  const portraits = validateElderhallPortraits(join(pack, "portraits"));
  const sourcePortraits = validateElderhallPortraits(join(dirname(sourcePack), "elderhall-portraits"), projectRoot);
  assert.equal(portraits.sha256, sourcePortraits.sha256, "Bundled Elderhall portraits differ from the source pack");
  for (const file of ["manifest.json", ...portraits.manifest.assets.map((asset) => asset.file)]) {
    assert.ok(urls.has(`game/elderhall/portraits/${file}`), `Elderhall portrait precache is missing ${file}`);
  }
}
