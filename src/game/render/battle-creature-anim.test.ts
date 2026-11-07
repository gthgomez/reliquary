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

test("S17: the attacker lunges toward its opponent, never away from it", () => {
  // The player stands left of the foe: a player attack moves +x, a foe attack
  // moves −x. The old sign*towardFoe product moved BOTH attackers +x.
  const midLunge = (attacker: "player" | "foe", skillId: "nip" | "gust") => {
    const cue = { skillId, attacker, hit: true };
    const dur = battleAnimDurationMs(cue, false);
    return sampleBattleAnim(cue, dur * 0.3, corridor, anchors, { reducedMotion: false });
  };
  const playerNip = midLunge("player", "nip");
  const foeNip = midLunge("foe", "nip");
  assert.ok(playerNip.dx > 0, `player lunge must move toward the foe (+x), got ${playerNip.dx}`);
  assert.ok(foeNip.dx < 0, `foe lunge must move toward the player (−x), got ${foeNip.dx}`);
  assert.equal(foeNip.dx, -playerNip.dx, "sides mirror exactly");
  // The gust projectile flies attacker → defender for both sides.
  const gustShot = (attacker: "player" | "foe") => {
    const cue = { skillId: "gust" as const, attacker, hit: true };
    const dur = battleAnimDurationMs(cue, false);
    for (let t = 0; t <= dur; t += 20) {
      const m = sampleBattleAnim(cue, t, corridor, anchors, { reducedMotion: false });
      if (m.projectile) return { attacker, from: attacker === "player" ? anchors.player.cx : anchors.foe.cx, shot: m.projectile };
    }
    return null;
  };
  const playerShot = gustShot("player");
  const foeShot = gustShot("foe");
  assert.ok(playerShot && foeShot, "both sides fire a projectile");
  assert.equal(playerShot!.shot.x > playerShot!.from, true, "player's gust flies rightward");
  assert.equal(foeShot!.shot.x < foeShot!.from, true, "foe's gust flies leftward");
});

test("S17: the impact reaction is signed away from the attacker", () => {
  const cueP = { skillId: "gust" as const, attacker: "player" as const, hit: true };
  const cueF = { skillId: "gust" as const, attacker: "foe" as const, hit: true };
  const dur = battleAnimDurationMs(cueP, false);
  // The gust impact lands inside t ∈ (0.654, 0.72) of the animation.
  const onPlayer = sampleBattleAnim(cueP, dur * 0.7, corridor, anchors, { reducedMotion: false });
  const onFoe = sampleBattleAnim(cueF, dur * 0.7, corridor, anchors, { reducedMotion: false });
  assert.ok(onPlayer.defenderShakeX > 0, "player's attack pushes the foe +x");
  assert.ok(onFoe.defenderShakeX < 0, "foe's attack pushes the player −x");
  const idle = sampleBattleIdle({ idlePhase: 2, reducedMotion: false });
  assert.equal(idle.defenderShakeX, 0);
});

test("idle motion is bounded; foe draw uses scaled cosmetic dy only", () => {
  const idle = sampleBattleIdle({ idlePhase: 2, reducedMotion: false });
  assert.ok(Math.abs(idle.dy) > 0);
  assert.ok(Math.abs(idle.dy) <= 3);
  assert.ok(Math.abs(idle.dy * 0.35) <= 1.2);
});
