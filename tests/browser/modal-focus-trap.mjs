import assert from "node:assert/strict";
import { startStaticServer, withBrowser } from "./helpers.mjs";

async function bootWorld(page) {
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const next = page.getByRole("button", { name: "Next", exact: true });
  await next.click();
  await next.click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).waitFor();
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
    const loadErrors = [];
    page.on("pageerror", (error) => loadErrors.push(error.message));
    page.on("requestfailed", (request) => loadErrors.push(`${request.url()} ${request.failure()?.errorText}`));
    page.on("response", (response) => {
      if (response.status() >= 400) loadErrors.push(`${response.url()} HTTP ${response.status()}`);
    });
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await bootWorld(page);
    } catch (error) {
      console.error("[modal-focus-trap] startup", {
        loadErrors,
        title: await page.locator(".title-copy").allTextContents(),
        progress: await page.getByRole("progressbar").first().getAttribute("aria-valuenow", { timeout: 1_000 }).catch(() => null),
      });
      throw error;
    }

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
