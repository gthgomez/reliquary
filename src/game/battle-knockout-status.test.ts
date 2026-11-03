import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame } from "./engine.ts";
import { currentStats, makeBeast } from "./content.ts";
import { playerActsFirst } from "./systems/combat.ts";
import { applyStatus } from "./systems/status.ts";
import type { Beast } from "./types.ts";

const random = () => 0.42;

function beast(species: string): Beast {
  const value = makeBeast(species, 20, { random });
  value.skills = ["nip"];
  value.mp = 10;
  return value;
}

async function withBattle(run: (game: ReliquaryGame, frame: (ms: number) => void) => void) {
  const globals = globalThis as Record<string, unknown>;
  const names = ["window", "document", "Image", "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "HTMLElement"];
  const previous = names.map((name) => [name, globals[name]] as const);
  let callback: (ts: number) => void = () => {};
  globals.window = { addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ matches: false }) };
  globals.document = { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} };
  globals.HTMLElement = class {};
  globals.Image = class {
    onload?: () => void;
    set src(_: string) { queueMicrotask(() => this.onload?.()); }
  };
  globals.requestAnimationFrame = (fn: (ts: number) => void) => { callback = fn; return 1; };
  globals.cancelAnimationFrame = () => {};
  globals.localStorage = { getItem: () => null, setItem: () => {} };
  const game = new ReliquaryGame({ random });
  try {
    await game.boot({ width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement);
    game.party = [beast("mothwisp")];
    // Use the encounter entry point, without requiring a production window probe.
    (game as unknown as { startWildFrom: (species: string, level: number) => void }).startWildFrom("pebblet", 20);
    assert.ok(game.battle);
    run(game, (ms) => callback(ms));
  } finally {
    game.destroy();
    for (const [name, value] of previous) {
      if (value === undefined) delete globals[name];
      else globals[name] = value;
    }
  }
}

function act(game: ReliquaryGame, action: { type: string; skill?: string; item?: string; index?: number }) {
  (game as unknown as { playerAction: (a: typeof action) => void }).playerAction(action);
}

function statusSnapshot(value: Beast) {
  return { hp: value.hp, mp: value.mp, status: value.status, turns: value.statusTurns };
}

for (const playerWins of [true, false]) {
  for (const playerFirst of [true, false]) {
    for (const hasReplacement of [true, false]) {
      test(`${playerWins ? "foe" : "player"} KO, ${playerFirst ? "player" : "foe"} first, ${hasReplacement ? "replacement" : "last beast"}: survivor ticks once`, async () => {
        await withBattle((game, frame) => {
          const b = game.battle!;
          const me = beast(playerFirst ? "mothwisp" : "pebblet");
          const foe = beast(playerFirst ? "pebblet" : "mothwisp");
          const survivor = playerWins ? me : foe;
          const fainted = playerWins ? foe : me;
          const replacement = beast("gravepup");
          applyStatus(survivor, "soak", 3);
          applyStatus(fainted, "burn", 3);
          applyStatus(replacement, "soak", 3);
          fainted.hp = 1;
          game.party = [me, ...(!playerWins && hasReplacement ? [replacement] : [])];
          b.foes = [foe, ...(playerWins && hasReplacement ? [replacement] : [])];
          b.playerIndex = b.foeIndex = 0;
          const incomingBefore = statusSnapshot(replacement);
          assert.equal(playerActsFirst(me, foe, random), playerFirst, "fixture uses the real turn order");

          act(game, { type: "skill", skill: "nip" });

          assert.equal(b.phase, playerWins ? (hasReplacement ? "command" : "win") : (hasReplacement ? "party" : "lose"));
          assert.equal(survivor.mp, 8, "soak drains MP at KO resolution");
          assert.equal(survivor.statusTurns, 2, "exactly one duration tick");
          assert.equal(fainted.hp, 0, "burn must not revive a fainted beast");
          assert.equal(fainted.statusTurns, 3, "fainted participants do not tick");
          assert.deepEqual(statusSnapshot(replacement), incomingBefore, "replacement did not participate in the completed turn");
          const resolvedSurvivor = statusSnapshot(survivor);
          if (!playerWins && hasReplacement) {
            assert.equal(b.playerIndex, 0, "fainted active remains selected until confirmation");
            game.cancel();
            assert.equal(b.phase, "party", "a forced switch cannot be canceled");
            game.confirm();
            assert.equal(b.playerIndex, 1);
            assert.equal(b.phase, "command");
          } else if (playerWins && hasReplacement) {
            assert.equal(b.foeIndex, 1);
          }
          for (let ms = 16; ms < 4000; ms += 16) frame(ms);
          assert.deepEqual(statusSnapshot(survivor), resolvedSurvivor, "selection and frames do not tick the survivor again");
          assert.deepEqual(statusSnapshot(replacement), incomingBefore, "entering battle does not cost a status turn");
          assert.equal(fainted.hp, 0);
        });
      });
    }
  }
}

