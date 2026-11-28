import assert from "node:assert/strict";
import { test } from "node:test";
import type { SpeciesRecord } from "../types.ts";
import { SPECIES, calcStats, currentStats, makeBeast } from "../content.ts";
import { sequenceRandom } from "../rng.ts";
import {
  MORPHOLOGY_MASS_MAX,
  MORPHOLOGY_MASS_MIN,
  MORPHOLOGY_SIZE_MAX,
  MORPHOLOGY_SIZE_MIN,
  NEUTRAL_MORPHOLOGY,
  classifyBuild,
  describeMorphology,
  discoveryKnowledgeLevel,
  formatSizeCm,
  formatWeightKg,
  generateMorphology,
  morphologyStatMultipliers,
  morphologyVisualScale,
  recordSpeciesBind,
  recordSpeciesDefeat,
  recordSpeciesEncounter,
  recordSpeciesHabitat,
} from "./morphology.ts";

test("morphology stays correlated, bounded, and classifies rare miniature/colossal specimens", () => {
  const random = sequenceRandom([0.5, 0.5, 0.4, 0.6, 0.5]);
  const ordinary = generateMorphology(random, { tier: "ordinary" });
  assert.ok(ordinary.size >= MORPHOLOGY_SIZE_MIN && ordinary.size <= MORPHOLOGY_SIZE_MAX);
  assert.ok(ordinary.mass >= MORPHOLOGY_MASS_MIN && ordinary.mass <= MORPHOLOGY_MASS_MAX);
  assert.equal(classifyBuild(ordinary).isRare, false);

  const mini = generateMorphology(sequenceRandom([0.2, 0.5]), { tier: "miniature" });
  const giant = generateMorphology(sequenceRandom([0.8, 0.5]), { tier: "colossal" });
  assert.equal(classifyBuild(mini).build, "Miniature");
  assert.equal(classifyBuild(mini).rareLabel, "Miniature");
  assert.equal(classifyBuild(giant).build, "Colossal");
  assert.equal(classifyBuild(giant).rareLabel, "Colossal");
  assert.ok(mini.mass < ordinary.mass && giant.mass > ordinary.mass);
});

test("morphology stat modifiers apply balanced trade-offs without strict dominance", () => {
  const ivs = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
  const sp = SPECIES.emberkit!;
  const neutral = calcStats(sp, 16, ivs, "calm", NEUTRAL_MORPHOLOGY);
  const mini = generateMorphology(sequenceRandom([0.1, 0.2]), { tier: "miniature" });
  const giant = generateMorphology(sequenceRandom([0.9, 0.8]), { tier: "colossal" });
  const miniStats = calcStats(sp, 16, ivs, "calm", mini);
  const giantStats = calcStats(sp, 16, ivs, "calm", giant);

  assert.ok(giantStats.hp > neutral.hp && giantStats.atk >= neutral.atk && giantStats.def >= neutral.def);
  assert.ok(giantStats.spd < neutral.spd);
  assert.ok(miniStats.spd > neutral.spd && miniStats.lck > neutral.lck);
  assert.ok(miniStats.hp < neutral.hp);

  const mods = morphologyStatMultipliers(giant);
  assert.ok(mods.hp <= 1.041 && mods.atk <= 1.021 && mods.def <= 1.021);
  assert.ok(mods.spd >= 0.939 && mods.lck >= 0.959);

  const b = makeBeast("emberkit", 16, { temperament: "calm", ivs, morphology: giant });
  assert.deepEqual(currentStats(b), giantStats);
});

test("describeMorphology, visual scale, and formatting respect species measurement units", () => {
  const wyrm = SPECIES.crownwyrm!;
  const described = describeMorphology({ morphology: { size: 1.2, mass: 1.45 } }, wyrm);
  assert.equal(described.measurementLabel, "Length");
  assert.equal(described.sizeCm, 282);
  assert.equal(formatSizeCm(described.sizeCm), "2.82 m");
  assert.equal(formatWeightKg(described.weightKg), "171.1 kg");

  const small = morphologyVisualScale({ size: 0.78, mass: 0.6 });
  const huge = morphologyVisualScale({ size: 1.24, mass: 1.75 });
  assert.ok(small >= 0.9 && small < 1);
  assert.ok(huge <= 1.1 && huge > 1);
});

test("records, habitats, and non-spoiling discovery knowledge update accurately", () => {
  let records: Record<string, SpeciesRecord> = {};
  let habitats: Record<string, string[]> = {};
  const beast = makeBeast("pyrefox", 16, { morphology: { size: 1.12, mass: 1.3 } });
  const desc = describeMorphology(beast, SPECIES.pyrefox!);

  assert.equal(discoveryKnowledgeLevel("pyrefox", {}, {}, records, SPECIES.pyrefox), "undiscovered");
  records = recordSpeciesEncounter(records, "pyrefox", desc.sizeCm);
  habitats = recordSpeciesHabitat(habitats, "pyrefox", "Ashenbarrow");
  habitats = recordSpeciesHabitat(habitats, "pyrefox", "Ashenbarrow");
  assert.deepEqual(habitats.pyrefox, ["Ashenbarrow"]);
  assert.equal(discoveryKnowledgeLevel("pyrefox", { pyrefox: true }, {}, records, SPECIES.pyrefox), "encountered");

  records = recordSpeciesBind(records, beast, SPECIES.pyrefox!);
  records = recordSpeciesDefeat(records, "pyrefox");
  assert.equal(records.pyrefox?.boundCount, 1);
  assert.equal(records.pyrefox?.defeatedCount, 1);
  assert.equal(records.pyrefox?.smallestCm, desc.sizeCm);
  assert.equal(discoveryKnowledgeLevel("pyrefox", { pyrefox: true }, { pyrefox: true }, records, SPECIES.pyrefox), "full");

  records = recordSpeciesDefeat(records, "slime_king");
  assert.equal(discoveryKnowledgeLevel("slime_king", { slime_king: true }, {}, records, SPECIES.slime_king), "full");
});
