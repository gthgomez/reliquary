import assert from "node:assert/strict";
import { test } from "node:test";
import {
  battleSpriteAnchors,
  computeBattleStageGeometry,
} from "./battle-stage-geometry.ts";
import { computeBattleLayout, stableBattleUiReserveTop } from "./battle-scene.ts";

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
