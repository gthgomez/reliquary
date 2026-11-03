import assert from "node:assert/strict";
import { test } from "node:test";
import {
  UI_SAFE_TOP_GAP_PX,
  readUiSafeTopCanvas,
  uiSafeTopCanvasFromCssVar,
  viewportPublishesUiSafeTop,
} from "./ui-safe-top.ts";
import { shouldPublishRenderGeometryReports } from "./render-report-gate.ts";

test("UI_SAFE_TOP_GAP_PX matches HUD contract", () => {
  assert.equal(UI_SAFE_TOP_GAP_PX, 4);
});

function mockCanvas() {
  return {
    height: 512,
    width: 320,
    parentElement: {
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 320, height: 600 }),
      querySelector: () => ({
        getClientRects: () => [{ width: 1 }],
        getBoundingClientRect: () => ({ bottom: 140, top: 40, left: 0, right: 320 }),
      }),
    },
    getBoundingClientRect: () => ({ top: 80, left: 0, width: 320, height: 512 }),
  } as unknown as HTMLCanvasElement;
}

test("uiSafeTopCanvasFromCssVar maps viewport CSS var into canvas space", () => {
  const canvas = mockCanvas();
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

test("explicit CSS var 0 is valid and skips DOM fallback", () => {
  const canvas = mockCanvas();
  const prev = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () =>
    ({
      getPropertyValue: (name: string) => (name === "--ui-safe-top-px" ? "0" : ""),
    }) as CSSStyleDeclaration;
  try {
    assert.equal(viewportPublishesUiSafeTop(canvas), true);
    const read = readUiSafeTopCanvas(canvas);
    assert.equal(read.source, "css-var");
    assert.equal(read.insetCanvas, 0);
    assert.equal(uiSafeTopCanvasFromCssVar(canvas), 0);
  } finally {
    globalThis.getComputedStyle = prev;
  }
});

test("missing CSS var uses DOM fallback not zero posing as published", () => {
  const canvas = mockCanvas();
  const prev = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () =>
    ({
      getPropertyValue: () => "",
    }) as unknown as CSSStyleDeclaration;
  try {
    assert.equal(viewportPublishesUiSafeTop(canvas), false);
    const read = readUiSafeTopCanvas(canvas);
    assert.equal(read.source, "dom-fallback");
    assert.ok(read.insetCanvas > 0);
  } finally {
    globalThis.getComputedStyle = prev;
  }
});

test("production gate disables render report mutation", () => {
  assert.equal(shouldPublishRenderGeometryReports(), false);
});
