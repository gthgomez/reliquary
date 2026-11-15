/** DOM measurement for canvas battle staging (renderer-owned; reads existing HUD nodes). */

const RESERVE_GAP_CSS = 6;

/**
 * Map the top edge of `.battle-controls` (in canvas pixel space) to the sprite safe band.
 * Returns null when battle HUD is not mounted yet.
 */
export function measureBattleUiReserveCanvas(canvas: HTMLCanvasElement): number | null {
  const viewport = canvas.parentElement;
  if (!viewport) return null;
  const controls = viewport.querySelector(".battle-controls");
  if (!controls || !controls.getClientRects().length) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const controlsRect = controls.getBoundingClientRect();
  if (canvasRect.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return null;
  const scaleY = canvas.height / canvasRect.height;
  const topCss = controlsRect.top - canvasRect.top;
  const reserve = topCss * scaleY - RESERVE_GAP_CSS * scaleY;
  return Math.round(Math.max(0, Math.min(canvas.height, reserve)));
}

export type SpriteClientRect = { left: number; top: number; right: number; bottom: number };

/**
 * Convert a browser/client point into canvas backing-store pixels. This is the
 * authority for "DOM pixels to canvas coordinates": it accounts for the canvas
 * CSS scale, the viewport offset and any responsive letterboxing in one place.
 */
export function clientPointToCanvas(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

/** Map a canvas-space rectangle into client (CSS) pixels for overlap checks. */
export function canvasRectToClient(
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; w: number; h: number },
): SpriteClientRect {
  const r = canvas.getBoundingClientRect();
  const sx = r.width / Math.max(1, canvas.width);
  const sy = r.height / Math.max(1, canvas.height);
  return {
    left: r.left + rect.x * sx,
    top: r.top + rect.y * sy,
    right: r.left + (rect.x + rect.w) * sx,
    bottom: r.top + (rect.y + rect.h) * sy,
  };
}

/** Canvas-space sprite footprints mapped to viewport/client pixels for overlap checks. */
export function battleSpriteClientRects(
  canvas: HTMLCanvasElement,
  layout: {
    foe: { x: number; y: number; w: number; h: number };
    player: { cx: number; cy: number; size: number; scale: number };
  },
): { foe: SpriteClientRect; player: SpriteClientRect } {
  const map = (x: number, y: number, w: number, h: number): SpriteClientRect =>
    canvasRectToClient(canvas, { x, y, w, h });
  const ps = layout.player.size * layout.player.scale;
  const pl = layout.player.cx - ps / 2;
  const pt = layout.player.cy - ps / 2;
  return {
    foe: map(layout.foe.x, layout.foe.y, layout.foe.w, layout.foe.h),
    player: map(pl, pt, ps, ps),
  };
}

export function rectsOverlap(a: SpriteClientRect, b: SpriteClientRect, margin = 0): boolean {
  return (
    a.left < b.right - margin &&
    b.left < a.right - margin &&
    a.top < b.bottom - margin &&
    b.top < a.bottom - margin
  );
}
