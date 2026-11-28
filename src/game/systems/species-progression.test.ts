import assert from "node:assert/strict";
import { test } from "node:test";
import { ITEMS, MAX_LEVEL, SPECIES, currentStats, makeBeast } from "../content.ts";
import { FIXED_ENCOUNTERS } from "../encounters.ts";
import { MAPS } from "../maps.ts";
import { sequenceRandom } from "../rng.ts";
import { captureChance } from "./capture.ts";
import {
  analyzeEvolutionGraph,
  elementMatchups,
  formatEvolutionLine,
  speciesHabitats,
} from "./species-progression.ts";

test("authoritative evolution graph classifies every live species cleanly", () => {
  const { errors, entries } = analyzeEvolutionGraph(SPECIES, MAX_LEVEL);
  assert.deepEqual(errors, []);
  assert.equal(Object.keys(entries).length, Object.keys(SPECIES).length);

  assert.equal(entries.emberkit?.category, "three_stage_first");
  assert.equal(entries.pyrefox?.category, "three_stage_second");
  assert.equal(entries.pyrefox?.minAttainableLevel, 14);
  assert.equal(entries.crownwyrm?.category, "three_stage_final");
  assert.equal(entries.crownwyrm?.minAttainableLevel, 28);

  assert.equal(entries.dewslime?.category, "two_stage_first");
  assert.equal(entries.bogslime?.category, "two_stage_final");
  assert.equal(entries.bogslime?.minAttainableLevel, 12);

  assert.equal(entries.mothwisp?.category, "single_stage");
  assert.equal(entries.mothwisp?.isTerminal, true);
  assert.equal(entries.mothwisp?.minAttainableLevel, 1);

  assert.equal(entries.blighted_gravepup?.category, "variant");
  assert.equal(entries.keepdrake?.category, "exceptional");
  assert.equal(entries.slime_king?.category, "exceptional");
});

test("ordinary species hierarchy maintains first -> second -> single-stage -> final BST budgets", () => {
  const { entries } = analyzeEvolutionGraph(SPECIES, MAX_LEVEL);
  const byCategory = (cat: string) =>
    Object.values(entries).filter((entry) => entry.category === cat);

  const avg = (list: typeof entries[string][]) =>
    list.reduce((sum, entry) => sum + entry.bst, 0) / list.length;

  const avgFirst3 = avg(byCategory("three_stage_first"));
  const avgSecond3 = avg(byCategory("three_stage_second"));
  const avgSingle = avg(byCategory("single_stage"));
  const avgFinal3 = avg(byCategory("three_stage_final"));

  assert.ok(avgFirst3 < avgSecond3, `${avgFirst3} < ${avgSecond3}`);
  assert.ok(avgSecond3 < avgSingle, `${avgSecond3} < ${avgSingle}`);
  assert.ok(avgSingle < avgFinal3, `${avgSingle} < ${avgFinal3}`);

  for (const single of byCategory("single_stage")) {
    for (const first of byCategory("three_stage_first")) {
      assert.ok(single.bst > first.bst, `${single.id}(${single.bst}) > ${first.id}(${first.bst})`);
    }
    for (const finalForm of byCategory("three_stage_final")) {
      assert.ok(single.bst < finalForm.bst, `${single.id}(${single.bst}) < ${finalForm.id}(${finalForm.bst})`);
    }
  }
});

test("regional encounter tiers, safe zones, and boss isolation obey progression rules", () => {
  const { entries } = analyzeEvolutionGraph(SPECIES, MAX_LEVEL);

  // Safe onboarding maps stay encounter-free.
  assert.equal(MAPS.elderhall.encounterRate, 0);
  assert.equal(MAPS.grove.encounterRate, 0);

  // Regional encounter min/max levels progress smoothly across Chapter 1.
  const avgMinLevel = (mapId: keyof typeof MAPS) => {
    const enc = MAPS[mapId].encounters;
    const total = enc.reduce((sum, item) => sum + item.w, 0);
    return enc.reduce((sum, item) => sum + ((item.min + item.max) / 2) * item.w, 0) / total;
  };
  assert.ok(avgMinLevel("briar_road") < avgMinLevel("wildwood"));
  assert.ok(avgMinLevel("wildwood") <= avgMinLevel("mirefen"));
  assert.ok(avgMinLevel("mirefen") < avgMinLevel("ashenbarrow"));

  // Crownpool bogslime meets its evolution level (12).
  const pool = MAPS.crownpool.encounterRegions?.find((region) => region.id === "pool_margins");
  assert.ok(pool);
  const bog = pool.encounters.find((entry) => entry.species === "bogslime");
  assert.ok(bog && bog.min >= entries.bogslime!.minAttainableLevel);

  // Legend / fixed-only creatures never appear in any wild encounter table.
  for (const map of Object.values(MAPS)) {
    const allWild = [...map.encounters, ...(map.encounterRegions ?? []).flatMap((r) => r.encounters)];
    for (const entry of allWild) {
      assert.notEqual(SPECIES[entry.species]?.collection, "legend");
    }
  }
  assert.ok(FIXED_ENCOUNTERS.slime_king.foes.some((f) => f.speciesId === "slime_king"));
});

test("habitats, element matchups, and formatted evolution lines resolve accurately", () => {
  const { entries } = analyzeEvolutionGraph(SPECIES, MAX_LEVEL);
  assert.equal(formatEvolutionLine("emberkit", SPECIES, entries), "Emberkit -> Pyrefox (Lv 14) -> Crownwyrm (Lv 28)");
  assert.equal(formatEvolutionLine("dewslime", SPECIES, entries), "Dewslime -> Bogslime (Lv 12)");
  assert.match(formatEvolutionLine("blighted_gravepup", SPECIES, entries), /Gravepup/);

  assert.ok(speciesHabitats("dewslime", MAPS).includes("Briar Road"));
  assert.ok(speciesHabitats("bogslime", MAPS).includes("Crownpool"));
  assert.deepEqual(elementMatchups(["ember"]).strongAgainst, ["Verdant", "Steel"]);
  assert.deepEqual(elementMatchups(["ember"]).weakAgainst, ["Tide", "Stone"]);
});

test("capture chances favor early two-stage critters while requiring weakening for rare strong specialists", () => {
  const ivs = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
  const earlyDew = makeBeast("dewslime", 4, { temperament: "calm", ivs });
  const keep = makeBeast("keepdrake", 12, { temperament: "calm", ivs });

  const fullDew = captureChance(earlyDew, SPECIES.dewslime.catchRate, ITEMS.common_sigil!.stone!);
  const fullKeep = captureChance(keep, SPECIES.keepdrake.catchRate, ITEMS.common_sigil!.stone!);
  assert.ok(fullDew > fullKeep * 5, `early catchable vs rare keepdrake: ${fullDew} vs ${fullKeep}`);

  keep.hp = Math.floor(currentStats(keep).hp * 0.2);
  keep.status = "daze";
  const weakenedThorn = captureChance(keep, SPECIES.keepdrake.catchRate, ITEMS.thorn_sigil!.stone!);
  assert.ok(weakenedThorn > fullKeep * 3);

  const seq = sequenceRandom([0.1, 0.9]);
  assert.equal(seq(), 0.1);
  assert.equal(seq(), 0.9);
});
