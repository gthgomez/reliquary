/**
 * Data-driven NPC portrait registry for the dialogue focus scene.
 *
 * Identity flows from the map's stable `MapNpc.id` (and, as a fallback, the
 * overworld sprite key) — never from the displayed speaker name, which is
 * duplicated across characters ("Elder Maren" appears as both `maren` and
 * `maren2`, "Innmother" as `innkeep` and `keep_innkeep`, and the goblin
 * trader Patch reuses the human `shopkeep` sprite).
 *
 * Two named characters have original authored artwork (`elder-maren`,
 * `warden-cael`). Every other NPC resolves to a cohesive tinted-sigil
 * silhouette. Narrator, sign, object, system and creature dialogue resolves
 * to `null` and renders text-only.
 */

export type PortraitKey =
  | "elder-maren"
  | "warden-cael"
  | "sigil-elder"
  | "sigil-guard"
  | "sigil-traveler"
  | "sigil-innkeep"
  | "sigil-shopkeep"
  | "sigil-warden"
  | "sigil-goblin";

/** Authored, detailed face/upper-body artwork (original inline SVG). */
export const AUTHORED_PORTRAITS: readonly PortraitKey[] = ["elder-maren", "warden-cael"];

/** Stable NPC id → portrait. Keyed by MapNpc.id from the map registry. */
export const NPC_PORTRAITS: Readonly<Record<string, PortraitKey>> = {
  maren: "elder-maren",
  maren2: "elder-maren",
  guard: "sigil-guard",
  villager: "sigil-traveler",
  innkeep: "sigil-innkeep",
  shopkeep: "sigil-shopkeep",
  road_traveler: "sigil-traveler",
  fen_walker: "sigil-traveler",
  cael: "warden-cael",
  cael_hall: "warden-cael",
  keep_guard: "sigil-guard",
  keep_innkeep: "sigil-innkeep",
  keep_shop: "sigil-shopkeep",
  goblin_trader: "sigil-goblin",
};

/** Cohesive sprite-kind fallback for NPCs absent from the id table. */
export const SPRITE_PORTRAITS: Readonly<Record<string, PortraitKey>> = {
  elder: "sigil-elder",
  guard: "sigil-guard",
  traveler: "sigil-traveler",
  innkeep: "sigil-innkeep",
  shopkeep: "sigil-shopkeep",
  warden: "sigil-warden",
};

/** Soft per-portrait glow behind the frame; authored art and sigils agree on tone. */
export const PORTRAIT_GLOW: Readonly<Record<PortraitKey, string>> = {
  "elder-maren": "rgba(255, 176, 88, 0.30)",
  "warden-cael": "rgba(126, 158, 205, 0.28)",
  "sigil-elder": "rgba(255, 190, 90, 0.20)",
  "sigil-guard": "rgba(140, 170, 220, 0.20)",
  "sigil-traveler": "rgba(170, 130, 210, 0.20)",
  "sigil-innkeep": "rgba(255, 200, 120, 0.20)",
  "sigil-shopkeep": "rgba(150, 210, 180, 0.18)",
  "sigil-warden": "rgba(150, 170, 210, 0.20)",
  "sigil-goblin": "rgba(170, 210, 110, 0.20)",
};

export interface SigilSpec {
  /** Bust gradient stops, lit edge first. */
  body: readonly [string, string];
  rim: string;
  emblem: string;
  /** Chest sigil shape: lantern, shield, leaf, mug, coin, thorn or goblin. */
  mark: "lantern" | "shield" | "leaf" | "mug" | "coin" | "thorn" | "goblin";
  /** Pointed ear spikes on the hood silhouette (goblin kin). */
  ears?: boolean;
}

/** Tinted silhouette treatment shared by every non-authored NPC. */
export const SIGIL_SPECS: Readonly<Record<string, SigilSpec>> = {
  "sigil-elder": {
    body: ["#b3ab99", "#6a6455"],
    rim: "#e8ddc4",
    emblem: "#e0b25e",
    mark: "lantern",
  },
  "sigil-guard": {
    body: ["#93a1bd", "#4d586e"],
    rim: "#c3d2e8",
    emblem: "#aebdd4",
    mark: "shield",
  },
  "sigil-traveler": {
    body: ["#a088b3", "#5d4c6b"],
    rim: "#d8c4e4",
    emblem: "#c8a8d8",
    mark: "leaf",
  },
  "sigil-innkeep": {
    body: ["#c49a6b", "#7d6242"],
    rim: "#ecd9b4",
    emblem: "#f0d8a8",
    mark: "mug",
  },
  "sigil-shopkeep": {
    body: ["#93a298", "#525c54"],
    rim: "#cfe0d4",
    emblem: "#a8d8c8",
    mark: "coin",
  },
  "sigil-warden": {
    body: ["#6d7892", "#3a4152"],
    rim: "#b8c4da",
    emblem: "#c98a4e",
    mark: "thorn",
  },
  "sigil-goblin": {
    body: ["#93b068", "#4d6336"],
    rim: "#d4e4b0",
    emblem: "#d8c86a",
    mark: "goblin",
    ears: true,
  },
};

/**
 * Resolve a portrait for the current speaker. An explicit portrait key wins
 * (engine-known character, e.g. Maren speaking after the starter pact), then
 * the stable npc id, then the sprite kind. Unknown identity returns null so
 * the UI renders the readable text-only bar instead of guessing.
 */
export function resolveNpcPortrait(
  npcId: string | null | undefined,
  sprite: string | null | undefined,
  explicit?: PortraitKey | null,
): PortraitKey | null {
  if (explicit) return explicit;
  if (npcId) {
    const byId = NPC_PORTRAITS[npcId];
    if (byId) return byId;
  }
  if (sprite) {
    const bySprite = SPRITE_PORTRAITS[sprite];
    if (bySprite) return bySprite;
  }
  return null;
}
