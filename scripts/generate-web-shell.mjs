import { readdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = join(root, ".vercel/output/static");
const assetsDir = join(staticDir, "assets");

export function generateWebShell(outDir = staticDir) {
  if (!existsSync(assetsDir)) {
    throw new Error(`Missing ${assetsDir}; run vite build first.`);
  }
  const files = readdirSync(assetsDir);
  const js = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
  const css = files.find((f) => f.startsWith("styles-") && f.endsWith(".css"));
  if (!js) throw new Error("Could not find client index bundle in static assets.");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#14110e" />
  <title>Reliquary</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="/icons/icon-192.png" />
  ${css ? `<link rel="stylesheet" href="/assets/${css}" />` : ""}
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/assets/${js}"></script>
</body>
</html>
`;
  writeFileSync(join(outDir, "index.html"), html);
  return join(outDir, "index.html");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = generateWebShell();
  console.log("[shell] wrote", path);
}
