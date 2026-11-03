import assert from "node:assert/strict";
import test from "node:test";
import { contrastRatio, parseRgb, relativeLuminance } from "./contrast.ts";

test("parseRgb reads computed-style rgb strings", () => {
  assert.deepEqual(parseRgb("rgb(20, 17, 14)"), [20, 17, 14]);
});

test("contrastRatio matches known black on white", () => {
  const ratio = contrastRatio([0, 0, 0], [255, 255, 255]);
  assert.ok(ratio > 20.9 && ratio < 21.1);
});

test("relativeLuminance increases with lighter colors", () => {
  assert.ok(relativeLuminance(255, 255, 255) > relativeLuminance(20, 17, 14));
});
