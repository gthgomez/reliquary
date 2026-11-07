import type { BattleAnimSide } from "../render/battle-creature-anim.ts";
import type { BattleLayout, BattleSpritePaint } from "../render/battle-scene.ts";
import type { BattleState } from "../types.ts";
import {
  PreviewPackageError,
  validateRuntimePackage,
  type PreviewAnimation,
  type PreviewFrame,
  type ValidatedPreviewPackage,
} from "./runtime-package.ts";

export type PreviewAsset = Omit<ValidatedPreviewPackage, "atlas"> & { image: ImageBitmap };

/**
 * A presentation cue derived from an authoritative combat event. Only gameplay
 * results (hit/miss, kind, element, defeated) are carried here; the preview
 * never decides damage or accuracy.
 */
export type PreviewAttackCue = {
  skillId: string;
  side: BattleAnimSide;
  speciesId: string;
  hit: boolean;
  targetSide?: BattleAnimSide;
  targetSpeciesId?: string;
  /** Skill.kind: strike | spell | ward | hex | heal. */
  kind?: string;
  /** Skill.element: ember | tide | verdant | ... */
  element?: string;
};

type PlayingAttack = {
  clip: PreviewAnimation;
  effect?: PreviewAnimation;
  startedAt: number;
  impactAt: number;
  impactFired: boolean;
  cue: PreviewAttackCue;
};
type Reaction = { clip: PreviewAnimation; startAt: number };
type Faint = { clip: PreviewAnimation; startedAt: number };

/** Delay before a defender's hit reaction, when the attacker clip is unknown. */
export const REACTION_DELAY_MS = 240;

export interface BattlePreview {
  attack(battle: BattleState, cue: PreviewAttackCue): void;
  faint(side: BattleAnimSide, speciesId: string): void;
  faintVisible(side: BattleAnimSide, speciesId: string): boolean;
  beginFrame(battle: BattleState, reduced: boolean): void;
  sprite(side: BattleAnimSide, speciesId: string): BattleSpritePaint | undefined;
  overlay(ctx: CanvasRenderingContext2D, layout: BattleLayout): void;
}

export async function loadPreviewAsset(files: File[], digest: string): Promise<PreviewAsset> {
  const { atlas, ...pkg } = await validateRuntimePackage(files, digest);
  try {
    const image = await createImageBitmap(new Blob([atlas], { type: "image/png" }));
    if (image.width !== pkg.manifest.atlas.width || image.height !== pkg.manifest.atlas.height) {
      image.close();
      throw new Error("Decoded dimensions disagree with the manifest.");
    }
    return { ...pkg, image };
  } catch {
    throw new PreviewPackageError(
      "INVALID_ATLAS",
      "The browser could not decode the verified PNG atlas.",
    );
  }
}

/** Exact frame durations are authoritative. FPS is for authoring display only. */
export function frameAt(
  clip: PreviewAnimation,
  elapsed: number,
  loop: boolean,
): PreviewFrame | undefined {
  let position = loop
    ? elapsed % clip.frames.reduce((total, frame) => total + frame.duration_ms, 0)
    : elapsed;
  for (const frame of clip.frames) {
    if (position < frame.duration_ms) return frame;
    position -= frame.duration_ms;
  }
  return undefined;
}

export function firstImpactAt(clip: PreviewAnimation): number {
  const frame = Math.min(
    ...clip.events.filter((event) => event.name === "impact").map((event) => event.frame),
  );
  return Number.isFinite(frame)
    ? clip.frames.slice(0, frame).reduce((total, rect) => total + rect.duration_ms, 0)
    : Infinity;
}

export function attackKindClass(kind?: string): "melee" | "elemental" {
  return kind === "strike" || kind === undefined ? "melee" : "elemental";
}

function firstClip(
  clips: Record<string, PreviewAnimation>,
  names: string[],
): PreviewAnimation | undefined {
  for (const name of names) {
    if (name && clips[name]) return clips[name];
  }
  return undefined;
}

/**
 * Data-driven attack clip selection. Prefers a kind-specific clip, then an
 * element-specific clip, then the historical `attack`/`miss`/`cast` names.
 */
