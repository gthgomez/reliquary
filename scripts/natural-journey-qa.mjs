/** Exercise the real introductory route using input, without fixture or warp injection. */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MAPS } from "../src/game/maps.ts";
import { pathFor } from "./natural-journey-path.mjs";
import { faceDirection, walkTo } from "./natural-journey-controls.mjs";
import { finishStarterPact } from "./finish-starter-pact.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:8181";
const output = process.argv[3];
if (!output || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("usage: node scripts/natural-journey-qa.mjs <local-url> <evidence-directory>");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.RELIQUARY_QA_CHANNEL ?? "msedge", headless: true });
const report = { browser: browser.version(), events: [], errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
  const page = await context.newPage();
  // Fix the random stream so the encounter and failed-bind path are reproducible.
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(url, { waitUntil: "load" });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 3; i++) await page.locator(".dialog-next").click();

  const travel = (mapId, target, starterChosen = false) => walkTo(page, MAPS[mapId], target, starterChosen);

  let position = await travel("home", { x: 5, y: 8 });
  if (position.map !== "elderhall") throw new Error("Home exit failed");

  // Visit the elder and every starting-village building through normal input.
  // Only position and facing are read from the test probe.
  async function faceAndInteract(key, yaw) {
    await faceDirection(page, key, yaw);
    await page.keyboard.press("KeyZ");
  }
  const maren = MAPS.elderhall.npcs.find((npc) => npc.id === "maren");
  if (!maren) throw new Error("Elder Maren is missing from Elderhall");
  const start = await page.evaluate(() => window.__controlsTest.getPos());
  const approaches = [
    { x: maren.x - 1, y: maren.y, key: "KeyD", yaw: -Math.PI / 2 },
    { x: maren.x, y: maren.y + 1, key: "KeyW", yaw: Math.PI },
    { x: maren.x + 1, y: maren.y, key: "KeyA", yaw: Math.PI / 2 },
    { x: maren.x, y: maren.y - 1, key: "KeyS", yaw: 0 },
  ];
  const approach = approaches.find((candidate) => {
    if (MAPS.elderhall.warps.some((warp) => warp.x === candidate.x && warp.y === candidate.y)) return false;
    try { pathFor(MAPS.elderhall, start, candidate, false); return true; } catch { return false; }
  });
  if (!approach) throw new Error("No reachable approach to Elder Maren");
  await travel("elderhall", approach);
  await faceAndInteract(approach.key, approach.yaw);
  await page.waitForSelector(".dialog", { timeout: 5000 });
  const speaker = await page.locator(".dialog-name").textContent();
  if (speaker !== "Elder Maren") throw new Error(`Expected Elder Maren, got ${speaker}`);
  for (let i = 0; i < 16 && await page.locator(".dialog").count(); i++) await page.locator(".dialog-next").click();
  await page.waitForSelector(".dialog", { state: "detached", timeout: 5000 });
  report.events.push("Spoke with Elder Maren beside the well");
  for (const building of [
    { name: "home", front: { x: 4, y: 15 }, inside: "home", exit: { x: 5, y: 8 } },
    { name: "guild", front: { x: 4, y: 9 }, inside: "guild_in", exit: { x: 6, y: 10 } },
    { name: "inn", front: { x: 16, y: 5 }, inside: "inn_in", exit: { x: 6, y: 9 } },
    { name: "shop", front: { x: 16, y: 9 }, inside: "shop_in", exit: { x: 5, y: 8 } },
  ]) {
    await travel("elderhall", building.front);
    await faceAndInteract("KeyW", Math.PI);
    await page.waitForFunction((map) => window.__controlsTest.getPos().map === map, building.inside, { timeout: 5000 });
    position = await travel(building.inside, building.exit);
    if (position.map !== "elderhall") throw new Error(`${building.name} exit failed`);
    report.events.push(`Entered and exited the ${building.name}`);
  }
  position = await travel("elderhall", { x: 0, y: 10 });
  if (position.map !== "grove") throw new Error("Grove entrance failed");
  await travel("grove", { x: 4, y: 7 });
  await faceAndInteract("KeyW", Math.PI);
  await finishStarterPact(page);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Pack", exact: true }).click();
  const tonic = page.getByRole("button", { name: /Field Tonic/ });
  const salve = page.getByRole("button", { name: /Salve/ });
  const initialTonic = await tonic.innerText();
  const initialSalve = await salve.innerText();
  await tonic.click();
  await salve.click();
  if ((await tonic.innerText()) !== initialTonic || (await salve.innerText()) !== initialSalve)
    throw new Error("No-effect item was consumed");
  if (!(await page.getByText(/Binding stones:/).isVisible()))
    throw new Error("Binding stones are missing from the Pack");
  report.events.push(
    "No-effect tonic and salve preserved their counts; binding stones remained visible",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("dialog", { name: "Lantern" }).getByRole("button", { name: "Close", exact: true }).click();
  report.events.push(
    "Started, walked from home through Elderhall to the Grove, and chose Emberkit",
  );
  position = await travel("grove", { x: 15, y: 7 }, true);
  if (position.map !== "elderhall") throw new Error("Grove exit failed");
  position = await travel("elderhall", { x: 10, y: 0 }, true);
  if (position.map !== "briar_road") throw new Error("Briar Road entrance failed");
  report.events.push(
    "Walked from Grove to Briar Road without warping the player via the test probe",
  );
  await page.evaluate(() => {
    Math.random = () => 0.05;
  });
  position = await travel("briar_road", { x: 4, y: 22 }, true);
  for (let i = 0; i < 40 && position.mode !== "battle"; i++) {
    const target = { x: i % 2 ? 4 : 5, y: 22 };
    position = await travel("briar_road", target, true);
  }
  if (position.mode !== "battle")
    throw new Error("No wild encounter after bounded grass traversal");
  await page.evaluate(() => {
    Math.random = () => 0.99;
  });
  await page.getByRole("button", { name: "Bind", exact: true }).click();
  await page.getByRole("button", { name: /Common Sigil/ }).click();
  // The command grid is mounted throughout the battle, so wait for the
  // resolved log line itself instead of treating a persistent control as a
  // completion signal.
  try {
    await page.waitForFunction(
      () => /breaks the sigil/.test(document.querySelector(".battle-ui .battle-log-text")?.textContent ?? ""),
      null,
      { timeout: 15000 },
    );
  } catch {
    throw new Error(`Expected the failed binding result in the battle log: ${await page.locator(".battle-log-text").innerText()}`);
  }
  const text = await page.locator(".battle-log-text").innerText();
  if (!text.includes("breaks the sigil"))
    throw new Error(`Expected the failed binding result in the battle log: ${text}`);
  report.events.push(`Natural wild encounter and binding attempt: ${text}`);
  await page.screenshot({ path: join(output, "natural-encounter.png") });

  // Failure/retry: the failed sigil leaves the fight in the command phase, so
  // a second common sigil with a favorable seeded draw must succeed.
  await page.evaluate(() => {
    Math.random = () => 0.01;
  });
  await page.getByRole("button", { name: "Bind", exact: true }).click();
  await page.getByRole("button", { name: /Common Sigil/ }).click();
  try {
    await page.waitForFunction(
      () => /accepts the compact/.test(document.querySelector(".battle-ui .battle-log-text")?.textContent ?? ""),
      null,
      { timeout: 15000 },
    );
  } catch {
    throw new Error(`retry after a failed sigil did not bind: ${await page.locator(".battle-log-text").innerText()}`);
  }
  const retryText = await page.locator(".battle-log-text").innerText();
  if (!retryText.includes("accepts the compact"))
    throw new Error(`retry after a failed sigil did not bind: ${retryText}`);
  report.events.push(`Retried the failed sigil and bound the wild beast: ${retryText}`);
  await page.screenshot({ path: join(output, "natural-encounter-retry.png") });
  console.log(JSON.stringify(report.events));
  await context.close();
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, "natural-journey.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.errors.length) {
  console.error(report.errors);
  process.exitCode = 1;
}
