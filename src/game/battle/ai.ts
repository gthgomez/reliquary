import { currentStats, typeMod } from "../content.ts";
import type { Beast, ElementId, Skill } from "../types.ts";

/** Pure enemy skill choice. MP spending stays with the caller. */
export function chooseFoeSkill(
  foe: Beast,
  targetElements: ElementId[],
  skills: Skill[],
  fallback: Skill,
): Skill {
  const stats = currentStats(foe);
  if (foe.hp < stats.hp * .35) {
    const heal = skills.find((s) => s.kind === "heal" && foe.mp >= s.mp);
    if (heal) return heal;
  }
  let best = skills[0] ?? fallback;
  let bestScore = -1;
  for (const s of skills) {
    if (s.mp > foe.mp || s.kind === "heal") continue;
    const score = s.power * typeMod(s.element, targetElements);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}
