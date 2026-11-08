import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { isOccupied } from "./movement.ts";
import { reachableTiles } from "./reachability.ts";
import { bakeMapTerrain } from "./terrain.ts";
import { roadBorderCorners } from "../render/tile-surface.ts";

test("Elderhall roads connect each doorway and both exits without isolated paving", () => {
  const map = MAPS.elderhall;
  const path = new Set<string>();
  for (let y = 0; y < map.ground.length; y++) {
    for (let x = 0; x < map.ground[y]!.length; x++) {
      if (map.ground[y]![x] === "p") path.add(`${x},${y}`);
    }
  }
  const queue = ["10,0"];
  const connected = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!.split(",").map(Number) as [number, number];
    for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
      const key = `${nx},${ny}`;
      if (path.has(key) && !connected.has(key)) { connected.add(key); queue.push(key); }
    }
  }
  assert.equal(connected.size, path.size, "every road tile belongs to the same network");
  // The shipped building art places the door toward the left of each sprite,
  // rather than at the center of its three-tile collision footprint.
  for (const id of ["h_home", "h_guild", "h_inn", "h_shop"]) {
    const house = map.objects.find((object) => object.id === id)!;
    const entrance = `${house.x},${house.y + house.h}`;
    assert.ok(path.has(entrance), `${id} has a road at its front door`);
    assert.ok(reachableTiles(map, map.spawn, {}).has(entrance), `${id} can be reached`);
    assert.equal(map.ground[house.y + house.h - 1]![house.x], "p", `${id}'s path extends beneath its visible base`);
  }
  for (const warp of map.warps) assert.ok(reachableTiles(map, map.spawn, {}).has(`${warp.x},${warp.y}`), `${warp.to} exit can be reached`);
  assert.equal(map.ground[3]!.slice(4, 7), "...", "the unused cobblestone pad is gone");
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

test("Elderhall road passes the well without changing its collision position", () => {
  const map = MAPS.elderhall;
  const well = map.objects.find((object) => object.id === "well")!;
  assert.deepEqual({ x: well.x, y: well.y }, { x: 8, y: 10 }, "old save positions keep their collision meaning");
  assert.equal(map.ground[well.y]![well.x], ".", "the well is on grass beside the road");
  assert.equal(isOccupied(map, {}, well.x, well.y), true, "well remains solid at its displayed location");
  assert.equal(map.ground[11]![8], "p", "the road continues below the well");
  assert.equal(isOccupied(map, {}, 8, 11), false, "the route past the well is clear");
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
