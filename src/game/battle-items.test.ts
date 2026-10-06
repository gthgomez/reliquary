import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStats, makeBeast } from "./content.ts";
import { ReliquaryGame } from "./engine.ts";
import { sequenceRandom } from "./rng.ts";
import type { BattleState } from "./types.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string, level = 10) =>
  makeBeast(id, level, { temperament: "calm", ivs: IVS });

function battleGame(party: ReturnType<typeof beast>[], foes: ReturnType<typeof beast>[], inventory: Record<string, number>): ReliquaryGame {
  const g = new ReliquaryGame({ random: sequenceRandom([0, 0, 0.5, 0.5, 0.5, 0.5]) });
  g.party = party;
  g.inventory = inventory;
  g.mode = "battle";
  g.battle = {
    kind: "wild", bg: "grass", playerIndex: 0, foes, foeIndex: 0, log: [],
    phase: "command", menuIndex: 0, shake: 0, catchStone: null,
    pendingXp: 0, escaped: false, canFlee: true, pendingSwitch: false, pendingItem: null,
  } satisfies BattleState;
  return g;
}

function openBattle(g: ReliquaryGame, phaseCommandIndex: number): void {
  g.menuIndex = phaseCommandIndex;
  g.battle!.menuIndex = phaseCommandIndex;
  g.confirm();
}

test("Quiet Bell cannot be consumed in battle", () => {
  const g = battleGame([beast("emberkit")], [beast("mothwisp")], { quiet_bell: 2 });
  openBattle(g, 2); // "Item"
  assert.equal(g.battle!.phase, "items");
  const itemIndex = g.usableItems().indexOf("quiet_bell");
  assert.ok(itemIndex >= 0, "field item remains visible so the block is explained");
  g.menuIndex = itemIndex;
  g.battle!.menuIndex = itemIndex;
  g.confirm(); // choose Quiet Bell -> item-target
  g.menuIndex = 0;
  g.battle!.menuIndex = 0;
  g.confirm(); // attempt on party[0]

  assert.equal(g.inventory.quiet_bell, 2, "must not be consumed");
  assert.equal(g.quietBell, 0, "must not still the grass");
  assert.equal(g.battle!.phase, "command", "returns to command");
  assert.ok(g.battle!.log.join(" ").includes("cannot be heard"));
});

test("revive targets a fainted creature and is consumed only once valid", () => {
  const lead = beast("emberkit", 12);
  const fallen = beast("mirewhelp", 12);
  fallen.hp = 0;
  const g = battleGame([lead, fallen], [beast("mothwisp", 5)], { phoenix_ash: 1 });
  const max = currentStats(fallen).hp;

  openBattle(g, 2); // Item
  g.menuIndex = g.usableItems().indexOf("phoenix_ash");
  g.battle!.menuIndex = g.menuIndex;
  g.confirm(); // -> item-target
  assert.equal(g.battle!.phase, "item-target");

  // Invalid: target the living lead.
  const foe = g.battle!.foes[g.battle!.foeIndex]!;
  const active = g.party[g.battle!.playerIndex]!;
  const foeHpBefore = foe.hp;
  const activeHpBefore = active.hp;
  g.menuIndex = 0;
  g.battle!.menuIndex = 0;
  g.confirm();
  assert.equal(g.inventory.phoenix_ash, 1, "invalid target must not consume the item");
  assert.equal(g.battle!.phase, "item-target", "stays for another choice");
  assert.equal(foe.hp, foeHpBefore, "the foe takes no action on an invalid target");
  assert.equal(active.hp, activeHpBefore, "no counterattack runs on an invalid target");

  // Valid: target the fainted creature.
  g.menuIndex = 1;
  g.battle!.menuIndex = 1;
  g.confirm();
  assert.equal(fallen.hp, Math.floor(max / 2));
  assert.equal(g.inventory.phoenix_ash, 0);
});

test("healing a fainted creature does not consume the item", () => {
  const lead = beast("emberkit", 12);
  const fallen = beast("mirewhelp", 12);
  fallen.hp = 0;
  const g = battleGame([lead, fallen], [beast("mothwisp", 5)], { tonic: 3 });

  openBattle(g, 2);
  g.menuIndex = g.usableItems().indexOf("tonic");
  g.battle!.menuIndex = g.menuIndex;
  g.confirm();
  const foe = g.battle!.foes[g.battle!.foeIndex]!;
  const active = g.party[g.battle!.playerIndex]!;
  const foeHpBefore = foe.hp;
  const activeHpBefore = active.hp;
  g.menuIndex = 1; // fainted target
  g.battle!.menuIndex = 1;
  g.confirm();

  assert.equal(g.inventory.tonic, 3);
  assert.equal(g.battle!.phase, "item-target");
  assert.equal(foe.hp, foeHpBefore, "the foe takes no action on an invalid target");
  assert.equal(active.hp, activeHpBefore, "no counterattack runs on an invalid target");
});

test("cancelling item-target returns to the command menu", () => {
  const g = battleGame([beast("emberkit")], [beast("mothwisp")], { tonic: 1 });
  openBattle(g, 2);
  g.menuIndex = 0;
  g.battle!.menuIndex = 0;
  g.confirm(); // -> item-target
  g.cancel();
  assert.equal(g.battle!.phase, "command");
  assert.equal(g.battle!.pendingItem, null);
  assert.equal(g.inventory.tonic, 1);
});

test("a valid item use that faints the active creature still prompts a replacement", () => {
  const active = beast("emberkit", 1);
  active.hp = 1;
  const backup = beast("mirewhelp", 12);
  const foe = beast("mothwisp", 200);
  foe.skills = ["cinder"];
  foe.mp = 100;
  const g = battleGame([active, backup], [foe], { tonic: 1 });

  openBattle(g, 2); // Item
  g.menuIndex = g.usableItems().indexOf("tonic");
  g.battle!.menuIndex = g.menuIndex;
  g.confirm(); // -> item-target
  assert.equal(g.battle!.phase, "item-target");

  g.menuIndex = 0; // living active
  g.battle!.menuIndex = 0;
  g.confirm(); // valid use consumes the item, then the foe KOs the active

  assert.equal(g.inventory.tonic, 0, "valid use consumes the item");
  assert.equal(active.hp, 0, "the foe's counterattack faints the active creature");
  assert.equal(g.battle!.phase, "party", "must wait for the player to choose a replacement");
  assert.equal(g.battle!.pendingSwitch, true, "must not silently substitute a creature");
});
