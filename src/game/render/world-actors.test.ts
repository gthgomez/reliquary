import assert from "node:assert/strict";
import { test } from "node:test";
import { paintWorldPropShadow, resolveWorldPropLayout, shouldFadePropForPlayer, worldPropCullBounds } from "./world-actors.ts";
import type { MapObj } from "../types.ts";

test("a prop's visible ground contact lands on its logical footprint", () => {
  const well: MapObj = { id: "well", sprite: "well", x: 8, y: 10, w: 1, h: 1, foot: 1, solid: true };
  const layout = resolveWorldPropLayout(well, 32);
  assert.equal(layout.baseline, 11 * 32);
  assert.equal(layout.y + layout.height * (33 / 48), layout.baseline);
  assert.equal(layout.x + layout.width / 2, 8.5 * 32);
});

test("the shipped tree trunk and its shadow meet the ground despite transparent source padding", () => {
  const tree: MapObj = { id: "tree", sprite: "tree", x: 2, y: 3, w: 2, h: 2, foot: 1, solid: true };
  const layout = resolveWorldPropLayout(tree, 32);
  assert.equal(layout.y + layout.height * (115 / 128), layout.baseline);
  let ellipse: number[] = [];
  const canvas = { fillStyle: "", beginPath() {}, ellipse(...args: number[]) { ellipse = args; }, fill() {} } as unknown as CanvasRenderingContext2D;
  paintWorldPropShadow(canvas, "tree", layout.x, layout.y, layout.width, layout.height);
  assert.ok(Math.abs(ellipse[1]! - layout.baseline) <= 2);
});

test("visual size and anchor can differ from collision and interaction bounds", () => {
  const obj: MapObj = {
    id: "tree", sprite: "tree", x: 2, y: 3, w: 1, h: 1, foot: 1, solid: true,
    visual: { width: 3, height: 4, anchorX: 0.5, anchorY: 0.875, groundX: 0.5, groundY: 1 },
  };
  const layout = resolveWorldPropLayout(obj, 32);
  assert.deepEqual(layout, { x: 32, y: 16, width: 96, height: 128, baseline: 128 });
  assert.equal(obj.w, 1);
  assert.equal(obj.h, 1);
});

test("a foreground prop fades only when it overlaps the player", () => {
  const tree = { x: 90, y: 50, width: 100, height: 130, baseline: 180 };
  assert.equal(shouldFadePropForPlayer(tree, { x: 120, y: 90, width: 32, height: 48, baseline: 138 }), true);
  assert.equal(shouldFadePropForPlayer(tree, { x: 220, y: 90, width: 32, height: 48, baseline: 138 }), false);
  assert.equal(shouldFadePropForPlayer(tree, { x: 120, y: 160, width: 32, height: 48, baseline: 208 }), false);
});

test("culling retains solid fallback footprints extending beyond the sprite", () => {
  const obj: MapObj = { id: "gate", sprite: "gate", x: 9, y: 0, w: 4, h: 4, foot: 1, solid: true };
  const bounds = worldPropCullBounds(obj, { x: 280, y: 8, width: 144, height: 100, baseline: 104 }, 32);
  assert.equal(bounds.bottom, 128);
  assert.equal(bounds.top, 0);
});

test("well shadow meets the visible base instead of the transparent image margin", () => {
  let ellipse: number[] = [];
  const canvas = { fillStyle: "", beginPath() {}, ellipse(...args: number[]) { ellipse = args; }, fill() {} } as unknown as CanvasRenderingContext2D;
  paintWorldPropShadow(canvas, "well", 0, 0, 48, 48);
  // The shipped 48px sprite's opaque base is centered near x=20.5, y=33.
  assert.ok(Math.abs(ellipse[0]! - 20.5) < 3, `shadow center x=${ellipse[0]}`);
  assert.ok(Math.abs(ellipse[1]! - 33) < 3, `shadow base y=${ellipse[1]}`);
});

test("boulder shadow meets the sprite's visible bottom", () => {
  let ellipse: number[] = [];
  const canvas = { fillStyle: "", beginPath() {}, ellipse(...args: number[]) { ellipse = args; }, fill() {} } as unknown as CanvasRenderingContext2D;
  paintWorldPropShadow(canvas, "boulder", 0, 0, 48, 48);
  assert.ok(Math.abs(ellipse[0]! - 22) < 3);
  assert.ok(Math.abs(ellipse[1]! - 35) < 3);
});

test("a building shadow stays shallow and subtle beneath its foundation", () => {
  let ellipse: number[] = [];
  const canvas = { fillStyle: "", beginPath() {}, ellipse(...args: number[]) { ellipse = args; }, fill() {} } as unknown as CanvasRenderingContext2D;
  paintWorldPropShadow(canvas, "cottage", 0, 0, 96, 96);
  assert.ok(ellipse[3]! <= 2.5, `shadow height ${ellipse[3]}`);
  assert.equal(canvas.fillStyle, "rgba(0,0,0,0.14)");
});
