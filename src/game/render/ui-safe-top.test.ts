import assert from "node:assert/strict";
import { test } from "node:test";
import { UI_SAFE_TOP_GAP_PX, uiSafeTopCanvasFromCssVar } from "./ui-safe-top.ts";
import { shouldPublishRenderGeometryReports } from "./render-report-gate.ts";

test("UI_SAFE_TOP_GAP_PX matches HUD contract", () => {
  assert.equal(UI_SAFE_TOP_GAP_PX, 4);
});

test("uiSafeTopCanvasFromCssVar maps viewport CSS var into canvas space", () => {
  const canvas = {
    height: 512,
    parentElement: {
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 320, height: 600 }),
    },
    getBoundingClientRect: () => ({ top: 80, left: 0, width: 320, height: 512 }),
  } as unknown as HTMLCanvasElement;
  const prev = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () =>
    ({
      getPropertyValue: (name: string) => (name === "--ui-safe-top-px" ? "120" : ""),
    }) as CSSStyleDeclaration;
  try {
    const inset = uiSafeTopCanvasFromCssVar(canvas);
    assert.ok(inset != null && inset > 30 && inset < 80);
  } finally {
    globalThis.getComputedStyle = prev;
  }
});

test("production gate disables render report mutation", () => {
  assert.equal(shouldPublishRenderGeometryReports(), false);
});
