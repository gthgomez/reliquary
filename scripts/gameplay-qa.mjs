/** Isolated gameplay journey; fixture data stays in a temporary browser context. */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeBeast } from "../src/game/content.ts";
import { MAPS } from "../src/game/maps.ts";

const url = process.argv[2] ?? "http://127.0.0.1:8180";
const output = process.argv[3];
if (!output || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("usage: node scripts/gameplay-qa.mjs <local-url> <evidence-directory>");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = { browser: browser.version(), url, scenarios: [], errors: [] };
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
try {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400)
        report.errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 3; i++) await page.locator("button.dialog").click();
    await page.keyboard.down("ArrowLeft");
    await page.waitForFunction(() => window.__controlsTest?.getPos?.().x < 5);
    await page.keyboard.up("ArrowLeft");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    assert(
      await page.evaluate(() => !!localStorage.getItem("reliquary.save.v2")),
      "natural opening save was not written",
    );

    // A valid prepared save targets the management journey without pretending
    // that capture, starter acquisition or the complete story were played.
    const party = [makeBeast("emberkit", 5), makeBeast("mirewhelp", 5)];
    const box = [makeBeast("mothwisp", 5)];
    const fixture = {
      version: 2,
      playerName: "Rowan",
      mapId: "elderhall",
      x: 12,
      y: 14,
      dir: 0,
      gold: 180,
      playTime: 0,
      party,
      box,
      inventory: { tonic: 3, common_sigil: 5, salve: 1 },
      flags: { starter: true },
      seen: { emberkit: true, mirewhelp: true, mothwisp: true },
      caught: { emberkit: true, mirewhelp: true, mothwisp: true },
    };
    await page.evaluate(
      (value) => localStorage.setItem("reliquary.save.v2", JSON.stringify(value)),
      fixture,
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Party", exact: true }).click();
    await page.getByRole("button", { name: "Rename Emberkit" }).click();
    await page.getByLabel("Creature name").fill("Kindling");
    await page.getByRole("button", { name: "Save name" }).click();
    await page.getByRole("button", { name: "Practice with Kindling for 45 crowns" }).click();
    await page.getByRole("button", { name: "Make Mirewhelp lead" }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Storage", exact: true }).click();
    await page.getByRole("button", { name: "Add Mothwisp to party" }).click();
    await page.getByRole("button", { name: "Store Kindling" }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v2")));
    assert(
      saved.gold === 135 &&
        saved.party[0].speciesId === "mirewhelp" &&
        saved.box.some((beast) => beast.nickname === "Kindling"),
      "management state did not persist",
    );
    await page.screenshot({ path: join(output, `${viewport.width}-storage.png`) });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Storage", exact: true }).click();
    await page.getByRole("button", { name: "Add Kindling to party" }).waitFor();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();

    const transitions = [];
    for (const [name, map] of Object.entries(MAPS)) {
      const transition = await page.evaluate(
        async ({ name, spawn }) => {
          const started = performance.now();
          window.__controlsTest.warp(name, spawn.x, spawn.y);
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          return { map: window.__controlsTest.getPos().map, ms: performance.now() - started };
        },
        { name, spawn: map.spawn },
      );
      assert(transition.map === name, `map transition failed: ${name}`);
      transitions.push(transition);
    }
    await page.evaluate(() => window.__controlsTest.warp("elderhall", 12, 14));
    const walking = await page.evaluate(async () => {
      const intervals = [],
        positions = new Set();
      let start = 0,
        last = 0;
      return await new Promise((resolve) => {
        function frame(ts) {
          if (!start) start = ts;
          if (last) intervals.push(ts - last);
          last = ts;
          const pos = window.__controlsTest.getPos();
          positions.add(`${pos.x},${pos.y}`);
          window.__controlsTest.setKeys([Math.floor((ts - start) / 900) % 2 ? "KeyS" : "KeyW"]);
          if (ts - start < 6000) return requestAnimationFrame(frame);
          window.__controlsTest.setKeys([]);
          const sorted = [...intervals].sort((a, b) => a - b);
          resolve({
            frames: intervals.length,
            fps: (1000 * intervals.length) / intervals.reduce((a, b) => a + b, 0),
            p95Ms: sorted[Math.floor(sorted.length * 0.95)],
            p99Ms: sorted[Math.floor(sorted.length * 0.99)],
            stallsOver50Ms: intervals.filter((ms) => ms > 50).length,
            positions: positions.size,
            intervals,
          });
        }
        requestAnimationFrame(frame);
      });
    });
    assert(walking.positions > 2, "walking sample did not traverse multiple tiles");
    await page.evaluate(() => window.__controlsTest.startWild());
    await page.getByRole("button", { name: "Strike", exact: true }).waitFor();
    const overlap = await page.evaluate(() => {
      const log = document.querySelector(".battle-log").getBoundingClientRect();
      const command = document.querySelector(".cmd").getBoundingClientRect();
      return !(
        log.bottom <= command.top ||
        command.bottom <= log.top ||
        log.right <= command.left ||
        command.right <= log.left
      );
    });
    assert(!overlap, "battle log overlaps commands");
    await page.screenshot({ path: join(output, `${viewport.width}-battle.png`) });
    await page.getByRole("button", { name: "Strike", exact: true }).click();
    const battleText = await page.locator(".battle-log").innerText();
    assert(battleText.length > 0, "battle did not report an action");
    const { intervals: _, ...walkingSummary } = walking;
    console.log(
      JSON.stringify({ viewport, walking: walkingSummary, maps: transitions.length, battleText }),
    );
    report.scenarios.push({ viewport, walking, transitions, battleText });
    await context.close();
  }
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, "gameplay.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.errors.length) {
  console.error(report.errors);
  process.exitCode = 1;
}
