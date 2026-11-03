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
const deadStringPresent = {
  __battleStageReport: bundleSource.includes("__battleStageReport"),
  __worldCameraReport: bundleSource.includes("__worldCameraReport"),
  __controlsTest: bundleSource.includes("__controlsTest"),
};

async function dismissIntro(page) {
  for (let i = 0; i < 24; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click().catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(80);
  }
}

const { server, baseUrl } = await startStaticServer(0);
try {
  const runtime = await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 90_000 });
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await dismissIntro(page);
    await page.waitForSelector(".hud-menu", { timeout: 20_000 });
    await page.waitForTimeout(400);

    return page.evaluate(async () => {
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
        },
      };
    });
  });

  console.log("[assert:prod-runtime] dead bundle strings (informational):", deadStringPresent);
  console.log("[assert:prod-runtime] live window probe:", JSON.stringify(runtime, null, 2));

  assert.equal(runtime.windowKeys.controlsTestType, "undefined", "production must not define window.__controlsTest");
  assert.equal(runtime.windowKeys.controlsTestStartWild, "undefined");
  assert.equal(runtime.windowKeys.battleReport, null, "production must not publish __battleStageReport");
  assert.equal(runtime.windowKeys.worldReport, null, "production must not publish __worldCameraReport");
  for (const [name, type] of Object.entries(runtime.mutators)) {
    assert.equal(type, "undefined", `production __reliquary must not expose ${name}`);
  }
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
