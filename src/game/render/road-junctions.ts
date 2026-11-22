import type { MapDef } from "../types.ts";

type RoadJunction = { x: number; y: number; dx: -1 | 1; dy: -1 | 1 };

/** Only fill a simple grass inset bounded by a 2×2 block of dirt. */
export function dirtPathJunctions(map: MapDef): RoadJunction[] {
  if (map.terrainPathStyle !== "soft") return [];
  const result: RoadJunction[] = [];
  const at = (x: number, y: number) => map.ground[y]?.[x];
  const scenery = [...map.objects, ...(map.decorations ?? [])];
  for (let y = 1; y < map.ground.length - 1; y++) for (let x = 1; x < (map.ground[y]?.length ?? 0) - 1; x++) {
    if (at(x, y) !== ".") continue;
    // Never place the extension against cobble or beneath placed scenery.
    if ([-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => at(x + dx, y + dy) === "c"))) continue;
    const overlaps = (item: { x: number; y: number; w: number; h: number }) =>
      item.x < x + 1 && item.x + item.w > x && item.y < y + 1 && item.y + item.h > y;
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

/** Draw connected curved joins without changing the authored ground tiles. */
export function paintDirtPathJunctions(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  size: number,
  drawDirtTile: (x: number, y: number) => void,
): void {
  const inset = size / 8, radius = size / 2;
  for (const { x, y, dx, dy } of dirtPathJunctions(map)) {
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
      drawDirtTile(tx, ty);
    }
    if (map.roadBorder === "stone") {
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
    }
    ctx.restore();
  }
}
