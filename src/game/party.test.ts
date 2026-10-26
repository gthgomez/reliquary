import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast } from "./content.ts";
import { moveToLead, renameCreature, transferBeast } from "./systems/party.ts";

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

test("names are trimmed, bounded and keep the creature's identity and stats", () => {
  const original = makeBeast("emberkit", 5);
  const renamed = renameCreature(original, "  Cinder  ")!;
  assert.deepEqual(renamed, { ...original, nickname: "Cinder" });
  assert.equal(renameCreature(original, "  "), null);
  assert.equal(renameCreature(original, "x".repeat(41)), null);
  assert.equal(renameCreature(original, original.nickname), null);
});

test("storage transfers preserve identities and a capable party", () => {
  const party = [makeBeast("emberkit", 5), makeBeast("mirewhelp", 5)];
  const original = party[0]!;
  const deposited = transferBeast(party, [], original.uid, "box")!;
  assert.deepEqual(deposited.party, [party[1]]);
  assert.equal(deposited.box[0], original);
  assert.equal(transferBeast(deposited.party, deposited.box, party[1]!.uid, "box"), null);
  assert.deepEqual(transferBeast(deposited.party, deposited.box, original.uid, "party")!.party, [
    party[1],
    original,
  ]);
  party[1]!.hp = 0;
  assert.equal(transferBeast(party, [], original.uid, "box"), null);
  assert.equal(
    transferBeast([original, original, original, original], [party[1]!], party[1]!.uid, "party"),
    null,
  );
});
