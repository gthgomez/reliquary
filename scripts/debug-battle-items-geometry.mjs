// Debug: capture the 844x390 battle item submenu geometry.
import { startStaticServer, waitForGameBoot } from "../tests/browser/helpers.mjs";
import { chromium } from "playwright";

const prepared = {
  version: 3,
  worldRevision: 1,
  playerName: "Rowan",
  mapId: "elderhall",
  x: 12,
  y: 14,
  dir: 0,
  gold: 300,
  playTime: 0,
  party: [
    { uid: "btest1", speciesId: "emberkit", nickname: "Ember", level: 9, exp: 0, hp: 36, mp: 24, ivs: { hp: 10, mp: 10, atk: 10, def: 10, mag: 10, res: 10, spd: 10, lck: 10 }, temperament: "fierce", skills: ["nip", "cinder", "slash", "scorch"], status: null, statusTurns: 0 },
    { uid: "btest2", speciesId: "riverguard", nickname: "Guard", level: 9, exp: 0, hp: 1, mp: 20, ivs: { hp: 10, mp: 10, atk: 10, def: 10, mag: 10, res: 10, spd: 10, lck: 10 }, temperament: "warding", skills: ["nip", "torrent"], status: null, statusTurns: 0 },
  ],
  box: [],
  inventory: { tonic: 3, etherdrop: 2, common_sigil: 3, phoenix_ash: 1 },
  flags: { starter: true },
  seen: { emberkit: true, riverguard: true },
  caught: { emberkit: true },
};

const { server, baseUrl } = await startStaticServer(0);
try {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ serviceWorkers: "block", hasTouch: true, viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.evaluate((v) => localStorage.setItem("reliquary.save.v3", JSON.stringify(v)), prepared);
  await page.reload({ waitUntil: "load" });
  await waitForGameBoot(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForSelector(".hud-menu", { timeout: 20_000 });
  await page.evaluate(() => window.__controlsTest?.startWild?.());
  await page.waitForSelector(".battle-ui", { timeout: 20_000 });
  await page.locator('.battle-controls button[data-command="Item"]').click();
  await page.waitForFunction(() => document.querySelector(".battle-controls")?.getAttribute("data-battle-phase") === "items", null, { timeout: 10_000 });
  const geo = await page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      viewport: { w: innerWidth, h: innerHeight },
      controls: box(document.querySelector(".battle-controls")),
      body: box(document.querySelector(".battle-controls-body")),
      bodyScroll: (() => { const b = document.querySelector(".battle-controls-body"); return b ? { scrollHeight: b.scrollHeight, clientHeight: b.clientHeight, scrollTop: b.scrollTop } : null; })(),
      actions: box(document.querySelector(".battle-controls-actions")),
      battler: box(document.querySelector(".battle-ui .battler.me")),
      log: box(document.querySelector(".battle-log-text")),
      rows: [...document.querySelectorAll(".battle-controls-body ul.cmd button")].map(box),
      row0Hit: (() => { const b = document.querySelector(".battle-controls-body ul.cmd button"); if (!b) return null; const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el ? { tag: el.tagName, cls: String(el.className).slice(0, 50), label: el.closest("button")?.textContent?.slice(0, 30) ?? null } : null; })(),
    };
  });
  console.log(JSON.stringify(geo, null, 1));
  await page.screenshot({ path: "artifacts/browser/debug-battle-items-844x390.png" });
  await browser.close();
} finally {
  server.close();
}
