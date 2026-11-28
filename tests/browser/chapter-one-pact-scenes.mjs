/** Matched, ordinary-input phone journey through each starter, reload and the first wild encounter. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAPS } from "../../src/game/maps.ts";
import { faceDirection, walkTo } from "../../scripts/natural-journey-controls.mjs";
import { measureTargetVisibility, startStaticServer, withBrowser } from "./helpers.mjs";

const output = process.env.RELIQUARY_PACT_SCENES;
if (output) await mkdir(output, { recursive: true });
const viewport = { width: 390, height: 844 };
const starters = ["emberkit", "mirewhelp", "briarling"];
const selectedStarter = process.argv[2];
if (selectedStarter && !starters.includes(selectedStarter)) throw new Error("Unknown starter");
const records = [];
const { server, baseUrl } = await startStaticServer();
const save = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v3")));

try {
  for (const id of selectedStarter ? [selectedStarter] : starters) {
    await withBrowser(async (page, context) => {
      const shots = {};
      const errors = [];
      const capture = async (scene) => {
        if (!output) return;
        const name = `${id}-${scene}.png`;
        const bytes = await page.screenshot({ path: join(output, name), animations: "disabled" });
        shots[name] = createHash("sha256").update(bytes).digest("hex");
      };
      const walk = (map, x, y, starter = false) => walkTo(page, MAPS[map], { x, y }, starter);
      const forward = page.locator(".dialog-next");
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.__journeyDraw = () => 0.5;
        window.__reliquaryJourneyRandom = () => window.__journeyDraw();
      });
      await page.goto(baseUrl);
      await page.getByRole("button", { name: "Start", exact: true }).tap();
      for (let pageIndex = 0; pageIndex < 3; pageIndex++) await forward.tap();
      assert.equal((await walk("home", 5, 8)).map, "elderhall");
      assert.equal((await walk("elderhall", 0, 10)).map, "grove");
      await capture("01-grove-arrival");
      const station = MAPS.grove.objects.find((object) => object.sprite === id);
      await walk("grove", station.x, station.y + 1);
      await faceDirection(page, "KeyW", Math.PI);
      await page.keyboard.press("KeyZ");
      const before = await save(page);
      for (const pageIndex of [1, 2, 3]) {
        await forward.waitFor();
        assert.ok((await measureTargetVisibility(forward)).hitOk);
        await capture(`02-inspection-${pageIndex}`);
        await forward.tap();
      }
      const namePrompt = page.getByRole("dialog", { name: "Name your creature" });
      const input = namePrompt.getByRole("textbox", { name: "Creature name" });
      await input.waitFor();
      const afterBind = await save(page);
      assert.equal(afterBind.gold, before.gold + 40);
      assert.equal(afterBind.inventory.common_sigil, (before.inventory.common_sigil ?? 0) + 3);
      assert.equal(afterBind.party.length, 1);
      assert.equal(afterBind.party[0].speciesId, id);
      assert.match(await namePrompt.innerText(), /First pact kept.*\+40 crowns/);
      await capture("03-naming");
      if (id === "briarling") {
        await input.fill("Juniper");
        const beforeReload = await save(page);
        await page.reload();
        await page.getByRole("button", { name: "Continue", exact: true }).tap();
        await input.waitFor();
        assert.equal(await input.inputValue(), "Juniper");
        assert.deepEqual((await save(page)).party, beforeReload.party);
        await namePrompt.getByRole("button", { name: "Confirm name" }).tap();
      } else {
        await namePrompt.getByRole("button", { name: /^Keep / }).tap();
      }
      await capture("04-rowan-first-page");
      await forward.tap();
      await capture("05-rowan-second-page");
      await forward.tap();
      await page.locator(".hud-companion-name").waitFor();
      const afterName = await save(page);
      assert.equal(afterName.party[0].uid, afterBind.party[0].uid);
      assert.equal(afterName.gold, afterBind.gold);
      assert.equal(afterName.inventory.common_sigil, afterBind.inventory.common_sigil);
      assert.equal(afterName.party[0].nickname, id === "briarling" ? "Juniper" : afterBind.party[0].nickname);
      await capture("06-grove-after-pact");
      for (const other of starters.filter((starter) => starter !== id)) {
        const remaining = MAPS.grove.objects.find((object) => object.sprite === other);
        await walk("grove", remaining.x, remaining.y + 1, afterName.flags);
        await faceDirection(page, "KeyW", Math.PI);
        await page.keyboard.press("KeyZ");
        assert.match(await page.locator(".dialog-text").innerText(), /Your pact is already spoken/);
        await forward.tap();
      }
      if (id === "briarling") {
        assert.equal((await walk("grove", 15, 7, afterName.flags)).map, "elderhall");
        assert.equal((await walk("elderhall", 10, 0, true)).map, "briar_road");
        await page.evaluate(() => { window.__journeyDraw = () => 0.99; });
        await walk("briar_road", 10, 22, true);
        await capture("07-road-heading-north");
        await page.evaluate(() => { window.__journeyDraw = () => 0.05; });
        let position = await walk("briar_road", 4, 22, true);
        for (let step = 0; step < 12 && position.mode !== "battle"; step++) {
          position = await walk("briar_road", step % 2 ? 4 : 5, 22, true);
        }
        assert.equal(position.mode, "battle");
        await page.locator(".battle-action").first().waitFor();
        assert.match(await page.locator(".battler.foe").innerText(), /Mothwisp/);
        await capture("08-mothwisp-commands");
        await page.getByRole("button", { name: "Skill", exact: true }).tap();
        await page.getByRole("button", { name: /Rootgrasp 8 MP/ }).waitFor();
        await capture("09-mothwisp-skills");
        await page.getByRole("button", { name: "Back", exact: true }).tap();
        assert.equal(await page.locator(".battle-controls").getAttribute("data-battle-phase"), "command");
      }
      assert.deepEqual(errors, []);
      records.push({ id, viewport, browser: context.browser().version(), shots, crowns: afterName.gold,
        commonSigils: afterName.inventory.common_sigil, partyUid: afterName.party[0].uid });
      console.log(`[pact-scenes] ${id} passed`);
    }, { context: { viewport, isMobile: true, hasTouch: true, reducedMotion: "reduce" } });
  }
} finally {
  server.close();
  if (output) await writeFile(join(output, "manifest.json"), JSON.stringify({
    revision: process.env.RELIQUARY_QA_SHA ?? null, records,
  }, null, 2) + "\n");
}
