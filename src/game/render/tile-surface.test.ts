import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseTileAccent, tileAtlasQuadrant, roadBorderEdges, roadBorderCorners, paintStoneRoadBorder } from "./tile-surface.ts";

test("stone borders appear only where the road meets its surroundings", () => {
  assert.equal(roadBorderEdges(15), 0, "a road interior has no borders");
  assert.equal(roadBorderEdges(5), 10, "a north-south road is edged on the east and west");
  assert.equal(roadBorderEdges(7), 8, "a T-junction has no border across a connected arm");
  assert.equal(roadBorderEdges(3), 12, "a turn has borders only on its exposed sides");
});

test("a concave road junction gets a cap at its missing diagonal", () => {
  assert.equal(roadBorderCorners(255), 0, "a solid 3x3 road has no corner caps");
  assert.equal(roadBorderCorners(255 & ~16), 16, "the missing north-east diagonal exposes a corner");
  assert.equal(roadBorderCorners((255 & ~16) & ~2), 0, "an exposed east edge is handled by its straight border");
});

test("the exposed junction corner paints a bridge across the tile seam", () => {
  const rects: number[][] = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, fillStyle: "", fillRect(...args: number[]) { rects.push(args); } } as unknown as CanvasRenderingContext2D;
  paintStoneRoadBorder(ctx, 0, 0, 32, 255 & ~16);
  assert.ok(rects.some(([x, y, w, h]) => x! + w! >= 31 && y === 0 && h! > 0), "horizontal cap reaches the seam");
  assert.ok(rects.some(([x, y, _w, h]) => x! >= 30 && y === 0 && y! + h! >= 4), "vertical cap covers the exposed step");
  assert.ok(rects.every((rect) => rect.every(Number.isInteger)), "stone geometry aligns to source pixels");
});

test("tileAtlasQuadrant is stable per tile coordinate", () => {
  const a = tileAtlasQuadrant(2, 4, 7);
  const b = tileAtlasQuadrant(2, 4, 7);
  assert.equal(a, b);
  assert.ok(a >= 0 && a <= 3);
});

test("chooseTileAccent prefers blades in tall grass", () => {
  assert.equal(chooseTileAccent("wildwood", 2, 2, ","), "blade");
});

test("chooseTileAccent never returns on blocking tiles", () => {
  assert.equal(chooseTileAccent("wildwood", 1, 1, "#"), null);
  assert.equal(chooseTileAccent("wildwood", 1, 1, "w"), null);
});
