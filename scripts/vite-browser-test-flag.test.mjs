import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { loadConfigFromFile, transformWithOxc } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function evaluateBrowserTestFlag(configFile, command, flag) {
  const previous = process.env.VITE_RELIQUARY_BROWSER_TEST;
  process.env.VITE_RELIQUARY_BROWSER_TEST = flag;
  try {
    const loaded = await loadConfigFromFile(
      { command, mode: command === "serve" ? "development" : "production" },
      join(root, configFile),
      root,
    );
    assert.ok(loaded, `could not load ${configFile}`);
    // Execute the flag access with the real config and Vite's transformer.
    // An absent define throws the same ReferenceError as GameApp's hook call,
    // instead of allowing a successful compile to conceal a broken mount.
    const transformed = await transformWithOxc(
      "globalThis.browserTestEnabled = __RELIQUARY_BROWSER_TEST__;",
      "browser-test-flag.js",
      { define: loaded.config.define ?? {} },
    );
    const runtime = {};
    runInNewContext(transformed.code, runtime);
    return runtime.browserTestEnabled;
  } finally {
    if (previous === undefined) delete process.env.VITE_RELIQUARY_BROWSER_TEST;
    else process.env.VITE_RELIQUARY_BROWSER_TEST = previous;
  }
}

for (const command of ["serve", "build"]) {
  for (const flag of ["", "1"]) {
    test(`ordinary ${command} defines a safe browser-test flag (environment ${flag || "unset"})`, async () => {
      assert.equal(await evaluateBrowserTestFlag("vite.config.ts", command, flag), false);
    });
  }
}

test("public production build keeps browser-test hooks disabled", async () => {
  assert.equal(await evaluateBrowserTestFlag("vite.public-game.config.ts", "build", ""), false);
});

test("public browser-test build explicitly enables its hooks", async () => {
  assert.equal(await evaluateBrowserTestFlag("vite.public-game.config.ts", "build", "1"), true);
});
