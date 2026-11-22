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
import { rectsOverlap } from "../../src/game/render/battle-layout-dom.ts";
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

async function checkEnlargedSkillMenu(page, viewport) {
  const skill = page.getByRole("button", { name: "Skill", exact: true });
  const back = page.getByRole("button", { name: "Back", exact: true });
  const controls = page.locator(".battle-controls");
  const assertRow = async (name, cost) => {
    const row = page.getByRole("button", { name: new RegExp(`^${name} ${cost} MP$`) });
    await page.waitForFunction((label) =>
      document.activeElement?.querySelector(".cmd-skill-name")?.textContent === label, name);
    const geometry = await row.evaluate((button) => {
      const row = button.getBoundingClientRect();
      const body = button.closest(".battle-controls-body").getBoundingClientRect();
      const label = button.querySelector(".cmd-skill-name");
      const cost = button.querySelector("em").getBoundingClientRect();
      const hit = document.elementFromPoint(row.left + row.width / 2, row.top + row.height / 2);
      return { row: row.toJSON(), body: body.toJSON(), cost: cost.toJSON(),
        labelFits: label.scrollWidth <= label.clientWidth + 1,
        hit: button.contains(hit) };
    });
    assert.ok(geometry.row.top >= geometry.body.top - 1 &&
      geometry.row.bottom <= geometry.body.bottom + 1 && geometry.row.height >= 44 &&
      geometry.cost.right <= geometry.row.right && geometry.labelFits && geometry.hit,
    `${viewport}: ${name} and mana cost fully fit the skill list: ${JSON.stringify(geometry)}`);
  };
  await skill.tap();
  await page.screenshot({ path: join(artifactDir, `battle-wide-${viewport}-skill-menu.png`) });
  await assertRow("Nip", 0);
  const backBox = await back.boundingBox();
  const dock = await controls.boundingBox();
  assert.ok(backBox.height >= 44 && backBox.y >= dock.y &&
    backBox.y + backBox.height <= dock.y + dock.height, `${viewport}: Back has a reachable touch target`);
  await back.tap();
  assert.equal(await controls.getAttribute("data-battle-phase"), "command");
  await skill.press("Enter");
  await assertRow("Nip", 0);
  await page.keyboard.press("ArrowDown");
  await assertRow("Cinder", 6);
  await page.screenshot({ path: join(artifactDir, `battle-wide-${viewport}-cinder-reachable.png`) });
  const details = page.getByRole("region", { name: "Action details", exact: true });
  await details.focus();
  assert.equal(await details.evaluate((panel) => panel === document.activeElement), true,
    `${viewport}: action details are keyboard-focusable`);
  await page.keyboard.press("End");
  await page.waitForFunction(() => {
    const panel = document.querySelector(".battle-details-panel");
    return panel.scrollTop > 0 && panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
  });
  assert.equal(await controls.getAttribute("data-battle-phase"), "skills");
  const detailsCost = details.getByText("6 MP", { exact: true });
  assert.equal(await detailsCost.evaluate((cost) => {
    const box = cost.getBoundingClientRect();
    const panel = cost.closest(".battle-details-panel").getBoundingClientRect();
    return box.top >= panel.top && box.bottom <= panel.bottom;
  }), true, `${viewport}: keyboard scrolling reveals the skill cost`);
  await page.screenshot({ path: join(artifactDir, `battle-wide-${viewport}-details-cost.png`) });
  const bottom = await details.evaluate((panel) => panel.scrollTop);
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction((position) =>
    document.querySelector(".battle-details-panel").scrollTop < position, bottom);
  assert.match(await details.locator(".battle-details-title").innerText(), /^Cinder$/,
    `${viewport}: scrolling details leaves the active skill unchanged`);
  await page.keyboard.press("Home");
  await page.waitForFunction(() => document.querySelector(".battle-details-panel").scrollTop <= 1);
  assert.equal(await details.locator(".battle-details-copy").evaluate((copy) => {
    const panel = copy.closest(".battle-details-panel").getBoundingClientRect();
    return copy.getBoundingClientRect().top < panel.bottom;
  }), true, `${viewport}: returning to the top reveals the skill description`);
  assert.equal(await details.evaluate((panel) => getComputedStyle(panel).touchAction), "pan-y");
  assert.match(await details.locator(".battle-details-copy").innerText(), /./);
  await page.keyboard.press("Escape");
  assert.equal(await controls.getAttribute("data-battle-phase"), "command");
  await page.locator(".battle-toast").waitFor({ state: "detached" });
  const status = page.locator(".app-status");
  assert.equal(await status.getAttribute("role"), "status", "offline status remains a live region");
  assert.equal(await status.evaluate((element) => getComputedStyle(element).clipPath), "inset(50%)",
    "offline status stays clear of the cards after the toast expires");
  await page.screenshot({ path: join(artifactDir, `battle-wide-${viewport}-status-after-toast.png`) });
}

