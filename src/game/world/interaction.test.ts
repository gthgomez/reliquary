import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { house } from "../maps/helpers.ts";
import { objectInteractTile, pickInteractObject } from "./interaction.ts";

test("house interact zone accepts the doorway tile only", () => {
  const inn = MAPS.elderhall.objects.find((o) => o.id === "h_inn");
  assert.ok(inn);
  assert.ok(objectInteractTile(inn!, 17, 4), "south-facing door tile");
  assert.equal(objectInteractTile(inn!, 16, 3), false, "side wall must not accept interact");
  assert.equal(objectInteractTile(inn!, 18, 2), false, "corner roof tile must not accept interact");
});

test("pickInteractObject ignores non-door tiles on multi-tile buildings", () => {
  const guild = house("tmp", "cottage", 4, 6, "enter_guild");
  assert.equal(pickInteractObject([guild], 4, 6)?.interact, undefined, "upper-left wall");
  assert.equal(pickInteractObject([guild], 5, 8)?.interact, "enter_guild");
});
