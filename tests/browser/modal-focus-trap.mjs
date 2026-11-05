import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

async function bootWorld(page) {
  await page.click("text=Start");
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(".hud-menu", { timeout: 15_000 });
}

function activeInPanel(page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".overlay-panel");
    const el = document.activeElement;
    return Boolean(panel && el && panel.contains(el));
  });
}

/** S09: initial focus is the visible selection (active row); listless panels
 * keep the close button as the focus target. */
function waitForSheetFocus(page) {
  return page.waitForFunction(() => {
    const el = document.activeElement;
    if (!el) return false;
    const activeRow = document.querySelector(".overlay-panel .menu-list button.active, .overlay-panel .shop-list button.active");
    if (activeRow && el === activeRow) return true;
    return el.classList.contains("overlay-panel-close");
  });
}

const { server, baseUrl } = await startStaticServer(0);

try {
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await bootWorld(page);

    await page.click(".hud-menu");
    await page.waitForSelector(".overlay-panel-close");
    await waitForSheetFocus(page);

    const seen = new Set();
    for (let i = 0; i < 24; i += 1) {
      assert.equal(await activeInPanel(page), true, "Tab focus stays inside root modal");
      const tag = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}.${el.className}` : "none";
      });
      if (seen.has(tag) && seen.size > 1) break;
      seen.add(tag);
      await page.keyboard.press("Tab");
    }
    assert.ok(seen.size >= 2, "Tab cycles multiple focusables in root menu");

    await page.locator(".overlay-panel .menu-list button").filter({ hasText: "Party" }).click();
    await page.waitForSelector(".overlay-panel");
    await waitForSheetFocus(page);

    const partySeen = new Set();
    for (let i = 0; i < 24; i += 1) {
      assert.equal(await activeInPanel(page), true, "Tab focus stays inside nested party sheet");
      const tag = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}.${el.className}` : "none";
      });
      if (partySeen.has(tag) && partySeen.size > 1) break;
      partySeen.add(tag);
      await page.keyboard.press("Tab");
    }

    await page.locator(".overlay-panel-close").click();
    await page.locator(".overlay-panel").filter({ hasText: "Lantern" }).waitFor();
    assert.equal(await activeInPanel(page), true, "focus remains in modal after nested back");

    await page.locator(".overlay-panel-close").click();
    await page.waitForFunction(
      () => !document.querySelector(".game-root")?.classList.contains("is-ui-modal"),
    );
    await page.waitForFunction(() =>
      document.activeElement?.classList.contains("hud-menu"),
    );
  });
  console.log("[modal-focus-trap] Tab containment and nested restore ok");
} finally {
  server.close();
}
