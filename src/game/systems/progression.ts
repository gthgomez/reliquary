import { currentStats, expToNext, SKILLS, SPECIES } from "../content.ts";
import type { Beast } from "../types.ts";

export type ProgressionResult = {
  levelsGained: number;
  learnedSkills: string[];
  evolvedFrom: string | null;
  evolvedInto: string | null;
};

/** Apply XP without UI/audio side effects so progression can be verified headlessly. */
export function awardExperience(beast: Beast, xp: number): ProgressionResult {
  if (!Number.isFinite(xp) || xp < 0) throw new Error("XP must be a nonnegative finite number");
  const result: ProgressionResult = { levelsGained: 0, learnedSkills: [], evolvedFrom: null, evolvedInto: null };
  beast.exp += xp;
  while (beast.exp >= expToNext(beast.level) && beast.level < 40 && result.levelsGained < 10) {
    beast.exp -= expToNext(beast.level);
    const before = currentStats(beast);
    beast.level += 1;
    result.levelsGained += 1;
    const after = currentStats(beast);
    beast.hp = Math.min(after.hp, beast.hp + after.hp - before.hp);
    beast.mp = Math.min(after.mp, beast.mp + after.mp - before.mp);
    const species = SPECIES[beast.speciesId]!;
    const learned = species.learnset.find((entry) => entry.level === beast.level);
    if (learned && SKILLS[learned.skill] && !beast.skills.includes(learned.skill)) {
      if (beast.skills.length < 4) beast.skills.push(learned.skill);
      else beast.skills[3] = learned.skill;
      result.learnedSkills.push(learned.skill);
    }
    if (species.evolves && beast.level >= species.evolves.level && beast.speciesId === species.id) {
      result.evolvedFrom = species.id;
      result.evolvedInto = species.evolves.into;
      beast.speciesId = species.evolves.into;
      beast.nickname = SPECIES[species.evolves.into]!.name;
    }
  }
  return result;
}
