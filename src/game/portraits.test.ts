import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "./maps.ts";
import {
  AUTHORED_PORTRAITS,
  NPC_PORTRAITS,
  SPRITE_PORTRAITS,
  resolveNpcPortrait,
} from "./portraits.ts";

test("every placed NPC in every map resolves a portrait", () => {
  const missing: string[] = [];
  for (const map of Object.values(MAPS)) {
    for (const n of map.npcs) {
      if (!resolveNpcPortrait(n.id, n.sprite)) missing.push(`${map.id}:${n.id}`);
    }
  }
  assert.deepEqual(missing, [], "unmapped NPC ids");
});

test("Elder Maren and Warden Cael get distinct authored artwork", () => {
  assert.equal(NPC_PORTRAITS.maren, "elder-maren");
  assert.equal(NPC_PORTRAITS.maren2, "elder-maren", "second Maren placement shares her portrait");
  assert.equal(NPC_PORTRAITS.cael, "warden-cael");
  assert.equal(NPC_PORTRAITS.cael_hall, "warden-cael", "hall placement shares his portrait");
  assert.notEqual(NPC_PORTRAITS.maren, NPC_PORTRAITS.cael);
  assert.ok(AUTHORED_PORTRAITS.includes("elder-maren"));
  assert.ok(AUTHORED_PORTRAITS.includes("warden-cael"));
});

test("stable npc id wins over sprite so Patch is not mistaken for a shopkeep", () => {
  assert.equal(resolveNpcPortrait("goblin_trader", "shopkeep"), "sigil-goblin");
  assert.equal(resolveNpcPortrait("shopkeep", "shopkeep"), "sigil-shopkeep");
  assert.notEqual(
    resolveNpcPortrait("goblin_trader", "shopkeep"),
    resolveNpcPortrait("shopkeep", "shopkeep"),
  );
});

test("same display name never changes the portrait: innkeep placements agree", () => {
  assert.equal(resolveNpcPortrait("innkeep", "innkeep"), resolveNpcPortrait("keep_innkeep", "innkeep"));
  assert.equal(resolveNpcPortrait("cael", "warden"), resolveNpcPortrait("cael_hall", "warden"));
});

test("unlisted npc id falls back to sprite kind; unknown identity stays text-only", () => {
  assert.equal(resolveNpcPortrait("someone_new", "guard"), "sigil-guard");
  assert.equal(resolveNpcPortrait("someone_new", "elder"), "sigil-elder", "unknown elder never wears Maren's face");
  assert.equal(resolveNpcPortrait("someone_new", "martian"), null);
  assert.equal(resolveNpcPortrait(undefined, undefined), null);
  assert.equal(resolveNpcPortrait(null, ""), null);
});

test("explicit portrait wins; sprite fallback stays cohesive sigils", () => {
  assert.equal(resolveNpcPortrait("maren", "elder", "warden-cael"), "warden-cael");
  for (const key of Object.values(SPRITE_PORTRAITS)) {
    assert.ok(key.startsWith("sigil-"), `sprite fallback ${key} must be a sigil`);
  }
});
