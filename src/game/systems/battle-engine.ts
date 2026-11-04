/**
 * Battle resolution core (issue #34, stage 1): skill use resolves to an
 * event list — pure, deterministic under an injected RandomSource, importable
 * headlessly with no DOM/audio/React imports.
 *
 * The engine stays presentation: it applies the events to the beasts, plays
 * the sound, and writes the battle log. Log strings are produced HERE so the
 * battle record is part of the tested resolution, not scattered call sites.
 */
import { currentStats, SPECIES } from "../content.ts";
import {
  applyCombatContextModifiers,
  healAmount,
  resolveElementalDamage,
  statusSucceeds,
} from "./combat.ts";
import { applyStatus, STATUS_ADJECTIVES } from "./status.ts";
import type { Beast, Skill, StatusId } from "../types.ts";
import type { RandomSource } from "../rng.ts";

export type SkillEvent =
  | { kind: "miss"; log: string; sfx: "fail" }
  | { kind: "heal"; amount: number; log: string; sfx: "heal" }
  | { kind: "status-only"; side: "attacker" | "defender"; status: StatusId | null; log: string | null; sfx: "menu" }
  | {
      kind: "damage";
      amount: number;
      critical: boolean;
      /** Status to apply to the defender after the HP deduction, if rolled. */
      status: StatusId | null;
      log: string;
      sfx: "crit" | "hit";
    };

/**
 * Resolve one skill use between two beasts. Consumes the RandomSource in the
 * engine's historical order (accuracy → crit → variance → status chance) so
 * seeded runs replay identically to the pre-extraction engine.
 */
export function resolveSkillUse(
  atk: Beast,
  def: Beast,
  skill: Skill,
  random: RandomSource,
): SkillEvent[] {
  const resolved = resolveElementalDamage(atk, def, skill, SPECIES[atk.speciesId].elements, SPECIES[def.speciesId].elements, random);
  if (!resolved.hit) {
    return [{ kind: "miss", log: `${atk.nickname}'s ${skill.name} misses.`, sfx: "fail" }];
  }
  if (skill.kind === "heal") {
    return [{
      kind: "heal",
      amount: healAmount(atk, skill.power * (currentStats(atk).mag / 40)),
      log: "",
      sfx: "heal",
    }];
  }
  if (resolved.damage === 0) {
    if (skill.status) {
      const side = skill.kind === "ward" ? ("attacker" as const) : ("defender" as const);
      const target = side === "attacker" ? atk : def;
      return [{
        kind: "status-only",
        side,
        status: skill.status,
        log: `${skill.name}: ${target.nickname} is ${STATUS_ADJECTIVES[skill.status]}.`,
        sfx: "menu",
      }];
    }
    return [{ kind: "status-only", side: "attacker", status: null, log: null, sfx: "menu" }];
  }
  const amount = applyCombatContextModifiers(resolved.damage, atk, def);
  let log = `${atk.nickname} uses ${skill.name}! ${amount} harm.`;
  if (resolved.multiplier > 1.2) log += " It bites deep.";
  else if (resolved.multiplier < .8) log += " It glances.";
  if (resolved.critical) log += " A true cut.";
  let status: StatusId | null = null;
  if (skill.status && def.hp - amount > 0 && statusSucceeds(skill.statusChance ?? 0, random)) {
    status = skill.status;
    log += ` ${def.nickname} is ${STATUS_ADJECTIVES[skill.status]}.`;
  }
  return [{ kind: "damage", amount, critical: resolved.critical, status, log, sfx: resolved.critical ? "crit" : "hit" }];
}

/**
 * Apply resolution events to the beasts (HP and statuses) and return the
 * battle-log line — null when the log should stay untouched (a zero-power
 * skill with no status). Exported so tests verify application headlessly.
 */
export function applySkillEvents(atk: Beast, def: Beast, skill: Skill, events: SkillEvent[]): string | null {
  let log: string | null = null;
  for (const event of events) {
    switch (event.kind) {
      case "miss":
        log = event.log;
        break;
      case "heal": {
        const before = atk.hp;
        atk.hp = Math.min(currentStats(atk).hp, atk.hp + event.amount);
        log = `${atk.nickname} mends for ${atk.hp - before}.`;
        break;
      }
      case "status-only": {
        if (event.status) {
          applyStatus(event.side === "attacker" ? atk : def, event.status);
          log = event.log;
        } else {
          log = null;
        }
        break;
      }
      case "damage": {
        def.hp = Math.max(0, def.hp - event.amount);
        if (event.status) applyStatus(def, event.status);
        log = event.log;
        break;
      }
    }
  }
  void skill;
  return log;
}
