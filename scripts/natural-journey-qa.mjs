/** Exercise the real introductory route using input, without fixture or warp injection. */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BLOCKED, MAPS } from "../src/game/maps.ts";

const url = process.argv[2] ?? "http://127.0.0.1:8181";
const output = process.argv[3];
if (!output || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("usage: node scripts/natural-journey-qa.mjs <local-url> <evidence-directory>");
mkdirSync(output, { recursive: true });
const dirs = [
  { dx: 0, dy: -1, key: "KeyW" },
  { dx: 0, dy: 1, key: "KeyS" },
  { dx: -1, dy: 0, key: "KeyA" },
  { dx: 1, dy: 0, key: "KeyD" },
];
function pathFor(map, start, target, starterChosen) {
  const key = (x, y) => `${x},${y}`;
  const todo = [{ ...start, path: [] }],
    seen = new Set([key(start.x, start.y)]);
  while (todo.length) {
    const point = todo.shift();
    if (point.x === target.x && point.y === target.y) return point.path;
    for (const dir of dirs) {
      const x = point.x + dir.dx,
        y = point.y + dir.dy;
      if (
        y < 0 ||
        x < 0 ||
        y >= map.ground.length ||
        x >= map.ground[0].length ||
        seen.has(key(x, y))
      )
        continue;
      const warp = map.warps.some((item) => item.x === x && item.y === y);
      if (warp && (x !== target.x || y !== target.y)) continue;
      const blocked =
        BLOCKED.has(map.ground[y][x]) ||
        map.objects.some(
          (item) =>
            item.solid &&
            !(starterChosen && item.id.startsWith("st_")) &&
            x >= item.x &&
            x < item.x + item.w &&
            y >= item.y + item.h - item.foot &&
            y < item.y + item.h,
        ) ||
        map.npcs.some((item) => item.x === x && item.y === y);
      if (!warp && blocked) continue;
      seen.add(key(x, y));
      todo.push({ x, y, path: [...point.path, { x, y, key: dir.key, warp }] });
    }
  }
  throw new Error(`No route through ${map.id} to ${key(target.x, target.y)}`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = { browser: browser.version(), events: [], errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 3; i++) await page.locator("button.dialog").click();

  async function travel(mapId, target, starterChosen = false) {
    const start = await page.evaluate(() => window.__controlsTest.getPos());
    if (start.map !== mapId) throw new Error(`Expected ${mapId}, got ${start.map}`);
    for (const step of pathFor(MAPS[mapId], start, target, starterChosen)) {
      const result = await page.evaluate(
        async ({ step, mapId }) => {
          window.__controlsTest.setKeys([step.key]);
          try {
            return await new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error(`Movement timed out at ${step.x},${step.y}`)),
                3000,
              );
              function check() {
                const pos = window.__controlsTest.getPos();
                if (
                  pos.mode === "battle" ||
                  pos.map !== mapId ||
                  (pos.x === step.x && pos.y === step.y)
                ) {
                  clearTimeout(timeout);
                  resolve(pos);
                } else requestAnimationFrame(check);
              }
              requestAnimationFrame(check);
            });
          } finally {
            window.__controlsTest.setKeys([]);
          }
        },
        { step, mapId },
      );
      if (result.mode === "battle") return result;
      if (result.map !== mapId && !step.warp) throw new Error(`Unexpected warp from ${mapId}`);
    }
    return await page.evaluate(() => window.__controlsTest.getPos());
  }

  let position = await travel("home", { x: 5, y: 8 });
  if (position.map !== "elderhall") throw new Error("Home exit failed");
  position = await travel("elderhall", { x: 0, y: 10 });
  if (position.map !== "grove") throw new Error("Grove entrance failed");
  await travel("grove", { x: 4, y: 7 });
  await page.evaluate(async () => {
    window.__controlsTest.setKeys(["KeyW"]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__controlsTest.setKeys([]);
  });
  await page.keyboard.press("KeyZ");
  for (let i = 0; i < 4; i++) await page.locator("button.dialog").click();
  await page.getByText(/Emberkit \d+\/\d+/).waitFor();
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
  position = await travel("briar_road", { x: 4, y: 22 }, true);
  for (let i = 0; i < 40 && position.mode !== "battle"; i++) {
    const target = { x: i % 2 ? 4 : 5, y: 22 };
    position = await travel("briar_road", target, true);
  }
  if (position.mode !== "battle")
    throw new Error("No wild encounter after bounded grass traversal");
  await page.getByRole("button", { name: "Bind", exact: true }).click();
  await page.getByRole("button", { name: /Common Sigil/ }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".battle-ui .cmd") ||
      document.querySelector(".battle-ui .btn-primary"),
    null,
    { timeout: 15000 },
  );
  const text = await page.locator(".battle-log").innerText();
  report.events.push(`Natural wild encounter and binding attempt: ${text}`);
  await page.screenshot({ path: join(output, "natural-encounter.png") });
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
