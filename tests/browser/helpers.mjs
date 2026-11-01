import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
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

export function startStaticServer(port = 0) {
  if (!existsSync(join(staticDir, "index.html"))) {
    throw new Error("Run npm run build:web before browser tests");
  }
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
  return new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({ server, baseUrl: `http://127.0.0.1:${actualPort}/` });
    });
    server.on("error", reject);
  });
}

export async function withBrowser(fn, options = {}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block", ...(options.context ?? {}) });
    const page = await context.newPage();
    await fn(page, context);
  } finally {
    await browser.close();
  }
}

export async function waitForGameBoot(page) {
  await page.waitForSelector(".game-root", { state: "attached", timeout: 30_000 });
  await page.waitForSelector(".title-word, .hud-menu, .load-bar", { timeout: 30_000 });
}

export function spawnPreview(port) {
  return spawn(process.execPath, ["scripts/browser-regression.mjs", "--serve-only", String(port)], {
    cwd: root,
    stdio: "inherit",
  });
}
