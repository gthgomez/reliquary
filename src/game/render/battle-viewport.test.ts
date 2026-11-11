import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BATTLE_VIEW_H,
  BATTLE_VIEW_W,
  BATTLE_VIEW_H_PORTRAIT,
  BATTLE_VIEW_W_PORTRAIT,
  battlePresentation,
  battleStageMetrics,
  battleViewportForStage,
  battleViewportSize,
} from "./battle-viewport.ts";

test("desktop battles use a true 16:9 stage", () => {
  assert.equal(battlePresentation(1536, 864, false), "desktop");
  assert.deepEqual(battleViewportSize("desktop"), { viewW: BATTLE_VIEW_W, viewH: BATTLE_VIEW_H });
  assert.equal(BATTLE_VIEW_W / BATTLE_VIEW_H, 16 / 9);
});

test("short landscape selects the compact family, portrait selects the tall stage", () => {
  assert.equal(battlePresentation(844, 390, false), "compact-landscape");
  assert.equal(battlePresentation(640, 320, false), "compact-landscape");
  assert.equal(battlePresentation(568, 320, false), "compact-landscape");
  assert.equal(battlePresentation(390, 844, true), "portrait");
  assert.equal(battlePresentation(320, 568, false), "portrait");
  assert.deepEqual(battleViewportSize("portrait"), {
    viewW: BATTLE_VIEW_W_PORTRAIT,
    viewH: BATTLE_VIEW_H_PORTRAIT,
  });
});

test("unknown or zero stages fall back to the desktop contract without dividing by zero", () => {
  assert.equal(battlePresentation(0, 0), "desktop");
  assert.equal(battlePresentation(-10, 20), "desktop");
});

test("logical stage adapts to the usable box instead of letterboxing", () => {
  assert.deepEqual(battleViewportForStage("desktop", 1536, 864), { viewW: 16, viewH: 9 });
  assert.deepEqual(battleViewportForStage("desktop", 1440, 900), { viewW: 16, viewH: 10 });
  assert.deepEqual(battleViewportForStage("desktop", 1280, 800), { viewW: 16, viewH: 10 });
  assert.deepEqual(battleViewportForStage("compact-landscape", 844, 390), { viewW: 19, viewH: 9 });
  assert.deepEqual(battleViewportForStage("compact-landscape", 640, 320), { viewW: 18, viewH: 9 });
  assert.deepEqual(battleViewportForStage("compact-landscape", 568, 320), { viewW: 16, viewH: 9 });
  assert.deepEqual(battleViewportForStage("portrait", 390, 844), { viewW: 10, viewH: 22 });
  assert.deepEqual(battleViewportForStage("portrait", 390, 667), { viewW: 10, viewH: 17 });
});

test("stage metrics keep the dock below the ground line in every family", () => {
  for (const family of ["desktop", "compact-landscape", "portrait"] as const) {
    const metrics = battleStageMetrics(family);
    assert.ok(metrics.ground < metrics.commandTop, `${family} ground above dock`);
    assert.ok(metrics.statusTop + metrics.statusHeight < metrics.ground, `${family} cards clear creatures`);
    assert.ok(metrics.playerHeight > 0 && metrics.foeHeight > 0, `${family} creatures have height`);
    assert.ok(metrics.statusWidth > 0 && metrics.statusWidth < 0.5, `${family} cards leave the center free`);
  }
});
