import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame } from "./engine.ts";
import { SKILLS } from "./content.ts";
import type { BattleState } from "./types.ts";

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
  const game = new ReliquaryGame({ random: () => 0.42 });
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

test("strike resolution does not depend on animation elapsed time", async () => {
  await withBattle((game, frame) => {
    const b = game.battle as BattleState;
    b.phase = "command";
    const foe = b.foes[0]!;
    const me = game.party[b.playerIndex]!;
    me.skills = ["nip"];
    foe.hp = 40;
    const hpBefore = foe.hp;
    const act = game as unknown as { playerAction: (a: { type: string; skill?: string }) => void };
    act.playerAction({ type: "skill", skill: "nip" });
    const hpAfterResolve = foe.hp;
    assert.ok(hpAfterResolve < hpBefore);
    assert.equal(b.phase, "anim");
    assert.equal(b.animCue?.skillId, "nip");
    for (let t = 16; t < 2000; t += 16) frame(t);
    assert.equal(foe.hp, hpAfterResolve, "HP unchanged while anim plays");
    assert.equal(SKILLS.nip.power, 40);
  });
});
