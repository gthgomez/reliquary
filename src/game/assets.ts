import { SPECIES } from "./content.ts";
import { GROUND_TILE } from "./maps.ts";
import { isElderhallCandidateBuild } from "./build-flags.ts";
export { isElderhallCandidateBuild } from "./build-flags.ts";

export type AssetEntry = { key: string; url: string; required: boolean };

const PLAYER_FRAMES = ["down", "left", "right", "up"] as const;
const NPC_SPRITES = ["elder", "innkeep", "shopkeep", "warden", "guard", "traveler"] as const;
const PROP_SPRITES = [
  "tree", "cottage", "inn", "shop", "shrine", "sign", "barrel", "crate", "shrub", "boulder",
  "well", "hearth", "bed", "bookshelf", "table", "chair", "counter", "pot", "fence", "tallgrass",
] as const;
const BG_KEYS = ["grass", "forest", "cave", "marsh", "keep"] as const;

export function collectGameAssets(options: { elderhallCandidate?: boolean } = {}): readonly AssetEntry[] {
  const out: AssetEntry[] = [
    { key: "title", url: "/game/bg/title.jpg", required: true },
    { key: "manifest_game", url: "/game/manifest.json", required: false },
  ];
  for (const tile of new Set(Object.values(GROUND_TILE))) {
    out.push({ key: `tile_${tile}`, url: `/game/tiles/${tile}.png`, required: true });
  }
  for (const d of PLAYER_FRAMES) {
    for (let i = 0; i < 4; i++) {
      out.push({ key: `player_${d}${i}`, url: `/game/sprites/player/${d}${i}.png`, required: true });
    }
  }
  for (const id of Object.keys(SPECIES)) {
    out.push({ key: `sprite_${id}`, url: `/game/sprites/${id}.png`, required: true });
  }
  for (const n of NPC_SPRITES) {
    out.push({ key: `npc_${n}`, url: `/game/sprites/npc/${n}.png`, required: true });
  }
  for (const p of PROP_SPRITES) {
    out.push({ key: `prop_${p}`, url: `/game/props/${p}.png`, required: true });
  }
  if (options.elderhallCandidate ?? isElderhallCandidateBuild()) {
    for (const id of ["grass-atlas", "dirt-atlas", "stone-atlas", "well-reference", "cottage-reference", "tree-reference", "gate-reference", "bench", "flowers"]) {
      const kind = id.endsWith("-atlas") ? "tile" : "prop";
      out.push({ key: `${kind}_elderhall-${id}`, url: `/game/elderhall/assets/elderhall.${id}.png`, required: true });
    }
  }
  for (const bg of BG_KEYS) {
    out.push({ key: `bg_${bg}`, url: `/game/bg/bg_${bg}.jpg`, required: true });
  }
  out.push({ key: "ui_panel", url: "/game/ui/panel.png", required: false });
  const seen = new Set<string>();
  return out.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}

export type AssetLoadReport = {
  loaded: number;
  requiredFailures: string[];
  optionalFailures: string[];
};
