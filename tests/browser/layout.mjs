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
  { width: 360, height: 800 },
  { width: 390, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
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
      if (viewport.width === 390 && (viewport.height === 844 || viewport.height === 667)) {
        // Test-only warp establishes repeatable framing; this is not journey proof.
        await page.evaluate(() => window.__controlsTest.warp("elderhall", 12, 12));
        await page.waitForFunction((tall) => {
          const canvas = document.querySelector(".game-canvas");
          return canvas?.width === 320 && (tall ? canvas.height === 576 : canvas.height > 400 && canvas.height < 480);
        }, viewport.height === 844);
        const geometry = await page.evaluate(() => {
          const canvas = document.querySelector(".game-canvas");
          const stage = document.querySelector(".stage");
          const controls = document.querySelector(".touch-full");
          const canvasRect = canvas.getBoundingClientRect();
          const stageRect = stage.getBoundingClientRect();
          const controlRect = controls.getBoundingClientRect();
          return {
            logicalWidth: canvas.width, logicalHeight: canvas.height,
            width: canvasRect.width, height: canvasRect.height,
            stageWidth: stageRect.width, canvasBottom: canvasRect.bottom, controlTop: controlRect.top,
          };
        });
        assert.ok(geometry.width >= geometry.stageWidth - 2, `exploration uses available width: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.canvasBottom <= geometry.controlTop + 1, `world stays above touch controls: ${JSON.stringify(geometry)}`);
        assert.ok(Math.abs(geometry.width / geometry.logicalWidth - geometry.height / geometry.logicalHeight) < 0.005,
          `canvas preserves its proportions: ${JSON.stringify(geometry)}`);
        // At the north edge the camera cannot scroll any farther; check that
        // its existing HUD relief makes the player's head visible after it settles.
        const previousReportTime = await page.evaluate(() => {
          const previous = window.__worldCameraReport?.ts ?? 0;
          window.__controlsTest.warp("elderhall", 11, 1);
          return previous;
        });
        await page.waitForFunction((previous) => {
          const report = window.__worldCameraReport;
          return report && report.ts > previous && report.hudInsetBottom > 20 && report.effectivePlayerHeadCanvasY >= report.hudInsetBottom + 3;
        }, previousReportTime);
        await page.evaluate(() => window.__controlsTest.warp("elderhall", 12, 12));
        if (viewport.height === 844) {
          // A smaller map restores its old maximum, then a return to Elderhall
          // reapplies the map-sized view even without a window resize.
          await page.evaluate(() => window.__controlsTest.warp("home", 5, 6));
          await page.waitForFunction(() => document.querySelector(".game-canvas")?.height === 512);
          await page.evaluate(() => window.__controlsTest.warp("elderhall", 12, 12));
          await page.waitForFunction(() => document.querySelector(".game-canvas")?.height === 576);
          // ResizeObserver must update and then restore the exploration view.
          await page.setViewportSize({ width: 390, height: 667 });
          await page.waitForFunction(() => {
            const canvas = document.querySelector(".game-canvas");
            return canvas?.width === 320 && canvas.height > 400 && canvas.height < 480;
          });
          await page.setViewportSize(viewport);
          await page.waitForFunction(() => document.querySelector(".game-canvas")?.height === 576);
        }
      }
      await page.waitForFunction(() => typeof window.__reliquary?.openMenu === "function");
      assert.match((await page.locator(".hud-place").textContent()) ?? "", /Cottage|Hollowmere|Elderhall/i);
      assert.ok((await page.locator(".hud-region").textContent())?.trim(), "region is populated from current map");
      assert.equal((await page.locator(".hud-companion").textContent())?.trim(), "No pact yet", "fresh game has no fabricated companion");
      await page.evaluate(() => window.__reliquary.setGold(321));
      assert.match((await page.locator(".hud-gold").textContent()) ?? "", /321\s*cr/, "HUD follows current currency");
      if ((viewport.width === 390 && viewport.height === 844) || (viewport.width === 412 && viewport.height === 915)) {
        const objective = await page.locator(".hud-objective-preview").evaluate((el) => ({
          text: el.textContent ?? "", clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
          clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
        }));
        assert.ok(objective.text.trim(), "the current objective is present");
        assert.ok(objective.scrollHeight <= objective.clientHeight + 1 && objective.scrollWidth <= objective.clientWidth + 1,
          `the opening objective is readable without clipping at ${viewport.width}x${viewport.height}: ${JSON.stringify(objective)}`);
      }
      if (await page.locator(".touch-full").isVisible()) {
        assert.equal(await page.getByRole("button", { name: "A — Interact", exact: true }).count(), 1);
        assert.equal(await page.getByRole("button", { name: "B — Cancel", exact: true }).count(), 1);
        for (const button of await page.locator(".touch-full button").all()) {
          const target = await button.boundingBox();
          assert.ok(target && target.width >= 44 && target.height >= 44, "touch control bounding boxes are at least 44px; clipped hit regions require separate verification");
        }
      }
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
        await page.keyboard.press("Escape");
        assert.equal(await page.locator(".hud-objective-popover").count(), 0, "Escape dismisses the objective");
        assert.equal(await page.locator(".hud-objective-btn").getAttribute("aria-expanded"), "false");
        assert.equal(await page.locator(".hud-objective-btn").evaluate((el) => el === document.activeElement), true, "dismissal restores objective focus");
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
      if (viewport.width === 390 && (viewport.height === 844 || viewport.height === 667)) {
        await page.waitForFunction(() => document.querySelector(".game-canvas")?.height === 512);
      }
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
