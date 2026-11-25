/** Mobile objective and touch qualification for a live Elderhall page. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function verifyTouchMovement(page) {
  await page.waitForFunction(() => window.__controlsTest?.getSpeed?.() === 0, null, { timeout: 10_000 });
  const before = await page.evaluate(() => window.__controlsTest.getPos());
  const button = page.locator(".touch-full .d.right");
  const leftButton = page.locator(".touch-full .d.left");
  const box = await button.boundingBox();
  assert.ok(box && box.width >= 44 && box.height >= 44, "right touch control has a usable target");
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
    });
    await page.waitForFunction((x) => window.__controlsTest?.getPos?.().x > x, before.x, { timeout: 10_000 });
  } finally {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {});
    await cdp.detach();
  }
  await page.waitForFunction(() => window.__controlsTest?.getSpeed?.() === 0, null, { timeout: 10_000 });
  const after = await page.evaluate(() => window.__controlsTest.getPos());
  assert.equal(after.map, "elderhall");
  assert.ok(after.x > before.x, "the touch hold moved right and released");
  const interruptions = await page.context().newCDPSession(page);
  try {
    const pointAt = async (locator, id) => {
      const box = await locator.boundingBox();
      assert.ok(box);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
    };
    await interruptions.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [await pointAt(leftButton, 2)] });
    await page.waitForFunction((x) => window.__controlsTest?.getPos?.().x < x, after.x, { timeout: 10_000 });
    await interruptions.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => window.__controlsTest?.getSpeed?.() === 0, null, { timeout: 10_000 });
    const reversedFrom = await page.evaluate(() => window.__controlsTest.getPos());
    await interruptions.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [await pointAt(button, 3)] });
    await page.waitForFunction((x) => window.__controlsTest?.getPos?.().x > x, reversedFrom.x, { timeout: 10_000 });
    await interruptions.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => window.__controlsTest?.getSpeed?.() === 0, null, { timeout: 10_000 });
    const reversedAt = await page.evaluate(() => window.__controlsTest.getPos());
    assert.ok(reversedAt.x > reversedFrom.x && reversedAt.x === after.x,
      "rapid left-to-right touch input reverses and releases without sticking");

    await interruptions.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [await pointAt(leftButton, 4)] });
    await page.waitForFunction((x) => window.__controlsTest?.getPos?.().x < x, reversedAt.x, { timeout: 10_000 });
    // Chromium headless has no physical app-switch event. Explicitly dispatch
    // the browser's window blur event while a real CDP touch is held.
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForFunction(() => window.__controlsTest?.getSpeed?.() === 0, null, { timeout: 10_000 });
    const blurredAt = await page.evaluate(() => window.__controlsTest.getPos());
    assert.ok(blurredAt.x < reversedAt.x, "window blur releases the active touch hold");
    await interruptions.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {});

    await interruptions.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [await pointAt(button, 5)] });
    await page.waitForFunction((x) => window.__controlsTest?.getPos?.().x > x, blurredAt.x, { timeout: 10_000 });
    await interruptions.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await page.waitForFunction(() => window.__controlsTest?.getSpeed?.() === 0, null, { timeout: 10_000 });
    const cancelledAt = await page.evaluate(() => window.__controlsTest.getPos());
    assert.ok(cancelledAt.x > blurredAt.x, "a cancelled touch hold is released");
    await interruptions.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [await pointAt(leftButton, 6)] });
    await page.waitForFunction((x) => window.__controlsTest?.getPos?.().x < x, cancelledAt.x, { timeout: 10_000 });
    await page.setViewportSize({ width: 667, height: 390 });
    await page.waitForFunction(() => window.__controlsTest?.getSpeed?.() === 0, null, { timeout: 10_000 });
    await interruptions.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {});
    const rotatedAt = await page.evaluate(() => window.__controlsTest.getPos());
    assert.equal(rotatedAt.map, "elderhall", "rotation releases the active hold without changing maps");
    await page.setViewportSize({ width: 390, height: 667 });
    return { method: "CDP touch press/release, rapid reversal, touchcancel, synthetic window blur and portrait-to-landscape interruption",
      before, after, reversedFrom, reversedAt, blurredAt, cancelledAt, rotatedAt,
      focusLoss: "Synthetic window blur event dispatched during active CDP touch; not a real OS app switch" };
  } finally {
    await interruptions.detach();
  }
}

async function verifyObjectiveHud(page, output) {
  await page.setViewportSize({ width: 390, height: 667 });
  // Isolated framing fixture only; this is not counted as natural movement.
  await page.evaluate(() => window.__controlsTest.warp("elderhall", 11, 4));
  await page.waitForFunction(() => window.__controlsTest?.getPos?.().y === 4);
  const before = await page.evaluate(() => window.__controlsTest.getPos());
  await page.screenshot({ path: join(output, "390x667-objective-collapsed.png") });
  const button = page.locator(".hud-objective-btn");
  await button.click();
  assert.equal(await page.locator(".overlay-panel[role=dialog]").count(), 1, "objective opens a dedicated Lantern reading surface");
  assert.equal(await page.locator(".hud-objective-popover").count(), 0, "objective directions never overlay the active playfield");
  const subtitle = page.locator(".sheet-sub");
  const guidance = await subtitle.textContent() ?? "";
  assert.match(guidance, /Objective —/);
  assert.ok(guidance.length > 80, "Lantern exposes the full objective and location guidance");
  await page.screenshot({ path: join(output, "390x667-objective-lantern.png") });
  await page.getByRole("button", { name: "Close" }).click();
  assert.equal(await page.locator(".overlay-panel").count(), 0, "Lantern dismissal returns to active exploration");
  await page.waitForFunction(() => document.activeElement?.classList.contains("hud-objective-btn"), null, { timeout: 2_000 });
  const after = await page.evaluate(() => window.__controlsTest.getPos());
  assert.equal(after.x, before.x, "opening and closing objective reading does not move the player");
  assert.equal(after.y, before.y, "opening and closing objective reading preserves the world position");
  await page.screenshot({ path: join(output, "390x667-objective-returned.png") });
  return { viewport: "390x667", lanternGuidanceCharacters: guidance.length, fixture: "gate approach at (11,4), framing only", positionPreserved: true };
}

async function captureGateOcclusionFrames(page, output) {
  const cases = [
    { name: "west-post", x: 9, y: 5 },
    { name: "east-post", x: 12, y: 5 },
    { name: "banner", x: 11, y: 4 },
    { name: "center-opening", x: 11, y: 5 },
  ];
  for (const position of cases) {
    await page.evaluate(({ x, y }) => window.__controlsTest.warp("elderhall", x, y), position);
    await page.waitForFunction(({ x, y }) => {
      const p = window.__controlsTest?.getPos?.(); return p?.map === "elderhall" && p.x === x && p.y === y;
    }, position);
    await twoFrames(page);
    await page.waitForTimeout(180);
    await page.screenshot({ path: join(output, `390x667-gate-${position.name}.png`) });
  }
  return { viewport: "390x667", positions: cases, method: "probe warps for repeatable visibility frames; not crossing gameplay evidence" };
}

/** Run after a fresh campaign has entered Elderhall on a 390×667 touch page. */
export async function verifyElderhallMobileControls(page, { output }) {
  mkdirSync(output, { recursive: true });
  return {
    objectiveHud: await verifyObjectiveHud(page, output),
    touchMovement: await verifyTouchMovement(page),
    gateOcclusionFrames: await captureGateOcclusionFrames(page, output),
  };
}
