/**
 * Save transfer journey: export a real run to a file, edit that file the way a
 * player moving between machines would, import it back through the game's own
 * Import entry and file picker, and confirm the run survives a reload. Then
 * check the refusals: an unreadable file, and a well-formed but impossible
 * record, must both leave the current run untouched.
 *
 * Usage: node scripts/save-transfer-qa.mjs <local-url> <evidence-directory>
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const url = process.argv[2] ?? "http://127.0.0.1:8083";
const output = process.argv[3];
if (!output || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("usage: node scripts/save-transfer-qa.mjs <local-url> <evidence-directory>");
mkdirSync(output, { recursive: true });

const report = { steps: [], failures: [] };
const check = (condition, message) => {
  report.steps.push(`${condition ? "ok" : "FAIL"} — ${message}`);
  if (!condition) report.failures.push(message);
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
report.browser = browser.version();
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.failures.push(`pageerror: ${String(error?.stack ?? error)}`));
  page.on("console", (message) => {
    if (message.type() === "error") report.failures.push(`console: ${message.text()}`);
  });
  const readSave = () => page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v2")));
  const hudGold = async () => Number((await page.locator(".hud-gold").innerText()).match(/\d+/)?.[0]);
  const dismissDialogs = async (limit = 12) => {
    for (let i = 0; i < limit; i++) {
      if ((await page.locator("button.dialog").count()) === 0) return;
      await page.locator("button.dialog").click();
      await page.waitForTimeout(140);
    }
  };

  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator("button.dialog").first().click();
  await dismissDialogs();
  await page.waitForTimeout(300);

  // A run worth losing: save it, then hand it out as a file.
  await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(250);
  const before = await readSave();
  check(!!before, "a run is stored before exporting");

  await page.keyboard.press("KeyM");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const exportedPath = resolve(join(output, download.suggestedFilename()));
  await download.saveAs(exportedPath);
  const exported = JSON.parse(readFileSync(exportedPath, "utf8"));
  check(
    /^reliquary-[a-z0-9-]+\.json$/.test(download.suggestedFilename()),
    `the exported file is named for the player (${download.suggestedFilename()})`,
  );
  check(
    exported.gold === before.gold && exported.party.length === before.party.length && exported.mapId === before.mapId,
    "the exported file matches the live run",
  );
  await page.screenshot({ path: join(output, "1-exported.png") });

  // Now the use case itself: a file a player brings from another machine. It
  // carries the run plus a companion the game has never seen under that name.
  const { makeBeast } = await import("../src/game/content.ts");
  const companion = makeBeast("emberkit", 6);
  companion.nickname = "Pactling";
  exported.gold = 777;
  exported.playerName = "Imported";
  exported.party = [companion];
  exported.flags = { ...(exported.flags ?? {}), imported_mark: true };
  const editedPath = resolve(join(output, "edited-transfer.json"));
  writeFileSync(editedPath, JSON.stringify(exported), "utf8");

  await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.setInputFiles("input.save-file-input", editedPath);
  await page.waitForTimeout(500);
  const imported = await readSave();
  check(imported?.playerName === "Imported", "the imported file replaced the run's name");
  check(imported?.gold === 777, "the imported file replaced the run's gold");
  check(imported?.flags?.imported_mark === true, "the imported file carried nested flag data");
  check(imported?.party?.[0]?.nickname === "Pactling", "the imported companion arrived with its name");
  check((await hudGold()) === 777, "the HUD shows the imported crowns");

  await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Party", exact: true }).click();
  const partyText = await page.locator(".sheet").innerText();
  check(/Pactling/.test(partyText), "the imported companion is usable in the Party screen");
  await page.screenshot({ path: join(output, "2-imported.png") });
  await page.keyboard.press("Escape");

  // The reload must keep the imported run, not the old one.
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.waitForTimeout(400);
  const afterReload = await readSave(page);
  check(
    afterReload?.playerName === "Imported" && afterReload?.gold === 777 && afterReload?.party?.[0]?.nickname === "Pactling",
    "the imported run survives a reload",
  );
  await page.screenshot({ path: join(output, "3-reloaded.png") });

  // Refusal one: not a save at all.
  const garbagePath = resolve(join(output, "not-a-save.json"));
  writeFileSync(garbagePath, "this is not a reliquary save", "utf8");
  await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.setInputFiles("input.save-file-input", garbagePath);
  await page.waitForTimeout(400);
  const refusal = await page.locator("button.dialog").innerText().catch(() => "");
  check(/not a readable/i.test(refusal), "an unreadable file is refused with an explanation");
  await page.screenshot({ path: join(output, "4-refused.png") });
  await dismissDialogs();
  check((await hudGold()) === 777, "a refused import leaves the current crowns alone");

  // Refusal two: well-formed JSON that cannot be a real position.
  const offMapPath = resolve(join(output, "impossible.json"));
  writeFileSync(offMapPath, JSON.stringify({ ...exported, x: 9999, gold: 1234 }), "utf8");
  await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.setInputFiles("input.save-file-input", offMapPath);
  await page.waitForTimeout(400);
  check((await hudGold()) === 777, "an impossible-but-well-formed record is refused too");
  await dismissDialogs();
  await page.screenshot({ path: join(output, "5-final.png") });
} finally {
  await browser.close();
}

writeFileSync(join(output, "save-transfer.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failures.length ? 1 : 0;
