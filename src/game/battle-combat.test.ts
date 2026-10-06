import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStats, makeBeast, SPECIES, typeMod } from "./content.ts";
import { ReliquaryGame } from "./engine.ts";
import { sequenceRandom } from "./rng.ts";
import type { BattleState, Beast, Skill } from "./types.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string, level = 10) =>
  makeBeast(id, level, { temperament: "calm", ivs: IVS });

function strikeFor(b: Beast): Skill {
  return {
    id: "strike", name: "Strike", element: SPECIES[b.speciesId]!.elements[0]!,
    kind: "strike", power: 45, accuracy: 100, mp: 0, desc: "A plain blow.",
  };
}

/**
 * Independent restatement of the canonical strike rule, used only as a test
 * oracle so a mutation in systems/combat.ts is observable here. It calls the
 * SAME number of RNG draws in the same order as production.
 */
function oracleDamage(me: Beast, foe: Beast, skill: Skill, r: () => number): number {
  const aS = currentStats(me);
  const dS = currentStats(foe);
  const atkStat = skill.kind === "strike" ? aS.atk : aS.mag;
  const defStat = skill.kind === "strike" ? dS.def : dS.res;
  const base = Math.floor((2 * me.level / 5 + 2) * skill.power * atkStat / Math.max(1, defStat) / 50) + 2;
  const stab = SPECIES[me.speciesId]!.elements.includes(skill.element) ? 1.25 : 1;
  const mul = typeMod(skill.element, SPECIES[foe.speciesId]!.elements);
  const crit = r() < .06 + aS.lck / 400;
  let dmg = Math.max(1, Math.floor(base * stab * mul * (crit ? 1.6 : 1) * (.85 + r() * .15)));
  if (foe.status === "ward") dmg = Math.floor(dmg * .7);
  if (me.status === "bless") dmg = Math.floor(dmg * 1.15);
  return dmg;
}

function battleGame(party: Beast[], foes: Beast[], random: () => number): ReliquaryGame {
  const g = new ReliquaryGame({ random });
  g.party = party;
  g.mode = "battle";
  g.battle = {
    kind: "wild", bg: "grass", playerIndex: 0, foes, foeIndex: 0, log: [],
    phase: "command", menuIndex: 0, pendingItem: null, shake: 0, catchStone: null,
    pendingXp: 0, escaped: false, canFlee: true, pendingSwitch: false,
  } satisfies BattleState;
  return g;
}

test("engine strike damage is produced by the canonical combat rule", () => {
  const me = beast("galeskip", 20);
  const foe = beast("mothwisp", 18);
  // Order draw (playerActsFirst) then crit/variance; galeskip is faster.
  const seq = [0.1, 0.9, 0.99, 0.42];
  const g = battleGame([me], [foe], sequenceRandom(seq));
  const before = foe.hp;

  // The engine consumes two RNG draws for turn order before resolving.
  const expected = oracleDamage(me, foe, strikeFor(me), sequenceRandom(seq.slice(2)));

  g.menuIndex = 0;
  g.battle!.menuIndex = 0;
  g.confirm(); // "Strike"

  assert.equal(foe.hp, before - expected);
});
