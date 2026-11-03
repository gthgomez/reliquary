import assert from "node:assert/strict";
import { test } from "node:test";
import { battleSpriteClientRects, measureBattleUiReserveCanvas, rectsOverlap } from "./battle-layout-dom.ts";
import { computeBattleLayout, spritesClearUiBand, spriteFeetY } from "./battle-scene.ts";

test("computeBattleLayout uses measured reserve when provided", () => {
  const layout = computeBattleLayout(320, 512, 280);
  assert.equal(layout.uiReserveSource, "dom");
  assert.equal(layout.uiReserveTop, 280);
  assert.equal(spritesClearUiBand(layout), true);
});

test("sprites stay above DOM-aligned reserve at peer-reported canvas sizes", () => {
  // Internal canvas sizes for typical CSS viewports (10×16 and landscape tiles).
  const cases = [
    { cw: 320, ch: 512, reserve: 280 },
    { cw: 320, ch: 404, reserve: 220 },
    { cw: 512, ch: 240, reserve: 200 },
  ];
  for (const { cw, ch, reserve } of cases) {
    const layout = computeBattleLayout(cw, ch, reserve);
    assert.equal(spritesClearUiBand(layout), true, `${cw}x${ch} reserve ${reserve}`);
    const feet = spriteFeetY(layout);
    assert.ok(feet.foe <= reserve - 8, `foe feet ${feet.foe} vs ${reserve}`);
  }
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
  const layout = computeBattleLayout(320, 512, 280);
  const rects = battleSpriteClientRects(canvas, layout);
  const controls = { left: 0, top: 350, right: 200, bottom: 500 };
  assert.equal(rectsOverlap(rects.foe, controls), false);
  assert.equal(rectsOverlap(rects.player, controls), false);
});
