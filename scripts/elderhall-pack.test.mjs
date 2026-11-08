import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createHash } from "node:crypto";
import pngjs from "pngjs";
import { validateElderhallPack, copyElderhallCandidate } from "./elderhall-pack.mjs";

const source = join(import.meta.dirname, "..", "assets", "elderhall-candidate");

test("the committed candidate pack passes hash and identity validation", () => {
  const manifest = validateElderhallPack(source);
  assert.equal(manifest.schema_version, "ages.environment-pack/1");
  assert.ok(manifest.assets.length >= 9);
});

test("tampering or a path escaping the pack is rejected before copying", () => {
  const dir = mkdtempSync(join(tmpdir(), "elderhall-pack-"));
  try {
    cpSync(source, dir, { recursive: true });
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const asset = manifest.assets.find((entry) => entry.id === "elderhall.well-reference");
    writeFileSync(join(dir, asset.file), "tampered");
    assert.throws(() => validateElderhallPack(dir), /hash/i);
    asset.file = "../outside.png";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => validateElderhallPack(dir), /path/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a corrupt PNG is rejected even if its manifest hash has been recomputed", () => {
  const dir = mkdtempSync(join(tmpdir(), "elderhall-corrupt-"));
  try {
    cpSync(source, dir, { recursive: true });
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const asset = manifest.assets.find((entry) => entry.id === "elderhall.well-reference");
    const fake = Buffer.alloc(24);
    Buffer.from([137,80,78,71,13,10,26,10]).copy(fake);
    fake.writeUInt32BE(asset.dimensions[0], 16);
    fake.writeUInt32BE(asset.dimensions[1], 20);
    writeFileSync(join(dir, asset.file), fake);
    asset.sha256 = createHash("sha256").update(fake).digest("hex");
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => validateElderhallPack(dir), /PNG/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("malformed anchors and atlas geometry are rejected", () => {
  const dir = mkdtempSync(join(tmpdir(), "elderhall-meta-"));
  try {
    cpSync(source, dir, { recursive: true });
    const path = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    const well = manifest.assets.find((entry) => entry.id === "elderhall.well-reference");
    const anchor = well.anchor;
    well.anchor = [0, well.dimensions[1] + 1];
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => validateElderhallPack(dir), /anchor/i);
    well.anchor = anchor;
    manifest.assets.find((entry) => entry.id === "elderhall.grass-atlas").atlas.columns = 3;
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => validateElderhallPack(dir), /atlas/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a valid image cannot masquerade as the required 2x2 terrain atlas", () => {
  const dir = mkdtempSync(join(tmpdir(), "elderhall-atlas-"));
  try {
    cpSync(source, dir, { recursive: true });
    const path = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    const atlas = manifest.assets.find((entry) => entry.id === "elderhall.grass-atlas");
    const single = readFileSync(join(dir, "assets", "elderhall.grass-0.png"));
    writeFileSync(join(dir, atlas.file), single);
    atlas.sha256 = createHash("sha256").update(single).digest("hex");
    atlas.dimensions = [32, 32]; atlas.anchor = [16, 32]; delete atlas.atlas;
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => validateElderhallPack(dir), /atlas/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("copy exposes only selected runtime PNGs and their candidate manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "elderhall-out-"));
  try {
    copyElderhallCandidate(source, dir);
    assert.ok(existsSync(join(dir, "assets", "elderhall.well-reference.png")));
    assert.ok(existsSync(join(dir, "manifest.json")));
    assert.equal(existsSync(join(dir, "assets", "elderhall.inn.png")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the selected export contains distinct guild and shop images with reference lineage", () => {
  const dir = mkdtempSync(join(tmpdir(), "elderhall-landmarks-"));
  try {
    copyElderhallCandidate(source, dir);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    const guild = manifest.assets.find((asset) => asset.id === "elderhall.guild-reference");
    const shop = manifest.assets.find((asset) => asset.id === "elderhall.shop-reference");
    for (const asset of [guild, shop]) {
      assert.ok(asset, "selected landmark appears in exported manifest");
      assert.equal(asset.provenance.source_type, "reference_conditioned");
      assert.match(asset.provenance.source_sha256, /^[0-9a-f]{64}$/);
      assert.match(asset.provenance.reference_sha256, /^[0-9a-f]{64}$/);
      assert.deepEqual(asset.logical_footprint, [3, 3], "building footprint reflects the authored logical size");
      assert.ok(existsSync(join(dir, asset.file)));
    }
    assert.notEqual(guild.sha256, shop.sha256, "the landmarks are different images");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the actual terrain atlas cells are distinct and share compatible edges", () => {
  for (const family of ["grass", "dirt", "stone"]) {
    const image = pngjs.PNG.sync.read(readFileSync(join(source, "assets", `elderhall.${family}-atlas.png`)));
    const pixels = (cx, cy) => {
      const out = [];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const i = ((cy * 32 + y) * image.width + cx * 32 + x) * 4;
        out.push(...image.data.subarray(i, i + 4));
      }
      return Buffer.from(out);
    };
    const cells = [pixels(0, 0), pixels(1, 0), pixels(0, 1), pixels(1, 1)];
    assert.equal(new Set(cells.map((cell) => createHash("sha256").update(cell).digest("hex"))).size, 4, family);
    const edge = (cell, side) => {
      const out = [];
      for (let i = 0; i < 32; i++) {
        const x = side === "left" ? 0 : side === "right" ? 31 : i;
        const y = side === "top" ? 0 : side === "bottom" ? 31 : i;
        const offset = (y * 32 + x) * 4;
        out.push(...cell.subarray(offset, offset + 4));
      }
      return Buffer.from(out);
    };
    for (const a of cells) for (const b of cells) {
      assert.deepEqual(edge(a, "right"), edge(b, "left"), `${family}: horizontal seam`);
      assert.deepEqual(edge(a, "bottom"), edge(b, "top"), `${family}: vertical seam`);
    }
  }
});
