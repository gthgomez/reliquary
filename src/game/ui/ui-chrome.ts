/** True when a full-screen menu sheet should hide world HUD and exploration touch controls. */
export function isUiModalOpen(state: { menu: string | null; mode: string }): boolean {
  return Boolean(state.menu || state.mode === "shop");
}
