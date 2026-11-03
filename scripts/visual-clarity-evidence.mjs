/** Capture battle + overworld screenshots for visual-clarity verification. */
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const outDir = process.argv[2] ?? join(root, "docs/implementation/evidence/visual-clarity");
const staticDir = process.argv[3] ?? join(root, ".vercel/output/static");
mkdirSync(outDir, { recursive: true });

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

function startServer(dir) {
  if (!existsSync(join(dir, "index.html"))) throw new Error(`Missing index.html under ${dir}`);
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?", 1)[0] ?? "/";
    const rel = path === "/" ? "index.html" : path.replace(/^\//, "");
    const filePath = join(dir, rel);
    if (!filePath.startsWith(dir) || !existsSync(filePath)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const body = readFileSync(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/` });
    });
    server.on("error", reject);
  });
}

async function waitForGameBoot(page) {
  await page.waitForSelector(".game-root", { state: "attached", timeout: 30_000 });
  await page.waitForSelector(".title-word, .hud-menu, .load-bar", { timeout: 30_000 });
}

async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    await fn(page);
  } finally {
    await browser.close();
  }
}

const viewports = [
  { name: "phone-portrait", width: 390, height: 844 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "short-portrait", width: 390, height: 667 },
];

const { server, baseUrl } = await startServer(staticDir);

try {
  for (const vp of viewports) {
    await withBrowser(async (page) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
        await waitForGameBoot(page);
        await page.getByRole("button", { name: "Start", exact: true }).click();
        for (let i = 0; i < 6; i += 1) {
          if ((await page.locator(".dialog").count()) === 0) break;
          await page.keyboard.press("Enter");
          await page.waitForTimeout(120);
        }
        await page.waitForFunction(() => typeof window.__controlsTest?.warp === "function");
        await page.evaluate(() => {
          window.__controlsTest?.warp?.("wildwood", 10, 12);
        });
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(outDir, `${vp.name}-wildwood.png`) });
        await page.evaluate(() => window.__controlsTest?.startWild?.());
        await page.waitForSelector(".battle-ui", { timeout: 10_000 });
        await page.waitForTimeout(350);
        await page.screenshot({ path: join(outDir, `${vp.name}-battle.png`) });
        console.log(`[visual-clarity] ${vp.name}`);
    });
  }
} finally {
  server?.close();
}

console.log(`[visual-clarity] saved under ${outDir}`);
