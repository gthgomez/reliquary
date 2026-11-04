#!/usr/bin/env node
/**
 * Captures real in-game dialogue close-up screenshots for review.
 *
 * Prereq: `npm run test:browser -- --suite journey` once (builds the browser
 * bundle with the gameplay probes into .vercel/output/static), or
 * `npm run build:web:test` directly. Run with:
 *   node scripts/capture-dialog-screens.mjs [outDir]
 *
 * Every screenshot is the running game driven through actual input on a fresh
 * page load: the player is warped next to the NPC via the browser-test probe,
 * turns to face them, and presses Enter to speak — no DOM mockups.
 */
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, withBrowser, waitForGameBoot } from "../tests/browser/helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, process.argv[2] ?? "docs/benchmark/run-b");

const staticDir = join(root, ".vercel/output/static");
const gameShell = join(staticDir, "public-game.html");
const indexShell = join(staticDir, "index.html");
if (!existsSync(join(staticDir, "index.html"))) {
  console.error("Missing .vercel/output/static — run npm run build:web:test first");
  process.exit(1);
}
// Mirror the regression runner: serve the gameplay shell at /.
if (existsSync(gameShell)) copyFileSync(gameShell, indexShell);

const { server, baseUrl } = await startStaticServer(0);

async function freshGame(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto("about:blank");
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await waitForGameBoot(page);
  await page.click("text=Start");
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(".hud-place", { timeout: 15_000 });
}

async function speakTo(page, map, x, y) {
  await page.evaluate(([m, tx, ty]) => window.__controlsTest?.warp?.(m, tx, ty), [map, x, y]);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(140);
  await page.keyboard.up("ArrowUp");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".dialog-npc .dialog-portrait img", { timeout: 5_000 });
  await page.waitForFunction(() => {
    const img = document.querySelector(".dialog-npc .dialog-portrait img");
    return Boolean(img && img.complete && img.naturalWidth > 0);
  }, { timeout: 5_000 });
  await page.waitForTimeout(400);
}

try {
  mkdirSync(outDir, { recursive: true });
  const shots = [
    { file: "desktop-1440x900-elder-maren.png", size: [1440, 900], npc: ["elderhall", 7, 10] },
    { file: "desktop-1440x900-warden-cael.png", size: [1440, 900], npc: ["thornkeep", 11, 7] },
    { file: "phone-390x844-elder-maren.png", size: [390, 844], npc: ["elderhall", 7, 10] },
    { file: "phone-landscape-844x390-warden-cael.png", size: [844, 390], npc: ["thornkeep", 11, 7] },
  ];
  await withBrowser(async (page) => {
    for (const shot of shots) {
      await freshGame(page, shot.size[0], shot.size[1]);
      await speakTo(page, ...shot.npc);
      await page.screenshot({ path: join(outDir, shot.file) });
      console.log(`[capture] ${shot.file}`);
    }

    // Text-only fallback (sign dialogue keeps the parchment card, no portrait).
    await freshGame(page, 1440, 900);
    await page.evaluate(() => window.__controlsTest?.warp?.("elderhall", 13, 2));
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(140);
    await page.keyboard.up("ArrowUp");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".dialog:not(.dialog-npc)", { timeout: 5_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(outDir, "desktop-1440x900-sign-textonly.png") });
    console.log("[capture] desktop-1440x900-sign-textonly.png");
  });
} finally {
  server.close();
}
console.log(`[capture] saved to ${outDir}`);
