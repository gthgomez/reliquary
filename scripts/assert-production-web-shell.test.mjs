import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function bundleText() {
  const html = readFileSync(join(root, ".vercel/output/static/index.html"), "utf8");
  const m = html.match(/\/assets\/(index-[^"']+\.js)/);
  assert.ok(m, "index.html missing bundle reference");
  return readFileSync(join(root, ".vercel/output/static/assets", m[1]), "utf8");
}

const PROD_FORBIDDEN = [
  "getEconomy",
  "setGold",
  "openShop",
  "seedForcedSwitch",
  "setBattlePhase",
  "primeSkillMenu",
  'VITE_RELIQUARY_BROWSER_TEST":"1"',
];

test("production build:web excludes all browser-test probe identifiers", () => {
  const build = spawnSync(process.execPath, [join(root, "scripts/build-web.mjs")], {
    cwd: root,
    stdio: "inherit",
    timeout: 180_000,
    env: { ...process.env, VITE_RELIQUARY_BROWSER_TEST: "" },
  });
  assert.equal(build.status, 0);
  const assertRun = spawnSync(process.execPath, [join(root, "scripts/assert-production-web-shell.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  assert.equal(assertRun.status, 0);
  const text = bundleText();
  for (const needle of PROD_FORBIDDEN) {
    assert.equal(text.includes(needle), false, `production bundle contains ${needle}`);
  }
});

test("browser-test build includes economy and battle UI probes for regression", () => {
  const build = spawnSync(process.execPath, [join(root, "scripts/build-web-test.mjs")], {
    cwd: root,
    stdio: "inherit",
    timeout: 180_000,
  });
  assert.equal(build.status, 0);
  const text = bundleText();
  assert.equal(text.includes("getEconomy"), true);
  assert.equal(text.includes("setGold"), true);
  assert.equal(text.includes("seedForcedSwitch"), true);
  assert.equal(text.includes("primeSkillMenu"), true);
});
