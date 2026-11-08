#!/usr/bin/env node
/**
 * Local integration evidence: safe-top 0/missing/published, world HUD, battle anchors.
 * Requires build-web-test. OUT_DIR=/opt/cursor/artifacts/integration-local-130ea
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { currentStats, makeBeast } from "../src/game/content.ts";
import { SAVE_KEY, SAVE_VERSION, WORLD_REVISION } from "../src/game/save.ts";

process.env.RELIQUARY_STATIC_ROOT =
  process.env.RELIQUARY_STATIC_ROOT ??
  join(dirname(fileURLToPath(import.meta.url)), "..", ".vercel/output/static");

const evidenceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(process.env.RELIQUARY_STATIC_ROOT, "index.html"))) {
  const build = spawnSync(process.execPath, [join(evidenceRoot, "scripts/build-web-test.mjs")], {
    cwd: evidenceRoot,
    stdio: "inherit",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const { startStaticServer, withBrowser, waitForGameBoot } = await import("../tests/browser/helpers.mjs");

const outDir = process.env.OUT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", ".local/integration-evidence");
mkdirSync(outDir, { recursive: true });

/** Galeskip learns Nip + Gust at L1; fixture places player at north edge of small `home` interior. */
function browserTestFixtureSave() {
  const lead = makeBeast("galeskip", 5, { random: () => 0.5 });
  const stats = currentStats(lead);
  lead.hp = stats.hp;
  lead.mp = stats.mp;
  return {
    version: SAVE_VERSION,
    worldRevision: WORLD_REVISION,
    playerName: "Rowan",
    mapId: "home",
    x: 5,
    y: 1,
    dir: 0,
    gold: 240,
    playTime: 120,
    party: [lead],
    box: [],
    inventory: { tonic: 2, common_sigil: 3 },
    flags: { starter: true },
    seen: { galeskip: true },
    caught: { galeskip: true },
  };
}

async function loadFixtureWorld(page, baseUrl, fixture) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: fixture },
  );
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 90_000 });
  await waitForGameBoot(page);
  const continueBtn = page.getByRole("button", { name: "Continue", exact: true });
  if (await continueBtn.count()) await continueBtn.click();
  else await page.getByRole("button", { name: "Start", exact: true }).click();
  await dismissIntro(page);
  await page.waitForSelector(".hud-menu", { timeout: 20_000 });
  await page.waitForTimeout(350);
  const pos = await page.evaluate(() => window.__controlsTest?.getPos?.() ?? null);
  return pos;
}

async function readBattleCosmeticSample(page) {
  return page.evaluate(() => ({
    dataPhase: document.querySelector(".battle-controls")?.getAttribute("data-battle-phase"),
    battlePhase: window.__battleStageReport?.battlePhase ?? null,
    cosmetic: window.__battleStageReport?.cosmeticOffset ?? null,
    animCue: window.__battleStageReport?.layout ? null : null,
  }));
}

async function runCosmeticSkill(page, skillName, log, filePrefix) {
  await page.evaluate(() => window.__controlsTest?.startWild?.());
  await page.waitForSelector(".battle-controls", { timeout: 20_000 });
  await page.getByRole("button", { name: "Skill", exact: true }).click();
  await page.waitForSelector('[data-battle-phase="skills"]', { timeout: 8000 });
  const skillBtn = page.locator(".cmd-skills button").filter({ hasText: skillName }).first();
  if ((await skillBtn.count()) === 0) {
    log.coverageGaps.push(`battleCosmetic: fixture lead lacks skill ${skillName}`);
    return null;
  }
  await skillBtn.click();
  await page.waitForTimeout(80);
  await page.keyboard.press("Enter");
  const samples = [];
  for (const delay of [0, 120, 280, 420, 560, 720]) {
    if (delay) await page.waitForTimeout(delay);
    samples.push(await readBattleCosmeticSample(page));
  }
  await page.screenshot({ path: join(outDir, `${filePrefix}-390x667.png`) });
  return { skill: skillName, samples, screenshot: `${filePrefix}-390x667.png` };
}

async function dismissIntro(page) {
  for (let i = 0; i < 20; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click().catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(100);
  }
}

