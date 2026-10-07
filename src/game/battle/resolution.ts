import { accuracySucceeds, healBeast, isNonDamagingSkill, resolveElementalDamage, statusSucceeds } from "../systems/combat.ts";
import { applyStatus } from "../systems/status.ts";
import { currentStats, SPECIES } from "../content.ts";
import type { Beast, Skill, StatusId } from "../types.ts";
import type { RandomSource } from "../rng.ts";
import type { BattleEvent } from "./actions.ts";

export type AttackOutcome = {
  damage: number;
  healed: number;
  hit: boolean;
  critical: boolean;
  statusApplied: StatusId | null;
  events: BattleEvent[];
};

export function resolveAttack(attacker: Beast, defender: Beast, skill: Skill, rng: RandomSource): AttackOutcome {
  const events: BattleEvent[] = [];
  const outcome: AttackOutcome = { damage: 0, healed: 0, hit: false, critical: false, statusApplied: null, events };
  const miss = () => {
    events.push({ kind: "miss" }, { kind: "message", text: `${attacker.nickname}'s ${skill.name} misses.` });
  };

  if (skill.kind === "heal") {
    if (!accuracySucceeds(skill, attacker, rng)) {
      miss();
      return outcome;
    }
    const aS = currentStats(attacker);
    outcome.healed = healBeast(attacker, skill.power * (aS.mag / 40));
    outcome.hit = true;
    events.push({ kind: "heal" }, { kind: "message", text: `${attacker.nickname} mends for ${outcome.healed}.` });
    return outcome;
  }

  if (isNonDamagingSkill(skill)) {
    if (!accuracySucceeds(skill, attacker, rng)) {
      miss();
      return outcome;
    }
    outcome.hit = true;
    if (skill.status) {
      applyStatus(defender, skill.status);
      outcome.statusApplied = skill.status;
      events.push({ kind: "status" }, { kind: "message", text: `${skill.name}: ${defender.nickname} is ${skill.status}.` });
    }
    return outcome;
  }

  const result = resolveElementalDamage(
    attacker, defender, skill,
    SPECIES[attacker.speciesId]!.elements, SPECIES[defender.speciesId]!.elements, rng,
  );
  if (!result.hit) {
    miss();
    return outcome;
  }
  defender.hp = Math.max(0, defender.hp - result.damage);
  outcome.damage = result.damage;
  outcome.hit = true;
  outcome.critical = result.critical;
  let text = `${attacker.nickname} uses ${skill.name}! ${result.damage} harm.`;
  if (result.multiplier > 1.2) text += " It bites deep.";
  else if (result.multiplier < .8) text += " It glances.";
  if (result.critical) text += " A true cut.";
  events.push({ kind: "hit", critical: result.critical }, { kind: "message", text });
  if (skill.status && statusSucceeds(skill.statusChance ?? 0, rng) && defender.hp > 0) {
    applyStatus(defender, skill.status);
    outcome.statusApplied = skill.status;
    events.push({ kind: "status" }, { kind: "message", text: `${defender.nickname} is ${skill.status}.` });
  }
  return outcome;
}
