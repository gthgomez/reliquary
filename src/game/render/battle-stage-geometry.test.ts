import assert from "node:assert/strict";
import { test } from "node:test";
import {
  battleSpriteAnchors,
  computeBattleStageGeometry,
} from "./battle-stage-geometry.ts";
import { computeBattleLayout, stableBattleUiReserveTop } from "./battle-scene.ts";
import { canvasRectToClient, clientPointToCanvas } from "./battle-layout-dom.ts";

test("sprite anchors match layout and ignore battle phase in geometry helper", () => {
  const top = stableBattleUiReserveTop(320, 512);
  const layout = computeBattleLayout(320, 512, top, { stableReserve: true });
  const command = computeBattleStageGeometry(320, 512, layout, "command");
  const skills = computeBattleStageGeometry(320, 512, layout, "skills");
  assert.deepEqual(command.spriteAnchors, skills.spriteAnchors);
  assert.deepEqual(command.spriteAnchors, battleSpriteAnchors(layout));
  assert.equal(command.stableReserveTop, layout.uiReserveTop);
});

test("anchors unchanged when simulated menu reserve differs", () => {
  const a = computeBattleLayout(320, 512, stableBattleUiReserveTop(320, 512), { stableReserve: true });
  const b = computeBattleLayout(320, 512, 220, { stableReserve: true });
  assert.deepEqual(battleSpriteAnchors(a), battleSpriteAnchors(b));
});

test("desktop status bands sit in the upper corners and clear the creature stage", () => {
  const layout = computeBattleLayout(512, 288, null, { stableReserve: true, presentation: "desktop" });
  const geometry = computeBattleStageGeometry(512, 288, layout, "command");
  assert.ok(geometry.statusZonePlayer.x < 512 / 2, "player card on the left half");
  assert.ok(geometry.statusZoneFoe.x > 512 / 2, "foe card on the right half");
  assert.equal(geometry.statusZonePlayer.y, geometry.statusZoneFoe.y, "cards share a top edge");
  assert.deepEqual(geometry.statusZonePlayer, layout.statusPlayer);
  assert.deepEqual(geometry.statusZoneFoe, layout.statusFoe);
  assert.ok(geometry.animCorridor.y >= geometry.statusZonePlayer.y + geometry.statusZonePlayer.h);
  assert.ok(geometry.animCorridor.y + geometry.animCorridor.h <= geometry.groundY);
});

test("published anchors carry feet positions and the presentation family", () => {
  const layout = computeBattleLayout(512, 288, null, { stableReserve: true, presentation: "desktop" });
  const geometry = computeBattleStageGeometry(512, 288, layout);
  assert.equal(geometry.presentation, "desktop");
  assert.equal(geometry.groundY, layout.groundY);
  assert.equal(geometry.spriteAnchors.player.feetY, layout.groundY);
  assert.equal(geometry.spriteAnchors.foe.feetY, layout.groundY);
});

test("DOM/client points convert into canvas backing-store pixels with scale and offset", () => {
  const canvas = {
    width: 512,
    height: 288,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 1536, height: 864, right: 1636, bottom: 914 }),
  } as unknown as HTMLCanvasElement;
  const middle = clientPointToCanvas(canvas, 100 + 768, 50 + 432);
  assert.ok(middle);
  assert.ok(Math.abs(middle!.x - 256) < 0.001);
  assert.ok(Math.abs(middle!.y - 144) < 0.001);
  const rect = canvasRectToClient(canvas, { x: 0, y: 0, w: 512, h: 288 });
  assert.deepEqual(rect, { left: 100, top: 50, right: 1636, bottom: 914 });
});