async function checkWideSilhouettes() {
  for (const [width, height, textScale] of [[390, 844, 1], [568, 320, 1], [568, 320, 2]]) {
    await withBrowser(async (page) => {
      const viewport = `${width}x${height}${textScale === 2 ? "-200pct" : ""}`;
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      // Observe actual game-canvas draw calls. Include the player mirror and
      // position transform, and use source alpha rather than padded sheets.
      await page.addInitScript(() => {
        const drawImage = CanvasRenderingContext2D.prototype.drawImage;
        const sprites = new Map();
        const alphaBounds = new WeakMap();
        window.wideBattleSprites = sprites;
        CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
          const species = /\/(emberkit|pebblet)\.png$/.exec(image?.src ?? "")?.[1];
          if (species && args.length === 4 && this.canvas.classList.contains("game-canvas")) {
            let bounds = alphaBounds.get(image);
            if (!bounds) {
              const canvas = document.createElement("canvas");
              canvas.width = image.naturalWidth;
              canvas.height = image.naturalHeight;
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              drawImage.call(ctx, image, 0, 0);
              const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
              let left = canvas.width;
              let top = canvas.height;
              let right = 0;
              let bottom = 0;
              for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                  if (data[(y * canvas.width + x) * 4 + 3] <= 12) continue;
                  left = Math.min(left, x);
                  top = Math.min(top, y);
                  right = Math.max(right, x + 1);
                  bottom = Math.max(bottom, y + 1);
                }
              }
              bounds = [left / canvas.width, top / canvas.height, right / canvas.width, bottom / canvas.height];
              alphaBounds.set(image, bounds);
            }
            const [x, y, w, h] = args;
            const [left, top, right, bottom] = bounds;
            const transform = this.getTransform();
            const a = transform.transformPoint({ x: x + left * w, y: y + top * h });
            const b = transform.transformPoint({ x: x + right * w, y: y + bottom * h });
            const box = this.canvas.getBoundingClientRect();
            sprites.set(species, {
              left: box.left + Math.min(a.x, b.x) * box.width / this.canvas.width,
              right: box.left + Math.max(a.x, b.x) * box.width / this.canvas.width,
              top: box.top + Math.min(a.y, b.y) * box.height / this.canvas.height,
              bottom: box.top + Math.max(a.y, b.y) * box.height / this.canvas.height,
            });
          }
          return drawImage.call(this, image, ...args);
        };
      });
      await page.goto(baseUrl);
      await waitForGameBoot(page);
      await page.evaluate((save) => localStorage.setItem("reliquary.save.v3", JSON.stringify(save)), SAVE);
      await page.reload();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await dismissIntro(page);
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      if (textScale === 2) {
        await page.evaluate(() => document.documentElement.style.setProperty("font-size", "200%", "important"));
      }
      await page.evaluate(() => window.__reliquary.startBattleWith("emberkit", "pebblet", [5, 5]));
      await page.waitForFunction(() => window.wideBattleSprites.size === 2);
      const geometry = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
        return {
          player: window.wideBattleSprites.get("emberkit"),
          foe: window.wideBattleSprites.get("pebblet"),
          canvas: rect(".game-canvas"),
          cards: rect(".battle-status-zone"),
          playerCard: rect(".battler.me"),
          foeCard: rect(".battler.foe"),
          controls: rect(".battle-controls"),
          toast: rect(".toast"),
          toastRole: document.querySelector(".toast").getAttribute("role"),
          clippedStats: [...document.querySelectorAll(".battle-stat-numbers")].flatMap((value) => {
            const text = value.getBoundingClientRect();
            const card = value.closest(".battle-status-card").getBoundingClientRect();
            return text.left < card.left || text.right > card.right || text.bottom > card.bottom
              ? [value.textContent] : [];
          }),
          clippedCommands: [...document.querySelectorAll(".battle-action-label")].flatMap((label) =>
            label.scrollWidth > label.clientWidth + 1 ? [label.textContent] : []),
        };
      });
      await page.screenshot({ path: join(artifactDir, `battle-wide-${viewport}.png`) });
      const { player, foe, canvas, cards, controls, playerCard, foeCard, toast, toastRole } = geometry;
      assert.ok(player.right + 2 <= foe.left, `${viewport}: silhouettes should separate ${JSON.stringify(geometry)}`);
      assert.ok(player.left >= canvas.left && foe.right <= canvas.right, `${viewport}: silhouettes fit canvas`);
      assert.ok(Math.min(player.top, foe.top) > cards.bottom, `${viewport}: sprites clear the status cards`);
      assert.ok(Math.max(player.bottom, foe.bottom) < controls.top, `${viewport}: sprites clear commands`);
      assert.ok(!rectsOverlap(toast, playerCard) && !rectsOverlap(toast, foeCard),
        `${viewport}: toast does not cover status cards`);
      assert.ok(!rectsOverlap(toast, player) && !rectsOverlap(toast, foe),
        `${viewport}: toast does not cover silhouettes`);
      assert.equal(toastRole, "status", `${viewport}: save confirmation remains announced`);
      if (textScale === 2) {
        assert.deepEqual(geometry.clippedStats, [], `${viewport}: HP and MP values fit in their cards`);
        assert.deepEqual(geometry.clippedCommands, [], `${viewport}: action labels are fully visible`);
        await checkEnlargedSkillMenu(page, viewport);
      }
      console.log(`[battle-stage-browser] wide pairing ok ${viewport}`);
    }, { context: { hasTouch: textScale === 2 } });
  }
}

try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await withBrowser(async (page) => {
      await enterReferenceBattle(page);
      const restoredSave = page.getByRole("status").filter({ hasText: "The lantern remembers." });
      assert.equal(await restoredSave.evaluate((notice) => getComputedStyle(notice).clipPath), "inset(50%)",
        "the save-resume announcement stays available to assistive tech without painting over the creatures");
      const escaped = await page.locator(".battle-stat-numbers").evaluateAll((stats) => stats.flatMap((stat) => {
        const range = document.createRange();
        range.selectNodeContents(stat);
        const text = range.getBoundingClientRect();
        const card = stat.closest(".battle-status-card").getBoundingClientRect();
        return text.left < card.left || text.right > card.right || text.right > innerWidth
          ? [{ text: stat.textContent, right: text.right, cardRight: card.right }]
          : [];
      }));
      assert.deepEqual(escaped, [], `${viewport.width}×${viewport.height} portrait HP and MP stay on their own cards at 200% text`);
      await page.screenshot({ path: join(artifactDir, `battle-readouts-${viewport.width}x${viewport.height}-200.png`) });
    }, { textScale: 2, context: { viewport, isMobile: true, hasTouch: true } });
  }
  await checkWideSilhouettes();
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
