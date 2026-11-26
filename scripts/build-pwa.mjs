import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateSW } from "workbox-build";
import { assertNoAgesPreviewAssets } from "./ages-production-assets.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const staticDir = join(root, ".vercel/output/static");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

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
    // Explicit image retries bypass the HTTP image cache, but retain the
    // active worker's precache selection (including offline).
    ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^reliquary-art-retry$/],
    manifestTransforms: [(entries) => ({
      manifest: entries.map((entry) => {
        if (!IMAGE_EXTENSIONS.has(extname(entry.url))) return entry;
        const bytes = readFileSync(join(outDir, decodeURIComponent(entry.url)));
        const digest = createHash("sha256").update(bytes).digest("base64");
        // In addition to rejecting corrupt HTTP 200 responses on install,
        // this gives old unverified image entries a different cache key.
        const integrity = `sha256-${digest}`;
        return { ...entry, revision: integrity, integrity };
      }),
      warnings: [],
    })],
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
