import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { makeElderhallCandidate } from "../maps/elderhall-candidate.ts";
import { bakeMapTerrain } from "../world/terrain.ts";
import { elderhallRoadJunctions, paintElderhallRoadJunctions } from "./elderhall-visual.ts";
import { resolveWorldPropLayout } from "./world-actors.ts";

function corner(dx: -1 | 1, dy: -1 | 1) {
  const ground = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => "."));
  ground[2]![2 + dx] = "p";
  ground[2 + dy]![2] = "p";
  ground[2 + dy]![2 + dx] = "p";
  return { ...MAPS.elderhall, ground: ground.map((row) => row.join("")), objects: [], decorations: [] };
}

test("all four simple dirt insets get exactly one corresponding rounded junction", () => {
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    assert.deepEqual(elderhallRoadJunctions(corner(dx, dy)), [{ x: 2, y: 2, dx, dy }]);
  }
});

test("junctions reject other surfaces, disconnected diagonals, branches, scenery, and noncandidate terrain styles", () => {
  const base = corner(-1, -1);
  const update = (map: typeof base, x: number, y: number, symbol: string) => {
    const rows = map.ground.map((row) => [...row]); rows[y]![x] = symbol;
    return { ...map, ground: rows.map((row) => row.join("")) };
  };
  for (const map of [update(base, 2, 2, ","), update(base, 1, 1, "."), update(base, 3, 2, "p"), update(base, 3, 1, "c"),
    { ...base, id: "grove" }, { ...base, roadBorder: undefined },
    { ...base, objects: [{ ...MAPS.elderhall.objects[0]!, x: 2, y: 2, w: 1, h: 1 }] },
    { ...base, decorations: [{ sprite: "flowers", x: 2.1, y: 2.1, w: 0.5, h: 0.5, layer: "ground" as const }] },
    { ...base, decorations: [{ sprite: "flowers", x: 1.9, y: 1.9, w: 0.05, h: 0.05, layer: "ground" as const }] },
  ]) assert.deepEqual(elderhallRoadJunctions(map), []);
});

test("the candidate's well apron is excluded while unoccupied village corners are found", () => {
  const map = makeElderhallCandidate(MAPS.elderhall);
  const before = JSON.stringify(map);
  const joins = elderhallRoadJunctions(map);
  assert.ok(joins.some(({ x, y }) => x === 8 && y === 9), "the western crossroads remains rounded");
  assert.ok(joins.some(({ x, y }) => x === 9 && y === 12));
  assert.ok(!joins.some(({ x, y }) => x === 12 && y === 6), "the relocated gate post remains protected");
  assert.ok(!joins.some(({ x, y }) => x === 12 && y === 8), "no repaint beside the cobble apron");
  assert.equal(JSON.stringify(map), before, "visual junction selection does not alter map or collision data");
});

test("gate positions at y=0 and y=3 conservatively protect their occupied art and posts", () => {
  const candidate = makeElderhallCandidate(MAPS.elderhall);
  const withGateY = (y: number) => ({ ...candidate, objects: candidate.objects.map((obj) =>
    obj.id === "north_gate_candidate" ? { ...obj, y } : obj) });
  const gateY0 = withGateY(0), gateY3 = withGateY(3);
  for (const [x, y] of [[12, 4], [12, 6]]) {
    assert.ok(elderhallRoadJunctions(gateY0).some((join) => join.x === x && join.y === y), `y=0 gate leaves ${x},${y} open`);
    assert.ok(!elderhallRoadJunctions(gateY3).some((join) => join.x === x && join.y === y), `y=3 gate protects ${x},${y}`);
  }
  const gate = gateY3.objects.find((obj) => obj.id === "north_gate_candidate")!;
  const visible = resolveWorldPropLayout(gate, 1);
  // Both candidate repaint rectangles overlap the image bounds; the lower one
  // also overlaps the east post's actual solid collision footprint.
  for (const [top, bottom] of [[4.5, 5.25], [5.75, 6.5]]) {
    assert.ok(visible.x < 12.5 && visible.x + visible.width > 11.75 && visible.y < bottom! && visible.y + visible.height > top!);
  }
  assert.ok(gate.collision!.some((box) => gate.x + box.x < 12.5 && gate.x + box.x + box.w > 11.75 &&
    gate.y + box.y < 6.5 && gate.y + box.y + box.h > 5.75));
});

test("each clipped join repaints four original atlas tiles and a stone outline", () => {
  const calls: string[] = [];
  const context = {
    save() { calls.push("save"); }, restore() { calls.push("restore"); }, translate() {}, scale() {},
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() { calls.push("curve"); }, closePath() {},
    clip() { calls.push("clip"); }, drawImage() { calls.push("atlas"); },
    setLineDash() {}, stroke() { calls.push("stroke"); },
  } as unknown as CanvasRenderingContext2D;
  paintElderhallRoadJunctions(context, corner(-1, -1), 32, {} as CanvasImageSource);
  assert.equal(calls.filter((call) => call === "atlas").length, 4);
  assert.equal(calls.filter((call) => call === "stroke").length, 2);
  assert.ok(calls.indexOf("clip") < calls.indexOf("atlas"));
  assert.equal(calls.at(-1), "restore");
});

