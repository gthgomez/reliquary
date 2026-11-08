import type { MapObj } from "../types.ts";
type VisualMetadata = { dimensions: number[]; anchor: number[]; render_size_tiles: number[] };
declare const __ELDERHALL_GEOMETRY__: Record<string, VisualMetadata> | undefined;

// Node-only fixture for deterministic tests without Vite's build-time define.
// Actual preview builds receive these values from the validated pack manifest.
const NODE_TEST_GEOMETRY: Record<string, VisualMetadata> = {
  "well-reference": { dimensions: [128, 160], anchor: [64, 156], render_size_tiles: [2, 2.5] },
  "tree-reference": { dimensions: [160, 144], anchor: [80, 140], render_size_tiles: [3, 2.7] },
  "cottage-reference": { dimensions: [160, 160], anchor: [80, 156], render_size_tiles: [3, 3] },
  "gate-reference": { dimensions: [160, 112], anchor: [80, 108], render_size_tiles: [3, 2.1] },
  bench: { dimensions: [96, 48], anchor: [48, 43], render_size_tiles: [1.5, 0.75] },
};

function assetMetadata(id: string): VisualMetadata {
  const source = typeof __ELDERHALL_GEOMETRY__ === "undefined" ? NODE_TEST_GEOMETRY : __ELDERHALL_GEOMETRY__;
  const asset = source[id];
  if (!asset) throw new Error(`Missing Elderhall candidate metadata: ${id}`);
  return asset;
}

/** Use pack metadata for image geometry; scene scale is an explicit map choice. */
export function candidateVisualFromMetadata(obj: MapObj, metadata: VisualMetadata, scale = 1): NonNullable<MapObj["visual"]> {
  return { width: metadata.render_size_tiles[0]! * scale, height: metadata.render_size_tiles[1]! * scale,
    anchorX: metadata.anchor[0]! / metadata.dimensions[0]!, anchorY: metadata.anchor[1]! / metadata.dimensions[1]!,
    groundX: obj.w / 2, groundY: obj.h };
}

/** The open arch has two solid posts and a walkable two-tile center. */
export function elderhallCandidateGate(): MapObj {
  const gate: MapObj = { id: "north_gate_candidate", sprite: "elderhall-gate-reference", x: 9, y: 0, w: 4, h: 4, foot: 1, solid: true,
    collision: [{ x: 0, y: 3, w: 1, h: 1 }, { x: 3, y: 3, w: 1, h: 1 }] };
  return { ...gate, visual: { ...candidateVisualFromMetadata(gate, assetMetadata("gate-reference"), 1.5), groundY: 3.25 } };
}

export function elderhallCandidateBench(): MapObj {
  const bench: MapObj = { id: "green_bench_candidate", sprite: "elderhall-bench", x: 14, y: 14, w: 1, h: 1, foot: 1, solid: true };
  return { ...bench, visual: candidateVisualFromMetadata(bench, assetMetadata("bench")) };
}

/** If the candidate PNG fails to load, show the post collision instead of invisible walls. */
export function paintCandidateGateFallback(ctx: CanvasRenderingContext2D, gate: MapObj, camX: number, camY: number, tileSize: number): void {
  ctx.fillStyle = "#5a402a";
  for (const box of gate.collision ?? []) ctx.fillRect((gate.x + box.x) * tileSize - camX, (gate.y + box.y) * tileSize - camY, box.w * tileSize, box.h * tileSize);
}

export function paintCandidateBenchFallback(ctx: CanvasRenderingContext2D, bench: MapObj, camX: number, camY: number, tileSize: number): void {
  ctx.fillStyle = "#725033";
  ctx.fillRect(bench.x * tileSize - camX, bench.y * tileSize - camY, tileSize, tileSize);
}

/** Preview-only mapping from stable gameplay objects to candidate IDs. */
export function elderhallCandidateObject(mapId: string, obj: MapObj, enabled: boolean): MapObj {
  if (!enabled || mapId !== "elderhall") return obj;
  if (obj.id === "well") return { ...obj, sprite: "elderhall-well-reference", visual: candidateVisualFromMetadata(obj, assetMetadata("well-reference"), 0.75) };
  if (obj.id === "green_tree") return { ...obj, sprite: "elderhall-tree-reference", visual: candidateVisualFromMetadata(obj, assetMetadata("tree-reference"), 14 / 15) };
  if (obj.sprite === "cottage") return { ...obj, sprite: "elderhall-cottage-reference", visual: candidateVisualFromMetadata(obj, assetMetadata("cottage-reference")) };
  return obj;
}

export function elderhallTerrainAtlas(mapId: string, tileName: string, enabled: boolean): string | null {
  if (!enabled || mapId !== "elderhall") return null;
  const name = tileName === "cobble" ? "stone" : tileName;
  return ["grass", "dirt", "stone"].includes(name) ? `tile_elderhall-${name}-atlas` : null;
}
