import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
];

const { server, baseUrl } = await startStaticServer(0);

try {
  for (const viewport of VIEWPORTS) {
    await withBrowser(async (page) => {
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await waitForGameBoot(page);
      await page.setViewportSize(viewport);
      await page.click("text=Start");
      for (let i = 0; i < 6; i += 1) {
        if ((await page.locator(".dialog").count()) === 0) break;
        await page.keyboard.press("Enter");
        await page.waitForTimeout(150);
      }
      await page.waitForSelector(".hud-menu", { timeout: 15_000 });
      await page.waitForFunction(() => typeof window.__reliquary?.openMenu === "function");
      await page.evaluate(() => {
        window.__reliquary?.openMenu?.();
      });
      await page.waitForSelector(".overlay-panel", { timeout: 10_000 });
      const panel = page.locator(".overlay-panel, .sheet").first();
      const box = await panel.boundingBox();
      assert.ok(box, "overlay panel visible");
      assert.ok(box.width <= viewport.width, "panel fits viewport width");
      assert.ok(box.y + box.height <= viewport.height + 2, "panel fits viewport height");
      const menuBtn = page.locator(".overlay-panel .menu-list button, .sheet .menu-list button").first();
      const target = await menuBtn.boundingBox();
      assert.ok(target, "menu action visible");
      // The sheet animates in; poll until the first menu button is hit-testable.
      const hit = await page
        .waitForFunction(
          () => {
            const btn = document.querySelector(".overlay-panel .menu-list button, .sheet .menu-list button");
            if (!btn) return false;
            const r = btn.getBoundingClientRect();
            const el = document.elementFromPoint(r.x + 4, r.y + 4);
            return el?.closest("button") != null;
          },
          undefined,
          { timeout: 5000 },
        )
        .then(() => true, () => false);
      assert.equal(hit, true, "menu button receives pointer hits");
    });
    console.log(`[layout] ok ${viewport.width}x${viewport.height}`);
  }
} finally {
  server.close();
}

console.log("[layout] all viewport checks passed");