async function sampleWorld(page, label) {
  return page.evaluate((tag) => {
    const canvas = document.querySelector(".game-canvas");
    const vp = document.querySelector(".viewport");
    const r = canvas?.getClientRects()[0];
    const cssVar = vp ? getComputedStyle(vp).getPropertyValue("--ui-safe-top-px").trim() : "";
    const report = window.__worldCameraReport ?? null;
    return {
      tag,
      cssVar,
      report,
      canvasClientTop: r?.top ?? null,
      menuOpen: document.querySelector(".game-root")?.classList.contains("is-ui-modal") ?? false,
      objectiveOpen: document.querySelector(".hud-objective-popover") != null,
    };
  }, label);
}

async function readSafeTopProbe(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".game-canvas");
    const report = window.__worldCameraReport ?? null;
    return {
      cssVar: document.querySelector(".viewport")?.style.getPropertyValue("--ui-safe-top-px") ?? "",
      computedVar: getComputedStyle(document.querySelector(".viewport")).getPropertyValue("--ui-safe-top-px").trim(),
      hudInsetSource: report?.hudInsetSource ?? null,
      hudInsetBottom: report?.hudInsetBottom ?? null,
    };
  });
}

const { server, baseUrl } = await startStaticServer(0);
const log = {
  safeTopTransitions: [],
  samples: [],
  battle: [],
  battleCosmetic: [],
  cameraRelief: [],
  coverageGaps: [],
  playerTopEdge: [],
};

async function measurePlayerHudVisibility(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".game-canvas");
    const report = window.__worldCameraReport ?? null;
    if (!canvas || !report) return { ok: false, reason: "missing canvas or report" };
    const cr = canvas.getBoundingClientRect();
    const scaleY = canvas.height > 0 ? cr.height / canvas.height : 1;
    const topStack = document.querySelector(".top-stack");
    const popover = document.querySelector(".hud-objective-popover");
    void topStack;
    void popover;
    const headCanvasY = report.effectivePlayerHeadCanvasY ?? report.playerHeadCanvasY;
    const hudFloorCanvasY = report.hudInsetBottom + 4;
    const spriteTopClientY = cr.top + headCanvasY * scaleY;
    const hudFloorClientY = cr.top + hudFloorCanvasY * scaleY;
    const spriteH = 48 * scaleY;
    const clearsCanvas = headCanvasY >= hudFloorCanvasY - 2;
    return {
      ok: true,
      headCanvasYPrePan: report.headAfterCamRelief ?? report.playerHeadCanvasY,
      effectiveHeadCanvasY: headCanvasY,
      contentPanY: report.contentPanY ?? 0,
      camRelief: report.camRelief,
      hudInsetBottom: report.hudInsetBottom,
      hudFloorCanvasY,
      spriteTopClientY,
      hudFloorClientY,
      spriteBottomClientY: spriteTopClientY + spriteH,
      clearsHud: clearsCanvas,
      clearanceCanvasPx: headCanvasY - hudFloorCanvasY,
      clearanceClientPx: spriteTopClientY - hudFloorClientY,
    };
  });
}

const fixture = browserTestFixtureSave();

