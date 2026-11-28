import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import type { MapDef } from "../types.ts";
import { SPECIES } from "../content.ts";
import { validateInteractions, NPC_DIALOGS, SPECIAL_INTERACTIONS, wardenPages, WARDEN_TRIAL_TEAM, wardenTeamLevels } from "./interactions.ts";

test("every talk and interact id in the shipped maps has a registry entry", () => {
  assert.deepEqual(validateInteractions(MAPS), []);
});

test("a typo'd npc talk id is rejected, not silently no-op", () => {
  const broken: Record<string, MapDef> = {
    elderhall: {
      ...MAPS.elderhall,
      npcs: MAPS.elderhall.npcs.map((n) => (n.id === "maren" ? { ...n, talk: "maren_typo" } : n)),
    },
  };
  const errors = validateInteractions(broken);
  assert.ok(errors.some((line) => line.includes('maren_typo" — no registry entry')), errors.join("\n"));
});

test("an interact id with no registry entry is rejected", () => {
  const elderhall = MAPS.elderhall;
  const withStray = {
    ...elderhall,
    objects: [...elderhall.objects, { id: "stray", sprite: "sign", x: 1, y: 1, w: 1, h: 1, foot: 1, solid: true, interact: "chest_ghost" }],
  } as MapDef;
  const errors = validateInteractions({ elderhall: withStray });
  assert.ok(errors.some((line) => line.includes('chest_ghost" — no registry entry')), errors.join("\n"));
});

test("registry actions and special interactions are coherent", () => {
  for (const [id, dialog] of Object.entries(NPC_DIALOGS)) {
    if (dialog.kind === "action") {
      assert.ok(["inn", "shop", "warden"].includes(dialog.action), `${id}: unknown action`);
    } else {
      // Page builders must produce text under both story states.
      const early = dialog.pages({ flags: {}, strongestLevel: 1 });
      const late = dialog.pages({ flags: { starter: true, trial: true }, strongestLevel: 20 });
      assert.ok(early.every((line) => typeof line === "string" && line.length > 0), `${id}: early pages`);
      assert.ok(late.every((line) => typeof line === "string" && line.length > 0), `${id}: late pages`);
    }
  }
  for (const [id, special] of Object.entries(SPECIAL_INTERACTIONS)) {
    if (special.kind === "starter") assert.ok(special.speciesId.length > 0, `${id}: species`);
    if (special.kind === "encounter") assert.ok(special.encounterId.length > 0 && special.gateLine.length > 0, `${id}: encounter fields`);
  }
});

test("the Warden trial team is real content and honors the advisory promise", () => {
  for (const foe of WARDEN_TRIAL_TEAM) {
    assert.ok(SPECIES[foe.speciesId], `unknown trial species ${foe.speciesId}`);
    assert.ok(foe.level >= 1 && foe.level <= 40, `${foe.speciesId}: level`);
  }
  // Below ten seasons the trio holds back a step; from ten onward, fixed full strength (no Lv11->12 cliff).
  assert.deepEqual(wardenTeamLevels(7), [9, 10, 11]);
  assert.deepEqual(wardenTeamLevels(10), [10, 11, 12]);
  assert.deepEqual(wardenTeamLevels(11), [10, 11, 12]);
  assert.deepEqual(wardenTeamLevels(12), [10, 11, 12]);
  assert.deepEqual(wardenTeamLevels(20), [10, 11, 12]);
});

test("Cael's advisory changes with party strength", () => {
  const weak = wardenPages({ flags: { starter: true }, strongestLevel: 7 }, "square");
  const ready = wardenPages({ flags: { starter: true }, strongestLevel: 14 }, "square");
  assert.ok(weak.some((line) => line.includes("Below ten, my three ease off")), weak.join(" | "));
  assert.ok(ready.every((line) => !line.includes("weathered")), ready.join(" | "));
});

test("Cael establishes the trial location from either approach", () => {
  const ctx = { flags: { starter: true }, strongestLevel: 12 };
  assert.match(wardenPages(ctx, "square").at(-1) ?? "", /inside Warden's Hall/);
  assert.match(wardenPages(ctx, "hall").at(-1) ?? "", /here in the hall/);
});
