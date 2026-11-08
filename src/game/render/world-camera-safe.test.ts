import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adjustCamYForHudInset,
  computeWorldCamReliefTargets,
  resetWorldCamRelief,
} from "./world-camera-safe.ts";

/** Engine: playerHeadCanvasY = py + TILE - TILE * 1.5 - camY (TILE=32 → py - camY - 16). */
function headCanvasYFromPy(py: number, camY: number): number {
  return py - camY - 16;
}

function settle(camY: number, playerHeadCanvasY: number, hudInsetBottom: number, frames = 160) {
  const state = { relief: 0, contentPanY: 0 };
  let out = adjustCamYForHudInset(camY, playerHeadCanvasY, hudInsetBottom, state);
  for (let i = 1; i < frames; i += 1) {
    out = adjustCamYForHudInset(camY, playerHeadCanvasY, hudInsetBottom, state);
  }
  return { out, state };
}

const INSET = 119;
const TARGET_MIN = INSET + 4;

test("geometric targets split cam relief then pan for partial camY", () => {
  for (const camY of [0, 5, 25, 50, 100]) {
    const head = 16;
    const { targetRelief, targetPanY } = computeWorldCamReliefTargets(camY, head, INSET, {
      relief: 0,
      contentPanY: 0,
    });
    const lift = TARGET_MIN - head;
    assert.equal(targetRelief, Math.min(camY, 96, lift), `camY=${camY} relief`);
    assert.equal(targetPanY, Math.min(160, Math.max(0, lift - targetRelief)), `camY=${camY} pan`);
    assert.equal(targetRelief + targetPanY, lift, `camY=${camY} total lift`);
  }
});

test("equilibrium clears HUD without cap runaway at varied camY", () => {
  for (const camY of [0, 5, 25, 50, 100]) {
    const { out, state } = settle(camY, 16, INSET);
    assert.ok(out.effectiveHeadCanvasY >= TARGET_MIN - 0.5, `camY=${camY} effective head`);
    assert.ok(out.effectiveHeadCanvasY <= TARGET_MIN + 8, `camY=${camY} not overshooting`);
    assert.ok(state.contentPanY < 160, `camY=${camY} pan must not peg MAX`);
    assert.equal(out.camY, Math.max(0, camY - out.relief));
    const lift = TARGET_MIN - 16;
    assert.ok(
      out.relief + out.contentPanY <= lift + 2,
      `camY=${camY} relief+pan should not exceed required lift`,
    );
  }
});

test("many frames at camY=25 do not accumulate pan toward MAX", () => {
  const state = { relief: 0, contentPanY: 0 };
  for (let i = 0; i < 400; i += 1) {
    adjustCamYForHudInset(25, 16, INSET, state);
  }
  assert.ok(state.contentPanY < 160);
  assert.ok(Math.abs(state.contentPanY - 82) < 2, "pan ~ lift-maxCam = 82");
});

test("inset 0 and large inset with comfortable head yield zero targets", () => {
  for (const inset of [0, 119, 400]) {
    const head = inset === 400 ? 500 : 200;
    const { targetRelief, targetPanY } = computeWorldCamReliefTargets(80, head, inset, {
      relief: 0,
      contentPanY: 0,
    });
    assert.equal(targetRelief, 0, `inset=${inset}`);
    assert.equal(targetPanY, 0, `inset=${inset}`);
  }
});

test("transition south decays relief and pan without wrong-way growth", () => {
  const state = { relief: 0, contentPanY: 0 };
  settle(0, 16, INSET, 200);
  state.relief = 96;
  state.contentPanY = 111;
  let prevPan = state.contentPanY;
  for (let py = 32; py <= 32 * 8; py += 32) {
    const camY = 0;
    const head = headCanvasYFromPy(py, camY);
    const out = adjustCamYForHudInset(camY, head, INSET, state);
    if (head > TARGET_MIN + 20) {
      assert.ok(out.contentPanY <= prevPan + 0.01, "pan should not increase when head clears band");
      assert.ok(out.relief <= 96);
    }
    prevPan = out.contentPanY;
  }
  const cleared = settle(80, 200, INSET, 120);
  assert.equal(cleared.out.relief, 0);
  assert.equal(cleared.out.contentPanY, 0);
});

test("hysteresis band holds then releases toward zero", () => {
  const state = { relief: 30, contentPanY: 40 };
  const head = TARGET_MIN - 6;
  const mid = adjustCamYForHudInset(80, head, INSET, state);
  assert.ok(mid.relief > 0 || mid.contentPanY > 0);
  const cleared = adjustCamYForHudInset(80, TARGET_MIN + 30, INSET, state);
  assert.ok(cleared.relief < 30);
  assert.ok(cleared.contentPanY < 40);
});

test("resetWorldCamRelief clears stale state", () => {
  const state = { relief: 50, contentPanY: 120 };
  resetWorldCamRelief(state);
  assert.deepEqual(state, { relief: 0, contentPanY: 0 });
});

test("camera relief increases when player head sits under HUD inset", () => {
  const state = { relief: 0, contentPanY: 0 };
  const first = adjustCamYForHudInset(80, 20, 48, state);
  assert.ok(first.relief > 0);
  assert.ok(first.camY < 80);
});

test("content pan clears head when camera is clamped at map top", () => {
  const { out } = settle(0, 16, INSET);
  assert.equal(out.camY, 0);
  assert.ok(out.contentPanY >= TARGET_MIN - 16 - 1);
  assert.ok(out.effectiveHeadCanvasY >= TARGET_MIN);
});

test("the player's head clears the HUD on every frame while walking north", () => {
  const state = { relief: 0, contentPanY: 0 };
  const inset = 90;
  // A 32px tile takes 160ms; move 3.2px per 16ms frame, including
  // the engine's one-frame pause when it starts the next step.
  for (let tile = 4; tile > 1; tile -= 1) {
    for (let i = 1; i <= 11; i += 1) {
      const py = (tile - Math.min(i, 10) / 10) * 32;
      const out = adjustCamYForHudInset(0, py - 16, inset, state, { viewportHeight: 576, playerHeight: 48 });
      assert.ok(out.effectiveHeadCanvasY >= inset, `tile ${tile}, frame ${i} enters the HUD`);
      assert.ok(out.effectiveHeadCanvasY + 48 <= 576, `tile ${tile}, frame ${i} clips the feet`);
    }
  }
});

test("an expanded HUD can use available canvas space without clipping the player", () => {
  const state = { relief: 0, contentPanY: 0 };
  const out = adjustCamYForHudInset(0, 16, 200, state, { viewportHeight: 576, playerHeight: 48 });
  assert.ok(out.contentPanY > 160, "an open objective may require more than the old fixed pan cap");
  assert.ok(out.effectiveHeadCanvasY >= 204);
  assert.ok(out.effectiveHeadCanvasY + 48 <= 576);
  const tight = adjustCamYForHudInset(0, 16, 500, { relief: 0, contentPanY: 0 }, { viewportHeight: 512, playerHeight: 48 });
  assert.ok(tight.effectiveHeadCanvasY + 48 <= 512, "a very tall HUD must not push feet outside the canvas");
  const staleRelief = adjustCamYForHudInset(100, 450, 90, { relief: 96, contentPanY: 0 }, { viewportHeight: 512, playerHeight: 48 });
  assert.ok(staleRelief.effectiveHeadCanvasY + 48 <= 512, "old camera relief cannot push feet below the viewport");
});
