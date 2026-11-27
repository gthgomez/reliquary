/**
 * Candidate-art evidence: a fresh game and keyboard exit from home, followed
 * by test-probe warps used ONLY to frame repeatable screenshots. These images
 * are not evidence that the warped routes or the full chapter were played.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ELDERHALL_ENVIRONMENT_IDS, elderhallEnvironmentUrl } from "../../src/game/elderhall-assets.ts";
import { MAPS } from "../../src/game/maps.ts";
import { ELDERHALL_PORTRAIT_URLS, portraitSource, resolveNpcPortrait } from "../../src/game/portraits.ts";
import { isOccupied } from "../../src/game/world/movement.ts";
import { faceDirection } from "../../scripts/natural-journey-controls.mjs";
import { launchQaChrome, startStaticServer, waitForGameBoot } from "./helpers.mjs";
import { verifyElderhallMobileControls } from "./elderhall-mobile-controls.mjs";

export const VIEWPORTS = [
  { width: 360, height: 640, mobile: true, dpr: 2 },
  { width: 390, height: 667, mobile: true, dpr: 1 },
  { width: 390, height: 844, mobile: true, dpr: 1 },
  { width: 430, height: 932, mobile: true, dpr: 3 },
  { width: 844, height: 390, mobile: true, dpr: 2 },
  { width: 768, height: 1024, mobile: true, dpr: 2 },
  { width: 1440, height: 900, mobile: false, dpr: 1 },
];
export const VIEWPOINTS = [
  { id: "starting-cottage", map: "home", x: 5, y: 6 },
  { id: "cottage-threshold", x: 5, y: 15 },
  { id: "crossroads", x: 11, y: 10 },
  { id: "village-green", x: 9, y: 13 },
  { id: "maren-and-well", x: 12, y: 10 },
  { id: "guild-threshold", x: 5, y: 9 },
  { id: "shop-threshold", x: 17, y: 9 },
  { id: "inn-threshold", x: 16, y: 5 },
  { id: "north-gate", x: 11, y: 8 },
  { id: "north-gate-close", x: 11, y: 4 },
  { id: "gate-west-post", x: 9, y: 5 },
  { id: "gate-banner", x: 10, y: 5 },
  { id: "gate-east-post", x: 12, y: 5 },
  { id: "west-approach", x: 1, y: 10 },
  { id: "grove-arrival", map: "grove", x: 13, y: 7 },
];
const DIALOGUE_NPCS = ["maren", "cael_hall", "guard", "villager", "innkeep", "shopkeep", "goblin_trader"];
const APPROACHES = [
  { dx: 0, dy: -1, key: "KeyS", yaw: 0 },
  { dx: -1, dy: 0, key: "KeyD", yaw: -Math.PI / 2 },
  { dx: 0, dy: 1, key: "KeyW", yaw: Math.PI },
  { dx: 1, dy: 0, key: "KeyA", yaw: Math.PI / 2 },
];
export const CANDIDATE_URLS = [...ELDERHALL_ENVIRONMENT_IDS.map(elderhallEnvironmentUrl), ...ELDERHALL_PORTRAIT_URLS];
export const captureName = (viewport, viewpoint) => `${viewport.width}x${viewport.height}-${viewpoint.id}.png`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const output = process.env.RELIQUARY_CANDIDATE_EVIDENCE ?? join(root, "qa-evidence", "elderhall-candidate");

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function prepareWorld(page, observations) {
  await page.goto(observations.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForGameBoot(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });
  // The game's own boot must have requested all candidates before the independent
  // decode below. This distinguishes an unused asset from a runtime-loaded asset.
  await page.waitForFunction((paths) => {
    const loaded = new Set(performance.getEntriesByType("resource").map((item) => new URL(item.name).pathname));
    return paths.every((path) => loaded.has(path));
  }, observations.assetUrls, { timeout: 45_000 });
  observations.decodedAssets = await page.evaluate(async (paths) => Promise.all(paths.map(async (path) => {
    const image = new Image();
    image.src = path;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error(`Empty image: ${path}`);
    return { path, width: image.naturalWidth, height: image.naturalHeight };
  })), observations.assetUrls);
  assert.equal(observations.decodedAssets.length, observations.assetUrls.length, "all selected candidate images decode");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 16; i += 1) {
    const dialog = page.locator(".dialog");
    if (!(await dialog.count())) break;
    await dialog.locator(".dialog-next").click();
    await page.waitForTimeout(80);
  }
  await page.waitForFunction(() => window.__controlsTest?.getPos?.().map === "home" && !window.__controlsTest.getPos().dialog,
    null, { timeout: 15_000 });
  // The actual input path walks from the initial cottage spawn to the door.
  // The probe only observes position here; it does not inject movement.
  await page.keyboard.down("ArrowDown");
  try {
    await page.waitForFunction(() => window.__controlsTest?.getPos?.().map === "elderhall", null, { timeout: 15_000 });
  } finally {
    await page.keyboard.up("ArrowDown");
  }
  observations.naturalEntry = await page.evaluate(() => window.__controlsTest.getPos());
  assert.equal(observations.naturalEntry.map, "elderhall", "keyboard exit reaches the village");
  await page.waitForFunction(() => document.querySelector(".hud-place")?.textContent?.includes("Elderhall"), null, { timeout: 10_000 });
  await page.locator("p.app-status").waitFor({ state: "hidden", timeout: 10_000 });
}

async function sampleFrameIntervals(page) {
  // Scheduling intervals are a coarse CI signal, not a phone benchmark or a
  // direct measurement of renderer CPU/GPU cost.
  return page.evaluate(() => new Promise((resolve) => {
    const intervals = [];
    let previous = null;
    function frame(now) {
      if (previous !== null) intervals.push(now - previous);
      previous = now;
      if (intervals.length < 120) return requestAnimationFrame(frame);
      const sorted = [...intervals].sort((a, b) => a - b);
      resolve({ samples: intervals.length, p50Ms: sorted[59], p95Ms: sorted[113],
        maxMs: sorted[119], framesOver50Ms: intervals.filter((value) => value > 50).length,
        scope: "headless Chromium animation-frame scheduling; not a physical-device benchmark" });
    }
    requestAnimationFrame(frame);
  }));
}

async function captureView(page, viewport, viewpoint) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const position = { map: viewpoint.map ?? "elderhall", x: viewpoint.x, y: viewpoint.y };
  // This teleport is deliberately recorded as framing-only, not journey proof.
  await page.evaluate(({ map, x, y }) => window.__controlsTest.warp(map, x, y), position);
  await page.waitForFunction(({ map, x, y }) => {
    const p = window.__controlsTest?.getPos?.();
    return p?.map === map && p.mode === "world" && !p.dialog && p.x === x && p.y === y;
  }, position, { timeout: 10_000 });
  await twoFrames(page);
  await page.waitForTimeout(350); // Allow camera relief and resize observers to settle.
  const geometry = await page.locator("canvas.game-canvas").evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) throw new Error("World canvas unavailable");
    const rect = canvas.getBoundingClientRect();
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let y = 0; y < canvas.height; y += 16) for (let x = 0; x < canvas.width; x += 16) {
      const i = (y * canvas.width + x) * 4;
      colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
    }
    return { logicalWidth: canvas.width, logicalHeight: canvas.height, cssWidth: rect.width, cssHeight: rect.height,
      sampledColors: colors.size, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      hudHeight: document.querySelector(".hud-chip-grow")?.getBoundingClientRect().height ?? 0 };
  });
  assert.ok(geometry.cssWidth > 0 && geometry.cssHeight > 0 && geometry.sampledColors > 4, "world canvas renders more than a blank surface");
  assert.equal(geometry.horizontalOverflow, false, "exploration has no horizontal document overflow");
  if (viewport.width === 844 && viewpoint.id === "gate-banner") {
    assert.ok(geometry.hudHeight > 0 && geometry.hudHeight <= 108,
      `enlarged-text landscape HUD grew into the gate framing (${geometry.hudHeight}px)`);
  }
  const camera = await page.evaluate(() => window.__worldCameraReport ?? null);
  const yaw = await page.evaluate(() => window.__controlsTest.getYaw());
  const name = captureName(viewport, viewpoint);
  const path = join(output, name);
  await page.screenshot({ path, scale: "css" });
  return { file: name, sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    viewport, position, yaw, camera,
    method: "test-probe warp for visual framing only", geometry };
}

async function captureDialogue(page, viewport, npcId) {
  const map = Object.values(MAPS).find((world) => world.npcs.some((npc) => npc.id === npcId));
  const npc = map?.npcs.find((entry) => entry.id === npcId);
  assert.ok(npc, `Missing dialogue fixture for ${npcId}`);
  const approach = APPROACHES.find(({ dx, dy }) => !isOccupied(map, {}, npc.x + dx, npc.y + dy));
  assert.ok(approach, `${npcId} has a walkable dialogue approach`);
  await page.evaluate(({ mapId, x, y }) => window.__controlsTest.warp(mapId, x, y),
    { mapId: map.id, x: npc.x + approach.dx, y: npc.y + approach.dy });
  await faceDirection(page, approach.key, approach.yaw);
  await page.keyboard.press("KeyZ");
  const vendor = npc.talk === "shopkeep";
  const dialog = page.getByRole("dialog", { name: vendor ? map.name : npc.name, exact: true });
  const img = dialog.locator(vendor ? ".shop-portrait" : ".dialog-portrait img");
  await img.waitFor({ timeout: 8_000 });
  const key = resolveNpcPortrait(npc.id, npc.sprite);
  assert.equal(await img.getAttribute("src"), portraitSource(key, true), `${npcId} displays its intended portrait`);
  const decoded = await img.evaluate(async (image) => {
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, scale: getComputedStyle(image).imageRendering };
  });
  assert.deepEqual(decoded, { width: 240, height: 312, scale: "pixelated" });
  const action = vendor ? dialog.getByRole("button", { name: "Leave", exact: true }) : dialog.locator(".dialog-next");
  await action.waitFor();
  const geometry = await dialog.evaluate((node) => {
    const text = node.querySelector(".dialog-content, .overlay-panel-body");
    const next = node.querySelector(".dialog-next, .overlay-panel-close");
    const { top, bottom, height, left, right } = next.getBoundingClientRect();
    return { clippedHorizontally: left < 0 || right > innerWidth || text.scrollWidth > text.clientWidth + 1,
      actionInView: top >= 0 && bottom <= innerHeight && height >= 44,
      readableTextHeight: text.clientHeight };
  });
  assert.ok(!geometry.clippedHorizontally && geometry.actionInView && geometry.readableTextHeight >= 24,
    `${npcId} dialogue remains usable at ${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`);
  const path = join(output, `${viewport.width}x${viewport.height}-dialogue-${npcId}.png`);
  await page.screenshot({ path, scale: "css" });
  for (let pageIndex = 0; pageIndex < 16 && await dialog.count(); pageIndex += 1) {
    const back = dialog.locator(".dialog-back").filter({ hasText: /^(?:Close|Leave|Cancel)$/ });
    if (await back.count()) await back.click();
    else await action.click();
  }
  await dialog.waitFor({ state: "detached" });
  if ((await page.evaluate(() => window.__controlsTest.getPos())).mode !== "world") await page.keyboard.press("Escape");
  return { file: path.split(/[\\/]/).at(-1), npcId, viewport, geometry,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"), method: "framing fixture followed by keyboard interaction" };
}

async function verifyClassicDialogue(browser, report) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 },
    deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("reliquary-classic-touch", "1"));
  const page = await context.newPage();
  page.on("pageerror", (error) => report.pageErrors.push(String(error?.stack ?? error)));
  page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => report.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? "unknown" }));
  try {
    await page.goto(report.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.locator(".dialog").waitFor();
    assert.equal(await page.locator(".touch-full .dpad").isVisible(), true, "classic mode keeps the full pad in dialogue");
    assert.equal(await page.getByRole("button", { name: "A — Next", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "B — Back", exact: true }).count(), 0,
      "Back is unavailable on the first dialogue page");
    const name = "classic-360x740-dialogue.png";
    const path = join(output, name);
    await page.screenshot({ path });
    report.classicDialogue = { file: name, sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      viewport: { width: 360, height: 740, mobileEmulation: true }, method: "fresh-start classic dialogue; no probe warp" };
    await page.locator(".touch .a-btn").tap();
    await page.waitForTimeout(80);
    assert.equal(await page.getByRole("button", { name: "B — Back", exact: true }).count(), 1,
      "Back becomes available after advancing to page two");
    await page.locator(".touch .b-btn").tap();
    await page.waitForTimeout(80);
    assert.equal(await page.getByRole("button", { name: "B — Back", exact: true }).count(), 0,
      "touch B returns to the first dialogue page");
    for (let i = 0; i < 16 && await page.locator(".dialog").count(); i += 1) {
      await page.locator(".touch .a-btn").tap();
      await page.waitForTimeout(80);
    }
    await page.waitForFunction(() => !document.querySelector(".dialog"), null, { timeout: 10_000 });
    assert.equal(await page.getByRole("button", { name: "A — Interact", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "B — Cancel", exact: true }).count(), 1);
    report.classicDialogue.returnedToExploration = true;
  } catch (error) {
    report.failures.push(`classic dialogue: ${error?.stack ?? error}`);
    await page.screenshot({ path: join(output, "failure-classic-dialogue.png") }).catch(() => {});
  } finally {
    await context.close();
  }
}

async function run() {
  mkdirSync(output, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), gitSha: process.env.GITHUB_SHA ?? null,
    gitRef: process.env.GITHUB_REF ?? null, runId: process.env.GITHUB_RUN_ID ?? null,
    node: process.version, scope: "Candidate visual framing after natural cottage exit; later positions use framing fixtures.",
    browser: null, contexts: [], captures: [], dialogues: [], classicDialogue: null, pageErrors: [], consoleErrors: [], failedRequests: [], failures: [] };
  let server, browser;
  try {
    ({ server, baseUrl: report.url } = await startStaticServer(0));
    browser = await launchQaChrome("chrome");
    report.browser = browser.version();
    for (const viewport of VIEWPORTS) {
      const { width, height, mobile, dpr } = viewport;
      const observations = { url: report.url, viewport, naturalEntry: null, decodedAssets: [], assetResponses: [], assetUrls: CANDIDATE_URLS };
      report.contexts.push(observations);
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce",
        deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, serviceWorkers: "allow" });
      if (width === 844) await context.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", "145%", "important"));
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => report.pageErrors.push(String(error?.stack ?? error)));
      page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
      page.on("requestfailed", (request) => report.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? "unknown" }));
      page.on("response", (response) => {
        const path = new URL(response.url()).pathname;
        if (CANDIDATE_URLS.includes(path)) observations.assetResponses.push({ path, status: response.status() });
      });
      try {
        await prepareWorld(page, observations);
        if (width === 390 && height === 667) {
          Object.assign(observations, await verifyElderhallMobileControls(page, { output }));
          observations.frameIntervals = await sampleFrameIntervals(page);
        }
        for (const viewpoint of VIEWPOINTS) {
          try {
            report.captures.push(await captureView(page, viewport, viewpoint));
          } catch (error) {
            report.failures.push(`${viewport.width}x${viewport.height} ${viewpoint.id}: ${error?.stack ?? error}`);
            await page.screenshot({ path: join(output, `failure-${captureName(viewport, viewpoint)}`) }).catch(() => {});
          }
        }
        for (const npcId of width === 390 && height === 844 ? DIALOGUE_NPCS : ["maren"]) {
          try {
            report.dialogues.push(await captureDialogue(page, viewport, npcId));
          } catch (error) {
            report.failures.push(`${width}x${height} dialogue ${npcId}: ${error?.stack ?? error}`);
            await page.screenshot({ path: join(output, `failure-${width}x${height}-dialogue-${npcId}.png`) }).catch(() => {});
          }
        }
      } catch (error) {
        report.failures.push(`${width}x${height} setup: ${error?.stack ?? error}`);
        await page.screenshot({ path: join(output, `failure-${width}x${height}-setup.png`) }).catch(() => {});
      } finally {
        await context.close();
      }
    }
    await verifyClassicDialogue(browser, report);
    assert.equal(report.captures.length, VIEWPORTS.length * VIEWPOINTS.length, "all requested visual frames captured");
    assert.equal(report.dialogues.length, VIEWPORTS.length + DIALOGUE_NPCS.length - 1, "all dialogue portraits captured");
    assert.deepEqual(report.pageErrors, [], "no uncaught page exceptions");
    assert.deepEqual(report.consoleErrors, [], "no browser console errors");
    const failedAssets = report.failedRequests.filter((item) => CANDIDATE_URLS.some((path) => new URL(item.url).pathname === path));
    assert.deepEqual(failedAssets, [], "no failed candidate asset requests");
    for (const context of report.contexts) {
      assert.equal(context.naturalEntry?.map, "elderhall", "fresh start exits cottage by keyboard");
      if (context.viewport.width === 390 && context.viewport.height === 667) {
        assert.ok(context.touchMovement?.after.x > context.touchMovement?.before.x, "real touch input moves the candidate player");
      }
      assert.equal(context.decodedAssets.length, CANDIDATE_URLS.length, "all candidate images decode");
      assert.ok(CANDIDATE_URLS.every((path) => context.assetResponses.some((entry) => entry.path === path && entry.status === 200)), "each candidate was served successfully");
    }
    assert.equal(report.classicDialogue?.returnedToExploration, true, "classic dialogue controls return to exploration");
    assert.deepEqual(report.failures, [], "all captures completed");
  } catch (error) {
    report.failures.push(String(error?.stack ?? error));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise((resolve) => server.close(resolve));
    writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  }
  if (report.failures.length) {
    console.error(`[elderhall-candidate] ${report.failures.length} failure(s); evidence: ${output}`);
    process.exitCode = 1;
  } else {
    console.log(`[elderhall-candidate] ${report.captures.length} framing captures saved to ${output}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
