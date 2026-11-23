import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adjustCamYForHudInset,
  computeWorldCamReliefTargets,
  resetWorldCamRelief,
} from "./world-camera-safe.ts";
import { snapWorldCameraForPlayer } from "./world-transform.ts";

/** Engine: playerHeadCanvasY = py + TILE - TILE * 1.25 - camY (TILE=32 → py - camY - 8). */
function headCanvasYFromPy(py: number, camY: number): number {
  return py - camY - 8;
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
      const out = adjustCamYForHudInset(0, py - 8, inset, state, { viewportHeight: 576, playerHeight: 40 });
      assert.ok(out.effectiveHeadCanvasY >= inset, `tile ${tile}, frame ${i} enters the HUD`);
      assert.ok(out.effectiveHeadCanvasY + 40 <= 576, `tile ${tile}, frame ${i} clips the feet`);
    }
  }
});

test("an expanded HUD can use available canvas space without clipping the player", () => {
  const state = { relief: 0, contentPanY: 0 };
  const out = adjustCamYForHudInset(0, 16, 200, state, { viewportHeight: 576, playerHeight: 40 });
  assert.ok(out.contentPanY > 160, "an open objective may require more than the old fixed pan cap");
  assert.ok(out.effectiveHeadCanvasY >= 204);
  assert.ok(out.effectiveHeadCanvasY + 40 <= 576);
  const tight = adjustCamYForHudInset(0, 16, 500, { relief: 0, contentPanY: 0 }, { viewportHeight: 512, playerHeight: 40 });
  assert.ok(tight.effectiveHeadCanvasY + 40 <= 512, "a very tall HUD must not push feet outside the canvas");
  const staleRelief = adjustCamYForHudInset(100, 450, 90, { relief: 96, contentPanY: 0 }, { viewportHeight: 512, playerHeight: 40 });
  assert.ok(staleRelief.effectiveHeadCanvasY + 40 <= 512, "old camera relief cannot push feet below the viewport");
});

test("a nearby landmark clears the HUD while the player stays in the viewport", () => {
  const state = { relief: 0, contentPanY: 0 };
  const adjusted = adjustCamYForHudInset(64, 176, 70, state, {
    viewportHeight: 288, playerHeight: 40, landmarkTop: 12,
  });
  assert.equal(12 + 64 - adjusted.camY + adjusted.contentPanY, 74);
  assert.ok(adjusted.effectiveHeadCanvasY + 40 <= 288);

  const short = adjustCamYForHudInset(0, 100, 70, { relief: 0, contentPanY: 0 }, {
    viewportHeight: 192, playerHeight: 40, landmarkTop: 0,
  });
  assert.equal(short.contentPanY, 0, "optional framing must not pan the world when the camera is clamped");
  assert.ok(short.effectiveHeadCanvasY + 40 <= 192);
});

test("gate framing does not reverse or drift during north/south travel", () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const state = { relief: 0, contentPanY: 0 };
    const sample = (py: number) => {
      const camY = Math.max(0, Math.min(py - 128, 288));
      const landmarkTop = 102.8 - camY + 3 * Math.max(0, py - 200 - 64);
      const result = adjustCamYForHudInset(camY, py - camY - 8, 49, state, {
        viewportHeight: 288, playerHeight: 40, landmarkTop, dtSeconds: dt,
      });
      return py - 8 - result.camY + result.contentPanY;
    };
    let py = 448;
    let lastScreenY = sample(py);
    const move = (end: number, direction: -1 | 1) => {
      while (direction < 0 ? py > end : py < end) {
        py = direction < 0 ? Math.max(end, py - 200 * dt) : Math.min(end, py + 200 * dt);
        const screenY = sample(py);
        const screenDelta = screenY - lastScreenY;
        assert.ok(direction * screenDelta >= -0.05,
          `dt=${dt}: player screen reversed by ${screenDelta.toFixed(2)} px at world y=${py.toFixed(2)}`);
        lastScreenY = screenY;
      }
    };
    move(208, -1);
    move(288, 1);
    const stoppedAt = lastScreenY;
    for (let i = 0; i < 20; i += 1) assert.ok(Math.abs(sample(py) - stoppedAt) < 0.05, `dt=${dt}: drift after release`);
    move(448, 1);
  }
});

test("optional landmark movement is time bounded, stops on release, and respects map clamps", () => {
  const results: number[] = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const state = { relief: 0, contentPanY: 0 };
    let head = 100;
    adjustCamYForHudInset(100, head, 49, state, { viewportHeight: 1000, playerHeight: 40, dtSeconds: dt });
    for (let t = 0; t < Math.round(0.5 / dt); t += 1) {
      head += 100 * dt;
      adjustCamYForHudInset(100, head, 49, state, { viewportHeight: 1000, playerHeight: 40, landmarkTop: 0, dtSeconds: dt });
    }
    const held = adjustCamYForHudInset(100, head, 49, state, { viewportHeight: 1000, playerHeight: 40, landmarkTop: 0, dtSeconds: dt });
    const stopped = adjustCamYForHudInset(100, head, 49, state, { viewportHeight: 1000, playerHeight: 40, landmarkTop: 0, dtSeconds: dt });
    assert.equal(held.camY, stopped.camY, "landmark framing does not drift after release");
    assert.ok(held.relief > 20 && held.relief <= 24.001, `bounded movement at dt=${dt}`);
    results.push(held.relief);
    resetWorldCamRelief(state);
    const edge = adjustCamYForHudInset(0, 100, 49, state, { viewportHeight: 192, playerHeight: 40, landmarkTop: 0, dtSeconds: dt });
    assert.equal(edge.camY, 0);
    assert.equal(edge.contentPanY, 0, "an optional landmark cannot expose blank map edges");
  }
  assert.ok(Math.max(...results) - Math.min(...results) < 0.001, "equal elapsed time yields equal relief");
});

