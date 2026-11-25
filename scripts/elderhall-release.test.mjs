import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { elderhallArtifactDigest, selectElderhallWorld } from "./elderhall-release.mjs";

const legacy = { revision: 2 };
const approved = {
  revision: 5,
  approval: {
    evidence: "Delegated artwork and provenance acceptance record",
    candidateCommit: "a".repeat(40),
    manifestSha256: "a".repeat(64),
    worldSha256: "b".repeat(64),
    portraitsSha256: "c".repeat(64),
    artifactSha256: "d".repeat(64),
  },
};

test("production selects the reviewed release record independently of preview flags", () => {
  const env = { VERCEL_ENV: "production", RELIQUARY_ELDERHALL_CANDIDATE: "1" };
  assert.equal(selectElderhallWorld(legacy, env), 2);
  assert.equal(selectElderhallWorld(approved, env), 5);
});

test("an unapproved revision 5 production selection fails closed", () => {
  assert.throws(() => selectElderhallWorld({ revision: 5 }, { VERCEL_ENV: "production" }), /approval/);
  for (const key of ["candidateCommit", "portraitsSha256", "artifactSha256"]) {
    const approval = { ...approved.approval, [key]: undefined };
    assert.throws(() => selectElderhallWorld({ revision: 5, approval }, {}), /approval/, key);
  }
  const coerced = { ...approved.approval, artifactSha256: [approved.approval.artifactSha256] };
  assert.throws(() => selectElderhallWorld({ revision: 5, approval: coerced }, {}), /approval/);
});

test("revision 5 can be qualified outside production", () => {
  assert.equal(selectElderhallWorld(legacy, { VERCEL_ENV: "preview" }), 5);
  assert.equal(selectElderhallWorld(legacy, { RELIQUARY_ELDERHALL_CANDIDATE: "1" }), 5);
  assert.equal(selectElderhallWorld(legacy, {}), 2);
});

test("the accepted digest binds served bytes and ignores qualification source maps", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "reliquary-release-digest-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, "index.html"), "game shell");
  writeFileSync(join(directory, "sw.js"), "offline worker");
  const original = elderhallArtifactDigest(directory);
  writeFileSync(join(directory, "client.js.map"), "source metadata");
  assert.equal(elderhallArtifactDigest(directory), original);
  writeFileSync(join(directory, "sw.js"), "different offline worker");
  assert.notEqual(elderhallArtifactDigest(directory), original);
});
