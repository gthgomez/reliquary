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
  };
  const existing = base.objects.filter((object) => !["north_gate_candidate", "green_bench_candidate"].includes(object.id));
  const objects: MapObj[] = [elderhallCandidateGate(), elderhallCandidateBench(),
    ...existing.map((object) => moved[object.id] ? { ...object, ...moved[object.id] } : object)];
  return {
    ...base,
    ground: ground.map((row) => row.join("")),
    objects,
    npcs: base.npcs.map((npc) => npc.id === "maren" ? { ...npc, x: 13, y: 10 }
      : npc.id === "villager" ? { ...npc, x: 19, y: 11 } : npc),
    decorations: [
      ...(base.decorations ?? []),
      { sprite: "elderhall-flowers", x: 8.3, y: 7.2, w: 1, h: 0.5, layer: "ground" },
      { sprite: "elderhall-flowers", x: 3.2, y: 11.3, w: 1, h: 0.5, layer: "ground" },
      { sprite: "elderhall-flowers", x: 15.2, y: 15.4, w: 1, h: 0.5, layer: "ground" },
      { sprite: "elderhall-flowers", x: 20.1, y: 12.2, w: 1, h: 0.5, layer: "ground" },
      { sprite: "elderhall-flowers", x: 7.1, y: 13.2, w: 1, h: 0.5, layer: "ground" },
      { sprite: "elderhall-flowers", x: 9.0, y: 13.1, w: 0.8, h: 0.4, layer: "ground" },
      { sprite: "elderhall-flowers", x: 7.1, y: 14.2, w: 0.8, h: 0.4, layer: "ground" },
      { sprite: "elderhall-flowers", x: 13.1, y: 8.1, w: 0.8, h: 0.4, layer: "ground" },
    ],
  };
}
