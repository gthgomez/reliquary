import type { FixedEncounterDef } from "./types.ts";

export const FIXED_ENCOUNTERS: Record<string, FixedEncounterDef> = {
  slime_king: {
    id: "slime_king",
    kind: "boss",
    mapId: "crownpool",
    foes: [{ speciesId: "slime_king", level: 12 }],
    canBind: false,
    canFlee: true,
    requiredFlags: ["starter"],
    onceFlag: "defeated_slime_king",
    rewards: { gold: 60, items: { thorn_sigil: 2 } },
    intro: [
      "The basin stills. Relic-light gathers on the islet.",
      "Slime King rises — one colony, many crowns of glass.",
    ],
  },
  goblin_scout: {
    id: "goblin_scout",
    kind: "warden",
    mapId: "briar_camp",
    foes: [
      { speciesId: "gutterrat", level: 8 },
      { speciesId: "galeskip", level: 9 },
    ],
    canBind: false,
    canFlee: true,
    requiredFlags: [],
    onceFlag: "defeated_goblin_scout",
    rewards: { gold: 30, items: { etherdrop: 1 } },
    intro: ["The scout clicks her nails on a pact-stone.", "Her Gutterrat lunges first."],
  },
  goblin_king: {
    id: "goblin_king",
    kind: "boss",
    mapId: "briar_camp",
    foes: [
      { speciesId: "gravegnaw", level: 13 },
      { speciesId: "rootwight", level: 14 },
    ],
    canBind: false,
    canFlee: true,
    requiredFlags: ["trial"],
    onceFlag: "defeated_goblin_king",
    rewards: { gold: 80, items: { relic_sigil: 1 } },
    intro: ["The Goblin King stands from the fire-circle.", "Gravegnaw and Rootwight answer his nod."],
  },
};
