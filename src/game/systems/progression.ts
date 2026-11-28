import { currentStats, expToNext, MAX_LEVEL, SKILLS, SPECIES } from "../content.ts";
import type { Beast } from "../types.ts";

export type ProgressionResult = {
  levelsGained: number;
  learnedSkills: string[];
  queuedSkills: string[];
  evolvedFrom: string | null;
  evolvedInto: string | null;
  evolvedStages: string[];
};

/** Apply XP without UI/audio side effects so progression can be verified headlessly. */
export function awardExperience(beast: Beast, xp: number): ProgressionResult {
  if (!Number.isFinite(xp) || xp < 0 || !Number.isFinite(beast.exp + xp))
    throw new Error("XP must be a nonnegative finite number");
  const result: ProgressionResult = {
    levelsGained: 0,
    learnedSkills: [],
    queuedSkills: [],
    evolvedFrom: null,
    evolvedInto: null,
    evolvedStages: [],
  };
  beast.exp += xp;
  while (beast.exp >= expToNext(beast.level) && beast.level < MAX_LEVEL) {
    beast.exp -= expToNext(beast.level);
    const before = currentStats(beast);
    beast.level += 1;
    result.levelsGained += 1;
    const learnSkillId = (skillId: string) => {
      if (!SKILLS[skillId] || beast.skills.includes(skillId) || beast.pendingSkills?.includes(skillId)) return;
      if (beast.skills.length < 4) {
        beast.skills.push(skillId);
        result.learnedSkills.push(skillId);
      } else {
        // A full list must never overwrite silently: queue the skill so the
        // player can choose to learn (replacing something) or decline. The
        // bound matches the save schema; current learnsets queue at most a
        // couple of entries, so it is a guard rather than a game rule.
        const queue = beast.pendingSkills ?? [];
        if (queue.length < 16) beast.pendingSkills = [...queue, skillId];
        result.queuedSkills.push(skillId);
      }
    };
    const species = SPECIES[beast.speciesId]!;
    for (const learned of species.learnset) {
      if (learned.level === beast.level) learnSkillId(learned.skill);
    }
    if (species.evolves && beast.level >= species.evolves.level && beast.speciesId === species.id) {
      result.evolvedFrom ??= species.id;
      result.evolvedInto = species.evolves.into;
      result.evolvedStages.push(species.evolves.into);
      beast.speciesId = species.evolves.into;
      const evolved = SPECIES[species.evolves.into]!;
      if (beast.nickname === species.name) beast.nickname = evolved.name;
      for (const learned of evolved.learnset) {
        if (learned.level === beast.level) learnSkillId(learned.skill);
      }
    }
    const after = currentStats(beast);
    if (beast.hp > 0) beast.hp = Math.max(1, Math.min(after.hp, beast.hp + after.hp - before.hp));
    beast.mp = Math.max(0, Math.min(after.mp, beast.mp + after.mp - before.mp));
  }
  return result;
}
