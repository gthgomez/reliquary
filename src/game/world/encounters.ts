import type { MapDef } from "../types.ts";
import type { RandomSource } from "../rng.ts";

export interface EncounterDefinition {
  rate: number;
  encounters: { species: string; min: number; max: number; w: number }[];
}

export interface EncounterRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tiles: string[];
  rate: number;
  encounters: { species: string; min: number; max: number; w: number }[];
}

function inRegion(region: EncounterRegion, x: number, y: number): boolean {
  return x >= region.x && x < region.x + region.w && y >= region.y && y < region.y + region.h;
}

export function encounterAt(map: MapDef, x: number, y: number): EncounterDefinition | null {
  const regions = map.encounterRegions ?? [];
  for (const region of regions) {
    if (!inRegion(region, x, y)) continue;
    const tile = map.ground[y]?.[x] ?? "";
    if (!region.tiles.includes(tile)) return { rate: 0, encounters: [] };
    return { rate: region.rate, encounters: region.encounters };
  }
  const tile = map.ground[y]?.[x] ?? "";
  const allow = map.encounterTiles ?? [",", "m"];
  if (!allow.includes(tile)) return null;
  return { rate: map.encounterRate, encounters: map.encounters };
}

export function rollEncounter(
  def: EncounterDefinition,
  random: RandomSource,
): { species: string; level: number } | null {
  if (def.rate <= 0 || def.encounters.length === 0) return null;
  if (random() >= def.rate) return null;
  const total = def.encounters.reduce((s, e) => s + e.w, 0);
  let r = random() * total;
  let pick = def.encounters[0]!;
  for (const e of def.encounters) {
    r -= e.w;
    if (r <= 0) {
      pick = e;
      break;
    }
  }
  const level = pick.min + Math.floor(random() * (pick.max - pick.min + 1));
  return { species: pick.species, level };
}

export type BattleCommand = "Strike" | "Skill" | "Item" | "Bind" | "Party" | "Flee";

/** Binding sigils in menu order; filtered by inventory at presentation time. */
export const BATTLE_SIGILS = ["common_sigil", "thorn_sigil", "relic_sigil"] as const;

export function battleCommands(battle: { canBind: boolean; canFlee: boolean }): BattleCommand[] {
  const cmds: BattleCommand[] = ["Strike", "Skill", "Item"];
  if (battle.canBind) cmds.push("Bind");
  cmds.push("Party");
  if (battle.canFlee) cmds.push("Flee");
  return cmds;
}
