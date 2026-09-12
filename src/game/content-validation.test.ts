import assert from "node:assert/strict";
import { test } from "node:test";
import { assertContentValid } from "./content-validation.ts";

test("Hollowmere content references are internally consistent", () => {
  assert.doesNotThrow(assertContentValid);
});
