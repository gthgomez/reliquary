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
type Attack = { skillId: string; side: BattleAnimSide; speciesId: string; hit: boolean };
type PlayingAttack = {
  clip: PreviewAnimation;
  startedAt: number;
  impactAt: number;
  impactFired: boolean;
};

export interface BattlePreview {
  attack(battle: BattleState, cue: Attack): void;
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

export function createBattlePreview(
  spriteAsset: PreviewAsset,
  effectAsset: PreviewAsset | null,
  report: (data: Record<string, string>) => void,
): BattlePreview {
  const clips = spriteAsset.manifest.animations;
  const effectClip = effectAsset?.manifest.animations.impact;
  let idleStartedAt = performance.now();
  const attacks = new Map<BattleAnimSide, PlayingAttack>();
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
    impactCount = 0;
    Object.assign(readout, { skill: "", hit: "", side: "" });
  }

  return {
    attack(battle, cue) {
      if (cue.speciesId !== spriteAsset.manifest.subject_id) return;
      switchBattle(battle);
      const clip = cue.hit ? clips.attack : (clips.miss ?? clips.attack);
      if (!clip) return;
      attacks.set(cue.side, {
        clip,
        startedAt: performance.now(),
        impactAt: cue.hit ? firstImpactAt(clip) : Infinity,
        impactFired: false,
      });
      Object.assign(readout, { skill: cue.skillId, hit: String(cue.hit), side: cue.side });
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
        effectFrame: "",
      });
    },
    sprite(side, speciesId) {
      if (speciesId !== spriteAsset.manifest.subject_id) return undefined;
      const attack = attacks.get(side);
      let clip = attack?.clip;
      let frame = clip && attack && frameAt(clip, now - attack.startedAt, false);
      if (!frame) {
        clip = clips.idle;
        frame = clip && frameAt(clip, reduced ? 0 : now - idleStartedAt, clip.loop);
      } else if (reduced) {
        frame = clip?.frames[0];
      }
      if (!clip || !frame) return undefined;
      readout[`${side}Clip`] = clip.state;
      readout[`${side}Frame`] = String(frame.index);
      return paintFrame(spriteAsset, clip, frame);
    },
    overlay(ctx, layout) {
      for (const [side, attack] of attacks) {
        const { clip } = attack;
        const elapsed = now - attack.startedAt;
        const impact = reduced ? Infinity : attack.impactAt;
        if (!attack.impactFired && elapsed >= impact && elapsed < clip.duration_ms) {
          attack.impactFired = true;
          impactCount += 1;
        }
        const effectElapsed = elapsed - impact;
        if (
          effectAsset &&
          effectClip &&
          attack.impactFired &&
          !reduced &&
          Number.isFinite(effectElapsed)
        ) {
          // A loopable authoring clip can repeat while this attack is visible.
          // Non-looping bursts may finish on their own after the attack clip.
          const withinWindow = !effectClip.loop || elapsed < clip.duration_ms;
          const frame = withinWindow && frameAt(effectClip, effectElapsed, effectClip.loop);
          if (frame) {
            const target = side === "player" ? layout.foe : layout.player;
            const size = Math.min(64, layout.foe.h);
            paintFrame(effectAsset, effectClip, frame)(
              ctx,
              target.cx - size / 2,
              target.cy - size / 2,
              size,
              size,
            );
            readout.effectFrame = String(frame.index);
          }
        }
        const expires =
          attack.impactFired && effectClip && !effectClip.loop && Number.isFinite(impact)
            ? Math.max(clip.duration_ms, impact + effectClip.duration_ms)
            : clip.duration_ms;
        if (elapsed >= expires) attacks.delete(side);
      }
      report({ ...readout, impacts: String(impactCount), reduced: String(reduced) });
    },
  };
}
