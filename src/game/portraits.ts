/** Resolve named artwork from a placed identity, never from a shared world sprite. */
type PortraitSpec = {
  src: string | null;
  pixel?: string;
  role: string;
  npcIds: readonly string[];
};

export const PORTRAITS = {
  "elder-maren": {
    src: "/game/portraits/maren.svg",
    role: "Elder of Hollowmere",
    npcIds: ["maren", "maren2"],
  },
  "warden-cael": {
    src: "/game/portraits/cael.svg",
    role: "Warden of Thornkeep",
    npcIds: ["cael", "cael_hall"],
  },
  guard: {
    src: "/game/portraits/guard.svg",
    role: "Keeper of the gate",
    npcIds: ["guard"],
  },
  "keep-guard": {
    src: "/game/portraits/guard.svg",
    pixel: "keep_guard",
    role: "Thornkeep guard",
    npcIds: ["keep_guard"],
  },
  traveler: {
    src: "/game/portraits/traveler.svg",
    role: "Wayfarer on Briar Road",
    npcIds: ["road_traveler"],
  },
  lise: {
    src: "/game/portraits/traveler.svg",
    pixel: "lise",
    role: "Elderhall villager",
    npcIds: ["villager"],
  },
  reedcutter: {
    src: "/game/portraits/traveler.svg",
    pixel: "reedcutter",
    role: "Reed-cutter of Mirefen",
    npcIds: ["fen_walker"],
  },
  innkeep: {
    src: "/game/portraits/innkeep.svg",
    role: "Keeper of the hearth",
    npcIds: ["innkeep"],
  },
  "keep-innkeep": {
    src: "/game/portraits/innkeep.svg",
    pixel: "keep_innkeep",
    role: "Keeper of Thornkeep's inn",
    npcIds: ["keep_innkeep"],
  },
  shopkeep: {
    src: "/game/portraits/shopkeep.svg",
    role: "Provisions for the road",
    npcIds: ["shopkeep"],
  },
  chandler: {
    src: "/game/portraits/shopkeep.svg",
    pixel: "chandler",
    role: "Thornkeep chandler",
    npcIds: ["keep_shop"],
  },
  patch: {
    src: "/game/portraits/patch.svg",
    role: "Goblin trader of Briar Camp",
    npcIds: ["goblin_trader"],
  },
  rowan: {
    src: null,
    pixel: "rowan",
    role: "Pactwarden",
    npcIds: ["rowan"],
  },
} as const satisfies Record<string, PortraitSpec>;

export type PortraitKey = keyof typeof PORTRAITS;
const entries = Object.entries(PORTRAITS) as [PortraitKey, PortraitSpec][];

export function portraitSource(key: PortraitKey, pixelArt: true): string;
export function portraitSource(key: PortraitKey, pixelArt: false): string | null;
export function portraitSource(key: PortraitKey, pixelArt: boolean): string | null {
  const spec: PortraitSpec = PORTRAITS[key];
  if (!pixelArt) return spec.src;
  const file = spec.pixel ?? spec.src?.slice("/game/portraits/".length, -4);
  return `/game/elderhall/portraits/${file}.png`;
}

export const ELDERHALL_PORTRAIT_URLS = entries.map(([key]) => portraitSource(key, true));

export function resolveNpcPortrait(
  npcId: string | null | undefined,
  _sprite: string | null | undefined,
): PortraitKey | null {
  if (!npcId) return null;
  return entries.find(([, spec]) => spec.npcIds.includes(npcId))?.[0] ?? null;
}
