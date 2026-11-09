import type { MapDef, MapObj } from "../types.ts";
import { chooseTileVariant } from "../world/terrain.ts";
import { drawAtlasTile, tileAtlasQuadrant } from "./tile-surface.ts";
type VisualMetadata = { dimensions: number[]; anchor: number[]; render_size_tiles: number[] };
declare const __ELDERHALL_GEOMETRY__: Record<string, VisualMetadata> | undefined;

// Node-only fixture for deterministic tests without Vite's build-time define.
// Actual preview builds receive these values from the validated pack manifest.
const NODE_TEST_GEOMETRY: Record<string, VisualMetadata> = {
  "well-reference": { dimensions: [128, 160], anchor: [64, 156], render_size_tiles: [2, 2.5] },
  "tree-reference": { dimensions: [160, 144], anchor: [80, 140], render_size_tiles: [3, 2.7] },
  "cottage-reference": { dimensions: [160, 160], anchor: [80, 156], render_size_tiles: [3, 3] },
  "guild-reference": { dimensions: [160, 160], anchor: [80, 156], render_size_tiles: [3, 3] },
  "shop-reference": { dimensions: [160, 160], anchor: [80, 156], render_size_tiles: [3, 3] },
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
  const gate: MapObj = { id: "north_gate_candidate", sprite: "elderhall-gate-reference", x: 9, y: 3, w: 4, h: 4, foot: 1, solid: true,
    collision: [{ x: 0, y: 3, w: 1, h: 1 }, { x: 3, y: 3, w: 1, h: 1 }] };
  return { ...gate, visual: { ...candidateVisualFromMetadata(gate, assetMetadata("gate-reference"), 1.5), groundY: 3.25 } };
}

export function elderhallCandidateBench(): MapObj {
  const bench: MapObj = { id: "green_bench_candidate", sprite: "elderhall-bench", x: 8, y: 14, w: 1, h: 1, foot: 1, solid: true };
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
  if (obj.id === "h_guild") return { ...obj, sprite: "elderhall-guild-reference", visual: candidateVisualFromMetadata(obj, assetMetadata("guild-reference")) };
  if (obj.id === "h_shop") return { ...obj, sprite: "elderhall-shop-reference", visual: candidateVisualFromMetadata(obj, assetMetadata("shop-reference")) };
  if (obj.sprite === "cottage") return { ...obj, sprite: "elderhall-cottage-reference", visual: candidateVisualFromMetadata(obj, assetMetadata("cottage-reference")) };
  return obj;
}

export function elderhallTerrainAtlas(mapId: string, tileName: string, enabled: boolean): string | null {
  if (!enabled || mapId !== "elderhall") return null;
  const name = tileName === "cobble" ? "stone" : tileName;
  return ["grass", "dirt", "stone"].includes(name) ? `tile_elderhall-${name}-atlas` : null;
}

type RoadJunction = { x: number; y: number; dx: -1 | 1; dy: -1 | 1 };

/** Only fill a simple grass inset bounded by a 2×2 block of dirt. */
export function elderhallRoadJunctions(map: MapDef): RoadJunction[] {
  if (map.id !== "elderhall" || map.terrainPathStyle !== "soft" || map.roadBorder !== "stone") return [];
  const result: RoadJunction[] = [];
  const at = (x: number, y: number) => map.ground[y]?.[x];
  for (let y = 1; y < map.ground.length - 1; y++) for (let x = 1; x < (map.ground[y]?.length ?? 0) - 1; x++) {
    if (at(x, y) !== ".") continue;
    // Never place the extension against cobble or beneath placed scenery.
    if ([-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => at(x + dx, y + dy) === "c"))) continue;
    const overlaps = (item: { x: number; y: number; w: number; h: number }) =>
      item.x < x + 1 && item.x + item.w > x && item.y < y + 1 && item.y + item.h > y;
    const scenery = [...map.objects, ...(map.decorations ?? [])];
    if (scenery.some(overlaps)) continue;
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      if (at(x + dx, y) === "p" && at(x, y + dy) === "p" && at(x + dx, y + dy) === "p" &&
          at(x - dx, y) === "." && at(x, y - dy) === ".") {
        // The repaint extends one quarter tile across the two adjoining edges.
        const left = x + (dx < 0 ? -0.25 : 0.5), right = x + (dx < 0 ? 0.5 : 1.25);
        const top = y + (dy < 0 ? -0.25 : 0.5), bottom = y + (dy < 0 ? 0.5 : 1.25);
        if (!scenery.some((item) => item.x < right && item.x + item.w > left && item.y < bottom && item.y + item.h > top)) {
          result.push({ x, y, dx, dy });
        }
      }
    }
  }
  return result;
}

/** Repaint the old straight edging under each curved dirt-and-stone join. */
export function paintElderhallRoadJunctions(ctx: CanvasRenderingContext2D, map: MapDef, size: number, atlas: CanvasImageSource): void {
  const inset = size / 8, radius = size / 2;
  for (const { x, y, dx, dy } of elderhallRoadJunctions(map)) {
    const sx = -dx, sy = -dy;
    const ox = (x + (dx > 0 ? 1 : 0)) * size;
    const oy = (y + (dy > 0 ? 1 : 0)) * size;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(sx, sy);
    ctx.beginPath();
    ctx.moveTo(-2 * inset, -2 * inset);
    ctx.lineTo(radius, -2 * inset);
    ctx.lineTo(radius, -inset);
    ctx.quadraticCurveTo(-inset, -inset, -inset, radius);
    ctx.lineTo(-2 * inset, radius);
    ctx.closePath();
    ctx.clip();
    // The clip remains in canvas coordinates; draw source tiles without mirroring.
    ctx.scale(sx, sy);
    ctx.translate(-ox, -oy);
    for (const ty of [y, y + dy]) for (const tx of [x, x + dx]) {
      const variant = chooseTileVariant(map.id, tx, ty, "dirt", 3);
      drawAtlasTile(ctx, atlas, tx * size, ty * size, size, tileAtlasQuadrant(variant, tx, ty));
    }
    ctx.translate(ox, oy);
    ctx.scale(sx, sy);
    ctx.beginPath();
    ctx.moveTo(radius, -inset);
    ctx.quadraticCurveTo(-inset, -inset, -inset, radius);
    ctx.setLineDash([Math.round(size / 4) - 1, 1]);
    ctx.lineWidth = 2 * inset;
    ctx.strokeStyle = "#504d40";
    ctx.stroke();
    ctx.lineWidth = 2 * inset - 2;
    ctx.strokeStyle = "#aaa48d";
    ctx.stroke();
    ctx.restore();
  }
}
