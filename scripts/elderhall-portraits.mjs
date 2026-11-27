import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import pngjs from "pngjs";
import { ELDERHALL_PORTRAIT_URLS } from "../src/game/portraits.ts";

const filenames = ELDERHALL_PORTRAIT_URLS.map((url) => basename(url)).sort();
const sourceName = "scripts/draw-elderhall-portraits.py";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function validateElderhallPortraits(dir, sourceRoot) {
  const bytes = readFileSync(join(dir, "manifest.json"));
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.source, sourceName, "Unexpected Elderhall portrait source");
  assert.match(manifest.sourceSha256, /^[a-f0-9]{64}$/);
  if (sourceRoot) {
    const source = readFileSync(join(sourceRoot, sourceName), "utf8").replace(/\r\n/g, "\n");
    assert.equal(digest(source), manifest.sourceSha256, "Elderhall portrait drawing source hash mismatch");
  }
  for (const field of ["method", "rightsBasis"]) {
    assert.ok(typeof manifest[field] === "string" && manifest[field].trim(), `Missing portrait ${field}`);
  }
  assert.deepEqual(manifest.assets.map(({ file }) => file).sort(), filenames, "Elderhall portrait inventory mismatch");
  assert.deepEqual(readdirSync(dir).sort(), [...filenames, "manifest.json"].sort(), "Unexpected Elderhall portrait files");
  for (const asset of manifest.assets) {
    assert.equal(asset.file, `${asset.id}.png`, "Elderhall portrait identity mismatch");
    const path = join(dir, asset.file);
    assert.ok(lstatSync(path).isFile(), `Invalid portrait path: ${asset.file}`);
    const data = readFileSync(path);
    assert.equal(digest(data), asset.sha256, `Portrait hash mismatch: ${asset.file}`);
    const image = pngjs.PNG.sync.read(data, { checkCRC: true });
    assert.deepEqual([image.width, image.height], [240, 312], `Unexpected native portrait size: ${asset.file}`);
    assert.deepEqual([image.width, image.height], asset.dimensions, `Portrait dimensions mismatch: ${asset.file}`);
    const bounds = [image.width, image.height, 0, 0];
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const alpha = image.data[(y * image.width + x) * 4 + 3];
        if (!alpha) continue;
        assert.equal(alpha, 255, `Non-pixel alpha: ${asset.file}`);
        bounds[0] = Math.min(bounds[0], x);
        bounds[1] = Math.min(bounds[1], y);
        bounds[2] = Math.max(bounds[2], x + 1);
        bounds[3] = Math.max(bounds[3], y + 1);
      }
    }
    assert.deepEqual(bounds, asset.alphaBounds, `Portrait silhouette bounds mismatch: ${asset.file}`);
    assert.ok(bounds[1] > 0 && bounds[3] === image.height, `Portrait is empty, clipped or floating: ${asset.file}`);
  }
  return { manifest, sha256: digest(bytes) };
}

export function copyElderhallPortraits(source, output, sourceRoot) {
  validateElderhallPortraits(source, sourceRoot);
  mkdirSync(output, { recursive: true });
  for (const file of ["manifest.json", ...filenames]) copyFileSync(join(source, file), join(output, file));
}
