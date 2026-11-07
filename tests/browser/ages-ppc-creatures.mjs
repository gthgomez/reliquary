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
  return { ...candidate, paths, atlasDigest, evidence };
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

mkdirSync(artifactDir, { recursive: true });
const { server, baseUrl } = await startStaticServer(0, { getRoot: () => resolve("dist/ages-preview") });
const evidence = { status: "PASS", candidates: [], runs: [] };
try {
  for (const candidate of candidates) {
    const save = saveFor(candidate.species, ["nip", "howl"]);
    for (const mode of ["attack", "reaction"]) {
      await withBrowser(
        async (page) => {
          await page.setViewportSize({ width: 1280, height: 800 });
          await enterTitle(page, baseUrl, save);
          await loadPackage(page, candidate);
          await beginBattle(page);
          await page.clock.runFor(220);
          const idle = await getData(page);
          assertClip(idle, "idle", `${candidate.name} idle`);
          const idleHash = await canvasHash(page);
          await page.clock.runFor(180);
          assert.notEqual(await canvasHash(page), idleHash, `${candidate.name}: idle pixels did not change`);

          if (mode === "attack") {
            await performSkill(page, "Nip", 0.5);
            const first = await getData(page);
            assertClip(first, "attack_melee", `${candidate.name} attack`);
            assert.equal(first.agesPlaybackPlayerFrame, "0");
            await page.screenshot({ path: join(artifactDir, `${candidate.name}-attack.png`) });
            await page.clock.runFor(Math.ceil(candidate.clips.attack_melee.duration_ms) + 400);
            assertClip(await getData(page), "idle", `${candidate.name} returned to idle`);
            evidence.runs.push({ candidate: candidate.name, mode, idleHash, first });
          } else {
            await performSkill(page, "Howl", 0.5);
            await page.clock.runFor(360);
            const hit = await getData(page);
            assertClip(hit, "hit", `${candidate.name} hit reaction`);
            await page.screenshot({ path: join(artifactDir, `${candidate.name}-hit.png`) });
            await page.clock.runFor(Math.ceil(candidate.clips.hit.duration_ms) + 600);
            assertClip(await getData(page), "idle", `${candidate.name} recovered to idle`);
            evidence.runs.push({ candidate: candidate.name, mode, hit });
          }
          assert.equal(await page.evaluate((key) => localStorage.getItem(key), PREVIEW_SAVE_KEY), save);
          assert.equal(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY), null);
        },
        { context: { reducedMotion: "no-preference" } },
      );
      console.log(`[ages-ppc-creatures] PASS ${candidate.name} ${mode}`);
    }
    evidence.candidates.push({
      name: candidate.name, alias: candidate.alias, subjectId: candidate.subjectId,
      packageDigest: candidate.packageDigest, direction: candidate.evidence.direction,
      bakeHitFlash: candidate.evidence.bakeHitFlash,
    });
  }
} finally {
  server.close();
}
writeFileSync(join(artifactDir, "report.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ status: evidence.status, candidates: evidence.candidates.length, runs: evidence.runs.length }));
