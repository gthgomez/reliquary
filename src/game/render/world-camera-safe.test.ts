import assert from "node:assert/strict";
import { test } from "node:test";
import { adjustCamYForHudInset } from "./world-camera-safe.ts";

test("camera relief increases when player head sits under HUD inset", () => {
  const state = { relief: 0, contentPanY: 0 };
  const first = adjustCamYForHudInset(80, 20, 48, state);
  assert.ok(first.relief > 0);
  assert.ok(first.camY < 80);
  const second = adjustCamYForHudInset(80, first.headAfterCamRelief, 48, { relief: first.relief, contentPanY: first.contentPanY });
  assert.ok(second.relief >= first.relief * 0.5);
});

test("camera relief decays when player clears HUD band", () => {
  const state = { relief: 40, contentPanY: 0 };
  const out = adjustCamYForHudInset(80, 120, 48, state);
  assert.ok(out.relief < 40);
});

test("content pan clears head when camera is clamped at map top", () => {
  const state = { relief: 0, contentPanY: 0 };
  const out = adjustCamYForHudInset(0, 16, 119, state);
  assert.equal(out.camY, 0);
  assert.ok(out.contentPanY > 0, "pan when camY cannot drop further");
  assert.ok(out.effectiveHeadCanvasY >= 119 + 4, "effective head below HUD inset floor");
});
