#!/usr/bin/env node
/**
 * Production runtime gate: static bundle may contain dead identifier strings, but
 * served production build must not expose usable browser-test hooks on `window`.
 *
 * Usage: npm run build:web && node scripts/assert-production-runtime.mjs [staticDir]
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = process.argv[2] ?? join(root, ".vercel/output/static");
process.env.RELIQUARY_STATIC_ROOT = staticDir;

const { startStaticServer, withBrowser, waitForGameBoot } = await import("../tests/browser/helpers.mjs");

function clientBundlePath() {
  const indexHtml = join(staticDir, "index.html");
  if (!existsSync(indexHtml)) return null;
  const html = readFileSync(indexHtml, "utf8");
  const m = html.match(/\/assets\/(index-[^"']+\.js)/);
  if (!m) return null;
  const bundle = join(staticDir, "assets", m[1]);
  return existsSync(bundle) ? bundle : null;
}

const bundle = clientBundlePath();
assert.ok(bundle, `[assert:prod-runtime] missing client bundle under ${staticDir}`);

const bundleSource = readFileSync(bundle, "utf8");
const expectedWorld = existsSync(join(staticDir, "game/elderhall/manifest.json")) ? 5 : 2;
const saveKey = "reliquary.save.v3";
assert.equal(bundleSource.includes("__reliquaryJourneyRandom"), false, "production must exclude the journey random source");
const deadStringPresent = {
  __battleStageReport: bundleSource.includes("__battleStageReport"),
  __worldCameraReport: bundleSource.includes("__worldCameraReport"),
  __controlsTest: bundleSource.includes("__controlsTest"),
};

async function dismissIntro(page) {
  for (let i = 0; i < 24; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog-next").click().catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(80);
  }
}

const { server, baseUrl } = await startStaticServer(0);
try {
  const runtime = await withBrowser(async (page, context) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await page.goto(baseUrl + "?ages-preview=1", { waitUntil: "networkidle", timeout: 90_000 });
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await dismissIntro(page);
    await page.waitForSelector(".hud-menu", { timeout: 20_000 });
    await page.waitForTimeout(400);

    const online = await page.evaluate(async () => {
      const rel = window.__reliquary;
      const probeAttempt = async () => {
        try {
          window.__controlsTest?.startWild?.();
          await new Promise((r) => setTimeout(r, 300));
          return document.querySelector(".battle-controls") != null;
        } catch {
          return false;
        }
      };
      return {
        windowKeys: {
          controlsTestType: typeof window.__controlsTest,
          controlsTestStartWild: typeof window.__controlsTest?.startWild,
          battleReport: window.__battleStageReport ?? null,
          worldReport: window.__worldCameraReport ?? null,
          reliquaryKeys: rel ? Object.keys(rel).sort() : [],
        },
        mutators: {
          getEconomy: typeof rel?.getEconomy,
          setGold: typeof rel?.setGold,
          openShop: typeof rel?.openShop,
          seedForcedSwitch: typeof rel?.seedForcedSwitch,
          setBattlePhase: typeof rel?.setBattlePhase,
          primeSkillMenu: typeof rel?.primeSkillMenu,
        },
        startWildViaControlsTest: await probeAttempt(),
        normalUi: {
          hasBattleControls: document.querySelector(".battle-controls") != null,
          hudMenuVisible: document.querySelector(".hud-menu") != null,
          agesPreviewVisible: document.querySelector("#ages-candidate-preview") != null,
        },
      };
    });
    const previewRequest = await context.request.get(baseUrl + "sprite.runtime.json");
    assert.equal(previewRequest.status(), 404, "production must not serve a preview manifest");

    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const precache = await page.evaluate(async () => {
      const names = (await caches.keys()).filter((name) => name.startsWith("workbox-precache"));
      const entries = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
      return entries.flat().map((entry) => new URL(entry.url).pathname);
    });
    assert.ok(precache.includes("/index.html"), "production must precache the game shell");
    assert.equal(precache.some((path) => /sprite\.runtime\.json|agespreviewpanel-/i.test(path)), false);

    async function saveFromMenu() {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), saveKey);
    }

    const fresh = await saveFromMenu();
    assert.equal(fresh.worldRevision, expectedWorld, "the served game writes the expected world revision");
    if (expectedWorld === 5) {
      // Detach the running game before writing a fixture so its page lifecycle
      // save cannot overwrite the fixture. Exercise the normal Continue/Save UI.
      for (const [revision, x, y, expectedX, expectedY] of [[2, 9, 6, 12, 14], [5, 11, 8, 11, 8]]) {
        await page.goto(baseUrl + "game/manifest.json");
        const fixture = { ...fresh, worldRevision: revision, mapId: "elderhall", x, y,
          gold: 321, flags: { ...fresh.flags, met_maren: true } };
        await page.evaluate(([key, save]) => localStorage.setItem(key, JSON.stringify(save)), [saveKey, fixture]);
        await page.goto(baseUrl);
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        const migrated = await saveFromMenu();
        assert.deepEqual([migrated.worldRevision, migrated.x, migrated.y], [5, expectedX, expectedY]);
        for (const key of ["gold", "flags", "playerName", "inventory", "party", "box", "caught", "seen"]) {
          assert.deepEqual(migrated[key], fixture[key], `world migration changed ${key}`);
        }
      }
    }

    await page.goto(baseUrl + "game/manifest.json");
    const archive = JSON.stringify({ ...fresh, worldRevision: 5, mapId: "elderhall", x: 11, y: 8 }, null, 2);
    await page.evaluate((raw) => localStorage.setItem("reliquary.save.forward", raw), archive);
    await page.goto(baseUrl);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: expectedWorld === 5 ? "Export archived save" : "Export newer save" }).click(),
    ]);
    assert.equal(readFileSync(await download.path(), "utf8"), archive, "rollback recovery must export the exact record");

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForGameBoot(page);
    assert.equal(await page.locator("#ages-candidate-preview").count(), 0, "offline production must omit preview UI");
    return { ...online, expectedWorld, offlinePrecacheEntries: precache.length, previewManifestStatus: previewRequest.status() };
  }, { context: { serviceWorkers: "allow" } });

  console.log("[assert:prod-runtime] dead bundle strings (informational):", deadStringPresent);
  console.log("[assert:prod-runtime] live window probe:", JSON.stringify(runtime, null, 2));

  assert.equal(runtime.windowKeys.controlsTestType, "undefined", "production must not define window.__controlsTest");
  assert.equal(runtime.windowKeys.controlsTestStartWild, "undefined");
  assert.equal(runtime.windowKeys.battleReport, null, "production must not publish __battleStageReport");
  assert.equal(runtime.windowKeys.worldReport, null, "production must not publish __worldCameraReport");
  for (const [name, type] of Object.entries(runtime.mutators)) {
    assert.equal(type, "undefined", `production __reliquary must not expose ${name}`);
  }
  assert.equal(runtime.normalUi.agesPreviewVisible, false, "production must ignore the AGES preview query");
  assert.equal(runtime.startWildViaControlsTest, false, "production must not enter battle via __controlsTest");
  assert.ok(
    runtime.windowKeys.reliquaryKeys.every((k) =>
      ["cancel", "confirm", "openMenu", "startNew"].includes(k),
    ),
    `unexpected __reliquary surface: ${runtime.windowKeys.reliquaryKeys.join(",")}`,
  );

  console.log("[assert:prod-runtime] ok — hooks absent/unusable at runtime (dead strings allowed in bundle)");
} finally {
  server.close();
}
