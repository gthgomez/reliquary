import type { MapDef } from "../types.ts";
import { isOccupied } from "./movement.ts";

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function warpAt(map: MapDef, x: number, y: number): boolean {
  return map.warps.some((w) => w.x === x && w.y === y);
}

/**
 * Flood-fill reachable tiles. Stepping onto a warp tile stops expansion there —
 * warps are exits, not corridors through the map graph.
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
    if (warpAt(map, x, y)) continue;
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
  if (reachableFromSpawn.size === 0) return { ...map.spawn };
  return { ...map.spawn };
}
