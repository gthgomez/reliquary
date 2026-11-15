/**
 * Creature sheets are square (256x256) with transparent padding. Using the
 * image rectangle as the creature footprint makes sprites float, doubles the
 * shadow and pushes wide-winged creatures off their anchor. Measure the opaque
 * silhouette once per image and place *that* on the ground line.
 */

export type SpriteAlphaBounds = {
  /** Normalized 0..1 opaque bounds inside the source sheet. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export const FULL_SPRITE_BOUNDS: SpriteAlphaBounds = { x: 0, y: 0, w: 1, h: 1 };

export type SpriteSilhouette = {
  /** Full-sheet destination rectangle, in canvas pixels. */
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
  /** Opaque silhouette size and ground contact, for shadows and clearance. */
  width: number;
  height: number;
  feetY: number;
  centerX: number;
};

const boundsCache = new WeakMap<object, SpriteAlphaBounds>();

/** Alpha threshold keeps faint anti-aliased fringe out of the silhouette. */
const ALPHA_CUTOFF = 12;

/**
 * Measure normalized opaque bounds. Returns null when no canvas is available
 * (unit tests, node) or the image cannot be inspected; callers then use the
 * full rectangle, preserving the previous behavior.
 */
export function measureSpriteAlphaBounds(
  image: CanvasImageSource | undefined,
): SpriteAlphaBounds | null {
  const source = image as { naturalWidth?: number; naturalHeight?: number } | undefined;
  const srcW = source?.naturalWidth ?? 0;
  const srcH = source?.naturalHeight ?? 0;
  if (!image || srcW <= 0 || srcH <= 0) return null;
  const cached = boundsCache.get(image as object);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, srcW, srcH).data;
    let minX = srcW;
    let minY = srcH;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < srcH; y += 1) {
      const row = y * srcW * 4;
      for (let x = 0; x < srcW; x += 1) {
        if (data[row + x * 4 + 3]! <= ALPHA_CUTOFF) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const bounds: SpriteAlphaBounds = {
      x: minX / srcW,
      y: minY / srcH,
      w: (maxX - minX + 1) / srcW,
      h: (maxY - minY + 1) / srcH,
    };
    boundsCache.set(image as object, bounds);
    return bounds;
  } catch {
    return null;
  }
}

export type PlaceSpriteOptions = {
  srcW: number;
  srcH: number;
  bounds: SpriteAlphaBounds;
  /** Horizontal ground anchor (silhouette center). */
  anchorX: number;
  feetY: number;
  /** Desired opaque silhouette height in canvas pixels. */
  targetHeight: number;
  mirror?: boolean;
};

/**
 * Place a sheet so its opaque silhouette is `targetHeight` tall and its feet
 * sit exactly on `feetY`. Mirrored sprites keep the same ground contact.
 */
export function placeSpriteOnGround(options: PlaceSpriteOptions): SpriteSilhouette {
  const { srcW, srcH, bounds, anchorX, feetY, targetHeight, mirror = false } = options;
  const sourceW = Math.max(1, srcW);
  const sourceH = Math.max(1, srcH);
  const opaqueSourceH = Math.max(1, bounds.h * sourceH);
  const scale = targetHeight / opaqueSourceH;
  const drawW = sourceW * scale;
  const drawH = sourceH * scale;
  const insetCenterFromLeft = (bounds.x + bounds.w / 2) * drawW;
  const drawX = mirror
    ? anchorX + insetCenterFromLeft - drawW
    : anchorX - insetCenterFromLeft;
  const drawY = feetY - (bounds.y + bounds.h) * drawH;
  return {
    drawX,
    drawY,
    drawW,
    drawH,
    width: bounds.w * drawW,
    height: bounds.h * drawH,
    feetY,
    centerX: anchorX,
  };
}

/** Local drawing offset inside a translated/mirrored context. */
export function fittedSpriteLocalRect(
  srcW: number,
  srcH: number,
  bounds: SpriteAlphaBounds,
  targetHeight: number,
): { x: number; y: number; w: number; h: number } {
  const sourceH = Math.max(1, srcH);
  const scale = targetHeight / Math.max(1, bounds.h * sourceH);
  const drawW = Math.max(1, srcW) * scale;
  const drawH = sourceH * scale;
  return {
    x: -(bounds.x + bounds.w / 2) * drawW,
    y: -(bounds.y + bounds.h) * drawH,
    w: drawW,
    h: drawH,
  };
}
