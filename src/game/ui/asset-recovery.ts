import type { Snapshot } from "../types.ts";

export function shouldShowTitleWorldRetry(snap: Pick<Snapshot, "worldAssetsReady" | "worldAssetsStalled" | "worldAssetFailures">): boolean {
  return !snap.worldAssetsReady && (snap.worldAssetsStalled || snap.worldAssetFailures.length > 0);
}

export function shouldShowInWorldAssetRecovery(
  snap: Pick<Snapshot, "mode" | "worldAssetsReady" | "assetFailures" | "dialog" | "namePrompt" | "menu">,
  uiModal: boolean,
): boolean {
  return snap.worldAssetsReady && snap.mode !== "title" && snap.mode !== "battle" &&
    snap.assetFailures.length > 0 && !snap.dialog && !snap.namePrompt && !snap.menu && !uiModal;
}
