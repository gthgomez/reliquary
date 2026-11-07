import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeBeast } from "../../src/game/content.ts";
import { SAVE_KEY, SAVE_VERSION, WORLD_REVISION, serializeSave } from "../../src/game/save.ts";
import { startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

const fixtureDir = resolve(process.argv[2] ?? "tests/fixtures/ages-animations");
const artifactDir = resolve(process.argv[3] ?? "artifacts/browser/ages-animations");
const evidenceJson = JSON.parse(readFileSync(join(fixtureDir, "ages-evidence.json"), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const MEMBERS = ["atlas.png", "integrity.json", "provenance.json", "sprite.runtime.json"];

function packageInput(name) {
  const record = evidenceJson[name].export;
  const paths = MEMBERS.map((file) => join(fixtureDir, name, file));
  const atlasDigest = sha(readFileSync(paths[0]));
  assert.equal(atlasDigest, record.atlas_sha256, `${name}: atlas differs from AGES receipt`);
  return { paths, digest: record.package_digest, atlasDigest };
}

const packages = {
  emberkit: packageInput("emberkit"),
  mirewhelp: packageInput("mirewhelp"),
  briarling: packageInput("briarling"),
};
const effectPackage = packageInput("reliquary-effects");

const CREATURES = {
  emberkit: { strikeId: "nip", strike: "Nip", strikeEffect: "impact_melee", elementalId: "scorch", elemental: "Scorch", element: "ember", color: [232, 117, 43] },
  mirewhelp: { strikeId: "nip", strike: "Nip", strikeEffect: "impact_melee", elementalId: "torrent", elemental: "Torrent", element: "tide", color: [46, 159, 176] },
  briarling: { strikeId: "thornlash", strike: "Thornlash", strikeEffect: "impact_verdant", elementalId: "bloom", elemental: "Bloom", element: "verdant", color: [95, 163, 74] },
};

const ready = "#ages-candidate-preview";
const PREVIEW_SAVE_KEY = "ages-preview:" + SAVE_KEY;

function saveFor(species, skills, level, hp) {
  const lead = makeBeast(species, level, { random: () => 0.5 });
  lead.skills = skills;
  if (hp !== undefined) lead.hp = hp;
  const save = serializeSave({
    version: SAVE_VERSION,
    worldRevision: WORLD_REVISION,
    playerName: "Animation QA",
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
  assert.ok(save, `${species}: invalid save fixture (skills=${skills.join(",")})`);
  return save;
}

const getData = (page) => page.locator(ready).evaluate((el) => ({ ...el.dataset }));

async function loadPackage(page, slot, pkg) {
  const panel = page.locator(ready);
  await panel.locator("select[name=slot]").selectOption(slot);
  await panel.locator("input[name=digest]").fill(pkg.digest);
  await panel.locator("input[name=files]").setInputFiles(pkg.paths);
  await panel.getByRole("button", { name: "Load preview", exact: true }).click();
  await panel.locator('[data-ages-preview-status="LOADED"]').waitFor();
  assert.ok((await panel.locator(`[data-ages-preview-${slot}]`).innerText()).includes(pkg.digest));
}

async function countColor(page, [r, g, b]) {
  return page.locator(".game-canvas").evaluate(
    (canvas, rgb) => {
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === rgb[0] && data[i + 1] === rgb[1] && data[i + 2] === rgb[2] && data[i + 3] === 255)
          count++;
      }
      return count;
    },
    [r, g, b],
  );
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

function assertClip(state, side, clip, label) {
  assert.equal(state[`agesPlayback${side}Clip`], clip, `${label}: ${JSON.stringify(state)}`);
}

mkdirSync(artifactDir, { recursive: true });
const { server, baseUrl } = await startStaticServer(0, {
  getRoot: () => resolve("dist/ages-preview"),
});
const revision = spawnSync("git", ["rev-parse", "HEAD", "HEAD^{tree}"], { encoding: "utf8" });
const [commit, tree] = revision.stdout?.trim().split(/\s+/) ?? [];
const evidence = {
  status: "PASS",
  reliquaryCommit: revision.status === 0 ? commit : null,
  reliquaryTree: revision.status === 0 ? tree : null,
  packages: Object.fromEntries(
    Object.entries({ ...packages, "reliquary-effects": effectPackage }).map(([k, v]) => [
      k,
      { digest: v.digest, atlasDigest: v.atlasDigest },
    ]),
  ),
  runs: [],
};

const runs = [];
for (const [species, config] of Object.entries(CREATURES)) {
  const skills = [config.strikeId, config.elementalId, "howl"];
  const viewport = { width: 1280, height: 800 };
  runs.push(
    { name: `${species}-melee`, species, config, kind: "melee", viewport, save: saveFor(species, skills, 30), color: config.color },
    { name: `${species}-elemental`, species, config, kind: "elemental", viewport, save: saveFor(species, skills, 30), color: config.color },
    { name: `${species}-reaction`, species, config, kind: "reaction", viewport, save: saveFor(species, skills, 30), color: config.color },
    { name: `${species}-faint`, species, config, kind: "faint", viewport, save: saveFor(species, skills, 5, 1), color: config.color },
  );
}
runs.push(
  { name: "emberkit-elemental-mobile", species: "emberkit", config: CREATURES.emberkit, kind: "elemental", viewport: { width: 390, height: 844 }, save: saveFor("emberkit", ["nip", "scorch", "howl"], 30), color: CREATURES.emberkit.color },
  { name: "emberkit-elemental-small", species: "emberkit", config: CREATURES.emberkit, kind: "elemental", viewport: { width: 320, height: 568 }, save: saveFor("emberkit", ["nip", "scorch", "howl"], 30), color: CREATURES.emberkit.color },
  { name: "emberkit-elemental-short", species: "emberkit", config: CREATURES.emberkit, kind: "elemental", viewport: { width: 640, height: 320 }, save: saveFor("emberkit", ["nip", "scorch", "howl"], 30), color: CREATURES.emberkit.color },
  { name: "emberkit-elemental-reduced", species: "emberkit", config: CREATURES.emberkit, kind: "elemental", viewport: { width: 390, height: 844 }, save: saveFor("emberkit", ["nip", "scorch", "howl"], 30), color: CREATURES.emberkit.color, reduced: true },
);

try {
  for (const run of runs) {
    await withBrowser(
      async (page) => {
        await page.setViewportSize(run.viewport);
        await enterTitle(page, baseUrl, run.save);
        await loadPackage(page, "creature", packages[run.species]);
        await loadPackage(page, "effect", effectPackage);
        await beginBattle(page);
        await page.clock.runFor(220);

        const idle = await getData(page);
        assertClip(idle, "Player", "idle", `${run.name} idle`);
        const idlePixels = await countColor(page, run.color);
        assert.ok(idlePixels > 100, `${run.name}: creature not visible (${idlePixels} px)`);
        await page.screenshot({ path: join(artifactDir, `${run.name}-idle.png`) });

        let observed = {};
        if (run.kind === "melee") {
          await performSkill(page, run.config.strike, 0.5);
          const first = await getData(page);
          assertClip(first, "Player", "attack_melee", `${run.name} melee frame 0`);
          assert.equal(first.agesPlaybackPlayerFrame, "0");
          assert.equal(first.agesPlaybackImpacts, "0");
          await page.screenshot({ path: join(artifactDir, `${run.name}-attack.png`) });
          await page.clock.runFor(220);
          const impact = await getData(page);
          assert.equal(impact.agesPlaybackImpacts, "1", JSON.stringify(impact));
          assert.equal(impact.agesPlaybackEffectClip, run.config.strikeEffect);
          assert.notEqual(impact.agesPlaybackEffectFrame, "");
          await page.screenshot({ path: join(artifactDir, `${run.name}-impact.png`) });
          observed = { first, impact };
        } else if (run.kind === "elemental") {
          await performSkill(page, run.config.elemental, 0.5);
          const first = await getData(page);
          assertClip(first, "Player", "attack_elemental", `${run.name} elemental frame 0`);
          assert.equal(first.agesPlaybackPlayerFrame, "0");
          assert.equal(first.agesPlaybackImpacts, "0");
          await page.screenshot({ path: join(artifactDir, `${run.name}-charge.png`) });
          await page.clock.runFor(400);
          const impact = await getData(page);
          if (run.reduced) {
            assert.equal(impact.agesPlaybackPlayerFrame, "0");
            assert.equal(impact.agesPlaybackImpacts, "0");
            assert.equal(impact.agesPlaybackEffectFrame, "");
          } else {
            assert.equal(impact.agesPlaybackImpacts, "1", JSON.stringify(impact));
            assert.equal(impact.agesPlaybackEffectClip, `impact_${run.config.element}`);
            assert.notEqual(impact.agesPlaybackEffectFrame, "");
          }
          await page.screenshot({ path: join(artifactDir, `${run.name}-impact.png`) });
          observed = { first, impact };
        } else if (run.kind === "reaction") {
          await performSkill(page, "Howl", 0.5);
          await page.clock.runFor(340);
          const state = await getData(page);
          assertClip(state, "Player", "hit", `${run.name} reaction`);
          await page.screenshot({ path: join(artifactDir, `${run.name}-reaction.png`) });
          observed = { state };
        } else if (run.kind === "faint") {
          await performSkill(page, "Howl", 0);
          await page.clock.runFor(200);
          const state = await getData(page);
          assertClip(state, "Player", "faint", `${run.name} faint`);
          await page.screenshot({ path: join(artifactDir, `${run.name}-faint.png`) });
          observed = { state };
        }

        assert.equal(
          await page.evaluate((key) => localStorage.getItem(key), PREVIEW_SAVE_KEY),
          run.save,
        );
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY), null);
        evidence.runs.push({ name: run.name, kind: run.kind, idlePixels, observed });
      },
      { context: { reducedMotion: run.reduced ? "reduce" : "no-preference" } },
    );
    console.log(`[ages-animations] PASS ${run.name}`);
  }
} finally {
  server.close();
}
writeFileSync(join(artifactDir, "report.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ status: evidence.status, runs: evidence.runs.length, artifactDir }));
