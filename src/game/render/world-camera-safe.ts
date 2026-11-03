/** Exploration HUD inset and camera relief (renderer/engine). */

import { readUiSafeTopCanvas } from "./ui-safe-top.ts";
import { shouldPublishRenderGeometryReports } from "./render-report-gate.ts";

const ENTER_PX = 10;
const LEAVE_PX = 4;
const RELIEF_STEP = 0.18;
const MAX_RELIEF = 96;

/** @deprecated use readUiSafeTopCanvas — kept for tests comparing fallback path. */
export function measureWorldHudInsetCanvas(canvas: HTMLCanvasElement): number | null {
  const { insetCanvas, source } = readUiSafeTopCanvas(canvas);
  return source ? insetCanvas : null;
}

export type WorldCamReliefState = { relief: number };

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
      hudInsetSource: "css-var" | "dom-fallback" | null;
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
  if (typeof window === "undefined" || !shouldPublishRenderGeometryReports()) return;
  window.__worldCameraReport = { ...payload, canvasW: cw, canvasH: ch, ts: Date.now() };
}

export { readUiSafeTopCanvas };
