/**
 * DOM battle HUD: foe stat card must not intersect the command band (UI-owned).
 */
import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

async function dismissIntro(page) {
  for (let i = 0; i < 24; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    const btn = page.locator("button.dialog").first();
    if (await btn.count()) await btn.click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    else await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}

const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "640x320", width: 640, height: 320 },
  { name: "844x390", width: 844, height: 390 },
];

const { server, baseUrl } = await startStaticServer(0);

try {
  for (const vp of VIEWPORTS) {
    await withBrowser(async (page) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await waitForGameBoot(page);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await dismissIntro(page);
      await page.waitForFunction(() => typeof window.__controlsTest?.startWild === "function");
      await page.evaluate(() => window.__controlsTest?.startWild?.());
      await page.waitForSelector(".battle-controls", { timeout: 15_000 });
      await page.waitForSelector(".battler.foe", { timeout: 10_000 });
      await page.waitForTimeout(300);

      const probe = await page.evaluate(() => {
        const controls = document.querySelector(".battle-controls");
        const foeHud = document.querySelector(".battler.foe");
        if (!controls || !foeHud) return null;
        const c = controls.getBoundingClientRect();
        const f = foeHud.getBoundingClientRect();
        const overlap = (a, b) =>
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return {
          foeHudVsControls: overlap(f, c),
          gapPx: c.top - f.bottom,
        };
      });

      assert.ok(probe, `${vp.name} battle HUD probe missing`);
      assert.equal(probe.foeHudVsControls, false, `${vp.name} .battler.foe must not overlap .battle-controls`);
      assert.ok(probe.gapPx >= 2, `${vp.name} foe HUD / controls gap ${probe.gapPx}px (want ≥2)`);
    });
    console.log(`[battle-hud-layout] ok ${vp.name}`);
  }
} finally {
  server.close();
}

console.log("[battle-hud-layout] foe HUD clears command band");
