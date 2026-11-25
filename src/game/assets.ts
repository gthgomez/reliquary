import { SPECIES } from "./content.ts";
import { GROUND_TILE, MAPS } from "./maps.ts";
import { isElderhallCandidateBuild } from "./build-flags.ts";
import { ELDERHALL_ENVIRONMENT_IDS, elderhallEnvironmentUrl } from "./elderhall-assets.ts";
import { ELDERHALL_PORTRAIT_URLS } from "./portraits.ts";
export { isElderhallCandidateBuild } from "./build-flags.ts";

export type AssetEntry = { key: string; url: string; required: boolean };

/** Art that must exist before any overworld scene can be entered. Battle and
 * creature art can finish later; world terrain, actors, props and candidate
 * Elderhall replacements cannot safely be omitted while collision is active. */
const WORLD_OBJECT_SPRITES = new Set(Object.values(MAPS).flatMap((map) => [
  ...(map?.objects ?? []).map((object) => `sprite_${object.sprite}`),
  ...(map?.npcs ?? []).map((npc) => `sprite_${npc.sprite}`),
]));

export function isEssentialWorldAsset(entry: AssetEntry): boolean {
  return /^(tile_|player_|prop_|npc_)/.test(entry.key) || WORLD_OBJECT_SPRITES.has(entry.key);
}

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
    for (const id of ELDERHALL_ENVIRONMENT_IDS) {
      const kind = id.endsWith("-atlas") ? "tile" : "prop";
      out.push({ key: `${kind}_elderhall-${id}`, url: elderhallEnvironmentUrl(id), required: true });
    }
    for (const url of ELDERHALL_PORTRAIT_URLS) {
      out.push({ key: `portrait_${url.slice(url.lastIndexOf("/") + 1, -4)}`, url, required: true });
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
