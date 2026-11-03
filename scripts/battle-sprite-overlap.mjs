/**
 * Verify canvas battle sprites sit above measured `.battle-controls` (renderer contract).
 * Usage: node scripts/battle-sprite-overlap.mjs [staticDir]
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeBattleLayout, stableBattleUiReserveTop } from "../src/game/render/battle-scene.ts";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const staticDir = process.argv[2] ?? join(root, ".vercel/output/static");
const GAP_PX = 6;

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
];

const { server, baseUrl } = await startServer(staticDir);
const browser = await chromium.launch({ headless: true });
const report = { staticDir, viewports: [] };

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
    await page.waitForTimeout(400);

    const probe = await page.evaluate((gap) => {
      const canvas = document.querySelector(".game-canvas");
      const controls = document.querySelector(".battle-controls");
      if (!canvas || !controls) return null;
      const canvasRect = canvas.getBoundingClientRect();
      const controlsRect = controls.getBoundingClientRect();
      const scaleY = canvas.height / canvasRect.height;
      const reserveDom = (controlsRect.top - canvasRect.top) * scaleY - gap * scaleY;
      const reserveLineClient = canvasRect.top + (reserveDom / canvas.height) * canvasRect.height;
      return {
        cw: canvas.width,
        ch: canvas.height,
        reserveDom,
        alignmentDelta: controlsRect.top - reserveLineClient,
      };
    }, GAP_PX);

    assert.ok(probe, `${vp.name} battle probe missing`);
    const reserveTop = stableBattleUiReserveTop(probe.cw, probe.ch);
    const layout = computeBattleLayout(probe.cw, probe.ch, reserveTop, { stableReserve: true });

    const spriteCheck = await page.evaluate(
      ({ foe, player, gapPx }) => {
        const canvas = document.querySelector(".game-canvas");
        const controls = document.querySelector(".battle-controls");
        if (!canvas || !controls) return null;
        const r = canvas.getBoundingClientRect();
        const sx = r.width / canvas.width;
        const sy = r.height / canvas.height;
        const map = (x, y, w, h) => ({
          left: r.left + x * sx,
          top: r.top + y * sy,
          right: r.left + (x + w) * sx,
          bottom: r.top + (y + h) * sy,
        });
        const ps = player.size * player.scale;
        const sprites = {
          foe: map(foe.x, foe.y, foe.w, foe.h),
          player: map(player.cx - ps / 2, player.cy - ps / 2, ps, ps),
        };
        const band = controls.getBoundingClientRect();
        const overlap = (a, b, m = 0) =>
          a.left < b.right - m && b.left < a.right - m && a.top < b.bottom - m && b.top < a.bottom - m;
        return {
          foeOverlap: overlap(sprites.foe, band),
          playerOverlap: overlap(sprites.player, band),
          foeBottom: sprites.foe.bottom,
          playerBottom: sprites.player.bottom,
          controlsTop: band.top,
        };
      },
      { foe: layout.foe, player: layout.player, gapPx: GAP_PX },
    );

    assert.equal(spriteCheck.foeOverlap, false, `${vp.name} foe overlaps controls`);
    assert.equal(spriteCheck.playerOverlap, false, `${vp.name} player overlaps controls`);
    assert.ok(spriteCheck.foeBottom <= spriteCheck.controlsTop - 1, `${vp.name} foe below controls`);
    assert.ok(spriteCheck.playerBottom <= spriteCheck.controlsTop - 1, `${vp.name} player below controls`);
    assert.ok(Math.abs(probe.alignmentDelta - GAP_PX) <= 2.5, `${vp.name} reserve Δ=${probe.alignmentDelta}px expected ~${GAP_PX}`);

    report.viewports.push({
      name: vp.name,
      canvas: `${probe.cw}x${probe.ch}`,
      alignmentDeltaPx: Math.round(probe.alignmentDelta * 10) / 10,
      uiReserveSource: layout.uiReserveSource,
      uiReserveTop: layout.uiReserveTop,
    });
    await page.close();
    console.log(`[battle-overlap] ok ${vp.name} Δ=${probe.alignmentDelta.toFixed(1)}px`);
  }
} finally {
  await browser.close();
  server.close();
}

console.log(JSON.stringify(report, null, 2));
