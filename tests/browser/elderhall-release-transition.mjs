/** Exercise the same origin through upgrade, rollback and exact-byte recovery. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchQaChrome, startStaticServer, waitForGameBoot } from "./helpers.mjs";

const legacyDir = process.env.RELIQUARY_LEGACY_STATIC_ROOT;
assert.ok(legacyDir, "Set RELIQUARY_LEGACY_STATIC_ROOT to the preserved revision 2 production artifact");
const candidateDir = resolve(process.env.RELIQUARY_STATIC_ROOT ?? ".vercel/output/static");
const output = resolve(process.env.RELIQUARY_TRANSITION_EVIDENCE ?? "qa-evidence/elderhall-transition");
const saveKey = "reliquary.save.v3";
const candidateImage = "/game/elderhall/portraits/maren.png";
mkdirSync(output, { recursive: true });

let activeRoot = resolve(legacyDir);
const { server, baseUrl } = await startStaticServer(0, { getRoot: () => activeRoot });
const transitUrl = baseUrl + "api/release-qualification";
const report = { browser: null, steps: [], errors: [] };
let browser, context, page;

async function openTitle() {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForGameBoot(page);
}

async function readSavedBytes() {
  return page.evaluate((key) => localStorage.getItem(key), saveKey);
}

async function save() {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  return JSON.parse(await readSavedBytes());
}

async function start() {
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const next = page.locator(".dialog-next");
  for (let index = 0; index < 16 && await next.count(); index += 1) await next.click();
  await page.getByText("Rowan's Cottage", { exact: true }).waitFor();
}

async function waitForCache(candidate) {
  await page.waitForFunction(async ([asset, expected]) => {
    if (!navigator.serviceWorker.controller) return false;
    const cacheList = await caches.keys();
    const precache = cacheList.find((name) => name.startsWith("workbox-precache"));
    if (!precache) return false;
    const cache = await caches.open(precache);
    return Boolean(await cache.match(asset, { ignoreSearch: true })) === expected;
  }, [candidateImage, candidate], { timeout: 30_000 });
}

async function switchArtifact(dir, candidate) {
  if (!(await page.evaluate(() => navigator.onLine))) await context.setOffline(false);
  // Leave the game before swapping the server. Its lifecycle gets a chance to
  // write the active run before the next worker controls this origin.
  if (page.url() !== transitUrl) await page.goto(transitUrl);
  activeRoot = dir;
  // Reopen the installed game online and let its normal update check replace
  // the active shell. The cached assets can arrive before activation, so
  // also wait to observe the new executable entry in the real document.
  const expectedEntry = readFileSync(join(dir, "index.html"), "utf8").match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  assert.ok(expectedEntry, "The replacement artifact has a game entry");
  await openTitle();
  await page.waitForFunction((entry) => document.querySelector('script[type="module"][src]')?.getAttribute("src") === entry,
    expectedEntry, { timeout: 45_000 });
  await waitForCache(candidate);
}

async function exportFromTitle(name, expected) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name, exact: true }).click(),
  ]);
  const bytes = readFileSync(await download.path());
  assert.deepEqual(bytes, Buffer.from(expected), `${name} must return the exact saved bytes`);
  return createHash("sha256").update(bytes).digest("hex");
}

try {
  browser = await launchQaChrome("chrome");
  report.browser = browser.version();
  context = await browser.newContext({ serviceWorkers: "allow", acceptDownloads: true });
  await context.tracing.start({ screenshots: true, snapshots: true });
  page = await context.newPage();
  // Keep a regular same-origin HTML client during the switch. Chromium's
  // native JSON document can leave worker update jobs without a client ID.
  await page.route(transitUrl, (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: "<!doctype html><title>Elderhall release qualification</title>",
  }));
  page.on("pageerror", (error) => report.errors.push(String(error?.stack ?? error)));
  await openTitle();
  await waitForCache(false);
  await start();
  const baseline = await save();
  assert.equal(baseline.worldRevision, 2);
  report.steps.push({ name: "Fresh save on revision 2", worldRevision: baseline.worldRevision });

  await page.goto(transitUrl);
  // Only the blocked-tile upgrade uses a fixture. It derives from the real
  // revision 2 save and keeps its character, party, inventory and flags.
  const fixture = { ...baseline, mapId: "elderhall", x: 9, y: 6, gold: 321 };
  await page.evaluate(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [saveKey, fixture]);
  await switchArtifact(candidateDir, true);
  await context.setOffline(true);
  await openTitle();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const upgraded = await save();
  assert.deepEqual([upgraded.worldRevision, upgraded.mapId, upgraded.x, upgraded.y], [5, "elderhall", 12, 14]);
  for (const key of ["gold", "flags", "inventory", "playerName", "party", "box", "caught", "seen"]) {
    assert.deepEqual(upgraded[key], fixture[key], `Upgrade changed ${key}`);
  }
  assert.equal(await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth;
  }, candidateImage), 80);
  report.steps.push({ name: "Same-origin upgrade and offline save migration", worldRevision: 5, x: upgraded.x, y: upgraded.y, gold: upgraded.gold });

  await page.keyboard.press("ArrowLeft", { delay: 85 });
  await page.waitForTimeout(230);
  const progressed = await save();
  assert.notEqual(progressed.x, upgraded.x, "normal input advances the candidate save");
  await switchArtifact(resolve(legacyDir), false);
  const newerBytes = await readSavedBytes();
  assert.equal(JSON.parse(newerBytes).worldRevision, 5);
  await openTitle();
  const newerSha256 = await exportFromTitle("Export newer save", newerBytes);
  assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).count(), 0);
  await start();
  const fallback = await save();
  assert.equal(fallback.worldRevision, 2, "rollback writes a compatible save");
  report.steps.push({ name: "Rollback and exact-byte newer-save export", newerSha256 });

  await switchArtifact(candidateDir, true);
  await context.setOffline(true);
  await openTitle();
  const archivedSha256 = await exportFromTitle("Export archived save", newerBytes);
  assert.equal(archivedSha256, newerSha256);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Import", exact: true }).click(),
  ]);
  await chooser.setFiles({ name: "elderhall-recovered.json", mimeType: "application/json", buffer: Buffer.from(newerBytes) });
  await page.getByText("Elderhall", { exact: true }).waitFor();
  const restored = await save();
  assert.deepEqual([restored.worldRevision, restored.mapId, restored.x, restored.y, restored.gold],
    [5, progressed.mapId, progressed.x, progressed.y, progressed.gold]);
  report.steps.push({ name: "Offline roll-forward and archived-save import", archivedSha256, x: restored.x, y: restored.y, gold: restored.gold });
  await page.screenshot({ path: join(output, "roll-forward-recovered.png") });
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
  if (page) await page.screenshot({ path: join(output, "failure.png") }).catch(() => {});
} finally {
  if (context) await context.tracing.stop(report.errors.length ? { path: join(output, "failure-trace.zip") } : {}).catch(() => {});
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
if (report.errors.length) {
  console.error("[elderhall-transition]", report.errors);
  process.exitCode = 1;
} else {
  console.log("[elderhall-transition] upgrade, offline migration, rollback, byte-exact export and roll-forward passed");
}
