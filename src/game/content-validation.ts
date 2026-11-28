import { ELEMENTS, ITEMS, MAX_LEVEL, SKILLS, SPECIES } from "./content.ts";
import { FIXED_ENCOUNTERS } from "./encounters.ts";
import { MAPS } from "./maps.ts";
import { analyzeEvolutionGraph, type DerivedSpeciesProgression } from "./systems/species-progression.ts";
import { mapIsRectangular, canStandAt } from "./systems/world.ts";
import type { Encounter } from "./types.ts";
import { validateInteractions } from "./world/interactions.ts";

const SKILL_KINDS = new Set(["strike", "spell", "heal", "ward", "hex"]);
const ITEM_KINDS = new Set(["heal", "ether", "status", "revive", "field", "sigil", "key"]);
const MAX_EXCEPTIONAL_UNDER_LEVEL_SHARE = 0.01;

export type ContentTables = {
  ELEMENTS: typeof ELEMENTS;
  SPECIES: typeof SPECIES;
  SKILLS: typeof SKILLS;
  ITEMS: typeof ITEMS;
  MAPS: typeof MAPS;
  FIXED_ENCOUNTERS: typeof FIXED_ENCOUNTERS;
};

function validateEncounterEntries(
  locationLabel: string,
  encounters: readonly Encounter[],
  speciesTable: ContentTables["SPECIES"],
  derivedEntries: Record<string, DerivedSpeciesProgression>,
  errors: string[],
  checkMaxCap: boolean,
): void {
  const totalWeight = encounters.reduce((sum, entry) => sum + (entry.w > 0 ? entry.w : 0), 0);
  for (const encounter of encounters) {
    if (
      !speciesTable[encounter.species] ||
      encounter.min < 1 ||
      encounter.max < encounter.min ||
      (checkMaxCap && encounter.max > MAX_LEVEL) ||
      encounter.w <= 0
    ) {
      errors.push(`${locationLabel}`);
      continue;
    }
    const sp = speciesTable[encounter.species]!;
    if (sp.collection === "legend") {
      errors.push(`${locationLabel}: legend/boss species "${encounter.species}" cannot appear in wild encounter tables`);
    }
    const derived = derivedEntries[encounter.species];
    if (derived && encounter.min < derived.minAttainableLevel) {
      const ex = encounter.exceptionalUnderLevel;
      const share = totalWeight > 0 ? encounter.w / totalWeight : 1;
      if (
        !ex ||
        !ex.reason.trim() ||
        !Number.isFinite(ex.maxShare) ||
        ex.maxShare <= 0 ||
        ex.maxShare > MAX_EXCEPTIONAL_UNDER_LEVEL_SHARE ||
        share > ex.maxShare
      ) {
        errors.push(
          `${locationLabel}: ${encounter.species} min level ${encounter.min} is below evolution threshold ${derived.minAttainableLevel} (weight share ${(share * 100).toFixed(2)}%)`,
        );
      }
    }
  }
}

