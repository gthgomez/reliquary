/** Pick a quadrant within the 2×2 atlas sheet for subtle ground variation. */
export function tileAtlasQuadrant(variant: number, tileX: number, tileY: number): 0 | 1 | 2 | 3 {
  const base = ((tileX & 1) | ((tileY & 1) << 1)) as 0 | 1 | 2 | 3;
  if (variant <= 0) return base;
  return ((base + variant) % 4) as 0 | 1 | 2 | 3;
}

export type TileAccentKind = "speckle" | "blade" | "pebble";

/** Cardinal exposed sides, using the same N/E/S/W bits as the path mask. */
export function roadBorderEdges(pathMask: number): number {
  return (~pathMask) & 15;
}

/** Missing diagonals inside connected cardinal arms expose short inner corners. */
export function roadBorderCorners(mask: number): number {
  return ((mask & 3) === 3 && !(mask & 16) ? 16 : 0) |
    ((mask & 6) === 6 && !(mask & 32) ? 32 : 0) |
    ((mask & 12) === 12 && !(mask & 64) ? 64 : 0) |
    ((mask & 9) === 9 && !(mask & 128) ? 128 : 0);
}

/** Paint separate stones only along exposed road edges; connected arms stay open. */
export function paintStoneRoadBorder(ctx: CanvasRenderingContext2D, dx: number, dy: number, size: number, mask: number): void {
  const edges = roadBorderEdges(mask);
  const corners = roadBorderCorners(mask);
  if (!edges && !corners) return;
  const inset = Math.round(size / 8);
  const step = Math.round(size / 4);
  const stone = Math.max(2, Math.round(size / 4) - 1);
  const thick = Math.max(2, Math.round(size / 8));
  ctx.save();
  clipSoftPath(ctx, dx, dy, size, mask);
  const paint = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "#504d40";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#aaa48d";
    ctx.fillRect(x, y, w - 1, Math.max(1, h - 1));
    ctx.fillStyle = "rgba(238,225,194,.35)";
    ctx.fillRect(x + 1, y, Math.max(1, w - 3), 1);
  };
  for (let i = 0; i < 4; i++) {
    const p = i * step + 1;
    if (edges & 1) paint(dx + p, dy + inset, stone, thick);
    if (edges & 2) paint(dx + size - inset - thick, dy + p, thick, stone);
    if (edges & 4) paint(dx + p, dy + size - inset - thick, stone, thick);
    if (edges & 8) paint(dx + inset, dy + p, thick, stone);
  }
  if (corners & 16) { paint(dx + size - inset, dy, inset, thick); paint(dx + size - thick, dy, thick, inset); }
  if (corners & 32) { paint(dx + size - inset, dy + size - thick, inset, thick); paint(dx + size - thick, dy + size - inset, thick, inset); }
  if (corners & 64) { paint(dx, dy + size - thick, inset, thick); paint(dx, dy + size - inset, thick, inset); }
  if (corners & 128) { paint(dx, dy, inset, thick); paint(dx, dy, thick, inset); }
  ctx.restore();
}

/** Clip a dirt tile to an inset, chamfered outline connected to nearby paths. */
export function clipSoftPath(ctx: CanvasRenderingContext2D, dx: number, dy: number, size: number, mask: number): void {
  const north = !!(mask & 1), east = !!(mask & 2), south = !!(mask & 4), west = !!(mask & 8);
  const inset = size / 8;
  const left = dx + (west ? 0 : inset), right = dx + size - (east ? 0 : inset);
  const top = dy + (north ? 0 : inset), bottom = dy + size - (south ? 0 : inset);
  const corner = size / 16;
  // Round only genuinely exposed outer corners. Rounding at every tile seam
  // makes an otherwise straight road look scalloped.
  const nw = !north && !west ? corner : north && west && !(mask & 128) ? inset : 0;
  const ne = !north && !east ? corner : north && east && !(mask & 16) ? inset : 0;
  const se = !south && !east ? corner : south && east && !(mask & 32) ? inset : 0;
  const sw = !south && !west ? corner : south && west && !(mask & 64) ? inset : 0;
  ctx.beginPath();
  ctx.moveTo(left + nw, top);
  ctx.lineTo(right - ne, top);
  if (ne) ctx.quadraticCurveTo(right, top, right, top + ne);
  ctx.lineTo(right, bottom - se);
  if (se) ctx.quadraticCurveTo(right, bottom, right - se, bottom);
  ctx.lineTo(left + sw, bottom);
  if (sw) ctx.quadraticCurveTo(left, bottom, left, bottom - sw);
  ctx.lineTo(left, top + nw);
  if (nw) ctx.quadraticCurveTo(left, top, left + nw, top);
  ctx.closePath();
  ctx.clip();
}

