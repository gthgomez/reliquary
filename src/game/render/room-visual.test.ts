import assert from "node:assert/strict";
import test from "node:test";
import { isInteriorRoom, paintInteriorRoom } from "./room-visual.ts";

test("all service rooms share the authored interior contract", () => {
  for (const id of ["home", "inn_in", "shop_in", "guild_in", "keep_inn", "keep_shop"]) assert.equal(isInteriorRoom(id), true);
  assert.equal(isInteriorRoom("elderhall"), false);
});

test("interior pass paints a threshold on the supplied door without changing dimensions", () => {
  const calls: string[] = [];
  const ctx = {
    fillStyle: "",
    fillRect: (...args: number[]) => calls.push(`fill:${args.join(",")}`),
  } as unknown as CanvasRenderingContext2D;
  paintInteriorRoom(ctx, "inn_in", 13, 10, 6, 16);
  assert.ok(calls.includes("fill:96,144,16,14"), "door threshold is painted at x=6 on the south edge");
});
