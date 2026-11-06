import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  // Work in a temp copy: writing the real .vercel output would strip the
  // vite-injected tags (description meta, module preload) from the built shell.
  const scratch = mkdtempSync(join(tmpdir(), "web-shell-test-"));
  cpSync(staticDir, scratch, { recursive: true });
  try {
    const path = generateWebShell(scratch);
    const html = readFileSync(path, "utf8");
    assert.match(html, /index-.*\.js/);
    assert.match(html, /manifest\.webmanifest/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

for (const prefix of ["assets/", "/assets/"]) {
  test(`precache invariant rejects stale chunks with ${prefix} URLs (S20)`, async () => {
    const { assertNoStaleClientChunks } = await import("./build-pwa.mjs");
    const scratch = mkdtempSync(join(tmpdir(), "pwa-stale-"));
    try {
      const current = `${prefix}index-current.js`;
      const stale = `${prefix}index-STALE-test.js`;
      writeFileSync(
        join(scratch, "index.html"),
        `<html><head></head><body><script src="${current}"></script></body></html>`,
      );
      writeFileSync(
        join(scratch, "sw.js"),
        `precacheAndRoute([{"url":"${current}","revision":"abc"},{"url":"${stale}","revision":"def"}]);`,
      );
      assert.throws(
        () => assertNoStaleClientChunks(scratch),
        /stale chunk in precache: \/?assets\/index-STALE-test\.js/,
        "an unreferenced test bundle in the precache must fail the build",
      );
      writeFileSync(join(scratch, "sw.js"), `precacheAndRoute([{"url":"${current}","revision":"abc"}]);`);
      assert.deepEqual(assertNoStaleClientChunks(scratch), [current]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
}

test("precache invariant cannot silently accept a manifest with no client chunks", async () => {
  const { assertNoStaleClientChunks } = await import("./build-pwa.mjs");
  const scratch = mkdtempSync(join(tmpdir(), "pwa-empty-"));
  try {
    writeFileSync(join(scratch, "index.html"), '<script src="/assets/index-current.js"></script>');
    writeFileSync(join(scratch, "sw.js"), "precacheAndRoute([]);");
    assert.throws(() => assertNoStaleClientChunks(scratch), /no client chunks/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("real Workbox output rejects a stale bundle and accepts the cleaned build", async () => {
  const { buildPwa, assertNoStaleClientChunks } = await import("./build-pwa.mjs");
  const scratch = mkdtempSync(join(tmpdir(), "pwa-workbox-stale-"));
  try {
    mkdirSync(join(scratch, "assets"));
    cpSync(manifestPath, join(scratch, "manifest.webmanifest"));
    writeFileSync(join(scratch, "index.html"), '<script src="/assets/index-current.js"></script>');
    writeFileSync(join(scratch, "assets/index-current.js"), 'console.log("current");');
    writeFileSync(join(scratch, "assets/index-STALE-test.js"), 'console.log("stale test bundle");');
    await assert.rejects(buildPwa({ staticDir: scratch }), /stale chunk in precache/);
    rmSync(join(scratch, "assets/index-STALE-test.js"));
    await buildPwa({ staticDir: scratch });
    assert.deepEqual(assertNoStaleClientChunks(scratch), ["assets/index-current.js"]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
