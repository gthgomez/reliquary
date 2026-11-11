/**
 * Keyboard, pointer and touch parity for the battle command surface:
 * preview updates the highlight and details without spending a turn, the
 * logical grid matches the visible slots, unavailable commands stay inert,
 * and the Details sheet never changes combat phase.
 */
import assert from "node:assert/strict";
import { startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

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
  inventory: { tonic: 2, common_sigil: 2 },
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
  await page.evaluate(() => window.__reliquary.startBattleWith("briarling", "galeskip", [5, 4]));
  await page.waitForSelector(".battle-controls[data-battle-phase='command']");
  await page.waitForTimeout(120);
}

const phase = (page) => page.locator(".battle-controls").getAttribute("data-battle-phase");
const title = (page) => page.locator(".battle-details-title").innerText();
const selected = (page) => page.locator(".battle-action.is-selected").getAttribute("data-command");

try {
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await bootBattle(page);
    assert.equal(await selected(page), "Strike", "engine selection starts on Strike");
    assert.equal(await title(page), "Strike");

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

    // Details opens without changing phase, Escape closes it without cancelling battle.
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
    await page.locator('[data-command="Strike"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const p = document.querySelector(".battle-controls")?.getAttribute("data-battle-phase");
      return p === "command" || p === "win" || p === "lose";
    }, null, { timeout: 15_000 });
    console.log("[battle-input-parity] ok keyboard grid, preview, disabled slots, details");
  });

  // Touch family: tap targets actuate and the footer shows touch guidance.
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const context = page.context();
    await context.addInitScript(() => { Math.random = () => 0.5; });
    await bootBattle(page);
    assert.equal(await page.locator(".battle-touch-hint").isVisible(), true, "touch hint visible");
    assert.equal(await page.locator(".battle-key-hints").isVisible(), false, "keyboard hints hidden on touch");
    await page.locator('[data-command="Skill"]').tap();
    await page.waitForSelector(".battle-controls[data-battle-phase='skills']");
    assert.equal(await phase(page), "skills");
    await page.locator(".battle-back").tap();
    await page.waitForSelector(".battle-controls[data-battle-phase='command']");
    console.log("[battle-input-parity] ok touch tap targets and hints");
  }, { context: { hasTouch: true } });

  console.log("[battle-input-parity] parity complete");
} finally {
  server.close();
}
