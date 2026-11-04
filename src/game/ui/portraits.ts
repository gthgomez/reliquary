import type { PortraitId } from "../types.ts";

export type PortraitSpec = {
  role: string;
  accent: string;
  monogram: string;
  /**
   * Bespoke art shipped with the game. When absent the dialog uses the shared
   * hooded fallback, so a new NPC is never shown as a different character.
   */
  art: string | null;
};

export const PORTRAITS: Record<PortraitId, PortraitSpec> = {
  maren: {
    role: "Elder of Hollowmere",
    accent: "#7f9a68",
    monogram: "M",
    art: "/game/portraits/maren.svg",
  },
  cael: {
    role: "Warden of Thornkeep",
    accent: "#b26a45",
    monogram: "C",
    art: "/game/portraits/cael.svg",
  },
  guard: {
    role: "Gateward of Elderhall",
    accent: "#9a885d",
    monogram: "G",
    art: null,
  },
  "keep-guard": {
    role: "Guard of Thornkeep",
    accent: "#7f8494",
    monogram: "K",
    art: null,
  },
  innkeep: {
    role: "Keeper of the Quiet Lantern",
    accent: "#b0834f",
    monogram: "I",
    art: null,
  },
  shopkeep: {
    role: "Chandler of Calders'",
    accent: "#9b744c",
    monogram: "S",
    art: null,
  },
  lise: {
    role: "Traveller of Elderhall",
    accent: "#a58a72",
    monogram: "L",
    art: null,
  },
  wayfarer: {
    role: "Wayfarer of Briar Road",
    accent: "#7f8b72",
    monogram: "W",
    art: null,
  },
  reedcutter: {
    role: "Reed-cutter of Mirefen",
    accent: "#728476",
    monogram: "R",
    art: null,
  },
  scout: {
    role: "Scout of Briar Camp",
    accent: "#8d7759",
    monogram: "S",
    art: null,
  },
  "goblin-king": {
    role: "King of Briar Camp",
    accent: "#a05f3e",
    monogram: "K",
    art: null,
  },
  patch: {
    role: "Trader of Briar Camp",
    accent: "#94805e",
    monogram: "P",
    art: null,
  },
};

/**
 * Talk ids come from the map registry, not from rendered names. Two NPCs that
 * share a display name still keep their own entry and fallback treatment.
 */
const TALK_PORTRAITS: Record<string, PortraitId> = {
  maren: "maren",
  maren_guild: "maren",
  cael: "cael",
  cael_trial: "cael",
  guard: "guard",
  keep_guard: "keep-guard",
  innkeep: "innkeep",
  shopkeep: "shopkeep",
  lise: "lise",
  wayfarer: "wayfarer",
  reedcutter: "reedcutter",
  goblin_scout: "scout",
  goblin_king: "goblin-king",
  goblin_trader: "patch",
};

export function portraitForTalk(talkId: string): PortraitId | null {
  return TALK_PORTRAITS[talkId] ?? null;
}

export function portraitSpec(id: PortraitId): PortraitSpec {
  return PORTRAITS[id];
}
