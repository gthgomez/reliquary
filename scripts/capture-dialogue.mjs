#!/usr/bin/env node
/**
 * Capture real in-game dialogue evidence for the NPC portrait focus scene.
 *
 * Serves the production web build (.vercel/output/static), boots the actual
 * game in Chromium, walks the player to each NPC with the repo's own read-only
 * controls probe, and triggers conversations with real keyboard input
 * (Z to speak/advance, Escape to decline). Nothing is mocked: the screenshots
 * are the running game. Each file name records its viewport.
 *
 * Usage:
 *   npm run build:web && node scripts/capture-dialogue.mjs
 *
 * Writes PNGs to docs/dialogue-portraits/ and prints a manifest.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, withBrowser, waitForGameBoot } from "../tests/browser/helpers.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const staticDir = join(root, ".vercel", "output", "static");
const outDir = join(root, "docs", "dialogue-portraits");

if (!existsSync(join(staticDir, "index.html"))) {
  console.error("[capture] production web build missing — run `npm run build:web` first");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const { server, baseUrl } = await startStaticServer(0);

async function dismissIntro(page) {
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(120);
  }
}

/** Warp beside the NPC, face it (NPCs are solid, so the step only turns), then speak with Z. */
async function speak(page, map, x, y, key) {
  await page.evaluate(([m, px, py]) => window.__controlsTest?.warp?.(m, px, py), [map, x, y]);
  await page.evaluate((keys) => window.__controlsTest?.setKeys?.(keys), [key]);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__controlsTest?.setKeys?.([]));
  await page.keyboard.press("KeyZ");
}

async function shot(page, name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path });
  console.log(`[capture] ${name}.png`);
}

async function scene(page, name, map, x, y, key, closeKeys = ["KeyZ"]) {
  await speak(page, map, x, y, key);
  await page.waitForSelector(".npc-scene", { timeout: 5000 });
  await page.waitForTimeout(450);
  await shot(page, name);
  for (const k of closeKeys) {
    await page.keyboard.press(k);
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(".npc-scene", { state: "detached", timeout: 5000 });
}

try {
  // Desktop 1440x900 — authored art, sigil fallback, and text-only narration.
  await withBrowser(
    async (page) => {
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await waitForGameBoot(page);
      await page.click("text=Start");
      await page.waitForSelector(".dialog", { timeout: 10_000 });
      await page.waitForTimeout(350);
      await shot(page, "desktop-1440x900-narrator-intro");
      await dismissIntro(page);
      await page.waitForSelector(".hud-menu", { timeout: 15_000 });

      await scene(page, "desktop-1440x900-maren", "elderhall", 7, 10, "KeyW", ["KeyZ", "KeyZ"]);
      await scene(page, "desktop-1440x900-cael", "thornkeep", 11, 7, "KeyW", ["Escape"]);
      await scene(page, "desktop-1440x900-gateward", "elderhall", 11, 3, "KeyW");
      await scene(page, "desktop-1440x900-patch", "briar_camp", 4, 6, "KeyW");

      // Sign dialogue stays a readable text-only bar (no scene, no portrait).
      await speak(page, "elderhall", 13, 2, "KeyW");
      await page.waitForSelector(".dialog", { timeout: 5000 });
      await page.waitForTimeout(300);
      const signScene = await page.locator(".npc-scene").count();
      if (signScene !== 0) throw new Error("sign dialog must render text-only");
      await shot(page, "desktop-1440x900-sign-text-only");
      await page.keyboard.press("KeyZ");
      await page.waitForSelector(".dialog", { state: "detached", timeout: 5000 });
    },
    { context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
  );

  // Phone portrait 390x844 — compact scene beside the A/B touch row.
  await withBrowser(
    async (page) => {
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await waitForGameBoot(page);
      await page.click("text=Start");
      await dismissIntro(page);
      await page.waitForSelector(".hud-menu", { timeout: 15_000 });

      await scene(page, "phone-390x844-maren", "elderhall", 7, 10, "KeyW", ["KeyZ", "KeyZ"]);
      await scene(page, "phone-390x844-cael", "thornkeep", 11, 7, "KeyW", ["Escape"]);
      await scene(page, "phone-390x844-gateward", "elderhall", 11, 3, "KeyW");
    },
    {
      context: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
      },
    },
  );

  // Short phone landscape 844x390 — scene must fit the squat viewport.
  await withBrowser(
    async (page) => {
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await waitForGameBoot(page);
      await page.click("text=Start");
      await dismissIntro(page);
      await page.waitForSelector(".hud-menu", { timeout: 15_000 });

      await scene(page, "landscape-844x390-maren", "elderhall", 7, 10, "KeyW", ["KeyZ", "KeyZ"]);
      await scene(page, "landscape-844x390-gateward", "elderhall", 11, 3, "KeyW");
    },
    {
      context: {
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
      },
    },
  );
} finally {
  server?.close?.();
}

console.log("[capture] dialogue portrait evidence written to docs/dialogue-portraits/");
