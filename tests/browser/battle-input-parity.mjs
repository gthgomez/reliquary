/**
 * Keyboard, pointer and touch parity for the battle command surface:
 * preview updates the highlight and details without spending a turn, the
 * logical grid matches the visible slots, unavailable commands stay inert,
 * and opening the battle log never changes combat phase.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { measureTargetVisibility, startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

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
      uid: "input-lead",
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
  ],
  box: [],
  inventory: { tonic: 2, etherdrop: 2, common_sigil: 2 },
  flags: { starter: true },
  seen: { briarling: true, galeskip: true },
  caught: { briarling: true },
};

const { server, baseUrl } = await startStaticServer(0);

async function bootBattle(page) {
  await page.addInitScript(() => { Math.random = () => 0.5; });
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.evaluate((save) => localStorage.setItem("reliquary.save.v3", JSON.stringify(save)), SAVE);
  await page.reload({ waitUntil: "load" });
  await waitForGameBoot(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForSelector(".hud-menu", { timeout: 20_000 });
  await page.waitForFunction(() => typeof window.__reliquary?.startBattleWith === "function");
  await page.mouse.move(0, 0); // keep Continue's pointer position from previewing a battle slot
  await page.evaluate(() => window.__reliquary.startBattleWith("briarling", "galeskip", [5, 4]));
  await page.waitForSelector(".battle-controls[data-battle-phase='command']");
  await page.waitForTimeout(120);
}

const phase = (page) => page.locator(".battle-controls").getAttribute("data-battle-phase");
const title = (page) => page.locator(".battle-details-title").innerText();
const selected = (page) => page.locator(".battle-action.is-selected").getAttribute("data-command");
const command = (page, id) => page.locator(`[data-command="${id}"]`);

async function checkVerticalNavigation(page, destination, screenshotName) {
  await command(page, "Strike").focus();
  const strike = await command(page, "Strike").boundingBox();
  const below = await command(page, destination).boundingBox();
  assert.ok(strike && below, "expected both command buttons to render");
  assert.ok(Math.abs(strike.x - below.x) <= 1 && below.y > strike.y, `${destination} must appear below Strike`);

  await page.keyboard.press("ArrowDown");
  const evidence = process.env.RELIQUARY_BROWSER_ARTIFACTS;
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, `${screenshotName}.png`) });
  }
  assert.equal(await selected(page), destination, `Down from Strike must select ${destination}`);
  assert.equal(await command(page, destination).evaluate((el) => el === document.activeElement), true);
  assert.equal(await title(page), destination);
  assert.equal(await phase(page), "command", "navigation previews without executing an action");
}

try {
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await bootBattle(page);
    assert.equal(await selected(page), "Strike", "engine selection starts on Strike");
    assert.equal(await title(page), "Strike");

    assert.match(await page.locator(".battle-status-card.me").innerText(), /Verdant/);
    assert.match(await page.locator(".battle-status-card.foe").innerText(), /Gale/);
    assert.match(await page.locator(".battle-status-card.me").getAttribute("aria-label"), /Verdant/);
    await page.keyboard.press("h");
    const openingLog = page.getByRole("region", { name: "Battle log" });
    await openingLog.waitFor({ timeout: 3_000 });
    assert.match(await openingLog.innerText(), /Galeskip/i, "the opening encounter should be in the log");
    await page.keyboard.press("Escape");
    await openingLog.waitFor({ state: "hidden" });
    assert.equal(await command(page, "Strike").evaluate((el) => el === document.activeElement), true);

    // Spatial navigation follows the visible 3x2 grid.
    await page.keyboard.press("ArrowRight");
    assert.equal(await selected(page), "Skill");
    assert.equal(await title(page), "Skill");
    await page.keyboard.press("ArrowDown");
    assert.equal(await selected(page), "Party", "down from Skill lands on Party");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await selected(page), "Bind");
    await page.keyboard.press("ArrowUp");
    assert.equal(await selected(page), "Strike");

    // Pointer hover previews without acting.
    await page.hover('[data-command="Item"]');
    assert.equal(await selected(page), "Item");
    assert.equal(await title(page), "Item");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await selected(page), "Skill", "arrow keys still work after hover");
    assert.equal(await title(page), "Skill");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await selected(page), "Strike");

    // Keyboard confirm executes exactly one turn.
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const p = document.querySelector(".battle-controls")?.getAttribute("data-battle-phase");
      return p === "command" || p === "win" || p === "lose";
    });
    const recapCount = await page.locator(".battle-controls-body .battle-recap li, #battle-recap-panel .battle-recap li").count();
    assert.ok(recapCount <= 8, `recap bounded: ${recapCount}`);

    // The log opens without changing phase. Escape closes it without cancelling battle.
    await page.evaluate(() => window.__reliquary.setBattlePhase("command"));
    await page.waitForSelector(".battle-controls[data-battle-phase='command']");
    await page.keyboard.press("h");
    await page.waitForSelector("#battle-recap-panel");
    assert.equal(await phase(page), "command", "details must not change phase");
    assert.ok(await page.locator("#battle-recap-panel .battle-recap").isVisible());
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#battle-recap-panel"));
    assert.equal(await phase(page), "command", "closing details must not cancel the battle");

    // Restricted encounter: fixed six slots, Bind/Flee inert, identity preserved.
    await page.evaluate(() => window.__reliquary.setBattleRestrictions({ canBind: false, canFlee: false }));
    await page.waitForSelector(".battle-controls[data-battle-phase='command']");
    const slots = await page.evaluate(() => [...document.querySelectorAll(".battle-action")].map((el) => ({
      command: el.getAttribute("data-command"),
      disabled: el.getAttribute("aria-disabled"),
      label: el.getAttribute("aria-label"),
    })));
    assert.deepEqual(slots.map((slot) => slot.command), ["Strike", "Skill", "Item", "Bind", "Party", "Flee"]);
    assert.equal(slots.find((slot) => slot.command === "Bind")?.disabled, "true");
    assert.equal(slots.find((slot) => slot.command === "Flee")?.disabled, "true");
    assert.match(slots.find((slot) => slot.command === "Bind")?.label ?? "", /not offered/i);

    await page.locator('[data-command="Strike"]').focus();
    await page.keyboard.press("ArrowDown");
    assert.equal(await selected(page), "Bind", "disabled slot remains reachable for its explanation");
    assert.equal(await title(page), "Bind");
    assert.match(await page.locator(".battle-details-copy").innerText(), /does not permit binding/i);
    await page.keyboard.press("ArrowRight");
    assert.equal(await selected(page), "Party", "navigation agrees with the visible grid around disabled cells");
    await page.keyboard.press("ArrowLeft");
    await page.locator('[data-command="Bind"]').click({ force: true });
    await page.waitForTimeout(250);
    assert.equal(await phase(page), "command", "disabled Bind must not open a submenu or act");
    // Z is a supported confirm key; while an inert slot owns the visible
    // highlight it must not execute the last live engine index.
    await page.keyboard.press("z");
    await page.waitForTimeout(250);
    assert.equal(await phase(page), "command", "Z must stay inert for a disabled visible selection");
    await page.locator('[data-command="Strike"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const p = document.querySelector(".battle-controls")?.getAttribute("data-battle-phase");
      return p === "command" || p === "win" || p === "lose";
    }, null, { timeout: 15_000 });
    console.log("[battle-input-parity] ok keyboard grid, preview, disabled slots, details");
  });

  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootBattle(page);
    await checkVerticalNavigation(page, "Item", "battle-command-portrait");
    await page.keyboard.press("ArrowRight");
    assert.equal(await selected(page), "Bind", "Right from Item must select Bind in portrait");

    // The same live encounter responds to rotation without a reload.
    await page.setViewportSize({ width: 844, height: 390 });
    assert.equal(await selected(page), "Bind", "rotation preserves the selected command identity");
    await checkVerticalNavigation(page, "Bind", "battle-command-landscape");

    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => window.__reliquary.setBattleRestrictions({ canBind: false, canFlee: false }));
    await checkVerticalNavigation(page, "Item", "battle-command-narrow-portrait");
    await page.keyboard.press("ArrowRight");
    assert.equal(await selected(page), "Bind", "portrait navigation includes unavailable commands");
    assert.equal(await command(page, "Bind").getAttribute("aria-disabled"), "true");
    await page.keyboard.press("z");
    assert.equal(await phase(page), "command", "unavailable Bind remains inert in portrait");
    console.log("[battle-input-parity] ok portrait and landscape grid, rotation, focus and disabled commands");
  });

  // Compact keyboard list navigation must scroll the focused row into view.
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 640, height: 320 });
    await bootBattle(page);
    await page.locator('[data-command="Item"]').click();
    await page.waitForSelector(".battle-controls[data-battle-phase='items']");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    const scrolled = await page.evaluate(() => {
      const selected = document.querySelector(".battle-controls-body .active");
      const body = document.querySelector(".battle-controls-body");
      if (!selected || !body) return null;
      const s = selected.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      return {
        text: selected.textContent,
        scrollTop: body.scrollTop,
        visible: s.top >= b.top - 1 && s.bottom <= b.bottom + 1,
      };
    });
    assert.ok(scrolled, "compact item list probe missing");
    assert.match(scrolled.text ?? "", /Etherdrop/);
    assert.ok(scrolled.scrollTop > 0, "focused row must scroll the submenu body");
    assert.equal(scrolled.visible, true, "focused row must be fully visible");
    console.log("[battle-input-parity] ok submenu keyboard scroll");
  });

  // Touch family: tap targets actuate and the log is available immediately.
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const context = page.context();
    await context.addInitScript(() => { Math.random = () => 0.5; });
    await bootBattle(page);
    assert.equal(await page.locator(".battle-key-hints").isVisible(), false, "keyboard hints hidden on touch");
    const log = page.getByRole("button", { name: "Battle log" });
    const logBounds = await log.boundingBox();
    assert.ok(logBounds && logBounds.width >= 44 && logBounds.height >= 44, "battle log is a comfortable touch target");
    await log.tap();
    assert.equal(await phase(page), "command", "opening the log with touch must preserve the current turn");
    await page.getByRole("button", { name: "Close" }).tap();
    assert.equal(await log.evaluate((el) => el === document.activeElement), true);
    await page.locator('[data-command="Skill"]').tap();
    await page.waitForSelector(".battle-controls[data-battle-phase='skills']");
    assert.equal(await phase(page), "skills");
    assert.match(await page.locator(".battle-details-copy").innerText(), /Strong against this foe/i);
    await page.locator(".battle-back").tap();
    await page.waitForSelector(".battle-controls[data-battle-phase='command']");
    console.log("[battle-input-parity] ok touch tap targets and hints");
  }, { context: { hasTouch: true } });

  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await bootBattle(page);
    for (const control of await page.locator(".battle-action, .battle-details-toggle").all()) {
      const appearance = await measureTargetVisibility(control);
      assert.ok(appearance.fullyVisible && appearance.hitOk && appearance.box.height >= 44,
        `control must remain reachable at 200% text: ${await control.innerText()} ${JSON.stringify(appearance)}`);
    }
    assert.equal(await page.locator(".battle-status-elements").count(), 2);
    await checkVerticalNavigation(page, "Item", "battle-command-narrow-200");
    console.log("[battle-input-parity] ok narrow double-text controls and focus");
  }, { textScale: 2, context: { hasTouch: true, reducedMotion: "reduce" } });

  console.log("[battle-input-parity] parity complete");
} finally {
  server.close();
}
