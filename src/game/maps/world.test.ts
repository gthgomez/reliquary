import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { reachableTiles } from "../world/reachability.ts";

const REQUIRED_STORY = [
  "elderhall",
  "grove",
  "briar_road",
  "wildwood",
  "thornkeep",
  "warden_hall",
  "elderhall_cellar",
  "crownpool",
  "briar_camp",
];

test("principal story maps expose non-empty reachable areas from spawn", () => {
  for (const id of REQUIRED_STORY) {
    const map = MAPS[id];
    assert.ok(map, id);
    const reach = reachableTiles(map, map.spawn, { starter: true, trial: true });
    assert.ok(reach.size > 4, `${id} should have interior reachability`);
  }
});

test("optional area warps land on walkable non-warp tiles when possible", () => {
  for (const map of Object.values(MAPS)) {
    for (const warp of map.warps) {
      const dest = MAPS[warp.to];
      assert.ok(dest, `${map.id} warp to ${warp.to}`);
      const row = dest.ground[warp.ty];
      assert.ok(row && row[warp.tx] && row[warp.tx] !== "#", `${warp.to} landing ${warp.tx},${warp.ty}`);
    }
  }
});
