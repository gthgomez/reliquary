/** Exploration HUD inset and camera relief (renderer/engine). */

import { readUiSafeTopCanvas } from "./ui-safe-top.ts";
import { shouldPublishRenderGeometryReports } from "./render-report-gate.ts";

const ENTER_PX = 10;
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
): { targetRelief: number; targetPanY: number; targetMin: number } {
  const targetMin = hudInsetBottom + 4;
  const rawDeficit = targetMin - playerHeadCanvasY;
  const camDrop = Math.min(state.relief, camY);
  const effectiveHead = playerHeadCanvasY + camDrop + state.contentPanY;
  const effectiveDeficit = targetMin - effectiveHead;

  const clearBand = rawDeficit <= -LEAVE_PX && effectiveDeficit <= -LEAVE_PX;
  if (clearBand) return { targetRelief: 0, targetPanY: 0, targetMin };

  const needEnter = rawDeficit >= ENTER_PX || effectiveDeficit >= ENTER_PX;
  if (needEnter) {
    const lift = Math.max(0, rawDeficit, effectiveDeficit);
    const maxCam = Math.min(camY, MAX_RELIEF);
    const targetRelief = Math.min(maxCam, lift);
    const targetPanY = Math.min(MAX_CONTENT_PAN, Math.max(0, lift - targetRelief));
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
): { camY: number; relief: number; contentPanY: number; effectiveHeadCanvasY: number; headAfterCamRelief: number } {
  const { targetRelief, targetPanY } = computeWorldCamReliefTargets(camY, playerHeadCanvasY, hudInsetBottom, state);

  let relief = stepToward(state.relief, targetRelief);
  relief = Math.max(0, Math.min(relief, MAX_RELIEF, camY));

  let contentPanY = stepToward(state.contentPanY, targetPanY);
  contentPanY = Math.max(0, Math.min(contentPanY, MAX_CONTENT_PAN));

  const adjustedCamY = Math.max(0, camY - relief);
  const headAfterCamRelief = playerHeadCanvasY + (camY - adjustedCamY);
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
