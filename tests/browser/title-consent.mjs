// S02: New Game over a usable save requires informed replacement consent.
// Cancel is the safe default; nothing changes until the player confirms.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { measureTargetVisibility, startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

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
  await withBrowser(async (page, context) => {
    await page.addInitScript(({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    }, { key: SAVE_KEY, value: JSON.stringify(oldRun) });
    await page.goto(baseUrl);
    await page.getByRole("button", { name: "New Game", exact: true }).tap();
    const warning = page.locator("#new-game-confirm-detail");
    assert.equal((await measureTargetVisibility(warning)).fullyVisible, true,
      "short landscape shows the replacement warning at 200% text");
    const screen = page.locator(".title-screen");
    const sizing = await screen.evaluate((el) => ({
      scrollHeight: el.scrollHeight, height: el.clientHeight,
    }));
    if (sizing.scrollHeight > sizing.height) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart", touchPoints: [{ x: 270, y: 240 }],
      });
      for (let y = 210; y >= 60; y -= 30) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove", touchPoints: [{ x: 270, y }],
        });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForFunction(() => document.querySelector(".title-screen").scrollTop > 0);
      await cdp.detach();
    }
    const keep = page.getByRole("button", { name: "Keep current save", exact: true });
    assert.equal((await measureTargetVisibility(keep)).hitOk, true,
      "the safe action is reachable by touch after reading");
    await keep.tap();
    assert.deepEqual(await slotsOf(page), { primary: JSON.stringify(oldRun), backup: null });
  }, { textScale: 2, context: { viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true } });

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
    assert.ok(await page.locator("#new-game-confirm-detail").isVisible(), "replacement consequences remain visible on mobile");
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

    await page.click(".hud-menu");
    assert.equal(await page.getByRole("dialog", { name: "Lantern" }).getByRole("button", { name: "Close", exact: true }).count(), 1,
      "the root menu has one visible exit");
    await page.getByRole("button", { name: "Party", exact: true }).click();
    const meters = await page.locator(".beast-card .meter-kicker, .beast-card .meter-abbr").evaluateAll((nodes) => {
      const rgb = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number);
      const luminance = (color) => rgb(color).map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      return nodes.map((node) => {
        const fg = luminance(getComputedStyle(node).color);
        const bg = luminance(getComputedStyle(node.closest(".beast-card")).backgroundColor);
        return { text: node.textContent, ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
          fontSize: parseFloat(getComputedStyle(node).fontSize) };
      });
    });
    assert.equal(meters.length, 6, "three meters expose labels and numerical abbreviations");
    for (const meter of meters) assert.ok(meter.ratio >= 4.5, `${meter.text} contrast ${meter.ratio}`);
    assert.ok(meters.filter((meter) => meter.text !== "HP" && meter.text !== "MP" && meter.text !== "Lore")
      .every((meter) => meter.fontSize >= 12), "meter descriptions are at least 12 CSS pixels");
    await page.locator(".overlay-panel-close").click();
    await page.getByRole("dialog", { name: "Lantern" }).waitFor();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector(".overlay-panel") == null);

    // Confirming starts a fresh run; the first save intentionally replaces.
    await page.reload({ waitUntil: "load" });
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "New Game", exact: true }).click();
    await page.getByRole("button", { name: "Begin new game" }).click();
    await page.waitForSelector(".dialog", { timeout: 20_000 });
    // Advance the opening conversation.
    for (let i = 0; i < 6 && (await page.locator(".dialog").count()) > 0; i += 1) {
      await page.locator(".dialog-next").click({ delay: 30 });
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
  await withBrowser(async (page) => {
    const newer = JSON.stringify({ ...oldRun, worldRevision: 6, gold: 999 });
    await page.addInitScript(({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    }, { key: SAVE_KEY, value: newer });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(baseUrl);
    await waitForGameBoot(page);
    assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).count(), 0);
    assert.match(await page.getByText(/saved by a newer version/i).textContent({ timeout: 5000 }), /newer version/i);
    const assertExactExport = async () => {
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export newer save" }).click();
      const download = await downloadPromise;
      assert.equal(await readFile(await download.path(), "utf8"), newer, "export preserves the exact newer bytes");
    };
    await assertExactExport();
    assert.deepEqual(await slotsOf(page), { primary: newer, backup: null }, "checking and exporting does not touch saves");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 3; i += 1) await page.locator(".dialog-next").click();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForFunction((previous) => localStorage.getItem("reliquary.save.forward") === previous, newer);
    await page.reload({ waitUntil: "load" });
    await page.getByRole("button", { name: "Continue", exact: true }).waitFor();
    await assertExactExport();
  });
  console.log("[title-consent] New Game replacement consent passed");
} finally {
  server.close();
}
