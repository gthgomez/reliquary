import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast, SPECIES } from "../content.ts";
import { createTrialBattle, createWildBattle, activeBeast, activeFoe } from "./state.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string) => makeBeast(id, 5, { temperament: "calm", ivs: IVS });

test("wild battle starts in command with an opening log", () => {
  const foe = beast("mirewhelp");
  const b = createWildBattle(foe, "marsh", 0);
  assert.equal(b.kind, "wild");
  assert.equal(b.phase, "command");
  assert.equal(b.canFlee, true);
  assert.equal(b.pendingItem, null);
  assert.equal(b.pendingSwitch, false);
  assert.equal(b.foes[0], foe);
  assert.match(b.log[0]!, new RegExp(SPECIES.mirewhelp.name));
});

test("trial battle has the trainer, ordered foes, and no flee", () => {
  const b = createTrialBattle([beast("ironnewt"), beast("chapelite")], 0, "Warden Cael");
  assert.equal(b.kind, "trial");
  assert.equal(b.canFlee, false);
  assert.equal(b.trainerName, "Warden Cael");
  assert.equal(b.foes.length, 2);
});

test("active accessors track indices", () => {
  const party = [beast("emberkit"), beast("pebblet")];
  const b = createTrialBattle([beast("ironnewt"), beast("chapelite")], 1, "Cael");
  assert.equal(activeBeast(b, party), party[1]);
  b.foeIndex = 1;
  assert.equal(activeFoe(b).speciesId, "chapelite");
});
