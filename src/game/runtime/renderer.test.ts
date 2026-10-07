import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { collectPaths } from "./renderer.ts";

test("every preloaded asset path exists under public/", () => {
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../../../public");
  const paths = collectPaths();
  assert.equal(paths.length, 78);
  for (const [, src] of paths) {
    const clean = src.split("?")[0]!;
    assert.ok(existsSync(join(publicDir, clean)), `missing ${clean}`);
  }
});
