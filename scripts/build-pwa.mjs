import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateSW } from "workbox-build";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const staticDir = join(root, ".vercel/output/static");

export async function buildPwa(options = {}) {
  const outDir = options.staticDir ?? staticDir;
  if (!existsSync(outDir)) {
    throw new Error(`Public build output missing at ${outDir}. Run npm run build:web first.`);
  }
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
    skipWaiting: false,
    clientsClaim: false,
  });
  if (warnings.length) {
    console.warn("[pwa]", warnings.join("\n"));
  }
  return { count, size, outDir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildPwa().then((result) => {
    console.log(`[pwa] precached ${result.count} files (${result.size} bytes)`);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
