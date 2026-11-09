import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../src/game/maps.ts";
import { elderhallCandidateBench, elderhallCandidateGate } from "../src/game/render/elderhall-visual.ts";
import { isOccupied } from "../src/game/world/movement.ts";
import { pathFor } from "./natural-journey-path.mjs";

test("candidate journey can reach the northern warp with its real objects", () => {
  const map = { ...MAPS.elderhall, objects: [...MAPS.elderhall.objects, elderhallCandidateGate(), elderhallCandidateBench()] };
  const steps = pathFor(map, { x: 1, y: 10 }, { x: 10, y: 0 }, true);
  assert.deepEqual({ x: steps.at(-1).x, y: steps.at(-1).y, warp: steps.at(-1).warp }, { x: 10, y: 0, warp: true });
  for (const step of steps) if (!step.warp) assert.equal(isOccupied(map, { starter: true }, step.x, step.y), false);
});

test("the planner uses the gap between split gate posts", () => {
  const gate = { ...elderhallCandidateGate(), x: 0, y: 0 };
  const map = { id: "gate-fixture", ground: ["#p##", "#p##", "#p##", "....", "...."],
    objects: [gate], npcs: [], warps: [{ x: 1, y: 0, to: "next", tx: 0, ty: 0 }] };
  const steps = pathFor(map, { x: 1, y: 4 }, { x: 1, y: 0 }, true);
  assert.ok(steps.some(({ x, y }) => x === 1 && y === 3), "the only route passes through the opening");
  assert.equal(isOccupied(map, {}, 0, 3), true, "the post remains solid");
});

test("journey planner does not route through unrelated warps", () => {
  const map = MAPS.elderhall;
  const steps = pathFor(map, { x: 5, y: 15 }, { x: 0, y: 10 }, false);
  assert.equal(steps.filter((step) => step.warp).length, 1);
  assert.equal(steps.at(-1).warp, true);
});
