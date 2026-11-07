import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeBeast } from "../../src/game/content.ts";
import { SAVE_KEY, SAVE_VERSION, WORLD_REVISION, serializeSave } from "../../src/game/save.ts";
import { startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

const fixtureDir = resolve(process.argv[2] ?? "tests/fixtures/ages-ppc");
const artifactDir = resolve(process.argv[3] ?? "artifacts/browser/ages-ppc-creatures");
const manifest = JSON.parse(readFileSync(join(fixtureDir, "candidates.json"), "utf8"));
const MEMBERS = ["atlas.png", "integrity.json", "provenance.json", "sprite.runtime.json"];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ready = "#ages-candidate-preview";
const PREVIEW_SAVE_KEY = "ages-preview:" + SAVE_KEY;

const candidates = manifest.candidates.map((candidate) => {
  const paths = MEMBERS.map((file) => join(fixtureDir, candidate.dir, file));
  const atlasDigest = sha(readFileSync(paths[0]));
  assert.equal(atlasDigest, candidate.atlasSha256, `${candidate.name}: atlas differs from evidence`);
  const evidence = JSON.parse(readFileSync(join(fixtureDir, candidate.dir, "ages-evidence.json"), "utf8"));
  assert.equal(evidence.direction, "east", `${candidate.name}: stale direction`);
  // The authored impact marker must survive runtime export, or impact timing is
  // not actually verified for this candidate.
  const runtime = JSON.parse(readFileSync(paths[3], "utf8"));
  const attack = runtime.animations?.attack_melee;
  assert.ok(attack, `${candidate.name}: missing attack_melee`);
  const impact = (attack.events ?? []).filter((event) => event.name === "impact");
  assert.equal(impact.length, 1, `${candidate.name}: expected one authored impact event`);
  return { ...candidate, paths, atlasDigest, evidence, runtime, impactFrame: impact[0].frame };
});

function saveFor(species, skills) {
  const lead = makeBeast(species, 30, { random: () => 0.5 });
  lead.skills = skills;
  const save = serializeSave({
    version: SAVE_VERSION,
    worldRevision: WORLD_REVISION,
    playerName: "PPC Curated QA",
    mapId: "elderhall",
    x: 12,
    y: 14,
    dir: 0,
    gold: 180,
    playTime: 0,
    party: [lead],
    box: [],
    inventory: {},
    flags: { starter: true },
    seen: { [species]: true },
    caught: { [species]: true },
  });
  assert.ok(save, "curated PPC preview requires a valid save fixture");
  return save;
}

const getData = (page) => page.locator(ready).evaluate((el) => ({ ...el.dataset }));

async function loadPackage(page, candidate) {
  const panel = page.locator(ready);
  await panel.locator("select[name=slot]").selectOption("creature");
  await panel.locator("input[name=digest]").fill(candidate.packageDigest);
  await panel.locator("input[name=species]").fill(candidate.alias);
  await panel.locator("input[name=files]").setInputFiles(candidate.paths);
  await panel.getByRole("button", { name: "Load preview", exact: true }).click();
  await panel.locator('[data-ages-preview-status="LOADED"]').waitFor();
  assert.ok((await panel.locator("[data-ages-preview-creature]").innerText()).includes(candidate.packageDigest));
}

async function enterTitle(page, baseUrl, save) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
      Math.random = () => 0.5;
    },
    { key: PREVIEW_SAVE_KEY, value: save },
  );
  await page.clock.install();
  await page.goto(baseUrl + "?ages-preview=1", { waitUntil: "networkidle" });
  await waitForGameBoot(page);
  await page.locator(ready).waitFor();
  await page.locator(ready + " summary").click();
}

async function beginBattle(page) {
  await page.locator(ready + " summary").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.evaluate(() => window.__controlsTest.startWild());
  await page.locator('.battle-controls[data-battle-phase="command"]').waitFor();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50);
}

