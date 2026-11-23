import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const artifactDir = process.env.RELIQUARY_BROWSER_ARTIFACTS
  ? resolve(process.env.RELIQUARY_BROWSER_ARTIFACTS)
  : null;
if (artifactDir) mkdirSync(artifactDir, { recursive: true });

async function dismissIntro(page) {
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog-next").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(120);
  }
}

async function waitForObjectiveSafeArea(page, checkPlayer) {
  await page.waitForFunction((shouldCheckPlayer) => {
    const popover = document.querySelector(".hud-objective-popover");
    const viewport = document.querySelector(".viewport");
    const canvas = document.querySelector(".game-canvas");
    if (!popover || !viewport || !canvas || !popover.getClientRects().length) return false;
    const pop = popover.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    const safe = Number.parseFloat(getComputedStyle(viewport).getPropertyValue("--ui-safe-top-px"));
    if (safe < pop.bottom - view.top + 3) return false;
    if (!shouldCheckPlayer) return true;
    const report = window.__worldCameraReport;
    const canvasRect = canvas.getBoundingClientRect();
    const popBottomCanvas = (pop.bottom - canvasRect.top) * canvas.height / canvasRect.height;
    return report && report.canvasH === canvas.height && report.hudInsetBottom >= popBottomCanvas
      && report.effectivePlayerHeadCanvasY >= popBottomCanvas
      && report.effectivePlayerHeadCanvasY + 48 <= canvas.height + 1;
  }, checkPlayer, { timeout: 10_000 });
}

