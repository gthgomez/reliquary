import assert from "node:assert/strict";
import { test } from "node:test";
import { firstImpactAt, frameAt } from "./battle-preview.ts";
import type { PreviewAnimation } from "./runtime-package.ts";

const clip: PreviewAnimation = {
  state: "attack",
  loop: false,
  fps: 7.41,
  duration_ms: 270,
  review_disposition: "UNREVIEWED",
  logical_pivot: [16, 29],
  gameplay_root: [16, 29],
  events: [
    { name: "impact", frame: 1 },
    { name: "impact", frame: 1 },
  ],
  frames: [120, 150].map((duration_ms, index) => ({
    index,
    x: index * 32,
    y: 0,
    w: 32,
    h: 32,
    duration_ms,
    offset_x: 0,
    offset_y: 0,
  })),
};

test("samples unequal frame durations and observes the non-looping boundary", () => {
  assert.equal(frameAt(clip, 119, false)?.index, 0);
  assert.equal(frameAt(clip, 120, false)?.index, 1);
  assert.equal(frameAt(clip, 269, false)?.index, 1);
  assert.equal(frameAt(clip, 270, false), undefined);
  assert.equal(frameAt(clip, 270, true)?.index, 0);
});

test("resolves repeated impact markers to the first frame boundary", () => {
  assert.equal(firstImpactAt(clip), 120);
});
