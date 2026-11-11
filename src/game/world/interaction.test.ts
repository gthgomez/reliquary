import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { house } from "../maps/helpers.ts";
import { objectInteractTile, pickInteractObject } from "./interaction.ts";

test("house interact zone accepts the doorway tile only", () => {
  const inn = MAPS.elderhall.objects.find((o) => o.id === "h_inn");
  assert.ok(inn);
  assert.ok(objectInteractTile(inn!, 16, 4), "painted south door tile");
  assert.equal(objectInteractTile(inn!, 17, 4), false, "center of the front is wall, not the door");
  assert.equal(objectInteractTile(inn!, 16, 3), false, "side wall must not accept interact");
  assert.equal(objectInteractTile(inn!, 18, 2), false, "corner roof tile must not accept interact");
});

test("pickInteractObject ignores non-door tiles on multi-tile buildings", () => {
  const guild = house("tmp", "cottage", 4, 6, "enter_guild");
  assert.equal(pickInteractObject([guild], 4, 6)?.interact, undefined, "upper-left wall");
  assert.equal(pickInteractObject([guild], 5, 8)?.interact, undefined, "center front is not the painted door");
  assert.equal(pickInteractObject([guild], 4, 8)?.interact, "enter_guild");
});
