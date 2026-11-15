/**
 * Playable battle journeys against the real engine: strike/skill/item/bind,
 * party switching, terminal states, and resizing while an encounter is live.
 * No combat math is reimplemented here; assertions read the game's own cells.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

const artifactDir = process.env.RELIQUARY_BROWSER_ARTIFACTS
  ?? fileURLToPath(new URL("../../artifacts/browser/", import.meta.url));

const SAVE = {
  version: 3,
  worldRevision: 1,
  playerName: "Rowan",
  mapId: "elderhall",
  x: 12,
  y: 14,
  dir: 0,
  gold: 120,
  playTime: 0,
  party: [
    {
      uid: "journey-lead",
      speciesId: "briarling",
      nickname: "Briarling",
      level: 5,
      exp: 0,
      hp: 23,
      mp: 17,
      ivs: { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 },
      temperament: "fierce",
      skills: ["nip", "rootgrasp"],
      status: null,
      statusTurns: 0,
    },
    {
      uid: "journey-reserve",
      speciesId: "galeskip",
      nickname: "Galeskip",
      level: 4,
      exp: 0,
      hp: 18,
      mp: 12,
      ivs: { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 },
      temperament: "keen",
      skills: ["nip", "gust"],
      status: null,
      statusTurns: 0,
    },
  ],
  box: [],
  inventory: { tonic: 3, etherdrop: 2, common_sigil: 2, phoenix_ash: 1 },
  flags: { starter: true },
  seen: { briarling: true, galeskip: true },
  caught: { briarling: true },
};

const { server, baseUrl } = await startStaticServer(0);
mkdirSync(artifactDir, { recursive: true });

const phase = (page) => page.locator(".battle-controls").getAttribute("data-battle-phase");
const logText = (page) => page.locator(".battle-log-text").innerText();
const hpText = async (page) => (await page.locator(".battler.me .battle-stat-numbers").first().innerText()).replace(/\s/g, "");
const mpText = async (page) => (await page.locator(".battler.me .battle-stat-numbers").nth(1).innerText()).replace(/\s/g, "");
const parsePair = (text) => text.split("/").map(Number);

async function boot(page, options = {}) {
  await page.addInitScript((seed) => { Math.random = () => seed; }, options.seed ?? 0.5);
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.evaluate((save) => localStorage.setItem("reliquary.save.v3", JSON.stringify(save)), SAVE);
  await page.reload({ waitUntil: "load" });
  await waitForGameBoot(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForSelector(".hud-menu", { timeout: 20_000 });
  await page.waitForFunction(() => typeof window.__reliquary?.startBattleWith === "function");
  await page.evaluate((foe) => window.__reliquary.startBattleWith("briarling", foe, [5, 4]), options.foe ?? "galeskip");
  await page.waitForSelector(".battle-controls[data-battle-phase='command']");
  await page.waitForTimeout(120);
}

async function settle(page) {
  await page.waitForFunction(() => {
    const p = document.querySelector(".battle-controls")?.getAttribute("data-battle-phase");
    return p === "command" || p === "win" || p === "lose";
  }, null, { timeout: 20_000 });
}

try {
  // Journey A + C: strike, skill MP, item consumption, binding resource use.
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await boot(page);
    const startHp = parsePair(await hpText(page));

    await page.locator('[data-command="Strike"]').click();
    await settle(page);
    assert.ok((await logText(page)).length > 5, "strike produces a combat message");
    const strikeHp = parsePair(await hpText(page));
    assert.ok(strikeHp[0] <= startHp[0] || (await phase(page)) === "win", "strike resolves against the player or wins");

    if ((await phase(page)) === "win") {
      await page.locator(".battle-continue").click();
      await page.waitForSelector(".hud-menu", { timeout: 15_000 });
    } else {
      await page.locator('[data-command="Skill"]').click();
      await page.waitForSelector(".battle-controls[data-battle-phase='skills']");
      const skillRows = await page.locator(".battle-controls-body ul.cmd button").allInnerTexts();
      assert.ok(skillRows.some((row) => /Rootgrasp/.test(row)), "learned skill is offered");
      const beforeMp = parsePair(await mpText(page));
      await page.locator(".battle-controls-body ul.cmd button", { hasText: "Rootgrasp" }).click();
      await settle(page);
      if ((await phase(page)) !== "win") {
        const afterMp = parsePair(await mpText(page));
        assert.equal(afterMp[0], beforeMp[0] - 8, "Rootgrasp spends its 8 MP");
      }
    }

    // Heal with a real item after the exchange damages the lead.
    if ((await phase(page)) === "command" && parsePair(await hpText(page))[0] < parsePair(await hpText(page))[1]) {
      const beforeInventory = await page.evaluate(() => window.__reliquary.getEconomy().inventory.tonic);
      await page.locator('[data-command="Item"]').click();
      await page.waitForSelector(".battle-controls[data-battle-phase='items']");
      await page.locator(".battle-controls-body ul.cmd button", { hasText: "Tonic" }).first().click();
      await settle(page);
      const afterInventory = await page.evaluate(() => window.__reliquary.getEconomy().inventory.tonic);
      assert.equal(afterInventory, beforeInventory - 1, "battle tonic is consumed");
    }
    await page.screenshot({ path: join(artifactDir, "battle-journey-a.png") });

    // Binding consumes a sigil through the real Bind submenu.
    if ((await phase(page)) === "command") {
      const beforeSigils = await page.evaluate(() => window.__reliquary.getEconomy().inventory.common_sigil ?? 0);
      await page.locator('[data-command="Bind"]').click();
      await page.waitForSelector(".battle-controls[data-battle-phase='bind']");
      const bindRows = await page.locator(".battle-controls-body ul.cmd button").allInnerTexts();
      assert.ok(bindRows.some((row) => /Common Sigil/.test(row)), "sigils filtered by inventory");
      await page.locator(".battle-controls-body ul.cmd button", { hasText: "Common Sigil" }).first().click();
      await settle(page);
      const afterSigils = await page.evaluate(() => window.__reliquary.getEconomy().inventory.common_sigil ?? 0);
      assert.equal(afterSigils, beforeSigils - 1, "binding consumes one sigil");
    }
    console.log("[battle-journeys] ok strike / skill MP / item / bind");
  });

  // Journey D: party switching changes the active card and preserves resources.
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await boot(page);
    await page.locator('[data-command="Party"]').click();
    await page.waitForSelector(".battle-controls[data-battle-phase='party']");
    const rows = page.locator(".battle-controls-body ul.cmd button");
    assert.ok((await rows.count()) >= 2, "party list shows reserves");
    await rows.nth(1).click();
    await settle(page);
    assert.equal(await page.locator(".battler.me .battle-status-name").innerText(), "Galeskip");
    await page.screenshot({ path: join(artifactDir, "battle-journey-d.png") });
    console.log("[battle-journeys] ok party switch");
  });

  // Journey E: victory and defeat continuation both return to exploration.
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await boot(page);
    await page.evaluate(() => window.__reliquary.setBattlePhase("win"));
    await page.waitForSelector(".battle-controls[data-battle-phase='win']");
    await page.locator(".battle-continue").click();
    await page.waitForSelector(".hud-menu", { timeout: 15_000 });
    assert.equal(await page.evaluate(() => window.__controlsTest.getPos().mode), "world");

    await page.evaluate(() => window.__reliquary.startBattleWith("briarling", "galeskip", [5, 4]));
    await page.waitForSelector(".battle-controls[data-battle-phase='command']");
    await page.evaluate(() => window.__reliquary.setBattlePhase("lose"));
    await page.waitForSelector(".battle-controls[data-battle-phase='lose']");
    await page.locator(".battle-continue").click();
    await page.waitForSelector(".dialog", { timeout: 15_000 });
    assert.equal(await page.evaluate(() => window.__controlsTest.getPos().mode), "world");
    console.log("[battle-journeys] ok win/lose continuation");
  });

  // Journey G: rotate/resize mid-encounter without losing state or controls.
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await boot(page);
    const before = await page.locator(".battler.me .battle-status-name").innerText();
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1536, height: 864 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(350);
      const probe = await page.evaluate(() => {
        const canvas = document.querySelector(".game-canvas")?.getBoundingClientRect();
        const controls = document.querySelector(".battle-controls")?.getBoundingClientRect();
        return {
          canvasW: canvas?.width ?? 0,
          canvasH: canvas?.height ?? 0,
          controlsBottom: controls?.bottom ?? 0,
          innerH: innerHeight,
          phase: document.querySelector(".battle-controls")?.getAttribute("data-battle-phase"),
          report: window.__battleStageReport?.presentation,
        };
      });
      assert.ok(probe.canvasW > 200 && probe.canvasH > 200, `canvas survives ${size.width}x${size.height}`);
      assert.ok(probe.controlsBottom <= probe.innerH + 2, "dock remains inside the viewport");
      assert.equal(probe.phase, "command");
      assert.equal(await page.locator(".battler.me .battle-status-name").innerText(), before, "active creature preserved");
    }
    console.log("[battle-journeys] ok live resize");
  });

  console.log("[battle-journeys] all journeys passed");
} finally {
  server.close();
}
