import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FULL_SPRITE_BOUNDS,
  fittedSpriteLocalRect,
  placeSpriteOnGround,
} from "./sprite-bounds.ts";

// Real Briarling sheet: 256x256 with the opaque silhouette at 50..205 x 21..255.
const BRIARLING = { x: 50 / 256, y: 21 / 256, w: 156 / 256, h: 235 / 256 };

test("placing a sprite puts opaque feet exactly on the ground line", () => {
  const placement = placeSpriteOnGround({
    srcW: 256,
    srcH: 256,
    bounds: BRIARLING,
    anchorX: 200,
    feetY: 300,
    targetHeight: 100,
  });
  assert.ok(Math.abs(placement.height - 100) < 0.001, `silhouette height ${placement.height}`);
  assert.ok(Math.abs(placement.feetY - 300) < 0.001);
  assert.ok(Math.abs(placement.drawY + BRIARLING.y * placement.drawH + BRIARLING.h * placement.drawH - 300) < 0.001);
  assert.ok(Math.abs(placement.centerX - 200) < 0.001);
  assert.ok(Math.abs(placement.width - (156 / 235) * 100) < 0.001, `silhouette width ${placement.width}`);
});

test("mirroring keeps the same ground contact and silhouette size", () => {
  const base = placeSpriteOnGround({
    srcW: 256,
    srcH: 256,
    bounds: BRIARLING,
    anchorX: 120,
    feetY: 240,
    targetHeight: 88,
  });
  const mirrored = placeSpriteOnGround({
    srcW: 256,
    srcH: 256,
    bounds: BRIARLING,
    anchorX: 120,
    feetY: 240,
    targetHeight: 88,
    mirror: true,
  });
  assert.equal(mirrored.feetY, base.feetY);
  assert.equal(mirrored.width, base.width);
  assert.equal(mirrored.height, base.height);
  assert.ok(Math.abs(mirrored.centerX - base.centerX) < 0.001);
});

test("full-sheet fallback preserves the old centered drawing area", () => {
  const placement = placeSpriteOnGround({
    srcW: 64,
    srcH: 64,
    bounds: FULL_SPRITE_BOUNDS,
    anchorX: 100,
    feetY: 200,
    targetHeight: 50,
  });
  assert.equal(placement.drawW, 50);
  assert.equal(placement.drawH, 50);
  assert.equal(placement.drawX, 75);
  assert.equal(placement.drawY, 150);
});

test("local preview rect shares the alpha fit and cannot stretch", () => {
  const local = fittedSpriteLocalRect(256, 256, BRIARLING, 100);
  assert.ok(Math.abs(local.x + BRIARLING.x * local.w + (BRIARLING.w * local.w) / 2) < 0.001);
  assert.ok(Math.abs(local.y + (BRIARLING.y + BRIARLING.h) * local.h) < 0.001);
});
