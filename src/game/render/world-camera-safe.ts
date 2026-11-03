/** Exploration HUD inset and camera relief (renderer/engine). */

import { readUiSafeTopCanvas } from "./ui-safe-top.ts";
import { shouldPublishRenderGeometryReports } from "./render-report-gate.ts";

const ENTER_PX = 10;
const LEAVE_PX = 4;
const RELIEF_STEP = 0.18;
const MAX_RELIEF = 96;
const MAX_CONTENT_PAN = 160;

export type WorldCamReliefState = { relief: number; contentPanY: number };

export function adjustCamYForHudInset(
  camY: number,
  playerHeadCanvasY: number,
  hudInsetBottom: number,
  state: WorldCamReliefState,
): { camY: number; relief: number; contentPanY: number; effectiveHeadCanvasY: number; headAfterCamRelief: number } {
  const targetMin = hudInsetBottom + 4;
  let relief = state.relief;
  const gap = targetMin - playerHeadCanvasY;
  if (gap > ENTER_PX) relief = Math.min(MAX_RELIEF, relief + gap * RELIEF_STEP);
  else if (gap < -LEAVE_PX) relief = Math.max(0, relief + gap * RELIEF_STEP);
  const adjustedCamY = Math.max(0, camY - relief);
  const headAfterCamRelief = playerHeadCanvasY + (camY - adjustedCamY);

  let contentPanY = state.contentPanY;
  let gapAfterCam = targetMin - headAfterCamRelief;
  if (gapAfterCam > ENTER_PX) {
    contentPanY = Math.min(MAX_CONTENT_PAN, contentPanY + gapAfterCam * RELIEF_STEP);
    if (adjustedCamY === 0 && camY === 0) {
      contentPanY = Math.min(MAX_CONTENT_PAN, Math.max(contentPanY, gapAfterCam + 4));
    }
  } else if (gapAfterCam < -LEAVE_PX) {
    contentPanY = Math.max(0, contentPanY + gapAfterCam * RELIEF_STEP);
  }

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
