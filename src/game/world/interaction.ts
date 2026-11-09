import type { MapObj } from "../types.ts";

/** Whether a map tile can target this object's interaction (door tiles, etc.). */
export function objectInteractTile(obj: MapObj, fx: number, fy: number): boolean {
  if (obj.interactZone) {
    const z = obj.interactZone;
    return fx >= obj.x + z.x && fx < obj.x + z.x + z.w && fy >= obj.y + z.y && fy < obj.y + z.y + z.h;
  }
  return fx >= obj.x && fx < obj.x + obj.w && fy >= obj.y && fy < obj.y + obj.h;
}

/** Prefer interactive objects when décor shares a tile footprint. */
export function pickInteractObject(
  objects: readonly MapObj[],
  fx: number,
  fy: number,
): MapObj | undefined {
  const hits = objects.filter((o) => objectInteractTile(o, fx, fy));
  return hits.find((o) => o.interact) ?? hits[0];
}
