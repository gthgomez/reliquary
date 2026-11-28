/** Exercise the Elderhall services and reciprocal thresholds via ordinary player inputs. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAPS } from "../../src/game/maps.ts";
import { ELDERHALL_WORLD_REVISION } from "../../src/game/build-flags.ts";
import { faceDirection, walkTo } from "../../scripts/natural-journey-controls.mjs";
import { measureTargetVisibility, startStaticServer, withBrowser } from "./helpers.mjs";

const output = process.env.RELIQUARY_BUILDING_EVIDENCE;
const baseline = process.argv.includes("--baseline");
if (output) await mkdir(output, { recursive: true });
const { server, baseUrl } = await startStaticServer();
const viewport = { width: 390, height: 844 };
const shots = {};
let result;

try {
  await withBrowser(async (page, context) => {
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const capture = async (name) => {
      if (!output) return;
      const path = join(output, `${name}.png`);
      const bytes = await page.screenshot({ path, animations: "disabled" });
      shots[`${name}.png`] = createHash("sha256").update(bytes).digest("hex");
    };
    const walk = (map, x, y) => walkTo(page, MAPS[map], { x, y });
    const north = () => faceDirection(page, "KeyW", Math.PI);
    const interact = () => page.keyboard.press("KeyZ");
    const position = () => page.evaluate(() => window.__controlsTest.getPos());
    const readSave = () => page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v3")));
    const room = page.locator(".game-canvas");
    const assertFrame = async (mapId) => {
      if (baseline) return;
      const { width, height } = await room.evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
      const { ground } = MAPS[mapId];
      assert.deepEqual([width, height], [ground[0].length * 32, ground.length * 32]);
      assert.equal((await measureTargetVisibility(room)).fullyVisible, true);
    };
    const enter = async (x, y, roomId) => {
      await walk("elderhall", x, y);
      await north();
      if ((await position()).map === "elderhall") await interact();
      await page.waitForFunction((id) => window.__controlsTest.getPos().map === id, roomId);
      await assertFrame(roomId);
    };
    await page.goto(baseUrl);
    await page.getByRole("button", { name: "Start", exact: true }).tap();
    for (let i = 0; i < 3; i++) await page.locator(".dialog-next").tap();
    assert.equal((await walk("home", 5, 8)).map, "elderhall");
    await capture("01-entering-elderhall");

    const candidateWorld = ELDERHALL_WORLD_REVISION === 5;
    await walk("elderhall", 16, 5);
    await capture("02-inn-frontage");
    await enter(16, 5, "inn_in");
    await capture("03-quiet-lantern");
    await walk("inn_in", 4, 5);
    await north();
    await interact();
    const rest = page.getByRole("button", { name: "Rest for 15 crowns", exact: true });
    const beforeRest = await readSave();
    await rest.tap();
    await page.locator(".dialog-text").filter({ hasText: /Sleep/ }).waitFor();
    assert.equal((await readSave()).gold, beforeRest.gold - 15);
    await capture("04-inn-service");
    await page.locator(".dialog-next").tap();
    assert.equal((await walk("inn_in", 6, 9)).map, "elderhall");

    const shopX = candidateWorld ? 17 : 16;
    await walk("elderhall", shopX, 9);
    await capture("05-shop-frontage");
    await enter(shopX, 9, "shop_in");
    await capture("06-calders-sundries");
    await walk("shop_in", 4, 5);
    await north();
    await interact();
    const merchant = page.getByRole("dialog", { name: baseline ? "Chandler" : "Calders' Sundries" });
    await merchant.waitFor();
    if (!baseline) assert.match(await merchant.innerText(), /Calder · \d+ crowns in purse/);
    const purchase = await readSave();
    await merchant.getByRole("button", { name: /^Field Tonic / }).tap();
    await merchant.getByRole("button", { name: "Buy for 20 cr" }).tap();
    assert.equal((await readSave()).gold, purchase.gold - 20);
    assert.equal((await readSave()).inventory.tonic, purchase.inventory.tonic + 1);
    await capture("07-merchandise");
    await merchant.getByRole("button", { name: "Sell", exact: true }).tap();
    await merchant.getByRole("button", { name: /^Field Tonic / }).tap();
    await merchant.getByRole("button", { name: "Sell for 10 cr" }).tap();
    assert.equal((await readSave()).gold, purchase.gold - 10);
    assert.equal((await readSave()).inventory.tonic, purchase.inventory.tonic);
    await merchant.getByRole("button", { name: "Leave", exact: true }).tap();
    await walk("shop_in", 8, 5);
    await faceDirection(page, "KeyS", 0);
    if (!baseline) assert.match(await page.locator(".world-interaction-hint").innerText(), /Open cellar hatch/);
    await capture("08-cellar-access");
    await interact();
    await page.waitForFunction(() => window.__controlsTest.getPos().map === "elderhall_cellar");
    await capture("09-cellar");
    const returned = await walk("elderhall_cellar", 7, 11);
    assert.deepEqual([returned.map, returned.x, returned.y], ["shop_in", 8, 5]);
    assert.equal((await walk("shop_in", 5, 8)).map, "elderhall");

    await enter(candidateWorld ? 5 : 4, 9, "guild_in");
    await capture("10-chapter-house");
    await walk("guild_in", 6, 3);
    await north();
    await interact();
    const shrine = page.getByRole("dialog", { name: "Shrine", exact: true });
    assert.match(await shrine.innerText(), /Your beasts are whole. The lantern is written/);
    await shrine.getByRole("button", { name: "Close", exact: true }).tap();
    assert.equal((await walk("guild_in", 6, 10)).map, "elderhall");
    assert.deepEqual(errors, []);
    result = { browser: context.browser().version(), viewport, shots, checked: ["inn cost", "shop buy/sell",
      "cellar route and return", "guild threshold and shrine", "no page errors"] };
    console.log("[building-services] natural village services passed");
  }, { context: { viewport, isMobile: true, hasTouch: true, reducedMotion: "reduce" } });
} finally {
  server.close();
  if (output) await writeFile(join(output, "manifest.json"), JSON.stringify({
    revision: process.env.RELIQUARY_QA_SHA ?? null, baseline, result,
  }, null, 2) + "\n");
}
