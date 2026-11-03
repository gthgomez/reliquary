#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const serveOnly = args[0] === "--serve-only";
const port = serveOnly ? Number(args[1] ?? 8081) : 0;

const staticDir = join(root, ".vercel/output/static");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

if (serveOnly) {
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?", 1)[0] ?? "/";
    const rel = path === "/" ? "index.html" : path.replace(/^\//, "");
    const filePath = join(staticDir, rel);
    if (!filePath.startsWith(staticDir) || !existsSync(filePath)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const body = readFileSync(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  });
  server.listen(port, "127.0.0.1");
} else {
  function run(cmd, cmdArgs) {
    const result = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", timeout: 180_000, killSignal: "SIGKILL" });
    if (result.error) {
      console.error(`[browser] ${cmdArgs.at(-1)} failed: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  if (!existsSync(join(staticDir, "index.html"))) {
    console.error("[browser] missing build output — run npm run build:web first");
    process.exit(1);
  }

  const gameShell = join(staticDir, "public-game.html");
  const indexShell = join(staticDir, "index.html");
  if (existsSync(gameShell)) {
    copyFileSync(gameShell, indexShell);
  }

  const indexHtml = readFileSync(indexShell, "utf8");
  if (!indexHtml.includes("/assets/index-") || !indexHtml.includes(".js")) {
    console.error("[browser] index.html does not reference a client bundle — run npm run build:web");
    process.exit(1);
  }

  const suiteIdx = args.indexOf("--suite");
  const suite = suiteIdx >= 0 ? args[suiteIdx + 1] : "all";
  const map = {
    all: ["layout.mjs", "contrast.mjs", "modal-a11y.mjs", "touch-arbitration.mjs", "pwa.mjs", "journey.mjs"],
    layout: ["layout.mjs"],
    contrast: ["contrast.mjs"],
    a11y: ["modal-a11y.mjs"],
    touch: ["touch-arbitration.mjs"],
    pwa: ["pwa.mjs"],
    journey: ["journey.mjs"],
  };
  const files = map[suite] ?? map.all;

  for (const file of files) {
    console.log(`[browser] running ${file}`);
    run(process.execPath, [join(root, "tests/browser", file)]);
  }
  console.log(`[browser] suite=${suite} passed`);
}
