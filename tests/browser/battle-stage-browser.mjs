/**
 * Battle stage contract in a real browser: the canvas fills its stage without
 * letterboxing, both creatures stand on the shared ground line, the silhouette
 * band never enters the command dock, and the status cards stay in the upper
 * corners above the stage.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

const artifactDir = process.env.RELIQUARY_BROWSER_ARTIFACTS
  ?? fileURLToPath(new URL("../../artifacts/browser/", import.meta.url));

const SAVE = {
  version: 3,
  worldRevision: 1,
  playerName: "Rowan",
  mapId: "elderhall",
  x: 12,
  y: 14,
  dir: 0,
  gold: 120,
  playTime: 0,
  party: [
    {
      uid: "stage-lead",
      speciesId: "briarling",
      nickname: "Briarling",
      level: 5,
      exp: 0,
      hp: 23,
      mp: 17,
      ivs: { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 },
      temperament: "fierce",
      skills: ["nip", "rootgrasp"],
      status: null,
      statusTurns: 0,
    },
  ],
  box: [],
  inventory: { tonic: 2, common_sigil: 2 },
  flags: { starter: true },
  seen: { briarling: true, galeskip: true },
  caught: { briarling: true },
};

const VIEWPORTS = [
  { name: "1536x864", width: 1536, height: 864, family: "desktop" },
  { name: "1440x900", width: 1440, height: 900, family: "desktop" },
  { name: "1280x800", width: 1280, height: 800, family: "desktop" },
  { name: "844x390", width: 844, height: 390, family: "compact-landscape" },
  { name: "640x320", width: 640, height: 320, family: "compact-landscape" },
  { name: "568x320", width: 568, height: 320, family: "compact-landscape" },
  { name: "390x844", width: 390, height: 844, family: "portrait" },
  { name: "390x667", width: 390, height: 667, family: "portrait" },
  { name: "320x568", width: 320, height: 568, family: "portrait" },
  { name: "768x1024", width: 768, height: 1024, family: "portrait" },
  { name: "834x1112", width: 834, height: 1112, family: "portrait" },
];

const { server, baseUrl } = await startStaticServer(0);
mkdirSync(artifactDir, { recursive: true });

async function dismissIntro(page) {
  for (let i = 0; i < 24; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
  }
}

async function enterReferenceBattle(page) {
  await page.addInitScript(() => { Math.random = () => 0.5; });
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.evaluate((save) => localStorage.setItem("reliquary.save.v3", JSON.stringify(save)), SAVE);
  await page.reload({ waitUntil: "load" });
  await waitForGameBoot(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForSelector(".hud-menu", { timeout: 20_000 });
  await dismissIntro(page);
  await page.waitForFunction(() => typeof window.__reliquary?.startBattleWith === "function");
  await page.evaluate(() => window.__reliquary.startBattleWith("briarling", "galeskip", [5, 4]));
  await page.waitForSelector(".battle-ui", { timeout: 20_000 });
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
  await page.locator('[data-command="Strike"]').focus();
  await page.waitForTimeout(120);
}

try {
  for (const vp of VIEWPORTS) {
    await withBrowser(async (page) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await enterReferenceBattle(page);
      const geometry = await page.evaluate(() => {
        const rect = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom };
        };
        const canvas = document.querySelector(".game-canvas");
        const viewport = document.querySelector(".viewport");
        const cr = canvas?.getBoundingClientRect();
        const vr = viewport?.getBoundingClientRect();
        const report = window.__battleStageReport;
        return {
          report,
          canvas: rect(".game-canvas"),
          stage: rect(".game-root > .stage"),
          viewport: rect(".viewport"),
          controls: rect(".battle-controls"),
          playerCard: rect(".battler.me"),
          foeCard: rect(".battler.foe"),
          canvasInternal: canvas ? { w: canvas.width, h: canvas.height } : null,
          canvasCss: cr && vr ? { w: cr.width, h: cr.height, vw: vr.width, vh: vr.height } : null,
          playerName: document.querySelector(".battler.me .battle-status-name")?.textContent,
          foeName: document.querySelector(".battler.foe .battle-status-name")?.textContent,
          playerHp: document.querySelector(".battler.me .battle-stat-numbers")?.textContent,
          actions: [...document.querySelectorAll(".battle-action")].map((el) => {
            const b = el.getBoundingClientRect();
            return { text: el.getAttribute("data-command"), w: b.width, h: b.height, disabled: el.getAttribute("aria-disabled") };
          }),
        };
      });
      assert.ok(geometry.report, `${vp.name}: stage report missing`);
      assert.equal(geometry.report.presentation, vp.family, `${vp.name}: presentation`);
      assert.ok(geometry.stage, `${vp.name}: stage metrics missing`);
      assert.ok(geometry.canvasCss, `${vp.name}: canvas metrics missing`);
      // Compare to the stage, not .viewport: the viewport is sized *from* the
      // canvas, so comparing them would be tautological.
      assert.ok(
        Math.abs(geometry.canvas.w - geometry.stage.w) <= 12 &&
          Math.abs(geometry.canvas.h - geometry.stage.h) <= 12,
        `${vp.name}: canvas must fill its stage, got canvas ${JSON.stringify(geometry.canvas)} stage ${JSON.stringify(geometry.stage)}`,
      );
      assert.ok(
        Math.abs(geometry.canvasInternal.w / geometry.canvasInternal.h - geometry.canvasCss.w / geometry.canvasCss.h) < 0.01,
        `${vp.name}: canvas backing aspect must match its CSS box`,
      );
      // Ground contact and silhouette clearance, mapped to CSS pixels.
      const scaleY = geometry.canvasCss.h / geometry.canvasInternal.h;
      const groundCss = geometry.canvas.y + geometry.report.groundY * scaleY;
      assert.ok(
        Math.abs(geometry.report.spriteAnchors.player.feetY - geometry.report.groundY) < 0.01 &&
          Math.abs(geometry.report.spriteAnchors.foe.feetY - geometry.report.groundY) < 0.01,
        `${vp.name}: both creatures share the ground line`,
      );
      assert.ok(
        groundCss < geometry.controls.y - 2,
        `${vp.name}: creature feet (${groundCss}) must stay above the dock (${geometry.controls.y})`,
      );
      // Status cards: player upper-left, foe upper-right, same top band.
      assert.ok(geometry.playerCard && geometry.foeCard, `${vp.name}: both status cards render`);
      assert.ok(geometry.playerCard.x < geometry.foeCard.x, `${vp.name}: player card left of foe card`);
      assert.ok(
        Math.abs(geometry.playerCard.y - geometry.foeCard.y) < 1.5,
        `${vp.name}: status cards share a top edge`,
      );
      assert.ok(geometry.playerCard.bottom < geometry.controls.y, `${vp.name}: status cards clear the dock`);
      assert.equal(geometry.playerName, "Briarling", `${vp.name}: live player name`);
      assert.equal(geometry.foeName, "Galeskip", `${vp.name}: live foe name`);
      assert.match(geometry.playerHp ?? "", /^\d+ \/ \d+$/, `${vp.name}: live HP readout`);
      assert.equal(geometry.actions.length, 6, `${vp.name}: six command slots`);
      for (const action of geometry.actions) {
        assert.ok(action.h >= 44, `${vp.name}: ${action.text} height ${action.h}`);
        assert.ok(action.w >= 44, `${vp.name}: ${action.text} width ${action.w}`);
      }
      await page.screenshot({ path: join(artifactDir, `battle-stage-${vp.name}.png`) });
    });
    console.log(`[battle-stage-browser] ok ${vp.name}`);
  }
  console.log("[battle-stage-browser] every family fills its stage and clears the dock");
} finally {
  server.close();
}