test("rotated curved edges meet the old straight borders with matching endpoints and tangents", () => {
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    let matrix = { a: 1, d: 1, e: 0, f: 0 };
    const stack: typeof matrix[] = [], curves: number[][] = [], starts: number[][] = [];
    let currentStart: number[] = [];
    const point = (x: number, y: number) => [matrix.a * x + matrix.e, matrix.d * y + matrix.f];
    const context = {
      save() { stack.push({ ...matrix }); }, restore() { matrix = stack.pop()!; },
      translate(x: number, y: number) { matrix.e += matrix.a * x; matrix.f += matrix.d * y; },
      scale(x: number, y: number) { matrix.a *= x; matrix.d *= y; },
      beginPath() {}, moveTo(x: number, y: number) { currentStart = point(x, y); }, lineTo() {},
      quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
        starts.push(currentStart); curves.push([...point(cx, cy), ...point(x, y)]);
      }, closePath() {}, clip() {}, setLineDash() {}, stroke() {},
      drawImage() { assert.deepEqual(matrix, { a: 1, d: 1, e: 0, f: 0 }, "atlas texture is never mirrored"); },
    } as unknown as CanvasRenderingContext2D;
    paintElderhallRoadJunctions(context, corner(dx, dy), 32, {} as CanvasImageSource);
    const ox = (2 + (dx > 0 ? 1 : 0)) * 32, oy = (2 + (dy > 0 ? 1 : 0)) * 32;
    assert.deepEqual(starts[1], [ox - dx * 16, oy + dy * 4]);
    assert.deepEqual(curves[1], [ox + dx * 4, oy + dy * 4, ox + dx * 4, oy - dy * 16]);
    assert.deepEqual(matrix, { a: 1, d: 1, e: 0, f: 0 }, "the painter restores the caller's transform");
  }
});

test("the terrain bake runs junctions after tiles and before placed ground decorations", () => {
  const calls: string[] = [];
  const map = { ...corner(-1, -1), decorations: [{ sprite: "flowers", x: 0, y: 0, w: 1, h: 1, layer: "ground" as const }] };
  bakeMapTerrain({ map, tileSize: 32, drawTile: () => calls.push("tile"), drawOverlay: () => {},
    drawDecoration: () => calls.push("decoration"), drawJunctions: () => calls.push("junctions") });
  assert.equal(calls.filter((call) => call === "junctions").length, 1);
  assert.ok(calls.lastIndexOf("tile") < calls.indexOf("junctions"));
  assert.ok(calls.indexOf("junctions") < calls.indexOf("decoration"));
});

test("the real engine bakes and caches preview junctions only when both candidate atlases are loaded", () => {
  const script = `
    import assert from "node:assert/strict";
    import { ReliquaryGame } from "./src/game/engine.ts";
    import { MAPS } from "./src/game/maps.ts";
    import { elderhallRoadJunctions } from "./src/game/render/elderhall-visual.ts";
    let strokes = 0, images = 0;
    const ground = { drawImage() { images++; }, fillRect() {}, save() {}, restore() {}, beginPath() {}, moveTo() {},
      lineTo() {}, quadraticCurveTo() {}, closePath() {}, rect() {}, clip() {}, translate() {}, scale() {},
      setLineDash() {}, stroke() { strokes++; } };
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ground }) };
    const screen = { drawImage() {}, fillRect() {}, save() {}, restore() {} };
    const game = new ReliquaryGame(); game.mode = "world"; game.mapId = "elderhall";
    game.images["tile_elderhall-dirt-atlas"] = {};
    game.images["tile_elderhall-grass-atlas"] = {};
    game.drawWorld(screen);
    const joins = elderhallRoadJunctions(MAPS.elderhall).length;
    assert.ok(joins >= 6, "both current and proposed gate positions retain other rounded joins");
    const expected = process.env.VITE_ELDERHALL_CANDIDATE === "1" ? 2 * joins : 0;
    assert.equal(strokes, expected);
    const firstImages = images; game.drawWorld(screen);
    assert.equal(images, firstImages, "cached terrain is reused between frames");
    game.terrain = null; delete game.images["tile_elderhall-grass-atlas"]; strokes = 0;
    game.drawWorld(screen); assert.equal(strokes, 0, "missing candidate atlas uses the original path rendering");
  `;
  for (const enabled of ["0", "1"]) execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script],
    { cwd: process.cwd(), env: { ...process.env, VITE_ELDERHALL_CANDIDATE: enabled }, stdio: "pipe" });
});
