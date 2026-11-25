/** Use the normal game controls to continue a save in the installed offline artifact. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAPS, elderhallBase } from "../../src/game/maps/registry.ts";
import { makeElderhallCandidate } from "../../src/game/maps/elderhall-candidate.ts";
import { pathFor } from "../../scripts/natural-journey-path.mjs";
import { CANDIDATE_URLS } from "./elderhall-candidate.mjs";
import { launchQaChrome, startStaticServer, waitForGameBoot } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const output = process.env.RELIQUARY_OFFLINE_EVIDENCE ?? join(root, "qa-evidence", "elderhall-candidate-offline");
mkdirSync(output, { recursive: true });
const report = { browser: null, cachedAssets: [], offlineAssets: [], checkpoints: [], errors: [] };
let server, browser, context, page;

async function saveFromMenu() {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  return page.evaluate(() => {
    const { mapId, worldRevision, x, y, gold, flags } = JSON.parse(localStorage.getItem("reliquary.save.v3"));
    return { mapId, worldRevision, x, y, gold, flags };
  });
}

async function walk(map, start, target) {
  let position = start;
  let stalled = 0;
  const plannedSteps = pathFor(map, start, target, false).length;
  for (let attempt = 0; attempt <= plannedSteps * 2; attempt += 1) {
    const [step] = pathFor(map, position, target, false);
    if (!step) return position;
    await page.keyboard.press(step.key, { delay: 85 });
    await page.waitForTimeout(210);
    const next = await saveFromMenu();
    if (next.mapId !== map.id) {
      assert.ok(step.warp, `Unexpected map transition into ${next.mapId}`);
      return next;
    }
    stalled = next.x === position.x && next.y === position.y ? stalled + 1 : 0;
    assert.ok(stalled < 4, `Input stopped moving at ${next.x},${next.y} in ${map.id}`);
    position = next;
  }
  throw new Error(`Did not reach ${target.x},${target.y} in ${map.id}`);
}

async function finishDialogue() {
  const next = page.locator(".dialog-next");
  for (let index = 0; index < 16 && await next.count(); index += 1) await next.click();
  await next.waitFor({ state: "detached" });
}

try {
  let baseUrl;
  ({ server, baseUrl } = await startStaticServer(0));
  browser = await launchQaChrome("chrome");
  report.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
  await context.tracing.start({ screenshots: true, snapshots: true });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(String(error?.stack ?? error)));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForGameBoot(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("service worker ready timed out")), 30_000)),
    ]);
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });
  report.cachedAssets = await page.evaluate(async (paths) => {
    const keys = (await caches.keys()).filter((key) => key.startsWith("workbox-precache"));
    const matches = [];
    for (const path of paths) {
      let found = false;
      for (const key of keys) {
        if (await (await caches.open(key)).match(path, { ignoreSearch: true })) { found = true; break; }
      }
      matches.push({ path, found });
    }
    return matches;
  }, CANDIDATE_URLS);
  assert.ok(report.cachedAssets.every((item) => item.found), "every candidate image is in the installed precache");

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await finishDialogue();
  await page.getByText("Rowan's Cottage", { exact: true }).waitFor({ timeout: 15_000 });
  const onlineSave = await saveFromMenu();
  assert.equal(onlineSave.mapId, "home");
  report.checkpoints.push({ onlineSave });

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForGameBoot(page);
  report.offlineAssets = await page.evaluate(async (paths) => Promise.all(paths.map(async (path) => {
    const response = await fetch(path);
    const bitmap = await createImageBitmap(await response.blob());
    const result = { path, status: response.status, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  })), CANDIDATE_URLS);
  assert.ok(report.offlineAssets.every((item) => item.status === 200 && item.width > 0 && item.height > 0),
    "every candidate image decodes while offline");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("Rowan's Cottage", { exact: true }).waitFor({ timeout: 15_000 });
  assert.deepEqual(await saveFromMenu(), onlineSave, "offline reload resumes the online checkpoint");
  await page.keyboard.down("ArrowDown");
  try {
    await page.getByText("Elderhall", { exact: true }).waitFor({ timeout: 15_000 });
  } finally {
    await page.keyboard.up("ArrowDown");
  }
  const village = await saveFromMenu();
  assert.equal(village.mapId, "elderhall");
  assert.equal(village.worldRevision, 5);
  report.checkpoints.push({ offlineVillage: village });
  await page.screenshot({ path: join(output, "offline-entry.png") });

  const elderhall = makeElderhallCandidate(elderhallBase);
  const maren = elderhall.npcs.find((npc) => npc.id === "maren");
  const approach = { x: maren.x, y: maren.y - 1 };
  const atMaren = await walk(elderhall, village, approach);
  assert.deepEqual([atMaren.x, atMaren.y], [approach.x, approach.y]);
  await page.keyboard.press("KeyS", { delay: 85 });
  await page.keyboard.press("KeyZ");
  const marenDialogue = page.getByRole("dialog", { name: "Elder Maren", exact: true });
  await marenDialogue.waitFor();
  assert.equal(await marenDialogue.locator("img").evaluate(async (image) => {
    await image.decode();
    return new URL(image.src).pathname;
  }), "/game/elderhall/portraits/maren.png");
  await page.screenshot({ path: join(output, "offline-maren.png") });
  await finishDialogue();

  const grove = await walk(elderhall, atMaren, { x: 0, y: 10 });
  await page.getByText("Binding Grove", { exact: true }).waitFor({ timeout: 15_000 });
  assert.equal(grove.mapId, "grove");
  assert.equal(grove.gold, onlineSave.gold);
  report.checkpoints.push({ offlineGrove: grove });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("Binding Grove", { exact: true }).waitFor({ timeout: 15_000 });
  assert.deepEqual(await saveFromMenu(), grove, "a new save made offline reopens at the same Grove tile");
  const returned = await walk(MAPS.grove, grove, { x: 15, y: 7 });
  await page.getByText("Elderhall", { exact: true }).waitFor({ timeout: 15_000 });
  assert.equal(returned.mapId, "elderhall");
  report.checkpoints.push({ offlineReturn: returned });
  await page.screenshot({ path: join(output, "offline-return.png") });
  assert.deepEqual(report.errors, [], "no uncaught page errors");
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
  if (page) await page.screenshot({ path: join(output, "failure.png") }).catch(() => {});
} finally {
  if (context) {
    await context.tracing.stop(report.errors.length ? { path: join(output, "failure-trace.zip") } : {}).catch(() => {});
    await context.close().catch(() => {});
  }
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
if (report.errors.length) {
  console.error(`[elderhall-candidate-offline] ${report.errors.length} error(s); evidence: ${output}`, report.errors);
  process.exitCode = 1;
} else {
  console.log(`[elderhall-candidate-offline] ${report.offlineAssets.length} assets decoded; save, dialogue, Grove and return verified offline`);
}
