/**
 * Probe-and-fixture journeys for isolated chapter behaviors. These scenarios
 * use crafted saves and the diagnostic probe, so they are NOT evidence of
 * natural progression; the natural journey is scripts/chapter-one-qa.mjs.
 * Covered: learn/decline choice persistence, a lost battle's whiteout, the
 * Cael advisory for a weak party, and the Warden trial from a prepared party.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeBeast } from "../src/game/content.ts";

const url = process.argv[2] ?? "http://127.0.0.1:8083";
const output = process.argv[3];
if (!output || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("usage: node scripts/chapter-one-fixture-qa.mjs <local-url> <evidence-directory>");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = { browser: browser.version(), scenarios: [], errors: [] };
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const assertEq = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${message}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

const baseFixture = (party, extra = {}) => ({
  version: 2,
  playerName: "Rowan",
  mapId: extra.map ?? "elderhall",
  x: extra.x ?? 12,
  y: extra.y ?? 14,
  dir: extra.dir ?? 0,
  gold: extra.gold ?? 200,
  playTime: 0,
  party,
  box: [],
  inventory: extra.inventory ?? { tonic: 2, common_sigil: 3 },
  flags: extra.flags ?? { starter: true },
  seen: { emberkit: true },
  caught: { emberkit: true },
});

async function withFixture(name, viewport, fixture, run) {
  console.error(`>>> scenario ${name} start`);
  let watchdog = setTimeout(() => {
    console.error(`WATCHDOG: scenario ${name} exceeded 180s`);
    process.exit(2);
  }, 180_000);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const extend = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      console.error(`WATCHDOG: scenario ${name} exceeded 180s (last call after reset)`);
      process.exit(2);
    }, 180_000);
  };
  page.on("pageerror", (error) => report.errors.push(String(error?.stack ?? error)));
  page.on("console", (message) => {
    if (message.type() === "error") report.errors.push(`[${name}] console: ${message.text()}`);
  });
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate((value) => localStorage.setItem("reliquary.save.v2", JSON.stringify(value)), fixture);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await run(page, extend);
    report.scenarios.push(`${name}: ok`);
  } catch (error) {
    report.errors.push(`[${name}] ${String(error?.stack ?? error)}`);
    try {
      await page.screenshot({ path: join(output, `${name}-fail.png`) });
    } catch {
      // A failed diagnostic screenshot must not hide the original error.
    }
    process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    await context.close();
  }
}

try {
  // A. Learn-or-decline choices persist. Prepared save: full lists + queued offers.
  const ember = makeBeast("emberkit", 17);
  ember.skills = ["nip", "cinder", "scorch", "slash"];
  ember.pendingSkills = ["flare"];
  const mire = makeBeast("mirewhelp", 17);
  mire.skills = ["nip", "torrent", "soak", "lickwounds"];
  mire.pendingSkills = ["wardveil"];
  await withFixture("learn-choice", { width: 1280, height: 800 }, baseFixture([ember, mire]), async (page) => {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Party", exact: true }).click();
    await page.keyboard.press("KeyZ");
    const actions = await page.locator("ul.menu-list button").allInnerTexts();
    const learnIndex = actions.findIndex((t) => /Learn/.test(t));
    assert(learnIndex >= 0, `card actions lack Learn: ${actions.join(" | ")}`);
    for (let i = 0; i < learnIndex; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("KeyZ");
    const sheet = await page.locator(".sheet").innerText();
    assert(/beckons/.test(sheet), `learn sheet missing: ${sheet}`);
    await page.screenshot({ path: join(output, "learn-choice.png") });
    await page.getByRole("button", { name: /Replace Cinder/ }).click();
    await page.waitForTimeout(200);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v2")));
    assertEq(saved.party[0].skills, ["nip", "flare", "scorch", "slash"], "skills after replace");
    assertEq(saved.party[0].pendingSkills ?? [], [], "replace must clear the offer");
    assertEq(saved.party[1].pendingSkills ?? [], ["wardveil"], "the other offer must be untouched");
    // The offer is spent; decline the mirewhelp's queued skill next.
    await page.getByRole("button", { name: /^Back$/ }).click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("KeyM");
    await page.getByRole("button", { name: "Party", exact: true }).click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("KeyZ");
    await page.getByRole("button", { name: "Learn a new skill" }).click();
    await page.getByRole("button", { name: /Decline/ }).click();
    await page.waitForTimeout(200);
    const saved2 = await page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v2")));
    assertEq(saved2.party[1].skills, ["nip", "torrent", "soak", "lickwounds"], "decline must not touch the list");
    assertEq(saved2.party[1].pendingSkills ?? [], [], "decline must clear the offer");
    report.scenarios.push("learn-choice: replace and decline persisted");
  });

  // B. A lost battle heals the party, takes 15% gold, and returns to Elderhall.
  const downed = makeBeast("emberkit", 3);
  downed.hp = 1;
  await withFixture("lost-battle", { width: 1280, height: 800 }, baseFixture([downed], { gold: 200 }), async (page) => {
    await page.evaluate(() => window.__controlsTest.startWild());
    await page.getByRole("button", { name: "Strike", exact: true }).waitFor();
    await page.evaluate(() => {
      // First roll fails the bind, the second lands the foe's attack.
      const rolls = [0.98, 0.05];
      Math.random = () => (rolls.length ? rolls.shift() : 0.5);
    });
    // The bind is seeded to fail (0.98 beats no chance), and the foe's
    // response finishes the 1-HP pact beast: the natural loss flow.
    await page.getByRole("button", { name: "Bind", exact: true }).click();
    await page.getByRole("button", { name: /Common Sigil/ }).click();
    await page.getByRole("button", { name: "Wake", exact: true }).waitFor({ timeout: 25000 });
    await page.screenshot({ path: join(output, "lost-battle.png") });
    await page.getByRole("button", { name: "Wake", exact: true }).click();
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v2")));
    assertEq(saved.gold, 170, "gold after loss");
    assertEq(saved.mapId, "elderhall", "whiteout destination");
    const hud = await page.locator(".hud").innerText();
    assert(/Elderhall/.test(hud), hud);
    const dialog = await page.locator("button.dialog").innerText();
    assert(/You wake in Elderhall/.test(dialog), dialog);
  });

  // C. Cael telegraphs the lineup and advises a weak party; B declines.
  const pactBeast = makeBeast("emberkit", 5);
  await withFixture(
    "cael-advisory",
    { width: 1280, height: 800 },
    baseFixture([pactBeast], { map: "thornkeep", x: 11, y: 7, dir: 3 }),
    async (page) => {
      await page.keyboard.press("KeyZ");
      const lines = [];
      for (let i = 0; i < 3; i++) {
        lines.push(await page.locator("button.dialog").innerText());
        if (i < 2) await page.locator("button.dialog").click({ delay: 30 });
      }
      const all = lines.join(" | ");
      assert(/a dozen and this goes lighter/.test(all), `advisory missing: ${all}`);
      assert(/Iron\. Chapel\. Drake/.test(all), all);
      assert(/\(A begin · B later\)/.test(all), all);
      await page.screenshot({ path: join(output, "cael-advisory.png") });
      // B declines on the last page: no battle, no flag.
      await page.keyboard.press("Shift");
      await page.waitForTimeout(300);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v2")));
      assert((saved.flags.trial ?? false) === false, "declined trial must not record");
      report.scenarios.push("cael-advisory: telegraph + weakness advice + decline");
    },
  );

  // E. The Pack target list renders with previews (desktop, and again via taps).
  const leader = makeBeast("riverguard", 5);
  const hurt = makeBeast("emberkit", 5);
  hurt.hp = 12;
  leader.hp = 20;
  leader.status = "burn";
  await withFixture("pack-target-ui", { width: 1280, height: 800 }, baseFixture([leader, hurt]), async (page) => {
    await page.keyboard.press("KeyM");
    await page.getByRole("button", { name: "Pack", exact: true }).click();
    await page.getByRole("button", { name: /^Field Tonic\b/ }).first().click();
    const sheet = await page.locator(".sheet").innerText();
    assert(/Choose a companion/.test(sheet), `target sheet missing: ${sheet.slice(0, 100)}`);
    await page.screenshot({ path: join(output, "pack-target.png") });
    assertEq(
      (await page.getByRole("button", { name: /heals about 40 vitality/ }).count()) >= 1,
      true,
      "target previews render",
    );
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v2")));
    assertEq(saved.inventory.tonic, 2, "nothing consumed while previewing");
    await page.getByRole("button", { name: "Back to the pack" }).click();
    // Choose from the list: the second beast is the wounded one.
    await page.getByRole("button", { name: /^Field Tonic\b/ }).first().click();
    await page.locator("ul.menu-list button").filter({ hasText: "Emberkit" }).click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v2")));
    assertEq(after.inventory.tonic, 1, "tonic consumed on the chosen target");
    assert(after.party[1].hp > 7, "wounded emberkit healed");
    report.scenarios.push("pack-target-ui: eligible targets, preview, tap-through");
  });

  // D. The Warden trial from a prepared party — the trial milestone itself.
  const champion = makeBeast("pyrefox", 17);
  champion.nickname = "Kindling";
  await withFixture(
    "warden-trial",
    { width: 1280, height: 800 },
    baseFixture([champion, makeBeast("riverguard", 17), makeBeast("ironnewt", 17), makeBeast("briarling", 16)], {
      map: "thornkeep",
      x: 11,
      y: 7,
      dir: 3,
      gold: 500,
      inventory: { tonic: 8, greater_tonic: 4, phoenix_ash: 3, common_sigil: 3 },
    }),
    async (page, extend) => {
      // A comfortable margin: the trial foes are level 12–15, so a 16–17
      // party with eleven restorative items wins through ordinary play.
      // Four confirms: talk, three dialog pages (page 3 begins the trial).
      await page.keyboard.press("KeyZ");
      await page.keyboard.press("KeyZ");
      await page.keyboard.press("KeyZ");
      await page.keyboard.press("KeyZ");
      await page.getByRole("button", { name: "Strike", exact: true }).waitFor({ timeout: 30000 });
      let rounds = 0;
      for (;;) {
        rounds++;
        extend();
        assert(rounds < 240, `trial did not conclude within ${rounds} rounds`);
        const cmd = await page.locator(".battle-ui ul.cmd").count();
        const wake = await page.getByRole("button", { name: "Wake", exact: true }).count();
        const cont = await page.getByRole("button", { name: "Continue", exact: true }).count();
        const dialog = await page.locator("button.dialog").count();
        const victory = await page.getByRole("button", { name: "Walk on", exact: true }).count();
        if (victory) break;
        if (wake) throw new Error("the prepared party lost the trial");
        if (dialog && !cont) {
          await page.locator("button.dialog").click({ delay: 30 });
          await page.waitForTimeout(150);
          continue;
        }
        if (cont) {
          await page.getByRole("button", { name: "Continue", exact: true }).click();
          await page.waitForTimeout(150);
          continue;
        }
        if (rounds % 10 === 0) {
          const battleHud = await page.locator(".battle-ui").innerText().catch(() => "");
          console.log(`[warden-trial] round ${rounds}: cmd=${cmd} cont=${cont} dialog=${dialog} hud=${battleHud.slice(0, 80).replace(/\s+/g, " ")}`);
        }
        // Forced-switch phase: member rows read "<name> <hp> hp"; command,
        // skill and item rows never do. Send in a beast that can still fight.
        const activeName = (await page.locator(".battle-ui .battler.me strong").innerText().catch(() => "")).trim();
        const memberRows = page.locator(".battle-ui ul.cmd button").filter({ hasText: /\d+ hp$/ });
        const survivors = memberRows
          .filter({ hasNotText: /\b0 hp$/ })
          .filter({ hasNotText: activeName || "\u0000" });
        if ((await survivors.count()) > 0) {
          await survivors.first().click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(250);
          continue;
        }
        if (!cmd) {
          await page.waitForTimeout(150);
          continue;
        }
        const hud = await page.locator(".battle-ui").innerText();
        const meHud = await page.locator(".battle-ui .battler.me").innerText().catch(() => "");
        const hp = /HP (\d+)\/(\d+)/.exec(meHud);
        const lowHp = hp && Number(hp[1]) < Number(hp[2]) * 0.6;
        if (lowHp && /Greater Tonic|Tonic/.test(hud)) {
          await page.getByRole("button", { name: "Item", exact: true }).click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(150);
          await page.getByRole("button", { name: /Greater Tonic|^Tonic$/ }).first().click({ timeout: 4000 }).catch(() => {});
        } else {
          await page.getByRole("button", { name: "Strike", exact: true }).click({ timeout: 4000 }).catch(() => {});
        }
        await page.waitForTimeout(250);
      }
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v2")));
      assertEq(saved.flags.trial, true, "trial flag after victory");
      assert((saved.inventory.thorn_sigil ?? 0) >= 3, "thorn sigils missing");
      assert((saved.inventory.greater_tonic ?? 0) >= 2, "reward tonics missing");
      await page.screenshot({ path: join(output, "warden-trial-victory.png") });
      await page.getByRole("button", { name: "Walk on", exact: true }).click();
      await page.waitForTimeout(300);
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      const objective = await page.locator(".hud-objective").innerText();
      assert(/Hollow Crown/.test(objective), `post-trial objective wrong: ${objective}`);
      await page.screenshot({ path: join(output, "after-trial.png") });
      report.scenarios.push("warden-trial: won, Thorn Mark granted, objective advanced");
    },
  );
} finally {
  writeFileSync(join(output, "chapter-one-fixture.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.errors.length) console.error(report.errors.reverse());
