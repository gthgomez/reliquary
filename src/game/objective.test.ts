import assert from "node:assert/strict";
import { test } from "node:test";
import { currentObjective } from "./systems/objective.ts";

test("before a pact, the objective points at the Binding Grove", () => {
  assert.equal(
    currentObjective({}),
    "Speak a pact at the Binding Grove, west of Elderhall.",
  );
});

test("after the pact but before the trial, the objective names Cael and the route", () => {
  const text = currentObjective({ starter: true });
  assert.match(text!, /Briar Road|Bind companions/);
  assert.match(text!, /Thornkeep/);
  assert.match(text!, /Cael/);
});

test("after the trial, the objective closes chapter one", () => {
  const text = currentObjective({ starter: true, trial: true });
  assert.ok(text!.length > 0);
  assert.doesNotMatch(text!, /Thornkeep/);
});