/** Stagger small strips of cobble into dirt so a surface change isn't a hard tile line. */
export function clipStoneTransition(ctx: CanvasRenderingContext2D, dx: number, dy: number, size: number, mask: number): void {
  const step = size / 16;
  const phase = (Math.floor(dx / size) * 7 + Math.floor(dy / size) * 11) % 4;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const depth = step * (2 + ((i * 5 + phase) % 4));
    if (mask & 1) ctx.rect(dx + i * step, dy, step, depth);
    if (mask & 2) ctx.rect(dx + size - depth, dy + i * step, depth, step);
    if (mask & 4) ctx.rect(dx + i * step, dy + size - depth, step, depth);
    if (mask & 8) ctx.rect(dx, dy + i * step, depth, step);
  }
  ctx.clip();
}

export function chooseTileAccent(
  mapId: string,
  x: number,
  y: number,
  symbol: string,
): TileAccentKind | null {
  if (symbol === ",") return "blade";
  if (symbol !== "." && symbol !== "p" && symbol !== "c" && symbol !== "m" && symbol !== "s") return null;
  let h = (mapId.charCodeAt(0) ?? 0) + x * 92837111 + y * 689287499 + symbol.charCodeAt(0)! * 283723947;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  const bucket = Math.abs(h >>> 0) % 100;
  if (symbol === "p" || symbol === "c") return bucket < 18 ? "pebble" : null;
  if (symbol === "m") return bucket < 22 ? "speckle" : null;
  if (symbol === "s") return bucket < 16 ? "pebble" : null;
  if (bucket < 12) return "speckle";
  if (bucket < 18 && symbol === ".") return "pebble";
  return null;
}

export function paintTileAccent(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  tileSize: number,
  kind: TileAccentKind,
): void {
  const t = tileSize;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (kind === "blade") {
    ctx.fillStyle = "rgba(72,98,58,0.55)";
    ctx.fillRect(dx + 10, dy + 6, 3, 14);
    ctx.fillRect(dx + 18, dy + 8, 3, 12);
    ctx.fillRect(dx + 22, dy + 14, 3, 10);
  } else if (kind === "pebble") {
    ctx.fillStyle = "rgba(20,17,14,0.28)";
    ctx.fillRect(dx + 6, dy + t - 8, 4, 3);
    ctx.fillRect(dx + t - 10, dy + t - 6, 5, 3);
    ctx.fillStyle = "rgba(255,248,230,0.12)";
    ctx.fillRect(dx + 7, dy + t - 9, 2, 1);
  } else {
    ctx.fillStyle = "rgba(20,17,14,0.2)";
    ctx.fillRect(dx + 8, dy + 12, 2, 2);
    ctx.fillRect(dx + 20, dy + 18, 2, 2);
    ctx.fillStyle = "rgba(255,248,230,0.1)";
    ctx.fillRect(dx + 14, dy + 8, 2, 2);
  }
  ctx.imageSmoothingEnabled = prevSmooth;
}

export function drawAtlasTile(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  dx: number,
  dy: number,
  tileSize: number,
  quadrant: 0 | 1 | 2 | 3,
): void {
  const t = tileSize;
  const sx = (quadrant & 1) * t;
  const sy = (quadrant >> 1) * t;
  ctx.drawImage(img, sx, sy, t, t, dx, dy, t, t);
}
