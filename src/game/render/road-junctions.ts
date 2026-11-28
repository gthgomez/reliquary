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

/** Bake a rounded, walkable stone forecourt around the candidate well. */
export function paintCandidateWellApron(ctx: CanvasRenderingContext2D, map: MapDef, size: number): boolean {
  if (map.id !== "elderhall" || !map.objects.some((object) => object.id === "north_gate_candidate")) return false;
  const well = map.objects.find((object) => object.id === "well");
  if (!well) return false;
  const cx = (well.x + well.w / 2) * size;
  const cy = (well.y + well.h / 2 + 0.05) * size;
  const rx = size * 1.58, ry = size * 1.02;
  const traceApron = (scale: number, yOffset = 0) => {
    const points = Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2;
      const wobble = 1 + Math.sin(angle * 3 + .5) * .045 + Math.cos(angle * 5 - .2) * .022;
      return [cx + Math.cos(angle) * rx * scale * wobble, cy + yOffset + Math.sin(angle) * ry * scale * wobble] as const;
    });
    const midpoint = (a: readonly number[], b: readonly number[]) => [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2] as const;
    const first = midpoint(points.at(-1)!, points[0]!);
    ctx.beginPath(); ctx.moveTo(first[0], first[1]);
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!, nextMidpoint = midpoint(point, points[(i + 1) % points.length]!);
      ctx.quadraticCurveTo(point[0], point[1], nextMidpoint[0], nextMidpoint[1]);
    }
    ctx.closePath();
  };
  const seed = (x: number, y: number) => {
    let h = Math.imul((x + 19) ^ 0x73a2, 0x45d9f3b) ^ Math.imul((y + 29) ^ 0x39ac, 0x119de1f3);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (h ^ (h >>> 16)) >>> 0;
  };
  ctx.save();
  // Packed soil between the stones carries the road color to the well.
  ctx.fillStyle = "rgba(70,56,39,.14)";
  traceApron(1.04, 1); ctx.fill();
  ctx.fillStyle = "rgba(104,84,60,.31)";
  traceApron(1); ctx.fill();
  ctx.save();
  traceApron(.97); ctx.clip();
  // Leave gaps at the rim where the hand-laid slabs meet the dirt road.
  const stepX = Math.max(8, Math.round(size / 3));
  const stepY = Math.max(7, Math.round(size / 3));
  const limestone = ["#a2977e", "#908875", "#9d9c88", "#aca082", "#989576"];
  for (let row = 0, y = cy - ry + 2; y < cy + ry; row++, y += stepY) {
    for (let column = 0, x = cx - rx + 2 + (row % 2) * Math.round(stepX / 2); x < cx + rx; column++, x += stepX) {
      const variation = seed(column + row * 7, row);
      const distance = ((x + stepX / 2 - cx) / rx) ** 2 + ((y + stepY / 2 - cy) / ry) ** 2;
      if (distance > .8 && variation % 3 === 0) continue;
      const left = Math.round(x) + (variation % 2);
      const top = Math.round(y) + ((variation >>> 2) % 2);
      const width = stepX - 1 - ((variation >>> 4) % 3);
      const height = stepY - 2 - ((variation >>> 7) % 2);
      ctx.globalAlpha = distance > .72 ? .65 : 1;
      ctx.fillStyle = limestone[variation % limestone.length]!;
      ctx.fillRect(left, top, width, height);
      ctx.fillStyle = "rgba(239,222,181,.31)";
      ctx.fillRect(left + 1, top, width - 2, 1);
      ctx.fillStyle = "rgba(53,44,34,.34)";
      ctx.fillRect(left, top + height, width, 1);
    }
  }
  ctx.restore();
  // Broken highlight and shadow dashes read as a low, irregular stone rim.
  traceApron(.995, -1);
  ctx.setLineDash([Math.max(2, size / 10), Math.max(4, size / 5)]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(100,81,55,.26)"; ctx.stroke();
  traceApron(.97, -2);
  ctx.lineWidth = 1; ctx.strokeStyle = "rgba(230,220,194,.18)"; ctx.stroke();
  ctx.setLineDash([]);
  // Ground the roofed well on the pavers; the prop itself is drawn afterward.
  ctx.fillStyle = "rgba(29,25,21,.24)";
  ctx.beginPath(); ctx.ellipse(cx, (well.y + well.h) * size - size * .04, size * .76, size * .16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  return true;
}
