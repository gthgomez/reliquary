import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStats, makeBeast } from "./content.ts";
import { ReliquaryGame } from "./engine.ts";
import { sequenceRandom } from "./rng.ts";
import type { BattleState } from "./types.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string, level = 10) =>
  makeBeast(id, level, { temperament: "calm", ivs: IVS });

function battleGame(
  party: ReturnType<typeof beast>[],
  foes: ReturnType<typeof beast>[],
  random = sequenceRandom([0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
): ReliquaryGame {
  const g = new ReliquaryGame({ random });
  g.party = party;
  g.mode = "battle";
  g.battle = {
    kind: "wild", bg: "grass", playerIndex: 0, foes, foeIndex: 0, log: [],
    phase: "command", menuIndex: 0, shake: 0, catchStone: null,
    pendingXp: 0, escaped: false, canFlee: true, pendingSwitch: false,
  } satisfies BattleState;
  return g;
}

function chooseCommand(g: ReliquaryGame, index: number): void {
  g.menuIndex = index;
  g.battle!.menuIndex = index;
  g.confirm();
}

test("an enemy action targets the creature active after a manual switch", () => {
  const outgoing = beast("emberkit", 20);
  const incoming = beast("mirewhelp", 20);
  const foe = beast("keepdrake", 25);
  const g = battleGame([outgoing, incoming], [foe]);
  const outgoingMax = currentStats(outgoing).hp;
  const incomingMax = currentStats(incoming).hp;

  chooseCommand(g, 4); // "Party" (wild battle: Strike, Skill, Item, Bind, Party, Flee)
  assert.equal(g.battle!.phase, "party");

  g.menuIndex = 1;
  g.battle!.menuIndex = 1;
  g.confirm(); // switch to incoming

  assert.equal(outgoing.hp, outgoingMax, "switched-out creature must not be hit");
  assert.ok(incoming.hp < incomingMax, "switched-in creature takes the enemy hit");
});

test("a fainted active creature opens a real replacement choice", () => {
  const weak = beast("mothwisp", 2);
  weak.hp = 1;
  const backup = beast("pebblet", 20);
  const foe = beast("keepdrake", 30);
  const g = battleGame([weak, backup], [foe]);

  chooseCommand(g, 0); // Strike; whichever side acts first, the foe KOs the active creature

  assert.equal(g.battle!.phase, "party", "must wait for a replacement");
  assert.equal(g.battle!.playerIndex, 0, "active index still identifies the fallen creature");
  assert.equal(g.battle!.pendingSwitch, true);
});

test("a forced replacement resumes command without granting the foe a free action", () => {
  const weak = beast("mothwisp", 2);
  weak.hp = 1;
  const backup = beast("pebblet", 20);
  const foe = beast("keepdrake", 30);
  const g = battleGame([weak, backup], [foe]);
  chooseCommand(g, 0);
  const backupMax = currentStats(backup).hp;
  const foeHpAfterFaint = foe.hp;

  g.menuIndex = 1;
  g.battle!.menuIndex = 1;
  g.confirm();

  assert.equal(g.battle!.phase, "command");
  assert.equal(g.battle!.playerIndex, 1);
  assert.equal(g.battle!.pendingSwitch, false);
  assert.equal(backup.hp, backupMax, "foe must not act again during the forced switch");
  assert.equal(foe.hp, foeHpAfterFaint, "foe must not act again during the forced switch");
});

test("selecting the fainted active creature performs no switch", () => {
  const weak = beast("mothwisp", 2);
  weak.hp = 1;
  const backup = beast("pebblet", 20);
  const foe = beast("keepdrake", 30);
  const g = battleGame([weak, backup], [foe]);
  chooseCommand(g, 0);
  assert.equal(g.battle!.phase, "party");

  g.menuIndex = 0; // the fainted creature
  g.battle!.menuIndex = 0;
  g.confirm();

  assert.equal(g.battle!.phase, "party");
  assert.equal(g.battle!.playerIndex, 0);
  assert.equal(g.battle!.pendingSwitch, true);
});

test("a forced replacement cannot be cancelled", () => {
  const weak = beast("mothwisp", 2);
  weak.hp = 1;
  const backup = beast("pebblet", 20);
  const foe = beast("keepdrake", 30);
  const g = battleGame([weak, backup], [foe]);
  chooseCommand(g, 0);
  g.cancel();
  assert.equal(g.battle!.phase, "party");
  assert.equal(g.battle!.pendingSwitch, true);
});

test("when the last creature faints the battle is lost", () => {
  const weak = beast("mothwisp", 2);
  weak.hp = 1;
  const foe = beast("keepdrake", 30);
  const g = battleGame([weak], [foe]);
  chooseCommand(g, 0);
  assert.equal(g.battle!.phase, "lose");
});
