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
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}

console.log("[pwa] auto-update reload passed");
