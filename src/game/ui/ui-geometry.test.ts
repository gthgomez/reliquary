import assert from "node:assert/strict";
import test from "node:test";
import { formatUiSafeTopPx, observeUiSafeTop, UI_SAFE_TOP_GAP_PX } from "./ui-geometry.ts";

test("formatUiSafeTopPx adds configured gap", () => {
  assert.equal(formatUiSafeTopPx(40), `${40 + UI_SAFE_TOP_GAP_PX}`);
});

test("safe top follows an out-of-flow popover opening, resizing, hiding and closing", () => {
  const saved = { ResizeObserver: globalThis.ResizeObserver, MutationObserver: globalThis.MutationObserver, getComputedStyle: globalThis.getComputedStyle };
  let resize: (() => void) | undefined;
  let mutation: (() => void) | undefined;
  const observed = new Set<unknown>();
  let resizeDisconnected = false;
  let mutationDisconnected = false;
  let popover: { bottom: number; height: number; visible: boolean; getBoundingClientRect: () => { bottom: number; height: number } } | null = null;
  let viewportTop = 10;
  let value = "";
  const viewport = {
    getBoundingClientRect: () => ({ top: viewportTop }),
    style: { setProperty: (_key: string, next: string) => { value = next; }, removeProperty: () => { value = ""; } },
  };
  const stack = { getBoundingClientRect: () => ({ bottom: 100, height: 90 }), querySelector: () => popover };
  class FakeResizeObserver {
    constructor(callback: () => void) { resize = callback; }
    observe(element: unknown) { observed.add(element); }
    unobserve(element: unknown) { observed.delete(element); }
    disconnect() { resizeDisconnected = true; }
  }
  class FakeMutationObserver {
    constructor(callback: () => void) { mutation = callback; }
    observe() {}
    disconnect() { mutationDisconnected = true; }
  }
  Object.assign(globalThis, { ResizeObserver: FakeResizeObserver, MutationObserver: FakeMutationObserver,
    getComputedStyle: (element: { visible: boolean }) => ({ visibility: element.visible ? "visible" : "hidden" }) });
  try {
    const cleanup = observeUiSafeTop(viewport as unknown as HTMLElement, stack as unknown as HTMLElement);
    assert.equal(value, "94");
    popover = { bottom: 220, height: 120, visible: true, getBoundingClientRect() { return this; } };
    mutation!();
    assert.ok(observed.has(popover));
    assert.equal(value, "214");
    popover.bottom = 260;
    resize!();
    assert.equal(value, "254");
    popover.visible = false;
    resize!();
    assert.equal(value, "94");
    const removed = popover;
    popover = null;
    mutation!();
    assert.equal(observed.has(removed), false);
    viewportTop = 20;
    resize!();
    assert.equal(value, "84");
    cleanup();
    assert.ok(resizeDisconnected && mutationDisconnected);
  } finally {
    Object.assign(globalThis, saved);
  }
});
