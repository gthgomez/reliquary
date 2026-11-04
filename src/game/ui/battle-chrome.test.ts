import assert from "node:assert/strict";
import test from "node:test";
import {
  battlePanelHeading,
  battleSubmenuRootClass,
  isBattleSubmenuPhase,
} from "./battle-chrome.ts";

test("isBattleSubmenuPhase covers scrollable battle panels", () => {
  assert.equal(isBattleSubmenuPhase("command"), false);
  assert.equal(isBattleSubmenuPhase("party"), true);
  assert.equal(isBattleSubmenuPhase("skills"), true);
});

test("battlePanelHeading labels forced switch and item flows", () => {
  assert.match(battlePanelHeading("party") ?? "", /companion/i);
  assert.equal(battlePanelHeading("command"), null);
});

test("battleSubmenuRootClass toggles submenu styling hook", () => {
  assert.equal(battleSubmenuRootClass("party"), " is-battle-submenu");
  assert.equal(battleSubmenuRootClass("command"), "");
});
