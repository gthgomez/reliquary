/**
 * Read UI-published safe band (CSS px). Matches `ui/ui-geometry.ts` contract on
 * `cursor/compact-battle-hud-93fe`; renderer-owned mapping only — no UI imports.
 */
export const UI_SAFE_TOP_GAP_PX = 4;

/** Map `--ui-safe-top-px` on `.viewport` into canvas pixel Y (bottom of safe band). */
export function uiSafeTopCanvasFromCssVar(canvas: HTMLCanvasElement): number | null {
  const viewport = canvas.parentElement;
  if (!viewport || canvas.height <= 0) return null;
  const raw = getComputedStyle(viewport).getPropertyValue("--ui-safe-top-px").trim();
  if (raw === "") return null;
  const cssFromViewportTop = Number.parseFloat(raw);
  if (!Number.isFinite(cssFromViewportTop) || cssFromViewportTop < 0) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  if (canvasRect.height <= 0) return null;
  const scaleY = canvas.height / canvasRect.height;
  const canvasTopInViewport = canvasRect.top - viewportRect.top;
  const fromCanvasTopCss = cssFromViewportTop - canvasTopInViewport;
  return Math.round(Math.max(0, Math.min(canvas.height, fromCanvasTopCss * scaleY)));
}

/** True when the viewport publishes `--ui-safe-top-px` (including explicit `0`). */
export function viewportPublishesUiSafeTop(canvas: HTMLCanvasElement): boolean {
  const viewport = canvas.parentElement;
  if (!viewport) return false;
  const raw = getComputedStyle(viewport).getPropertyValue("--ui-safe-top-px").trim();
  if (raw === "") return false;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0;
}

/** Fallback when `--ui-safe-top-px` is not published yet (pre–HUD merge). */
export function measureTopStackBottomCanvas(canvas: HTMLCanvasElement): number | null {
  const viewport = canvas.parentElement;
  if (!viewport) return null;
  const stack = viewport.querySelector(".top-stack");
  if (!stack || !stack.getClientRects().length) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const stackRect = stack.getBoundingClientRect();
  if (canvasRect.height <= 0 || canvas.width <= 0) return null;
  const scaleY = canvas.height / canvasRect.height;
  const bottomCss = stackRect.bottom - canvasRect.top;
  return Math.round(
    Math.max(0, Math.min(canvas.height, bottomCss * scaleY + UI_SAFE_TOP_GAP_PX * scaleY)),
  );
}

/** Single source: CSS var first (including `0`), then DOM fallback when unset. */
export function readUiSafeTopCanvas(canvas: HTMLCanvasElement): {
  insetCanvas: number;
  source: "css-var" | "dom-fallback" | null;
} {
  if (viewportPublishesUiSafeTop(canvas)) {
    const inset = uiSafeTopCanvasFromCssVar(canvas);
    return { insetCanvas: inset ?? 0, source: "css-var" };
  }
  const fromDom = measureTopStackBottomCanvas(canvas);
  if (fromDom != null) return { insetCanvas: fromDom, source: "dom-fallback" };
  return { insetCanvas: 0, source: null };
}
