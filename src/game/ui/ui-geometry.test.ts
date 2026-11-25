import assert from "node:assert/strict";
import test from "node:test";
import { formatUiSafeTopPx, observeUiSafeTop, UI_SAFE_TOP_GAP_PX } from "./ui-geometry.ts";

test("formatUiSafeTopPx adds configured gap", () => {
  assert.equal(formatUiSafeTopPx(40), `${40 + UI_SAFE_TOP_GAP_PX}`);
});

test("the safe top follows the HUD stack and clears when it closes", () => {
  const saved = globalThis.ResizeObserver;
  let resize: (() => void) | undefined;
  const observed = new Set<unknown>();
  let disconnected = false;
  let viewportTop = 10;
  let stackBottom = 100;
  let stackHeight = 90;
  let value = "";
  const viewport = {
    getBoundingClientRect: () => ({ top: viewportTop }),
    style: { setProperty: (_key: string, next: string) => { value = next; }, removeProperty: () => { value = ""; } },
  };
  const stack = { getBoundingClientRect: () => ({ bottom: stackBottom, height: stackHeight }) };
  class FakeResizeObserver {
    constructor(callback: () => void) { resize = callback; }
    observe(element: unknown) { observed.add(element); }
    disconnect() { disconnected = true; }
  }
  Object.assign(globalThis, { ResizeObserver: FakeResizeObserver });
  try {
    const cleanup = observeUiSafeTop(viewport as unknown as HTMLElement, stack as unknown as HTMLElement);
    assert.equal(value, "94");
    assert.deepEqual(observed, new Set([stack, viewport]));
    stackBottom = 140;
    stackHeight = 130;
    resize!();
    assert.equal(value, "134");
    viewportTop = 20;
    resize!();
    assert.equal(value, "124");
    stackHeight = 0;
    resize!();
    assert.equal(value, "");
    cleanup();
    assert.ok(disconnected);
  } finally {
    Object.assign(globalThis, { ResizeObserver: saved });
  }
});
