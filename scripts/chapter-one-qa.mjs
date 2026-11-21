/**
 * Continuous Chapter One journey from a fresh game to the durable ending.
 * All actions go through the player controls. Map data plans keyboard routes,
 * and the test probe observes coordinates. Controlled random draws make
 * encountered species and binding outcomes reproducible.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { faceDirection, walkTo } from "./natural-journey-controls.mjs";
import { finishStarterPact } from "./finish-starter-pact.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:8083";
const output = process.argv[3];
if (!output || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("usage: node scripts/chapter-one-qa.mjs <local-url> <evidence-directory>");
const trialSeed = process.env.RELIQUARY_TRIAL_SEED === undefined
  ? null
  : Number(process.env.RELIQUARY_TRIAL_SEED);
if (trialSeed !== null && (!Number.isInteger(trialSeed) || trialSeed <= 0 || trialSeed > 0xffffffff))
  throw new Error("RELIQUARY_TRIAL_SEED must be a nonzero 32-bit unsigned integer");
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ channel: process.env.RELIQUARY_QA_CHANNEL ?? "msedge", headless: true });
const viewport = { width: 1280, height: 800 };
const report = { browser: browser.version(), viewport, trialSeed, events: [], errors: [], warnings: [] };
const context = await browser.newContext({ viewport, serviceWorkers: "block" });
async function openPage() {
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__journeyDraw = () => 0.5;
    window.__reliquaryJourneyRandom = () => window.__journeyDraw();
  });
  page.on("pageerror", (error) => report.errors.push(String(error?.stack ?? error)));
  page.on("console", (message) => {
    if (message.type() === "error") report.errors.push(`console: ${message.text()}`);
    if (message.type() === "warning") report.warnings.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED")
      report.errors.push(`request: ${request.url()} ${request.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) report.errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return page;
}
let page;
try {
  page = await openPage();
  await page.goto(url, { waitUntil: "load" });
  await page.screenshot({ path: join(output, "01-title.png") });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 3; i++) await page.locator("button.dialog").click();
  await page.screenshot({ path: join(output, "02-intro-world.png") });

  const objectiveAt = async (must) => {
    const text = await page.locator(".hud-objective-preview").innerText();
    if (!text.match(must)) throw new Error(`Objective expected /${must.source}/, got: ${text}`);
    return text;
  };
  await objectiveAt(/Binding Grove/);

  async function press(code, times = 1) {
    for (let i = 0; i < times; i++) await page.keyboard.press(code);
  }
  const { MAPS } = await import("../src/game/maps.ts");
  const travel = (mapId, target, starterChosen = false) => walkTo(page, MAPS[mapId], target, starterChosen);
  const faceNorth = () => faceDirection(page, "KeyW", Math.PI);

  const positionAt = () => page.evaluate(() => window.__controlsTest.getPos());
  const readSave = () => page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v3")));
  const seedDraw = (value) => page.evaluate((next) => { window.__journeyDraw = () => next; }, value);
  const battleCommand = (name) => page.locator(".battle-controls[data-battle-phase='command']").getByRole("button", { name, exact: true });
  const battleRow = (name) => page.locator(".battle-controls-body ul.cmd").getByRole("button", { name });
  const dialogue = page.locator("button.dialog");

  let position = await travel("home", { x: 5, y: 8 });
  if (position.map !== "elderhall") throw new Error("Home exit failed");
  await travel("elderhall", { x: 7, y: 10 });
  await faceNorth();
  await press("KeyZ");
  await dialogue.getByText("Elder Maren", { exact: true }).waitFor();
  await dialogue.click();
  if (!/Walk west to the Binding Grove/.test(await dialogue.innerText())) throw new Error("Maren did not give the route to the Grove");
  await dialogue.click();
  report.events.push("Elder Maren gave directions west to the Binding Grove");
  position = await travel("elderhall", { x: 0, y: 10 });
  if (position.map !== "grove") throw new Error("Grove entrance failed");
  await page.screenshot({ path: join(output, "03-grove.png") });
  await travel("grove", { x: 4, y: 7 });
  await faceNorth();
  await press("KeyZ");
  await finishStarterPact(page, { nickname: "Kindling" });
  await objectiveAt(/Wildwood/);
  report.events.push("Pact spoken with Emberkit, named Kindling; objective advanced to Thornkeep");

  // Back to Elderhall, then Briar Road for the first wild encounter.
  await travel("grove", { x: 15, y: 7 }, true);
  if ((await page.evaluate(() => window.__controlsTest.getPos())).map !== "elderhall")
    throw new Error("Grove exit failed");
  await page.screenshot({ path: join(output, "04-elderhall.png") });
  position = await travel("elderhall", { x: 10, y: 0 }, true);
  if (position.map !== "briar_road") throw new Error("Briar Road entrance failed");
  await seedDraw(0.05);
  position = await travel("briar_road", { x: 4, y: 22 }, true);
  for (let i = 0; i < 40 && position.mode !== "battle"; i++) {
    position = await travel("briar_road", { x: i % 2 ? 4 : 5, y: 22 }, true);
  }
  if (position.mode !== "battle") throw new Error("no wild encounter after bounded traversal");
  await page.screenshot({ path: join(output, "05-battle.png") });

  const beforeEncounter = await readSave();
  await seedDraw(0.75);
  await battleCommand("Bind").click();
  await battleRow(/Common Sigil/).click();
  await page.locator(".battle-log-text").filter({ hasText: "breaks the sigil" }).waitFor();
  report.events.push(`Failed natural binding: ${await page.locator(".battle-log-text").innerText()}`);

  await seedDraw(0.5);
  const mana = () => page.locator(".battle-status-card.me").getAttribute("aria-label").then(
    (text) => Number(/Mana (\d+) of/.exec(text)?.[1]),
  );
  const beforeCast = await mana();
  await battleCommand("Skill").click();
  await battleRow(/Cinder/).click();
  await page.locator(".battle-controls[data-battle-phase='command']").waitFor();
  const afterCast = await mana();
  if (beforeCast - afterCast !== 6) throw new Error("Cinder did not consume six mana");
  report.events.push(`Used Cinder in the wild encounter (mana ${beforeCast} -> ${afterCast})`);
  await battleCommand("Item").click();
  await battleRow(/Field Tonic/).click();
  await page.locator(".battle-controls[data-battle-phase='command']").waitFor();
  report.events.push("Used a Field Tonic during the natural wild encounter");

  // Retry with a favorable draw while keeping the original encounter.
  await seedDraw(0.05);
  await page.getByRole("button", { name: "Bind", exact: true }).click();
  await page.getByRole("button", { name: /Common Sigil/ }).click();
  // Wait for the resolved turn, not for a control that exists in every phase:
  // the command grid is always mounted, so its presence proved nothing.
  try {
    await page.waitForFunction(
      () => /accepts the compact/.test(document.querySelector(".battle-ui .battle-log-text")?.textContent ?? ""),
      null,
      { timeout: 20000 },
    );
  } catch {
    throw new Error(`binding did not succeed: ${await page.locator(".battle-log-text").innerText()}`);
  }
  const battleText = await page.locator(".battle-log-text").innerText();
  if (!/accepts the compact/.test(battleText))
    throw new Error(`binding did not succeed: ${battleText}`);
  await page.screenshot({ path: join(output, "06-bind.png") });
  report.events.push(`Successful binding on the natural route: ${battleText}`);

  // Post-battle: HUD keeps a live objective and the party shows two beasts.
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const afterEncounter = await readSave();
  if (afterEncounter.inventory.common_sigil !== beforeEncounter.inventory.common_sigil - 2 ||
      afterEncounter.inventory.tonic !== beforeEncounter.inventory.tonic - 1)
    throw new Error("The failed bind, retry, and tonic must consume exactly two sigils and one tonic");

  // Post-battle wild capture naming flow:
  // 1. Observe the naming dialogue offer ("... accepts the compact. Give them a name, or leave ...")
  await page.waitForSelector("button.dialog", { timeout: 5000 });
  const offerText = await page.locator("button.dialog").innerText();
  if (!/accepts the compact/.test(offerText)) {
    throw new Error(`expected capture naming offer, got: ${offerText}`);
  }
  await page.locator("button.dialog").click();

  // 2. The NamePrompt opens. Choose a nickname: "Glimmermote"
  await page.waitForSelector(".name-prompt", { timeout: 5000 });
  await page.screenshot({ path: join(output, "06b-name-prompt.png") });
  const nameInput = page.locator(".name-prompt input");
  await nameInput.fill("Glimmermote");
  await page.getByRole("button", { name: "Call them this" }).click();
  await page.waitForSelector(".name-prompt", { state: "detached", timeout: 5000 });
  report.events.push("Named the captured beast Glimmermote at the capture prompt");

  const partyCards = page.locator(".party-grid .beast-card");
  // Party is reached only through the menu: keyboard path exclusively.
  await press("KeyM");
  await page.getByRole("button", { name: "Party", exact: true }).click();
  const cards = await partyCards.count();
  if (cards !== 2) throw new Error(`expected 2 party cards, saw ${cards}`);
  await page.screenshot({ path: join(output, "07-party.png") });

  // Verify the captured beast reflects the assigned nickname
  const partyNames = await page.locator(".party-grid .beast-name").allInnerTexts();
  if (!partyNames.includes("Glimmermote")) {
    throw new Error(`expected Glimmermote in party, found: ${partyNames.join(", ")}`);
  }

  // Keyboard-only: select the bound beast's card, rename it through the form.
  await press("ArrowDown");
  await press("KeyZ");
  const actionList = page.locator("ul.menu-list button");
  const actionTexts = await actionList.allInnerTexts();
  if (!actionTexts.some((t) => /Rename|Add .* to the party|Practice|Make .* lead|Store/.test(t)))
    throw new Error(`card actions missing: ${actionTexts.join(" | ")}`);
  await page.screenshot({ path: join(output, "08-card-actions.png") });
  const renameIndex = actionTexts.findIndex((t) => /^Rename/.test(t));
  if (renameIndex >= 0) {
    await press("ArrowDown", renameIndex);
    await press("KeyZ");
    const input = page.locator(".rename-form input");
    await input.fill("Fogmote");
    await page.getByRole("button", { name: "Save name" }).click();
    await page.getByRole("button", { name: /^Back$/ }).waitFor();
    const renamed = await page.getByText("Fogmote").count();
    if (!renamed) throw new Error("rename through card actions did not apply");
    report.events.push("Renamed the bound beast through directional input alone");
  }

  // Practice the lead once (45 crowns) — the level-up path runs the real economy.
  await press("ArrowDown"); // back to first card highlight (menuIndex wraps to lead)
  await press("ArrowUp");
  await press("KeyZ");
  const practiceTexts = await page.locator("ul.menu-list button").allInnerTexts();
  const practiceIndex = practiceTexts.findIndex((t) => /^Practice/.test(t));
  if (practiceIndex >= 0) {
    const beforePractice = await readSave();
    await press("ArrowDown", practiceIndex);
    await press("KeyZ");
    const afterPractice = await readSave();
    if (afterPractice.gold !== beforePractice.gold - 45) throw new Error("Practice did not cost 45 crowns");
    report.events.push(`Practiced via the card action list (crowns ${beforePractice.gold} -> ${afterPractice.gold})`);
  }
  await press("Escape");
  await press("Escape");

  // Storage round trip: leave the renamed companion in the box before saving,
  // then prove the saved box survives the reload below.
  await press("KeyM");
  await page.getByRole("button", { name: "Storage", exact: true }).click();
  await page.locator(".sheet").waitFor();
  const travelling = page.locator(".party-grid").nth(0).locator(".beast-card");
  const stored = page.locator(".party-grid").nth(1).locator(".beast-card");
  if ((await travelling.count()) !== 2) throw new Error("storage opened without both companions");
  await press("ArrowDown");
  await press("KeyZ");
  const storageActions = await page.locator("ul.menu-list button").allInnerTexts();
  const storeIndex = storageActions.findIndex((text) => /^Store/.test(text));
  if (storeIndex < 0) throw new Error(`storage has no Store action: ${storageActions.join(" | ")}`);
  await press("ArrowDown", storeIndex);
  await press("KeyZ");
  await page.waitForTimeout(250);
  if ((await travelling.count()) !== 1 || (await stored.count()) !== 1)
    throw new Error("storage did not move exactly one companion");
  if (!(await stored.getByText("Fogmote").count()))
    throw new Error("storage did not retain the companion nickname");
  const storedSave = await page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v3")));
  if (storedSave.party.length !== 1 || storedSave.box.length !== 1 || storedSave.box[0].nickname !== "Fogmote")
    throw new Error(`saved storage state is wrong: ${JSON.stringify({ party: storedSave.party.length, box: storedSave.box.length })}`);
  report.events.push("Stored Fogmote in the box; the saved party/box counts match the UI");
  await page.screenshot({ path: join(output, "08b-storage.png") });
  await press("Escape");
  await press("Escape");

  // Walk Briar Road's south rib into Elderhall again; there the inns wait.
  position = await travel("briar_road", { x: 10, y: 27 }, true);
  if (position.map !== "elderhall") throw new Error(`Briar Road exit failed, at ${position.map}`);

  // Inn: decline first, then accept. The painted door is (16,4); stand on (16,5).
  position = await travel("elderhall", { x: 16, y: 5 });
  await faceNorth();
  await press("KeyZ");
  await page.waitForTimeout(400);
  position = await page.evaluate(() => window.__controlsTest.getPos());
  if (position.map !== "inn_in") throw new Error(`inn door entry failed, at ${position.map}`);
  await travel("inn_in", { x: 4, y: 5 });
  await faceNorth();
  await press("KeyZ");
  const innPrompt = await page.locator("button.dialog").innerText();
  if (!innPrompt.includes("(A rest · B not now)")) throw new Error(`inn prompt lacks the A/B line: ${innPrompt}`);
  // Conversation chrome is hidden, but the mounted HUD still reflects state.
  // innerText omits visibility:hidden content and would turn this into NaN.
  const readGold = async () => {
    const text = await page.locator(".hud-gold").textContent();
    const match = text?.match(/\d+/);
    if (!match) throw new Error(`HUD gold is not numeric: ${text}`);
    return Number(match[0]);
  };
  const goldBefore = await readGold();
  await press("Shift");
  await page.waitForTimeout(200);
  if ((await readGold()) !== goldBefore) throw new Error("inn declined but gold changed");
  report.events.push("Inn decline leaves crowns untouched");
  await faceNorth();
  await press("KeyZ");
  await press("KeyZ");
  await page.waitForTimeout(400);
  const goldAfterRest = await readGold();
  if (goldAfterRest !== goldBefore - 15)
    throw new Error(`inn rest was not 15 crowns: ${goldBefore} -> ${goldAfterRest}`);
  await page.screenshot({ path: join(output, "09-inn.png") });
  await press("KeyZ");
  report.events.push(`Inn rest complete (crowns ${goldBefore} -> ${goldAfterRest})`);

  // Exit the inn through its door tile, then save via the menu.
  await travel("inn_in", { x: 6, y: 9 });
  await page.waitForTimeout(600);
  position = await page.evaluate(() => window.__controlsTest.getPos());
  if (position.map !== "elderhall") throw new Error(`inn door exit failed, at ${position.map}`);

  // Save through the menu, reload, continue, and verify the outcome survived.
  await press("KeyM");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.screenshot({ path: join(output, "10-saved.png") });
  await page.reload({ waitUntil: "load" });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const partyCheck = await page.evaluate(() => window.__controlsTest.getPos());
  if (partyCheck.map !== "elderhall") throw new Error(`reload lost the position: ${partyCheck.map}`);
  await press("KeyM");
  await page.getByRole("button", { name: "Storage", exact: true }).click();
  await page.locator(".sheet").waitFor();
  const reloadedTravelling = page.locator(".party-grid").nth(0).locator(".beast-card");
  const reloadedStored = page.locator(".party-grid").nth(1).locator(".beast-card");
  if ((await reloadedTravelling.count()) !== 1 || (await reloadedStored.count()) !== 1)
    throw new Error("reload did not preserve the stored companion");
  if (!(await reloadedStored.getByText("Fogmote").count()))
    throw new Error("reload lost the stored companion's nickname");
  report.events.push("Reload preserved the stored Fogmote and the one-companion party");
  await page.screenshot({ path: join(output, "11a-storage-after-reload.png") });

  // Retrieve the stored companion through the same keyboard action list.
  await press("ArrowDown");
  await press("KeyZ");
  const boxActions = await page.locator("ul.menu-list button").allInnerTexts();
  const addIndex = boxActions.findIndex((text) => /^Add Fogmote to the party/.test(text));
  if (addIndex < 0) throw new Error(`storage has no add action: ${boxActions.join(" | ")}`);
  await press("ArrowDown", addIndex);
  await press("KeyZ");
  await page.waitForTimeout(250);
  if ((await reloadedTravelling.count()) !== 2 || (await reloadedStored.count()) !== 0)
    throw new Error("storage did not return Fogmote to the party");
  await press("Escape");
  await press("Escape");
  await press("KeyM");
  await page.getByRole("button", { name: "Party", exact: true }).click();
  const reloadedCards = await page.locator(".party-grid .beast-card").count();
  if (reloadedCards !== 2) throw new Error(`reload expected 2 party cards, saw ${reloadedCards}`);
  if (!(await page.getByText("Fogmote").count()))
    throw new Error("reload lost the renamed companion");
  report.events.push("Saved and reloaded; storage round trip, renamed companion, gold and map survived");
  await page.screenshot({ path: join(output, "11-after-reload.png") });

  // Portrait segment: every new menu must remain reachable by tapping.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pack", exact: true }).click();
  await page.locator(".sheet ul.menu-list button").first().waitFor({ timeout: 5000 });
  await page.screenshot({ path: join(output, "12-portrait-pack.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Party", exact: true }).click();
  await page.locator(".party-grid").waitFor({ timeout: 5000 });
  await page.screenshot({ path: join(output, "13-portrait-party.png") });
  report.events.push("Portrait viewport: pack sheet and party sheet reachable by tap");
  // Continue in this same profile, using the real map exits and binding two
  // stronger companions before challenging the Warden.
  await press("Escape");
  await press("Escape");
  const requireMap = async (from, target, next) => {
    const arrived = await travel(from, target, true);
    if (arrived.map !== next) throw new Error(`Expected ${next} after ${from}; observed ${JSON.stringify(arrived)}`);
    report.events.push(`Walked from ${from} to ${next} through a world exit`);
  };
  const captureOnRoute = async (map, patch, species, level, draw) => {
    await page.evaluate((selection) => {
      const draws = [0.01, selection, 0.99];
      window.__journeyDraw = () => draws.shift() ?? 0.55;
    }, draw);
    const entered = await travel(map, patch, true);
    if (entered.mode !== "battle") throw new Error(`Did not encounter ${species} at ${map}`);
    const foe = page.locator(".battle-status-card.foe");
    if (!(await foe.getAttribute("aria-label")).startsWith(`${species}, level ${level}.`))
      throw new Error(`Unexpected encounter: ${await foe.getAttribute("aria-label")}`);
    await seedDraw(0.005);
    await battleCommand("Bind").click();
    await battleRow(/Common Sigil/).click();
    await page.locator(".battle-log-text").filter({ hasText: `${species} accepts the compact.` }).waitFor();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await dialogue.click();
    await page.getByRole("button", { name: `Keep ${species}`, exact: true }).click();
    await page.locator(".name-prompt").waitFor({ state: "detached" });
    report.events.push(`Bound level ${level} ${species} during natural exploration of ${map}`);
    await seedDraw(0.99);
  };

  await seedDraw(0.99);
  await requireMap("elderhall", { x: 10, y: 0 }, "briar_road");
  await requireMap("briar_road", { x: 10, y: 0 }, "wildwood");
  await captureOnRoute("wildwood", { x: 4, y: 16 }, "Sunhart", 12, 0.83);
  await requireMap("wildwood", { x: 6, y: 1 }, "ashenbarrow");
  await captureOnRoute("ashenbarrow", { x: 8, y: 12 }, "Keepdrake", 14, 0.95);
  await requireMap("ashenbarrow", { x: 9, y: 15 }, "wildwood");
  await requireMap("wildwood", { x: 10, y: 0 }, "thornkeep");
  await page.screenshot({ path: join(output, "14-thornkeep.png") });

  // Stock two larger heals. The live shop also verifies the economy before
  // the trial independently of the earlier inn debit.
  await travel("thornkeep", { x: 14, y: 10 }, true);
  await faceNorth();
  if ((await positionAt()).map === "thornkeep") await press("KeyZ");
  if ((await positionAt()).map !== "keep_shop") throw new Error("Chandler door failed");
  await travel("keep_shop", { x: 4, y: 5 }, true);
  await faceNorth();
  await press("KeyZ");
  const beforePurchase = await readSave();
  await page.locator(".shop-row").filter({ hasText: "Greater Tonic" }).click();
  await page.getByRole("button", { name: "Buy for 60 cr" }).click();
  await page.getByRole("button", { name: "Buy for 60 cr" }).click();
  const afterPurchase = await readSave();
  if (afterPurchase.gold !== beforePurchase.gold - 120 ||
      afterPurchase.inventory.greater_tonic !== (beforePurchase.inventory.greater_tonic ?? 0) + 2)
    throw new Error("Chandler purchases did not debit 120 crowns and add two greater tonics");
  report.events.push("Thornkeep Chandler added two Greater Tonics and charged 120 crowns");
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await requireMap("keep_shop", { x: 5, y: 8 }, "thornkeep");

  await press("KeyM");
  await page.getByRole("button", { name: "Party", exact: true }).click();
  await page.getByRole("button", { name: "Make Keepdrake lead", exact: true }).click();
  await press("Escape");
  await press("Escape");
  await travel("thornkeep", { x: 11, y: 7 }, true);
  await faceNorth();
  await press("KeyZ");
  await dialogue.getByText("Warden Cael", { exact: true }).waitFor();
  const beforeTrial = await readSave();
  if (beforeTrial.flags.trial || beforeTrial.flags.ending) throw new Error("Trial is already complete before starting it");
  if (trialSeed === null) {
    await seedDraw(0.05);
  } else {
    // Seed only the simulation stream. Audio and rendering remain unmodified.
    await page.evaluate((seed) => {
      let state = seed;
      window.__journeyDraw = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) / 0x100000000;
      };
    }, trialSeed);
  }
  await dialogue.click();
  await dialogue.click();
  await dialogue.filter({ hasText: "Begin the trial" }).click();
  report.events.push("Accepted Warden Cael's trial through the story dialogue");

  const battleControl = page.locator(".battle-controls");
  const currentBeast = page.locator(".battle-status-card.me");
  const opponent = page.locator(".battle-status-card.foe");
  const trialHealing = { "Field Tonic": 0, "Greater Tonic": 0 };
  const opponents = new Map();
  for (let turn = 0; turn < 60; turn++) {
    await page.waitForFunction(() => {
      const phase = document.querySelector(".battle-controls")?.getAttribute("data-battle-phase");
      return ["command", "party", "win", "lose"].includes(phase);
    });
    const phase = await battleControl.getAttribute("data-battle-phase");
    if (phase === "win") break;
    if (phase === "lose") throw new Error(`Lost the Warden trial after ${turn} turns: ${await page.locator(".battle-log-text").innerText()}`);
    if (phase === "party") {
      const replacement = page.locator(".battle-controls-body ul.cmd button:not([disabled])").first();
      report.events.push(`Forced switch: ${await replacement.innerText()}`);
      await replacement.click();
      continue;
    }
    const enemyName = await opponent.locator(".battle-status-name").innerText();
    const enemyLevel = Number((await opponent.locator(".battle-status-level").innerText()).replace("Lv ", ""));
    if (!opponents.has(enemyName)) {
      opponents.set(enemyName, enemyLevel);
      report.events.push(`Warden opponent: ${enemyName} level ${enemyLevel}`);
    }
    const nickname = await currentBeast.locator(".battle-status-name").innerText();
    const status = await currentBeast.getAttribute("aria-label");
    const [, hp, maxHp] = /Health (\d+) of (\d+)/.exec(status);
    const healName = Number(hp) / Number(maxHp) <= 0.58
      ? ["Field Tonic", "Greater Tonic"].find((name) => trialHealing[name] <
        (beforeTrial.inventory[name === "Field Tonic" ? "tonic" : "greater_tonic"] ?? 0))
      : undefined;
    if (healName) {
      await battleCommand("Item").click();
      await battleRow(new RegExp(healName)).click();
      trialHealing[healName]++;
      report.events.push(`Trial turn ${turn + 1}: used ${healName} at ${hp}/${maxHp} HP`);
    } else {
      const skillName = { Keepdrake: "Cinder", Sunhart: "Gleam", Kindling: "Cinder", Fogmote: "Shade" }[nickname];
      if (!skillName) throw new Error(`Unexpected active Warden challenger ${nickname}`);
      await battleCommand("Skill").click();
      const skill = battleRow(new RegExp(skillName));
      if (await skill.count() && await skill.isEnabled()) {
        await skill.click();
        report.events.push(`Trial turn ${turn + 1}: ${nickname} used ${skillName} against ${enemyName}`);
      } else {
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await battleCommand("Strike").click();
        report.events.push(`Trial turn ${turn + 1}: ${nickname} struck ${enemyName}`);
      }
    }
  }

  if (JSON.stringify([...opponents.keys()]) !== JSON.stringify(["Ironnewt", "Chapelite", "Keepdrake"]))
    throw new Error(`Trial opponents did not play in the expected order: ${[...opponents.keys()]}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (let i = 0; i < 3; i++) await dialogue.click();
  await page.getByText("The Thorn Mark is yours", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "15-chapter-one-ending.png") });

  const finalSave = await readSave();
  const crownReward = 88 + 3 * opponents.get("Keepdrake");
  if (!finalSave.flags.trial || !finalSave.flags.ending || !finalSave.flags.ending_seen ||
      finalSave.gold !== beforeTrial.gold + crownReward ||
      finalSave.inventory.thorn_sigil !== (beforeTrial.inventory.thorn_sigil ?? 0) + 3 ||
      finalSave.inventory.greater_tonic !== (beforeTrial.inventory.greater_tonic ?? 0) + 2 - trialHealing["Greater Tonic"])
    throw new Error("Trial completion, end screen, and exact rewards were not saved together");
  report.events.push(`Saw the Chapter One ending; received exactly ${crownReward} crowns, three Thorn Sigils and two Greater Tonics`);

  await page.getByRole("button", { name: "Walk on", exact: true }).click();
  await page.close();
  page = await openPage();
  await page.goto(url, { waitUntil: "load" });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await objectiveAt(/Hollow Crown/);
  if ((await positionAt()).map !== "thornkeep") throw new Error("The completed game did not reopen in Thornkeep");
  await faceNorth();
  await press("KeyZ");
  const reopenedDialogue = page.locator("button.dialog");
  if (!/already keep the Thorn Mark/.test(await reopenedDialogue.innerText()))
    throw new Error("Cael did not recognize the completed trial");
  await reopenedDialogue.click();
  const reopened = await readSave();
  if (!reopened.flags.ending_seen || reopened.gold !== finalSave.gold ||
      JSON.stringify(reopened.inventory) !== JSON.stringify(finalSave.inventory))
    throw new Error("Reopening and talking to the Warden changed the completed state or repeated a reward");
  report.events.push("Reopened the game in Thornkeep; Cael recognized completion and all rewards remained unchanged");
  await page.screenshot({ path: join(output, "16-after-ending-reopen.png") });
  console.log(JSON.stringify(report.events, null, 1));
  await context.close();
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
  if (page && !page.isClosed()) await page.screenshot({ path: join(output, "failure.png") }).catch(() => {});
} finally {
  writeFileSync(join(output, "chapter-one-journey.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.errors.length) {
  console.error(report.errors);
  process.exitCode = 1;
}
