import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attackKindClass,
  createBattlePreview,
  firstImpactAt,
  frameAt,
  REACTION_DELAY_MS,
  FAINT_DELAY_MS,
  resolveAttackClip,
  resolveEffectClip,
  resolveFaintClip,
  resolveReactionClip,
  type PreviewAsset,
} from "./battle-preview.ts";
import type { BattleLayout } from "../render/battle-scene.ts";
import type { BattleState } from "../types.ts";
import type { PreviewAnimation } from "./runtime-package.ts";

const clip: PreviewAnimation = {
  state: "attack",
  loop: false,
  fps: 7.41,
  duration_ms: 270,
  review_disposition: "UNREVIEWED",
  logical_pivot: [16, 29],
  gameplay_root: [16, 29],
  events: [
    { name: "impact", frame: 1 },
    { name: "impact", frame: 1 },
  ],
  frames: [120, 150].map((duration_ms, index) => ({
    index,
    x: index * 32,
    y: 0,
    w: 32,
    h: 32,
    duration_ms,
    offset_x: 0,
    offset_y: 0,
  })),
};

test("samples unequal frame durations and observes the non-looping boundary", () => {
  assert.equal(frameAt(clip, 119, false)?.index, 0);
  assert.equal(frameAt(clip, 120, false)?.index, 1);
  assert.equal(frameAt(clip, 269, false)?.index, 1);
  assert.equal(frameAt(clip, 270, false), undefined);
  assert.equal(frameAt(clip, 270, true)?.index, 0);
});

test("resolves repeated impact markers to the first frame boundary", () => {
  assert.equal(firstImpactAt(clip), 120);
});

function animation(state: string, frames = 2, loop = false): PreviewAnimation {
  return {
    state,
    loop,
    fps: 10,
    duration_ms: frames * 100,
    review_disposition: "UNREVIEWED",
    logical_pivot: [16, 29],
    gameplay_root: [16, 29],
    events: [{ name: "impact", frame: 1 }],
    frames: Array.from({ length: frames }, (_, index) => ({
      index,
      x: index * 32,
      y: 0,
      w: 32,
      h: 32,
      duration_ms: 100,
      offset_x: 0,
      offset_y: 0,
    })),
  };
}

function animationWithImpact(state: string, frames: number, impactFrame: number): PreviewAnimation {
  const clip = animation(state, frames);
  clip.events = [{ name: "impact", frame: impactFrame }];
  return clip;
}

function previewAsset(
  animations: Record<string, PreviewAnimation>,
  subject = "emberkit",
): PreviewAsset {
  return {
    digest: "0".repeat(64),
    candidateId: "candidate",
    manifest: {
      schema_version: "1.7.0",
      asset_id: subject,
      subject_id: subject,
      direction: "south",
      runtime_status: "PREVIEW_ONLY",
      atlas: { file: "atlas.png", width: 64, height: 32, sha256: "0".repeat(64) },
      cell_dimensions: [32, 32],
      animations,
    },
    image: { width: 64, height: 32, close() {} },
  } as unknown as PreviewAsset;
}

function layoutFixture(): BattleLayout {
  return {
    uiReserveTop: 200,
    uiReserveSource: "estimate",
    foe: { x: 100, y: 20, w: 100, h: 40, cx: 150, cy: 40 },
    player: { cx: 80, cy: 300, size: 120, scale: 0.7 },
  } as BattleLayout;
}

function recordingContext(): { ctx: CanvasRenderingContext2D; draws: unknown[][] } {
  const draws: unknown[][] = [];
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    drawImage(...args: unknown[]) {
      draws.push(args);
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, draws };
}

test("maps skill kinds to melee/elemental classes", () => {
  assert.equal(attackKindClass("strike"), "melee");
  assert.equal(attackKindClass(undefined), "melee");
  assert.equal(attackKindClass("spell"), "elemental");
  assert.equal(attackKindClass("hex"), "elemental");
  assert.equal(attackKindClass("heal"), "elemental");
});

