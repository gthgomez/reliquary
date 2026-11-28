import { ELEMENTS, MAX_LEVEL, STAT_KEYS } from "../content.ts";
import type { ElementId, MapDef, Species } from "../types.ts";

export type ProgressionCategory =
  | "three_stage_first"
  | "three_stage_second"
  | "three_stage_final"
  | "two_stage_first"
  | "two_stage_final"
  | "single_stage"
  | "variant"
  | "exceptional";

export const CATEGORY_LABELS: Record<ProgressionCategory, string> = {
  three_stage_first: "First stage (3-stage line)",
  three_stage_second: "Second stage (3-stage line)",
  three_stage_final: "Final evolved form (3-stage line)",
  two_stage_first: "First stage (2-stage line)",
  two_stage_final: "Evolved form (2-stage line)",
  single_stage: "Single-stage species",
  variant: "Regional / corrupted variant",
  exceptional: "Exceptional / legendary",
};

export interface DerivedSpeciesProgression {
  id: string;
  name: string;
  category: ProgressionCategory;
  stage: number;
  familyLength: number;
  familyRoot: string;
  familyIds: string[];
  evolvedFrom: { id: string; level: number } | null;
  evolvesInto: { id: string; level: number } | null;
  minAttainableLevel: number;
  isTerminal: boolean;
  bst: number;
}

export interface EvolutionGraphAnalysis {
  errors: string[];
  entries: Record<string, DerivedSpeciesProgression>;
}

export function baseStatTotal(species: Pick<Species, "base">): number {
  return STAT_KEYS.reduce((sum, key) => sum + species.base[key], 0);
}

/**
 * Derive progression categories, stage numbers, family chains, and minimum
 * attainable levels directly from the authoritative evolution graph.
 */
export function analyzeEvolutionGraph(
  speciesTable: Record<string, Species>,
  maxLevel = MAX_LEVEL,
): EvolutionGraphAnalysis {
  const errors: string[] = [];
  const entries: Record<string, DerivedSpeciesProgression> = {};
  const incoming = new Map<string, { from: string; level: number }[]>();

  for (const id of Object.keys(speciesTable)) {
    incoming.set(id, []);
  }

  for (const [id, sp] of Object.entries(speciesTable)) {
    if (sp.evolves) {
      if (!speciesTable[sp.evolves.into]) {
        errors.push(`species ${id}: unknown evolution target "${sp.evolves.into}"`);
      } else if (sp.evolves.into === id) {
        errors.push(`species ${id}: self-referential evolution cycle`);
      } else {
        incoming.get(sp.evolves.into)!.push({ from: id, level: sp.evolves.level });
      }
      if (!Number.isInteger(sp.evolves.level) || sp.evolves.level < 2 || sp.evolves.level > maxLevel) {
        errors.push(`species ${id}: invalid evolution level ${sp.evolves.level}`);
      }
    }
    if (sp.variantOf !== undefined) {
      const base = speciesTable[sp.variantOf];
      if (!base) {
        errors.push(`species ${id}: unknown variantOf target "${sp.variantOf}"`);
      } else if (sp.variantOf === id) {
        errors.push(`species ${id}: variantOf cannot reference itself`);
      } else if (base.variantOf) {
        errors.push(`species ${id}: variantOf "${sp.variantOf}" is itself a variant`);
      }
    }
    const isExceptional = sp.collection === "legend" || sp.progressionRole === "exceptional";
    if (isExceptional && sp.variantOf) {
      errors.push(`species ${id}: classification conflict between exceptional/legend and variant`);
    }
    if (isExceptional && sp.evolves) {
      errors.push(`species ${id}: classification conflict — exceptional species cannot evolve`);
    }
    if (sp.variantOf && sp.evolves) {
      errors.push(`species ${id}: classification conflict — variant species cannot define separate evolution`);
    }
  }

  for (const [id, parents] of incoming.entries()) {
    if (parents.length > 1) {
      errors.push(
        `species ${id}: multiple incoming evolutions (${parents.map((p) => p.from).join(", ")})`,
      );
    }
    const sp = speciesTable[id]!;
    if (parents.length > 0 && (sp.variantOf || sp.collection === "legend" || sp.progressionRole === "exceptional")) {
      errors.push(`species ${id}: evolved target conflicts with variant/exceptional classification`);
    }
  }

  // Detect graph cycles across all nodes.
  const visitState = new Map<string, "visiting" | "done">();
  for (const startId of Object.keys(speciesTable)) {
    if (visitState.has(startId)) continue;
    const trail = new Set<string>();
    let cur: string | undefined = startId;
    while (cur && speciesTable[cur]) {
      if (visitState.get(cur) === "done") break;
      if (trail.has(cur)) {
        errors.push(`evolution cycle involving "${cur}"`);
        break;
      }
      trail.add(cur);
      visitState.set(cur, "visiting");
      cur = speciesTable[cur]!.evolves?.into;
    }
    for (const node of trail) visitState.set(node, "done");
  }

  // Build derived chain info per species without trusting manual redundancy.
  for (const [id, sp] of Object.entries(speciesTable)) {
    const ancestors: string[] = [];
    const seenBackward = new Set<string>([id]);
    let walkBack = id;
    while (true) {
      const parents = incoming.get(walkBack) ?? [];
      if (parents.length !== 1) break;
      const parentId = parents[0]!.from;
      if (seenBackward.has(parentId)) break;
      seenBackward.add(parentId);
      ancestors.unshift(parentId);
      walkBack = parentId;
    }

    const descendants: string[] = [];
    const seenForward = new Set<string>([id]);
    let walkForward = sp.evolves?.into;
    while (walkForward && speciesTable[walkForward] && !seenForward.has(walkForward)) {
      seenForward.add(walkForward);
      descendants.push(walkForward);
      walkForward = speciesTable[walkForward]!.evolves?.into;
    }

    const familyIds = [...ancestors, id, ...descendants];
    if (ancestors.length === 0 && familyIds.length > 3) {
      errors.push(`family ${id}: evolution chain length ${familyIds.length} exceeds supported maximum (3)`);
    }

    // Verify strictly increasing evolution thresholds along each chain.
    if (ancestors.length === 0 && familyIds.length >= 2) {
      let prevEvo = 0;
      for (let i = 0; i < familyIds.length - 1; i += 1) {
        const evo = speciesTable[familyIds[i]!]!.evolves?.level ?? 0;
        if (evo <= prevEvo) {
          errors.push(`family ${id}: non-increasing evolution level ${evo} after ${prevEvo}`);
        }
        prevEvo = evo;
      }
    }

    const parent = incoming.get(id)?.[0] ?? null;
    const minAttainableLevel = ancestors.reduce((min, ancId) => {
      const evoLvl = speciesTable[ancId]!.evolves?.level ?? 1;
      return Math.max(min, evoLvl);
    }, 1);

    const familyLength = familyIds.length;
    const stage = ancestors.length + 1;
    let category: ProgressionCategory;
    if (sp.collection === "legend" || sp.progressionRole === "exceptional") {
      category = "exceptional";
    } else if (sp.variantOf) {
      category = "variant";
    } else if (familyLength >= 3) {
      category = stage === 1 ? "three_stage_first" : stage === 2 ? "three_stage_second" : "three_stage_final";
    } else if (familyLength === 2) {
      category = stage === 1 ? "two_stage_first" : "two_stage_final";
    } else {
      category = "single_stage";
    }

    entries[id] = {
      id,
      name: sp.name,
      category,
      stage,
      familyLength,
      familyRoot: familyIds[0]!,
      familyIds,
      evolvedFrom: parent ? { id: parent.from, level: parent.level } : null,
      evolvesInto: sp.evolves ? { id: sp.evolves.into, level: sp.evolves.level } : null,
      minAttainableLevel,
      isTerminal: !sp.evolves,
      bst: baseStatTotal(sp),
    };
  }

  return { errors, entries };
}