for (const playerWins of [true, false]) {
  test(`burn damage and expiration resolve on the surviving ${playerWins ? "player" : "foe"} before a KO transition`, async () => {
    await withBattle((game) => {
      const b = game.battle!;
      const me = beast(playerWins ? "mothwisp" : "pebblet");
      const foe = beast(playerWins ? "pebblet" : "mothwisp");
      const survivor = playerWins ? me : foe;
      const fainted = playerWins ? foe : me;
      game.party = [me];
      b.foes = [foe];
      fainted.hp = 1;
      applyStatus(survivor, "burn", 1);
      const beforeHp = survivor.hp;
      act(game, { type: "skill", skill: "nip" });
      assert.equal(survivor.hp, beforeHp - Math.floor(currentStats(survivor).hp * 0.06));
      assert.equal(survivor.status, null);
      assert.equal(survivor.statusTurns, 0);
      assert.equal(fainted.hp, 0);
      assert.equal(b.phase, playerWins ? "win" : "lose");
    });
  });
}

test("KO of a voluntary switch-in ticks only the surviving foe, not either benched beast", async () => {
  await withBattle((game) => {
    const b = game.battle!;
    const outgoing = beast("mothwisp");
    const incoming = beast("pebblet");
    const foe = beast("gravepup");
    for (const value of [outgoing, foe]) applyStatus(value, "soak", 3);
    applyStatus(incoming, "burn", 3);
    incoming.hp = 1;
    game.party = [outgoing, incoming];
    b.foes = [foe];
    const outgoingBefore = statusSnapshot(outgoing);
    act(game, { type: "switch", index: 1 });
    assert.equal(b.phase, "party");
    assert.equal(b.playerIndex, 1);
    assert.equal(incoming.hp, 0);
    assert.equal(incoming.statusTurns, 3);
    assert.equal(foe.mp, 8);
    assert.equal(foe.statusTurns, 2);
    assert.deepEqual(statusSnapshot(outgoing), outgoingBefore);
    game.confirm();
    assert.equal(b.playerIndex, 0);
    assert.equal(b.phase, "command");
    assert.equal(foe.statusTurns, 2);
    assert.deepEqual(statusSnapshot(outgoing), outgoingBefore);
  });
});

test("failed flee retaliation KO ticks the surviving foe before the forced switch", async () => {
  await withBattle((game, frame) => {
    const b = game.battle!;
    const me = beast("pebblet");
    const foe = beast("mothwisp");
    const replacement = beast("gravepup");
    me.hp = 1;
    applyStatus(me, "bind", 3);
    applyStatus(foe, "soak", 3);
    applyStatus(replacement, "soak", 3);
    game.party = [me, replacement];
    b.foes = [foe];
    const incomingBefore = statusSnapshot(replacement);
    (game as unknown as { tryFlee: () => void }).tryFlee();
    assert.equal(b.phase, "party");
    assert.equal(me.hp, 0);
    assert.equal(foe.mp, 8);
    assert.equal(foe.statusTurns, 2);
    game.confirm();
    for (let ms = 16; ms < 4000; ms += 16) frame(ms);
    assert.equal(b.phase, "command");
    assert.equal(foe.mp, 8);
    assert.equal(foe.statusTurns, 2);
    assert.deepEqual(statusSnapshot(replacement), incomingBefore);
  });
});


test("failed binding waits for its result, then ticks the surviving foe once on retaliation KO", async () => {
  await withBattle((game, frame) => {
    const b = game.battle!;
    const me = beast("pebblet");
    const foe = beast("mothwisp");
    const replacement = beast("gravepup");
    me.hp = 1;
    applyStatus(me, "burn", 3);
    applyStatus(foe, "soak", 3);
    applyStatus(replacement, "soak", 3);
    game.party = [me, replacement];
    b.foes = [foe];
    game.inventory.common_sigil = 1;
    const incomingBefore = statusSnapshot(replacement);
    act(game, { type: "bind", item: "common_sigil" });
    assert.equal(b.phase, "catch");
    assert.equal(foe.mp, 10, "no tick while the asynchronous binding result is pending");
    assert.equal(foe.statusTurns, 3);
    assert.equal(me.hp, 1);
    for (let ms = 16; ms < 4000; ms += 16) frame(ms);
    assert.equal(b.phase, "party");
    assert.equal(me.hp, 0, "a failed binding cannot revive the burned player");
    assert.equal(foe.mp, 8);
    assert.equal(foe.statusTurns, 2);
    assert.equal(game.inventory.common_sigil, 0);
    game.confirm();
    for (let ms = 4000; ms < 8000; ms += 16) frame(ms);
    assert.equal(b.phase, "command");
    assert.equal(foe.mp, 8);
    assert.equal(foe.statusTurns, 2);
    assert.deepEqual(statusSnapshot(replacement), incomingBefore);
  });
});

