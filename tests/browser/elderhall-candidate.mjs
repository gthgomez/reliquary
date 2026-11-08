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
import { chromium } from "playwright";
import { startStaticServer, waitForGameBoot } from "./helpers.mjs";

export const VIEWPORTS = [
  { width: 360, height: 800, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 412, height: 915, mobile: true },
  { width: 390, height: 667, mobile: true },
  { width: 844, height: 390, mobile: true },
  { width: 1280, height: 800, mobile: false },
];
export const VIEWPOINTS = [
  { id: "village-green", x: 9, y: 13 },
  { id: "maren-and-well", x: 12, y: 10 },
  { id: "north-gate", x: 11, y: 8 },
  { id: "north-gate-close", x: 11, y: 4 },
  { id: "west-approach", x: 1, y: 10 },
];
export const CANDIDATE_IDS = [
  "grass-atlas", "dirt-atlas", "stone-atlas", "well-reference", "cottage-reference",
  "guild-reference", "shop-reference", "tree-reference", "gate-reference", "bench", "flowers",
];
export const CANDIDATE_URLS = CANDIDATE_IDS.map((id) => `/game/elderhall/assets/elderhall.${id}.png`);
export const captureName = (viewport, viewpoint) => `${viewport.width}x${viewport.height}-${viewpoint.id}.png`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const output = process.env.RELIQUARY_CANDIDATE_EVIDENCE ?? join(root, "qa-evidence", "elderhall-candidate");

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function prepareWorld(page, observations) {
  await page.goto(observations.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForGameBoot(page);
  // The game's own boot must have requested all candidates before the independent
  // decode below. This distinguishes an unused asset from a runtime-loaded asset.
  await page.waitForFunction((paths) => {
    const loaded = new Set(performance.getEntriesByType("resource").map((item) => new URL(item.name).pathname));
    return paths.every((path) => loaded.has(path));
  }, CANDIDATE_URLS, { timeout: 45_000 });
  observations.decodedAssets = await page.evaluate(async (paths) => Promise.all(paths.map(async (path) => {
    const image = new Image();
    image.src = path;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error(`Empty image: ${path}`);
    return { path, width: image.naturalWidth, height: image.naturalHeight };
  })), CANDIDATE_URLS);
  assert.equal(observations.decodedAssets.length, CANDIDATE_URLS.length, "all selected candidate images decode");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 16; i += 1) {
    const dialog = page.locator("button.dialog");
    if (!(await dialog.count())) break;
    await dialog.click();
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
}

async function verifyTouchMovement(page) {
  // Send real Chromium touch input to the rendered virtual pad, not a game
  // probe. The probe observes the resulting position and stopped state only.
  await page.waitForFunction(() => window.__controlsTest?.getSpeed?.() === 0, null, { timeout: 10_000 });
  const before = await page.evaluate(() => window.__controlsTest.getPos());
  const button = page.locator(".touch-full .d.right");
  const box = await button.boundingBox();
  assert.ok(box && box.width >= 44 && box.height >= 44, "right touch control has a usable target");
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
    });
    await page.waitForFunction((x) => window.__controlsTest?.getPos?.().x > x, before.x, { timeout: 10_000 });
  } finally {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => {});
    await cdp.detach();
  }
  await page.waitForFunction(() => window.__controlsTest?.getSpeed?.() === 0, null, { timeout: 10_000 });
  const after = await page.evaluate(() => window.__controlsTest.getPos());
  assert.equal(after.map, "elderhall");
  assert.ok(after.x > before.x, "the touch hold moved right and released");
  return { method: "Chromium touch press and release on the on-screen right control", before, after };
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
  // This teleport is deliberately recorded as framing-only, not journey proof.
  await page.evaluate(({ x, y }) => window.__controlsTest.warp("elderhall", x, y), viewpoint);
  await page.waitForFunction(({ x, y }) => {
    const p = window.__controlsTest?.getPos?.();
    return p?.map === "elderhall" && p.mode === "world" && !p.dialog && p.x === x && p.y === y;
  }, viewpoint, { timeout: 10_000 });
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
    return { logicalWidth: canvas.width, logicalHeight: canvas.height, cssWidth: rect.width, cssHeight: rect.height, sampledColors: colors.size };
  });
  assert.ok(geometry.cssWidth > 0 && geometry.cssHeight > 0 && geometry.sampledColors > 4, "world canvas renders more than a blank surface");
  assert.match((await page.locator(".hud-place").textContent()) ?? "", /Elderhall/);
  const name = captureName(viewport, viewpoint);
  const path = join(output, name);
  await page.screenshot({ path });
  return { file: name, sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    viewport: { width: viewport.width, height: viewport.height, mobileEmulation: viewport.mobile },
    position: { map: "elderhall", x: viewpoint.x, y: viewpoint.y },
    method: "test-probe warp for visual framing only", geometry };
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
    assert.equal(await page.getByRole("button", { name: "B — Back", exact: true }).count(), 1);
    const name = "classic-360x740-dialogue.png";
    const path = join(output, name);
    await page.screenshot({ path });
    report.classicDialogue = { file: name, sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      viewport: { width: 360, height: 740, mobileEmulation: true }, method: "fresh-start classic dialogue; no probe warp" };
    for (let i = 0; i < 16 && await page.locator(".dialog").count(); i += 1) {
      await page.getByRole("button", { name: "A — Next", exact: true }).click();
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
    scope: "Candidate visual framing: keyboard exit from a fresh cottage save; later probe warps are not gameplay proof.",
    browser: null, contexts: [], captures: [], classicDialogue: null, pageErrors: [], consoleErrors: [], failedRequests: [], failures: [] };
  let server, browser;
  try {
    ({ server, baseUrl: report.url } = await startStaticServer(0));
    const executablePath = process.env.RELIQUARY_QA_CHROMIUM;
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: process.env.RELIQUARY_QA_CHANNEL ?? "chrome" }) });
    report.browser = browser.version();
    for (const mobile of [true, false]) {
      const viewports = VIEWPORTS.filter((viewport) => viewport.mobile === mobile);
      const first = viewports[0];
      const observations = { url: report.url, mobileEmulation: mobile, naturalEntry: null, decodedAssets: [], assetResponses: [] };
      report.contexts.push(observations);
      const context = await browser.newContext({ viewport: { width: first.width, height: first.height },
        deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, serviceWorkers: "block" });
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
        if (mobile) {
          observations.touchMovement = await verifyTouchMovement(page);
          observations.frameIntervals = await sampleFrameIntervals(page);
        }
        for (const viewport of viewports) for (const viewpoint of VIEWPOINTS) {
          try {
            report.captures.push(await captureView(page, viewport, viewpoint));
          } catch (error) {
            report.failures.push(`${viewport.width}x${viewport.height} ${viewpoint.id}: ${error?.stack ?? error}`);
            await page.screenshot({ path: join(output, `failure-${captureName(viewport, viewpoint)}`) }).catch(() => {});
          }
        }
      } catch (error) {
        report.failures.push(`${mobile ? "mobile" : "desktop"} setup: ${error?.stack ?? error}`);
        await page.screenshot({ path: join(output, `failure-${mobile ? "mobile" : "desktop"}-setup.png`) }).catch(() => {});
      } finally {
        await context.close();
      }
    }
    await verifyClassicDialogue(browser, report);
    assert.equal(report.captures.length, VIEWPORTS.length * VIEWPOINTS.length, "all requested visual frames captured");
    assert.deepEqual(report.pageErrors, [], "no uncaught page exceptions");
    assert.deepEqual(report.consoleErrors, [], "no browser console errors");
    const failedAssets = report.failedRequests.filter((item) => CANDIDATE_URLS.some((path) => new URL(item.url).pathname === path));
    assert.deepEqual(failedAssets, [], "no failed candidate asset requests");
    for (const context of report.contexts) {
      assert.equal(context.naturalEntry?.map, "elderhall", "fresh start exits cottage by keyboard");
      if (context.mobileEmulation) assert.ok(context.touchMovement?.after.x > context.touchMovement?.before.x, "real touch input moves the candidate player");
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
