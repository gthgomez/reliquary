// S01: real same-origin two-page writer authorization. One browser context
// shares the Web Locks manager and localStorage across both pages: page A
// takes the real save-writer lock, page B must be visibly denied and must not
// change any slot — through its own real UI — while A keeps working.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startStaticServer, waitForGameBoot } from "./helpers.mjs";
import { chromium } from "playwright";

const SAVE_KEY = "reliquary.save.v3";
const SLOT_KEYS = [
  SAVE_KEY,
  "reliquary.save.v3.bak",
  "reliquary.save.forward",
  "reliquary.save.v2",
  "reliquary.save.v2.bak",
  "reliquary.save.v1",
  "reliquary.save.v1.bak",
];

const validSave = (gold) => ({
  version: 3,
  worldRevision: 1,
  playerName: "Rowan",
  mapId: "elderhall",
  x: 12,
  y: 14,
  dir: 0,
  gold,
  playTime: 0,
  party: [
    {
      uid: "btest1",
      speciesId: "emberkit",
      nickname: "Ember",
      level: 5,
      exp: 0,
      hp: 24,
      mp: 17,
      ivs: { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 },
      temperament: "fierce",
      skills: ["nip", "cinder"],
      status: null,
      statusTurns: 0,
    },
  ],
  box: [],
  inventory: { tonic: 1 },
  flags: { starter: true },
  seen: { emberkit: true },
  caught: { emberkit: true },
});

const slotsOf = (page) =>
  page.evaluate((keys) => {
    const out = {};
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    }
    return out;
  }, SLOT_KEYS);

async function bootToWorld(page, url) {
  await page.goto(url, { waitUntil: "load" });
  await waitForGameBoot(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForSelector(".hud-menu", { timeout: 20_000 });
}

async function menuSave(page) {
  await page.click(".hud-menu");
  await page.waitForSelector(".overlay-panel");
  await page.locator(".overlay-panel .menu-list button", { hasText: "Save" }).click();
  await page.waitForSelector(".hud-menu");
}

async function menuImport(page, file) {
  await page.click(".hud-menu");
  await page.waitForSelector(".overlay-panel");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator(".overlay-panel .menu-list button", { hasText: "Import" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
  await page.waitForSelector(".hud-menu");
}

const { server, baseUrl } = await startStaticServer(0);
const work = mkdtempSync(join(tmpdir(), "reliquary-save-permission-"));
const importFile = join(work, "import-save.json");
writeFileSync(importFile, JSON.stringify(validSave(777)));

try {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const pageA = await context.newPage();
    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.goto(baseUrl, { waitUntil: "load" });
    await pageA.evaluate((value) => localStorage.setItem("reliquary.save.v3", JSON.stringify(value)), validSave(111));
    await bootToWorld(pageA, baseUrl);
    await menuSave(pageA);
    const baseline = await slotsOf(pageA);
    assert.ok(baseline[SAVE_KEY], "baseline primary exists");

    // Page B joins the same origin while A holds the real Web Lock.
    const pageB = await context.newPage();
    await pageB.setViewportSize({ width: 390, height: 844 });
    await bootToWorld(pageB, baseUrl);

    // B attempts an ordinary Save through its real UI: visibly denied, slots byte-identical.
    await pageB.click(".hud-menu");
    await pageB.waitForSelector(".overlay-panel");
    await pageB.locator(".overlay-panel .menu-list button", { hasText: "Save" }).click();
    await pageB.waitForSelector(".toast");
    const bToast = await pageB.locator(".toast").innerText();
    assert.match(bToast, /Another window holds your save/, `B must be visibly denied, got: ${bToast}`);
    await pageB.waitForSelector(".hud-menu");
    assert.deepEqual(await slotsOf(pageB), baseline, "denied Save changed no slot");

    // B attempts a valid Import through its real UI: refused, live state not applied.
    await menuImport(pageB, importFile);
    await pageB.waitForSelector(".toast");
    const bImportToast = await pageB.locator(".toast").innerText();
    assert.match(bImportToast, /Another window holds your save/, `denied Import must refuse, got: ${bImportToast}`);
    // Settle window: a late-applied async import would surface here.
    await pageB.waitForTimeout(500);
    assert.match(bImportToast, /Another window holds your save/);
    assert.deepEqual(await slotsOf(pageB), baseline, "denied Import changed no slot");
    assert.deepEqual(
      await pageB.evaluate(() => localStorage.getItem("reliquary.save.v3") && JSON.parse(localStorage.getItem("reliquary.save.v3")).gold),
      111,
      "B's durable gold is unchanged",
    );
    const bHud = await pageB.locator(".hud").innerText();
    assert.match(bHud, /111 cr/, "B's live purse is unchanged (imported state not applied)");

    // A remains fully authorized: an ordinary save and a valid import work.
    await menuSave(pageA);
    const afterASave = await slotsOf(pageA);
    assert.notEqual(afterASave[SAVE_KEY], baseline[SAVE_KEY], "A's save still writes (playtime advances)");
    await menuImport(pageA, importFile);
    // Deterministic barrier: the import handler applies asynchronously.
    await pageA.waitForFunction(
      () => {
        const raw = localStorage.getItem("reliquary.save.v3");
        return raw ? JSON.parse(raw).gold === 777 : false;
      },
      null,
      { timeout: 10_000 },
    );
    const afterAImport = await slotsOf(pageA);
    assert.equal(JSON.parse(afterAImport[SAVE_KEY]).gold, 777, "A's import applies");
    assert.equal(JSON.parse(afterAImport["reliquary.save.v3.bak"]).gold, 111, "A's import rotates the prior run to backup");

    // Release/reload/reacquisition: A closes; B reloads and now holds the lock.
    await pageA.close();
    await pageB.reload({ waitUntil: "load" });
    await waitForGameBoot(pageB);
    await pageB.getByRole("button", { name: "Continue", exact: true }).click();
    await pageB.waitForSelector(".hud-menu", { timeout: 20_000 });
    await menuSave(pageB);
    const afterBSave = await slotsOf(pageB);
    assert.notEqual(afterBSave[SAVE_KEY], afterAImport[SAVE_KEY], "B saves after reacquiring the released lock");
  } finally {
    await browser.close();
  }
  console.log("[save-permission] two-page writer authorization passed");
} finally {
  server.close();
}
