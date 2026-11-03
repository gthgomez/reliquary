import type { Beast } from "../types";

export function leadActionHint(index: number, beast: Beast): string | null {
  if (index === 0) return "Party lead — walks the road and enters battle first.";
  if (beast.hp <= 0) return "Cannot lead while fallen. Heal or revive first.";
  return null;
}

export function practiceActionHint(beast: Beast, gold: number): string | null {
  if (beast.hp <= 0) return "Practice needs a companion on their feet.";
  if (beast.level >= 40) return "Already at the level cap.";
  if (gold < 45) return `Need 45 cr to practice (you have ${gold}).`;
  return null;
}

export function practiceEnabledHint(): string {
  return "Practice: pay 45 cr · gain 80 lore (XP) · does not restore HP or MP.";
}
