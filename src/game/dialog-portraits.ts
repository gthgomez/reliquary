/**
 * Data-driven NPC portrait registry for the dialogue close-up scene.
 *
 * Portrait identity is resolved from stable dialogue keys (the `talk` id in
 * `MapNpc`) and sprite-role keys — never from the display name string, so two
 * speakers that happen to share a name can never swap portraits. Keys without
 * an entry resolve to null and the dialog renders text-only (narrator, signs,
 * objects, system messages).
 */

export const PORTRAIT_DIR = "/game/portraits";

/** Hand-drawn character portraits for recurring named NPCs. */
export const NAMED_PORTRAITS = ["elder_maren", "warden_cael"] as const;

/** Cohesive role fallbacks keyed by the NPC sprite role. */
export const ROLE_PORTRAITS = ["guard", "traveler", "innkeep", "shopkeep"] as const;

export type PortraitKey = (typeof NAMED_PORTRAITS)[number] | (typeof ROLE_PORTRAITS)[number];

/** Dialogue key (`MapNpc.talk`) → portrait key. */
export const PORTRAIT_BY_TALK: Record<string, PortraitKey> = {
  maren: "elder_maren",
  maren_guild: "elder_maren",
  cael: "warden_cael",
  cael_trial: "warden_cael",
  guard: "guard",
  keep_guard: "guard",
  lise: "traveler",
  wayfarer: "traveler",
  reedcutter: "traveler",
  innkeep: "innkeep",
  shopkeep: "shopkeep",
};

const PORTRAIT_SRC: Record<PortraitKey, string> = {
  elder_maren: `${PORTRAIT_DIR}/elder-maren.svg`,
  warden_cael: `${PORTRAIT_DIR}/warden-cael.svg`,
  guard: `${PORTRAIT_DIR}/guard.svg`,
  traveler: `${PORTRAIT_DIR}/traveler.svg`,
  innkeep: `${PORTRAIT_DIR}/innkeep.svg`,
  shopkeep: `${PORTRAIT_DIR}/shopkeep.svg`,
};

/** Resolve the portrait asset for a dialogue key; null renders text-only. */
export function resolveNpcPortrait(talkId: string): PortraitKey | null {
  return PORTRAIT_BY_TALK[talkId] ?? null;
}

/** Resolve a portrait key to its asset URL; unknown keys render text-only. */
export function portraitSrc(key: string | null | undefined): string | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(PORTRAIT_SRC, key) ? PORTRAIT_SRC[key as PortraitKey] : null;
}
