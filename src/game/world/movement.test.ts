import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCKED } from "../world/tiles.ts";
import { DIRS, facingOffset, isOccupied } from "./movement.ts";
import type { MapDef } from "../types.ts";

test("facing offsets match the four directions", () => {
  assert.deepEqual(facingOffset(0), { x: 0, y: 1 });
  assert.deepEqual(facingOffset(1), { x: -1, y: 0 });
  assert.deepEqual(facingOffset(2), { x: 1, y: 0 });
  assert.deepEqual(facingOffset(3), { x: 0, y: -1 });
  assert.equal(DIRS[0].name, "down");
});

function fixture(): MapDef {
  return {
    id: "fixture",
    name: "Fixture",
    region: "test",
    ground: [".....", "..#..", ".....", "....."],
    battleBg: "grass",
    encounterRate: 0,
    encounters: [],
    objects: [
      { id: "cart", sprite: "cart", x: 3, y: 0, w: 1, h: 2, foot: 1, solid: true },
      { id: "st_hut", sprite: "cottage", x: 1, y: 3, w: 1, h: 1, foot: 1, solid: true },
    ],
    npcs: [{ id: "elder", sprite: "elder", x: 0, y: 3, name: "Elder", talk: "idle" }],
    warps: [],
    spawn: { x: 0, y: 0 },
  };
}

test("open ground is not occupied", () => {
  assert.equal(isOccupied(fixture(), {}, 0, 0), false);
});

test("blocked ground is occupied", () => {
  const [blockedTile] = [...BLOCKED];
  assert.ok(blockedTile);
  assert.equal(isOccupied(fixture(), {}, 2, 1), true);
});

test("fractional coordinates are occupied", () => {
  assert.equal(isOccupied(fixture(), {}, 0.5, 0), true);
});

test("a solid object's foot determines which rows are occupied", () => {
  const map = fixture();
  assert.equal(isOccupied(map, {}, 3, 0), false);
  assert.equal(isOccupied(map, {}, 3, 1), true);
  assert.equal(isOccupied(map, {}, 3, 2), false);
});

test("a gateway may block two post footprints while leaving its center walkable", () => {
  const map = fixture();
  map.objects = [{ id: "gate", sprite: "gate", x: 0, y: 0, w: 4, h: 2, foot: 1, solid: true,
    collision: [{ x: 0, y: 1, w: 1, h: 1 }, { x: 3, y: 1, w: 1, h: 1 }] }];
  assert.equal(isOccupied(map, {}, 0, 1), true);
  assert.equal(isOccupied(map, {}, 1, 1), false);
  assert.equal(isOccupied(map, {}, 3, 1), true);
});

test("starter objects are skipped only while the starter flag is set", () => {
  assert.equal(isOccupied(fixture(), {}, 1, 3), true);
  assert.equal(isOccupied(fixture(), { starter: true }, 1, 3), false);
});
