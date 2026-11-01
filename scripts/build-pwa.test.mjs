import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const manifestPath = join(root, "public/manifest.webmanifest");

test("public manifest uses Reliquary identity", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.name, "Reliquary");
  assert.equal(manifest.short_name, "Reliquary");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
});

test("manifest icons exist", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const icon of manifest.icons) {
    assert.ok(existsSync(join(root, "public", icon.src)), icon.src);
  }
});
