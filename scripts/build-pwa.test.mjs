import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PNG } from "pngjs";
import { fileURLToPath } from "node:url";
import { injectGrokPwaHead } from "./grok-pwa-shared.mjs";
import { generateWebShell } from "./generate-web-shell.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const manifestPath = join(root, "public/manifest.webmanifest");

function pngSize(path) {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height };
}

test("public manifest uses Reliquary identity", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.name, "Reliquary");
  assert.equal(manifest.short_name, "Reliquary");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
});

test("manifest icons exist with declared dimensions", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const icon of manifest.icons) {
    const path = join(root, "public", icon.src);
    assert.ok(existsSync(path), icon.src);
    const { width, height } = pngSize(path);
    const [sw, sh] = icon.sizes.split("x").map((part) => Number(part));
    assert.equal(width, sw, icon.src);
    assert.equal(height, sh, icon.src);
  }
});

test("new species sprites are not byte-identical to donor sprites", () => {
  const pairs = [
    ["dewslime.png", "mirewhelp.png"],
    ["bogslime.png", "bogwallow.png"],
    ["gutterrat.png", "gravepup.png"],
    ["ashforged_ironnewt.png", "ironnewt.png"],
  ];
  const hash = (name) =>
    createHash("sha256").update(readFileSync(join(root, "public/game/sprites", name))).digest("hex");
  for (const [next, donor] of pairs) {
    assert.notEqual(hash(next), hash(donor), `${next} must differ from ${donor}`);
  }
});

test("Reliquary public build HTML keeps a single manifest link", () => {
  const html =
    '<html><head><link rel="manifest" href="/manifest.webmanifest"></head><body></body></html>';
  const out = injectGrokPwaHead(html, { reliquaryPublic: true });
  assert.equal(out, html);
  assert.equal(out.split('rel="manifest"').length - 1, 1);
  assert.doesNotMatch(out, /grok-app-builder\/extensions\.js/);
});

test("generateWebShell writes index.html referencing bundles", () => {
  const staticDir = join(root, ".vercel/output/static");
  if (!existsSync(join(staticDir, "assets"))) {
    assert.ok(true, "skipped without build output");
    return;
  }
  const path = generateWebShell(staticDir);
  const html = readFileSync(path, "utf8");
  assert.match(html, /index-.*\.js/);
  assert.match(html, /manifest\.webmanifest/);
});
