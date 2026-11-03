import assert from "node:assert/strict";
import { test } from "node:test";
import {
  battleAnimDurationMs,
  sampleBattleAnim,
  sampleBattleIdle,
  shouldPlayBattleAnim,
} from "./battle-creature-anim.ts";

const corridor = { x: 40, y: 60, w: 220, h: 120 };
const anchors = { player: { cx: 80, cy: 180 }, foe: { cx: 260, cy: 90 } };

test("nip and gust are the authored prototype skills", () => {
  assert.equal(shouldPlayBattleAnim("nip"), true);
  assert.equal(shouldPlayBattleAnim("gust"), true);
  assert.equal(shouldPlayBattleAnim("strike"), false);
});

test("motion samples stay inside corridor bounds", () => {
  for (const skillId of ["nip", "gust"] as const) {
    for (const attacker of ["player", "foe"] as const) {
      const cue = { skillId, attacker, hit: true };
      const dur = battleAnimDurationMs(cue, false);
      for (let t = 0; t <= dur; t += 40) {
        const m = sampleBattleAnim(cue, t, corridor, anchors, { reducedMotion: false });
        assert.ok(Math.abs(m.dx) <= corridor.w * 0.35, `${skillId} dx ${m.dx}`);
        if (m.projectile) {
          assert.ok(m.projectile.x >= corridor.x - 4 && m.projectile.x <= corridor.x + corridor.w + 4);
        }
      }
    }
  }
});

test("reduced motion shortens duration and lunge distance", () => {
  const cue = { skillId: "nip", attacker: "player" as const, hit: true };
  assert.ok(battleAnimDurationMs(cue, true) < battleAnimDurationMs(cue, false));
  const full = sampleBattleAnim(cue, 200, corridor, anchors, { reducedMotion: false });
  const reduced = sampleBattleAnim(cue, 200, corridor, anchors, { reducedMotion: true });
  assert.ok(Math.abs(reduced.dx) <= Math.abs(full.dx));
});

test("idle motion is bounded and independent of strike phase", () => {
  const idle = sampleBattleIdle({ idlePhase: 1.2, reducedMotion: false });
  assert.ok(Math.abs(idle.dy) <= 3);
  assert.equal(idle.dx, 0);
});