async function revealCottageDoorHint(page) {
  for (const x of [5, 4]) {
    await page.evaluate((doorX) => {
      window.__controlsTest.warp("elderhall", doorX, 15);
      window.__controlsTest.setKeys(["KeyW"]);
    }, x);
    await page.waitForTimeout(80);
    await page.evaluate(() => window.__controlsTest.setKeys([]));
    const visible = await page.waitForFunction(() =>
      document.querySelector(".world-interaction-hint")?.textContent?.startsWith("Enter · Interact:") === true,
    null, { timeout: 900 }).then(() => true, () => false);
    if (visible) return x;
    await page.evaluate(() => window.__controlsTest.setKeys([]));
    await page.waitForTimeout(80);
  }
  throw new Error("Could not reveal the cottage doorway interaction hint");
}

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 390, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 568, height: 320 },
  { width: 640, height: 320 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
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
          // The cottage fits the authored room, then a return to Elderhall
          // reapplies the map-sized view even without a window resize.
          await page.evaluate(() => window.__controlsTest.warp("home", 5, 6));
          await page.waitForFunction(() => document.querySelector(".game-canvas")?.height === 288);
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
      const objective = await page.locator(".hud-objective-preview").evaluate((el) => ({
        text: el.textContent ?? "", clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
        compact: getComputedStyle(el).clipPath !== "none",
        lineClamp: getComputedStyle(el).webkitLineClamp || getComputedStyle(el).lineClamp,
        truncated: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
      }));
      const inCottage = (await page.locator(".hud-place").innerText()).includes("Cottage");
      assert.equal(objective.text, inCottage ? "Leave the cottage" : "Find the Binding Grove",
        "the persistent HUD gives a compact, accurate next step for the current map");
      assert.ok(
        objective.compact || (objective.clientHeight > 0 &&
          (objective.lineClamp === "2" || objective.scrollHeight <= objective.clientHeight + 1) &&
          objective.scrollWidth <= objective.clientWidth + 1),
        `the starting objective fits at ${viewport.width}x${viewport.height}: ${JSON.stringify(objective)}`,
      );
      const objectiveTarget = await page.locator(".hud-objective-btn").boundingBox();
      assert.ok(objectiveTarget && objectiveTarget.height >= 44, "objective has a 44px touch target");
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
        const checkPlayer = viewport.width === 390 && (viewport.height === 844 || viewport.height === 667);
        if (checkPlayer) {
          // Put the player at the north edge for the popover geometry check.
          await page.evaluate(() => window.__controlsTest.warp("elderhall", 11, 1));
        }
        const menuBoxBefore = await page.locator(".hud-menu").boundingBox();
        assert.ok(menuBoxBefore, "menu visible before objective expand");
        const status = page.getByRole("status").and(page.locator(".app-status"));
        if (viewport.width === 320) await status.waitFor();
        await page.locator(".hud-objective-btn").first().click();
        await page.waitForSelector(".hud-objective-popover", { timeout: 3000 });
        const objectiveRegion = page.getByRole("region", { name: "Current objective" });
        const fullObjective = await objectiveRegion.locator(".hud-objective-full").first().innerText();
        assert.equal(fullObjective, "Speak a pact at the Binding Grove, west of Elderhall.",
          "the full chapter objective remains readable from the objective control");
        const fullHint = await objectiveRegion.locator(".hud-objective-full").nth(1).innerText();
        assert.match(fullHint, inCottage ? /then follow the village path west\./ : /Binding Grove is west.*opening beside the grove sign.*optional guidance/i,
          "the full contextual direction remains available in the objective panel");
        await page.keyboard.press("Tab");
        assert.equal(await objectiveRegion.evaluate((el) => document.activeElement === el), true,
          "keyboard users can focus and scroll the full objective region");
        await page.keyboard.press("End");
        await page.waitForFunction(() => {
          const el = document.querySelector(".hud-objective-popover");
          const action = el?.querySelector(".hud-objective-lantern");
          if (!el || !action) return false;
          const region = el.getBoundingClientRect();
          const target = action.getBoundingClientRect();
          return target.top >= region.top - 1 && target.bottom <= region.bottom + 1;
        }, null, { timeout: 3000, polling: "raf" });
        const objectiveReach = await objectiveRegion.evaluate((el, cottage) => {
          const action = el.querySelector(".hud-objective-lantern");
          const region = el.getBoundingClientRect();
          const target = action?.getBoundingClientRect();
          const contextualDirections = [...el.querySelectorAll(".hud-objective-full")].some((node) => {
            const copy = node.innerText;
            return cottage ? /then follow the village path west/i.test(copy)
              : /Binding Grove is west.*opening beside the grove sign.*optional guidance/i.test(copy);
          });
          return {
            fullHintPresent: contextualDirections,
            optionalMaren: [...el.querySelectorAll(".hud-objective-full")].some((node) => /maren.*optional guidance/i.test(node.innerText)),
            actionReachable: !!target && target.top >= region.top - 1 && target.bottom <= region.bottom + 1,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          };
        }, inCottage);
        assert.equal(objectiveReach.fullHintPresent, true, "the complete contextual direction is in the scrollable region");
        if (!inCottage) assert.equal(objectiveReach.optionalMaren, true, "optional Maren guidance remains available in the full directions");
        assert.equal(objectiveReach.actionReachable, true,
          `objective action is reachable at the end of the full panel: ${JSON.stringify(objectiveReach)}`);
        if (objective.truncated) {
          assert.equal(fullObjective, "Speak a pact at the Binding Grove, west of Elderhall.",
            "a truncated HUD summary opens to the complete current objective");
          assert.equal(objectiveReach.fullHintPresent, true,
            "the contextual hint remains available when the HUD summary is clipped");
        }
        if (viewport.width === 320) {
          assert.equal(await status.evaluate((el) => getComputedStyle(el).clipPath), "inset(50%)",
            "offline status remains announced and does not paint over the objective");
        }
        await waitForObjectiveSafeArea(page, checkPlayer);
        if (checkPlayer) {
          const action = page.locator(".hud-objective-lantern");
          assert.equal(await action.isVisible(), true, "objective action remains visible");
          assert.equal(await action.evaluate((button) => {
            const rect = button.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return hit === button || button.contains(hit);
          }), true, "objective action remains pointer-accessible");
        }
        if (viewport.width === 390 && viewport.height === 844) {
          // Reflow the open panel; its new visible bottom must remain reserved.
          await page.setViewportSize({ width: 360, height: 844 });
          await waitForObjectiveSafeArea(page, true);
          await page.setViewportSize(viewport);
          await waitForObjectiveSafeArea(page, true);
        }
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
        await page.waitForFunction(() => {
          const stack = document.querySelector(".top-stack");
          const viewport = document.querySelector(".viewport");
          const safe = Number.parseFloat(getComputedStyle(viewport).getPropertyValue("--ui-safe-top-px"));
          return safe <= stack.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top + 5;
        });
        assert.equal(await page.locator(".hud-objective-btn").getAttribute("aria-expanded"), "false");
        assert.equal(await page.locator(".hud-objective-btn").evaluate((el) => el === document.activeElement), true, "dismissal restores objective focus");
        if (viewport.width === 320) {
          assert.equal(await status.evaluate((el) => getComputedStyle(el).clipPath), "none",
            "offline status is visible again after dismissing the objective");
        }
      }
      if ((viewport.width === 320 && viewport.height === 568)
        || (viewport.width === 568 && viewport.height === 320)
        || (viewport.width === 640 && viewport.height === 320)
        || (viewport.width === 390 && viewport.height === 844)) {
        const doorX = await revealCottageDoorHint(page);
        if (await page.locator(".hud-objective-btn").getAttribute("aria-expanded") === "false") {
          await page.locator(".hud-objective-btn").click();
          await page.waitForSelector(".hud-objective-popover", { timeout: 3000 });
        }
        const fullDirections = await page.locator(".hud-objective-full").allInnerTexts();
        assert.ok(fullDirections.some((text) => /Binding Grove is west.*optional guidance/i.test(text)),
          "the doorway geometry scenario retains the full westward goal and optional Maren guidance");
        const hintGeometry = await page.evaluate(() => {
          const hint = document.querySelector(".world-interaction-hint")?.getBoundingClientRect();
          const viewport = document.querySelector(".viewport")?.getBoundingClientRect();
          const status = document.querySelector(".app-status")?.getBoundingClientRect();
          const objective = document.querySelector(".hud-objective-popover")?.getBoundingClientRect();
          const controls = [...document.querySelectorAll(".touch-full .dpad, .touch-full .ab")]
            .filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect());
          const overlaps = (a, b) => !!a && !!b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
          return {
            insideViewport: !!hint && !!viewport && hint.left >= viewport.left - 1 && hint.right <= viewport.right + 1
              && hint.top >= viewport.top - 1 && hint.bottom <= viewport.bottom + 1,
            overlapsStatus: overlaps(hint, status),
            overlapsObjective: overlaps(hint, objective),
            overlapsTouch: controls.some((rect) => overlaps(hint, rect)),
            bottomEdge: !!hint && !!viewport && viewport.bottom - hint.bottom <= 16,
            rightCorner: !!hint && !!viewport && viewport.right - hint.right <= 16,
            hint: hint && { x: hint.x, y: hint.y, width: hint.width, height: hint.height },
          };
        });
        assert.equal(hintGeometry.insideViewport, true, `interaction hint stays in the game viewport: ${JSON.stringify(hintGeometry)}`);
        assert.equal(hintGeometry.overlapsStatus, false, `interaction hint clears offline status: ${JSON.stringify(hintGeometry)}`);
        assert.equal(hintGeometry.overlapsObjective, false, `interaction hint clears the expanded objective: ${JSON.stringify(hintGeometry)}`);
        assert.equal(hintGeometry.overlapsTouch, false, `interaction hint clears touch controls: ${JSON.stringify(hintGeometry)}`);
        assert.equal(hintGeometry.bottomEdge, true, `interaction hint stays at the bottom edge: ${JSON.stringify(hintGeometry)}`);
        assert.equal(hintGeometry.rightCorner, true, `interaction hint stays at the right corner, away from the doorway approach: ${JSON.stringify(hintGeometry)}`);
        if (viewport.width === 390 && viewport.height === 844) {
          if (artifactDir) {
            await page.screenshot({ path: join(artifactDir, "interaction-hint-cottage-door-390x844.png") });
          }
          assert.ok(doorX === 4 || doorX === 5);
        }
      }
      await page.evaluate(() => window.__controlsTest.warp("elderhall", 2, 7));
      await page.evaluate(() => window.__controlsTest.setKeys([]));
      await page.waitForSelector(".world-interaction-hint", { timeout: 3000 });
      await page.keyboard.press("z");
      await page.waitForSelector(".dialog", { timeout: 3000 });
      assert.equal(await page.locator(".world-interaction-hint").count(), 0, "dialogue hides the world interaction hint");
      await dismissIntro(page);
      await page.evaluate(() => {
        window.__reliquary?.openMenu?.();
      });
      await page.waitForSelector(".overlay-panel", { timeout: 10_000 });
      assert.equal(await page.locator(".world-interaction-hint").count(), 0, "menus hide the world interaction hint");
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
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 640, height: 320 }]) {
    await withBrowser(async (page) => {
      await page.setViewportSize(viewport);
      await page.goto(baseUrl);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await dismissIntro(page);
      const objective = page.locator(".hud-objective-btn");
      const box = await objective.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44 && box.height <= 88,
        `objective target fits at 200% text, ${viewport.width}x${viewport.height}: ${JSON.stringify(box)}`);
      assert.ok(await page.locator(".hud-chip").evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        "enlarged location and status fit their HUD card");
      await objective.tap();
      const panel = page.getByRole("region", { name: "Current objective" });
      assert.match(await panel.innerText(), /Binding Grove/);
      const panelBox = await panel.boundingBox();
      const touchBox = await page.locator(".touch-full").boundingBox();
      const bottom = viewport.width < viewport.height ? touchBox?.y : viewport.height;
      assert.ok(panelBox && bottom && panelBox.y + panelBox.height <= bottom + 1,
        `expanded objective clears the controls at 200% text, ${viewport.width}x${viewport.height}`);
      await panel.getByRole("button", { name: "Open in Lantern menu" }).tap();
      await page.locator(".overlay-panel").waitFor();
    }, { textScale: 2, context: { hasTouch: true } });
    console.log(`[layout] ok ${viewport.width}x${viewport.height} at 200% text`);
  }
} finally {
  server.close();
}

console.log("[layout] all viewport checks passed");
