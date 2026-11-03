import assert from "node:assert/strict";
import test from "node:test";
import { leadActionHint, practiceActionHint, practiceEnabledHint } from "./party-actions.ts";

const beast = (hp: number, level = 5) =>
  ({
    hp,
    level,
  }) as Parameters<typeof leadActionHint>[1];

test("leadActionHint explains lead slot and fallen state", () => {
  assert.match(leadActionHint(0, beast(10))!, /Party lead/);
  assert.match(leadActionHint(1, beast(0))!, /fallen/i);
  assert.equal(leadActionHint(1, beast(10)), null);
});

test("practiceActionHint covers cost and caps", () => {
  assert.match(practiceActionHint(beast(0), 100)!, /feet/i);
  assert.match(practiceActionHint(beast(10, 40), 100)!, /cap/i);
  assert.match(practiceActionHint(beast(10), 10)!, /45 cr/);
  assert.equal(practiceActionHint(beast(10), 100), null);
});

test("practiceEnabledHint states cost and outcome", () => {
  assert.match(practiceEnabledHint(), /45 cr/);
  assert.match(practiceEnabledHint(), /80 lore/);
});
