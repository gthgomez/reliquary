import { copyFileSync, mkdirSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { copyElderhallCandidate } from "./elderhall-pack.mjs";
import { assertApprovedElderhall, assertElderhallArtifact, selectElderhallWorld } from "./elderhall-release.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const release = JSON.parse(readFileSync(join(root, "scripts/elderhall-release.json"), "utf8"));
const worldRevision = selectElderhallWorld(release, process.env);
const candidateBuild = worldRevision === 5;
const sourcePack = join(root, "assets/elderhall-candidate");
if (process.env.VERCEL_ENV === "production" && process.env.VITE_RELIQUARY_BROWSER_TEST === "1") {
  throw new Error("Production cannot enable browser-test controls");
}
if (release.revision === 5) {
  await assertApprovedElderhall(sourcePack, release.approval);
}

function run(cmd, args, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VITE_RELIQUARY_PUBLIC: "1", VITE_ELDERHALL_CANDIDATE: candidateBuild ? "1" : "0", ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [join(root, "scripts/generate-reliquary-icons.mjs")]);
run(process.execPath, [join(root, "scripts/tint-new-sprites.mjs")]);

const staticDir = join(root, ".vercel/output/static");
mkdirSync(staticDir, { recursive: true });

/**
 * Scoped cleanup of GENERATED client outputs (S20). The vite outDir sits
 * outside the project root, so vite never empties it: without this, chunks
 * from an earlier browser-test build survive into the production precache.
 * Only known generated names are removed; unrelated static files are kept.
 */
for (const generated of ["assets", "index.html", "public-game.html", "sw.js"]) {
  rmSync(join(staticDir, generated), { recursive: true, force: true });
}
for (const entry of readdirSync(staticDir)) {
  if (/^workbox-.*\.js$/.test(entry) && statSync(join(staticDir, entry)).isFile()) {
    rmSync(join(staticDir, entry), { force: true });
  }
}

copyFileSync(join(root, "public/manifest.webmanifest"), join(staticDir, "manifest.webmanifest"));

const viteCli = join(root, "node_modules", "vite", "bin", "vite.js");

run(process.execPath, [
  join(root, "scripts/with-app-env.mjs"),
  process.execPath,
  viteCli,
  "build",
  "--config",
  "vite.public-game.config.ts",
]);

const gameShell = join(staticDir, "public-game.html");
const indexShell = join(staticDir, "index.html");
if (!existsSync(gameShell)) {
  console.error("[build:web] public-game.html missing after client build");
  process.exit(1);
}
copyFileSync(gameShell, indexShell);

if (candidateBuild) {
  copyElderhallCandidate(sourcePack, join(staticDir, "game/elderhall"));
  console.log(`[elderhall] revision 5 assets included (${release.revision === 5 ? "approved release" : "qualification"})`);
}

run(process.execPath, [join(root, "scripts/build-pwa.mjs")]);

if (!existsSync(indexShell)) {
  console.error("[build:web] index.html shell missing");
  process.exit(1);
}

assertElderhallArtifact(staticDir, worldRevision, sourcePack);
console.log(`[build:web] complete (Elderhall revision ${worldRevision})`);
