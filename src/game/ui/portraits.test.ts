import assert from "node:assert/strict";
import test from "node:test";
import { PORTRAITS, portraitForTalk, portraitSpec } from "./portraits.ts";

test("named NPC talk ids map to explicit portrait identities", () => {
  assert.equal(portraitForTalk("maren"), "maren");
  assert.equal(portraitForTalk("maren_guild"), "maren");
  assert.equal(portraitForTalk("cael"), "cael");
  assert.equal(portraitForTalk("cael_trial"), "cael");
  assert.equal(portraitForTalk("innkeep"), "innkeep");
});

test("shared display names still keep separate talk identities", () => {
  assert.notEqual(portraitForTalk("guard"), portraitForTalk("keep_guard"));
  assert.equal(portraitForTalk("guard"), "guard");
  assert.equal(portraitForTalk("keep_guard"), "keep-guard");
});

test("unknown and narrator-facing ids stay text-only", () => {
  assert.equal(portraitForTalk("sign_road"), null);
  assert.equal(portraitForTalk("shrine"), null);
  assert.equal(portraitForTalk(""), null);
});

test("every talk mapping resolves to a shipped portrait spec", () => {
  for (const id of [
    "maren",
    "maren_guild",
    "cael",
    "cael_trial",
    "guard",
    "keep_guard",
    "innkeep",
    "shopkeep",
    "lise",
    "wayfarer",
    "reedcutter",
    "goblin_scout",
    "goblin_king",
    "goblin_trader",
  ]) {
    const key = portraitForTalk(id);
    assert.ok(key, `${id} should have a portrait key`);
    assert.ok(PORTRAITS[key], `${key} should have a portrait spec`);
  }
});

test("only Maren and Cael ship bespoke art; other NPCs use the shared fallback", () => {
  assert.equal(portraitSpec("maren").art, "/game/portraits/maren.svg");
  assert.equal(portraitSpec("cael").art, "/game/portraits/cael.svg");
  for (const key of Object.keys(PORTRAITS) as (keyof typeof PORTRAITS)[]) {
    if (key !== "maren" && key !== "cael") {
      assert.equal(PORTRAITS[key].art, null, `${key} must not borrow another character's art`);
    }
  }
});

test("portrait specs carry an accessible role, accent and monogram", () => {
  for (const key of Object.keys(PORTRAITS) as (keyof typeof PORTRAITS)[]) {
    const spec = PORTRAITS[key];
    assert.ok(spec.role.length > 0, `${key} needs a role label`);
    assert.match(spec.accent, /^#[0-9a-f]{6}$/i, `${key} needs a hex accent`);
    assert.match(spec.monogram, /^[A-Z]$/, `${key} needs a monogram`);
  }
});
