import type { Dir, MapDef, MapObj } from "../types.ts";
import { elderhallCandidateBench, elderhallCandidateGate, type VisualMetadata } from "../render/elderhall-visual.ts";

/** One source for preview door targets and their reciprocal outdoor return tiles. */
const CANDIDATE_DOORWAYS: Record<string, { interiorId: string; exteriorX: number }> = {
  h_home: { interiorId: "home", exteriorX: 5 },
  h_guild: { interiorId: "guild_in", exteriorX: 5 },
  h_inn: { interiorId: "inn_in", exteriorX: 16 },
  h_shop: { interiorId: "shop_in", exteriorX: 17 },
};

/** Preview-only composition; the production map and its save coordinates remain untouched. */
export function makeElderhallCandidate(base: MapDef, geometry?: Record<string, VisualMetadata>): MapDef {
  const ground = base.ground.map((row) => row.split(""));
  // A short westward connector removes the dogleg before the main crossroads.
  for (const x of [8, 9]) ground[10]![x] = "p";
  // The visual apron is baked over the existing dirt lane. Keep the underlying
  // path material continuous so its organic edge has no exposed tile halo.
  const moved: Record<string, { x: number; y: number }> = {
    green_tree: { x: 8, y: 12 }, well: { x: 14, y: 10 }, shrub2: { x: 15, y: 7 },
    lantern1: { x: 14, y: 4 },
  };
  const existing = base.objects.filter((object) => !["north_gate_candidate", "green_bench_candidate"].includes(object.id));
  const objects: MapObj[] = [elderhallCandidateGate(geometry?.["gate-reference"]), elderhallCandidateBench(geometry?.bench),
    ...existing.map((object) => {
      const updated = moved[object.id] ? { ...object, ...moved[object.id] } : object;
      const doorway = CANDIDATE_DOORWAYS[object.id];
      // Revision-5 replacement art paints three doors over the middle
      // footprint column. Candidate doors accept entry only from the south;
      // the legacy inn keeps its target but no longer accepts side entry.
      if (!doorway) return updated;
      return { ...updated,
        ...(updated.interactZone ? { interactZone: { ...updated.interactZone, x: doorway.exteriorX - updated.x } } : {}),
        interactDirections: [3 as Dir],
      };
    })];
  return {
    ...base,
    ground: ground.map((row) => row.join("")),
    objects,
    npcs: base.npcs.map((npc) => npc.id === "maren" ? { ...npc, x: 13, y: 10 }
      : npc.id === "guard" ? { ...npc, x: 13, y: 7 }
      : npc.id === "villager" ? { ...npc, x: 19, y: 11 } : npc),
    decorations: [
      ...(base.decorations ?? []).filter((deco) => deco.sprite !== "elderhall-flowers"),
      // Sparse clusters leave the grass and path silhouettes visible. These
      // are ground dressing, not colliders, and sit outside interaction tiles.
      { sprite: "elderhall-flowers", x: 7.2, y: 7.3, w: 0.8, h: 0.4, layer: "ground" },
      { sprite: "elderhall-flowers", x: 3.2, y: 11.35, w: 0.9, h: 0.45, layer: "ground" },
      { sprite: "elderhall-flowers", x: 2.35, y: 12.25, w: 0.65, h: 0.32, layer: "ground" },
      { sprite: "elderhall-flowers", x: 7.15, y: 13.25, w: 0.8, h: 0.4, layer: "ground" },
      { sprite: "elderhall-flowers", x: 15.3, y: 15.35, w: 0.9, h: 0.45, layer: "ground" },
      { sprite: "elderhall-flowers", x: 19.7, y: 12.3, w: 0.9, h: 0.45, layer: "ground" },
      { sprite: "elderhall-flowers", x: 19.3, y: 7.6, w: 0.75, h: 0.36, layer: "ground" },
      { sprite: "elderhall-flowers", x: 13.15, y: 12.25, w: 0.8, h: 0.4, layer: "ground" },
    ],
  };
}

/** Candidate interiors return to the approach tile directly south of their painted doors. */
export function makeElderhallCandidateInterior(base: MapDef): MapDef {
  const doorway = Object.values(CANDIDATE_DOORWAYS).find((entry) => entry.interiorId === base.id);
  if (!doorway) return base;
  return { ...base, warps: base.warps.map((warp) => warp.to === "elderhall" ? { ...warp, tx: doorway.exteriorX } : warp) };
}
