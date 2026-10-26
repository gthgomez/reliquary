import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast } from "./content.ts";
import { moveToLead } from "./systems/party.ts";

test("lead selection preserves creature identity and party order", () => {
  const party = [makeBeast("emberkit", 5), makeBeast("mirewhelp", 5), makeBeast("briarling", 5)];
  const reordered = moveToLead(party, party[2]!.uid)!;
  assert.deepEqual(reordered, [party[2], party[0], party[1]]);
  assert.equal(reordered[0], party[2]);
  assert.equal(party[0]!.speciesId, "emberkit");
  assert.equal(moveToLead(party, "missing"), null);
  party[1]!.hp = 0;
  assert.equal(moveToLead(party, party[1]!.uid), null);
});
