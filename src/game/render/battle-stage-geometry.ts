import type { BattleLayout } from "./battle-scene.ts";

/** Canvas-space band reserved for HUD status readouts (sprites must not enter). */
export type BattleZoneRect = { x: number; y: number; w: number; h: number };

export type BattleStageGeometry = {
  layout: BattleLayout;
  /** Safe motion band between the two anchors (attacks stay inside). */
  animCorridor: BattleZoneRect;
  statusZonePlayer: BattleZoneRect;
  statusZoneFoe: BattleZoneRect;
  commandZoneTop: number;
};

const STATUS_H_FRAC = 0.11;
const STATUS_W_FRAC = 0.42;

function statusZone(cw: number, ch: number, side: "player" | "foe"): BattleZoneRect {
  const h = Math.max(28, Math.round(ch * STATUS_H_FRAC));
  const w = Math.max(96, Math.round(cw * STATUS_W_FRAC));
  if (side === "foe") {
    return { x: Math.round(cw * 0.04), y: Math.max(4, Math.round(ch * 0.02)), w, h };
  }
  return { x: Math.max(4, Math.round(cw - w - cw * 0.04)), y: Math.max(4, Math.round(ch * 0.02)), w, h };
}

/** Build corridor between inward-facing anchors, clipped below status bands. */
export function battleAnimCorridor(cw: number, uiReserveTop: number, layout: BattleLayout): BattleZoneRect {
  const foeStatus = statusZone(cw, uiReserveTop, "foe");
  const playerStatus = statusZone(cw, uiReserveTop, "player");
  const top = Math.max(foeStatus.y + foeStatus.h, playerStatus.y + playerStatus.h) + 6;
  const bottom = uiReserveTop - 12;
  const playerHalf = (layout.player.size * layout.player.scale) / 2;
  const left = Math.round(layout.player.cx - playerHalf - 8);
  const right = Math.round(layout.foe.x + layout.foe.w + 8);
  return {
    x: Math.max(8, left),
    y: top,
    w: Math.max(40, Math.min(cw - 16, right - left)),
    h: Math.max(24, bottom - top),
  };
}

export function computeBattleStageGeometry(
  cw: number,
  ch: number,
  layout: BattleLayout,
): BattleStageGeometry {
  const corridor = battleAnimCorridor(cw, layout.uiReserveTop, layout);
  return {
    layout,
    animCorridor: corridor,
    statusZonePlayer: statusZone(cw, ch, "player"),
    statusZoneFoe: statusZone(cw, ch, "foe"),
    commandZoneTop: layout.uiReserveTop,
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
  if (typeof window === "undefined") return;
  window.__battleStageReport = { ...geometry, canvasW: cw, canvasH: ch, ts: Date.now() };
}
