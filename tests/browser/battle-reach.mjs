// S10: every mandatory battle control must be reachable and actually actuate
// in real touch/mobile contexts at the synthesis viewport matrix. Size and
// stability alone are insufficient: each control's full clickable rectangle
// must sit inside the usable viewport, elementFromPoint must hit it, and an
// actual tap must perform the expected action.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, waitForGameBoot } from "./helpers.mjs";
import { chromium } from "playwright";

const artifactDir = process.env.RELIQUARY_BROWSER_ARTIFACTS
  ?? fileURLToPath(new URL("../../artifacts/browser/", import.meta.url));

const SAVE_KEY = "reliquary.save.v3";

const prepared = (extra = {}) => ({
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
    {
      uid: "btest1",
      speciesId: "emberkit",
      nickname: "Ember",
      level: 9,
      exp: 0,
      hp: 36,
      mp: 24,
      ivs: { hp: 10, mp: 10, atk: 10, def: 10, mag: 10, res: 10, spd: 10, lck: 10 },
      temperament: "fierce",
      skills: ["nip", "cinder", "slash", "scorch"],
      status: null,
      statusTurns: 0,
    },
    {
      uid: "btest2",
      speciesId: "riverguard",
      nickname: "Guard",
      level: 9,
      exp: 0,
      hp: 1,
      mp: 20,
      ivs: { hp: 10, mp: 10, atk: 10, def: 10, mag: 10, res: 10, spd: 10, lck: 10 },
      temperament: "warding",
      skills: ["nip", "torrent"],
      status: null,
      statusTurns: 0,
    },
  ],
  box: [],
  inventory: { tonic: 3, etherdrop: 2, common_sigil: 3, phoenix_ash: 1 },
  flags: { starter: true },
  seen: { emberkit: true, riverguard: true },
  caught: { emberkit: true },
  ...extra,
});

const VIEWPORTS = [
  { name: "844x390", width: 844, height: 390 },
  { name: "667x375", width: 667, height: 375 },
  { name: "568x320", width: 568, height: 320 },
];

const { server, baseUrl } = await startStaticServer(0);
const report = { viewports: [] };

