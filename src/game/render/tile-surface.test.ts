import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseTileAccent, tileAtlasQuadrant } from "./tile-surface.ts";

test("tileAtlasQuadrant is stable per tile coordinate", () => {
  const a = tileAtlasQuadrant(2, 4, 7);
  const b = tileAtlasQuadrant(2, 4, 7);
  assert.equal(a, b);
  assert.ok(a >= 0 && a <= 3);
});

test("chooseTileAccent prefers blades in tall grass", () => {
  assert.equal(chooseTileAccent("wildwood", 2, 2, ","), "blade");
});

test("chooseTileAccent never returns on blocking tiles", () => {
  assert.equal(chooseTileAccent("wildwood", 1, 1, "#"), null);
  assert.equal(chooseTileAccent("wildwood", 1, 1, "w"), null);
});
