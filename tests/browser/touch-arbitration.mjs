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

    // Direction buttons accept native keyboard activation and a screen-reader-
    // shaped synthetic click, each requesting one step without a pointer hold.
    await page.evaluate(() => window.__controlsTest.warp("elderhall", 9, 13));
    const east = page.getByRole("button", { name: "East", exact: true });
    await east.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__controlsTest.getPos().x === 10);
    await page.waitForTimeout(220);
    assert.equal((await page.evaluate(() => window.__controlsTest.getPos())).x, 10, "Enter requests one step");
    await page.keyboard.press("Space");
    await page.waitForFunction(() => window.__controlsTest.getPos().x === 11);
    await page.waitForTimeout(220);
    assert.equal((await page.evaluate(() => window.__controlsTest.getPos())).x, 11, "Space requests one step");
    await east.evaluate((button) => button.click());
    await page.waitForFunction(() => window.__controlsTest.getPos().x === 12);
    await page.waitForTimeout(220);
    assert.equal((await page.evaluate(() => window.__controlsTest.getPos())).x, 12, "assistive click requests one step");
  });
  console.log("[touch-arbitration] dialog vs overworld pad ok");

  await withBrowser(async (page) => {
    await page.addInitScript(() => {
      localStorage.setItem("reliquary-classic-touch", "1");
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await page.click("text=Start");
    await page.waitForSelector(".dialog", { timeout: 10_000 });
    const dialogClassic = await page.evaluate(() => ({
      classic: document.querySelector(".game-root")?.classList.contains("classic-touch"),
      explore: document.querySelector(".game-root")?.classList.contains("has-explore-touch"),
      dpad: document.querySelector(".touch .dpad") != null,
    }));
    assert.equal(dialogClassic.classic, true, "classic-touch class when localStorage=1");
    assert.equal(dialogClassic.explore, true, "classic keeps exploration pad during dialogue");
    assert.equal(dialogClassic.dpad, true, "dpad visible in classic dialogue");

    for (let i = 0; i < 16; i += 1) {
      if ((await page.locator(".dialog").count()) === 0) break;
      await page.locator(".dialog").click().catch(() => page.keyboard.press("Enter"));
      await page.waitForTimeout(80);
    }
    await page.waitForSelector(".hud-menu");
    const worldClassic = await page.evaluate(() => ({
      explore: document.querySelector(".game-root")?.classList.contains("has-explore-touch"),
      dpad: document.querySelector(".touch .dpad") != null,
    }));
    assert.equal(worldClassic.explore, true, "classic pad in overworld");
    assert.equal(worldClassic.dpad, true);

    await page.click(".hud-menu");
    await page.waitForSelector(".overlay-panel");
    const menuClassic = await page.evaluate(() => ({
      explore: document.querySelector(".game-root")?.classList.contains("has-explore-touch"),
      modal: document.querySelector(".game-root")?.classList.contains("is-ui-modal"),
    }));
    assert.equal(menuClassic.modal, true);
    assert.equal(menuClassic.explore, true, "classic mode keeps exploration pad in modal");
    await page.evaluate(() => window.__reliquary?.cancel?.());
  });
  console.log("[touch-arbitration] classic localStorage=1 runtime ok");

  // S25: a held direction must not outlive its control surface. Hold North on
  // the real pad, walk into the Gateward (a dialog opens under the finger and
  // unmounts the pad), release the pointer, close the dialog — the player
  // must stand still instead of drifting north on a phantom key.
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await page.click("text=Start");
    for (let i = 0; i < 16 && (await page.locator(".dialog").count()) > 0; i += 1) {
      await page.locator(".dialog").click().catch(() => page.keyboard.press("Enter"));
      await page.waitForTimeout(80);
    }
    await page.waitForSelector(".hud-menu");
    // From home, step out to Elderhall so the Gateward intercept is reachable.
    await page.waitForFunction(() => window.__controlsTest?.getPos?.().map === "home", null, { timeout: 10_000 });
    // Walk south through the cottage door into Elderhall (spawn 12,14) with a
    // real pointer hold (a synthetic event has no pointerId to capture).
    const downBtn = page.locator(".touch .d.down");
    const downBox = await downBtn.boundingBox();
    await page.mouse.move(downBox.x + downBox.width / 2, downBox.y + downBox.height / 2);
    await page.mouse.down();
    await page.waitForFunction(() => window.__controlsTest?.getPos?.().map === "elderhall", null, { timeout: 20_000 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    // The cottage warp lands at (5,15); walk east to the gate column (x 10/11)
    // the way a thumb would steer, then hold North into the gate.
    await page.evaluate(() => window.__controlsTest.setKeys(["KeyD"]));
    await page.waitForFunction(() => window.__controlsTest?.getPos?.().x >= 10, null, { timeout: 20_000 });
    await page.evaluate(() => window.__controlsTest.setKeys([]));
    await page.waitForTimeout(250);
    const north = page.locator(".touch .d.up");
    const box = await north.boundingBox();
    assert.ok(box, "north pad present");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForFunction(
      () => {
        const pos = window.__controlsTest?.getPos?.();
        return pos && pos.y <= 1 && pos.dialog === false;
      },
      null,
      { timeout: 25_000 },
    ).catch(() => {});
    await page.waitForSelector(".dialog", { timeout: 15_000 });
    // The pad is unmounted while the finger is still down.
    assert.equal(await page.locator(".touch .dpad").count(), 0, "exploration pad unmounted under the held pointer");
    await page.mouse.up(); // release lands nowhere; cleanup must have already fired
    // Close the Gateward dialog the way a thumb does: tap the dialog itself.
    for (let i = 0; i < 6 && (await page.locator(".dialog").count()) > 0; i += 1) {
      await page.locator(".dialog").click({ delay: 30 }).catch(() => page.keyboard.press("Enter"));
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(() => document.querySelector(".dialog") == null, null, { timeout: 10_000 });
    const before = await page.evaluate(() => window.__controlsTest.getPos());
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => window.__controlsTest.getPos());
    assert.deepEqual(
      { x: after.x, y: after.y },
      { x: before.x, y: before.y },
      "no phantom held movement after the pad unmounted",
    );

    // Supplemental: adjacent D-pad target geometry — measure real overlaps
    // and confirm each shared-corner hit lands on the intended direction.
    await page.waitForSelector(".touch .d.up", { timeout: 15_000 });
    const geometry = await page.evaluate(() => {
      const rects = {};
      for (const cls of ["up", "left", "right", "down"]) {
        const el = document.querySelector(`.touch .d.${cls}`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        rects[cls] = { x: r.x, y: r.y, w: r.width, h: r.height };
      }
      const overlap = (a, b) => {
        if (!a || !b) return 0;
        const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        return ox * oy;
      };
      return {
        rects,
        overlaps: {
          "up-left": overlap(rects.up, rects.left),
          "up-right": overlap(rects.up, rects.right),
          "down-left": overlap(rects.down, rects.left),
          "down-right": overlap(rects.down, rects.right),
          "up-down": overlap(rects.up, rects.down),
          "left-right": overlap(rects.left, rects.right),
        },
        size: rects.up?.w ?? null,
      };
    });
    console.log(`[touch-arbitration] dpad geometry ${JSON.stringify(geometry)}`);
    // Adjacent squares in a cross overlap by design (measured 8×8px at 44px);
    // the repair chamfers each button's inner diagonal corners, so the shared
    // corner is a dead pivot instead of an ambiguous hit.
    for (const [pair, area] of Object.entries(geometry.overlaps)) {
      if (area > 0) {
        const [aKey, bKey] = pair.split("-");
        const a = geometry.rects[aKey];
        const b = geometry.rects[bKey];
        // The overlapped corner region must not resolve to a third direction.
        const cx = Math.min(a.x + a.w, b.x + b.w) - 1;
        const cy = Math.min(a.y + a.h, b.y + b.h) - 1;
        const hit = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null,
          [cx, cy],
        );
        const labels = { up: "North", down: "South", left: "West", right: "East" };
        const allowed = [labels[aKey], labels[bKey], null];
        assert.ok(
          allowed.includes(hit),
          `shared ${pair} corner must be dead-or-adjacent, got ${hit} (would fire the wrong direction)`,
        );
      }
    }
    // Each button's center still hits its own direction.
    for (const [key, r] of Object.entries(geometry.rects)) {
      const hit = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null,
        [r.x + r.w / 2, r.y + r.h / 2],
      );
      const labels = { up: "North", down: "South", left: "West", right: "East" };
      assert.equal(hit, labels[key], `${key} center must hit its own control, got ${hit}`);
    }
    // Corner hit-test: the shared corner between up/left regions must resolve
    // to one of the two, never to a wrong control or the page.
    const up = geometry.rects.up;
    const left = geometry.rects.left;
    if (up && left) {
      const cx = Math.max(up.x + up.w / 2, left.x + left.w / 2);
      const cy = Math.min(up.y + up.h / 2, left.y + left.h / 2);
      const hit = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null,
        [cx, cy],
      );
      assert.ok(hit === "North" || hit === "West", `shared up/left corner hit an adjacent control, got ${hit}`);
    }
  });
  console.log("[touch-arbitration] held-touch cleanup + dpad geometry ok");
} finally {
  server.close();
}
