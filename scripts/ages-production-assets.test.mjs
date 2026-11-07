import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertNoAgesPreviewAssets } from "./ages-production-assets.mjs";

test("production asset gate rejects an AGES package staged under public", () => {
  const dir = mkdtempSync(join(tmpdir(), "reliquary-ages-production-"));
  try {
    const game = join(dir, "game");
    mkdirSync(game);
    writeFileSync(join(game, "emberkit.png"), "canonical-art");
    assert.doesNotThrow(() => assertNoAgesPreviewAssets(dir));
    writeFileSync(join(game, "sprite.runtime.json"), "{}");
    assert.throws(() => assertNoAgesPreviewAssets(dir), /sprite\.runtime\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
