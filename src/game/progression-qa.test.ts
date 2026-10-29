import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStats, expToNext, makeBeast } from "./content.ts";
import { awardExperience } from "./systems/progression.ts";

test("a large lore award reaches the cap and traverses both evolutions", () => {
  const beast = makeBeast("emberkit", 5, { nickname: "Candle" });
  const result = awardExperience(beast, 1_000_000);
  assert.equal(beast.level, 40);
  assert.equal(beast.speciesId, "crownwyrm");
  assert.equal(beast.nickname, "Candle");
  assert.equal(result.evolvedFrom, "emberkit");
  assert.equal(result.evolvedInto, "crownwyrm");
  assert.deepEqual(result.evolvedStages, ["pyrefox", "crownwyrm"]);
  assert.equal(beast.hp, currentStats(beast).hp);
});

test("lore never revives a fallen beast and invalid awards are rejected", () => {
  const beast = makeBeast("briarling", 15);
  beast.hp = 0;
  awardExperience(beast, 5000);
  assert.equal(beast.hp, 0);
  assert.throws(() => awardExperience(beast, Infinity));
  assert.throws(() => awardExperience(beast, -1));
});

test("a fifth skill with a full list is queued, not silently overwritten", () => {
  const beast = makeBeast("emberkit", 17);
  assert.equal(beast.skills.length, 4);
  const before = [...beast.skills];
  const result = awardExperience(beast, expToNext(17));
  assert.equal(result.queuedSkills[0], "flare");
  assert.deepEqual(result.learnedSkills, []);
  assert.deepEqual(beast.skills, before);
  assert.deepEqual(beast.pendingSkills, ["flare"]);
});

test("a queued skill is never offered twice", () => {
  const beast = makeBeast("emberkit", 17);
  awardExperience(beast, 1_000_000);
  const declared = [...(beast.pendingSkills ?? [])];
  awardExperience(beast, 1_000_000);
  assert.deepEqual(beast.pendingSkills, declared);
});

test("chained awards queue every deferred skill without losing any", () => {
  const beast = makeBeast("emberkit", 17);
  awardExperience(beast, 1_000_000);
  assert.deepEqual(beast.skills, ["nip", "cinder", "scorch", "slash"]);
  const known = new Set([...beast.skills, ...(beast.pendingSkills ?? [])]);
  assert.ok(known.has("flare") && known.has("howl") && known.has("tempest"));
});