export function elementMatchups(
  elements: readonly ElementId[],
  elementTable: typeof ELEMENTS = ELEMENTS,
): { strongAgainst: string[]; weakAgainst: string[] } {
  const strongSet = new Set<string>();
  const weakSet = new Set<string>();
  for (const el of elements) {
    const def = elementTable[el];
    if (!def) continue;
    for (const target of def.strong) strongSet.add(elementTable[target]?.name ?? target);
  }
  for (const candidate of Object.values(elementTable)) {
    if (elements.some((el) => candidate.strong.includes(el))) {
      weakSet.add(candidate.name);
    }
  }
  return { strongAgainst: [...strongSet], weakAgainst: [...weakSet] };
}

export function speciesHabitats(
  speciesId: string,
  maps: Record<string, MapDef>,
): string[] {
  const places = new Set<string>();
  for (const map of Object.values(maps)) {
    if (map.encounterRate > 0 && map.encounters.some((enc) => enc.species === speciesId)) {
      places.add(map.name);
      continue;
    }
    if (
      map.encounterRegions?.some(
        (reg) => reg.rate > 0 && reg.encounters.some((enc) => enc.species === speciesId),
      )
    ) {
      places.add(map.name);
    }
  }
  return [...places];
}

export function formatEvolutionLine(
  speciesId: string,
  speciesTable: Record<string, Species>,
  entries: Record<string, DerivedSpeciesProgression>,
): string {
  const entry = entries[speciesId];
  if (!entry) return "";
  if (entry.familyLength <= 1) {
    const baseName = entry.category === "variant" && speciesTable[speciesId]?.variantOf
      ? speciesTable[speciesTable[speciesId]!.variantOf!]?.name
      : null;
    if (baseName) return `Regional variant of ${baseName}`;
    return entry.category === "exceptional" ? "Unique / legendary creature" : "Single-stage creature (does not evolve)";
  }
  const parts: string[] = [];
  for (let i = 0; i < entry.familyIds.length; i += 1) {
    const id = entry.familyIds[i]!;
    const sp = speciesTable[id];
    const name = sp?.name ?? id;
    if (i === 0) parts.push(name);
    else {
      const prev = speciesTable[entry.familyIds[i - 1]!];
      const evoLvl = prev?.evolves?.level;
      parts.push(evoLvl ? `${name} (Lv ${evoLvl})` : name);
    }
  }
  return parts.join(" -> ");
}
