import { currentStats } from "../content.ts";
import type { Beast, StatusId } from "../types.ts";

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
