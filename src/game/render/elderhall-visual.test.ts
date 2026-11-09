import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { elderhallCandidateObject, elderhallTerrainAtlas, elderhallCandidateGate, elderhallCandidateBench, candidateVisualFromMetadata, paintCandidateGateFallback } from "./elderhall-visual.ts";
import { resolveWorldPropLayout } from "./world-actors.ts";
import { isOccupied } from "../world/movement.ts";

test("candidate art changes drawing geometry without moving the original well collision", () => {
  const well = MAPS.elderhall.objects.find((object) => object.id === "well")!;
  const candidate = elderhallCandidateObject("elderhall", well, true);
  assert.equal(candidate.sprite, "elderhall-well-reference");
  assert.deepEqual({ x: candidate.x, y: candidate.y, w: candidate.w, h: candidate.h, foot: candidate.foot }, { x: well.x, y: well.y, w: well.w, h: well.h, foot: well.foot });
  const layout = resolveWorldPropLayout(candidate, 32);
  assert.equal(layout.y + layout.height * (156 / 160), layout.baseline);
  assert.equal(elderhallCandidateObject("grove", well, true), well);
  assert.equal(elderhallCandidateObject("elderhall", well, false), well);
});

test("guild and shop use distinct preview art without changing gameplay footprints", () => {
  for (const [id, sprite] of [["h_guild", "elderhall-guild-reference"], ["h_shop", "elderhall-shop-reference"]] as const) {
    const object = MAPS.elderhall.objects.find((item) => item.id === id)!;
    const candidate = elderhallCandidateObject("elderhall", object, true);
    assert.equal(candidate.sprite, sprite);
    assert.deepEqual({ x: candidate.x, y: candidate.y, w: candidate.w, h: candidate.h, foot: candidate.foot, interact: candidate.interact },
      { x: object.x, y: object.y, w: object.w, h: object.h, foot: object.foot, interact: object.interact });
    assert.equal(elderhallCandidateObject("elderhall", object, false), object);
    assert.equal(elderhallCandidateObject("grove", object, true), object);
  }
});

test("the preview gate keeps the two northern routes open", () => {
  const map = { ...MAPS.elderhall, objects: [...MAPS.elderhall.objects, elderhallCandidateGate()] };
  assert.equal(isOccupied(map, {}, 9, 6), true);
  assert.equal(isOccupied(map, {}, 12, 6), true);
  assert.equal(isOccupied(map, {}, 10, 6), false);
  assert.equal(isOccupied(map, {}, 11, 6), false);
  assert.ok(resolveWorldPropLayout(elderhallCandidateGate(), 32).y >= 3 * 32,
    "the arch begins below the top three map rows, rather than under the opening HUD");
});

test("the village bench has a visible solid footprint away from the spawn", () => {
  const bench = elderhallCandidateBench();
  const map = { ...MAPS.elderhall, objects: [...MAPS.elderhall.objects, bench] };
  assert.equal(isOccupied(map, {}, bench.x, bench.y), true);
  assert.equal(isOccupied(map, {}, map.spawn.x, map.spawn.y), false);
  assert.equal(bench.sprite, "elderhall-bench");
});

test("candidate placement reads the image dimensions, anchor and authored size from metadata", () => {
  const object = MAPS.elderhall.objects.find((o) => o.id === "well")!;
  const visual = candidateVisualFromMetadata(object, { dimensions: [200, 100], anchor: [50, 75], render_size_tiles: [4, 2] }, 0.5);
  assert.deepEqual(visual, { width: 2, height: 1, anchorX: 0.25, anchorY: 0.75, groundX: 0.5, groundY: 1 });
});

test("if gate art fails, its solid posts remain visibly marked", () => {
  const rectangles: number[][] = [];
  const ctx = { fillStyle: "", fillRect(...args: number[]) { rectangles.push(args); } } as unknown as CanvasRenderingContext2D;
  paintCandidateGateFallback(ctx, elderhallCandidateGate(), 0, 0, 32);
  assert.ok(rectangles.some(([x, y]) => x === 9 * 32 && y === 6 * 32));
  assert.ok(rectangles.some(([x, y]) => x === 12 * 32 && y === 6 * 32));
});

test("Elderhall terrain uses candidate atlases only when explicitly enabled", () => {
  assert.equal(elderhallTerrainAtlas("elderhall", "grass", true), "tile_elderhall-grass-atlas");
  assert.equal(elderhallTerrainAtlas("elderhall", "cobble", true), "tile_elderhall-stone-atlas");
  assert.equal(elderhallTerrainAtlas("grove", "grass", true), null);
  assert.equal(elderhallTerrainAtlas("elderhall", "grass", false), null);
});
