import assert from "node:assert/strict";
import test from "node:test";
import { isUiModalOpen } from "./ui-chrome.ts";

test("isUiModalOpen when root menu, shop, or world exploration", () => {
  assert.equal(isUiModalOpen({ menu: null, mode: "world" }), false);
  assert.equal(isUiModalOpen({ menu: "root", mode: "world" }), true);
  assert.equal(isUiModalOpen({ menu: "reliquary", mode: "world" }), true);
  assert.equal(isUiModalOpen({ menu: null, mode: "shop" }), true);
  assert.equal(isUiModalOpen({ menu: null, mode: "battle" }), false);
});
