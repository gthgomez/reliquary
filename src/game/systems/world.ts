import { BLOCKED, MAPS } from "../maps.ts";
import type { Dir, MapDef } from "../types.ts";

export function mapIsRectangular(map: MapDef): boolean {
  const width = map.ground[0]?.length ?? 0;
  return width > 0 && map.ground.every((row) => row.length === width);
}

export function isInsideMap(map: MapDef, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && y >= 0 && y < map.ground.length && x >= 0 && x < (map.ground[0]?.length ?? 0);
}

export function canStandAt(map: MapDef, x: number, y: number): boolean {
  return isInsideMap(map, x, y) && !BLOCKED.has(map.ground[y]![x]!);
}

export function resolveWarp(map: MapDef, x: number, y: number): { to: MapDef; x: number; y: number; dir: Dir } | null {
  const warp = map.warps.find((entry) => entry.x === x && entry.y === y);
  if (!warp) return null;
  const destination = MAPS[warp.to];
  if (!destination || !canStandAt(destination, warp.tx, warp.ty)) return null;
  return { to: destination, x: warp.tx, y: warp.ty, dir: warp.dir ?? 0 };
}
