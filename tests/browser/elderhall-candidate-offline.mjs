/** Verify the candidate's cached assets and starting journey after going offline. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { CANDIDATE_URLS } from "./elderhall-candidate.mjs";
import { startStaticServer, waitForGameBoot } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const output = join(root, "qa-evidence", "elderhall-candidate-offline");
mkdirSync(output, { recursive: true });
const report = { browser: null, cachedAssets: [], offlineAssets: [], naturalEntry: null, errors: [] };
let server, browser, context, page;
try {
  let baseUrl;
  ({ server, baseUrl } = await startStaticServer(0));
  browser = await chromium.launch({ headless: true, channel: process.env.RELIQUARY_QA_CHANNEL ?? "chrome" });
  report.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
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
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 16 && await page.locator("button.dialog").count(); i += 1) {
    await page.locator("button.dialog").click();
    await page.waitForTimeout(80);
  }
  await page.waitForFunction(() => window.__controlsTest?.getPos?.().map === "home" && !window.__controlsTest.getPos().dialog,
    null, { timeout: 15_000 });
  await page.keyboard.down("ArrowDown");
  try {
    await page.waitForFunction(() => window.__controlsTest?.getPos?.().map === "elderhall", null, { timeout: 15_000 });
  } finally {
    await page.keyboard.up("ArrowDown");
  }
  report.naturalEntry = await page.evaluate(() => window.__controlsTest.getPos());
  assert.equal(report.naturalEntry.map, "elderhall", "a fresh offline game can walk out to Elderhall");
  await page.screenshot({ path: join(output, "offline-entry.png") });
  assert.deepEqual(report.errors, [], "no uncaught page errors");
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
  if (page) await page.screenshot({ path: join(output, "failure.png") }).catch(() => {});
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
if (report.errors.length) {
  console.error(`[elderhall-candidate-offline] ${report.errors.length} error(s); evidence: ${output}`);
  process.exitCode = 1;
} else {
  console.log(`[elderhall-candidate-offline] ${report.offlineAssets.length} assets decoded; fresh game exited home offline`);
}
