import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeBeast } from "../../src/game/content.ts";
import { SAVE_KEY, SAVE_VERSION, WORLD_REVISION, serializeSave } from "../../src/game/save.ts";
import { startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

const fixtureDir = resolve(process.argv[2] ?? "tests/fixtures/ages-ppc");
const artifactDir = resolve(process.argv[3] ?? "artifacts/browser/ages-ppc");
const evidenceJson = JSON.parse(readFileSync(join(fixtureDir, "ages-evidence.json"), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const MEMBERS = ["atlas.png", "integrity.json", "provenance.json", "sprite.runtime.json"];
const fixtureName = "amorphous-424242";
const paths = MEMBERS.map((file) => join(fixtureDir, fixtureName, file));
const atlasDigest = sha(readFileSync(paths[0]));
assert.equal(atlasDigest, evidenceJson.package.atlasSha256, "Atlas differs from the export receipt");
const creature = { paths, digest: evidenceJson.package.packageDigest, atlasDigest };
const ALIAS = "dewslime";

const ready = "#ages-candidate-preview";
const PREVIEW_SAVE_KEY = "ages-preview:" + SAVE_KEY;

function saveFor(level, skills) {
  const lead = makeBeast("dewslime", level, { random: () => 0.5 });
  lead.skills = skills;
  const save = serializeSave({
    version: SAVE_VERSION,
    worldRevision: WORLD_REVISION,
    playerName: "PPC Preview QA",
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
    seen: { dewslime: true },
    caught: { dewslime: true },
  });
  assert.ok(save, "PPC preview requires a valid real save schema fixture");
  return save;
}

const getData = (page) => page.locator(ready).evaluate((el) => ({ ...el.dataset }));

async function loadPackage(page, pkg) {
  const panel = page.locator(ready);
  await panel.locator("select[name=slot]").selectOption("creature");
  await panel.locator("input[name=digest]").fill(pkg.digest);
  await panel.locator("input[name=species]").fill(ALIAS);
  await panel.locator("input[name=files]").setInputFiles(pkg.paths);
  await panel.getByRole("button", { name: "Load preview", exact: true }).click();
  await panel.locator('[data-ages-preview-status="LOADED"]').waitFor();
  assert.ok((await panel.locator("[data-ages-preview-creature]").innerText()).includes(pkg.digest));
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
const revision = spawnSync("git", ["rev-parse", "HEAD", "HEAD^{tree}"], { encoding: "utf8" });
const [commit, tree] = revision.stdout?.trim().split(/\s+/) ?? [];
const evidence = {
  status: "PASS",
  reliquaryCommit: revision.status === 0 ? commit : null,
  reliquaryTree: revision.status === 0 ? tree : null,
  backend: evidenceJson.backend,
  upstreamCommit: evidenceJson.upstreamCommit,
  experimental: evidenceJson.experimental,
  package: evidenceJson.package,
  genome: evidenceJson.genome,
  alias: ALIAS,
  runs: [],
};

const runs = [
  { name: "ppc-attack", kind: "attack", viewport: { width: 1280, height: 800 }, save: saveFor(30, ["nip", "howl"]) },
  { name: "ppc-reaction", kind: "reaction", viewport: { width: 1280, height: 800 }, save: saveFor(30, ["howl"]) },
  { name: "ppc-reduced", kind: "reduced", viewport: { width: 390, height: 844 }, save: saveFor(30, ["nip", "howl"]), reduced: true },
];

try {
  for (const run of runs) {
    await withBrowser(
      async (page) => {
        await page.setViewportSize(run.viewport);
        await enterTitle(page, baseUrl, run.save);
        await loadPackage(page, creature);
        await beginBattle(page);
        await page.clock.runFor(220);

        const idle = await getData(page);
        assertClip(idle, "idle", `${run.name} idle`);
        const idleHash = await canvasHash(page);
        await page.screenshot({ path: join(artifactDir, `${run.name}-idle.png`) });
        await page.clock.runFor(180);
        const idleLaterHash = await canvasHash(page);
        assert.notEqual(idleLaterHash, idleHash, `${run.name}: idle frames did not change pixels`);

        let observed = {};
        if (run.kind === "attack") {
          await performSkill(page, "Nip", 0.5);
          const first = await getData(page);
          assertClip(first, "attack_melee", `${run.name} attack frame 0`);
          assert.equal(first.agesPlaybackPlayerFrame, "0");
          await page.screenshot({ path: join(artifactDir, `${run.name}-attack.png`) });
          await page.clock.runFor(1600);
          const settled = await getData(page);
          assertClip(settled, "idle", `${run.name} returned to idle`);
          observed = { first, settled };
        } else if (run.kind === "reaction") {
          await performSkill(page, "Howl", 0.5);
          await page.clock.runFor(340);
          const hit = await getData(page);
          assertClip(hit, "hit", `${run.name} hit reaction`);
          await page.screenshot({ path: join(artifactDir, `${run.name}-hit.png`) });
          await page.clock.runFor(600);
          const settled = await getData(page);
          assertClip(settled, "idle", `${run.name} recovered to idle`);
          observed = { hit, settled };
        } else {
          await performSkill(page, "Nip", 0.5);
          await page.clock.runFor(300);
          const held = await getData(page);
          assertClip(held, "attack_melee", `${run.name} reduced-motion clip`);
          assert.equal(held.agesPlaybackPlayerFrame, "0");
          await page.screenshot({ path: join(artifactDir, `${run.name}-held.png`) });
          observed = { held };
        }

        assert.equal(await page.evaluate((key) => localStorage.getItem(key), PREVIEW_SAVE_KEY), run.save);
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY), null);
        evidence.runs.push({ name: run.name, kind: run.kind, idleHash, idleLaterHash, observed });
      },
      { context: { reducedMotion: run.reduced ? "reduce" : "no-preference" } },
    );
    console.log(`[ages-ppc] PASS ${run.name}`);
  }
} finally {
  server.close();
}
writeFileSync(join(artifactDir, "report.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ status: evidence.status, runs: evidence.runs.length, artifactDir }));
