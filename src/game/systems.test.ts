import assert from "node:assert/strict";
import { test } from "node:test";
import { ITEMS, SKILLS, SPECIES, currentStats, expToNext, makeBeast, typeMod } from "./content.ts";
import { sequenceRandom } from "./rng.ts";
import { captureChance, captureSucceeds, storeCapturedBeast } from "./systems/capture.ts";
import { accuracySucceeds, healBeast, resolveElementalDamage, spendSkillMp, statusSucceeds } from "./systems/combat.ts";
import { purchaseItem, sellItem } from "./systems/economy.ts";
import { awardExperience } from "./systems/progression.ts";
import { applyStatus, tickStatus } from "./systems/status.ts";
import { MAPS } from "./maps.ts";
import { canStandAt, mapIsRectangular, resolveWarp } from "./systems/world.ts";

const ivs = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (speciesId: string, level = 10) => makeBeast(speciesId, level, { temperament: "calm", ivs });

test("physical and spell damage respect accuracy, weakness, resistance, and dual elements", () => {
  const attacker = beast("emberkit");
  const neutral = beast("mothwisp");
  const dual = beast("riverguard");
  const strike = resolveElementalDamage(attacker, neutral, SKILLS.slash, SPECIES.emberkit.elements, SPECIES.mothwisp.elements, sequenceRandom([.99, .99]));
  const spell = resolveElementalDamage(attacker, neutral, SKILLS.cinder, SPECIES.emberkit.elements, SPECIES.mothwisp.elements, sequenceRandom([.99, .99]));
  assert.ok(strike.damage > 0);
  assert.ok(spell.damage > 0);
  assert.ok(typeMod("ember", SPECIES.riverguard.elements) < 1);
  assert.ok(typeMod("tide", SPECIES.riverguard.elements) > 1);
  assert.equal(accuracySucceeds({ ...SKILLS.flare, accuracy: 1 }, attacker, () => .5), false);
  assert.equal(accuracySucceeds({ ...SKILLS.flare, accuracy: 100 }, attacker, () => .99), true);
  assert.equal(statusSucceeds(20, () => .19), true);
  assert.equal(statusSucceeds(20, () => .2), false);
  assert.ok(currentStats(dual).hp > 0);
});

test("capture chance improves as a foe is weakened and uses deterministic RNG", () => {
  const foe = beast("mirewhelp");
  const full = captureChance(foe, SPECIES.mirewhelp.catchRate, ITEMS.common_sigil.stone ?? 1);
  foe.hp = Math.floor(currentStats(foe).hp / 4);
  const weak = captureChance(foe, SPECIES.mirewhelp.catchRate, ITEMS.common_sigil.stone ?? 1);
  assert.ok(weak > full);
  assert.equal(captureSucceeds(foe, SPECIES.mirewhelp.catchRate, 2.6, () => 0), true);
	assert.equal(captureSucceeds(foe, SPECIES.mirewhelp.catchRate, 1, () => .99), false);
	const fullParty = [beast("emberkit"), beast("mothwisp"), beast("riverguard"), beast("mirewhelp")];
	assert.equal(storeCapturedBeast([], [], foe).destination, "party");
	assert.equal(storeCapturedBeast(fullParty, [], foe).destination, "box");
});

test("status, healing, MP costs, and shop economy keep their invariants", () => {
	const target = beast("emberkit");
	target.hp = 20;
	assert.equal(healBeast(target, 15), 15);
	assert.equal(target.hp, 35);
	applyStatus(target, "burn", 2);
	tickStatus(target);
	assert.equal(target.status, "burn");
	assert.ok(target.hp < 35);
	tickStatus(target);
	assert.equal(target.status, null);
	const spell = SKILLS.cinder;
	const beforeMp = target.mp;
	assert.equal(spendSkillMp(target, spell), true);
	assert.equal(target.mp, beforeMp - spell.mp);
	target.mp = 0;
	assert.equal(spendSkillMp(target, spell), false);
	const bought = purchaseItem(100, {}, ITEMS.tonic, ["tonic"]);
	assert.equal(bought.ok, true);
	assert.equal(bought.inventory.tonic, 1);
	assert.equal(purchaseItem(0, {}, ITEMS.tonic, ["tonic"]).ok, false);
	assert.equal(purchaseItem(100, {}, ITEMS.tonic, []).ok, false);
	const sold = sellItem(0, { tonic: 1 }, ITEMS.tonic);
	assert.equal(sold.ok, true);
	assert.equal(sold.inventory.tonic, 0);
	assert.equal(sellItem(0, {}, ITEMS.tonic).ok, false);
});

test("experience awards level up, learnset changes, and evolution while preserving state", () => {
  const ember = beast("emberkit", 15);
  const beforeHp = ember.hp;
  const result = awardExperience(ember, expToNext(15));
  assert.equal(result.levelsGained, 1);
  assert.equal(ember.level, 16);
  assert.equal(result.evolvedInto, "pyrefox");
  assert.equal(ember.speciesId, "pyrefox");
  assert.ok(ember.hp >= beforeHp);
  assert.ok(ember.skills.includes("cinder"));
});

test("world data is rectangular and every warp lands on a walkable tile", () => {
  for (const map of Object.values(MAPS)) {
    assert.equal(mapIsRectangular(map), true, map.id);
    assert.equal(canStandAt(map, map.spawn.x, map.spawn.y), true, `${map.id} spawn`);
    for (const warp of map.warps) {
      assert.ok(resolveWarp(map, warp.x, warp.y), `${map.id} warp ${warp.to}`);
    }
  }
});
