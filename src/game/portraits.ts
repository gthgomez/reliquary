/** One registry for art, placed identities and safe generic role fallbacks.
 * Never resolve from speaker names or dialogue scripts. An unknown elder or
 * warden must not borrow Maren's or Cael's face.
 */
type PortraitSpec = {
  src: string;
  role: string;
  npcIds: readonly string[];
  sprites: readonly string[];
};

export const PORTRAITS = {
  "elder-maren": {
    src: "/game/portraits/maren.svg",
    role: "Elder of Hollowmere",
    npcIds: ["maren", "maren2"],
    sprites: [],
  },
  "warden-cael": {
    src: "/game/portraits/cael.svg",
    role: "Warden of Thornkeep",
    npcIds: ["cael", "cael_hall"],
    sprites: [],
  },
  guard: {
    src: "/game/portraits/guard.svg",
    role: "Keeper of the gate",
    npcIds: ["guard", "keep_guard"],
    sprites: ["guard"],
  },
  traveler: {
    src: "/game/portraits/traveler.svg",
    role: "A voice of the old roads",
    npcIds: ["villager", "road_traveler", "fen_walker"],
    sprites: ["traveler"],
  },
  innkeep: {
    src: "/game/portraits/innkeep.svg",
    role: "Keeper of the hearth",
    npcIds: ["innkeep", "keep_innkeep"],
    sprites: ["innkeep"],
  },
  shopkeep: {
    src: "/game/portraits/shopkeep.svg",
    role: "Provisions for the road",
    npcIds: ["shopkeep", "keep_shop"],
    sprites: ["shopkeep"],
  },
  patch: {
    src: "/game/portraits/patch.svg",
    role: "Goblin trader of Briar Camp",
    npcIds: ["goblin_trader"],
    sprites: [],
  },
} as const satisfies Record<string, PortraitSpec>;

export type PortraitKey = keyof typeof PORTRAITS;
const entries = Object.entries(PORTRAITS) as [PortraitKey, PortraitSpec][];

export function resolveNpcPortrait(
  npcId: string | null | undefined,
  sprite: string | null | undefined,
): PortraitKey | null {
  if (!npcId) return null;
  return (
    entries.find(([, spec]) => spec.npcIds.includes(npcId))?.[0] ??
    entries.find(([, spec]) => !!sprite && spec.sprites.includes(sprite))?.[0] ??
    null
  );
}
