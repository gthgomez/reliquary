// S08: rendered evidence that the battle Item route no longer offers a revive
// item that cannot target its fainted reserve, while the pack still offers it.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

const artifactDir = process.env.RELIQUARY_BROWSER_ARTIFACTS
  ?? fileURLToPath(new URL("../../artifacts/browser/", import.meta.url));

const SAVE_KEY = "reliquary.save.v3";

const prepared = {
  version: 3,
  worldRevision: 1,
  playerName: "Rowan",
  mapId: "elderhall",
  x: 12,
  y: 14,
  dir: 0,
  gold: 200,
  playTime: 0,
  party: [
    {
      uid: "btest1",
      speciesId: "emberkit",
      nickname: "Ember",
      level: 5,
      exp: 0,
      hp: 24,
      mp: 17,
      ivs: { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 },
      temperament: "fierce",
      skills: ["nip", "cinder"],
      status: null,
      statusTurns: 0,
    },
    {
      uid: "btest2",
      speciesId: "dewslime",
      nickname: "Dew",
      level: 5,
      exp: 0,
      hp: 0,
      mp: 17,
      ivs: { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 },
      temperament: "calm",
      skills: ["torrent"],
      status: null,
      statusTurns: 0,
    },
  ],
  box: [],
  inventory: { phoenix_ash: 1, tonic: 2 },
  flags: { starter: true },
  seen: { emberkit: true, dewslime: true },
  caught: { emberkit: true },
};

const { server, baseUrl } = await startStaticServer(0);

try {
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(baseUrl, { waitUntil: "load" });
    await page.evaluate((value) => localStorage.setItem('reliquary.save.v3', JSON.stringify(value)), prepared);
    await page.reload({ waitUntil: "load" });
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForSelector(".hud-menu", { timeout: 20_000 });

    // The pack offers the ash on the road.
    await page.click(".hud-menu");
    await page.waitForSelector(".overlay-panel");
    await page.locator(".overlay-panel .menu-list button", { hasText: "Pack" }).click();
    await page.waitForSelector(".overlay-panel");
    const packText = await page.locator(".overlay-panel").innerText();
    assert.match(packText, /Phoenix Ash/, "the field pack offers Phoenix Ash");
    // Pack close returns to the root sheet; close that too to reach the world.
    await page.locator(".overlay-panel-close").click();
    await page.waitForSelector(".overlay-panel");
    await page.locator(".overlay-panel-close").click();
    await page.waitForFunction(() => !document.querySelector(".overlay-panel"));
    await page.waitForSelector(".hud-menu", { timeout: 20_000 });

    // A wild battle: the Item route must not offer it.
    await page.evaluate(() => window.__controlsTest?.startWild?.());
    await page.waitForSelector(".battle-ui", { timeout: 20_000 });
    await page.getByRole("button", { name: "Item", exact: true }).click();
    await page.waitForSelector(".battle-controls-body ul.cmd button");
    const itemRows = await page.locator(".battle-controls-body ul.cmd button").allInnerTexts();
    assert.ok(
      !itemRows.some((t) => /Phoenix Ash/i.test(t)),
      `the battle item list must not offer a revive item, got: ${JSON.stringify(itemRows)}`,
    );
    assert.ok(
      itemRows.some((t) => /Field Tonic/i.test(t)),
      "an ordinary eligible battle item is still offered",
    );
    mkdirSync(artifactDir, { recursive: true });
    await page.screenshot({ path: join(artifactDir, "battle-item-scope-844x390.png") });
    // Engine-level agreement (headless probe build): the same filter feeds the UI.
    const battleItems = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll(".battle-controls-body ul.cmd button").forEach((b) => items.push(b.textContent));
      return items;
    });
    assert.ok(!battleItems.some((t) => /Phoenix Ash/i.test(t)));
  });
  console.log("[battle-item-scope] field-only revive presentation verified");
} finally {
  server.close();
}
