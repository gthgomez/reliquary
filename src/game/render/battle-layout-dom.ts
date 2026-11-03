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

/** Canvas-space sprite footprints mapped to viewport/client pixels for overlap checks. */
export function battleSpriteClientRects(
  canvas: HTMLCanvasElement,
  layout: {
    foe: { x: number; y: number; w: number; h: number };
    player: { cx: number; cy: number; size: number; scale: number };
  },
): { foe: SpriteClientRect; player: SpriteClientRect } {
  const r = canvas.getBoundingClientRect();
  const sx = r.width / canvas.width;
  const sy = r.height / canvas.height;
  const map = (x: number, y: number, w: number, h: number): SpriteClientRect => ({
    left: r.left + x * sx,
    top: r.top + y * sy,
    right: r.left + (x + w) * sx,
    bottom: r.top + (y + h) * sy,
  });
  const half = layout.player.size / 2;
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
