/** Pick a quadrant within the 2×2 atlas sheet for subtle ground variation. */
export function tileAtlasQuadrant(variant: number, tileX: number, tileY: number): 0 | 1 | 2 | 3 {
  const base = ((tileX & 1) | ((tileY & 1) << 1)) as 0 | 1 | 2 | 3;
  if (variant <= 0) return base;
  return ((base + variant) % 4) as 0 | 1 | 2 | 3;
}

export type TileAccentKind = "speckle" | "blade" | "pebble";

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
