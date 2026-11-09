import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { encounterAt } from "./encounters.ts";
import { reachableTiles } from "./reachability.ts";
import { bakeMapTerrain } from "./terrain.ts";

function connectedRoad(mapId: keyof typeof MAPS): Set<string> {
  const map = MAPS[mapId];
  const road = new Set<string>();
  for (let y = 0; y < map.ground.length; y++) for (let x = 0; x < map.ground[y]!.length; x++) {
    if ("pc".includes(map.ground[y]![x]!)) road.add(`${x},${y}`);
  }
  const first = road.values().next().value;
  assert.ok(first, `${mapId} has roads`);
  const queue: string[] = [first];
  const reached = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!.split(",").map(Number) as [number, number];
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const key = `${nx},${ny}`;
      if (road.has(key) && !reached.has(key)) { reached.add(key); queue.push(key); }
    }
  }
  assert.equal(reached.size, road.size, `${mapId} has no isolated paving`);
  return road;
}

test("Grove trail connects the east exit and all three starter approaches", () => {
  const map = MAPS.grove;
  const road = connectedRoad("grove");
  const reachable = reachableTiles(map, { x: 13, y: 7 }, {});
  for (const [id, x, y] of [["Emberkit", 4, 7], ["Mirewhelp", 8, 6], ["Briarling", 11, 7]] as const) {
    assert.ok(road.has(`${x},${y}`) && reachable.has(`${x},${y}`), `${id} approach is connected and reachable`);
  }
  for (const warp of map.warps) assert.ok(road.has(`${warp.x},${warp.y}`));
  assert.ok(!map.ground.at(-1)!.includes("p"), "no path advertises a nonexistent south exit");
});

test("Thornkeep paths link its real destinations without suggesting a north exit", () => {
  const map = MAPS.thornkeep;
  const road = connectedRoad("thornkeep");
  const reachable = reachableTiles(map, map.spawn, {});
  for (const [place, x, y] of [["inn", 4, 5], ["hall", 14, 5], ["shop", 14, 10], ["shrine", 8, 9], ["cave sign", 4, 6]] as const) {
    assert.ok(road.has(`${x},${y}`) && reachable.has(`${x},${y}`), `${place} approach is connected and reachable`);
  }
  for (const warp of map.warps) assert.ok(road.has(`${warp.x},${warp.y}`) && reachable.has(`${warp.x},${warp.y}`));
  assert.ok(!/[pc]/.test(map.ground[0]!), "no path advertises a nonexistent north exit");
});

test("Briar Road reaches the north, south and eastern exits without an empty west spur", () => {
  const map = MAPS.briar_road;
  const road = connectedRoad("briar_road");
  const reachable = reachableTiles(map, map.spawn, {});
  for (const warp of map.warps) assert.ok(road.has(`${warp.x},${warp.y}`) && reachable.has(`${warp.x},${warp.y}`), `${warp.to} exit is on a reachable path`);
  assert.equal(map.ground[10]![4], ".", "the road no longer points to a nonexistent western exit");
  assert.ok(!map.decorations?.some((item) => item.sprite === "fence" && item.x === 9 && item.y === 9), "no decorative fence floats across the path");
});

test("Briar road changes preserve encounter rules at every coordinate", () => {
  const old = [
    "....................", "..........pp........", "....,,,,..pp..,,,,..", "....,,,,..pp..,,,,..", "..........pp........", "..........pp........", "..,,,,,,..pp........", "..,,,,,,..pp..,,,,..", "..........pp..,,,,..", "..........pp........", "....pppppppppppp....", "..........pp........", "..........pp..,,,,..", "..,,,,....pp..,,,,..", "..,,,,....pp........", "..........pp........", "..........pp........", "....,,,,..pp..,,,,..", "....,,,,..pp..,,,,..", "..........pp........", "..........pp........", "..,,,,,,..pp........", "..,,,,,,..pp........", "..........pp........", "..........pp........", "..........pp........", "..........pp........", "....................",
  ];
  const map = MAPS.briar_road;
  for (let y = 0; y < old.length; y++) for (let x = 0; x < old[y]!.length; x++) {
    assert.deepEqual(encounterAt(map, x, y), encounterAt({ ...map, ground: old }, x, y), `encounters at ${x},${y}`);
  }
});

test("the Mirefen landing connects the Briar exit to the existing marsh road", () => {
  const mirefen = MAPS.mirefen;
  for (const [x, y] of [[1, 9], [1, 8], [0, 8], [1, 7]]) {
    assert.equal(mirefen.ground[y]![x], "p", `marsh entrance ${x},${y} is on the road`);
    assert.equal(encounterAt(mirefen, x, y), null, `marsh entrance ${x},${y} stays encounter-free`);
  }
});

test("Wildwood entry edges join the roads without changing encounter-bearing grass", () => {
  const map = MAPS.wildwood;
  const old = [...map.ground];
  old[0] = "......................";
  old[21] = "......................";
  for (const [x, y] of [[10, 0], [11, 0], [9, 21], [10, 21], [11, 21]]) {
    assert.equal(map.ground[y]![x], "p", `road reaches Wildwood edge at ${x},${y}`);
  }
  assert.equal(map.ground[1]![10], ",", "the northern landing remains tall grass");
  for (let y = 0; y < old.length; y++) for (let x = 0; x < old[y]!.length; x++) {
    assert.deepEqual(encounterAt(map, x, y), encounterAt({ ...map, ground: old }, x, y), `Wildwood encounters at ${x},${y}`);
  }
  const dirt = new Set<string>();
  const tallGrass = new Set<string>();
  bakeMapTerrain({
    map, tileSize: 32,
    drawTile: (name, x, y) => { if (name === "dirt") dirt.add(`${x / 32},${y / 32}`); },
    drawOverlay: () => {},
    drawDecoration: (name, x, y) => { if (name === "tallgrass") tallGrass.add(`${x / 32},${y / 32}`); },
  });
  for (const key of ["10,1", "11,1", "10,2", "11,2"]) {
    assert.ok(dirt.has(key) && tallGrass.has(key), `${key} shows an overgrown path without hiding encounter grass`);
  }
});

test("soft streets join dirt and stone without exposing a grass seam", () => {
  const calls: { name: string; x: number; y: number; mask?: number; blend?: number }[] = [];
  bakeMapTerrain({
    map: MAPS.thornkeep, tileSize: 32,
    drawTile: (name, x, y, _variant, mask?: number, blend?: number) => calls.push({ name, x, y, mask, blend }),
    drawOverlay: () => {}, drawDecoration: () => {},
  });
  const dirt = calls.find((item) => item.name === "dirt" && item.x === 10 * 32 && item.y === 13 * 32);
  const stone = calls.find((item) => item.name === "cobble" && item.x === 10 * 32 && item.y === 12 * 32);
  assert.ok(dirt && stone);
  assert.ok((dirt.mask! & 1) && (stone.mask! & 4), "both materials meet at the shared edge");
  assert.ok(dirt.blend! & 1, "stone is blended into the dirt side of the transition");
});
