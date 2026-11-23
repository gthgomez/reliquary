import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { elderhallBase } from "../maps/registry.ts";
import { makeElderhallCandidate } from "../maps/elderhall-candidate.ts";
import { house } from "../maps/helpers.ts";
import { objectInteractTile, pickInteractObject, selectInteractionTarget } from "./interaction.ts";
import { visibleObjects } from "./object-state.ts";

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

test("the shared target selector preserves NPC priority, object visibility, and facing rules", () => {
  const door = MAPS.elderhall.objects.find((object) => object.id === "h_inn")!;
  const npc = MAPS.elderhall.npcs.find((candidate) => candidate.id === "maren")!;
  const targetTile = { x: npc.x, y: npc.y };
  const sharedTile = { ...door, x: targetTile.x, y: targetTile.y, w: 1, h: 1, interactZone: undefined };
  const selected = selectInteractionTarget([npc], [sharedTile], targetTile.x, targetTile.y, 0);
  assert.equal(selected?.kind, "npc", "NPCs keep confirm priority when they share a tile");

  const directional = { ...sharedTile, interactDirections: [2] as [2] };
  assert.equal(selectInteractionTarget([], [directional], targetTile.x, targetTile.y, 1), undefined,
    "a target approached from a blocked side is not advertised");
  assert.equal(selectInteractionTarget([], [directional], targetTile.x, targetTile.y, 2)?.kind, "object",
    "the allowed side selects the same object confirm will use");

  const chest = MAPS.briar_road.objects.find((object) => object.id === "chest_briar")!;
  const chestTile = { x: chest.x, y: chest.y + chest.h - 1 };
  const shownChest = selectInteractionTarget([], visibleObjects([chest], {}), chestTile.x, chestTile.y, 0);
  assert.equal(shownChest?.kind, "object", "an unopened chest is actionable");
  assert.equal(selectInteractionTarget([], visibleObjects([chest], { chest_briar: true }), chestTile.x, chestTile.y, 0), undefined,
    "a completed chest disappears from guidance with confirm visibility");
  const decoration = { ...sharedTile, interact: undefined };
  assert.equal(selectInteractionTarget([], [decoration], targetTile.x, targetTile.y, 0), undefined,
    "a decorative object does not produce an action hint");
});

test("revision-specific house door zones select only the painted tile", () => {
  const legacyHome = elderhallBase.objects.find((object) => object.id === "h_home")!;
  const legacyZone = legacyHome.interactZone!;
  const legacyX = legacyHome.x + legacyZone.x;
  const legacyY = legacyHome.y + legacyZone.y;
  assert.equal(selectInteractionTarget([], [legacyHome], legacyX, legacyY, 0)?.kind, "object",
    "revision 2 keeps its existing approach");

  const candidateHome = makeElderhallCandidate(elderhallBase).objects.find((object) => object.id === "h_home")!;
  const candidateZone = candidateHome.interactZone!;
  const candidateX = candidateHome.x + candidateZone.x;
  const candidateY = candidateHome.y + candidateZone.y;
  assert.equal(selectInteractionTarget([], [candidateHome], candidateX, candidateY, 3)?.kind, "object",
    "revision 5 accepts its north-facing approach");
  assert.equal(selectInteractionTarget([], [candidateHome], candidateX, candidateY, 0), undefined,
    "revision 5 rejects the south-facing approach");
  assert.equal(selectInteractionTarget([], [candidateHome], candidateX + candidateZone.w, candidateY, 3), undefined,
    "both approaches reject the adjacent wall tile");
});
