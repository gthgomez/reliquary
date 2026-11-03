import assert from "node:assert/strict";
import test from "node:test";
import {
  isClassicTouchEnabled,
  isUiModalOpen,
  shouldShowDialogTouch,
  shouldShowExplorationTouch,
  shopBuyAffordability,
} from "./ui-chrome.ts";

test("isUiModalOpen when root menu, shop, or world exploration", () => {
  assert.equal(isUiModalOpen({ menu: null, mode: "world" }), false);
  assert.equal(isUiModalOpen({ menu: "root", mode: "world" }), true);
  assert.equal(isUiModalOpen({ menu: null, mode: "shop" }), true);
});

test("exploration touch hidden for dialog, battle, and menus", () => {
  const world = { menu: null, mode: "world", dialog: null };
  assert.equal(shouldShowExplorationTouch(world), true);
  assert.equal(shouldShowExplorationTouch({ ...world, dialog: { text: "Hi" } }), false);
  assert.equal(shouldShowExplorationTouch({ menu: null, mode: "battle", dialog: null }), false);
  assert.equal(shouldShowExplorationTouch({ menu: "root", mode: "world", dialog: null }), false);
});

test("dialog touch compact row when speaking", () => {
  const speaking = { menu: null, mode: "world", dialog: { text: "Lantern" } };
  assert.equal(shouldShowDialogTouch(speaking), true);
  assert.equal(shouldShowDialogTouch(speaking, true), false);
});

test("classic touch keeps exploration pad in dialog", () => {
  assert.equal(
    shouldShowExplorationTouch({ menu: null, mode: "world", dialog: { t: 1 } }, true),
    true,
  );
});

test("shopBuyAffordability at 35 cr purse", () => {
  assert.equal(shopBuyAffordability(35, 20), "affordable");
  assert.equal(shopBuyAffordability(35, 60), "unaffordable");
  assert.equal(isClassicTouchEnabled(), false);
});
