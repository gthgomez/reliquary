import assert from "node:assert/strict";
import { test } from "node:test";
import { battleSpriteClientRects, measureBattleUiReserveCanvas, rectsOverlap } from "./battle-layout-dom.ts";
import {
  computeBattleLayout,
  spritesClearUiBand,
  spriteFeetY,
  stableBattleUiReserveTop,
} from "./battle-scene.ts";
import { computeBattleStageGeometry } from "./battle-stage-geometry.ts";

test("computeBattleLayout uses stable reserve when menus would shift DOM reserve", () => {
  const tallMenu = computeBattleLayout(320, 512, 280, { stableReserve: true });
  const shortMenu = computeBattleLayout(320, 512, 220, { stableReserve: true });
  assert.equal(tallMenu.player.cx, shortMenu.player.cx);
  assert.equal(tallMenu.player.cy, shortMenu.player.cy);
  assert.equal(tallMenu.foe.x, shortMenu.foe.x);
  assert.equal(tallMenu.foe.y, shortMenu.foe.y);
  assert.equal(spritesClearUiBand(tallMenu), true);
  assert.equal(spritesClearUiBand(shortMenu), true);
});

test("side-view anchors place player lower-left and foe upper-right", () => {
  const layout = computeBattleLayout(384, 512, stableBattleUiReserveTop(384, 512, 260), {
    stableReserve: true,
  });
  assert.ok(layout.player.cx < layout.foe.cx, "player left of foe");
  assert.ok(layout.player.cy > layout.foe.cy, "player lower than foe");
  const feet = spriteFeetY(layout);
  assert.ok(feet.player > feet.foe, "player feet lower on stage");
});

test("sprites stay above reserve at peer-reported canvas sizes", () => {
  const cases = [
    { cw: 320, ch: 512, reserve: 280 },
    { cw: 320, ch: 404, reserve: 220 },
    { cw: 512, ch: 240, reserve: 200 },
    { cw: 384, ch: 288, reserve: 132 },
  ];
  for (const { cw, ch, reserve } of cases) {
    const top = stableBattleUiReserveTop(cw, ch, reserve);
    const layout = computeBattleLayout(cw, ch, top, { stableReserve: true });
    assert.equal(spritesClearUiBand(layout), true, `${cw}x${ch} reserve ${top}`);
    const feet = spriteFeetY(layout);
    assert.ok(feet.foe <= layout.uiReserveTop - 8, `foe feet ${feet.foe} vs ${layout.uiReserveTop}`);
  }
});

test("anim corridor sits between anchors below status bands", () => {
  const layout = computeBattleLayout(320, 512, 250, { stableReserve: true });
  const geometry = computeBattleStageGeometry(320, 512, layout);
  assert.ok(geometry.animCorridor.h > 20);
  assert.ok(geometry.animCorridor.y + geometry.animCorridor.h <= layout.uiReserveTop - 4);
  assert.ok(geometry.animCorridor.x >= 4);
});

test("measureBattleUiReserveCanvas maps battle-controls top into canvas space", () => {
  const canvas = {
    width: 320,
    height: 512,
    parentElement: {
      querySelector: () => ({
        getClientRects: () => [{ width: 1 }],
        getBoundingClientRect: () => ({ top: 400, left: 0, right: 100, bottom: 500 }),
      }),
    },
    getBoundingClientRect: () => ({ top: 100, left: 0, right: 200, bottom: 612, height: 512, width: 200 }),
  } as unknown as HTMLCanvasElement;
  const reserve = measureBattleUiReserveCanvas(canvas);
  assert.ok(reserve != null && reserve > 200 && reserve < 310);
});

test("battleSpriteClientRects detects overlap with controls band", () => {
  const canvas = {
    width: 320,
    height: 512,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 200, height: 512, right: 200, bottom: 512 }),
  } as unknown as HTMLCanvasElement;
  const layout = computeBattleLayout(320, 512, 280, { stableReserve: true });
  const rects = battleSpriteClientRects(canvas, layout);
  const controls = { left: 0, top: 350, right: 200, bottom: 500 };
  assert.equal(rectsOverlap(rects.foe, controls), false);
  assert.equal(rectsOverlap(rects.player, controls), false);
});