test("selects kind, element, then historical attack clips", () => {
  const clips = {
    idle: animation("idle", 2, true),
    attack: animation("attack"),
    attack_melee: animation("attack_melee", 5),
    attack_elemental: animation("attack_elemental", 5),
    attack_ember: animation("attack_ember", 5),
    miss: animation("miss"),
  };
  assert.equal(resolveAttackClip(clips, { hit: true, kind: "strike" })?.state, "attack_melee");
  assert.equal(resolveAttackClip(clips, { hit: true, kind: "spell" })?.state, "attack_elemental");
  assert.equal(
    resolveAttackClip(clips, { hit: true, kind: "hex", element: "tide" })?.state,
    "attack_elemental",
  );
  assert.equal(resolveAttackClip(clips, { hit: false, kind: "strike" })?.state, "miss");
  const legacy = { idle: animation("idle", 2, true), attack: animation("attack") };
  assert.equal(resolveAttackClip(legacy, { hit: true, kind: "spell" })?.state, "attack");
  assert.equal(resolveAttackClip(legacy, { hit: false, kind: "strike" })?.state, "attack");
});

test("selects element-aware impact effects with a generic fallback", () => {
  const clips = {
    impact: animation("impact", 3),
    impact_ember: animation("impact_ember", 4),
    impact_melee: animation("impact_melee", 3),
  };
  assert.equal(resolveEffectClip(clips, { kind: "hex", element: "ember" })?.state, "impact_ember");
  assert.equal(resolveEffectClip(clips, { kind: "strike", element: "steel" })?.state, "impact_melee");
  assert.equal(
    resolveEffectClip({ impact: clips.impact }, { kind: "spell", element: "tide" })?.state,
    "impact",
  );
});

test("resolves reaction and faint clip aliases", () => {
  assert.equal(resolveReactionClip({ hit: animation("hit") })?.state, "hit");
  assert.equal(resolveReactionClip({ stagger: animation("stagger") })?.state, "stagger");
  assert.equal(resolveReactionClip({}), undefined);
  assert.equal(resolveFaintClip({ faint: animation("faint") })?.state, "faint");
  assert.equal(resolveFaintClip({ defeat: animation("defeat") })?.state, "defeat");
  assert.equal(resolveFaintClip({}), undefined);
});

test("plays a one-shot faint clip after the impact delay and holds it", async () => {
  let report: Record<string, string> = {};
  const battle = {} as BattleState;
  const view = createBattlePreview(
    previewAsset({
      idle: animation("idle", 2, true),
      attack: animation("attack"),
      faint: animation("faint", 3),
    }),
    null,
    (data) => {
      report = data;
    },
  );
  view.beginFrame(battle, false);
  view.faint("foe", "emberkit");
  assert.equal(view.faintVisible("foe", "emberkit"), true);
  assert.equal(view.faintVisible("foe", "gutterrat"), false);
  assert.equal(view.faintVisible("player", "emberkit"), false);
  const { ctx, draws } = recordingContext();
  const early = view.sprite("foe", "emberkit");
  assert.ok(early);
  view.overlay(ctx, layoutFixture());
  assert.notEqual(report.foeClip, "faint");
  await new Promise((resolve) => setTimeout(resolve, FAINT_DELAY_MS + 40));
  view.beginFrame(battle, false);
  const paint = view.sprite("foe", "emberkit");
  assert.ok(paint);
  paint(ctx, 0, 0, 32, 32);
  view.overlay(ctx, layoutFixture());
  assert.equal(report.foeClip, "faint");
  assert.equal(report.foeFrame, "0");
  assert.equal(draws.length, 1);
});

test("a hit on the subject plays a reaction after the attacker clip", async () => {
  let report: Record<string, string> = {};
  const battle = {} as BattleState;
  const view = createBattlePreview(
    previewAsset({
      idle: animation("idle", 2, true),
      attack_melee: animation("attack_melee", 5),
      hit: animation("hit", 3),
    }),
    null,
    (data) => {
      report = data;
    },
  );
  view.beginFrame(battle, false);
  view.attack(battle, {
    skillId: "nip",
    side: "foe",
    speciesId: "gutterrat",
    hit: true,
    targetSide: "player",
    targetSpeciesId: "emberkit",
    kind: "strike",
    element: "steel",
  });
  await new Promise((resolve) => setTimeout(resolve, REACTION_DELAY_MS + 40));
  view.beginFrame(battle, false);
  view.sprite("player", "emberkit");
  view.overlay(recordingContext().ctx, layoutFixture());
  assert.equal(report.playerClip, "hit");
});

