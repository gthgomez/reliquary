import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStats, makeBeast } from "./content.ts";
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
