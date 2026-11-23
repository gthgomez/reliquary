import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseTileAccent, tileAtlasQuadrant, roadBorderEdges, roadBorderCorners, paintStoneRoadBorder, paintCottageRug, clipSoftPath } from "./tile-surface.ts";
import { MAPS } from "../maps.ts";
import { isElderhallCandidateBuild } from "../build-flags.ts";
import { makeElderhallCandidateInterior } from "../maps/elderhall-candidate.ts";

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
  const ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, clip() {}, fillStyle: "", fillRect(...args: number[]) { rects.push(args); } } as unknown as CanvasRenderingContext2D;
  paintStoneRoadBorder(ctx, 0, 0, 32, 255 & ~16);
  assert.ok(rects.some(([x, y, w, h]) => x! + w! >= 31 && y === 0 && h! > 0), "horizontal cap reaches the seam");
  assert.ok(rects.some(([x, y, _w, h]) => x! >= 28 && y === 0 && y! + h! >= 4), "vertical cap covers the exposed step");
  assert.ok(rects.every((rect) => rect.every(Number.isInteger)), "stone geometry aligns to source pixels");
});

test("road edging uses visible stones rather than thin dashed strokes", () => {
  const rects: number[][] = [];
  const colors: string[] = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, clip() {},
    set fillStyle(value: string) { colors.push(value); }, fillRect(...args: number[]) { rects.push(args); } } as unknown as CanvasRenderingContext2D;
  paintStoneRoadBorder(ctx, 0, 0, 32, 245); // north/south connected, east/west exposed
  assert.ok(rects.some(([, , w, h]) => w! >= 4 && h! >= 7), "each vertical stone has a substantial footprint");
  assert.ok(colors.includes("#8f8a77"), "the stone face uses a softer, earthier palette");
  assert.ok(colors.includes("rgba(225,215,190,.2)"), "the highlight is subdued");
});

test("cottage rug stays off the walk-through threshold and leaves gameplay geometry unchanged", () => {
  const rects: number[][] = [];
  const ctx = { save() {}, restore() {}, fillStyle: "", fillRect(...args: number[]) { rects.push(args); } } as unknown as CanvasRenderingContext2D;
  paintCottageRug(ctx, 32);
  assert.deepEqual(rects[0], [96, 168, 64, 40], "flat textile stays beside the authored hearth");
  assert.ok(rects.every((rect) => rect.every(Number.isInteger)), "all rug rectangles align to source pixels");
  assert.ok(rects.every(([x, y, w, h]) => x! >= 96 && x! + w! <= 160 && y! >= 168 && y! + h! <= 208),
    "rug stays beside the hearth and clear of the x=5 doorway lane");
  assert.ok(rects.some(([, , w, h]) => w === 2 && h === 1) && rects.some(([, , w, h]) => w === 1 && h === 2),
    "small horizontal and vertical woven marks form a flat textile pattern");
  const home = MAPS.home;
  assert.deepEqual(home.spawn, { x: 5, y: 7 });
  assert.deepEqual(home.warps[0], { x: 5, y: 8, to: "elderhall", tx: isElderhallCandidateBuild() ? 5 : 4, ty: 15, dir: 0 });
  const candidateHome = makeElderhallCandidateInterior({ ...home, warps: home.warps.map((warp) => ({ ...warp, tx: 4 })) });
  assert.equal(candidateHome.warps[0]!.tx, 5, "revision 5 returns to its independently anchored painted doorway");
  assert.deepEqual(home.objects.map(({ id, x, y, solid }) => ({ id, x, y, solid })), [
    { id: "bed", x: 2, y: 2, solid: true }, { id: "table", x: 5, y: 3, solid: true },
    { id: "chair", x: 6, y: 3, solid: true }, { id: "books", x: 8, y: 1, solid: true },
    { id: "hearth", x: 2, y: 5, solid: true },
  ]);
});

test("a path curves at exposed and concave corners", () => {
  let curves = 0;
  const ctx = { beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() { curves++; }, closePath() {}, clip() {} } as unknown as CanvasRenderingContext2D;
  clipSoftPath(ctx, 0, 0, 32, 255 & ~16);
  assert.ok(curves > 0, "missing north-east diagonal produces a curved join");
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
