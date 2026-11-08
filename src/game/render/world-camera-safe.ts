/** Exploration HUD inset and camera relief (renderer/engine). */

import { readUiSafeTopCanvas } from "./ui-safe-top.ts";
import { shouldPublishRenderGeometryReports } from "./render-report-gate.ts";

const LEAVE_PX = 4;
const RELIEF_STEP = 0.18;
const MAX_RELIEF = 96;
const MAX_CONTENT_PAN = 160;

export type WorldCamReliefState = { relief: number; contentPanY: number };

export function resetWorldCamRelief(state: WorldCamReliefState): void {
  state.relief = 0;
  state.contentPanY = 0;
}

function stepToward(current: number, target: number): number {
  const diff = target - current;
  if (Math.abs(diff) < 0.05) return target;
  return current + diff * RELIEF_STEP;
}

/** Split total lift between camera relief and residual canvas pan (engine-faithful inputs). */
export function computeWorldCamReliefTargets(
  camY: number,
  playerHeadCanvasY: number,
  hudInsetBottom: number,
  state: WorldCamReliefState,
  maxContentPan = MAX_CONTENT_PAN,
): { targetRelief: number; targetPanY: number; targetMin: number } {
  const targetMin = hudInsetBottom + 4;
  const rawDeficit = targetMin - playerHeadCanvasY;
  const camDrop = Math.min(state.relief, camY);
  const effectiveHead = playerHeadCanvasY + camDrop + state.contentPanY;
  const effectiveDeficit = targetMin - effectiveHead;

  const clearBand = rawDeficit <= -LEAVE_PX && effectiveDeficit <= -LEAVE_PX;
  if (clearBand) return { targetRelief: 0, targetPanY: 0, targetMin };

  const needEnter = rawDeficit > 0 || effectiveDeficit > 0;
  if (needEnter) {
    const lift = Math.max(0, rawDeficit, effectiveDeficit);
    const maxCam = Math.min(camY, MAX_RELIEF);
    const targetRelief = Math.min(maxCam, lift);
    const targetPanY = Math.min(maxContentPan, Math.max(0, lift - targetRelief));
    return { targetRelief, targetPanY, targetMin };
  }

  if (effectiveDeficit <= -LEAVE_PX) return { targetRelief: 0, targetPanY: 0, targetMin };
  return { targetRelief: state.relief, targetPanY: state.contentPanY, targetMin };
}

export function adjustCamYForHudInset(
  camY: number,
  playerHeadCanvasY: number,
  hudInsetBottom: number,
  state: WorldCamReliefState,
  bounds?: { viewportHeight: number; playerHeight: number },
): { camY: number; relief: number; contentPanY: number; effectiveHeadCanvasY: number; headAfterCamRelief: number } {
  const maxPan = bounds ? Math.max(0, bounds.viewportHeight - bounds.playerHeight - playerHeadCanvasY) : MAX_CONTENT_PAN;
  const { targetRelief, targetPanY } = computeWorldCamReliefTargets(camY, playerHeadCanvasY, hudInsetBottom, state, maxPan);

  // Never ease into the HUD: follow an approaching player immediately, and
  // ease only the return once the world is safely clear again.
  let relief = targetRelief > state.relief ? targetRelief : stepToward(state.relief, targetRelief);
  relief = Math.max(0, Math.min(relief, MAX_RELIEF, camY, maxPan));

  const adjustedCamY = Math.max(0, camY - relief);
  const headAfterCamRelief = playerHeadCanvasY + (camY - adjustedCamY);
  let contentPanY = targetPanY > state.contentPanY ? targetPanY : stepToward(state.contentPanY, targetPanY);
  const remainingPan = bounds ? Math.max(0, bounds.viewportHeight - bounds.playerHeight - headAfterCamRelief) : MAX_CONTENT_PAN;
  contentPanY = Math.max(0, Math.min(contentPanY, remainingPan));
  const effectiveHeadCanvasY = headAfterCamRelief + contentPanY;

  state.relief = relief;
  state.contentPanY = contentPanY;
  return { camY: adjustedCamY, relief, contentPanY, effectiveHeadCanvasY, headAfterCamRelief };
}

declare global {
  interface Window {
    __worldCameraReport?: {
      hudInsetBottom: number;
      hudInsetSource: "css-var" | "dom-fallback" | null;
      camRelief: number;
      contentPanY?: number;
      headAfterCamRelief?: number;
      effectivePlayerHeadCanvasY?: number;
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
  if (typeof window === "undefined" || !shouldPublishRenderGeometryReports()) return;
  window.__worldCameraReport = { ...payload, canvasW: cw, canvasH: ch, ts: Date.now() };
}

export { readUiSafeTopCanvas };
