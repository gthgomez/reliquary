import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { validateRuntimePackage } from "./runtime-package.ts";

const version = "1.7.0";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
  "base64",
);
const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function fixture(
  options: { damage?: "bounds" | "timing" | "missing" | "schema" | "path" | "png" | "hash" } = {},
) {
  const atlas = options.damage === "png" ? Buffer.from("invalid PNG") : png;
  const manifest = JSON.stringify({
    schema_version: options.damage === "schema" ? "2.0.0" : version,
    asset_id: "emberkit",
    subject_id: "emberkit",
    direction: "southwest",
    runtime_status: "PREVIEW_ONLY",
    atlas: {
      file: options.damage === "path" ? "../atlas.png" : "atlas.png",
      width: 1,
      height: 1,
      sha256: sha(atlas),
    },
    cell_dimensions: [1, 1],
    animations: {
      idle: {
        state: "idle",
        loop: true,
        fps: 5,
        duration_ms: 200,
        review_disposition: "UNREVIEWED",
        logical_pivot: [0.5, 0.5],
        gameplay_root: [0.5, 1],
        events: [],
        frames: [
          {
            index: options.damage === "missing" ? 1 : 0,
            x: options.damage === "bounds" ? 1 : 0,
            y: 0,
            w: 1,
            h: 1,
            duration_ms: options.damage === "timing" ? 0 : 200,
            offset_x: 0,
            offset_y: 0,
          },
        ],
      },
    },
  });
  const provenance = JSON.stringify({
    schema_version: version,
    asset_id: "emberkit",
    candidate_pack_id: "fixture",
    runtime_status: "PREVIEW_ONLY",
    dispositions: { idle: "UNREVIEWED" },
    frame_counts: { idle: 1 },
  });
  const hashes = {
    "atlas.png": options.damage === "hash" ? "a".repeat(64) : sha(atlas),
    "provenance.json": sha(provenance),
    "sprite.runtime.json": sha(manifest),
  };
  const digest = sha(JSON.stringify(hashes, null, 2));
  const integrity = JSON.stringify({
    schema_version: version,
    files: hashes,
    package_digest: digest,
    total_files: 3,
  });
  return {
    digest,
    files: [
      new File([new Uint8Array(atlas)], "atlas.png"),
      new File([provenance], "provenance.json"),
      new File([manifest], "sprite.runtime.json"),
      new File([integrity], "integrity.json"),
    ],
  };
}

test("loads a pinned AGES v1.7 package and preserves exact atlas bytes", async () => {
  const { files, digest } = fixture();
  const result = await validateRuntimePackage(files, digest);
  assert.equal(result.digest, digest);
  assert.equal(result.manifest.animations.idle?.review_disposition, "UNREVIEWED");
  assert.deepEqual(Buffer.from(await result.atlas.arrayBuffer()), png);
});

for (const [damage, code] of [
  ["bounds", "INVALID_FRAME"],
  ["timing", "INVALID_SCHEMA"],
  ["missing", "INVALID_FRAME"],
  ["schema", "UNSUPPORTED_SCHEMA"],
  ["path", "INVALID_SCHEMA"],
  ["png", "INVALID_ATLAS"],
  ["hash", "HASH_MISMATCH"],
] as const) {
  test(`rejects invalid package fixture: ${damage}`, async () => {
    const { files, digest } = fixture({ damage });
    await assert.rejects(validateRuntimePackage(files, digest), { code });
  });
}

test("rejects a stale selection and files outside the four-member contract", async () => {
  const { files, digest } = fixture();
  await assert.rejects(validateRuntimePackage(files, "0".repeat(64)), { code: "STALE_PACKAGE" });
  await assert.rejects(validateRuntimePackage(files.slice(1), digest), { code: "INVALID_FILES" });
  await assert.rejects(
    validateRuntimePackage([...files, new File(["private"], "art.pxo")], digest),
    { code: "INVALID_FILES" },
  );
});
