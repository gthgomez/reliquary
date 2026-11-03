import { currentStats } from "../content.ts";
import type { Beast, StatusId } from "../types.ts";

/** Chance a dazed beast fumbles its next attack. */
export const DAZE_FUMBLE_CHANCE = 0.25;

export const STATUS_ADJECTIVES: Record<StatusId, string> = {
  burn: "burning",
  soak: "soaked",
  bind: "bound",
  daze: "dazed",
  ward: "warded",
  bless: "blessed",
};

export function applyStatus(target: Beast, status: StatusId, turns = 3): void {
  target.status = status;
  target.statusTurns = turns;
}

export function tickStatus(target: Beast): void {
  if (!target.status) return;
  if (target.status === "burn") target.hp = Math.max(1, target.hp - Math.floor(currentStats(target).hp * .06));
  if (target.status === "soak") target.mp = Math.max(0, target.mp - 2);
  target.statusTurns -= 1;
  if (target.statusTurns <= 0) target.status = null;
}

/** Movement speed for acting order: a bound beast keeps moving, but last. */
export function turnOrderSpeed(target: Beast): number {
  if (target.status === "bind") return 0;
  return currentStats(target).spd;
}

/** True when a dazed beast fumbles the attack it was about to make. */
export function dazeFumbles(target: Beast, random: () => number): boolean {
  return target.status === "daze" && random() < DAZE_FUMBLE_CHANCE;
}
