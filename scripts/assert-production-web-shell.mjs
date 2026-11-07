#!/usr/bin/env node
/**
 * Ensure production web bundles do not ship browser-regression economy, battle UI,
 * render QA reports, or browser-test build markers.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoAgesPreviewAssets } from "./ages-production-assets.mjs";

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

assertNoAgesPreviewAssets(staticDir);
const bundle = clientBundlePath();
assert.ok(bundle, `[assert:web-shell] missing client bundle under ${staticDir}`);

const source = readFileSync(bundle, "utf8");
/** Union of HUD (19f75c2) and renderer (130ea1d) forbidden needles — do not weaken. */
const forbidden = [
  "ages-candidate-preview",
  "getEconomy",
  "setGold",
  "openShop",
  "seedForcedSwitch",
  "setBattlePhase",
  "primeSkillMenu",
  'VITE_RELIQUARY_BROWSER_TEST":"1"',
];
for (const needle of forbidden) {
  assert.equal(
    source.includes(needle),
    false,
    `[assert:web-shell] production bundle must not contain ${needle}`,
  );
}

console.log(`[assert:web-shell] ok ${bundle}`);
