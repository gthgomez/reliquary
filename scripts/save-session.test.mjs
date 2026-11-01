import assert from "node:assert/strict";
import { test } from "node:test";
import { acquireSaveSession } from "../src/game/save-session.ts";

test("acquireSaveSession resolves denied when lock unavailable", async () => {
  const original = navigator.locks;
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: (_name, _opts, callback) => {
        callback(null);
        return Promise.resolve();
      },
    },
  });
  const { result, session } = await acquireSaveSession();
  assert.equal(result, "denied");
  assert.equal(session, null);
  Object.defineProperty(navigator, "locks", { configurable: true, value: original });
});

test("acquireSaveSession resolves granted when lock is held", async () => {
  const original = navigator.locks;
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: (_name, _opts, callback) => callback({}),
    },
  });
  const { result, session } = await acquireSaveSession();
  assert.equal(result, "granted");
  assert.ok(session);
  session?.release();
  Object.defineProperty(navigator, "locks", { configurable: true, value: original });
});
