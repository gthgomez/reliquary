/**
 * Standalone battle stage + creature animation browser capture.
 * Usage: node scripts/battle-stage-browser.mjs [staticDir] [outDir] [--stage-only|--anim-only]
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeBattleLayout, stableBattleUiReserveTop } from "../src/game/render/battle-scene.ts";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const staticDir = process.argv[2] ?? join(root, ".vercel/output/static");
const outDir = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : join(root, "docs/implementation/evidence/battle-stage-anim");
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const stageOnly = flags.has("--stage-only");
const animOnly = flags.has("--anim-only");
mkdirSync(outDir, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

function startServer(dir) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const path = (req.url ?? "/").split("?", 1)[0] ?? "/";
      const rel = path === "/" ? "index.html" : path.replace(/^\//, "");
      const filePath = join(dir, rel);
      if (!filePath.startsWith(dir) || !existsSync(filePath)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/` });
    });
    server.on("error", reject);
  });
}

async function dismissIntro(page) {
  for (let i = 0; i < 24; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    const dialog = page.locator("button.dialog").first();
    if (await dialog.count()) await dialog.click({ timeout: 2000 });
    else await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}

const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "390x667", width: 390, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "640x320", width: 640, height: 320 },
  { name: "844x390", width: 844, height: 390 },
  { name: "1280x800", width: 1280, height: 800 },
];

if (!existsSync(join(staticDir, "index.html"))) {
  console.error(`[battle-stage-browser] missing build at ${staticDir} — run npm run build first`);
  process.exit(1);
}

const { server, baseUrl } = await startServer(staticDir);
const browser = await chromium.launch({ headless: true });
const report = { staticDir, outDir, viewports: [], reducedMotion: null };

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForSelector(".game-root");
    await page.click("text=Start");
    await dismissIntro(page);
    await page.waitForFunction(() => typeof window.__controlsTest?.startWild === "function");
    await page.evaluate(() => window.__controlsTest?.startWild?.());
    await page.waitForSelector(".battle-controls", { timeout: 15_000 });
    await page.waitForTimeout(500);

    const stageProbe = await page.evaluate(() => {
      const canvas = document.querySelector(".game-canvas");
      const controls = document.querySelector(".battle-controls");
      if (!canvas || !controls) return null;
      return {
        report: window.__battleStageReport ?? null,
        cw: canvas.width,
        ch: canvas.height,
        controlsTop: controls.getBoundingClientRect().top,
      };
    });

    assert.ok(stageProbe?.report, `${vp.name} missing __battleStageReport`);
    const reserve = stableBattleUiReserveTop(stageProbe.cw, stageProbe.ch, stageProbe.report.commandZoneTop);
    const layout = computeBattleLayout(stageProbe.cw, stageProbe.ch, reserve, { stableReserve: true });
    assert.ok(layout.player.cx < layout.foe.cx, `${vp.name} player left of foe`);

    if (!animOnly) {
      await page.screenshot({ path: join(outDir, `stage-${vp.name}.png`) });
    }

    if (!stageOnly) {
      await page.evaluate(() => {
        const game = window.__controlsTest;
        if (!game) return;
      });
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(120);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(280);
      await page.screenshot({ path: join(outDir, `anim-nip-${vp.name}.png`) });
    }

    report.viewports.push({
      name: vp.name,
      canvas: `${stageProbe.cw}x${stageProbe.ch}`,
      uiReserveTop: stageProbe.report.commandZoneTop,
      playerCx: layout.player.cx,
      foeCx: layout.foe.cx,
    });
    await page.close();
  }

  if (!stageOnly) {
    const reducedPage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    await reducedPage.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await reducedPage.click("text=Start");
    await dismissIntro(reducedPage);
    await reducedPage.waitForFunction(() => typeof window.__controlsTest?.startWild === "function");
    await reducedPage.evaluate(() => window.__controlsTest?.startWild?.());
    await reducedPage.waitForSelector(".battle-controls");
    await reducedPage.keyboard.press("ArrowDown");
    await reducedPage.keyboard.press("Enter");
    await reducedPage.waitForTimeout(120);
    await reducedPage.keyboard.press("Enter");
    await reducedPage.waitForTimeout(180);
    await reducedPage.screenshot({ path: join(outDir, "anim-reduced-motion-390x844.png") });
    report.reducedMotion = join(outDir, "anim-reduced-motion-390x844.png");
    await reducedPage.close();
  }
} finally {
  await browser.close();
  server.close();
}

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