async function performSkill(page, skill, random) {
  await page.getByRole("button", { name: "Skill", exact: true }).click();
  const button = page.getByRole("button", { name: new RegExp(skill) });
  await button.waitFor();
  await button.evaluate((element, value) => {
    Math.random = () => value;
    element.click();
  }, random);
  await page.clock.runFor(64);
}

async function canvasHash(page) {
  return page.locator(".game-canvas").evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < data.length; i += 4) {
      hash ^= data[i];
      hash = Math.imul(hash, 16777619) >>> 0;
      hash ^= data[i + 1];
      hash = Math.imul(hash, 16777619) >>> 0;
      hash ^= data[i + 3];
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash;
  });
}

function assertClip(state, clip, label) {
  assert.equal(state.agesPlaybackPlayerClip, clip, `${label}: ${JSON.stringify(state)}`);
}

// Step the deterministic clock and collect the per-frame playback evidence.
async function watchAttack(page, candidate) {
  const duration = Math.ceil(candidate.clips.attack_melee.duration_ms);
  const step = Math.max(40, Math.floor(duration / Math.max(2, candidate.runtime.animations.attack_melee.frames.length)));
  const seenFrames = new Set();
  let maxImpacts = 0;
  let sawEffect = false;
  let sawFoeReaction = false;
  const hashes = new Set();
  for (let elapsed = 0; elapsed <= duration + 240; elapsed += step) {
    const data = await getData(page);
    if (data.agesPlaybackPlayerClip === "attack_melee") {
      seenFrames.add(data.agesPlaybackPlayerFrame);
      hashes.add(await canvasHash(page));
    }
    maxImpacts = Math.max(maxImpacts, Number(data.agesPlaybackImpacts ?? 0));
    if (data.agesPlaybackEffectClip) sawEffect = true;
    if (data.agesPlaybackFoeClip && data.agesPlaybackFoeClip !== "idle") sawFoeReaction = true;
    await page.clock.runFor(step);
  }
  return { duration, seenFrames: [...seenFrames].sort((a, b) => a - b), hashes: [...hashes], maxImpacts, sawEffect, sawFoeReaction };
}

async function assertSaveIsolation(page, save) {
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), PREVIEW_SAVE_KEY), save);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY), null);
}

async function runAttack(page, candidate, save, { screenshot, reduced = false, tag = "" } = {}) {
  await enterTitle(page, baseUrl, save);
  await loadPackage(page, candidate);
  await beginBattle(page);
  await page.clock.runFor(220);
  const idle = await getData(page);
  assertClip(idle, "idle", `${candidate.name}${tag} idle`);
  if (reduced) assert.equal(idle.agesPlaybackReduced, "true", `${candidate.name}${tag}: reduced flag`);
  const idleHash = await canvasHash(page);
  await page.clock.runFor(180);
  assert.notEqual(await canvasHash(page), idleHash, `${candidate.name}${tag}: idle pixels did not change`);

  await performSkill(page, "Nip", 0.5);
  const first = await getData(page);
  assertClip(first, "attack_melee", `${candidate.name}${tag} attack`);
  const watched = await watchAttack(page, candidate);
  if (!reduced) {
    // Reduced-motion presentation may hold a static pose; full motion must show
    // multiple distinct attack frames.
    assert.ok(watched.seenFrames.length >= 2, `${candidate.name}${tag}: attack showed ${watched.seenFrames.length} distinct frames`);
    // The authored impact marker must actually fire, exactly once per attack.
    assert.ok(watched.maxImpacts >= 1, `${candidate.name}${tag}: impact marker never fired`);
    assert.ok(watched.maxImpacts <= 1, `${candidate.name}${tag}: impact fired ${watched.maxImpacts} times`);
  } else {
    // Reduced motion still plays the clip but suppresses impact effects.
    assertClip(first, "attack_melee", `${candidate.name}${tag} attack`);
    assert.equal(watched.maxImpacts, 0, `${candidate.name}${tag}: reduced motion fired an impact effect`);
  }
  if (screenshot) await page.screenshot({ path: join(artifactDir, `${candidate.name}${tag}-attack.png`) });
  await page.clock.runFor(400);
  assertClip(await getData(page), "idle", `${candidate.name}${tag} recovered to idle`);
  await assertSaveIsolation(page, save);
  return { idleHash, first, ...watched };
}

