import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame } from "./engine.ts";

test("boot → destroy → boot keeps one loop and one listener set", async () => {
  type EventHandler = (...args: never[]) => void;
  const listeners = new Map<string, Set<EventHandler>>();
  let nextFrame = 0;
  let cancelled = 0;
  const fakeWindow = {
    addEventListener(type: string, fn: EventHandler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(fn); },
    removeEventListener(type: string, fn: EventHandler) { listeners.get(type)?.delete(fn); },
    __controlsTest: undefined,
  };
  const fakeDocument = {
    visibilityState: "visible",
    addEventListener: fakeWindow.addEventListener,
    removeEventListener: fakeWindow.removeEventListener,
  };
  const oldWindow = (globalThis as Record<string, unknown>).window;
  const oldDocument = (globalThis as Record<string, unknown>).document;
  const oldImage = (globalThis as Record<string, unknown>).Image;
  const oldRaf = (globalThis as Record<string, unknown>).requestAnimationFrame;
  const oldCancel = (globalThis as Record<string, unknown>).cancelAnimationFrame;
  (globalThis as Record<string, unknown>).window = fakeWindow;
  (globalThis as Record<string, unknown>).document = fakeDocument;
  (globalThis as Record<string, unknown>).Image = class { onload?: () => void; onerror?: () => void; set src(_: string) { queueMicrotask(() => this.onload?.()); } };
  (globalThis as Record<string, unknown>).requestAnimationFrame = () => ++nextFrame;
  (globalThis as Record<string, unknown>).cancelAnimationFrame = () => { cancelled += 1; };
  try {
    const game = new ReliquaryGame();
    const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
    await game.boot(canvas);
    assert.equal(game.lifecycle, "booted");
    assert.equal(nextFrame, 1);
    assert.equal(listeners.get("keydown")?.size, 1);
    await game.boot(canvas);
    assert.equal(nextFrame, 1);
    game.destroy();
    assert.equal(game.lifecycle, "stopped");
    assert.equal(cancelled, 1);
    assert.equal(listeners.get("keydown")?.size, 0);
    assert.equal(listeners.get("visibilitychange")?.size, 0);
    assert.equal(fakeWindow.__controlsTest, undefined);
    await game.boot(canvas);
    assert.equal(nextFrame, 2);
    assert.equal(listeners.get("keydown")?.size, 1);
    game.destroy();
    assert.equal(cancelled, 2);
  } finally {
    for (const [key, value] of [["window", oldWindow], ["document", oldDocument], ["Image", oldImage], ["requestAnimationFrame", oldRaf], ["cancelAnimationFrame", oldCancel]] as const) {
      if (value === undefined) delete (globalThis as Record<string, unknown>)[key];
      else (globalThis as Record<string, unknown>)[key] = value;
    }
  }
});
