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
  const portrait = devicePortrait || stageH > stageW * 1.05;
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
 * Choose an integer logical grid whose aspect is closest to the usable stage.
 * The score prefers the authored column count and falls back to the smaller
 * grid on a tie, which keeps the backing store cheap while letting the canvas
 * fill the stage (no letterbox bands) across phones, tablets and desktops.
 */
function bestBattleGrid(
  aspect: number,
  columns: { min: number; max: number },
  rows: { min: number; max: number },
  preferredColumns: number,
): BattleViewportSize {
  let best = { cols: preferredColumns, rows: rows.min, score: Number.POSITIVE_INFINITY, area: Number.POSITIVE_INFINITY };
  for (let cols = columns.min; cols <= columns.max; cols += 1) {
    for (let r = rows.min; r <= rows.max; r += 1) {
      const score = Math.abs(cols / r - aspect) + Math.abs(cols - preferredColumns) * 0.002;
      const area = cols * r;
      if (score < best.score - 1e-9 || (Math.abs(score - best.score) < 1e-9 && area < best.area)) {
        best = { cols, rows: r, score, area };
      }
    }
  }
  return { viewW: best.cols, viewH: best.rows };
}

/** Fit the logical battle stage to the real usable stage box. */
export function battleViewportForStage(
  presentation: BattlePresentation,
  stageW: number,
  stageH: number,
): BattleViewportSize {
  if (stageW <= 0 || stageH <= 0) return battleViewportSize(presentation);
  const aspect = stageW / stageH;
  if (presentation === "portrait") {
    return bestBattleGrid(aspect, { min: 8, max: 12 }, { min: 12, max: 26 }, 10);
  }
  if (presentation === "compact-landscape") {
    return bestBattleGrid(aspect, { min: 14, max: 22 }, { min: 9, max: 11 }, 18);
  }
  return bestBattleGrid(aspect, { min: 14, max: 20 }, { min: 9, max: 12 }, 16);
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
