import assert from "node:assert/strict";
import { test } from "node:test";
import { battleSpriteClientRects, measureBattleUiReserveCanvas, rectsOverlap } from "./battle-layout-dom.ts";
import {
  computeBattleLayout,
  drawBattleFoeSprite,
  drawBattlePlayerSprite,
  spritesClearUiBand,
  spriteFeetY,
  stableBattleUiReserveTop,
  type BattleLayout,
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

test("side-view anchors place player lower-left and foe lower-right on one ground line", () => {
  const layout = computeBattleLayout(384, 512, stableBattleUiReserveTop(384, 512, 260), {
    stableReserve: true,
    presentation: "portrait",
  });
  assert.ok(layout.player.cx < layout.foe.cx, "player left of foe");
  assert.equal(layout.player.feetY, layout.groundY, "player feet touch the ground line");
  assert.equal(layout.foe.feetY, layout.groundY, "foe feet touch the same ground line");
  assert.ok(layout.groundY < layout.uiReserveTop, "creatures stand above the command dock");
  assert.ok(layout.player.targetHeight >= layout.foe.targetHeight, "player silhouette carries the nearer weight");
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

/**
 * Recording Canvas stub: the draw helpers only read a handful of 2D methods,
 * so a full browser context is unnecessary to pin the destination geometry.
 */
function recordingContext(): {
  ctx: CanvasRenderingContext2D;
  drawImage: unknown[][];
} {
  const drawImage: unknown[][] = [];
  const gradient = { addColorStop() {} };
  const ctx = {
    fillStyle: "",
    createRadialGradient: () => gradient,
    beginPath() {},
    ellipse() {},
    arc() {},
    fill() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    drawImage(...args: unknown[]) {
      drawImage.push(args);
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, drawImage };
}

const SQUARE_LAYOUT: BattleLayout = {
  presentation: "desktop",
  uiReserveTop: 200,
  uiReserveSource: "estimate",
  groundY: 173,
  statusPlayer: { x: 8, y: 20, w: 120, h: 30 },
  statusFoe: { x: 192, y: 20, w: 120, h: 30 },
  foe: { x: 100, y: 20, w: 100, h: 40, cx: 150, cy: 40, feetY: 60, targetHeight: 40 },
  player: { cx: 80, cy: 300, size: 120, scale: 0.7, feetY: 400, targetHeight: 120 },
};
const SQUARE_SOURCE = { naturalWidth: 64, naturalHeight: 64 } as unknown as CanvasImageSource;

/**
 * Regression: PR #38 fits a non-square foe rect to the source aspect ratio.
 * The AGES preview paint callback must inherit that same fitted rect — drawing
 * it into the raw `layout.foe` box would stretch imported sprites.
 */
test("preview paint for the foe uses the ground-anchored local rect, not the raw box", () => {
  const { ctx, drawImage } = recordingContext();
  const paint: number[][] = [];
  drawBattleFoeSprite(ctx, SQUARE_SOURCE, SQUARE_LAYOUT, 0, {}, (_ctx, x, y, w, h) => {
    paint.push([x, y, w, h]);
  });
  // Without measured alpha bounds, the fitted local rect is centered on the
  // ground anchor: target height 40, width 40, feet at local y=0.
  assert.deepEqual(paint, [[-20, -40, 40, 40]]);
  assert.equal(drawImage.length, 0, "paint replaces the static image");
});

test("static foe art is drawn into the same aspect-fit rect as preview paint", () => {
  const { ctx, drawImage } = recordingContext();
  drawBattleFoeSprite(ctx, SQUARE_SOURCE, SQUARE_LAYOUT, 0, {});
  assert.deepEqual(drawImage, [[SQUARE_SOURCE, 130, 20, 40, 40]]);
});

test("preview paint for the player is placed in the mirrored local space", () => {
  const { ctx } = recordingContext();
  const paint: number[][] = [];
  drawBattlePlayerSprite(ctx, undefined, SQUARE_LAYOUT, {}, (_ctx, x, y, w, h) => {
    paint.push([x, y, w, h]);
  });
  const half = SQUARE_LAYOUT.player.size / 2;
  // Feet sit at the local origin after the ground-anchored fit.
  assert.deepEqual(paint, [[-half, -SQUARE_LAYOUT.player.targetHeight, SQUARE_LAYOUT.player.size, SQUARE_LAYOUT.player.size]]);
});
