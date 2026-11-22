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

const openConsentWithDoubleClick = async (page) => {
  const newGame = page.getByRole("button", { name: "New Game", exact: true });
  const newGameBox = await newGame.boundingBox();
  assert.ok(newGameBox);
  await page.mouse.click(
    newGameBox.x + newGameBox.width / 2,
    newGameBox.y + newGameBox.height / 2,
    { clickCount: 2, delay: 40 },
  );
  const confirm = page.getByRole("alertdialog");
  await page.waitForTimeout(80);
  assert.ok(await confirm.isVisible(), "a rapid second click at the original New Game point does not bypass the question");
  const confirmationActionBoxes = await confirm.locator("button").evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }));
  assert.ok(confirmationActionBoxes.every((box) =>
    box.right <= newGameBox.x || box.left >= newGameBox.x + newGameBox.width ||
    box.bottom <= newGameBox.y || box.top >= newGameBox.y + newGameBox.height),
  "confirmation actions stay outside the original New Game hit area");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Keep current save",
    "the old New Game point does not move focus outside the confirmation");
};

const { server, baseUrl } = await startStaticServer(0);

try {
  await withBrowser(async (page, context) => {
    await page.addInitScript(({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    }, { key: SAVE_KEY, value: JSON.stringify(oldRun) });
    await page.goto(baseUrl);
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "New Game", exact: true }).tap();
    await page.waitForFunction(() => document.querySelector(".title-screen")?.scrollTop === 0);
    const warning = page.locator("#new-game-confirm-detail");
    assert.equal((await measureTargetVisibility(warning)).fullyVisible, true,
      "short landscape shows the replacement warning at 200% text");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal((await measureTargetVisibility(warning)).fullyVisible, true,
      "the open confirmation remains readable after rotating to portrait");
    assert.equal(await page.locator('.title-confirm').evaluate((panel) => panel.scrollWidth <= panel.clientWidth), true,
      '200% confirmation actions stay within the portrait panel');
    await page.setViewportSize({ width: 568, height: 320 });
    assert.equal((await measureTargetVisibility(warning)).fullyVisible, true,
      "the warning returns fully into view after rotating to short landscape");
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
      "the safe action is reachable after touch scrolling");
    await keep.click();
    await page.getByRole("button", { name: "New Game", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "New Game",
      "Keep current save returns focus to the action that opened the question");
    assert.deepEqual(await slotsOf(page), { primary: JSON.stringify(oldRun), backup: null });
  }, { textScale: 2, context: { viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true } });

  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: "load" });
    await page.evaluate((value) => localStorage.setItem('reliquary.save.v3', JSON.stringify(value)), oldRun);
    await page.reload({ waitUntil: "load" });
    await waitForGameBoot(page);

    // Continue is the safe default, and New Game remains a quieter option.
    await page.getByRole("button", { name: "New Game", exact: true }).waitFor();
    const continueButton = page.getByRole("button", { name: "Continue", exact: true });
    assert.ok(await continueButton.isVisible());
    const actions = await page.locator(".title-actions > button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { label: button.textContent.trim(), className: button.className, width: rect.width, height: rect.height };
      }));
    assert.equal(actions[0]?.label, "Continue");
    assert.match(actions[0]?.className ?? "", /btn-primary/);
    assert.equal(actions[1]?.label, "New Game");
    assert.match(actions[1]?.className ?? "", /btn-ghost/);
    assert.ok(actions.every((action) => action.width >= 44 && action.height >= 44),
      "both title actions meet the 44px touch target");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Continue",
      "keyboard focus begins on the safe Continue action");
    assert.equal(await continueButton.evaluate((button) => button.matches(":focus-visible")), true,
      "keyboard focus has a visible ring");

    // The title remains usable when the device rotates to landscape and back.
    await page.setViewportSize({ width: 844, height: 390 });
    assert.equal((await measureTargetVisibility(continueButton)).fullyVisible, true,
      "Continue stays reachable after rotating the title to landscape");
    assert.equal((await measureTargetVisibility(page.getByRole("button", { name: "New Game", exact: true }))).fullyVisible, true,
      "New Game stays reachable after rotating the title to landscape");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 844,
      "the rotated title has no horizontal overflow");
    await page.setViewportSize({ width: 568, height: 320 });
    await openConsentWithDoubleClick(page);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector(".title-confirm") == null);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "New Game",
      "Escape returns focus after the short-landscape consent question");
    assert.deepEqual(await slotsOf(page), { primary: JSON.stringify(oldRun), backup: null });
    await page.setViewportSize({ width: 390, height: 844 });

    // First activation only asks; repeated clicks stay on the question.
    await openConsentWithDoubleClick(page);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Begin new game",
      "Tab advances between the confirmation actions");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Keep current save",
      "Tab wraps from the last confirmation action to the first");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Begin new game",
      "Shift+Tab wraps from the first confirmation action to the last");
    assert.ok(await page.locator("#new-game-confirm-detail").isVisible(), "replacement consequences remain visible on mobile");

    // Escape cancels: no state change.
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector(".title-confirm") == null);
    assert.deepEqual(await slotsOf(page), { primary: JSON.stringify(oldRun), backup: null });
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "New Game",
      "Escape returns focus to the action that opened the question");

    // The Keep button cancels too; reload+Continue restores the old run.
    await page.getByRole("button", { name: "New Game", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Keep current save");
    await page.getByRole("button", { name: "Keep current save" }).tap();
    await page.waitForFunction(() => document.querySelector(".title-confirm") == null);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "New Game",
      "Keep current save returns focus to the action that opened the question");
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
  }, { context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } });
  await withBrowser(async (page) => {
    await page.goto(baseUrl);
    await waitForGameBoot(page);
    assert.equal(await page.getByRole("button", { name: "Start", exact: true }).count(), 1,
      "a fresh profile sees Start");
    assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).count(), 0,
      "a fresh profile has no Continue action");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Start",
      "keyboard focus reaches Start on a fresh profile");
    await page.keyboard.press("Enter");
    await page.locator(".dialog").waitFor();
    assert.match(await page.locator(".dialog").innerText(), /A lantern ticks on the sill/,
      "Start enters the cottage opening");
    assert.match(await page.locator(".game-root").getAttribute("class"), /is-cottage/,
      "the fresh opening uses the playable cottage layout");
    for (let i = 0; i < 3; i += 1) {
      await page.locator(".dialog-next").click();
      await page.waitForTimeout(100);
    }
    await page.waitForSelector(".hud-menu", { timeout: 20_000 });
    assert.match(await page.locator(".game-root").getAttribute("class"), /is-cottage/,
      "the player can move into the cottage after the opening dialogue");
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
