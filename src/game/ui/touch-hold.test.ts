import assert from "node:assert/strict";
import test from "node:test";
import { clearTouchHolds, requestAccessibleStep, updateTouchHold, type HoldId } from "./touch-hold.ts";

test("a second pointer holds a direction until the last pointer leaves", () => {
  const held = new Map<string, Set<HoldId>>();
  assert.equal(updateTouchHold(held, "KeyW", 1, true), true);
  assert.equal(updateTouchHold(held, "KeyW", 2, true), null);
  assert.equal(updateTouchHold(held, "KeyW", 1, false), null);
  assert.equal(updateTouchHold(held, "KeyW", 2, false), false);
  assert.equal(held.size, 0);
});

test("duplicate up or lost-capture notifications do not release a different pointer", () => {
  const held = new Map<string, Set<HoldId>>();
  updateTouchHold(held, "KeyW", 10, true);
  updateTouchHold(held, "KeyW", 11, true);
  assert.equal(updateTouchHold(held, "KeyW", 10, false), null);
  assert.equal(updateTouchHold(held, "KeyW", 10, false), null);
  assert.deepEqual([...held.get("KeyW")!], [11]);
  assert.equal(updateTouchHold(held, "KeyW", 11, false), false);
  assert.equal(updateTouchHold(held, "KeyW", 11, false), null);
});

test("mode change releases each active direction once and clears the surface", () => {
  const held = new Map<string, Set<HoldId>>();
  updateTouchHold(held, "KeyW", 1, true);
  updateTouchHold(held, "KeyW", 2, true);
  updateTouchHold(held, "KeyD", 3, true);
  assert.deepEqual(clearTouchHolds(held), ["KeyW", "KeyD"]);
  assert.deepEqual(clearTouchHolds(held), []);
  assert.equal(updateTouchHold(held, "KeyW", 1, false), null);
});

function fakeScheduler() {
  let next = 0;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, () => void>();
  return {
    frame: (fn: () => void) => { const id = ++next; frames.set(id, fn); return id; },
    cancelFrame: (id: number) => { frames.delete(id); },
    timeout: (fn: () => void) => { const id = ++next; timers.set(id, fn); return id; },
    cancelTimeout: (id: number) => { timers.delete(id); },
    tick: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); },
    expire: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); },
  };
}

test("accessible activation releases after its requested step starts", () => {
  const scheduler = fakeScheduler();
  const state = { canMove: true, moving: false, map: "elderhall", x: 2, y: 3 };
  const holds: boolean[] = [];
  requestAccessibleStep(() => state, (on) => holds.push(on), scheduler);
  assert.deepEqual(holds, [true]);
  state.moving = true;
  scheduler.tick();
  assert.deepEqual(holds, [true, false]);
  scheduler.expire();
  assert.deepEqual(holds, [true, false]);
});

test("accessible activation waits for a prior step before requesting the next", () => {
  const scheduler = fakeScheduler();
  const state = { canMove: true, moving: true, map: "elderhall", x: 2, y: 3 };
  const holds: boolean[] = [];
  requestAccessibleStep(() => state, (on) => holds.push(on), scheduler);
  scheduler.tick();
  state.moving = false;
  state.x = 3;
  scheduler.tick();
  assert.deepEqual(holds, [true]);
  state.moving = true;
  scheduler.tick();
  assert.deepEqual(holds, [true, false]);
});

test("blocked movement, map changes, cancellation and timeout release accessible holds", () => {
  for (const reason of ["blocked", "map", "cancel", "timeout"] as const) {
    const scheduler = fakeScheduler();
    const state = { canMove: true, moving: false, map: "elderhall", x: 2, y: 3 };
    const holds: boolean[] = [];
    const stop = requestAccessibleStep(() => state, (on) => holds.push(on), scheduler);
    if (reason === "blocked") { scheduler.tick(); scheduler.tick(); }
    if (reason === "map") { state.map = "home"; scheduler.tick(); }
    if (reason === "cancel") stop();
    if (reason === "timeout") scheduler.expire();
    scheduler.tick();
    assert.deepEqual(holds, [true, false], reason);
  }
});

test("an accessible activation while movement is unavailable does not press a key", () => {
  const scheduler = fakeScheduler();
  const holds: boolean[] = [];
  let finished = false;
  requestAccessibleStep(
    () => ({ canMove: false, moving: false, map: "elderhall", x: 2, y: 3 }),
    (on) => holds.push(on), scheduler, () => { finished = true; },
  );
  scheduler.tick();
  assert.deepEqual(holds, []);
  assert.equal(finished, true);
});
