// S02: New Game over a usable save requires informed replacement consent.
// Cancel is the safe default; nothing changes until the player confirms.
import assert from "node:assert/strict";
import { startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

const SAVE_KEY = "reliquary.save.v3";

const oldRun = {
  version: 3,
  worldRevision: 1,
  playerName: "Rowan",
  mapId: "elderhall",
  x: 12,
  y: 14,
  dir: 0,
  gold: 137,
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
  ],
  box: [],
  inventory: { tonic: 1 },
  flags: { starter: true },
  seen: { emberkit: true },
  caught: { emberkit: true },
};

const slotsOf = (page) =>
  page.evaluate(() => ({
    primary: localStorage.getItem("reliquary.save.v3"),
    backup: localStorage.getItem("reliquary.save.v3.bak"),
  }));

const { server, baseUrl } = await startStaticServer(0);

try {
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: "load" });
    await page.evaluate((value) => localStorage.setItem('reliquary.save.v3', JSON.stringify(value)), oldRun);
    await page.reload({ waitUntil: "load" });
    await waitForGameBoot(page);

    // A returning player sees New Game, with Continue still prominent.
    await page.getByRole("button", { name: "New Game", exact: true }).waitFor();
    assert.ok(await page.getByRole("button", { name: "Continue", exact: true }).isVisible());

    // First activation only asks; repeated clicks stay on the question.
    await page.getByRole("button", { name: "New Game", exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.waitFor();
    await page.getByRole("button", { name: "New Game", exact: true }).click().catch(() => {});
    assert.ok(await confirm.isVisible(), "repeated clicks do not bypass the question");

    // Escape cancels: no state change.
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector(".title-confirm") == null);
    assert.deepEqual(await slotsOf(page), { primary: JSON.stringify(oldRun), backup: null });

    // The Keep button cancels too; reload+Continue restores the old run.
    await page.getByRole("button", { name: "New Game", exact: true }).click();
    await page.getByRole("button", { name: "Keep current save" }).click();
    await page.waitForFunction(() => document.querySelector(".title-confirm") == null);
    await page.reload({ waitUntil: "load" });
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForSelector(".hud-menu", { timeout: 20_000 });
    const hud = await page.locator(".hud").innerText();
    assert.match(hud, /137 cr/, "the old run survives cancellation");

    // Confirming starts a fresh run; the first save intentionally replaces.
    await page.reload({ waitUntil: "load" });
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "New Game", exact: true }).click();
    await page.getByRole("button", { name: "Begin new game" }).click();
    await page.waitForSelector(".dialog", { timeout: 20_000 });
    // Advance the opening conversation.
    for (let i = 0; i < 6 && (await page.locator(".dialog").count()) > 0; i += 1) {
      await page.locator(".dialog").click({ delay: 30 });
      await page.waitForTimeout(100);
    }
    await page.waitForSelector(".hud-menu", { timeout: 20_000 });
    const freshHud = await page.locator(".hud").innerText();
    assert.match(freshHud, /180 cr/, "a fresh run starts with starting gold");
    await page.click(".hud-menu");
    await page.waitForSelector(".overlay-panel");
    await page.locator(".overlay-panel .menu-list button", { hasText: "Save" }).click();
    await page.waitForSelector(".hud-menu");
    const afterFirst = await slotsOf(page);
    assert.notEqual(JSON.parse(afterFirst.primary).gold, 137, "the new run is on disk");
    assert.equal(JSON.parse(afterFirst.backup).gold, 137, "the old run rotated to backup exactly as designed");
  });
  console.log("[title-consent] New Game replacement consent passed");
} finally {
  server.close();
}