export function resolveAttackClip(
  clips: Record<string, PreviewAnimation>,
  cue: Pick<PreviewAttackCue, "hit" | "kind" | "element">,
): PreviewAnimation | undefined {
  const kindClass = attackKindClass(cue.kind);
  const element = cue.element ?? "";
  return cue.hit
    ? firstClip(clips, [`attack_${kindClass}`, `attack_${element}`, "attack", "cast"])
    : firstClip(clips, ["miss", `attack_${kindClass}`, `attack_${element}`, "attack", "cast"]);
}

/** Element-aware impact effect selection, falling back to a generic `impact`. */
export function resolveEffectClip(
  clips: Record<string, PreviewAnimation>,
  cue: Pick<PreviewAttackCue, "kind" | "element">,
): PreviewAnimation | undefined {
  const kindClass = attackKindClass(cue.kind);
  const element = cue.element ?? "";
  return firstClip(clips, [`impact_${element}`, `impact_${kindClass}`, "impact"]);
}

export function resolveReactionClip(
  clips: Record<string, PreviewAnimation>,
): PreviewAnimation | undefined {
  return firstClip(clips, ["hit", "stagger", "flinch", "recoil"]);
}

export function resolveFaintClip(
  clips: Record<string, PreviewAnimation>,
): PreviewAnimation | undefined {
  return firstClip(clips, ["faint", "defeat", "down"]);
}

function paintFrame(
  asset: PreviewAsset,
  clip: PreviewAnimation,
  frame: PreviewFrame,
): BattleSpritePaint {
  return (ctx, x, y, w, h) => {
    const [cellWidth, cellHeight] = asset.manifest.cell_dimensions;
    const scale = Math.min(w / cellWidth, h / cellHeight);
    const [pivotX, pivotY] = clip.logical_pivot;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(
      asset.image,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      x + w / 2 + (frame.offset_x - pivotX) * scale,
      y + h * 0.78 + (frame.offset_y - pivotY) * scale,
      frame.w * scale,
      frame.h * scale,
    );
    ctx.restore();
  };
}

function lastFrame(clip: PreviewAnimation): PreviewFrame {
  return clip.frames[clip.frames.length - 1];
}

