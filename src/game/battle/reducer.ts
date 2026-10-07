import { resolveAttack, type AttackOutcome } from "./resolution.ts";
import type { Beast, Skill } from "../types.ts";
import type { RandomSource } from "../rng.ts";

/** state (attacker, defender, skill) + RNG -> mutated outcome + events. */
export function reduceAttack(
  attacker: Beast,
  defender: Beast,
  skill: Skill,
  rng: RandomSource,
): { defenderHp: number; outcome: AttackOutcome } {
  const outcome = resolveAttack(attacker, defender, skill, rng);
  return { defenderHp: defender.hp, outcome };
}
