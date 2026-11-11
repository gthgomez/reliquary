import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeBeast } from "../../src/game/content.ts";
import { SAVE_KEY, SAVE_VERSION, WORLD_REVISION, serializeSave } from "../../src/game/save.ts";
import { startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

const fixtureDir = process.argv[2] && resolve(process.argv[2]);
const artifactDir = resolve(process.argv[3] ?? "artifacts/browser/ages-preview");
if (!fixtureDir) {
  console.error(
    "Usage: node tests/browser/ages-preview.mjs AGES_FIXTURE_DIRECTORY [EVIDENCE_DIRECTORY]",
  );
  process.exit(2);
}
const agesEvidence = JSON.parse(readFileSync(join(fixtureDir, "ages-evidence.json"), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = ["atlas.png", "integrity.json", "provenance.json", "sprite.runtime.json"];

function packageInput(name, record) {
  const paths = files.map((file) => join(fixtureDir, name, file));
  const atlasDigest = sha(readFileSync(paths[0]));
  assert.equal(
    atlasDigest,
    record.atlas_sha256,
    "Fixture atlas disagrees with the AGES export receipt",
  );
  return { paths, digest: record.package_digest, atlasDigest };
}

const creature = packageInput("emberkit", agesEvidence.sprite.export);
const effect = packageInput("fixture-impact", agesEvidence.effect.export);
const lead = makeBeast("emberkit", 5, { random: () => 0.5 });
lead.skills = ["nip", "scorch"];
const save = serializeSave({
  version: SAVE_VERSION,
  worldRevision: WORLD_REVISION,
  playerName: "Preview Fixture",
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
  seen: { emberkit: true },
  caught: { emberkit: true },
});
assert.ok(save, "Synthetic battle requires a valid real save schema fixture");

const colors = {
  green: [0, 255, 0],
  magenta: [255, 0, 255],
  cyan: [0, 255, 255],
  yellow: [255, 255, 0],
};
const ready = "#ages-candidate-preview";
const PREVIEW_SAVE_KEY = "ages-preview:" + SAVE_KEY;
const getData = (page) => page.locator(ready).evaluate((element) => ({ ...element.dataset }));

async function loadPackage(page, slot, pkg, code = "LOADED") {
  const panel = page.locator(ready);
  await panel.locator("select[name=slot]").selectOption(slot);
  await panel.locator("input[name=digest]").fill(pkg.digest);
  await panel.locator("input[name=files]").setInputFiles(pkg.paths);
  await panel.getByRole("button", { name: "Load preview", exact: true }).click();
  await panel.locator(`[data-ages-preview-status="${code}"]`).waitFor();
  if (code === "LOADED") {
    assert.ok(
      (await panel.locator(`[data-ages-preview-${slot}]`).innerText()).includes(pkg.digest),
    );
  }
}

async function pixelCounts(page) {
  return page.locator(".game-canvas").evaluate((canvas, palette) => {
    const ctx = canvas.getContext("2d");
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const counts = {};
    for (const [color, [r, g, b]] of Object.entries(palette)) {
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b && pixels[i + 3] === 255)
          count++;
      }
      counts[color] = count;
    }
    return counts;
  }, colors);
}

async function enterBattle(page, baseUrl) {
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

async function attack(page, skill, random) {
  await page.locator(ready + " summary").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.evaluate(() => window.__controlsTest.startWild());
  await page.locator('.battle-controls[data-battle-phase="command"]').waitFor();
  const foeHealth = page.locator('.battler.foe [role="meter"]');
  const before = await foeHealth.getAttribute("aria-label");
  await page.getByRole("button", { name: "Skill", exact: true }).click();
  const skillButton = page.getByRole("button", { name: new RegExp(skill) });
  await skillButton.waitFor();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  // The same DOM click handler as a player, while requestAnimationFrame is controlled.
  await skillButton.evaluate((button, value) => {
    Math.random = () => value;
    button.click();
  }, random);
  await page.clock.runFor(64);
  return { before, after: await foeHealth.getAttribute("aria-label") };
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
  creatureDigest: creature.digest,
  creatureAtlasSha256: creature.atlasDigest,
  effectDigest: effect.digest,
  effectAtlasSha256: effect.atlasDigest,
  runs: [],
};

try {
  for (const run of [
    { name: "desktop-hit", width: 1280, height: 800, effect: true },
    { name: "narrow-mobile-hit", width: 320, height: 568, effect: true },
    { name: "short-landscape-hit", width: 640, height: 320, effect: true },
    { name: "without-effect", width: 800, height: 600 },
    { name: "miss", width: 800, height: 600, effect: true, miss: true },
    { name: "reduced-motion", width: 390, height: 844, effect: true, reduced: true },
  ]) {
    await withBrowser(
      async (page) => {
        await page.setViewportSize({ width: run.width, height: run.height });
        await enterBattle(page, baseUrl);
        if (run.name === "desktop-hit") {
          await loadPackage(
            page,
            "creature",
            { ...creature, digest: "0".repeat(64) },
            "STALE_PACKAGE",
          );
          const altered = creature.paths.map((path, index) => ({
            name: files[index],
            mimeType: index === 0 ? "image/png" : "application/json",
            buffer: index === 0 ? Buffer.from("corrupt atlas") : readFileSync(path),
          }));
          await loadPackage(page, "creature", { ...creature, paths: altered }, "HASH_MISMATCH");
        }
        await loadPackage(page, "creature", creature);
        if (run.effect) await loadPackage(page, "effect", effect);
        const health = await attack(page, run.miss ? "Scorch" : "Nip", run.miss ? 0.99 : 0.5);
        const hp = (label) => Number(/^Health (\d+) of /.exec(label)?.[1]);
        assert.ok(
          run.miss ? health.after === health.before : hp(health.after) < hp(health.before),
          JSON.stringify(health),
        );

        const first = { state: await getData(page), pixels: await pixelCounts(page) };
        assert.equal(first.state.agesPlaybackPlayerClip, "attack", JSON.stringify(first.state));
        assert.equal(first.state.agesPlaybackPlayerFrame, "0");
        assert.equal(first.state.agesPlaybackHit, String(!run.miss));
        assert.equal(first.state.agesPlaybackImpacts, "0");
        assert.ok(
          first.pixels.magenta > 100,
          `Missing visible first frame: ${JSON.stringify(first.pixels)}`,
        );
        assert.equal(first.pixels.cyan, 0);
        assert.equal(first.pixels.yellow, 0);
        const firstImage = `${run.name}-frame-0.png`;
        await page.screenshot({ path: join(artifactDir, firstImage) });

        await page.clock.runFor(112);
        const second = { state: await getData(page), pixels: await pixelCounts(page) };
        assert.equal(second.state.agesPlaybackPlayerFrame, run.reduced ? "0" : "1");
        assert.equal(second.state.agesPlaybackImpacts, run.miss || run.reduced ? "0" : "1");
        assert.ok(
          second.pixels[run.reduced ? "magenta" : "cyan"] > 100,
          JSON.stringify(second.pixels),
        );
        assert.equal(second.pixels[run.reduced ? "cyan" : "magenta"], 0);
        const effectExpected = run.effect && !run.miss && !run.reduced;
        assert.equal(second.state.agesPlaybackEffectFrame, effectExpected ? "0" : "");
        assert.equal(second.pixels.yellow > 100, Boolean(effectExpected));
        const secondImage = `${run.name}-frame-1.png`;
        await page.screenshot({ path: join(artifactDir, secondImage) });

        await page.clock.runFor(700);
        const settled = await getData(page);
        assert.equal(settled.agesPlaybackImpacts, second.state.agesPlaybackImpacts);
        assert.equal(settled.agesPlaybackEffectFrame, "");
        assert.equal(settled.agesPlaybackPlayerClip, "idle");
        assert.equal(
          await page.locator('.battle-controls[data-battle-phase="command"]').count(),
          1,
        );
        assert.equal(
          await page.evaluate((key) => localStorage.getItem(key), PREVIEW_SAVE_KEY),
          save,
        );
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY), null);
        evidence.runs.push({
          ...run,
          health,
          first,
          second,
          settled,
          images: [firstImage, secondImage],
        });
      },
      { context: { reducedMotion: run.reduced ? "reduce" : "no-preference" } },
    );
    console.log(`[ages-preview] PASS ${run.name}`);
  }
} finally {
  server.close();
}
writeFileSync(join(artifactDir, "report.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ status: evidence.status, runs: evidence.runs.length, artifactDir }));
