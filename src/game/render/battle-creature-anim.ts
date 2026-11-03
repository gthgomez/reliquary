export type BattleAnimSide = "player" | "foe";

export type BattleAnimCue = {
  skillId: string;
  attacker: BattleAnimSide;
  /** Whether the strike connected (miss uses a short whiff). */
  hit: boolean;
};

export type BattleSpriteMotion = {
  dx: number;
  dy: number;
  foeShakeX: number;
  projectile?: { x: number; y: number; r: number; alpha: number };
};

export type BattleAnimSampleOptions = {
  reducedMotion?: boolean;
  /** Monotonic seconds for idle; wall clock ok when tab visible. */
  idlePhase?: number;
};

const NIP_MS = 520;
const GUST_MS = 640;
const WHIFF_MS = 280;
const IDLE_AMP = 2.2;
const IDLE_REDUCED_AMP = 0.4;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 2;
}

function easeIn(t: number): number {
  return t * t;
}

export function battleAnimDurationMs(cue: BattleAnimCue, reducedMotion?: boolean): number {
  if (!cue.hit) return reducedMotion ? 120 : WHIFF_MS;
  if (cue.skillId === "nip") return reducedMotion ? 180 : NIP_MS;
  if (cue.skillId === "gust") return reducedMotion ? 220 : GUST_MS;
  return reducedMotion ? 140 : 360;
}

export function shouldPlayBattleAnim(skillId: string): boolean {
  return skillId === "nip" || skillId === "gust";
}

/** Sample cosmetic motion; does not affect combat numbers. */
export function sampleBattleIdle(options: BattleAnimSampleOptions = {}): BattleSpriteMotion {
  const reduced = options.reducedMotion === true;
  const idle =
    (options.idlePhase ?? 0) > 0
      ? Math.sin((options.idlePhase ?? 0) * 2.1) * (reduced ? IDLE_REDUCED_AMP : IDLE_AMP)
      : 0;
  return { dx: 0, dy: idle, foeShakeX: 0 };
}

export function sampleBattleAnim(
  cue: BattleAnimCue,
  elapsedMs: number,
  corridor: { x: number; y: number; w: number; h: number },
  anchors: { player: { cx: number; cy: number }; foe: { cx: number; cy: number } },
  options: BattleAnimSampleOptions = {},
): BattleSpriteMotion {
  const reduced = options.reducedMotion === true;
  const dur = battleAnimDurationMs(cue, reduced);
  const t = clamp(elapsedMs / dur, 0, 1);
  const sign = cue.attacker === "player" ? 1 : -1;
  const towardFoe = cue.attacker === "player" ? 1 : -1;
  const idle =
    (options.idlePhase ?? 0) > 0
      ? Math.sin((options.idlePhase ?? 0) * 2.1) * (reduced ? IDLE_REDUCED_AMP : IDLE_AMP)
      : 0;

  const base: BattleSpriteMotion = { dx: 0, dy: idle, foeShakeX: 0 };

  if (cue.skillId === "nip") {
    const lunge = reduced ? corridor.w * 0.08 : corridor.w * 0.22;
    if (t < 0.18) {
      base.dx = -sign * towardFoe * easeIn(t / 0.18) * (reduced ? 3 : 6);
    } else if (t < 0.42) {
      const p = (t - 0.18) / 0.24;
      base.dx = sign * towardFoe * easeOut(p) * lunge;
    } else if (t < 0.72) {
      const p = (t - 0.42) / 0.3;
      base.dx = sign * towardFoe * lunge * (1 - easeOut(p));
      if (cue.hit && p > 0.35) base.foeShakeX = Math.sin(p * 18) * (reduced ? 2 : 5);
    }
    return base;
  }

  if (cue.skillId === "gust") {
    const windupEnd = reduced ? 0.35 : 0.28;
    if (t < windupEnd) {
      base.dy = idle - easeIn(t / windupEnd) * (reduced ? 2 : 5);
    } else if (t < 0.72) {
      const p = (t - windupEnd) / (0.72 - windupEnd);
      const fromX = cue.attacker === "player" ? anchors.player.cx : anchors.foe.cx;
      const toX = cue.attacker === "player" ? anchors.foe.cx : anchors.player.cx;
      const y = (anchors.player.cy + anchors.foe.cy) / 2 - corridor.h * 0.15;
      const x = fromX + (toX - fromX) * easeOut(p);
      base.projectile = {
        x: clamp(x, corridor.x, corridor.x + corridor.w),
        y,
        r: reduced ? 5 : 7 + p * 2,
        alpha: 0.35 + p * 0.45,
      };
      if (cue.hit && p > 0.85) base.foeShakeX = (reduced ? 2 : 4) * towardFoe;
    }
    return base;
  }

  if (t < 0.5) base.dx = sign * towardFoe * easeOut(t / 0.5) * (reduced ? 4 : 8);
  else base.dx = sign * towardFoe * (1 - easeOut((t - 0.5) / 0.5)) * (reduced ? 4 : 8);
  return base;
}

export function paintGustProjectile(
  ctx: CanvasRenderingContext2D,
  projectile: NonNullable<BattleSpriteMotion["projectile"]>,
): void {
  if (typeof ctx.arc !== "function") return;
  ctx.save();
  ctx.globalAlpha = projectile.alpha;
  ctx.fillStyle = "rgba(210,230,255,0.85)";
  ctx.beginPath();
  ctx.arc(projectile.x, projectile.y, projectile.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
