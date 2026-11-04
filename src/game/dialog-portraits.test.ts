import assert from "node:assert/strict";
import { test } from "node:test";
import { NAMED_PORTRAITS, PORTRAIT_BY_TALK, portraitSrc, resolveNpcPortrait } from "./dialog-portraits.ts";

test("Elder Maren resolves the same named portrait from both her dialogue keys", () => {
  assert.equal(resolveNpcPortrait("maren"), "elder_maren");
  assert.equal(resolveNpcPortrait("maren_guild"), "elder_maren");
});

test("Warden Cael resolves the same named portrait on the road and in his hall", () => {
  assert.equal(resolveNpcPortrait("cael"), "warden_cael");
  assert.equal(resolveNpcPortrait("cael_trial"), "warden_cael");
});

test("remaining NPCs keep cohesive role portraits keyed by dialogue, not name", () => {
  assert.equal(resolveNpcPortrait("guard"), "guard");
  assert.equal(resolveNpcPortrait("keep_guard"), "guard");
  assert.equal(resolveNpcPortrait("lise"), "traveler");
  assert.equal(resolveNpcPortrait("wayfarer"), "traveler");
  assert.equal(resolveNpcPortrait("reedcutter"), "traveler");
  assert.equal(resolveNpcPortrait("innkeep"), "innkeep");
  assert.equal(resolveNpcPortrait("shopkeep"), "shopkeep");
});

test("unmapped speakers stay text-only instead of borrowing another character", () => {
  assert.equal(resolveNpcPortrait("goblin_trader"), null);
  assert.equal(resolveNpcPortrait(""), null);
});

test("portraitSrc maps known keys to controlled portrait assets", () => {
  assert.equal(portraitSrc("elder_maren"), "/game/portraits/elder-maren.svg");
  assert.equal(portraitSrc("warden_cael"), "/game/portraits/warden-cael.svg");
  assert.equal(portraitSrc("guard"), "/game/portraits/guard.svg");
});

test("portraitSrc rejects unknown or empty portrait keys", () => {
  assert.equal(portraitSrc(null), null);
  assert.equal(portraitSrc(undefined), null);
  assert.equal(portraitSrc(""), null);
  assert.equal(portraitSrc("aunt_lise"), null);
  assert.equal(portraitSrc("elder_maren.png"), null);
});

test("every dialogue mapping points at a shipped portrait key", () => {
  const shipped = new Set([...NAMED_PORTRAITS, "guard", "traveler", "innkeep", "shopkeep"]);
  for (const [talkId, key] of Object.entries(PORTRAIT_BY_TALK)) {
    assert.ok(shipped.has(key), `talk ${talkId} maps to unknown portrait ${key}`);
  }
});