test("a changing HUD cannot make optional framing exceed its time bound", () => {
  const state = { relief: 0, contentPanY: 0 };
  adjustCamYForHudInset(100, 70, 130, state, { viewportHeight: 288, playerHeight: 40, dtSeconds: 1 / 60 });
  const next = adjustCamYForHudInset(101, 71, 49, state, {
    viewportHeight: 288, playerHeight: 40, landmarkTop: -30, dtSeconds: 1 / 60,
  });
  assert.ok(next.relief - state.relief <= 48 / 60 + 1e-9, "optional movement stays within its elapsed-time budget");
});

test("HUD relief does not drift after Rowan stops and the inset shrinks", () => {
  const state = { relief: 0, contentPanY: 0 };
  const before = adjustCamYForHudInset(32, 112, 115, state, { viewportHeight: 288, playerHeight: 40 });
  for (let i = 0; i < 20; i += 1) {
    const after = adjustCamYForHudInset(32, 112, 91, state, { viewportHeight: 288, playerHeight: 40 });
    assert.equal(after.camY, before.camY, "the camera stays still after release");
    assert.equal(after.contentPanY, before.contentPanY);
  }
});

test("HUD pan cannot move Rowan north while he walks south from the map edge", () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    // Reproduce the portrait capture: HUD pan was still unwinding at y=96.
    const state = { relief: 0, contentPanY: 68.5129554592294, landmarkRelief: 0,
      previousWorldHeadY: 80, previousScreenHeadY: 148.5129554592294 };
    let head = 80;
    let lastScreen = state.previousScreenHeadY;
    for (let i = 0; i < Math.ceil(0.5 / dt); i += 1) {
      head += 200 * dt;
      const out = adjustCamYForHudInset(0, head, 126, state, {
        viewportHeight: 576, playerHeight: 40, dtSeconds: dt,
      });
      assert.ok(out.effectiveHeadCanvasY >= lastScreen - 1e-9,
        `dt=${dt}: southbound screen position reversed by ${(lastScreen - out.effectiveHeadCanvasY).toFixed(3)} px`);
      assert.ok(out.effectiveHeadCanvasY >= 130 && out.effectiveHeadCanvasY + 40 <= 576);
      lastScreen = out.effectiveHeadCanvasY;
    }
    const stopped = adjustCamYForHudInset(0, head, 126, state, { viewportHeight: 576, playerHeight: 40, dtSeconds: dt });
    assert.equal(stopped.effectiveHeadCanvasY, lastScreen, "HUD correction stays still on release");
  }
});

test("pixel-aligned camera keeps the continuous player screen position monotonic", () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const state = { relief: 0, contentPanY: 0 };
    const pixelState = {};
    let py = 448;
    const sample = () => {
      const camY = Math.max(0, Math.min(py - 128, 288));
      const adjusted = adjustCamYForHudInset(camY, py - camY - 8, 49, state, {
        viewportHeight: 288, playerHeight: 40, landmarkTop: 102.8 - camY + 3 * Math.max(0, py - 264), dtSeconds: dt,
      });
      const desired = adjusted.camY - adjusted.contentPanY;
      const snapped = snapWorldCameraForPlayer(py, desired, pixelState);
      assert.equal(snapped, Math.round(snapped));
      const screen = Math.round(py) - snapped;
      assert.ok(Math.abs(screen - (py - desired)) <= 1.5, "snapping stays close to the continuous screen position");
      return screen;
    };
    let previous = sample();
    for (const [end, direction] of [[64, -1], [448, 1]] as const) {
      while (direction < 0 ? py > end : py < end) {
        py = direction < 0 ? Math.max(end, py - 200 * dt) : Math.min(end, py + 200 * dt);
        const screen = sample();
        assert.ok(direction * (screen - previous) >= 0, `dt=${dt}, py=${py}: snapped screen position reversed`);
        previous = screen;
      }
    }
    for (const player of [0, 0.1, 0.5, 0.9, 40.5]) {
      assert.equal(snapWorldCameraForPlayer(player, 0), 0, "top map clamp remains exact");
      assert.equal(snapWorldCameraForPlayer(player, 288), 288, "bottom map clamp remains exact");
    }
  }
});

test("pixel camera does not reverse scenery while its target moves steadily", () => {
  // Captured portrait frames while the HUD pan returns at the north map edge.
  const frames = [
    [189.94, -1.011812335968768], [192, -0.8303449849201648],
    [195.32, -0.6814235896046226], [198.64, -0.5592110711842123],
    [202.02, -0.4572808424802677], [205.32, -0.37571516175312153],
    [208.66, -0.3079641768174175], [211.98, -0.2527311643325357],
    [215.32, -0.20715731730549514], [218.64, -0.17000389637416194],
    [221.98, -0.13934787661570155], [224, -0.11340680991362787],
  ] as const;
  for (const direction of [1, -1] as const) {
    const sequence = direction === 1 ? frames : [...frames].reverse();
    const state = {};
    let previousCamera: number | undefined;
    let previousScreen: number | undefined;
    for (const [player, desired] of sequence) {
      const camera = snapWorldCameraForPlayer(player, desired, state);
      const screen = Math.round(player) - camera;
      if (previousCamera !== undefined && previousScreen !== undefined) {
        assert.ok(direction * (camera - previousCamera) >= 0, `rendered camera reversed at world y=${player}`);
        assert.ok(direction * (screen - previousScreen) >= 0, `player reversed on screen at world y=${player}`);
      }
      previousCamera = camera;
      previousScreen = screen;
    }
  }
});
