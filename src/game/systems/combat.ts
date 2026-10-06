import { currentStats, typeMod } from "../content.ts";
import type { Beast, ElementId, Skill } from "../types.ts";
import type { RandomSource } from "../rng.ts";

export type SkillResolution = {
  hit: boolean;
  critical: boolean;
  damage: number;
  multiplier: number;
};

export function accuracySucceeds(skill: Skill, attacker: Beast, random: RandomSource): boolean {
  return skill.accuracy >= 100 || random() * 100 <= skill.accuracy + currentStats(attacker).lck / 20;
}

/** Resolve the elemental/stab calculation used by the engine. */
export function resolveElementalDamage(
  attacker: Beast,
  defender: Beast,
  skill: Skill,
  attackerElements: ElementId[],
  defenderElements: ElementId[],
  random: RandomSource,
): SkillResolution {
  if (!accuracySucceeds(skill, attacker, random)) {
    return { hit: false, critical: false, damage: 0, multiplier: 1 };
  }
  if (skill.kind === "heal" || skill.kind === "ward" || skill.kind === "hex" && skill.power === 0) {
    return { hit: true, critical: false, damage: 0, multiplier: 1 };
  }
  const aStats = currentStats(attacker);
  const dStats = currentStats(defender);
  const atkStat = skill.kind === "strike" ? aStats.atk : aStats.mag;
  const defStat = skill.kind === "strike" ? dStats.def : dStats.res;
  const base = Math.floor((2 * attacker.level / 5 + 2) * skill.power * atkStat / Math.max(1, defStat) / 50) + 2;
  const stab = attackerElements.includes(skill.element) ? 1.25 : 1;
  const multiplier = typeMod(skill.element, defenderElements);
  const critical = random() < .06 + aStats.lck / 400;
  let damage = Math.max(1, Math.floor(base * stab * multiplier * (critical ? 1.6 : 1) * (.85 + random() * .15)));
  if (defender.status === "ward") damage = Math.floor(damage * .7);
  if (attacker.status === "bless") damage = Math.floor(damage * 1.15);
  return { hit: true, critical, damage, multiplier };
}

export function statusSucceeds(chance: number, random: RandomSource): boolean {
  return random() * 100 < chance;
}

export function spendSkillMp(attacker: Beast, skill: Skill): boolean {
  if (attacker.mp < skill.mp) return false;
  attacker.mp -= skill.mp;
  return true;
}

export function healBeast(target: Beast, amount: number): number {
  const before = target.hp;
  target.hp = Math.min(currentStats(target).hp, target.hp + Math.max(0, Math.floor(amount)));
  return target.hp - before;
}

export function playerActsFirst(player: Beast, foe: Beast, random: RandomSource): boolean {
  return currentStats(player).spd + random() * 8 >= currentStats(foe).spd + random() * 8;
}
