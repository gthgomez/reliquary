import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const { server, baseUrl } = await startStaticServer(0);

try {
  await withBrowser(async (page) => {
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await page.click("text=Start");
    for (let i = 0; i < 16; i += 1) {
      if ((await page.locator(".dialog").count()) === 0) break;
      await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
      await page.waitForTimeout(120);
    }
    await page.waitForSelector(".hud-place", { timeout: 15_000 });
    const place = await page.locator(".hud-place").textContent();
    assert.match(place ?? "", /Cottage|Hollowmere|Elderhall/i);
    await page.click(".hud-menu");
    await page.waitForSelector(".overlay-panel", { timeout: 5000 });
    await page.evaluate(() => window.__reliquary?.cancel?.());
  });
} finally {
  server.close();
}

console.log("[journey] title → world → menu smoke passed");
