import type { MapDef } from "../types.ts";
import { GROUND_TILE } from "./tiles.ts";

/** Stable decorative variant index; never uses gameplay RNG. */
export function chooseTileVariant(mapId: string, x: number, y: number, layer: string, count: number): number {
  if (count <= 1) return 0;
  let h = (mapId.charCodeAt(0) ?? 0) + x * 374761393 + y * 668265263 + layer.length * 982451653;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return Math.abs(h) % count;
}

function tileName(symbol: string): string {
  return GROUND_TILE[symbol] ?? "grass";
}

function isWalkable(symbol: string | undefined): boolean {
  if (!symbol) return false;
  return symbol !== "#" && symbol !== "w" && symbol !== "x";
}

/** Four-neighbor edge mask: N=1, E=2, S=4, W=8 for walkable neighbors. */
export function walkableEdgeMask(ground: string[], x: number, y: number): number {
  const h = ground.length;
  const w = ground[0]?.length ?? 0;
  let mask = 0;
  const here = ground[y]?.[x];
  if (!isWalkable(here)) return 0;
  if (y > 0 && isWalkable(ground[y - 1]?.[x])) mask |= 1;
  if (x + 1 < w && isWalkable(ground[y]?.[x + 1])) mask |= 2;
  if (y + 1 < h && isWalkable(ground[y + 1]?.[x])) mask |= 4;
  if (x > 0 && isWalkable(ground[y]?.[x - 1])) mask |= 8;
  return mask;
}

export type TerrainBakeContext = {
  map: MapDef;
  tileSize: number;
  drawTile: (name: string, dx: number, dy: number, variant: number) => void;
  drawOverlay: (style: "edge" | "shadow", dx: number, dy: number, strength: number) => void;
  drawDecoration: (sprite: string, dx: number, dy: number, w: number, h: number) => void;
};

/** Bake static ground, edge accents, ground-layer décor, and canopy shadows. */
export function bakeMapTerrain(ctx: TerrainBakeContext): void {
  const { map, tileSize: TILE } = ctx;
  const mh = map.ground.length;
  const mw = map.ground[0]?.length ?? 0;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const symbol = map.ground[y]![x]!;
      const name = tileName(symbol);
      const variant = chooseTileVariant(map.id, x, y, name, 3);
      const dx = x * TILE;
      const dy = y * TILE;
      ctx.drawTile(name, dx, dy, variant);
      if (symbol === ",") {
        ctx.drawDecoration("tallgrass", dx, dy, 1, 1);
      }
      const mask = walkableEdgeMask(map.ground, x, y);
      if (mask !== 0 && mask !== 15) {
        ctx.drawOverlay("edge", dx, dy, (15 - mask) / 15);
      }
      if (symbol === "p" || symbol === "c") {
        ctx.drawOverlay("shadow", dx, dy, 0.35);
      }
    }
  }
  for (const deco of map.decorations ?? []) {
    if (deco.layer !== "ground") continue;
    ctx.drawDecoration(
      deco.sprite,
      deco.x * TILE,
      deco.y * TILE,
      deco.w,
      deco.h,
    );
  }
  for (const deco of map.decorations ?? []) {
    if (deco.layer !== "canopy") continue;
    ctx.drawDecoration(
      deco.sprite,
      deco.x * TILE,
      deco.y * TILE,
      deco.w,
      deco.h,
    );
  }
}
