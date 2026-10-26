import assert from "node:assert/strict";
import { test } from "node:test";
import { unlockAudio } from "./audio.ts";

test("repeated audio gestures install only one visibility listener", () => {
  const globals = globalThis as Record<string, unknown>;
  const before = [globals.window, globals.document];
  let listeners = 0;
  const gain = () => ({ gain: { value: 0 }, connect() {} });
  globals.window = { AudioContext: class { state = "running"; destination = {}; createGain = gain; } };
  globals.document = { addEventListener: () => { listeners++; } };
  try {
    for (let i = 0; i < 100; i++) unlockAudio();
    assert.equal(listeners, 1);
  } finally {
    for (const [name, value] of [["window", before[0]], ["document", before[1]]] as const) {
      if (value === undefined) delete globals[name]; else globals[name] = value;
    }
  }
});
