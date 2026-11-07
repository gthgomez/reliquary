import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { scripts } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function buildWithNoBrowser(browserTestFlag) {
  const browserDir = mkdtempSync(join(tmpdir(), "reliquary-no-browser-"));
  const staticDir = join(root, ".vercel/output/static");
  // These cases build both safe and intentionally unsafe artifacts. Do not let
  // their assets leak into the production artifact checked later in this file/CI.
  rmSync(staticDir, { recursive: true, force: true });
  try {
    return spawnSync(scripts["build:web"], {
      shell: true,
      cwd: root,
      encoding: "utf8",
      timeout: 180_000,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: browserDir,
        VITE_RELIQUARY_BROWSER_TEST: browserTestFlag,
      },
    });
  } finally {
    rmSync(browserDir, { recursive: true, force: true });
    rmSync(staticDir, { recursive: true, force: true });
  }
}

test("production web artifact builds when no Playwright browser is installed", () => {
  const result = buildWithNoBrowser("");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("deploy build still rejects a browser-test bundle", () => {
  const result = buildWithNoBrowser("1");
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /production bundle must not contain getEconomy/);
});

function bundlePath() {
  const html = readFileSync(join(root, ".vercel/output/static/index.html"), "utf8");
  const m = html.match(/\/assets\/(index-[^"']+\.js)/);
  assert.ok(m, "index.html missing bundle reference");
  return join(root, ".vercel/output/static/assets", m[1]);
}

function bundleText() {
  return readFileSync(bundlePath(), "utf8");
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
  const runtime = spawnSync(process.execPath, [join(root, "scripts/assert-production-runtime.mjs")], {
    cwd: root,
    stdio: "inherit",
    timeout: 120_000,
  });
  assert.equal(runtime.status, 0);
  const text = bundleText();
  for (const needle of PROD_FORBIDDEN) {
    assert.equal(text.includes(needle), false, `production bundle contains ${needle}`);
  }
});

test("production rebuild discards the previous browser-test bundle and cache entry", () => {
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
  const browserTestBundle = bundlePath();

  const production = spawnSync(process.execPath, [join(root, "scripts/build-web.mjs")], {
    cwd: root,
    stdio: "inherit",
    timeout: 180_000,
    env: { ...process.env, VITE_RELIQUARY_BROWSER_TEST: "" },
  });
  assert.equal(production.status, 0);
  assert.equal(existsSync(browserTestBundle), false, "previous browser-test bundle remains public");
  const serviceWorker = readFileSync(join(root, ".vercel/output/static/sw.js"), "utf8");
  assert.equal(serviceWorker.includes(basename(browserTestBundle)), false, "previous browser-test bundle remains precached");
});
