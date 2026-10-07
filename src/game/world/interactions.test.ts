import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { CHEST_LOOT, SIGN_TEXT, WARP_TABLE, findInteractionTarget } from "./interactions.ts";
import type { MapDef } from "../types.ts";

test("warp, sign, and chest tables are intact", () => {
  assert.deepEqual(WARP_TABLE.enter_home, ["home", 5, 6]);
  assert.match(SIGN_TEXT.sign_road!, /BRIAR ROAD/);
  assert.deepEqual(CHEST_LOOT.chest_briar, ["thorn_sigil", 1]);
});

test("warp, sign, and chest tables carry every engine entry", () => {
  assert.deepEqual(Object.keys(WARP_TABLE).sort(), [
    "enter_cave",
    "enter_guild",
    "enter_hall",
    "enter_home",
    "enter_inn",
    "enter_keep_inn",
    "enter_keep_shop",
    "enter_shop",
  ]);
  assert.deepEqual(Object.keys(SIGN_TEXT).sort(), [
    "sign_briar",
    "sign_grove",
    "sign_grove_inner",
    "sign_keep",
    "sign_mire",
    "sign_road",
    "sign_wildwood",
  ]);
  assert.deepEqual(Object.keys(CHEST_LOOT).sort(), ["chest_briar", "chest_cave", "chest_mire", "chest_wood"]);
});

test("finds an NPC or interactable object at a facing tile", () => {
  const map = MAPS.elderhall!;
  let npc: { x: number; y: number } | null = null;
  for (const n of map.npcs) {
    npc = { x: n.x, y: n.y };
    break;
  }
  if (npc) {
    const found = findInteractionTarget(map, npc.x, npc.y);
    assert.ok(found.npc || found.object);
  }
});

// A small fixture so object hitboxes and NPC precedence are covered without
// depending on any particular map's layout.
function fixture(): MapDef {
  return {
    id: "fixture",
    name: "Fixture",
    region: "test",
    ground: ["....."],
    battleBg: "grass",
    encounterRate: 0,
    encounters: [],
    objects: [
      { id: "sign", sprite: "sign", x: 2, y: 0, w: 1, h: 1, foot: 0, solid: false, interact: "sign_road" },
      { id: "chest", sprite: "chest", x: 3, y: 0, w: 2, h: 1, foot: 0, solid: false, interact: "chest_briar" },
    ],
    npcs: [{ id: "elder", sprite: "elder", x: 1, y: 0, name: "Elder", talk: "idle" }],
    warps: [],
    spawn: { x: 0, y: 0 },
  };
}

test("findInteractionTarget returns an object inside its footprint", () => {
  assert.equal(findInteractionTarget(fixture(), 2, 0).object?.id, "sign");
  assert.equal(findInteractionTarget(fixture(), 3, 0).object?.id, "chest");
  assert.equal(findInteractionTarget(fixture(), 4, 0).object?.id, "chest");
});

test("findInteractionTarget returns null for empty tiles", () => {
  const found = findInteractionTarget(fixture(), 0, 0);
  assert.equal(found.npc, null);
  assert.equal(found.object, null);
});

test("an NPC takes precedence over an overlapping object", () => {
  const found = findInteractionTarget(fixture(), 1, 0);
  assert.equal(found.npc?.id, "elder");
  assert.equal(found.object, null);
});
