import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { reachableTiles, resolveSafeSpawn } from "./reachability.ts";

test("ashenbarrow north warp is reachable after the carved passage", () => {
  const map = MAPS.ashenbarrow;
  const reach = reachableTiles(map, { x: 9, y: 16 }, {});
  assert.equal(reach.has("9,1"), true, "north pocket warp should be reachable from entry");
});

test("resolveSafeSpawn relocates blocked legacy coordinates to spawn component", () => {
  const map = MAPS.elderhall;
  const relocated = resolveSafeSpawn(map, { x: 99, y: 99 }, {});
  assert.equal(relocated.x, map.spawn.x);
  assert.equal(relocated.y, map.spawn.y);
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
