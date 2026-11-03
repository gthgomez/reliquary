import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { bakeMapTerrain, chooseTileVariant, walkableEdgeMask } from "./terrain.ts";

test("chooseTileVariant is stable and independent of Math.random", () => {
  const a = chooseTileVariant("briar_road", 4, 7, "grass", 3);
  const b = chooseTileVariant("briar_road", 4, 7, "grass", 3);
  assert.equal(a, b);
  const original = Math.random;
  Math.random = () => 0.99;
  assert.equal(chooseTileVariant("briar_road", 4, 7, "grass", 3), a);
  Math.random = original;
});

test("walkableEdgeMask detects interior grass", () => {
  const map = MAPS.briar_road;
  const mask = walkableEdgeMask(map.ground, 10, 12);
  assert.ok(mask > 0);
});

test("bakeMapTerrain invokes decoration callbacks", () => {
  const map = MAPS.elderhall;
  let deco = 0;
  let tiles = 0;
  let accents = 0;
  bakeMapTerrain({
    map,
    tileSize: 32,
    drawTile: () => {
      tiles += 1;
    },
    drawOverlay: () => {},
    drawDecoration: () => {
      deco += 1;
    },
    drawAccent: () => {
      accents += 1;
    },
  });
  assert.ok(tiles > 0);
  assert.ok(deco > 0, "decorations and tallgrass should draw");
  assert.ok(accents > 0, "ground accents should scatter on walkable tiles");
});
