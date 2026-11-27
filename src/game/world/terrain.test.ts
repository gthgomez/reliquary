import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import * as junctions from "../render/road-junctions.ts";
import { bakeMapTerrain, chooseTileVariant, walkableEdgeMask } from "./terrain.ts";
import { makeElderhallCandidate } from "../maps/elderhall-candidate.ts";

test("chooseTileVariant is stable and independent of Math.random", () => {
  const a = chooseTileVariant("briar_road", 4, 7, "grass", 3);
  const b = chooseTileVariant("briar_road", 4, 7, "grass", 3);
  assert.equal(a, b);
  const original = Math.random;
  Math.random = () => 0.99;
  assert.equal(chooseTileVariant("briar_road", 4, 7, "grass", 3), a);
  Math.random = original;
});

test("walkableEdgeMask detects interior grass", () => {
  const map = MAPS.briar_road;
  const mask = walkableEdgeMask(map.ground, 10, 12);
  assert.ok(mask > 0);
});

test("bakeMapTerrain invokes decoration callbacks", () => {
  const map = MAPS.elderhall;
  let deco = 0;
  let tiles = 0;
  let accents = 0;
  bakeMapTerrain({
    map,
    tileSize: 32,
    drawTile: () => {
      tiles += 1;
    },
    drawOverlay: () => {},
    drawDecoration: () => {
      deco += 1;
    },
    drawAccent: () => {
      accents += 1;
    },
  });
  assert.ok(tiles > 0);
  assert.ok(deco > 0, "decorations and tallgrass should draw");
  assert.ok(accents > 0, "ground accents should scatter on walkable tiles");
});

test("candidate village and Grove terrain dapple stays sparse and deterministic", () => {
  for (const map of [makeElderhallCandidate(MAPS.elderhall), MAPS.grove]) {
    const variations: string[] = [];
    bakeMapTerrain({ map, tileSize: 32, candidateTerrain: true, drawTile: () => {},
      drawOverlay: (style, x, y) => { if (style === "variation") variations.push(`${x},${y}`); }, drawDecoration: () => {} });
    const repeated: string[] = [];
    bakeMapTerrain({ map, tileSize: 32, candidateTerrain: true, drawTile: () => {},
      drawOverlay: (style, x, y) => { if (style === "variation") repeated.push(`${x},${y}`); }, drawDecoration: () => {} });
    assert.ok(variations.length > 0 && variations.length < 60, `${map.id} receives sparse ground tinting`);
    assert.deepEqual(repeated, variations, `${map.id} dapple positions are stable across bakes`);
  }
});

test("the Grove bakes one continuous grass surface and leaves its open edges untinted", () => {
  const grassVariants = new Set<number>();
  let edgeBlocks = 0;
  bakeMapTerrain({
    map: MAPS.grove!,
    tileSize: 32,
    drawTile: (name, _x, _y, variant) => {
      if (name === "grass") grassVariants.add(variant);
    },
    drawOverlay: () => { edgeBlocks += 1; },
    drawDecoration: () => {},
  });
  assert.deepEqual([...grassVariants], [0]);
  assert.equal(edgeBlocks, 0);
});

test("the Grove's rounded joins stay inside the walkable clearing and clear of starters", () => {
  assert.deepEqual(junctions.dirtPathJunctions(MAPS.grove!), [
    { x: 13, y: 6, dx: 1, dy: 1 },
    { x: 5, y: 8, dx: 1, dy: -1 },
  ]);
});

test("woodland terrain marks only active encounter ground and removes square edge accents", () => {
  const map = {
    ...MAPS.briar_road!,
    ground: ["p,.", "p,,"],
    encounterRegions: [{ id: "safe", x: 2, y: 1, w: 1, h: 1, tiles: [","], rate: 0, encounters: [] }],
    decorations: [],
  };
  const active: number[][] = [];
  const original: number[][] = [];
  const overlays: string[] = [];
  bakeMapTerrain({ map, tileSize: 32,
    woodlandTerrain: { drawEncounter: (x, y) => active.push([x, y]) },
    drawTile: () => {}, drawOverlay: (style) => overlays.push(style), drawDecoration: () => {} });
  bakeMapTerrain({ map, tileSize: 32, drawTile: () => {}, drawOverlay: () => {},
    drawDecoration: (_sprite, x, y) => original.push([x, y]) });
  assert.deepEqual(active, [[32, 0], [32, 32]]);
  assert.deepEqual(original, [[32, 0], [32, 32], [64, 32]]);
  assert.equal(overlays.includes("edge"), false);
});

test("Mirefen's clipped trail joins both ends of the plank bridge", () => {
  const pathMasks = new Map<number, number>();
  const overlays: string[] = [];
  bakeMapTerrain({ map: MAPS.mirefen!, tileSize: 32, chapterRouteTerrain: true,
    drawTile: (name, x, y, _variant, mask) => {
      if (name === "dirt" && y === 7 * 32 && mask !== undefined) pathMasks.set(x / 32, mask);
    },
    drawOverlay: (style) => overlays.push(style), drawDecoration: () => {} });
  assert.ok((pathMasks.get(7) ?? 0) & 2, "west trail connects east into the bridge");
  assert.ok((pathMasks.get(12) ?? 0) & 8, "east trail connects west into the bridge");
  assert.equal(overlays.includes("edge"), false, "hand-painted shore has no dark square overlay");
});
