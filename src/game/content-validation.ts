import { ELEMENTS, ITEMS, SKILLS, SPECIES } from "./content.ts";
import { MAPS } from "./maps.ts";
import { mapIsRectangular, canStandAt } from "./systems/world.ts";

const SKILL_KINDS = new Set(["strike", "spell", "heal", "ward", "hex"]);
const ITEM_KINDS = new Set(["heal", "ether", "status", "revive", "field", "sigil", "key"]);

export function validateContent(): string[] {
  const errors: string[] = [];
  const speciesIds = new Set(Object.keys(SPECIES));
  const skillIds = new Set(Object.keys(SKILLS));
  for (const [id, species] of Object.entries(SPECIES)) {
    if (id !== species.id) errors.push(`species ${id}: id mismatch`);
    if (species.elements.length === 0 || species.elements.some((element) => !ELEMENTS[element])) errors.push(`species ${id}: invalid elements`);
    if (Object.values(species.base).some((value) => !Number.isFinite(value) || value <= 0)) errors.push(`species ${id}: invalid base stats`);
    if (species.catchRate <= 0 || species.catchRate > 255 || species.expYield <= 0) errors.push(`species ${id}: invalid catch/exp values`);
    let previousLevel = 0;
    for (const learn of species.learnset) {
      if (!skillIds.has(learn.skill) || learn.level < 1 || learn.level < previousLevel || learn.level > 40) errors.push(`species ${id}: invalid learnset entry`);
      previousLevel = learn.level;
    }
    if (species.evolves && (!speciesIds.has(species.evolves.into) || species.evolves.level < 1 || species.evolves.level > 40)) errors.push(`species ${id}: invalid evolution`);
  }
  for (const [id, skill] of Object.entries(SKILLS)) {
    if (id !== skill.id) errors.push(`skill ${id}: id mismatch`);
    if (!ELEMENTS[skill.element] || !SKILL_KINDS.has(skill.kind) || skill.power < 0 || skill.mp < 0 || skill.accuracy <= 0 || skill.accuracy > 100) errors.push(`skill ${id}: invalid values`);
    if (skill.status && !["burn", "soak", "bind", "daze", "ward", "bless"].includes(skill.status)) errors.push(`skill ${id}: invalid status`);
    if (skill.statusChance !== undefined && (skill.statusChance < 0 || skill.statusChance > 100)) errors.push(`skill ${id}: invalid status chance`);
  }
  for (const [id, item] of Object.entries(ITEMS)) {
    if (id !== item.id || !ITEM_KINDS.has(item.kind) || item.price < 0 || !Number.isFinite(item.price)) errors.push(`item ${id}: invalid identity/economy`);
    if (item.power !== undefined && (!Number.isFinite(item.power) || item.power < 0)) errors.push(`item ${id}: invalid power`);
  }
  for (const [id, map] of Object.entries(MAPS)) {
    if (id !== map.id || !mapIsRectangular(map) || !canStandAt(map, map.spawn.x, map.spawn.y)) errors.push(`map ${id}: invalid shape or spawn`);
    for (const encounter of map.encounters) {
      if (!speciesIds.has(encounter.species) || encounter.min < 1 || encounter.max < encounter.min || encounter.max > 40 || encounter.w <= 0) errors.push(`map ${id}: invalid encounter`);
    }
    for (const warp of map.warps) {
      const destination = MAPS[warp.to];
      if (!canStandAt(map, warp.x, warp.y) || !destination || !canStandAt(destination, warp.tx, warp.ty)) errors.push(`map ${id}: invalid warp`);
    }
  }
  return errors;
}

export function assertContentValid(): void {
  const errors = validateContent();
  if (errors.length) throw new Error(`Content validation failed:\n${errors.join("\n")}`);
}
