import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { shouldShowInWorldAssetRecovery, shouldShowTitleWorldRetry } from "./asset-recovery.ts";

const root = join(import.meta.dirname, "..", "..", "..");

test("title retry appears only after a required world failure or stalled load", () => {
  assert.equal(shouldShowTitleWorldRetry({ worldAssetsReady: false, worldAssetsStalled: false, worldAssetFailures: [] }), false);
  assert.equal(shouldShowTitleWorldRetry({ worldAssetsReady: false, worldAssetsStalled: false, worldAssetFailures: ["/game/props/bed.png"] }), true);
  assert.equal(shouldShowTitleWorldRetry({ worldAssetsReady: false, worldAssetsStalled: true, worldAssetFailures: [] }), true);
  assert.equal(shouldShowTitleWorldRetry({ worldAssetsReady: true, worldAssetsStalled: true, worldAssetFailures: [] }), false);
});

test("in-world recovery appears only for failures outside dialogs and modal flows", () => {
  const state = {
    mode: "world" as const,
    worldAssetsReady: true,
    assetFailures: ["/game/sprites/battle-only.png"],
    dialog: null,
    namePrompt: null,
    menu: null,
  };
  assert.equal(shouldShowInWorldAssetRecovery(state, false), true);
  assert.equal(shouldShowInWorldAssetRecovery({ ...state, assetFailures: [] }, false), false);
  assert.equal(shouldShowInWorldAssetRecovery({ ...state, dialog: {} as never }, false), false);
  assert.equal(shouldShowInWorldAssetRecovery({ ...state, namePrompt: {} as never }, false), false);
  assert.equal(shouldShowInWorldAssetRecovery({ ...state, menu: "root" }, false), false);
  assert.equal(shouldShowInWorldAssetRecovery({ ...state, mode: "battle" }, false), false);
  assert.equal(shouldShowInWorldAssetRecovery(state, true), false);
});

test("recovery markup has an interactive class and is removed from focus in clipped contexts", () => {
  const app = readFileSync(join(root, "src", "game", "GameApp.tsx"), "utf8");
  const css = readFileSync(join(root, "src", "styles.css"), "utf8");
  assert.match(app, /className="asset-recovery-control"/);
  assert.match(css, /\.asset-recovery-control\s*\{[^}]*pointer-events:\s*auto;/s);
  assert.match(css, /\.top-stack:has\(\.hud-objective-expanded\) \.asset-recovery-control,\s*\.game-root\.is-battle \.asset-recovery-control\s*\{[^}]*display:\s*none;/s);
});
