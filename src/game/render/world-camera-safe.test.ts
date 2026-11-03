import assert from "node:assert/strict";
import { test } from "node:test";
import { adjustCamYForHudInset } from "./world-camera-safe.ts";

test("camera relief increases when player head sits under HUD inset", () => {
  const state = { relief: 0 };
  const first = adjustCamYForHudInset(80, 20, 48, state);
  assert.ok(first.relief > 0);
  assert.ok(first.camY < 80);
  const second = adjustCamYForHudInset(80, 20 + first.relief, 48, { relief: first.relief });
  assert.ok(second.relief >= first.relief * 0.5);
});

test("camera relief decays when player clears HUD band", () => {
  const state = { relief: 40 };
  const out = adjustCamYForHudInset(80, 120, 48, state);
  assert.ok(out.relief < 40);
});
