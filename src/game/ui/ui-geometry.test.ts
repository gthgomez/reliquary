import assert from "node:assert/strict";
import test from "node:test";
import { formatUiSafeTopPx, UI_SAFE_TOP_GAP_PX } from "./ui-geometry.ts";

test("formatUiSafeTopPx adds configured gap", () => {
  assert.equal(formatUiSafeTopPx(40), `${40 + UI_SAFE_TOP_GAP_PX}`);
});
