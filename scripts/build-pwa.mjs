import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateSW } from "workbox-build";
import { assertNoAgesPreviewAssets } from "./ages-production-assets.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const staticDir = join(root, ".vercel/output/static");

export async function buildPwa(options = {}) {
  const outDir = options.staticDir ?? staticDir;
  if (!existsSync(outDir)) {
    throw new Error(`Public build output missing at ${outDir}. Run npm run build:web first.`);
  }
  assertNoAgesPreviewAssets(outDir);
  const manifest = JSON.parse(readFileSync(join(outDir, "manifest.webmanifest"), "utf8"));
  if (manifest.short_name !== "Reliquary") {
    throw new Error("manifest identity must be Reliquary for the public web build");
  }
  const { count, size, warnings } = await generateSW({
    swDest: join(outDir, "sw.js"),
    globDirectory: outDir,
    globPatterns: ["**/*.{js,css,html,png,jpg,jpeg,webp,svg,woff2,webmanifest,json}"],
    globIgnores: ["**/sw.js", "**/node_modules/**", "**/__grok/**"],
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
    // New builds take over immediately; open pages reload themselves at a safe
    // moment (see src/pwa/register.ts), so players never stay on a stale build.
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
  });
  if (warnings.length) {
    console.warn("[pwa]", warnings.join("\n"));
  }
  assertNoStaleClientChunks(outDir);
  return { count, size, outDir };
}

/**
 * S20 invariant: every generated client chunk in the precache must be
 * referenced by the built index.html. An unreferenced chunk means a stale
 * build output (for example a browser-test bundle) survived into this deploy.
 */
export function assertNoStaleClientChunks(outDir) {
  const swSource = readFileSync(join(outDir, "sw.js"), "utf8");
  const html = readFileSync(join(outDir, "index.html"), "utf8");
  // Workbox emits relative URLs; older fixtures used root-relative URLs.
  const precached = [...swSource.matchAll(/url"?\s*:\s*"(\/?assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  if (precached.length === 0) {
    throw new Error("[pwa] no client chunks found in precache");
  }
  for (const url of precached) {
    const file = url.replace(/^\//, "");
    if (!html.includes(file)) {
      throw new Error(`[pwa] stale chunk in precache: ${url} is not referenced by index.html`);
    }
  }
  return precached;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildPwa().then((result) => {
    console.log(`[pwa] precached ${result.count} files (${result.size} bytes)`);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
