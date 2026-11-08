import assert from "node:assert/strict";
import { test } from "node:test";
import { paintWorldPropShadow } from "./world-actors.ts";

test("well shadow meets the visible base instead of the transparent image margin", () => {
  let ellipse: number[] = [];
  const canvas = { fillStyle: "", beginPath() {}, ellipse(...args: number[]) { ellipse = args; }, fill() {} } as unknown as CanvasRenderingContext2D;
  paintWorldPropShadow(canvas, "well", 0, 0, 48, 48);
  // The shipped 48px sprite's opaque base is centered near x=20.5, y=33.
  assert.ok(Math.abs(ellipse[0]! - 20.5) < 3, `shadow center x=${ellipse[0]}`);
  assert.ok(Math.abs(ellipse[1]! - 33) < 3, `shadow base y=${ellipse[1]}`);
});

test("boulder shadow meets the sprite's visible bottom", () => {
  let ellipse: number[] = [];
  const canvas = { fillStyle: "", beginPath() {}, ellipse(...args: number[]) { ellipse = args; }, fill() {} } as unknown as CanvasRenderingContext2D;
  paintWorldPropShadow(canvas, "boulder", 0, 0, 48, 48);
  assert.ok(Math.abs(ellipse[0]! - 22) < 3);
  assert.ok(Math.abs(ellipse[1]! - 35) < 3);
});
