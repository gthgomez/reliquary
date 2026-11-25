/** Exploration HUD inset and camera relief (renderer/engine). */

import { readUiSafeTopCanvas } from "./ui-safe-top.ts";
import { shouldPublishRenderGeometryReports } from "./render-report-gate.ts";

const LEAVE_PX = 4;
const RELIEF_STEP = 0.18;
const MAX_RELIEF = 96;
const MAX_CONTENT_PAN = 160;
const LANDMARK_SPEED_PX_PER_SECOND = 48;

export type WorldCamReliefState = {
  relief: number;
  contentPanY: number;
  landmarkRelief?: number;
  previousWorldHeadY?: number;
  previousScreenHeadY?: number;
};

export function resetWorldCamRelief(state: WorldCamReliefState): void {
  state.relief = 0;
  state.contentPanY = 0;
  delete state.landmarkRelief;
  delete state.previousWorldHeadY;
  delete state.previousScreenHeadY;
}

function stepToward(current: number, target: number, dtSeconds: number): number {
  const diff = target - current;
  if (Math.abs(diff) < 0.05) return target;
  return current + diff * (1 - (1 - RELIEF_STEP) ** (Math.max(0, Math.min(dtSeconds, 0.1)) * 60));
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
  bounds?: { viewportHeight: number; playerHeight: number; landmarkTop?: number; dtSeconds?: number },
): { camY: number; relief: number; contentPanY: number; effectiveHeadCanvasY: number; headAfterCamRelief: number } {
  const maxPan = bounds ? Math.max(0, bounds.viewportHeight - bounds.playerHeight - playerHeadCanvasY) : MAX_CONTENT_PAN;
  const worldHeadY = playerHeadCanvasY + camY;
  const travel = worldHeadY - (state.previousWorldHeadY ?? worldHeadY);
  const playerStill = state.previousWorldHeadY !== undefined && Math.abs(travel) <= 0.001;
  const dtSeconds = bounds?.dtSeconds ?? 1 / 60;
  const { targetRelief, targetPanY } = computeWorldCamReliefTargets(
    camY, playerHeadCanvasY, hudInsetBottom, state, maxPan,
  );

  // Never ease into the HUD: follow an approaching player immediately, and
  // ease only the return once the world is safely clear again.
  let relief = targetRelief > state.relief ? targetRelief : stepToward(state.relief, targetRelief, dtSeconds);
  if (playerStill && targetRelief < state.relief) relief = state.relief;
  relief = Math.max(0, Math.min(relief, MAX_RELIEF, camY, maxPan));

  let mandatoryCamY = Math.max(0, camY - relief);
  let mandatoryHead = playerHeadCanvasY + (camY - mandatoryCamY);
  let contentPanY = targetPanY > state.contentPanY ? targetPanY : stepToward(state.contentPanY, targetPanY, dtSeconds);
  if (playerStill && targetPanY < state.contentPanY) contentPanY = state.contentPanY;
  let remainingPan = bounds ? Math.max(0, bounds.viewportHeight - bounds.playerHeight - mandatoryHead) : MAX_CONTENT_PAN;
  contentPanY = Math.max(0, Math.min(contentPanY, remainingPan));
  // Returning HUD clearance must not move the player against southbound input.
  // Restore only correction that was being released, and only within the
  // current map/viewport bounds. Immediate increases still clear the HUD.
  if (travel > 0.001 && state.previousScreenHeadY !== undefined) {
    const previousMandatoryHead = state.previousScreenHeadY - (state.landmarkRelief ?? 0);
    let shortfall = previousMandatoryHead - (mandatoryHead + contentPanY);
    if (shortfall > 0) {
      const restorePan = Math.min(shortfall, Math.max(0, state.contentPanY - contentPanY), remainingPan - contentPanY);
      contentPanY += restorePan;
      shortfall -= restorePan;
      relief += Math.min(shortfall, Math.max(0, state.relief - relief), Math.max(0, Math.min(camY, MAX_RELIEF, maxPan - contentPanY) - relief));
      mandatoryCamY = Math.max(0, camY - relief);
      mandatoryHead = playerHeadCanvasY + relief;
      remainingPan = bounds ? Math.max(0, bounds.viewportHeight - bounds.playerHeight - mandatoryHead) : MAX_CONTENT_PAN;
    }
  }
  // Landmark framing is optional: it may use remaining camera travel, but it
  // must not add a canvas pan or pull Rowan backwards while he is walking.
  const optionalLimit = Math.min(mandatoryCamY, Math.max(0, remainingPan - contentPanY));
  const targetLandmark = bounds?.landmarkTop === undefined ? 0 : Math.min(optionalLimit,
    Math.max(0, hudInsetBottom + 4 - bounds.landmarkTop - relief - contentPanY));
  const mandatoryScreenHeadY = worldHeadY - mandatoryCamY + contentPanY;
  let landmarkRelief = Math.min(optionalLimit, state.landmarkRelief ?? 0);
  if (state.previousWorldHeadY === undefined || state.previousScreenHeadY === undefined) {
    // A reset, resize or warp has no preceding visible camera frame to ease from.
    landmarkRelief = targetLandmark;
  } else {
    if (Math.abs(travel) > 0.001) {
      const step = LANDMARK_SPEED_PX_PER_SECOND * Math.max(0, Math.min(dtSeconds, 0.1));
      const candidate = landmarkRelief + Math.max(-step, Math.min(step, targetLandmark - landmarkRelief));
      const noReversal = state.previousScreenHeadY - mandatoryScreenHeadY;
      const limited = travel < 0 ? Math.min(candidate, noReversal) : Math.max(candidate, noReversal);
      landmarkRelief = Math.max(Math.min(landmarkRelief, candidate), Math.min(limited, Math.max(landmarkRelief, candidate)));
      landmarkRelief = Math.max(0, Math.min(optionalLimit, landmarkRelief));
    }
  }
  const adjustedCamY = mandatoryCamY - landmarkRelief;
  const headAfterCamRelief = playerHeadCanvasY + (camY - adjustedCamY);
  const effectiveHeadCanvasY = headAfterCamRelief + contentPanY;

  state.relief = relief;
  state.contentPanY = contentPanY;
  state.landmarkRelief = landmarkRelief;
  state.previousWorldHeadY = worldHeadY;
  state.previousScreenHeadY = effectiveHeadCanvasY;
  return { camY: adjustedCamY, relief: relief + landmarkRelief, contentPanY, effectiveHeadCanvasY, headAfterCamRelief };
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
