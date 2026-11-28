import { chooseTileVariant } from "../world/terrain.ts";
import { roadBorderEdges } from "./tile-surface.ts";

type WoodlandPalette = "briar" | "wildwood";

export function woodlandPalette(mapId: string): WoodlandPalette | null {
  if (mapId === "briar_road") return "briar";
  return mapId === "wildwood" ? "wildwood" : null;
}

const ART_TILE = 32;
const MATERIAL_ROW = { briar: 0, wildwood: 1, dirt: 2 } as const;
const UNDERGROWTH_ROW = { briar: 3, wildwood: 4 } as const;
const VERGE_ROW = 5;
type MaterialRows = Readonly<Record<string, number | undefined>>;
const ROUTE_ROWS: Readonly<Record<string, MaterialRows | undefined>> = {
  thornkeep: { grass: 0, dirt: 1, cobble: 2 },
  ashenbarrow: { cave: 3, wall: 4 },
  mirefen: { grass: 5, marsh: 6, water: 7, dirt: 8, bridge: 9 },
};

export function chapterRouteRows(mapId: string): MaterialRows | undefined {
  return ROUTE_ROWS[mapId];
}

function drawCell(
  ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, row: number, column: number,
  x: number, y: number, size: number,
): void {
  ctx.drawImage(atlas, column * ART_TILE, row * ART_TILE, ART_TILE, ART_TILE, x, y, size, size);
}

export function drawChapterRouteMaterial(
  ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, rows: MaterialRows, mapId: string, material: string,
  x: number, y: number, size: number,
): boolean {
  const row = rows[material];
  if (row === undefined) return false;
  const column = chooseTileVariant(mapId, x / size, y / size, material, 4);
  drawCell(ctx, atlas, row, column, x, y, size);
  return true;
}

export function drawWoodlandMaterial(
  ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, palette: WoodlandPalette, material: string,
  x: number, y: number, size: number,
): boolean {
  if (material !== "grass" && material !== "dirt") return false;
  const row = MATERIAL_ROW[material === "grass" ? palette : material];
  const column = chooseTileVariant(palette, x / size, y / size, material, 4);
  drawCell(ctx, atlas, row, column, x, y, size);
  return true;
}

export function drawWoodlandUndergrowth(
  ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, palette: WoodlandPalette,
  x: number, y: number, size: number,
): void {
  const tx = x / size;
  const ty = y / size;
  const column = chooseTileVariant(palette, tx, ty, "undergrowth", 4);
  const offsetX = chooseTileVariant(palette, tx, ty, "plant lean", 9) - 4;
  const offsetY = chooseTileVariant(palette, tx, ty, "plant depth", 11) - 5;
  // Break the repeated rows while keeping every encounter cue in its own tile.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  drawCell(ctx, atlas, UNDERGROWTH_ROW[palette], column,
    x + Math.round(offsetX * size / ART_TILE), y + Math.round(offsetY * size / ART_TILE), size);
  ctx.restore();
}

/** Paint low stones and leaves on exposed shoulders. Open joins stay clear. */
export function drawWoodlandVerge(
  ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, palette: WoodlandPalette,
  x: number, y: number, size: number, pathMask: number,
): void {
  const edges = roadBorderEdges(pathMask);
  const center = size / 2;
  for (let side = 0; side < 4; side++) {
    if (!(edges & (1 << side))) continue;
    const variant = chooseTileVariant(palette, x / size + side * 7, y / size, "verge", 4);
    ctx.save();
    ctx.translate(x + center, y + center);
    ctx.rotate(side * Math.PI / 2);
    drawCell(ctx, atlas, VERGE_ROW, variant, -center, -center, size);
    ctx.restore();
  }
}
