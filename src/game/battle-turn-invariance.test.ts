import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame } from "./engine.ts";
import { applyStatus } from "./systems/status.ts";
import { battleAnimDurationMs } from "./render/battle-creature-anim.ts";
import type { BattleState } from "./types.ts";

type TurnSnapshot = {
  foeHp: number;
  playerMp: number;
  playerStatusTurns: number;
  phase: string;
};

async function withBattle(
  random: () => number,
  run: (game: ReliquaryGame, frame: (ms: number) => void) => void,
) {
  const globals = globalThis as Record<string, unknown>;
  const names = ["window", "document", "Image", "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "HTMLElement"];
  const previous = names.map((name) => [name, globals[name]] as const);
  let callback: (ts: number) => void = () => {};
  globals.window = { addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ matches: false }) };
  globals.document = { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} };
  globals.HTMLElement = class {};
  globals.Image = class {
    onload?: () => void;
    set src(_: string) {
      queueMicrotask(() => this.onload?.());
    }
  };
  globals.requestAnimationFrame = (fn: (ts: number) => void) => {
    callback = fn;
    return 1;
  };
  globals.cancelAnimationFrame = () => {};
  globals.localStorage = { getItem: () => null, setItem: () => {} };
  const game = new ReliquaryGame({ random });
  try {
    await game.boot({ width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement);
    window.__controlsTest?.startWild?.();
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

function snap(game: ReliquaryGame, b: BattleState): TurnSnapshot {
  const me = game.party[b.playerIndex]!;
  return {
    foeHp: b.foes[b.foeIndex]!.hp,
    playerMp: me.mp,
    playerStatusTurns: me.statusTurns ?? 0,
    phase: b.phase,
  };
}

function act(game: ReliquaryGame, action: { type: string; skill?: string; index?: number }) {
  (game as unknown as { playerAction: (a: typeof action) => void }).playerAction(action);
}

test("status end-of-turn tick runs at resolve, not again when anim completes", async () => {
  await withBattle(() => 0.42, (game, frame) => {
    const b = game.battle as BattleState;
    const me = game.party[b.playerIndex]!;
    b.phase = "command";
    me.skills = ["nip"];
    applyStatus(me, "burn", 3);
    const turnsAfterResolve = () => me.statusTurns;
    act(game, { type: "skill", skill: "nip" });
    assert.equal(b.phase, "anim");
    const turnsAtResolve = turnsAfterResolve();
    assert.equal(turnsAtResolve, 2, "burn tick once at turn resolve (base timing)");
    const atResolve = snap(game, b);
    for (let t = 16; t < 4000; t += 16) frame(t);
    assert.deepEqual(snap(game, b), { ...atResolve, phase: "command" });
    assert.equal(turnsAfterResolve(), 2, "no second burn tick when anim ends");
  });
});

test("gust spends MP at resolve and matches base timing through long anim", async () => {
  await withBattle(() => 0.42, (game, frame) => {
    const b = game.battle as BattleState;
    const me = game.party[b.playerIndex]!;
    b.phase = "command";
    me.skills = ["gust"];
    me.mp = 10;
    b.foes[0]!.hp = 50;
    act(game, { type: "skill", skill: "gust" });
    assert.equal(b.phase, "anim");
    assert.equal(b.animCue?.skillId, "gust");
    assert.equal(me.mp, 5);
    const atResolve = snap(game, b);
    for (let t = 16; t < 8000; t += 16) frame(t);
    assert.equal(me.mp, atResolve.playerMp);
    assert.equal(b.foes[0]!.hp, atResolve.foeHp);
    assert.equal(b.phase, "command");
  });
});

test("reduced-motion anim duration does not change resolved combat numbers", async () => {
  const runOnce = (reduced: boolean) => {
    let out: TurnSnapshot | null = null;
    const globals = globalThis as Record<string, unknown>;
    globals.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: () => ({ matches: reduced }),
    };
    return withBattle(() => 0.42, (game, frame) => {
      const b = game.battle as BattleState;
      game.party[b.playerIndex]!.skills = ["nip"];
      b.phase = "command";
      b.foes[0]!.hp = 40;
      act(game, { type: "skill", skill: "nip" });
      out = snap(game, b);
      const dur = battleAnimDurationMs(b.animCue!, reduced);
      frame(dur + 32);
    }).then(() => out!);
  };
  const full = await runOnce(false);
  const reduced = await runOnce(true);
  assert.equal(full.foeHp, reduced.foeHp);
  assert.equal(full.playerMp, reduced.playerMp);
});

test("anim phase blocks confirm but does not delay damage or MP", async () => {
  await withBattle(() => 0.42, (game, frame) => {
    const b = game.battle as BattleState;
    const me = game.party[b.playerIndex]!;
    me.skills = ["gust"];
    me.mp = 8;
    b.phase = "command";
    act(game, { type: "skill", skill: "gust" });
    const hp = b.foes[0]!.hp;
    const mp = me.mp;
    b.menuIndex = 0;
    game.confirm();
    assert.equal(b.phase, "anim");
    assert.equal(b.foes[0]!.hp, hp);
    assert.equal(me.mp, mp);
    frame(600);
    assert.equal(b.foes[0]!.hp, hp);
  });
});
