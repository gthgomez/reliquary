import assert from "node:assert/strict";
import { test } from "node:test";
import { paintWorldPropShadow, resolveWorldPropLayout, shouldFadePropForPlayer, worldPropCullBounds } from "./world-actors.ts";
import type { MapObj } from "../types.ts";
import * as worldActors from "./world-actors.ts";
import * as elderhallVisual from "./elderhall-visual.ts";

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

test("gate posts and beam have separate, complete art regions at the same ground contact", () => {
  const gate = elderhallVisual.elderhallCandidateGate();
  const visual = resolveWorldPropLayout(gate, 32);
  const parts = elderhallVisual.elderhallGateRenderRegions(visual);
  assert.deepEqual(parts.map((part) => part.kind), ["left-post", "overhang", "right-post"]);
  assert.equal(parts[0]!.left, 0);
  assert.equal(parts[0]!.right, parts[1]!.left);
  assert.equal(parts[1]!.right, parts[2]!.left);
  assert.equal(parts[2]!.right, 1);
  assert.ok(parts.every((part) => part.baseline === visual.baseline));
  assert.deepEqual(parts.map((part) => part.revealBottom), [0.88, 1, 0.88], "post bases stay opaque");
  assert.ok(parts[1]!.left * visual.width + visual.x < 10 * 32, "arch includes the left open lane");
  assert.ok(parts[1]!.right * visual.width + visual.x > 12 * 32, "arch includes the right open lane");
});

test("depth follows fractional feet positions with stable ties", () => {
  const entries = [
    { y: 200, priority: 0, id: "post-right" },
    { y: 200.01, priority: 2, id: "player-front" },
    { y: 199.99, priority: 2, id: "player-behind" },
    { y: 200, priority: 2, id: "player-tied" },
    { y: 200, priority: 0, id: "post-left" },
  ];
  assert.deepEqual(entries.sort(worldActors.compareWorldDepth).map((entry) => entry.id),
    ["player-behind", "post-left", "post-right", "player-tied", "player-front"]);
});

test("only an upper overhang is eligible for a local reveal", () => {
  const visual = { x: 0, y: 0, width: 100, height: 100, baseline: 100 };
  const roof = worldActors.worldPropOverhang("elderhall-cottage-reference", visual);
  assert.ok(roof && roof.height < visual.height);
  const tree = worldActors.worldPropOverhang("elderhall-tree-reference", visual);
  assert.equal(tree?.height, 80, "the candidate tree reveal reaches its lower side foliage");
  assert.equal(worldActors.worldPropOverhang("elderhall-bench", visual), null);
  assert.equal(worldActors.worldPropOverhang("barrel", visual), null);
  assert.equal(shouldFadePropForPlayer(roof, { x: 20, y: 10, width: 20, height: 40, baseline: 80 }), true);
  assert.equal(shouldFadePropForPlayer(roof, { x: 20, y: 70, width: 20, height: 20, baseline: 90 }), false);
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

test("new guild and shop shadows stay grounded beneath their sprite foundations", () => {
  for (const sprite of ["elderhall-guild-reference", "elderhall-shop-reference"]) {
    let ellipse: number[] = [];
    const canvas = { fillStyle: "", beginPath() {}, ellipse(...args: number[]) { ellipse = args; }, fill() {} } as unknown as CanvasRenderingContext2D;
    paintWorldPropShadow(canvas, sprite, 0, 0, 96, 96);
    assert.ok(ellipse[3]! <= 2.5, `${sprite} shadow height ${ellipse[3]}`);
    assert.ok(Math.abs(ellipse[1]! - 92.6) < 2, `${sprite} foundation y=${ellipse[1]}`);
    assert.equal(canvas.fillStyle, "rgba(0,0,0,0.14)");
  }
});
