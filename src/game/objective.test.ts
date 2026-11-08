import assert from "node:assert/strict";
import { test } from "node:test";
import { currentObjective, objectiveHint } from "./systems/objective.ts";

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

test("optional directions change with place and progression", () => {
  assert.match(objectiveHint({}, "Rowan's Cottage")!, /doorway/);
  assert.match(objectiveHint({}, "Elderhall")!, /western|west/);
  assert.doesNotMatch(objectiveHint({}, "Elderhall")!, /stone path/i);
  assert.match(objectiveHint({}, "Binding Grove")!, /face it.*inspect/);
  assert.match(objectiveHint({ starter: true }, "Elderhall")!, /north.*Briar Road/);
  assert.match(objectiveHint({ starter: true }, "Briar Road")!, /north.*Wildwood/);
  assert.equal(objectiveHint({ starter: true, trial: true }, "Elderhall"), null);
});
