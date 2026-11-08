import assert from "node:assert/strict";
import { test } from "node:test";
import { isElderhallCandidateBuild } from "../build-flags.ts";
import { MAPS } from "../maps.ts";
import { makeElderhallCandidate } from "../maps/elderhall-candidate.ts";
import { isOccupied } from "./movement.ts";

test("candidate flowerbeds stay on clear grass and do not change gameplay geometry", () => {
  const base = MAPS.elderhall;
  const map = makeElderhallCandidate(base);
  const flowers = (map.decorations ?? []).filter((deco) => deco.sprite === "elderhall-flowers");
  assert.ok(flowers.length >= 20, "the candidate includes grouped gardens around the village");
  for (const flower of flowers) {
    assert.equal(flower.layer, "ground");
    // Check every tile covered by the artwork, not only its origin tile.
    for (let y = Math.floor(flower.y); y < Math.ceil(flower.y + flower.h); y++) {
      for (let x = Math.floor(flower.x); x < Math.ceil(flower.x + flower.w); x++) {
        assert.equal(map.ground[y]?.[x], ".", `flower at ${flower.x},${flower.y} crosses off grass into ${x},${y}`);
        assert.equal(isOccupied(map, {}, x, y), false, `flower at ${flower.x},${flower.y} overlaps an occupied tile ${x},${y}`);
        assert.equal(map.warps.some((warp) => warp.x === x && warp.y === y), false, `flower overlaps warp ${x},${y}`);
      }
    }
  }
  if (!isElderhallCandidateBuild()) {
    assert.equal((base.decorations ?? []).some((deco) => deco.sprite === "elderhall-flowers"), false, "production base is untouched");
  } else {
    assert.equal(flowers.length, (base.decorations ?? []).filter((deco) => deco.sprite === "elderhall-flowers").length,
      "recomposing an existing candidate does not duplicate flowerbeds");
  }
});
