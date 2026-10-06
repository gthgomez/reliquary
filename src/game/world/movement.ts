import { BLOCKED } from "../maps.ts";
import type { Dir, MapDef } from "../types.ts";

export const DIRS: Record<Dir, { x: number; y: number; name: string }> = {
  0: {
    x: 0,
    y: 1,
    name: "down",
  },
  1: {
    x: -1,
    y: 0,
    name: "left",
  },
  2: {
    x: 1,
    y: 0,
    name: "right",
  },
  3: {
    x: 0,
    y: -1,
    name: "up",
  },
};
export const YAW: Record<Dir, number> = {
  0: 0,
  1: Math.PI / 2,
  2: -Math.PI / 2,
  3: Math.PI,
};

export function facingOffset(dir: Dir): { x: number; y: number } {
  const d = DIRS[dir];
  return { x: d.x, y: d.y };
}

export function isOccupied(map: MapDef, flags: Record<string, boolean>, x: number, y: number): boolean {
  const row = map.ground[y];
  if (!row || x < 0 || x >= row.length) return true;
  if (BLOCKED.has(row[x]!)) return true;
  for (const o of map.objects) {
    if (!o.solid) continue;
    if (flags.starter && o.id.startsWith("st_")) continue;
    const fy = o.y + o.h - o.foot;
    if (x >= o.x && x < o.x + o.w && y >= fy && y < o.y + o.h) return true;
  }
  for (const n of map.npcs) if (n.x === x && n.y === y) return true;
  return false;
}
