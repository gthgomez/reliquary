import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { measureTargetVisibility, startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const artifactDir = process.env.RELIQUARY_BROWSER_ARTIFACTS
  ?? fileURLToPath(new URL("../../artifacts/browser/", import.meta.url));

async function bootWorld(page) {
  await page.click("text=Start");
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(".hud-menu", { timeout: 15_000 });
}

/** S09: actual focus lands on the engine's visible selection (the active
 * list row); panels without a list keep the close button as the target. */
async function waitForSheetFocus(page) {
  await page.waitForFunction(() => {
    const el = document.activeElement;
    if (!el) return false;
    const activeRow = document.querySelector(".overlay-panel .menu-list button.active, .overlay-panel .shop-list button.active");
    if (activeRow && el === activeRow && !(activeRow instanceof HTMLButtonElement && activeRow.disabled)) return true;
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

    if (await page.locator(".hud-objective-btn").count()) {
      await page.locator(".hud-objective-btn").first().click();
      assert.equal(await page.locator(".hud-objective-full").first().isVisible(), true);
    }

    await page.click(".hud-menu");
    await page.waitForSelector(".overlay-panel-close");
    await waitForSheetFocus(page);
    for (let i = 0; i < 3; i += 1) {
      await page.click(".overlay-panel-close");
      await page.waitForSelector(".hud-menu");
      await page.waitForFunction(() =>
        document.activeElement?.classList.contains("hud-menu"),
      );
      const menuFocused = true;
      assert.equal(menuFocused, true, "modal close restores focus to menu trigger");
      await page.click(".hud-menu");
      await page.waitForSelector(".overlay-panel-close");
      await waitForSheetFocus(page);
    }

    await page.locator(".overlay-panel .menu-list button").filter({ hasText: "Party" }).click();
    await page.waitForSelector(".overlay-panel");
    const hintCount = await page.locator(".action-hint").count();
    if (hintCount > 0) {
      const hintBox = await page.locator(".action-hint").first().boundingBox();
      assert.ok(hintBox && hintBox.height >= 12, "party hints visible");
    } else {
      assert.ok(await page.locator(".empty, .beast-card").first().isVisible(), "party sheet visible without pact");
    }

    await page.locator(".overlay-panel-close").click();
    await page.locator(".overlay-panel").filter({ hasText: "Lantern" }).waitFor();
    await page.locator(".overlay-panel-close").click();
    await page.waitForFunction(
      () => !document.querySelector(".game-root")?.classList.contains("is-ui-modal"),
    );
    await page.click(".hud-menu");
    await page.waitForSelector(".ui-scrim");
    const blocked = await page.evaluate(() => {
      const canvas = document.querySelector(".game-canvas");
      if (!canvas) return true;
      const r = canvas.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit?.classList.contains("game-canvas") !== true;
    });
    assert.equal(blocked, true, "canvas not activated under modal");
  });

  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 640, height: 320 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await bootWorld(page);
    await page.evaluate(() => window.__reliquary?.openMenu?.());
    await page.waitForSelector(".overlay-panel");
    const box = await page.locator(".overlay-panel").first().boundingBox();
    assert.ok(box && box.width <= 640, "overlay fits short landscape");
  });

  for (const enlargedViewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 640, height: 320 }]) {
    await withBrowser(
      async (page) => {
        await page.setViewportSize(enlargedViewport);
        await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
        await waitForGameBoot(page);
        await bootWorld(page);
        await page.evaluate(() => window.__reliquary?.openMenu?.());
        await page.waitForSelector(".overlay-panel-close");
        await waitForSheetFocus(page);
        // Actual enlarged-text reflow (S22): the enlarged sheet must not
        // introduce horizontal page overflow, and the focused control must
        // remain visible in the viewport.
        const enlargedText = await page.locator(".menu-list button").first().evaluate((el) => ({
          root: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
          button: Number.parseFloat(getComputedStyle(el).fontSize),
        }));
        assert.equal(enlargedText.root, 32, "200% text must actually enlarge the default 16px root");
        assert.equal(enlargedText.button, 32, "the menu text must actually be doubled before checking reflow");
        await page.waitForFunction(() => document.activeElement === document.querySelector(".overlay-panel .menu-list button.active"));
        const selectedVisibility = await measureTargetVisibility(page.locator(".overlay-panel .menu-list button.active"));
        assert.ok(selectedVisibility.fullyVisible && selectedVisibility.hitOk,
          `the initial focused selection must be fully exposed at 200% text: ${JSON.stringify(selectedVisibility)}`);
        const reflow = await page.evaluate(() => {
          const doc = document.documentElement;
          const panel = document.querySelector(".overlay-panel");
          const panelBox = panel?.getBoundingClientRect();
          const focusBox = document.activeElement?.getBoundingClientRect();
          return {
            scrollWidth: doc.scrollWidth,
            innerWidth: window.innerWidth,
            panelWidth: panelBox?.width ?? null,
            focusTop: focusBox?.top ?? null,
            focusBottom: focusBox?.bottom ?? null,
            innerHeight: window.innerHeight,
          };
        });
        assert.ok(
          reflow.scrollWidth <= reflow.innerWidth + 1,
          `200% text must reflow without horizontal overflow (scrollWidth ${reflow.scrollWidth} > ${reflow.innerWidth})`,
        );
        assert.ok(reflow.panelWidth && reflow.panelWidth <= reflow.innerWidth + 1, "panel fits the viewport at 200% text");
        assert.ok(
          reflow.focusTop != null && reflow.focusTop >= 0 && reflow.focusBottom <= reflow.innerHeight,
          "focused control stays visible at 200% text",
        );
        const menuRows = page.locator(".overlay-panel .menu-list button");
        for (let i = 0; i < await menuRows.count(); i++) {
          const row = menuRows.nth(i);
          await row.evaluate((node) => {
            const body = node.closest(".overlay-panel-body");
            const target = node.getBoundingClientRect();
            const bounds = body.getBoundingClientRect();
            if (target.top < bounds.top) body.scrollTop += target.top - bounds.top;
            else if (target.bottom > bounds.bottom) body.scrollTop += target.bottom - bounds.bottom;
          });
          const visibility = await measureTargetVisibility(row);
          assert.ok(visibility.fullyVisible && visibility.hitOk,
            `${enlargedViewport.width}x${enlargedViewport.height}: enlarged row must fit its scrolling body: ${JSON.stringify(visibility)}`);
        }
        await page.locator(".overlay-panel-close").focus();
        for (let i = 0; i < await menuRows.count() + 1; i++) {
          await page.keyboard.press("Tab");
          const focusVisibility = await measureTargetVisibility(page.locator(".overlay-panel :focus"));
          assert.ok(focusVisibility.fullyVisible && focusVisibility.hitOk,
            `Tab must reveal each enlarged control, including focus wrapping: ${JSON.stringify(focusVisibility)}`);
        }
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        assert.equal(await page.locator(".overlay-panel").count(), 1, "Shift+Tab must not trigger the game's cancel shortcut");
        const wrappedVisibility = await measureTargetVisibility(page.locator(".overlay-panel-close:focus"));
        assert.ok(wrappedVisibility.fullyVisible && wrappedVisibility.hitOk, "reverse focus wrapping exposes Back");
        mkdirSync(artifactDir, { recursive: true });
        await page.screenshot({ path: join(artifactDir, `modal-200pct-${enlargedViewport.width}x${enlargedViewport.height}.png`), fullPage: false });
      },
      { textScale: 2 },
    );
  }

  console.log("[modal-a11y] objective, focus cycle, hints, scrim, landscape, 200% reflow ok");
} finally {
  server.close();
}