try {
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 667 });
    log.fixtureBoot = await loadFixtureWorld(page, baseUrl, fixture);

    for (let i = 0; i < 6; i += 1) await page.waitForTimeout(100);
    const reliefNorth = await sampleWorld(page, "fixture-home-y1");
    log.cameraRelief.push({ tag: "north-edge-y1", sample: reliefNorth });
    await page.screenshot({ path: join(outDir, "world-390x667-home-y1-north.png") });
    log.visibilityNorth = await measurePlayerHudVisibility(page);
    if (reliefNorth.report) {
      const targetMin = reliefNorth.report.hudInsetBottom + 4;
      log.playerTopEdge.push({
        tag: "fixture-home-y1",
        headAfterCamRelief: reliefNorth.report.headAfterCamRelief ?? reliefNorth.report.playerHeadCanvasY,
        effectivePlayerHeadCanvasY: reliefNorth.report.effectivePlayerHeadCanvasY,
        contentPanY: reliefNorth.report.contentPanY ?? 0,
        hudInsetBottom: reliefNorth.report.hudInsetBottom,
        camRelief: reliefNorth.report.camRelief,
        clearanceFromHudFloorPx:
          (reliefNorth.report.effectivePlayerHeadCanvasY ?? reliefNorth.report.playerHeadCanvasY) - targetMin,
      });
      if (!log.visibilityNorth?.clearsHud) {
        log.coverageGaps.push(
          `visibility: home y=1 sprite top still under HUD (client clearance ${log.visibilityNorth?.clearanceClientPx}px)`,
        );
      }
    }

    await page.evaluate(() => window.__controlsTest?.warp?.("home", 5, 7));
    await page.waitForTimeout(500);
    const reliefSouth = await sampleWorld(page, "fixture-home-y7-leave");
    log.cameraRelief.push({ tag: "south-y7-hysteresis-leave", sample: reliefSouth });
    if (reliefNorth.report && reliefSouth.report) {
      log.cameraRelief.push({
        tag: "hysteresis-summary",
        peakRelief: reliefNorth.report.camRelief,
        peakContentPan: reliefNorth.report.contentPanY ?? 0,
        leaveRelief: reliefSouth.report.camRelief,
        leaveContentPan: reliefSouth.report.contentPanY ?? 0,
        decayed:
          (reliefSouth.report.camRelief ?? 0) < (reliefNorth.report.camRelief ?? 0) ||
          (reliefSouth.report.contentPanY ?? 0) < (reliefNorth.report.contentPanY ?? 0),
      });
      if ((reliefNorth.report.camRelief ?? 0) > 0 && (reliefSouth.report.camRelief ?? 0) >= (reliefNorth.report.camRelief ?? 0)) {
        log.coverageGaps.push("camera-relief: expected decay when leaving HUD band (south warp)");
      }
    }

    log.samples.push(await sampleWorld(page, "objective-closed"));
    if (log.samples[0]?.report) {
      const r = log.samples[0].report;
      const targetMin = r.hudInsetBottom + 4;
      log.playerTopEdge.push({
        tag: "objective-closed",
        playerHeadCanvasY: r.playerHeadCanvasY,
        hudInsetBottom: r.hudInsetBottom,
        clearanceFromHudFloorPx: r.playerHeadCanvasY - targetMin,
        note: "Smaller canvas Y is closer to the top; relief follows immediately into the safe band and eases away after clearing it",
      });
    }
    await page.screenshot({ path: join(outDir, "world-390x667-objective-closed.png") });

    if (await page.locator(".hud-objective-btn").count()) {
      await page.locator(".hud-objective-btn").first().click();
      await page.waitForSelector(".hud-objective-popover", { timeout: 5000 });
      await page.waitForTimeout(200);
      log.samples.push(await sampleWorld(page, "objective-open"));
      await page.screenshot({ path: join(outDir, "world-390x667-objective-open.png") });
      log.visibilityObjectiveOpen390 = await measurePlayerHudVisibility(page);
      await page.locator(".hud-objective-btn").first().click();
    }

    const menuYBefore = (await page.locator(".hud-menu").boundingBox())?.y;
    await page.click(".hud-menu");
    await page.waitForSelector(".overlay-panel", { timeout: 10_000 });
    log.samples.push(await sampleWorld(page, "menu-open"));
    await page.screenshot({ path: join(outDir, "world-390x667-menu-open.png") });
    await page.locator(".overlay-panel-close").click();
    await page.waitForSelector(".hud-menu", { timeout: 10_000 });
    const menuYAfter = (await page.locator(".hud-menu").boundingBox())?.y;
    log.samples.push({ tag: "menu-close-menu-y", menuYBefore, menuYAfter, delta: Math.abs((menuYBefore ?? 0) - (menuYAfter ?? 0)) });

    const toastRects = await page.evaluate(() =>
      [...document.querySelectorAll(".toast, .app-status")].map((el) => {
        const r = el.getBoundingClientRect();
        return { className: el.className, top: r.top, height: r.height };
      }),
    );
    log.samples.push({ tag: "toast-status-rects", rects: toastRects });

    const jit = [];
    for (let i = 0; i < 8; i += 1) {
      const s = await sampleWorld(page, `jitter-${i}`);
      jit.push({ cssVar: s.cssVar, relief: s.report?.camRelief ?? null, headY: s.report?.playerHeadCanvasY ?? null });
      await page.waitForTimeout(80);
    }
    log.samples.push({ tag: "camera-jitter-series", jit });

    await page.waitForFunction(() => typeof window.__controlsTest?.startWild === "function");
    await page.evaluate(() => window.__controlsTest?.startWild?.());
    await page.waitForSelector(".battle-controls", { timeout: 20_000 });
    await page.waitForTimeout(400);
    const command = await page.evaluate(() => ({
      phase: document.querySelector(".battle-controls")?.getAttribute("data-battle-phase"),
      leadSpecies: null,
      anchors: window.__battleStageReport?.spriteAnchors ?? null,
      corridor: window.__battleStageReport?.animCorridor ?? null,
      reserve: window.__battleStageReport?.commandZoneTop ?? null,
    }));
    log.battle.push({ state: "command", ...command });
    await page.screenshot({ path: join(outDir, "battle-390x667-command.png") });

    await page.getByRole("button", { name: "Skill", exact: true }).click();
    await page.waitForSelector('[data-battle-phase="skills"]', { timeout: 8000 });
    const skills = await page.evaluate(() => ({
      anchors: window.__battleStageReport?.spriteAnchors ?? null,
      phase: window.__battleStageReport?.battlePhase ?? null,
    }));
    log.battle.push({ state: "skills", ...skills });
    await page.screenshot({ path: join(outDir, "battle-390x667-skills.png") });

    const nip = await runCosmeticSkill(page, "Nip", log, "anim-nip");
    if (nip) log.battleCosmetic.push(nip);
    const gust = await runCosmeticSkill(page, "Gust", log, "anim-gust");
    if (gust) log.battleCosmetic.push(gust);
    if (nip && gust) {
      const nipDx = nip.samples.map((s) => s.cosmetic?.player?.dx ?? 0);
      const gustDy = gust.samples.map((s) => s.cosmetic?.player?.dy ?? 0);
      log.battleCosmetic.push({
        tag: "nip-vs-gust-distinction",
        nipPlayerDxSeries: nipDx,
        gustPlayerDySeries: gustDy,
        nipAnimPhase: nip.samples.map((s) => s.dataPhase),
        gustAnimPhase: gust.samples.map((s) => s.dataPhase),
      });
    }

    await page.reload({ waitUntil: "networkidle", timeout: 90_000 });
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await dismissIntro(page);
    await page.waitForSelector(".hud-menu", { timeout: 20_000 });
    await page.waitForTimeout(400);

    log.safeTopTransitions.push({ tag: "published-positive", ...(await readSafeTopProbe(page)) });
    await page.evaluate(() => {
      const vp = document.querySelector(".viewport");
      vp?.style.setProperty("--ui-safe-top-px", "0");
    });
    await page.waitForTimeout(200);
    log.safeTopTransitions.push({ tag: "forced-css-zero", ...(await readSafeTopProbe(page)) });
    await page.evaluate(() => {
      const vp = document.querySelector(".viewport");
      vp?.style.removeProperty("--ui-safe-top-px");
    });
    await page.waitForTimeout(200);
    log.safeTopTransitions.push({ tag: "inline-removed-missing-var", ...(await readSafeTopProbe(page)) });
  }, { textScale: 2 });

  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadFixtureWorld(page, baseUrl, fixture);
    await page.waitForFunction(() => typeof window.__controlsTest?.startWild === "function");
    await page.evaluate(() => window.__controlsTest?.startWild?.());
    await page.waitForSelector(".battle-controls", { timeout: 20_000 });
    await page.getByRole("button", { name: "Skill", exact: true }).click();
    await page.waitForSelector('[data-battle-phase="skills"]', { timeout: 8000 });
    await page.locator(".cmd-skills button").filter({ hasText: "Nip" }).first().click();
    await page.waitForTimeout(80);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const reducedSample = await readBattleCosmeticSample(page);
    await page.screenshot({ path: join(outDir, "anim-reduced-motion-nip-390x844.png") });
    log.battleCosmetic.push({
      skill: "Nip",
      reducedMotion: true,
      sample: reducedSample,
      screenshot: "anim-reduced-motion-nip-390x844.png",
    });
  }, { textScale: 2, context: { reducedMotion: "reduce" } });

  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await loadFixtureWorld(page, baseUrl, fixture);
    await page.evaluate(() => window.__controlsTest?.warp?.("home", 5, 1));
    await page.waitForTimeout(400);
    if (await page.locator(".hud-objective-btn").count()) {
      await page.locator(".hud-objective-btn").first().click();
      await page.waitForSelector(".hud-objective-popover", { timeout: 5000 });
    }
    log.visibilityNorth320 = await measurePlayerHudVisibility(page);
    await page.screenshot({ path: join(outDir, "world-320x568-home-y1-objective-open.png") });
  }, { textScale: 2 });

  writeFileSync(join(outDir, "production-runtime-probe.json"), JSON.stringify({ note: "Run scripts/assert-production-runtime.mjs on build:web output" }, null, 2));
  writeFileSync(join(outDir, "integration-world-battle-log.json"), JSON.stringify(log, null, 2));
  console.log(`[integration-evidence] wrote ${outDir}`);
  if (log.coverageGaps.length) console.warn("[integration-evidence] coverage gaps:", log.coverageGaps);
} finally {
  server.close();
}
