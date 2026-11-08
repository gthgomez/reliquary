import type { MapDef, MapObj } from "../types.ts";
import { elderhallCandidateBench, elderhallCandidateGate } from "../render/elderhall-visual.ts";

/** Preview-only composition; the production map and its save coordinates remain untouched. */
export function makeElderhallCandidate(base: MapDef): MapDef {
  const ground = base.ground.map((row) => row.split(""));
  // A short westward connector removes the dogleg before the main crossroads.
  for (const x of [8, 9]) ground[10]![x] = "p";
  // The well and Maren sit on a small stone apron beside the main N/S street.
  for (const y of [9, 10]) for (const x of [13, 14, 15]) ground[y]![x] = "c";
  const moved: Record<string, { x: number; y: number }> = {
    green_tree: { x: 8, y: 12 }, well: { x: 14, y: 10 }, shrub2: { x: 15, y: 7 },
    lantern1: { x: 14, y: 4 },
  };
  const existing = base.objects.filter((object) => !["north_gate_candidate", "green_bench_candidate"].includes(object.id));
  const objects: MapObj[] = [elderhallCandidateGate(), elderhallCandidateBench(),
    ...existing.map((object) => moved[object.id] ? { ...object, ...moved[object.id] } : object)];
  return {
    ...base,
    ground: ground.map((row) => row.join("")),
    objects,
    npcs: base.npcs.map((npc) => npc.id === "maren" ? { ...npc, x: 13, y: 10 }
      : npc.id === "guard" ? { ...npc, x: 13, y: 7 }
      : npc.id === "villager" ? { ...npc, x: 19, y: 11 } : npc),
    decorations: [
      ...(base.decorations ?? []).filter((deco) => deco.sprite !== "elderhall-flowers"),
      // Flowers remain low, walkable ground dressing and are grouped near landmarks.
      { sprite: "elderhall-flowers", x: 8.3, y: 7.2, w: 1, h: 0.5, layer: "ground" },
      { sprite: "elderhall-flowers", x: 7.05, y: 7.35, w: 0.75, h: 0.36, layer: "ground" },
      { sprite: "elderhall-flowers", x: 3.1, y: 6.3, w: 0.7, h: 0.35, layer: "ground" },
      { sprite: "elderhall-flowers", x: 3.2, y: 11.3, w: 1, h: 0.5, layer: "ground" },
      { sprite: "elderhall-flowers", x: 2.15, y: 11.15, w: 0.75, h: 0.35, layer: "ground" },
      { sprite: "elderhall-flowers", x: 3.1, y: 12.15, w: 0.7, h: 0.35, layer: "ground" },
      { sprite: "elderhall-flowers", x: 15.2, y: 15.4, w: 1, h: 0.5, layer: "ground" },
      { sprite: "elderhall-flowers", x: 13.1, y: 12.15, w: 0.9, h: 0.45, layer: "ground" },
      { sprite: "elderhall-flowers", x: 13.65, y: 12.38, w: 0.65, h: 0.32, layer: "ground" },
      { sprite: "elderhall-flowers", x: 15.85, y: 14.25, w: 0.8, h: 0.4, layer: "ground" },
      { sprite: "elderhall-flowers", x: 16.45, y: 14.37, w: 0.55, h: 0.27, layer: "ground" },
      { sprite: "elderhall-flowers", x: 20.1, y: 12.2, w: 1, h: 0.5, layer: "ground" },
      { sprite: "elderhall-flowers", x: 19.25, y: 12.45, w: 0.75, h: 0.35, layer: "ground" },
      { sprite: "elderhall-flowers", x: 19.15, y: 7.35, w: 0.8, h: 0.4, layer: "ground" },
      { sprite: "elderhall-flowers", x: 19.2, y: 8.2, w: 0.8, h: 0.35, layer: "ground" },
      { sprite: "elderhall-flowers", x: 7.1, y: 13.2, w: 1, h: 0.5, layer: "ground" },
      { sprite: "elderhall-flowers", x: 9.0, y: 13.1, w: 0.8, h: 0.4, layer: "ground" },
      { sprite: "elderhall-flowers", x: 7.1, y: 14.2, w: 0.8, h: 0.4, layer: "ground" },
      { sprite: "elderhall-flowers", x: 7.15, y: 12.75, w: 0.65, h: 0.32, layer: "ground" },
      { sprite: "elderhall-flowers", x: 7.15, y: 13.8, w: 0.65, h: 0.3, layer: "ground" },
      { sprite: "elderhall-flowers", x: 13.1, y: 8.1, w: 0.8, h: 0.4, layer: "ground" },
      { sprite: "elderhall-flowers", x: 14.2, y: 8.35, w: 0.75, h: 0.35, layer: "ground" },
    ],
  };
}
