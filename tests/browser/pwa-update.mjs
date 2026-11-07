// Simulates a deploy: serve build A, let its service worker take control, swap
// the server to build B, and check the open page reloads onto B exactly once.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPwa } from "../../scripts/build-pwa.mjs";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const built = join(root, ".vercel/output/static");
const work = mkdtempSync(join(tmpdir(), "reliquary-pwa-update-"));

async function makeBuild(name) {
  const dir = join(work, name);
  cpSync(built, dir, { recursive: true });
  const indexPath = join(dir, "index.html");
  const html = readFileSync(indexPath, "utf8").replace("<head>", `<head><meta name="reliquary-build" content="${name}">`);
  writeFileSync(indexPath, html);
  await buildPwa({ staticDir: dir });
  return dir;
}

const buildA = await makeBuild("A");
const buildB = await makeBuild("B");
let current = buildA;
const { server, baseUrl } = await startStaticServer(0, { getRoot: () => current });
const buildOf = (page) =>
  page.evaluate(() => document.querySelector('meta[name="reliquary-build"]')?.getAttribute("content") ?? null);

try {
  await withBrowser(async (page) => {
    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await waitForGameBoot(page);
    assert.equal(await buildOf(page), "A");
    // clientsClaim: the first worker controls the page without a reload.
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });
    await page.waitForTimeout(500);
    assert.equal(navigations, 1, "first install must not reload the page");

    current = buildB;
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });
    await page.waitForFunction(
      () => document.querySelector('meta[name="reliquary-build"]')?.getAttribute("content") === "B",
      null,
      { timeout: 30_000 },
    );
    await waitForGameBoot(page);
    await page.waitForTimeout(3_000);
    assert.equal(await buildOf(page), "B");
    assert.equal(navigations, 2, `expected exactly one update reload, saw ${navigations - 1}`);
  }, { context: { serviceWorkers: "allow" } });

  // S03: a failed required flush must veto the update reload, keep the live
  // session (with a visible, usable warning), and apply after a successful
  // retry — exactly one reload, with the live transaction restored on Continue.
  current = buildA;
  await withBrowser(async (page) => {
    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await waitForGameBoot(page);
    assert.equal(await buildOf(page), "A");
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });
    await page.waitForTimeout(500);
    assert.equal(navigations, 1);

    // Baseline durable state through the real UI.
    await page.click("text=Start");
    for (let i = 0; i < 8 && (await page.locator(".dialog").count()) > 0; i += 1) {
      await page.locator(".dialog").click({ delay: 30 });
      await page.waitForTimeout(100);
    }
    await page.waitForSelector(".hud-menu", { timeout: 20_000 });
    await page.click(".hud-menu");
    await page.waitForSelector(".overlay-panel");
    await page.locator(".overlay-panel .menu-list button", { hasText: "Save" }).click();
    await page.waitForSelector(".hud-menu");
    const durableBaseline = await page.evaluate(() => localStorage.getItem("reliquary.save.v3"));
    assert.ok(durableBaseline);

    // A controlled dirty-state fixture: writes fail from here on, so walking
    // changes live state without any durable write (shop purchases checkpoint
    // immediately by design, so an unsaved walk is the honest live-change path).
    await page.evaluate(() => {
      window.__origSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        throw new Error("quota");
      };
    });
    await page.keyboard.down("ArrowDown");
    await page.waitForFunction(
      () => {
        const pos = window.__controlsTest?.getPos?.();
        return pos && pos.y >= 8;
      },
      null,
      { timeout: 15_000 },
    );
    await page.keyboard.up("ArrowDown");
    const livePos = await page.evaluate(() => window.__controlsTest.getPos());
    const durableBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v3")));
    assert.ok(livePos.y > durableBefore.y, `live state must be ahead of durable (live y ${livePos.y} > durable y ${durableBefore.y})`);

    // Activate build B: the required flush fails, so the reload must be vetoed.
    current = buildB;
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });
    await page.waitForTimeout(8_000);
    assert.equal(await buildOf(page), "A", "a failed flush must veto the update reload");
    assert.equal(navigations, 1, "no navigation happened");
    const blocked = await page.locator(".app-status").innerText();
    assert.match(blocked, /Update paused/, `a persistent, usable warning must be visible, got: ${blocked}`);
    const liveAfterVeto = await page.evaluate(() => window.__controlsTest.getPos());
    assert.equal(liveAfterVeto.y, livePos.y, "the live session survives the veto");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("reliquary.save.v3")),
      durableBaseline,
      "old durable data is preserved byte-for-byte",
    );

    // Restore storage and retry: success flushes, then exactly one reload.
    await page.evaluate(() => {
      Storage.prototype.setItem = window.__origSetItem;
      delete window.__origSetItem;
    });
    await page.waitForFunction(
      () => document.querySelector('meta[name="reliquary-build"]')?.getAttribute("content") === "B",
      null,
      { timeout: 30_000 },
    );
    assert.equal(navigations, 2, `expected exactly one update reload after retry, saw ${navigations - 1}`);
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForSelector(".hud-menu", { timeout: 20_000 });
    const restoredPos = await page.evaluate(() => window.__controlsTest.getPos());
    assert.equal(restoredPos.y, livePos.y, "Continue restores the flushed transaction");
  }, { context: { serviceWorkers: "allow" } });
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}

console.log("[pwa] auto-update reload passed");
