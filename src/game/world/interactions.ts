import type { MapDef, MapNpc, MapObj } from "../types.ts";

export const WARP_TABLE: Record<string, [string, number, number]> = {
  enter_home: ["home", 5, 6],
  enter_guild: ["guild_in", 6, 8],
  enter_inn: ["inn_in", 6, 7],
  enter_shop: ["shop_in", 5, 6],
  enter_cave: ["ashenbarrow", 9, 16],
  enter_hall: ["warden_hall", 7, 10],
  enter_keep_inn: ["keep_inn", 6, 7],
  enter_keep_shop: ["keep_shop", 5, 6],
};

export const SIGN_TEXT: Record<string, string> = {
  sign_road: "BRIAR ROAD — north to Wildwood, east to Mirefen. Bind what you must.",
  sign_grove: "BINDING GROVE — first pacts are spoken here.",
  sign_grove_inner: "Choose with care. A first pact is a first name.",
  sign_briar: "Keep to the path after dusk. The grass remembers hunger.",
  sign_wildwood: "WILDWOOD — Ashenbarrow in the stone. Thornkeep beyond the trees.",
  sign_mire: "MIREFEN — watch your step. The peat is older than the keep.",
  sign_keep: "THORNKEEP — Warden Cael holds the first Mark.",
};

export const CHEST_LOOT: Record<string, [string, number]> = {
  chest_briar: ["thorn_sigil", 1],
  chest_wood: ["greater_tonic", 2],
  chest_mire: ["relic_sigil", 1],
  chest_cave: ["phoenix_ash", 1],
};

export function findInteractionTarget(
  map: MapDef,
  fx: number,
  fy: number,
): { npc: MapNpc | null; object: MapObj | null } {
  const npc = map.npcs.find((n) => n.x === fx && n.y === fy) ?? null;
  const object = npc ? null : (map.objects.find((o) => fx >= o.x && fx < o.x + o.w && fy >= o.y && fy < o.y + o.h) ?? null);
  return { npc, object };
}
