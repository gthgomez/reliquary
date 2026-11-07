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
    if (options.textScale !== undefined) {
      // A browser-context fontSize option is ignored by Playwright. Apply the
      // requested root text setting on each document, including reloads.
      await context.addInitScript((scale) => {
        const apply = () => document.documentElement.style.setProperty("font-size", `${scale * 100}%`, "important");
        if (document.documentElement) apply();
        else document.addEventListener("DOMContentLoaded", apply, { once: true });
      }, options.textScale);
    }
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

/** Measure the whole target against the viewport and every clipping ancestor. */
export function measureTargetVisibility(locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      if (/^(auto|scroll|hidden|clip)$/.test(style.overflowX)) {
        clip.left = Math.max(clip.left, bounds.left + parent.clientLeft);
        clip.right = Math.min(clip.right, bounds.left + parent.clientLeft + parent.clientWidth);
      }
      if (/^(auto|scroll|hidden|clip)$/.test(style.overflowY)) {
        clip.top = Math.max(clip.top, bounds.top + parent.clientTop);
        clip.bottom = Math.min(clip.bottom, bounds.top + parent.clientTop + parent.clientHeight);
      }
    }
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      clip,
      fullyVisible: rect.width > 0 && rect.height > 0
        && rect.left >= clip.left - 1 && rect.top >= clip.top - 1
        && rect.right <= clip.right + 1 && rect.bottom <= clip.bottom + 1,
      hitOk: Boolean(hit && (hit === node || node.contains(hit))),
    };
  });
}

export function spawnPreview(port) {
  return spawn(process.execPath, ["scripts/browser-regression.mjs", "--serve-only", String(port)], {
    cwd: root,
    stdio: "inherit",
  });
}
