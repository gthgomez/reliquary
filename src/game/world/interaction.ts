import type { MapObj } from "../types.ts";

/** Prefer interactive objects when décor shares a tile footprint. */
export function pickInteractObject(
  objects: readonly MapObj[],
  fx: number,
  fy: number,
): MapObj | undefined {
  const hits = objects.filter(
    (o) => fx >= o.x && fx < o.x + o.w && fy >= o.y && fy < o.y + o.h,
  );
  return hits.find((o) => o.interact) ?? hits[0];
}
