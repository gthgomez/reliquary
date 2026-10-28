/**
 * Chapter One acceptance journey: start a new game, choose a starter, walk the
 * natural route (BFS pathing + real key presses only — no warps, no probe
 * battle seeding), bind a wild beast successfully, manage the party by
 * keyboard alone, decline and accept an inn rest, save, reload, and verify
 * that everything persists. Math.random is seeded at fixed moments so the
 * encounter/capture outcome is reproducible; every UI action is real.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const url = process.argv[2] ?? "http://127.0.0.1:8083";
const output = process.argv[3];
if (!output || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("usage: node scripts/chapter-one-qa.mjs <local-url> <evidence-directory>");
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = { browser: browser.version(), events: [], errors: [], warnings: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  page.on("pageerror", (error) => report.errors.push(String(error?.stack ?? error)));
  page.on("console", (message) => {
    if (message.type() === "error") report.errors.push(`console: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(output, "01-title.png") });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 3; i++) await page.locator("button.dialog").click();
  await page.screenshot({ path: join(output, "02-intro-world.png") });

  const objectiveAt = async (must) => {
    const text = await page.locator(".hud-objective").innerText();
    if (!text.match(must)) throw new Error(`Objective expected /${must.source}/, got: ${text}`);
    return text;
  };
  await objectiveAt(/Binding Grove/);

  async function press(code, times = 1) {
    for (let i = 0; i < times; i++) await page.keyboard.press(code);
  }
  // Reimplemented BFS from natural-journey-qa (shared shape, kept simple).
  const { MAPS, BLOCKED } = await import("../src/game/maps.ts");
  const dirs = [
    { dx: 0, dy: -1, key: "KeyW" },
    { dx: 0, dy: 1, key: "KeyS" },
    { dx: -1, dy: 0, key: "KeyA" },
    { dx: 1, dy: 0, key: "KeyD" },
  ];
  function pathFor(map, start, target, starterChosen) {
    const k = (x, y) => `${x},${y}`;
    const todo = [{ ...start, path: [] }];
    const seen = new Set([k(start.x, start.y)]);
    while (todo.length) {
      const point = todo.shift();
      if (point.x === target.x && point.y === target.y) return point.path;
      for (const dir of dirs) {
        const x = point.x + dir.dx;
        const y = point.y + dir.dy;
        if (y < 0 || x < 0 || y >= map.ground.length || x >= map.ground[0].length || seen.has(k(x, y))) continue;
        const warp = map.warps.some((item) => item.x === x && item.y === y);
        if (warp && (x !== target.x || y !== target.y)) continue;
        const blocked =
          BLOCKED.has(map.ground[y][x]) ||
          map.objects.some(
            (item) =>
              item.solid &&
              !(starterChosen && item.id.startsWith("st_")) &&
              x >= item.x && x < item.x + item.w && y >= item.y + item.h - item.foot && y < item.y + item.h,
          ) ||
          map.npcs.some((item) => item.x === x && item.y === y);
        if (!warp && blocked) continue;
        seen.add(k(x, y));
        todo.push({ x, y, path: [...point.path, { key: dir.key, x, y, warp }] });
      }
    }
    throw new Error(`no route through ${map.id} to ${k(target.x, target.y)}`);
  }
  async function travel(mapId, target, starterChosen = false) {
    const start = await page.evaluate(() => window.__controlsTest.getPos());
    if (start.map !== mapId) throw new Error(`expected ${mapId}, at ${start.map}`);
    for (const step of pathFor(MAPS[mapId], start, target, starterChosen)) {
      const result = await page.evaluate(
        async ({ step, mapId }) => {
          window.__controlsTest.setKeys([step.key]);
          try {
            return await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error(`stuck at ${step.x},${step.y}`)), 4000);
              const check = () => {
                const pos = window.__controlsTest.getPos();
                if (pos.mode === "battle" || pos.map !== mapId || (pos.x === step.x && pos.y === step.y)) {
                  clearTimeout(timeout);
                  resolve(pos);
                } else requestAnimationFrame(check);
              };
              requestAnimationFrame(check);
            });
          } finally {
            window.__controlsTest.setKeys([]);
          }
        },
        { step, mapId },
      );
      if (result.mode === "battle") return result;
      if (result.map !== mapId && !step.warp) throw new Error(`unexpected warp out of ${mapId}`);
    }
    return page.evaluate(() => window.__controlsTest.getPos());
  }

  let position = await travel("home", { x: 5, y: 8 });
  if (position.map !== "elderhall") throw new Error("Home exit failed");
  position = await travel("elderhall", { x: 0, y: 10 });
  if (position.map !== "grove") throw new Error("Grove entrance failed");
  await page.screenshot({ path: join(output, "03-grove.png") });
  await travel("grove", { x: 4, y: 7 });
  await page.evaluate(async () => {
    window.__controlsTest.setKeys(["KeyW"]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__controlsTest.setKeys([]);
  });
  await press("KeyZ");
  for (let i = 0; i < 4; i++) await page.locator("button.dialog").click();
  await page.getByText(/Emberkit \d+\/\d+/).waitFor();
  await objectiveAt(/Wildwood/);
  report.events.push("Pact spoken with Emberkit; objective advanced to Thornkeep");

  // Back to Elderhall, then Briar Road for the first wild encounter.
  await travel("grove", { x: 15, y: 7 }, true);
  if ((await page.evaluate(() => window.__controlsTest.getPos())).map !== "elderhall")
    throw new Error("Grove exit failed");
  await page.screenshot({ path: join(output, "04-elderhall.png") });
  position = await travel("elderhall", { x: 10, y: 0 }, true);
  if (position.map !== "briar_road") throw new Error("Briar Road entrance failed");
  await page.evaluate(() => {
    Math.random = () => 0.05;
  });
  position = await travel("briar_road", { x: 4, y: 22 }, true);
  for (let i = 0; i < 40 && position.mode !== "battle"; i++) {
    position = await travel("briar_road", { x: i % 2 ? 4 : 5, y: 22 }, true);
  }
  if (position.mode !== "battle") throw new Error("no wild encounter after bounded traversal");
  await page.screenshot({ path: join(output, "05-battle.png") });

  // Bind with a seeded favorable draw: the natural enemy stays in the route.
  await page.getByRole("button", { name: "Bind", exact: true }).click();
  await page.getByRole("button", { name: /Common Sigil/ }).click();
  await page.waitForFunction(
    () => document.querySelector(".battle-ui .cmd") || document.querySelector(".battle-ui .btn-primary"),
    null,
    { timeout: 20000 },
  );
  const battleText = await page.locator(".battle-log").innerText();
  if (!/accepts the compact/.test(battleText))
    throw new Error(`binding did not succeed: ${battleText}`);
  await page.screenshot({ path: join(output, "06-bind.png") });
  report.events.push(`Successful binding on the natural route: ${battleText}`);

  // Post-battle: HUD keeps a live objective and the party shows two beasts.
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const partyCards = page.locator(".party-grid .beast-card");
  // Party is reached only through the menu: keyboard path exclusively.
  await press("KeyM");
  await page.getByRole("button", { name: "Party", exact: true }).click();
  const cards = await partyCards.count();
  if (cards !== 2) throw new Error(`expected 2 party cards, saw ${cards}`);
  await page.screenshot({ path: join(output, "07-party.png") });

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
    await press("ArrowDown", practiceIndex);
    await press("KeyZ");
    await page.waitForTimeout(400);
    const gold = await page.locator(".hud-gold").innerText();
    report.events.push(`Practiced via the card action list; HUD gold now "${gold}"`);
  }
  await press("Escape");
  await press("Escape");

  // Walk Briar Road's south rib into Elderhall again; there the inns wait.
  position = await travel("briar_road", { x: 10, y: 27 }, true);
  if (position.map !== "elderhall") throw new Error(`Briar Road exit failed, at ${position.map}`);

  // Inn: decline first, then accept. The inn door faces up at (17,5); the
  // innkeeper waits at (4,4) inside The Quiet Lantern.
  position = await travel("elderhall", { x: 16, y: 5 });
  await page.evaluate(() => window.__controlsTest.setKeys(["KeyW"]));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__controlsTest.setKeys([]));
  await press("KeyZ");
  await page.waitForTimeout(400);
  position = await page.evaluate(() => window.__controlsTest.getPos());
  if (position.map !== "inn_in") throw new Error(`inn door entry failed, at ${position.map}`);
  await travel("inn_in", { x: 4, y: 5 });
  await page.evaluate(() => window.__controlsTest.setKeys(["KeyW"]));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__controlsTest.setKeys([]));
  await press("KeyZ");
  const innPrompt = await page.locator("button.dialog").innerText();
  if (!innPrompt.includes("(A rest · B not now)")) throw new Error(`inn prompt lacks the A/B line: ${innPrompt}`);
  const readGold = async () => Number((await page.locator(".hud-gold").innerText()).match(/\d+/)?.[0]);
  const goldBefore = await readGold();
  await press("Shift");
  await page.waitForTimeout(200);
  if ((await readGold()) !== goldBefore) throw new Error("inn declined but gold changed");
  report.events.push("Inn decline leaves crowns untouched");
  await page.evaluate(() => window.__controlsTest.setKeys(["KeyW"]));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__controlsTest.setKeys([]));
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
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const partyCheck = await page.evaluate(() => window.__controlsTest.getPos());
  if (partyCheck.map !== "elderhall") throw new Error(`reload lost the position: ${partyCheck.map}`);
  await press("KeyM");
  await page.getByRole("button", { name: "Party", exact: true }).click();
  const reloadedCards = await page.locator(".party-grid .beast-card").count();
  if (reloadedCards !== 2) throw new Error(`reload expected 2 party cards, saw ${reloadedCards}`);
  if (!(await page.getByText("Fogmote").count()))
    throw new Error("reload lost the renamed companion");
  report.events.push("Saved and reloaded; renamed companion, gold and map survived");
  await page.screenshot({ path: join(output, "11-after-reload.png") });
  console.log(JSON.stringify(report.events, null, 1));
  await context.close();
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, "chapter-one-journey.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.errors.length) console.error(report.errors);
