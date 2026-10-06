import assert from "node:assert/strict";
import { test } from "node:test";
import { unlockAudio } from "./audio.ts";

test("unlockAudio is a no-op when no AudioContext exists", () => {
  assert.doesNotThrow(() => unlockAudio());
});
