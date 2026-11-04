import { MAX_LEVEL, PRACTICE_COST, PRACTICE_LORE } from "../content.ts";
import type { Beast } from "../types";

export function leadActionHint(index: number, beast: Beast): string | null {
  if (index === 0) return "Party lead — walks the road and enters battle first.";
  if (beast.hp <= 0) return "Cannot lead while fallen. Heal or revive first.";
  return null;
}

export function practiceActionHint(beast: Beast, gold: number): string | null {
  if (beast.hp <= 0) return "Practice needs a companion on their feet.";
  if (beast.level >= MAX_LEVEL) return "Already at the level cap.";
  if (gold < PRACTICE_COST) return `Need ${PRACTICE_COST} cr to practice (you have ${gold}).`;
  return null;
}

export function practiceEnabledHint(): string {
  return `Practice: pay ${PRACTICE_COST} cr · gain ${PRACTICE_LORE} lore (XP) · does not restore HP or MP.`;
}
