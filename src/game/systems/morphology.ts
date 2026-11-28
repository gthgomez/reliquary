import type { RandomSource } from "../rng.ts";
import { mathRandom } from "../rng.ts";
import type { Beast, CreatureMorphology, Species, SpeciesRecord } from "../types.ts";

export const NEUTRAL_MORPHOLOGY: CreatureMorphology = { size: 1, mass: 1 };

export const MORPHOLOGY_SIZE_MIN = 0.78;
export const MORPHOLOGY_SIZE_MAX = 1.24;
export const MORPHOLOGY_MASS_MIN = 0.56;
export const MORPHOLOGY_MASS_MAX = 1.75;

export type BuildClass = "Miniature" | "Small" | "Lean" | "Typical" | "Sturdy" | "Large" | "Colossal";

export type DiscoveryKnowledge = "undiscovered" | "encountered" | "full";

export interface DescribedMorphology {
  size: number;
  mass: number;
  sizeCm: number;
  weightKg: number;
  measurementLabel: "Height" | "Length";
  build: BuildClass;
  isRare: boolean;
  rareLabel: "Miniature" | "Colossal" | null;
  hpDeltaPct: number;
  atkDeltaPct: number;
  defDeltaPct: number;
  spdDeltaPct: number;
  lckDeltaPct: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round3 = (value: number): number => Math.round(value * 1000) / 1000;
const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Generates correlated, bounded relative size and mass around 1.0.
 * Most individuals fall near ~0.92-1.08; ~6% tail spawns rare miniature/colossal builds.
 */
export function generateMorphology(
  random: RandomSource = mathRandom,
  opts?: { tier?: "ordinary" | "miniature" | "colossal" },
): CreatureMorphology {
  const tierRoll = opts?.tier ?? (random() < 0.03 ? "miniature" : random() < 0.03 ? "colossal" : "ordinary");
  let size: number;
  if (tierRoll === "miniature") {
    size = 0.79 + random() * 0.06; // 0.79..0.85
  } else if (tierRoll === "colossal") {
    size = 1.15 + random() * 0.08; // 1.15..1.23
  } else {
    // Triangular distribution around 1.0 (0.88..1.12)
    const u = (random() + random()) / 2;
    size = 0.88 + u * 0.24;
  }
  const leanFactor = 0.94 + random() * 0.12; // +-6% independent frame density
  const rawMass = Math.pow(size, 2.25) * leanFactor;
  return {
    size: round3(clamp(size, MORPHOLOGY_SIZE_MIN, MORPHOLOGY_SIZE_MAX)),
    mass: round3(clamp(rawMass, MORPHOLOGY_MASS_MIN, MORPHOLOGY_MASS_MAX)),
  };
}

/**
 * Derive balanced combat stat multipliers from individual morphology.
 * Trade-off prevents gigantic or tiny specimens from strictly dominating overall:
 * - Larger / heavier: +HP (up to +5%), +ATK (+3%), +DEF (+3%), -SPD (up to -6%)
 * - Smaller / lighter: +SPD (up to +6%), -HP (-5%), -ATK (-3%), -DEF (-3%)
 * Uses normalized relative within-species build, never cross-species absolute size.
 */
export function morphologyStatMultipliers(morphology?: CreatureMorphology): {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  lck: number;
} {
  if (!morphology) return { hp: 1, atk: 1, def: 1, spd: 1, lck: 1 };
  const sizeOffset = clamp(morphology.size - 1, -0.22, 0.24);
  // Blend linear size and cube-root mass offset so weight & frame agree without double counting.
  const massLinearOffset = clamp(Math.cbrt(Math.max(0.25, morphology.mass)) - 1, -0.22, 0.24);
  const composite = clamp((sizeOffset * 0.65 + massLinearOffset * 0.35) / 0.18, -1, 1);
  return {
    hp: 1 + 0.04 * composite,
    atk: 1 + 0.02 * composite,
    def: 1 + 0.02 * composite,
    spd: 1 - 0.06 * composite,
    lck: 1 - 0.04 * composite,
  };
}

export function classifyBuild(morphology?: CreatureMorphology): {
  build: BuildClass;
  isRare: boolean;
  rareLabel: "Miniature" | "Colossal" | null;
} {
  const size = morphology?.size ?? 1;
  const mass = morphology?.mass ?? 1;
  if (size <= 0.85) return { build: "Miniature", isRare: true, rareLabel: "Miniature" };
  if (size >= 1.15) return { build: "Colossal", isRare: true, rareLabel: "Colossal" };
  if (size <= 0.93) return { build: "Small", isRare: false, rareLabel: null };
  if (size >= 1.07) return { build: "Large", isRare: false, rareLabel: null };
  const expectedMass = Math.pow(size, 2.25);
  if (mass < expectedMass * 0.945) return { build: "Lean", isRare: false, rareLabel: null };
  if (mass > expectedMass * 1.055) return { build: "Sturdy", isRare: false, rareLabel: null };
  return { build: "Typical", isRare: false, rareLabel: null };
}

export function describeMorphology(
  beast: Pick<Beast, "morphology">,
  species: Pick<Species, "dimensions">,
): DescribedMorphology {
  const morph = beast.morphology ?? NEUTRAL_MORPHOLOGY;
  const mods = morphologyStatMultipliers(morph);
  const { build, isRare, rareLabel } = classifyBuild(morph);
  const sizeCm = Math.max(5, Math.round(species.dimensions.typicalSizeCm * morph.size));
  const weightKg = Math.max(0.2, round1(species.dimensions.typicalWeightKg * morph.mass));
  return {
    size: morph.size,
    mass: morph.mass,
    sizeCm,
    weightKg,
    measurementLabel: species.dimensions.measurement === "length" ? "Length" : "Height",
    build,
    isRare,
    rareLabel,
    hpDeltaPct: Math.round((mods.hp - 1) * 100),
    atkDeltaPct: Math.round((mods.atk - 1) * 100),
    defDeltaPct: Math.round((mods.def - 1) * 100),
    spdDeltaPct: Math.round((mods.spd - 1) * 100),
    lckDeltaPct: Math.round((mods.lck - 1) * 100),
  };
}

/** Conservative battle canvas scale multiplier (stays well within stage bounds). */
export function morphologyVisualScale(morphology?: CreatureMorphology): number {
  const size = morphology?.size ?? 1;
  return round3(clamp(1 + (size - 1) * 0.42, 0.9, 1.1));
}

export function formatSizeCm(cm: number): string {
  if (cm >= 100) return `${(cm / 100).toFixed(2)} m`;
  return `${Math.round(cm)} cm`;
}

export function formatWeightKg(kg: number): string {
  return `${round1(kg).toFixed(1)} kg`;
}

export function recordSpeciesEncounter(
  records: Record<string, SpeciesRecord>,
  speciesId: string,
  sizeCm?: number,
): Record<string, SpeciesRecord> {
  const prev = records[speciesId] ?? {};
  const next: SpeciesRecord = { ...prev };
  if (sizeCm !== undefined && Number.isFinite(sizeCm) && sizeCm > 0) {
    next.encounteredMinCm = prev.encounteredMinCm === undefined ? sizeCm : Math.min(prev.encounteredMinCm, sizeCm);
    next.encounteredMaxCm = prev.encounteredMaxCm === undefined ? sizeCm : Math.max(prev.encounteredMaxCm, sizeCm);
  }
  return { ...records, [speciesId]: next };
}

export function recordSpeciesBind(
  records: Record<string, SpeciesRecord>,
  beast: Pick<Beast, "speciesId" | "morphology">,
  species: Pick<Species, "dimensions">,
): Record<string, SpeciesRecord> {
  const prev = records[beast.speciesId] ?? {};
  const { sizeCm, weightKg } = describeMorphology(beast, species);
  const next: SpeciesRecord = {
    ...prev,
    smallestCm: prev.smallestCm === undefined ? sizeCm : Math.min(prev.smallestCm, sizeCm),
    largestCm: prev.largestCm === undefined ? sizeCm : Math.max(prev.largestCm, sizeCm),
    lightestKg: prev.lightestKg === undefined ? weightKg : Math.min(prev.lightestKg, weightKg),
    heaviestKg: prev.heaviestKg === undefined ? weightKg : Math.max(prev.heaviestKg, weightKg),
    boundCount: (prev.boundCount ?? 0) + 1,
  };
  return { ...records, [beast.speciesId]: next };
}

export function recordSpeciesDefeat(
  records: Record<string, SpeciesRecord>,
  speciesId: string,
): Record<string, SpeciesRecord> {
  const prev = records[speciesId] ?? {};
  return {
    ...records,
    [speciesId]: { ...prev, defeatedCount: (prev.defeatedCount ?? 0) + 1 },
  };
}

export function recordSpeciesHabitat(
  habitats: Record<string, string[]>,
  speciesId: string,
  placeName: string,
): Record<string, string[]> {
  if (!placeName.trim()) return habitats;
  const current = habitats[speciesId] ?? [];
  if (current.includes(placeName)) return habitats;
  return { ...habitats, [speciesId]: [...current, placeName] };
}

export function discoveryKnowledgeLevel(
  speciesId: string,
  seen: Record<string, boolean>,
  caught: Record<string, boolean>,
  records: Record<string, SpeciesRecord>,
  species?: Pick<Species, "collection">,
): DiscoveryKnowledge {
  if (caught[speciesId]) return "full";
  if (species?.collection === "legend" && (records[speciesId]?.defeatedCount ?? 0) > 0) return "full";
  if (seen[speciesId]) return "encountered";
  return "undiscovered";
}
