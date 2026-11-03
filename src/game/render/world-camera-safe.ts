/** Exploration HUD inset and camera relief (renderer/engine; reads existing DOM). */

const HUD_GAP_CSS = 6;
const ENTER_PX = 10;
const LEAVE_PX = 4;
const RELIEF_STEP = 0.18;
const MAX_RELIEF = 96;

/**
 * Bottom edge of `.top-stack` in canvas pixel space (region the world camera should keep clear).
 */
export function measureWorldHudInsetCanvas(canvas: HTMLCanvasElement): number | null {
  const viewport = canvas.parentElement;
  if (!viewport) return null;
  const stack = viewport.querySelector(".top-stack");
  if (!stack || !stack.getClientRects().length) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const stackRect = stack.getBoundingClientRect();
  if (canvasRect.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return null;
  const scaleY = canvas.height / canvasRect.height;
  const bottomCss = stackRect.bottom - canvasRect.top;
  return Math.round(Math.max(0, Math.min(canvas.height, bottomCss * scaleY + HUD_GAP_CSS * scaleY)));
}

export type WorldCamReliefState = { relief: number };

/** Keep player sprite head below HUD inset with hysteresis (pure; used by engine + tests). */
export function adjustCamYForHudInset(
  camY: number,
  playerHeadCanvasY: number,
  hudInsetBottom: number,
  state: WorldCamReliefState,
): { camY: number; relief: number } {
  const targetMin = hudInsetBottom + 4;
  const gap = targetMin - playerHeadCanvasY;
  let relief = state.relief;
  if (gap > ENTER_PX) relief = Math.min(MAX_RELIEF, relief + gap * RELIEF_STEP);
  else if (gap < -LEAVE_PX) relief = Math.max(0, relief + gap * RELIEF_STEP);
  const adjusted = Math.max(0, camY - relief);
  return { camY: adjusted, relief };
}

declare global {
  interface Window {
    __worldCameraReport?: {
      hudInsetBottom: number;
      camRelief: number;
      playerHeadCanvasY: number;
      canvasW: number;
      canvasH: number;
      ts: number;
    };
  }
}

export function reportWorldCameraGeometry(
  cw: number,
  ch: number,
  payload: Omit<NonNullable<Window["__worldCameraReport"]>, "canvasW" | "canvasH" | "ts">,
): void {
  if (typeof window === "undefined") return;
  window.__worldCameraReport = { ...payload, canvasW: cw, canvasH: ch, ts: Date.now() };
}