test("a defender reaction follows the real elemental impact marker", async () => {
  let report: Record<string, string> = {};
  const battle = {} as BattleState;
  const view = createBattlePreview(
    previewAsset({
      idle: animation("idle", 2, true),
      attack_elemental: animationWithImpact("attack_elemental", 6, 3),
      hit: animation("hit", 3),
    }),
    null,
    (data) => {
      report = data;
    },
  );
  view.beginFrame(battle, false);
  view.attack(battle, {
    skillId: "cinder",
    side: "player",
    speciesId: "emberkit",
    hit: true,
    targetSide: "foe",
    targetSpeciesId: "emberkit",
    kind: "spell",
    element: "ember",
  });
  // Impact marker is on frame 3 => 300 ms; a fixed 240 ms reaction would be early.
  await new Promise((resolve) => setTimeout(resolve, 240));
  view.beginFrame(battle, false);
  view.sprite("foe", "emberkit");
  view.overlay(recordingContext().ctx, layoutFixture());
  assert.notEqual(report.foeClip, "hit");
  await new Promise((resolve) => setTimeout(resolve, 120));
  view.beginFrame(battle, false);
  view.sprite("foe", "emberkit");
  view.overlay(recordingContext().ctx, layoutFixture());
  assert.equal(report.foeClip, "hit");
});

test("a defeat pose waits for the attacker's impact marker", async () => {
  let report: Record<string, string> = {};
  const battle = {} as BattleState;
  const view = createBattlePreview(
    previewAsset({
      idle: animation("idle", 2, true),
      attack_elemental: animationWithImpact("attack_elemental", 6, 3),
      faint: animation("faint", 3),
    }),
    null,
    (data) => {
      report = data;
    },
  );
  view.beginFrame(battle, false);
  view.attack(battle, {
    skillId: "cinder",
    side: "player",
    speciesId: "emberkit",
    hit: true,
    targetSide: "foe",
    targetSpeciesId: "emberkit",
    kind: "spell",
    element: "ember",
  });
  view.faint("foe", "emberkit");
  assert.equal(view.faintVisible("foe", "emberkit"), true);
  await new Promise((resolve) => setTimeout(resolve, 240));
  view.beginFrame(battle, false);
  view.sprite("foe", "emberkit");
  view.overlay(recordingContext().ctx, layoutFixture());
  assert.notEqual(report.foeClip, "faint");
  await new Promise((resolve) => setTimeout(resolve, 120));
  view.beginFrame(battle, false);
  view.sprite("foe", "emberkit");
  view.overlay(recordingContext().ctx, layoutFixture());
  assert.equal(report.foeClip, "faint");
});

test("applies the element-matched effect when a hit lands", async () => {
  let report: Record<string, string> = {};
  const battle = {} as BattleState;
  const effect = previewAsset(
    { impact: animation("impact", 3), impact_ember: animation("impact_ember", 4) },
    "fx",
  );
  const view = createBattlePreview(
    previewAsset({
      idle: animation("idle", 2, true),
      attack_elemental: animation("attack_elemental", 2),
    }),
    effect,
    (data) => {
      report = data;
    },
  );
  view.beginFrame(battle, false);
  view.attack(battle, {
    skillId: "cinder",
    side: "player",
    speciesId: "emberkit",
    hit: true,
    targetSide: "foe",
    targetSpeciesId: "gutterrat",
    kind: "spell",
    element: "ember",
  });
  await new Promise((resolve) => setTimeout(resolve, 140));
  view.beginFrame(battle, false);
  view.overlay(recordingContext().ctx, layoutFixture());
  assert.equal(report.effectClip, "impact_ember");
});
