import { currentStats } from "../content.ts";
import type { Beast } from "../types.ts";
import type { RandomSource } from "../rng.ts";

export function captureChance(
  foe: Beast,
  catchRate: number,
  stoneBonus: number,
): number {
  const maxHp = currentStats(foe).hp;
  const statusBonus = foe.status ? 1.4 : 1;
  const raw = (3 * maxHp - 2 * foe.hp) * catchRate * stoneBonus * statusBonus / (3 * maxHp);
  return Math.min(.95, raw / 255);
}

export function captureSucceeds(
  foe: Beast,
  catchRate: number,
  stoneBonus: number,
  random: RandomSource,
): boolean {
  return random() < captureChance(foe, catchRate, stoneBonus);
}

export function storeCapturedBeast(
  party: Beast[],
  box: Beast[],
  foe: Beast,
  partyLimit = 4,
): { party: Beast[]; box: Beast[]; destination: "party" | "box" } {
  if (party.length < partyLimit) return { party: [...party, foe], box: [...box], destination: "party" };
  return { party: [...party], box: [...box, foe], destination: "box" };
}
