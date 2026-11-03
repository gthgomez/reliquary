import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const { server, baseUrl } = await startStaticServer(0);

try {
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await page.click("text=Start");
    await page.waitForSelector(".dialog", { timeout: 10_000 });
    const dialogChrome = await page.evaluate(() => ({
      explore: document.querySelector(".game-root")?.classList.contains("has-explore-touch"),
      dialogTouch: document.querySelector(".game-root")?.classList.contains("has-dialog-touch"),
      dpad: document.querySelector(".touch .dpad") != null,
      ab: document.querySelector(".touch .ab") != null,
    }));
    assert.equal(dialogChrome.explore, false, "no walk pad during dialogue");
    assert.equal(dialogChrome.dialogTouch, true, "compact dialog touch row");
    assert.equal(dialogChrome.dpad, false, "N/W/E/S hidden while Next is shown");
    assert.equal(dialogChrome.ab, true, "A/B still available for dialogue");

    for (let i = 0; i < 16; i += 1) {
      if ((await page.locator(".dialog").count()) === 0) break;
      await page.locator(".dialog").click().catch(() => page.keyboard.press("Enter"));
      await page.waitForTimeout(80);
    }
    await page.waitForSelector(".hud-menu");
    const worldChrome = await page.evaluate(() => ({
      explore: document.querySelector(".game-root")?.classList.contains("has-explore-touch"),
      dpad: document.querySelector(".touch .dpad") != null,
    }));
    assert.equal(worldChrome.explore, true, "walk pad returns in overworld");
    assert.equal(worldChrome.dpad, true);
  });
  console.log("[touch-arbitration] dialog vs overworld pad ok");
} finally {
  server.close();
}
