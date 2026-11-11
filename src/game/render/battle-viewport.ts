/**
 * Battle-specific presentation contract. The exploration camera keeps its
 * 12x9 / 10x16 views; battles choose their own stage so the desktop composition
 * can be true 16:9 without touching world movement or map geometry.
 */

export type BattlePresentation = "desktop" | "compact-landscape" | "portrait";

export const BATTLE_VIEW_W = 16;
export const BATTLE_VIEW_H = 9;
export const BATTLE_VIEW_W_PORTRAIT = 10;
export const BATTLE_VIEW_H_PORTRAIT = 18;

export type BattleViewportSize = { viewW: number; viewH: number };

/**
 * Pick a battle stage family from the usable stage box (not the raw window):
 * the shell reserves safe areas and touch controls before calling layout().
 */
export function battlePresentation(
  stageW: number,
  stageH: number,
  devicePortrait = false,
): BattlePresentation {
  if (stageW <= 0 || stageH <= 0) return "desktop";
  const portrait = devicePortrait || (stageH > stageW * 1.05 && stageW < 920);
  if (portrait) return "portrait";
  // Phones held sideways have very little vertical room; the compact HUD needs
  // the same canvas ratio but a lower stable command boundary.
  return stageH <= 520 ? "compact-landscape" : "desktop";
}

export function battleViewportSize(presentation: BattlePresentation): BattleViewportSize {
  if (presentation === "portrait") {
    return { viewW: BATTLE_VIEW_W_PORTRAIT, viewH: BATTLE_VIEW_H_PORTRAIT };
  }
  return { viewW: BATTLE_VIEW_W, viewH: BATTLE_VIEW_H };
}

/**
 * Fit the logical battle stage to the real usable stage box so the canvas
 * always fills it (no unexplained letterbox). The reference size 1536x864
 * yields exactly 16x9; 16:10 desktops gain a row, ultrawide compact phones
 * gain columns, and tall phones gain rows. Never stretches art: the renderer
 * cover-crops the plate into whatever logical aspect is chosen.
 */
export function battleViewportForStage(
  presentation: BattlePresentation,
  stageW: number,
  stageH: number,
): BattleViewportSize {
  if (stageW <= 0 || stageH <= 0) return battleViewportSize(presentation);
  const aspect = stageW / stageH;
  if (presentation === "portrait") {
    const rows = Math.min(24, Math.max(16, Math.round(BATTLE_VIEW_W_PORTRAIT / aspect)));
    return { viewW: BATTLE_VIEW_W_PORTRAIT, viewH: rows };
  }
  if (presentation === "compact-landscape") {
    const cols = Math.min(21, Math.max(16, Math.round(BATTLE_VIEW_H * aspect)));
    return { viewW: cols, viewH: BATTLE_VIEW_H };
  }
  const rows = Math.min(12, Math.max(9, Math.round(BATTLE_VIEW_W / aspect)));
  return { viewW: BATTLE_VIEW_W, viewH: rows };
}

export type BattleStageMetrics = {
  /** Ground contact line as a fraction of canvas height. */
  ground: number;
  /** Stable top of the command dock; never derived from a submenu's height. */
  commandTop: number;
  /** Player and foe silhouette centers as fractions of canvas width. */
  playerCx: number;
  foeCx: number;
  /** Silhouette target heights as fractions of canvas height. */
  playerHeight: number;
  foeHeight: number;
  /** Status card bands, in canvas fractions. Player is upper-left, foe upper-right. */
  statusTop: number;
  statusHeight: number;
  statusWidth: number;
  statusSide: number;
};

/**
 * These fractions are shared by the canvas renderer, the geometry report and
 * the DOM HUD (via the tests that compare both). The desktop row tracks the
 * supplied reference composition: status cards at 8% height, creature feet at
 * ~61.5%, command dock at ~66.7%.
 */
export const BATTLE_STAGE_METRICS: Record<BattlePresentation, BattleStageMetrics> = {
  desktop: {
    ground: 0.615,
    commandTop: 0.667,
    playerCx: 0.322,
    foeCx: 0.712,
    playerHeight: 0.36,
    foeHeight: 0.34,
    statusTop: 0.075,
    statusHeight: 0.17,
    statusWidth: 0.335,
    statusSide: 0.024,
  },
  "compact-landscape": {
    ground: 0.51,
    commandTop: 0.55,
    playerCx: 0.305,
    foeCx: 0.7,
    playerHeight: 0.35,
    foeHeight: 0.33,
    statusTop: 0.035,
    statusHeight: 0.14,
    statusWidth: 0.325,
    statusSide: 0.018,
  },
  portrait: {
    ground: 0.505,
    commandTop: 0.55,
    playerCx: 0.29,
    foeCx: 0.71,
    playerHeight: 0.235,
    foeHeight: 0.225,
    statusTop: 0.022,
    statusHeight: 0.088,
    statusWidth: 0.44,
    statusSide: 0.028,
  },
};

export function battleStageMetrics(presentation: BattlePresentation): BattleStageMetrics {
  return BATTLE_STAGE_METRICS[presentation];
}