export function validateContent(tables: ContentTables = { ELEMENTS, SPECIES, SKILLS, ITEMS, MAPS, FIXED_ENCOUNTERS }): string[] {
  const { ELEMENTS: elements, SPECIES: speciesTable, SKILLS: skillsTable, ITEMS: itemsTable, MAPS: mapsTable, FIXED_ENCOUNTERS: fixedEncounters } = tables;
  const errors: string[] = [];
  const speciesIds = new Set(Object.keys(speciesTable));
  const skillIds = new Set(Object.keys(skillsTable));
  for (const [id, species] of Object.entries(speciesTable)) {
    if (id !== species.id) errors.push(`species ${id}: id mismatch`);
    if (species.elements.length === 0 || species.elements.some((element) => !elements[element])) errors.push(`species ${id}: invalid elements`);
    if (Object.values(species.base).some((value) => !Number.isFinite(value) || value <= 0)) errors.push(`species ${id}: invalid base stats`);
    if (species.catchRate <= 0 || species.catchRate > 255 || species.expYield <= 0) errors.push(`species ${id}: invalid catch/exp values`);
    let previousLevel = 0;
    for (const learn of species.learnset) {
      if (!skillIds.has(learn.skill) || learn.level < 1 || learn.level < previousLevel || learn.level > MAX_LEVEL) errors.push(`species ${id}: invalid learnset entry`);
      previousLevel = learn.level;
    }
    if (species.evolves && (!speciesIds.has(species.evolves.into) || species.evolves.level < 1 || species.evolves.level > MAX_LEVEL)) errors.push(`species ${id}: invalid evolution`);
  }
  const graph = analyzeEvolutionGraph(speciesTable, MAX_LEVEL);
  errors.push(...graph.errors);
  for (const [id, skill] of Object.entries(skillsTable)) {
    if (id !== skill.id) errors.push(`skill ${id}: id mismatch`);
    if (!elements[skill.element] || !SKILL_KINDS.has(skill.kind) || skill.power < 0 || skill.mp < 0 || skill.accuracy <= 0 || skill.accuracy > 100) errors.push(`skill ${id}: invalid values`);
    if (skill.status && !["burn", "soak", "bind", "daze", "ward", "bless"].includes(skill.status)) errors.push(`skill ${id}: invalid status`);
    if (skill.statusChance !== undefined && (skill.statusChance < 0 || skill.statusChance > 100)) errors.push(`skill ${id}: invalid status chance`);
  }
  for (const [id, item] of Object.entries(itemsTable)) {
    if (id !== item.id || !ITEM_KINDS.has(item.kind) || item.price < 0 || !Number.isFinite(item.price)) errors.push(`item ${id}: invalid identity/economy`);
    if (item.power !== undefined && (!Number.isFinite(item.power) || item.power < 0)) errors.push(`item ${id}: invalid power`);
  }
  for (const [id, map] of Object.entries(mapsTable)) {
    if (id !== map.id || !mapIsRectangular(map) || !canStandAt(map, map.spawn.x, map.spawn.y)) errors.push(`map ${id}: invalid shape or spawn`);
    validateEncounterEntries(`map ${id}: invalid encounter`, map.encounters, speciesTable, graph.entries, errors, true);
    for (const region of map.encounterRegions ?? []) {
      if (region.w <= 0 || region.h <= 0 || region.x < 0 || region.y < 0) errors.push(`map ${id}: invalid encounter region ${region.id}`);
      validateEncounterEntries(`map ${id}: invalid encounter region ${region.id}`, region.encounters, speciesTable, graph.entries, errors, false);
    }
    for (const warp of map.warps) {
      const destination = mapsTable[warp.to];
      if (!canStandAt(map, warp.x, warp.y) || !destination || !canStandAt(destination, warp.tx, warp.ty)) errors.push(`map ${id}: invalid warp`);
    }
  }
  for (const [encId, def] of Object.entries(fixedEncounters)) {
    const map = mapsTable[def.mapId];
    if (!map) errors.push(`encounter ${encId}: unknown map ${def.mapId}`);
    for (const foe of def.foes) {
      if (!speciesIds.has(foe.speciesId)) errors.push(`encounter ${encId}: unknown species ${foe.speciesId}`);
    }
    if (def.onceFlag && typeof def.onceFlag !== "string") errors.push(`encounter ${encId}: invalid once flag`);
  }
  for (const [id, element] of Object.entries(elements)) {
    const clash = element.strong.filter((target) => element.weak.includes(target));
    if (clash.length) errors.push(`element ${id}: ${clash.join(", ")} listed as both strong and weak (weak is unreachable)`);
  }
  errors.push(...validateInteractions(mapsTable));
  return errors;
}

export function assertContentValid(): void {
  const errors = validateContent();
  if (errors.length) throw new Error(`Content validation failed:\n${errors.join("\n")}`);
}
