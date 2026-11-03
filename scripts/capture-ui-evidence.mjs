#!/usr/bin/env node
/**
 * Local-only HUD/battle screenshots for before/after comparison (not uploaded).
 * Usage: OUT_DIR=/opt/cursor/artifacts/ui-baseline-c187385 node scripts/capture-ui-evidence.mjs
 * Requires: npm run build:web:test (or build-web-test.mjs) already run in this checkout.
 */
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, withBrowser, waitForGameBoot } from "../tests/browser/helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.OUT_DIR ?? join(root, ".local/ui-evidence");
mkdirSync(outDir, { recursive: true });

async function dismissIntro(page) {
  for (let i = 0; i < 20; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(100);
  }
}

const { server, baseUrl } = await startStaticServer(0);

try {
  for (const { name, width, height } of [
    { name: "390x667-world", width: 390, height: 667 },
    { name: "390x667-battle", width: 390, height: 667 },
  ]) {
    await withBrowser(async (page) => {
      await page.setViewportSize({ width, height });
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await waitForGameBoot(page);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await dismissIntro(page);
      await page.waitForSelector(".hud-menu", { timeout: 15_000 });
      if (name.includes("world")) {
        if (await page.locator(".hud-objective-btn").count()) {
          await page.locator(".hud-objective-btn").first().click();
          await page.waitForTimeout(200);
        }
        await page.screenshot({ path: join(outDir, `${name}-objective-open.png`), fullPage: false });
        return;
      }
      await page.waitForFunction(() => typeof window.__controlsTest?.startWild === "function");
      await page.evaluate(() => window.__controlsTest?.startWild?.());
      await page.waitForSelector(".battle-controls", { timeout: 15_000 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(outDir, `${name}-command.png`), fullPage: false });
    });
  }
  console.log(`[capture-ui-evidence] wrote PNGs under ${outDir}`);
} finally {
  server.close();
}
