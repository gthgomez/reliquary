/** Gap below measured HUD stack before canvas “walk safe” band begins (CSS px). */
export const UI_SAFE_TOP_GAP_PX = 4;

/**
 * Renderer / camera coordination (DOM contract, UI-owned):
 * `.viewport` publishes `--ui-safe-top-px` = distance from viewport top to the
 * bottom of `.top-stack` plus {@link UI_SAFE_TOP_GAP_PX}. Stage agents map this
 * into canvas space the same way `measureBattleUiReserveCanvas` maps
 * `.battle-controls` (read only; do not move `.battle-controls` / `.game-canvas`).
 */
export function formatUiSafeTopPx(measuredBottomFromViewportTop: number): string {
  return `${Math.max(0, Math.ceil(measuredBottomFromViewportTop + UI_SAFE_TOP_GAP_PX))}`;
}
