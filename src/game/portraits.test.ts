import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { PORTRAITS, resolveNpcPortrait } from "./portraits.ts";
import { MAPS } from "./maps.ts";

test("placed NPC identities resolve independently of names and shared scripts/sprites", () => {
  for (const id of ["maren", "maren2"])
    assert.equal(resolveNpcPortrait(id, "elder"), "elder-maren");
  for (const id of ["cael", "cael_hall"])
    assert.equal(resolveNpcPortrait(id, "warden"), "warden-cael");
  assert.equal(resolveNpcPortrait("goblin_trader", "shopkeep"), "patch");
  assert.equal(resolveNpcPortrait("keep_shop", "shopkeep"), "shopkeep");
  assert.equal(resolveNpcPortrait("keep_innkeep", "innkeep"), "innkeep");
});

test("only explicit placed identity can use a safe role fallback", () => {
  assert.equal(resolveNpcPortrait("future-guard", "guard"), "guard");
  assert.equal(resolveNpcPortrait("future-elder", "elder"), null);
  assert.equal(resolveNpcPortrait("future-warden", "warden"), null);
  assert.equal(resolveNpcPortrait("unknown", "unknown"), null);
  assert.equal(resolveNpcPortrait(null, "shopkeep"), null);
  for (const value of ["Elder Maren", "maren_guild", "Sign", "__proto__", "constructor"]) {
    assert.equal(resolveNpcPortrait(value, value), null);
  }
});

test("all current placed NPCs resolve to shipped art; registry has no ambiguous identities", () => {
  const ids = new Set<string>();
  const sprites = new Set<string>();
  for (const portrait of Object.values(PORTRAITS)) {
    assert.ok(existsSync(new URL(`../../public${portrait.src}`, import.meta.url)), portrait.src);
    for (const id of portrait.npcIds) {
      assert.ok(!ids.has(id), id);
      ids.add(id);
    }
    for (const sprite of portrait.sprites) {
      assert.ok(!sprites.has(sprite), sprite);
      sprites.add(sprite);
    }
  }
  for (const map of Object.values(MAPS)) {
    for (const npc of map.npcs)
      assert.ok(resolveNpcPortrait(npc.id, npc.sprite), `${map.id}: ${npc.id}`);
  }
});