export function createBattlePreview(
  spriteAsset: PreviewAsset,
  effectAsset: PreviewAsset | null,
  report: (data: Record<string, string>) => void,
): BattlePreview {
  const clips = spriteAsset.manifest.animations;
  const effectClips = effectAsset?.manifest.animations ?? {};
  const subject = spriteAsset.manifest.subject_id;
  let idleStartedAt = performance.now();
  const attacks = new Map<BattleAnimSide, PlayingAttack>();
  const reactions = new Map<BattleAnimSide, Reaction>();
  const faints = new Map<BattleAnimSide, Faint>();
  let battleRef: BattleState | null = null;
  let now = idleStartedAt;
  let reduced = false;
  let impactCount = 0;
  const readout: Record<string, string> = {};

  function switchBattle(battle: BattleState) {
    if (battleRef === battle) return;
    battleRef = battle;
    idleStartedAt = performance.now();
    attacks.clear();
    reactions.clear();
    faints.clear();
    impactCount = 0;
    Object.assign(readout, { skill: "", hit: "", side: "", element: "", kind: "" });
  }

  function targetSideFor(side: BattleAnimSide, cue: PreviewAttackCue): BattleAnimSide {
    return cue.targetSide ?? (side === "player" ? "foe" : "player");
  }

  return {
    attack(battle, cue) {
      const isAttacker = cue.speciesId === subject;
      const isTarget = (cue.targetSpeciesId ?? "") === subject;
      if (!isAttacker && !isTarget) return;
      switchBattle(battle);
      const startedAt = performance.now();
      if (isAttacker) {
        const clip = resolveAttackClip(clips, cue);
        if (clip) {
          attacks.set(cue.side, {
            clip,
            effect: effectAsset ? resolveEffectClip(effectClips, cue) : undefined,
            startedAt,
            impactAt: cue.hit ? firstImpactAt(clip) : Infinity,
            impactFired: false,
            cue,
          });
        }
      }
      if (cue.hit && isTarget) {
        const reactionClip = resolveReactionClip(clips);
        if (reactionClip) {
          const defender = targetSideFor(cue.side, cue);
          // Let an in-flight attack on the defender finish before the flinch.
          const attack = attacks.get(defender);
          const attackEnd = attack ? attack.startedAt + attack.clip.duration_ms : 0;
          const startAt = Math.max(startedAt + REACTION_DELAY_MS, attackEnd);
          reactions.set(defender, { clip: reactionClip, startAt });
        }
      }
      Object.assign(readout, {
        skill: cue.skillId,
        hit: String(cue.hit),
        side: cue.side,
        element: cue.element ?? "",
        kind: cue.kind ?? "",
      });
    },
    faint(side, speciesId) {
      if (speciesId !== subject || faints.has(side)) return;
      const clip = resolveFaintClip(clips);
      if (!clip) return;
      faints.set(side, { clip, startedAt: performance.now() });
    },
    faintVisible(side, speciesId) {
      return speciesId === subject && faints.has(side);
    },
    beginFrame(battle, reduce) {
      switchBattle(battle);
      now = performance.now();
      reduced = reduce;
      Object.assign(readout, {
        playerClip: "",
        playerFrame: "",
        foeClip: "",
        foeFrame: "",
        effectClip: "",
        effectFrame: "",
      });
    },
    sprite(side, speciesId) {
      if (speciesId !== subject) return undefined;
      const faint = faints.get(side);
      if (faint) {
        const frame = reduced
          ? lastFrame(faint.clip)
          : frameAt(faint.clip, now - faint.startedAt, false) ?? lastFrame(faint.clip);
        readout[`${side}Clip`] = faint.clip.state;
        readout[`${side}Frame`] = String(frame.index);
        return paintFrame(spriteAsset, faint.clip, frame);
      }
      const attack = attacks.get(side);
      if (attack) {
        const frame = frameAt(attack.clip, now - attack.startedAt, false);
        if (frame) {
          const shown = reduced ? attack.clip.frames[0] : frame;
          readout[`${side}Clip`] = attack.clip.state;
          readout[`${side}Frame`] = String(shown.index);
          return paintFrame(spriteAsset, attack.clip, shown);
        }
      }
      const reaction = reactions.get(side);
      if (reaction && now >= reaction.startAt) {
        const frame = frameAt(reaction.clip, now - reaction.startAt, false);
        if (frame) {
          const shown = reduced ? reaction.clip.frames[0] : frame;
          readout[`${side}Clip`] = reaction.clip.state;
          readout[`${side}Frame`] = String(shown.index);
          return paintFrame(spriteAsset, reaction.clip, shown);
        }
      }
      const idle = clips.idle;
      const frame = idle && frameAt(idle, reduced ? 0 : now - idleStartedAt, idle.loop);
      if (idle && frame) {
        readout[`${side}Clip`] = idle.state;
        readout[`${side}Frame`] = String(frame.index);
        return paintFrame(spriteAsset, idle, frame);
      }
      return undefined;
    },
    overlay(ctx, layout) {
      for (const [side, attack] of attacks) {
        const { clip, effect } = attack;
        const elapsed = now - attack.startedAt;
        const impact = reduced ? Infinity : attack.impactAt;
        if (!attack.impactFired && elapsed >= impact && elapsed < clip.duration_ms) {
          attack.impactFired = true;
          impactCount += 1;
        }
        const effectElapsed = elapsed - impact;
        if (
          effectAsset &&
          effect &&
          attack.impactFired &&
          !reduced &&
          Number.isFinite(effectElapsed)
        ) {
          // A loopable authoring clip can repeat while this attack is visible.
          // Non-looping bursts may finish on their own after the attack clip.
          const withinWindow = !effect.loop || elapsed < clip.duration_ms;
          const frame = withinWindow && frameAt(effect, effectElapsed, effect.loop);
          if (frame) {
            const targetSide = targetSideFor(side, attack.cue);
            const target = targetSide === "player" ? layout.player : layout.foe;
            const size = Math.min(64, layout.foe.h);
            paintFrame(effectAsset, effect, frame)(
              ctx,
              target.cx - size / 2,
              target.cy - size / 2,
              size,
              size,
            );
            readout.effectClip = effect.state;
            readout.effectFrame = String(frame.index);
          }
        }
        const expires =
          attack.impactFired && effect && !effect.loop && Number.isFinite(impact)
            ? Math.max(clip.duration_ms, impact + effect.duration_ms)
            : clip.duration_ms;
        if (elapsed >= expires) attacks.delete(side);
      }
      report({ ...readout, impacts: String(impactCount), reduced: String(reduced) });
    },
  };
}
