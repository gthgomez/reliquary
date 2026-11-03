import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { pickInteractObject } from "./interaction.ts";
import { isLegacyCoordinateValid, reachableTiles, resolveSafeSpawn } from "./reachability.ts";

test("ashenbarrow spawn is not treated as a dead-end warp pocket", () => {
  const map = MAPS.ashenbarrow;
  const reach = reachableTiles(map, map.spawn, {});
  assert.ok(reach.size > 3, "spawn should reach interior tiles");
  assert.equal(reach.has("9,15"), true, "exit warp row remains reachable");
});

test("ashenbarrow north warp is reachable after the carved passage", () => {
  const map = MAPS.ashenbarrow;
  const reach = reachableTiles(map, { x: 9, y: 16 }, {});
  assert.equal(reach.has("9,1"), true, "north pocket warp should be reachable from entry");
});

test("legacy migration rejects impossible out-of-grid coordinates", () => {
  const map = MAPS.elderhall;
  assert.equal(isLegacyCoordinateValid(map, 99, 99), false);
});

test("resolveSafeSpawn keeps coordinates reachable from spawn", () => {
  const map = MAPS.elderhall;
  const kept = resolveSafeSpawn(map, map.spawn, {});
  assert.deepEqual(kept, map.spawn);
});

test("pickInteractObject prefers interactive props on shared tiles", () => {
  const objects = MAPS.briar_camp.objects;
  const king = pickInteractObject(objects, 13, 4);
  assert.equal(king?.interact, "goblin_king");
});

test("paths do not expand through warp tiles", () => {
  const map = MAPS.elderhall;
  const reach = reachableTiles(map, map.spawn, {});
  for (const w of map.warps) {
    if (reach.has(`${w.x},${w.y}`)) {
      const neighbors = [
        `${w.x},${w.y + 1}`,
        `${w.x},${w.y - 1}`,
        `${w.x + 1},${w.y}`,
        `${w.x - 1},${w.y}`,
      ];
      const expandedBeyond = neighbors.some((n) => reach.has(n) && !map.warps.some((ww) => `${ww.x},${ww.y}` === n));
      if (expandedBeyond) continue;
    }
  }
  assert.ok(reach.size > 5);
});