test("non-KO failed flee ticks both surviving participants once", async () => {
  await withBattle((game, frame) => {
    const b = game.battle!;
    const me = beast("pebblet");
    const foe = beast("mothwisp");
    applyStatus(me, "soak", 3);
    applyStatus(foe, "burn", 3);
    game.party = [me];
    b.foes = [foe];
    const foeHp = foe.hp;
    (game as unknown as { tryFlee: () => void }).tryFlee();
    assert.equal(b.escaped, false);
    assert.equal(b.phase, "command");
    assert.ok(me.hp > 0 && me.hp < currentStats(me).hp, "the foe retaliated without a KO");
    assert.equal(me.mp, 8);
    assert.equal(me.statusTurns, 2);
    assert.equal(foe.hp, foeHp - Math.floor(currentStats(foe).hp * 0.06));
    assert.equal(foe.statusTurns, 2);
    const resolved = [statusSnapshot(me), statusSnapshot(foe)];
    for (let ms = 16; ms < 4000; ms += 16) frame(ms);
    assert.deepEqual([statusSnapshot(me), statusSnapshot(foe)], resolved);
  });
});

test("repeated bound flee attempts expire Bind instead of freezing it indefinitely", async () => {
  await withBattle((game) => {
    const b = game.battle!;
    const me = beast("mothwisp");
    const foe = beast("pebblet");
    applyStatus(me, "bind", 2);
    applyStatus(foe, "soak", 3);
    game.party = [me];
    b.foes = [foe];
    const flee = () => (game as unknown as { tryFlee: () => void }).tryFlee();
    flee();
    assert.match(b.log[0]!, /Roots hold fast/);
    assert.equal(b.escaped, false);
    assert.equal(me.status, "bind");
    assert.equal(me.statusTurns, 1);
    assert.equal(foe.mp, 8);
    flee();
    assert.ok(me.hp > 0);
    assert.equal(b.escaped, false, "the second blocked attempt still spends its turn");
    assert.equal(me.status, null);
    assert.equal(me.statusTurns, 0);
    assert.equal(foe.mp, 6);
    assert.equal(foe.statusTurns, 1);
    const beforeEscape = [statusSnapshot(me), statusSnapshot(foe)];
    flee();
    assert.equal(b.escaped, true, "the unbound faster player can now escape");
    assert.equal(b.phase, "win");
    assert.deepEqual([statusSnapshot(me), statusSnapshot(foe)], beforeEscape, "successful escape has no retaliation turn");
  });
});

test("non-KO failed binding ticks both survivors only after the asynchronous result", async () => {
  await withBattle((game, frame) => {
    const b = game.battle!;
    const me = beast("pebblet");
    const foe = beast("mothwisp");
    applyStatus(me, "bind", 1);
    applyStatus(foe, "soak", 3);
    game.party = [me];
    b.foes = [foe];
    game.inventory.common_sigil = 1;
    const pending = [statusSnapshot(me), statusSnapshot(foe)];
    act(game, { type: "bind", item: "common_sigil" });
    assert.equal(b.phase, "catch");
    assert.deepEqual([statusSnapshot(me), statusSnapshot(foe)], pending);
    for (let ms = 16; ms < 4000; ms += 16) frame(ms);
    assert.equal(b.phase, "command");
    assert.match(b.log.join(" "), /breaks the sigil/);
    assert.ok(me.hp > 0 && me.hp < pending[0]!.hp);
    assert.equal(me.status, null);
    assert.equal(me.statusTurns, 0);
    assert.equal(foe.mp, 8);
    assert.equal(foe.statusTurns, 2);
    assert.equal(game.inventory.common_sigil, 0);
    const resolved = [statusSnapshot(me), statusSnapshot(foe)];
    for (let ms = 4000; ms < 8000; ms += 16) frame(ms);
    assert.deepEqual([statusSnapshot(me), statusSnapshot(foe)], resolved);
  });
});

test("successful binding preserves its no-retaliation outcome and heals the captured beast", async () => {
  await withBattle((game, frame) => {
    const b = game.battle!;
    const me = beast("pebblet");
    const foe = beast("mothwisp");
    applyStatus(me, "burn", 3);
    applyStatus(foe, "soak", 3);
    foe.hp = 1;
    game.party = [me];
    b.foes = [foe];
    game.inventory.relic_sigil = 1;
    const playerBefore = statusSnapshot(me);
    const foeBefore = statusSnapshot(foe);
    act(game, { type: "bind", item: "relic_sigil" });
    assert.equal(b.phase, "catch");
    assert.deepEqual(statusSnapshot(me), playerBefore);
    assert.deepEqual(statusSnapshot(foe), foeBefore);
    for (let ms = 16; ms < 4000; ms += 16) frame(ms);
    assert.equal(b.phase, "win");
    assert.equal(game.party[1], foe);
    assert.equal(game.inventory.relic_sigil, 0);
    assert.deepEqual(statusSnapshot(me), playerBefore, "successful capture does not add a retaliation/status turn");
    assert.deepEqual(statusSnapshot(foe), {
      hp: currentStats(foe).hp, mp: currentStats(foe).mp, status: null, turns: 0,
    });
    game.confirm();
    for (let ms = 4000; ms < 8000; ms += 16) frame(ms);
    assert.equal(game.battle, null);
    assert.deepEqual(statusSnapshot(me), playerBefore);
    assert.equal(foe.status, null);
  });
});
