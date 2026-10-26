import assert from "node:assert/strict";
import { test } from "node:test";
import { startMusic, stopMusic, unlockAudio } from "./audio.ts";

test("repeated audio gestures install only one visibility listener", () => {
  const globals = globalThis as Record<string, unknown>;
  const before = [globals.window, globals.document];
  let listeners = 0;
  let context: { state: string };
  let oscillators = 0;
  let tick: () => void = () => {};
  const gain = () => ({ gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} });
  globals.window = {
    AudioContext: class {
      state = "running";
      currentTime = 0;
      destination = {};
      createGain = gain;
      constructor() { context = this; }
      createOscillator() { oscillators++; return { frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; }
    },
    setTimeout(callback: () => void) { tick = callback; return 1000000; },
  };
  globals.document = {
    addEventListener: () => {
      listeners++;
    },
  };
  try {
    for (let i = 0; i < 100; i++) unlockAudio();
    assert.equal(listeners, 1);
    context!.state = "suspended";
    startMusic();
    for (let i = 0; i < 20; i++) tick();
    assert.equal(oscillators, 0, "suspended time must not accumulate notes");
    context!.state = "running";
    tick();
    assert.ok(oscillators > 0);
  } finally {
    stopMusic();
    for (const [name, value] of [
      ["window", before[0]],
      ["document", before[1]],
    ] as const) {
      if (value === undefined) delete globals[name];
      else globals[name] = value;
    }
  }
});
