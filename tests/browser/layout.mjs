import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

async function dismissIntro(page) {
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(120);
  }
}

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 667 },
  { width: 390, height: 844 },
  { width: 640, height: 320 },
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
      await dismissIntro(page);
      await page.waitForSelector(".hud-menu", { timeout: 15_000 });
      await page.waitForFunction(() => typeof window.__reliquary?.openMenu === "function");
      // The stage must fit the viewport (no sideways scroll) and the HUD pieces
      // must not sit on top of each other.
      const fit = await page.evaluate(() => {
        const rects = [...document.querySelectorAll(".hud-chip, .hud-menu, .toast, .app-status")]
          .filter((el) => el.getClientRects().length)
          .map((el) => ({ name: el.className, r: el.getBoundingClientRect() }));
        const overlaps = [];
        for (let i = 0; i < rects.length; i += 1)
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i].r;
            const b = rects[j].r;
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)
              overlaps.push(`${rects[i].name} / ${rects[j].name}`);
          }
        const vp = document.querySelector(".viewport")?.getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          vpLeft: vp?.left ?? 0,
          vpRight: vp?.right ?? 0,
          overlaps,
        };
      });
      assert.ok(fit.scrollWidth <= fit.innerWidth, `no horizontal overflow (${fit.scrollWidth} > ${fit.innerWidth})`);
      assert.ok(fit.vpLeft >= -1 && fit.vpRight <= fit.innerWidth + 1, "game viewport inside the window");
      assert.deepEqual(fit.overlaps, [], "HUD elements do not overlap");
      if (await page.locator(".hud-objective-btn").count()) {
        const menuBoxBefore = await page.locator(".hud-menu").boundingBox();
        assert.ok(menuBoxBefore, "menu visible before objective expand");
        await page.locator(".hud-objective-btn").first().click();
        await page.waitForSelector(".hud-objective-popover", { timeout: 3000 });
        const menuBoxAfter = await page.locator(".hud-menu").boundingBox();
        assert.ok(menuBoxAfter, "menu visible after objective expand");
        assert.ok(
          Math.abs(menuBoxBefore.y - menuBoxAfter.y) < 1.5,
          `objective expand shifted Menu vertically (${menuBoxBefore.y} → ${menuBoxAfter.y})`,
        );
        const safeTop = await page.evaluate(() => {
          const vp = document.querySelector(".viewport");
          if (!vp) return 0;
          return Number.parseFloat(getComputedStyle(vp).getPropertyValue("--ui-safe-top-px"));
        });
        assert.ok(safeTop > 24, `--ui-safe-top-px should reflect HUD stack (${safeTop})`);
      }
      await page.evaluate(() => {
        window.__reliquary?.openMenu?.();
      });
      await page.waitForSelector(".overlay-panel", { timeout: 10_000 });
      const modalChrome = await page.evaluate(() => {
        const touch = document.querySelector(".touch");
        return {
          isModal: document.querySelector(".game-root")?.classList.contains("is-ui-modal"),
          touchHidden: !touch || getComputedStyle(touch).display === "none",
          explorePad: document.querySelector(".touch .dpad") != null,
          hudHidden: document.querySelector(".hud")?.classList.contains("hud-dormant") === true,
        };
      });
      assert.equal(modalChrome.isModal, true, "menu open sets ui modal class");
      assert.equal(modalChrome.touchHidden, true, "exploration touch hidden in menu");
      assert.equal(modalChrome.explorePad, false, "walk pad hidden in menu");
      assert.equal(modalChrome.hudHidden, true, "world HUD dormant under menu sheet");
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
      await page.locator(".overlay-panel .menu-list button").filter({ hasText: "Reliquary" }).click();
      await page.waitForSelector(".overlay-panel-foot .btn-ghost", { timeout: 5000 });
      await page.locator(".overlay-panel-body").evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const backSticky = await page
        .locator(".overlay-panel-foot .btn-ghost")
        .first()
        .boundingBox();
      assert.ok(backSticky, "collection back control present after scroll");
      assert.ok(backSticky.y + backSticky.height <= viewport.height + 2, "back stays on screen while grid scrolls");
    });
    console.log(`[layout] ok ${viewport.width}x${viewport.height}`);
  }
} finally {
  server.close();
}

console.log("[layout] all viewport checks passed");
