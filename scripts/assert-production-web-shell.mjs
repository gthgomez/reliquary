#!/usr/bin/env node
/**
 * Ensure production web bundles do not ship browser-regression economy cheats.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = process.argv[2] ?? join(root, ".vercel/output/static");

function clientBundlePath() {
  const indexHtml = join(staticDir, "index.html");
  if (!existsSync(indexHtml)) return null;
  const html = readFileSync(indexHtml, "utf8");
  const m = html.match(/\/assets\/(index-[^"']+\.js)/);
  if (!m) return null;
  const bundle = join(staticDir, "assets", m[1]);
  return existsSync(bundle) ? bundle : null;
}

const bundle = clientBundlePath();
assert.ok(bundle, `[assert:web-shell] missing client bundle under ${staticDir}`);

const source = readFileSync(bundle, "utf8");
const forbidden = ["getEconomy", "setGold", "openShop"];
for (const needle of forbidden) {
  assert.equal(
    source.includes(needle),
    false,
    `[assert:web-shell] production bundle must not contain ${needle}`,
  );
}

console.log(`[assert:web-shell] ok ${bundle}`);
