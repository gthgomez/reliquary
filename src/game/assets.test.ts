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

test("Elderhall candidate sprites and distinct atlases are registered only for a candidate build", () => {
  const normal = collectGameAssets({ elderhallCandidate: false });
  const candidate = collectGameAssets({ elderhallCandidate: true });
  const expected = ["grass-atlas", "dirt-atlas", "stone-atlas", "well-reference", "cottage-reference", "guild-reference", "shop-reference", "tree-reference", "gate-reference", "bench", "flowers"];
  for (const id of expected) {
    const url = `/game/elderhall/assets/elderhall.${id}.png`;
    assert.equal(normal.some((asset) => asset.url === url), false, `${id} excluded from normal builds`);
    assert.equal(candidate.some((asset) => asset.url === url), true, `${id} registered for candidate preview`);
  }
});
