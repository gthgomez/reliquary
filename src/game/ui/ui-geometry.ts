/** CSS custom property on `.viewport` (unitless px; use as `calc(var(--ui-safe-top-px) * 1px)`). */
export const UI_SAFE_TOP_CSS_VAR = "--ui-safe-top-px";

/** Gap below measured HUD stack before canvas “walk safe” band begins (CSS px). */
export const UI_SAFE_TOP_GAP_PX = 4;

/**
 * Renderer / camera coordination (DOM contract, UI-owned):
 * `.viewport` publishes {@link UI_SAFE_TOP_CSS_VAR} = distance from viewport top to the
 * bottom of `.top-stack` plus {@link UI_SAFE_TOP_GAP_PX}. Stage agents map this
 * into canvas space the same way `measureBattleUiReserveCanvas` maps
 * `.battle-controls` (read only; do not move `.battle-controls` / `.game-canvas`).
 *
 * Lifecycle (GameApp.tsx):
 * - Inline default `"0"` on mount.
 * - ResizeObserver on `.top-stack` + `.viewport` writes updated values while mounted.
 * - Property removed when stack height is 0.
 * - Recomputed when world HUD visibility, toast, modal, objective, or mode changes.
 */
export function formatUiSafeTopPx(measuredBottomFromViewportTop: number): string {
  return `${Math.max(0, Math.ceil(measuredBottomFromViewportTop + UI_SAFE_TOP_GAP_PX))}`;
}
