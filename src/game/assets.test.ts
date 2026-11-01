import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { collectGameAssets } from "./assets.ts";

const root = join(import.meta.dirname, "..", "..");

test("every required asset path exists on disk", () => {
  const missing: string[] = [];
  for (const entry of collectGameAssets()) {
    if (!entry.required) continue;
    const path = join(root, "public", entry.url);
    if (!existsSync(path)) missing.push(entry.url);
  }
  assert.equal(missing.length, 0, `missing required assets: ${missing.join(", ")}`);
});

test("new release creatures register sprite paths", () => {
  for (const id of ["dewslime", "bogslime", "slime_king", "gutterrat", "gravegnaw", "blighted_gravepup", "ashforged_ironnewt"]) {
    const hit = collectGameAssets().some((a) => a.url === `/game/sprites/${id}.png`);
    assert.equal(hit, true, id);
  }
});
