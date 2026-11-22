import assert from "node:assert/strict";
import test from "node:test";
import { selectElderhallWorld } from "./elderhall-release.mjs";

const legacy = { revision: 2 };
const approved = {
  revision: 5,
  approval: { evidence: "Owner approval record", manifestSha256: "a".repeat(64), worldSha256: "b".repeat(64) },
};

test("production selects the reviewed release record independently of preview flags", () => {
  const env = { VERCEL_ENV: "production", RELIQUARY_ELDERHALL_CANDIDATE: "1" };
  assert.equal(selectElderhallWorld(legacy, env), 2);
  assert.equal(selectElderhallWorld(approved, env), 5);
});

test("an unapproved revision 5 production selection fails closed", () => {
  assert.throws(() => selectElderhallWorld({ revision: 5 }, { VERCEL_ENV: "production" }), /approval/);
});

test("revision 5 can be qualified outside production", () => {
  assert.equal(selectElderhallWorld(legacy, { VERCEL_ENV: "preview" }), 5);
  assert.equal(selectElderhallWorld(legacy, { RELIQUARY_ELDERHALL_CANDIDATE: "1" }), 5);
  assert.equal(selectElderhallWorld(legacy, {}), 2);
});