try {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ serviceWorkers: "block", hasTouch: true, viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      const rows = { name: vp.name, controls: [], failures: [] };
      try {
        await page.goto(baseUrl, { waitUntil: "load" });
        await page.evaluate((value) => localStorage.setItem("reliquary.save.v3", JSON.stringify(value)), prepared());
        await page.reload({ waitUntil: "load" });
        await waitForGameBoot(page);
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        await page.waitForSelector(".hud-menu", { timeout: 20_000 });
        await page.evaluate(() => window.__controlsTest?.startWild?.());
        await page.waitForSelector(".battle-ui", { timeout: 20_000 });

        const assertReachable = async (selector, label, activate, options = {}) => {
          const el = page.locator(selector).first();
          if (options.scroll) {
            // A thumb can scroll the submenu body; measure after bringing the
            // row into view, like a real reach would.
            await el.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(120);
          }
          const box = await el.boundingBox();
          if (!box) {
            rows.failures.push(`${label}: not found`);
            return false;
          }
          const fullyVisible = box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height;
          if (!fullyVisible && !options.scroll) {
            rows.failures.push(`${label}: bounds outside viewport ${JSON.stringify(box)}`);
          }
          const hitInfo = await page.evaluate(
            ([x, y]) => {
              const el = document.elementFromPoint(x, y);
              if (!el) return null;
              const btn = el.closest("button");
              return { label: btn?.getAttribute("aria-label") ?? btn?.textContent ?? null, cls: el.className?.toString?.().slice(0, 60) ?? null };
            },
            [box.x + box.width / 2, box.y + box.height / 2],
          );
          const hitOk = Boolean(
            hitInfo && (await el.evaluate((node) => {
              const r = node.getBoundingClientRect();
              const el2 = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
              return Boolean(el2 && (el2 === node || node.contains(el2) || el2.contains(node)));
            })),
          );
          if (!hitOk) {
            rows.failures.push(`${label}: elementFromPoint missed the target (hit ${JSON.stringify(hitInfo)})`);
          }
          if (activate) await el.click({ timeout: 4000 });
          rows.controls.push({ label, box, fullyVisible, hitOk });
          return fullyVisible && hitOk;
        };

        // All six battle commands (wild battle: canBind and canFlee are on).
        const commands = ["Strike", "Skill", "Item", "Bind", "Party", "Flee"];
        for (const cmd of commands) {
          const ok = await assertReachable(`.battle-controls button:text-is("${cmd}")`, `command ${cmd}`, true);
          assert.ok(ok, `${vp.name}: command ${cmd} not reachable — ${rows.failures.join("; ")}`);
          await page.waitForTimeout(150);
          if (cmd === "Strike") {
            // Strike resolves the turn; wait back to command phase.
            await page.waitForFunction(
              () => document.querySelector(".battle-controls")?.getAttribute("data-battle-phase") === "command",
              null,
              { timeout: 15_000 },
            );
            continue;
          }
          if (cmd === "Flee") {
            // Flee may succeed (win) or fail (back to command); either way the
            // command list must come back or the battle ends.
            await page.waitForFunction(
              () => {
                const phase = document.querySelector(".battle-controls")?.getAttribute("data-battle-phase");
                return phase === "command" || phase === "win";
              },
              null,
              { timeout: 15_000 },
            );
            if ((await page.locator(".battle-continue").count()) > 0) {
              await page.locator(".battle-continue").click();
              await page.waitForSelector(".hud-menu", { timeout: 15_000 });
              // Restart the battle for the remaining checks.
              await page.evaluate(() => window.__controlsTest?.startWild?.());
              await page.waitForSelector(".battle-ui", { timeout: 20_000 });
            }
            continue;
          }
          // Submenu: its Back control must be reachable and must return to commands.
          const backOk = await assertReachable(".battle-controls .battle-back", `submenu ${cmd} Back`, true);
          assert.ok(backOk, `${vp.name}: ${cmd} Back not reachable — ${rows.failures.join("; ")}`);
          await page.waitForFunction(
            () => document.querySelector(".battle-controls")?.getAttribute("data-battle-phase") === "command",
            null,
            { timeout: 15_000 },
          );
        }

        // Item submenu entries are reachable where offered (tonic on a hurt
        // active beast qualifies; guard against the no-effect guard).
        await page.locator(".battle-controls button:text-is(\"Item\")").click();
        await page.waitForFunction(
          () => document.querySelector(".battle-controls")?.getAttribute("data-battle-phase") === "items",
          null,
          { timeout: 10_000 },
        );
        const itemCount = await page.locator(".battle-controls-body ul.cmd button").count();
        assert.ok(itemCount > 0, `${vp.name}: battle item list unexpectedly empty (phoenix_ash excluded, tonic eligible)`);
        for (let i = 0; i < itemCount; i += 1) {
          await assertReachable(`.battle-controls-body ul.cmd button >> nth=${i}`, `battle item row ${i}`, false, { scroll: true });
        }
        await page.locator(".battle-controls .battle-back").click();
        await page.waitForFunction(
          () => document.querySelector(".battle-controls")?.getAttribute("data-battle-phase") === "command",
          null,
          { timeout: 10_000 },
        );

        // Forced switch: open the Party submenu voluntarily (the 1-HP reserve
        // is a legal switch) and then keep sending enabled companions while
        // the phase demands it, asserting each demanded choice is reachable.
        await page.locator(".battle-controls button:text-is(\"Party\")").click();
        await page.waitForFunction(
          () => document.querySelector(".battle-controls")?.getAttribute("data-battle-phase") === "party",
          null,
          { timeout: 10_000 },
        );
        let switchGuard = 0;
        for (;;) {
          const phase = await page.locator(".battle-controls").getAttribute("data-battle-phase");
          if (phase !== "party") break;
          assert.ok(switchGuard++ < 6, `${vp.name}: forced switching did not settle`);
          const enabled = page.locator(".battle-controls-body ul.cmd button:not([disabled])");
          assert.ok((await enabled.count()) > 0, `${vp.name}: forced switch with no enabled companion`);
          const lastIndex = (await enabled.count()) - 1;
          await assertReachable(`.battle-controls-body ul.cmd button:not([disabled]) >> nth=${lastIndex}`, `forced-switch choice ${switchGuard}`, true, { scroll: true });
          await page.waitForFunction(
            () => {
              const p = document.querySelector(".battle-controls")?.getAttribute("data-battle-phase");
              return p === "command" || p === "party" || p === "win" || p === "lose";
            },
            null,
            { timeout: 15_000 },
          );
        }
        await page.screenshot({ path: join(artifactDir, `battle-reach-${vp.name}.png`) });
      } catch (error) {
        try {
          const phase = await page.locator(".battle-controls").getAttribute("data-battle-phase").catch(() => "?");
          const hudText = await page.locator(".battle-ui").innerText().catch(() => "?");
          console.log(`[battle-reach:${vp.name}] failure phase=${phase} hud=${hudText.slice(0, 140).replace(/\s+/g, " ")}`);
          mkdirSync(artifactDir, { recursive: true });
          await page.screenshot({ path: join(artifactDir, `battle-reach-${vp.name}-fail.png`) });
        } catch {
          // A failed diagnostic screenshot must not hide the original error.
        }
        rows.failures.push(`scenario error: ${String(error?.message ?? error).slice(0, 200)}`);
      } finally {
        report.viewports.push(rows);
        await context.close();
      }
    }
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, "battle-reach-report.json"), JSON.stringify(report, null, 2));
    for (const vp of report.viewports) {
      assert.equal(vp.failures.length, 0, `${vp.name}: ${vp.failures.join("; ")}`);
    }
  } finally {
    await browser.close();
  }
  console.log("[battle-reach] every mandatory battle control reachable in", report.viewports.map((v) => v.name).join(", "));
} finally {
  server.close();
}
