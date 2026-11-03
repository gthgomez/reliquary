import type { MapDef } from "../types.ts";
import { isOccupied } from "./movement.ts";

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function warpAt(map: MapDef, x: number, y: number): boolean {
  return map.warps.some((w) => w.x === x && w.y === y);
}

/** Legacy saves must stay inside the map grid with a walkable tile. */
export function isLegacyCoordinateValid(map: MapDef, x: number, y: number): boolean {
  if (y < 0 || x < 0 || y >= map.ground.length) return false;
  const row = map.ground[y];
  if (!row || x >= row.length) return false;
  return row[x] !== "#";
}

/**
 * Flood-fill reachable tiles. Warp tiles stop expansion once entered,
 * except the start tile may step off an entry warp.
 */
export function reachableTiles(
  map: MapDef,
  start: { x: number; y: number },
  flags: Record<string, boolean>,
): Set<string> {
  const out = new Set<string>();
  if (isOccupied(map, flags, start.x, start.y)) return out;
  const queue: { x: number; y: number }[] = [start];
  out.add(key(start.x, start.y));
  while (queue.length) {
    const { x, y } = queue.shift()!;
    if (warpAt(map, x, y) && (x !== start.x || y !== start.y)) continue;
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (out.has(k)) continue;
      if (isOccupied(map, flags, nx, ny)) continue;
      out.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return out;
}

export function resolveSafeSpawn(
  map: MapDef,
  old: { x: number; y: number },
  flags: Record<string, boolean>,
): { x: number; y: number } {
  const reachableFromSpawn = reachableTiles(map, map.spawn, flags);
  if (reachableFromSpawn.has(key(old.x, old.y))) return old;
  return { ...map.spawn };
}