async function runReaction(page, candidate, save) {
  await enterTitle(page, baseUrl, save);
  await loadPackage(page, candidate);
  await beginBattle(page);
  await page.clock.runFor(220);
  await performSkill(page, "Howl", 0.5);
  const frames = new Set();
  const duration = Math.ceil(candidate.clips.hit.duration_ms);
  const step = Math.max(40, Math.floor(duration / 6));
  for (let elapsed = 0; elapsed <= duration + 300; elapsed += step) {
    const data = await getData(page);
    if (data.agesPlaybackPlayerClip === "hit") frames.add(data.agesPlaybackPlayerFrame);
    await page.clock.runFor(step);
  }
  assert.ok(frames.size >= 1, `${candidate.name}: hit reaction never played`);
  await page.screenshot({ path: join(artifactDir, `${candidate.name}-hit.png`) });
  await assertSaveIsolation(page, save);
  return [...frames];
}

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile-portrait", width: 390, height: 844 },
  { name: "short-landscape", width: 844, height: 390 },
];

mkdirSync(artifactDir, { recursive: true });
const { server, baseUrl } = await startStaticServer(0, { getRoot: () => resolve("dist/ages-preview") });
const evidence = { status: "PASS", candidates: [], runs: [] };
try {
  for (const candidate of candidates) {
    const save = saveFor(candidate.species, ["nip", "howl"]);
    // 1. Full attack on desktop, with screenshots and impact/multi-frame proof.
    await withBrowser(
      async (page) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        const result = await runAttack(page, candidate, save, { screenshot: true });
        evidence.runs.push({ candidate: candidate.name, mode: "attack", viewport: "desktop", ...result, first: undefined, idleHash: undefined });
      },
      { context: { reducedMotion: "no-preference" } },
    );
    console.log(`[ages-ppc-creatures] PASS ${candidate.name} attack desktop`);

    // 2. Defender hit reaction.
    await withBrowser(
      async (page) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        const frames = await runReaction(page, candidate, save);
        evidence.runs.push({ candidate: candidate.name, mode: "reaction", viewport: "desktop", frames });
      },
      { context: { reducedMotion: "no-preference" } },
    );
    console.log(`[ages-ppc-creatures] PASS ${candidate.name} reaction`);

    // 3. Reduced motion: the clip still plays, effects are suppressed, recovery works.
    await withBrowser(
      async (page) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        const result = await runAttack(page, candidate, save, { reduced: true, tag: "-reduced", screenshot: true });
        evidence.runs.push({ candidate: candidate.name, mode: "attack-reduced", viewport: "desktop", ...result, first: undefined, idleHash: undefined });
      },
      { context: { reducedMotion: "reduce" } },
    );
    console.log(`[ages-ppc-creatures] PASS ${candidate.name} reduced-motion`);

    // 4. Viewports: mobile portrait and short landscape.
    for (const viewport of VIEWPORTS.slice(1)) {
      await withBrowser(
        async (page) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          const result = await runAttack(page, candidate, save, { tag: `-${viewport.name}`, screenshot: true });
          evidence.runs.push({ candidate: candidate.name, mode: "attack", viewport: viewport.name, ...result, first: undefined, idleHash: undefined });
        },
        { context: { reducedMotion: "no-preference" } },
      );
      console.log(`[ages-ppc-creatures] PASS ${candidate.name} ${viewport.name}`);
    }

    evidence.candidates.push({
      name: candidate.name, alias: candidate.alias, subjectId: candidate.subjectId,
      packageDigest: candidate.packageDigest, direction: candidate.evidence.direction,
      bakeHitFlash: candidate.evidence.bakeHitFlash, impactFrame: candidate.impactFrame,
    });
  }
} finally {
  server.close();
}
writeFileSync(join(artifactDir, "report.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ status: evidence.status, candidates: evidence.candidates.length, runs: evidence.runs.length }));
