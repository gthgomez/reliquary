/** True when a full-screen menu sheet should hide world HUD and exploration touch controls. */
export function isUiModalOpen(state: { menu: string | null; mode: string }): boolean {
  return Boolean(state.menu || state.mode === "shop");
}

/** Settings storage key for the in-game sound preference (S16). */
export const SOUND_MUTED_KEY = "reliquary-muted";

export function isSoundMutedStored(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(SOUND_MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundMutedStored(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(SOUND_MUTED_KEY, "1");
    else localStorage.removeItem(SOUND_MUTED_KEY);
  } catch {
    /* storage unavailable: the toggle still works, it just is not persisted */
  }
}

export type TouchChromeState = {
  menu: string | null;
  mode: string;
  dialog: unknown;
};

/** Optional classic layout: always show the full exploration pad (localStorage toggle). */
export function isClassicTouchEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem("reliquary-classic-touch") === "1";
  } catch {
    return false;
  }
}

/** N/W/E/S + A/B pad for overworld walking only (unless classic mode). */
export function shouldShowExplorationTouch(
  state: TouchChromeState,
  classicTouch = isClassicTouchEnabled(),
): boolean {
  if (state.mode === "boot" || state.mode === "title" || state.mode === "victory") return false;
  if (classicTouch) return true;
  if (isUiModalOpen(state)) return false;
  if (state.dialog) return false;
  if (state.mode === "battle") return false;
  return state.mode === "world";
}

/** Compact A/B row while dialogue is up (Next/Close) without the walk pad. */
export function shouldShowDialogTouch(
  state: TouchChromeState,
  classicTouch = isClassicTouchEnabled(),
): boolean {
  if (!state.dialog || isUiModalOpen(state)) return false;
  if (classicTouch) return false;
  return true;
}

export function shopBuyAffordability(gold: number, price: number): "affordable" | "unaffordable" {
  return gold >= price ? "affordable" : "unaffordable";
}

export function skillMpAffordability(currentMp: number, cost: number): "affordable" | "unaffordable" {
  return currentMp >= cost ? "affordable" : "unaffordable";
}

/** Visible hint for skill rows; browsing stays enabled when unaffordable. */
export function skillMpHint(currentMp: number, cost: number): string {
  if (currentMp >= cost) return `${cost} MP`;
  return `Need ${cost} MP · have ${currentMp}`;
}
