import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { isOccupied } from "./movement.ts";
import { reachableTiles } from "./reachability.ts";
import { bakeMapTerrain } from "./terrain.ts";
import { roadBorderCorners } from "../render/tile-surface.ts";
import { elderhallBase } from "../maps/registry.ts";
import { makeElderhallCandidate } from "../maps/elderhall-candidate.ts";

const revisionMaps = [
  { revision: 2, map: elderhallBase, doorXs: { h_home: 4, h_guild: 4, h_inn: 16, h_shop: 16 } },
  { revision: 5, map: makeElderhallCandidate(elderhallBase), doorXs: { h_home: 5, h_guild: 5, h_inn: 16, h_shop: 17 } },
] as const;

function roadTiles(map: typeof elderhallBase): Set<string> {
  const path = new Set<string>();
  for (let y = 0; y < map.ground.length; y++) {
    for (let x = 0; x < map.ground[y]!.length; x++) {
      if (map.ground[y]![x] === "p" || map.ground[y]![x] === "c") path.add(`${x},${y}`);
    }
  }
  return path;
}

test("Elderhall roads connect each doorway and both exits without isolated paving", () => {
  for (const { revision, map, doorXs } of revisionMaps) {
    const path = roadTiles(map);
    const queue = ["10,0"];
    const connected = new Set(queue);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i]!.split(",").map(Number) as [number, number];
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        const key = `${nx},${ny}`;
        if (path.has(key) && !connected.has(key)) { connected.add(key); queue.push(key); }
      }
    }
    assert.equal(connected.size, path.size, `revision ${revision}: every road tile belongs to the same network`);
    const reachable = reachableTiles(map, map.spawn, {});
    for (const id of ["h_home", "h_guild", "h_inn", "h_shop"] as const) {
      const house = map.objects.find((object) => object.id === id)!;
      const doorX = doorXs[id];
      const visibleBaseY = house.y + house.h - 1;
      const approachY = house.y + house.h;
      assert.equal(map.ground[visibleBaseY]![doorX], "p", `revision ${revision}: ${id} road lies beneath the painted door`);
      assert.ok(path.has(`${doorX},${approachY}`), `revision ${revision}: ${id} has a road at its actual door approach`);
      assert.ok(reachable.has(`${doorX},${approachY}`), `revision ${revision}: ${id} approach can be reached`);
    }
    for (const warp of map.warps) assert.ok(reachable.has(`${warp.x},${warp.y}`), `revision ${revision}: ${warp.to} exit can be reached`);
    if (revision === 2) assert.equal(map.ground[3]!.slice(4, 7), "...", "the unused cobblestone pad is gone");
  }
});

test("the north-east corner of the guild-road junction has a border cap", () => {
  let mask = 0;
  bakeMapTerrain({
    map: MAPS.elderhall, tileSize: 32,
    drawTile: (_name, x, y, _variant, pathMask) => {
      if (x === 11 * 32 && y === 5 * 32 && pathMask !== undefined) mask = pathMask;
    },
    drawOverlay: () => {}, drawDecoration: () => {},
  });
  assert.ok(roadBorderCorners(mask) & 16, "road bends around the exposed diagonal");
});

test("revision-specific Elderhall well placements stay solid beside reachable roads", () => {
  for (const { revision, map } of revisionMaps) {
    const well = map.objects.find((object) => object.id === "well")!;
    const expected = revision === 2 ? { x: 8, y: 10 } : { x: 14, y: 10 };
    assert.deepEqual({ x: well.x, y: well.y }, expected, `revision ${revision}: well position is authored for this map`);
    assert.equal(isOccupied(map, {}, well.x, well.y), true, `revision ${revision}: well remains solid at its displayed location`);
    if (revision === 2) {
      assert.equal(map.ground[well.y]![well.x], ".", "revision 2 well remains on grass beside the road");
      assert.equal(map.ground[11]![8], "p", "revision 2 road continues below the well");
      assert.equal(isOccupied(map, {}, 8, 11), false, "revision 2 route past the well is clear");
      assert.ok(reachableTiles(map, map.spawn, {}).has("8,11"), "revision 2 nearby road remains reachable");
    } else {
      for (const [x, y] of [[14, 9], [15, 9], [13, 10], [14, 10], [15, 10], [14, 11]]) {
        assert.equal(map.ground[y]![x], "p", `revision 5 organic apron retains dirt beneath its paved overlay at ${x},${y}`);
      }
      assert.equal(map.ground[11]![13], "p", "revision 5 road continues around the apron");
      assert.equal(isOccupied(map, {}, 13, 11), false, "revision 5 lane beside the apron is clear");
      assert.ok(reachableTiles(map, map.spawn, {}).has("13,11"), "revision 5 nearby road remains reachable");
    }
  }
});

test("village paths are blended over grass instead of tiled with repeated shadow stripes", () => {
  const calls: { name: string; x: number; y: number; pathMask?: number }[] = [];
  const shadows: string[] = [];
  bakeMapTerrain({
    map: MAPS.elderhall,
    tileSize: 32,
    drawTile: (name, x, y, _variant, pathMask?: number) => calls.push({ name, x, y, pathMask }),
    drawOverlay: (style) => { if (style === "shadow") shadows.push(style); },
    drawDecoration: () => {},
  });
  const road = calls.findIndex((call) => call.name === "dirt" && call.x === 10 * 32 && call.y === 9 * 32);
  assert.ok(road > 0);
  assert.equal(calls[road - 1]!.name, "grass", "grass is drawn beneath the clipped path");
  assert.equal(typeof calls[road]!.pathMask, "number", "the path uses its neighboring tiles for its outline");
  assert.equal(shadows.length, 0, "individual road tiles do not receive dark bottom stripes");
});

test("village boundary grass does not receive detached square edge shadows", () => {
  const overlays: string[] = [];
  bakeMapTerrain({ map: MAPS.elderhall, tileSize: 32, drawTile: () => {}, drawOverlay: (style) => overlays.push(style), drawDecoration: () => {} });
  assert.equal(overlays.includes("edge"), false);
});

test("the village-green tree has a real footprint without blocking the roads or Maren", () => {
  const map = MAPS.elderhall;
  const tree = map.objects.find((object) => object.id === "green_tree");
  assert.ok(tree && tree.solid);
  assert.equal(isOccupied(map, {}, tree.x, tree.y), true);
  const reachable = reachableTiles(map, map.spawn, {});
  const maren = map.npcs.find((npc) => npc.id === "maren")!;
  assert.ok([[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => reachable.has(`${maren.x + dx!},${maren.y + dy!}`)), "Maren remains reachable");
  for (const warp of map.warps) assert.ok(reachable.has(`${warp.x},${warp.y}`), `${warp.to} remains reachable`);
});
