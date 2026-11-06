import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const staticDir = process.env.RELIQUARY_STATIC_ROOT ?? join(root, ".vercel/output/static");

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

export function startStaticServer(port = 0, options = {}) {
  // `getRoot` lets a test swap the served build mid-run (e.g. to simulate a deploy).
  const getRoot = options.getRoot ?? (() => staticDir);
  if (!existsSync(join(getRoot(), "index.html"))) {
    throw new Error("Run npm run build:web before browser tests");
  }
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?", 1)[0] ?? "/";
    const rel = path === "/" ? "index.html" : path.replace(/^\//, "");
    const base = getRoot();
    const filePath = join(base, rel);
    if (!filePath.startsWith(base) || !existsSync(filePath)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const body = readFileSync(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  });
  const close = server.close.bind(server);
  server.close = (cb) => {
    server.closeAllConnections?.();
    return close(cb);
  };
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
  const executablePath = process.env.RELIQUARY_QA_CHROMIUM || undefined;
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const context = await browser.newContext({ serviceWorkers: "block", ...(options.context ?? {}) });
    const page = await context.newPage();
    return await fn(page, context);
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
