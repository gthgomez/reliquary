import assert from "node:assert/strict";
import { test } from "node:test";
import { currentObjective, marenLandmark, objectiveHint, objectivePreview } from "./systems/objective.ts";

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
  assert.match(objectiveHint({}, "Elderhall")!, /optional guidance/i);
  assert.doesNotMatch(objectiveHint({}, "Elderhall")!, /stone path/i);
  assert.match(objectiveHint({}, "Binding Grove")!, /face it.*inspect/);
  assert.match(objectiveHint({ starter: true }, "Elderhall")!, /north.*Briar Road/);
  assert.match(objectiveHint({ starter: true }, "Briar Road")!, /north.*Wildwood/);
  assert.equal(objectiveHint({ starter: true, trial: true }, "Elderhall"), null);
});

test("the cottage directs a new player to the actual exit before the larger objective", () => {
  assert.equal(objectivePreview({}, "home"), "Leave the cottage");
  assert.match(currentObjective({})!, /Binding Grove/);
  assert.equal(objectivePreview({}, "elderhall"), "Find the Binding Grove");
  assert.equal(objectivePreview({}, "grove"), "Make a pact");
  assert.equal(objectivePreview({ starter: true }, "grove"), "Return to Elderhall");
  assert.equal(objectivePreview({ starter: true }, "briar_road"), "Continue north to Thornkeep");
  assert.equal(objectivePreview({ starter: true }, "wildwood"), "Continue north to Thornkeep");
  assert.equal(objectivePreview({ starter: true }, "thornkeep"), "Find Warden Cael");
  assert.equal(objectivePreview({ starter: true }, "home"), "Travel north to Thornkeep");
  assert.equal(objectivePreview({ starter: true, trial: true }, "elderhall"), "Rest or travel beyond the ash");
  assert.equal(objectivePreview({ starter: true, trial: true }, "grove"), "Rest or travel beyond the ash");
});

test("Maren's first meeting clue names the landmark next to her in each world", () => {
  assert.equal(marenLandmark(false), "near the Chapter House");
  assert.equal(marenLandmark(true), "beside the village well");
});
