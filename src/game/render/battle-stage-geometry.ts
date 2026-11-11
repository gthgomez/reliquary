import type { BattleLayout } from "./battle-scene.ts";
import { shouldPublishRenderGeometryReports } from "./render-report-gate.ts";

/** Canvas-space band reserved for HUD status readouts (sprites must not enter). */
export type BattleZoneRect = { x: number; y: number; w: number; h: number };

export type BattleSpriteAnchors = {
  player: { cx: number; cy: number; feetY: number };
  foe: { cx: number; cy: number; feetY: number };
};

export type BattleCosmeticOffset = { dx: number; dy: number };

export type BattleStageGeometry = {
  layout: BattleLayout;
  /** Safe motion band between the two anchors (attacks stay inside). */
  animCorridor: BattleZoneRect;
  statusZonePlayer: BattleZoneRect;
  statusZoneFoe: BattleZoneRect;
  commandZoneTop: number;
  stableReserveTop: number;
  groundY: number;
  presentation: BattleLayout["presentation"];
  /** Layout anchors only — excludes idle/strike cosmetic motion. */
  spriteAnchors: BattleSpriteAnchors;
  /** Present on browser-test builds when publishing reports. */
  cosmeticOffset?: { player: BattleCosmeticOffset; foe: BattleCosmeticOffset };
  /** QA telemetry; anchors must not depend on this. */
  battlePhase: string | null;
};

/** Build the strike corridor between inward-facing anchors and below the status bands. */
export function battleAnimCorridor(cw: number, layout: BattleLayout): BattleZoneRect {
  const top = Math.max(
    layout.statusPlayer.y + layout.statusPlayer.h,
    layout.statusFoe.y + layout.statusFoe.h,
  ) + 6;
  const bottom = layout.groundY - 6;
  const halfW = Math.round(layout.player.targetHeight * 0.36);
  const left = Math.round(layout.player.cx - halfW - 8);
  const right = Math.round(layout.foe.cx + halfW + 8);
  return {
    x: Math.max(8, left),
    y: Math.max(4, top),
    w: Math.max(40, Math.min(cw - 16, right - left)),
    h: Math.max(24, bottom - top),
  };
}

export function battleSpriteAnchors(layout: BattleLayout): BattleSpriteAnchors {
  return {
    player: {
      cx: layout.player.cx,
      cy: layout.player.cy,
      feetY: layout.player.feetY,
    },
    foe: {
      cx: layout.foe.cx,
      cy: layout.foe.cy,
      feetY: layout.foe.feetY,
    },
  };
}

export function computeBattleStageGeometry(
  cw: number,
  _ch: number,
  layout: BattleLayout,
  battlePhase: string | null = null,
): BattleStageGeometry {
  return {
    layout,
    animCorridor: battleAnimCorridor(cw, layout),
    statusZonePlayer: layout.statusPlayer,
    statusZoneFoe: layout.statusFoe,
    commandZoneTop: layout.uiReserveTop,
    stableReserveTop: layout.uiReserveTop,
    groundY: layout.groundY,
    presentation: layout.presentation,
    spriteAnchors: battleSpriteAnchors(layout),
    battlePhase,
  };
}

declare global {
  interface Window {
    __battleStageReport?: BattleStageGeometry & { canvasW: number; canvasH: number; ts: number };
  }
}

/** Publish stage geometry for HUD peers (read-only contract; no UI edits here). */
export function reportBattleStageGeometry(
  cw: number,
  ch: number,
  geometry: BattleStageGeometry,
): void {
  if (typeof window === "undefined" || !shouldPublishRenderGeometryReports()) return;
  window.__battleStageReport = { ...geometry, canvasW: cw, canvasH: ch, ts: Date.now() };
}
