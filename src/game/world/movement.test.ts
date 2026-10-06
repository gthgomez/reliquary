import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS, BLOCKED } from "../maps.ts";
import { DIRS, facingOffset, isOccupied } from "./movement.ts";

test("facing offsets match the four directions", () => {
	assert.deepEqual(facingOffset(0), { x: 0, y: 1 });
	assert.deepEqual(facingOffset(1), { x: -1, y: 0 });
	assert.deepEqual(facingOffset(2), { x: 1, y: 0 });
	assert.deepEqual(facingOffset(3), { x: 0, y: -1 });
	assert.equal(DIRS[0].name, "down");
});

test("blocked ground and solids are occupied, open ground is not", () => {
	const map = MAPS.elderhall!;
	const [blockedTile] = [...BLOCKED];
	assert.equal(isOccupied(map, {}, map.spawn.x, map.spawn.y), false);
	// Find a wall tile in the map and assert it is occupied.
	let wall: { x: number; y: number } | null = null;
	for (let y = 0; y < map.ground.length && !wall; y++) {
		for (let x = 0; x < map.ground[y]!.length; x++) {
			if (BLOCKED.has(map.ground[y]![x]!)) { wall = { x, y }; break; }
		}
	}
	if (wall) assert.equal(isOccupied(map, {}, wall.x, wall.y), true);
	assert.ok(blockedTile);
});
