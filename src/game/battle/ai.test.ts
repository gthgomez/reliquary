import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast, SKILLS, SPECIES } from "../content.ts";
import { chooseFoeSkill } from "./ai.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string, level = 20) =>
  makeBeast(id, level, { temperament: "calm", ivs: IVS });

test("picks the highest power×effectiveness affordable skill", () => {
  const foe = beast("emberkit");
  const target = beast("briarling"); // verdant -> ember is strong
  const chosen = chooseFoeSkill(foe, SPECIES[target.speciesId]!.elements, [SKILLS.nip, SKILLS.cinder], SKILLS.nip);
  assert.equal(chosen.id, "cinder");
});

test("uses a heal when below a third of max HP and MP allows", () => {
  const foe = beast("briarling");
  foe.hp = 1;
  const chosen = chooseFoeSkill(foe, SPECIES.emberkit.elements, [SKILLS.nip, SKILLS.mossmend], SKILLS.nip);
  assert.equal(chosen.id, "mossmend");
});

test("uses the first skill when none is eligible, preserving original fallback", () => {
  const foe = beast("emberkit");
  foe.mp = 0;
  const chosen = chooseFoeSkill(foe, SPECIES.briarling.elements, [SKILLS.cinder], SKILLS.nip);
  assert.equal(chosen.id, "cinder");
});

test("uses the fallback skill when the skill list is empty", () => {
  const foe = beast("emberkit");
  const chosen = chooseFoeSkill(foe, SPECIES.briarling.elements, [], SKILLS.nip);
  assert.equal(chosen.id, "nip");
});
