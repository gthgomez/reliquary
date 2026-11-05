// Stage-4 measured investigations: S21 startup, S24 camera transition,
// S26 short taps, hidden file-input traversal, portrait dialogue layout.
// Outputs a JSON measurement record; asserts nothing by itself except
// where a reproduced defect demands repair.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, waitForGameBoot } from "../tests/browser/helpers.mjs";
import { chromium } from "playwright";

const artifactDir = process.env.RELIQUARY_BROWSER_ARTIFACTS
  ?? fileURLToPath(new URL("../../artifacts/browser/", import.meta.url));
mkdirSync(artifactDir, { recursive: true });

const record = { startup: [], camera: null, taps: null, fileInput: null, portrait: null };

const { server, baseUrl } = await startStaticServer(0);
const bootWorld = async (page) => {
  await page.click("text=Start");
  for (let i = 0; i < 16 && (await page.locator(".dialog").count()) > 0; i += 1) {
    await page.locator(".dialog").click().catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(80);
  }
  await page.waitForSelector(".hud-menu", { timeout: 15_000 });
};

try {
  const browser = await chromium.launch({ headless: true });
  try {
    // ---- S21: cold/warm startup (desktop Chromium, labeled) ----
    for (let run = 0; run < 3; run += 1) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      const t0 = Date.now();
      await page.goto(baseUrl, { waitUntil: "load" });
      const tLoad = Date.now() - t0;
      await page.waitForSelector(".title-word", { timeout: 30_000 });
      const tTitle = Date.now() - t0;
      await page.click("text=Start");
      await page.waitForSelector(".dialog", { timeout: 20_000 });
      const tInteractive = Date.now() - t0;
      record.startup.push({ run, loadToDomMs: tLoad, titleVisibleMs: tTitle, worldInteractiveMs: tInteractive });
      await context.close();
    }

    // ---- S24: camera transition when a menu opens near the HUD ----
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "load" });
    await waitForGameBoot(page);
    await bootWorld(page);
    // Walk to the top of Elderhall so the HUD overlaps the scene and relief accrues.
    // (13,1): open ground beside the gate column — the HUD inset covers the
    // player's head here, but there is no warp to stumble into.
    await page.evaluate(() => window.__controlsTest?.warp?.("elderhall", 13, 1));
    await page.waitForTimeout(900);
    const snapCanvas = () => page.evaluate(() => {
      const c = document.querySelector(".game-canvas");
      const ctx = c.getContext("2d");
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
      return sum;
    });
    const calmA = await snapCanvas();
    await page.waitForTimeout(200);
    const calmB = await snapCanvas();
    await page.evaluate(() => window.__reliquary?.openMenu?.());
    await page.waitForSelector(".overlay-panel");
    const menuOpen = await snapCanvas();
    await page.evaluate(() => window.__reliquary?.cancel?.());
    await page.waitForTimeout(300);
    const afterClose = await snapCanvas();
    record.camera = {
      note: "canvas checksum while calm (relief accruing), menu open (relief reset), after close",
      calmA, calmB, calmSteadyDelta: Math.abs(calmA - calmB), menuOpen, afterClose,
      menuShiftProxy: Math.abs(menuOpen - calmB), closeShiftProxy: Math.abs(afterClose - menuOpen),
    };
    await page.screenshot({ path: join(artifactDir, "camera-menu-open-390x844.png") });

    // ---- S26: very short taps — do 40ms/70ms taps step the player? ----
    // Stand on open ground with room to walk west first.
    await page.evaluate(() => window.__controlsTest?.warp?.("elderhall", 13, 12));
    await page.waitForTimeout(300);
    const tapProbe = async (holdMs) => {
      const before = await page.evaluate(() => window.__controlsTest.getPos());
      await page.mouse.move(30, 776); // west pad body
      await page.mouse.down();
      await page.waitForTimeout(holdMs);
      await page.mouse.up();
      await page.waitForTimeout(900); // let any interpolation finish
      const after = await page.evaluate(() => window.__controlsTest.getPos());
      // Re-center for the next tap.
      await page.evaluate((pos) => window.__controlsTest?.warp?.("elderhall", 13, 12), before);
      await page.waitForTimeout(300);
      return { holdMs, dx: after.x - before.x, dy: after.y - before.y };
    };
    record.taps = { taps30: await tapProbe(30), taps40: await tapProbe(40), taps70: await tapProbe(70), taps120: await tapProbe(120) };

    // ---- Supplemental: hidden file input traversal ----
    record.fileInput = await page.evaluate(() => {
      const input = document.querySelector(".save-file-input");
      if (!input) return { present: false };
      const cs = getComputedStyle(input);
      const r = input.getBoundingClientRect();
      return {
        present: true,
        ariaLabel: input.getAttribute("aria-label"),
        tabIndex: input.getAttribute("tabindex"),
        display: cs.display,
        visibility: cs.visibility,
        position: cs.position,
        rect: { w: r.width, h: r.height },
        focusableByKeyTab: cs.display !== "none" && cs.visibility !== "hidden" && cs.position !== "fixed" ? r.width > 0 || r.height > 0 : false,
      };
    });
    // Real Tab walk: does the input become an invisible focus stop?
    const tabWalk = [];
    await page.evaluate(() => window.__reliquary?.openMenu?.());
    await page.waitForSelector(".overlay-panel");
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press("Tab");
      tabWalk.push(await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "none";
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return `${el.tagName}.${String(el.className).split(" ")[0]}${r.width === 0 && r.height === 0 ? "[ZERO-SIZE]" : ""}${cs.visibility === "hidden" ? "[HIDDEN]" : ""}`;
      }));
    }
    record.fileInput = { ...record.fileInput, tabWalk };
    await page.context().close();

    // ---- Supplemental: portrait dialogue with a portrait NPC ----
    const pctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 }, hasTouch: true });
    const ppage = await pctx.newPage();
    await ppage.goto(baseUrl, { waitUntil: "load" });
    await waitForGameBoot(ppage);
    await bootWorld(ppage);
    // Maren carries a placed portrait; walk to her and talk.
    await ppage.evaluate(() => window.__controlsTest?.warp?.("elderhall", 7, 11));
    await ppage.waitForTimeout(300);
    await ppage.evaluate(() => window.__controlsTest?.setKeys?.(["KeyW"]));
    await ppage.waitForTimeout(700);
    await ppage.evaluate(() => window.__controlsTest?.setKeys?.([]));
    await ppage.evaluate(() => window.__reliquary?.confirm?.());
    await ppage.waitForSelector(".dialog", { timeout: 10_000 });
    const portraitState = await ppage.evaluate(() => {
      const scene = document.querySelector(".dialog-scene");
      const text = document.querySelector(".dialog-text");
      const pad = document.querySelector(".touch");
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      return {
        hasPortrait: scene?.classList.contains("dialog-scene-npc") ?? false,
        scene: box(scene), text: box(text), touch: box(pad),
        textVisible: text ? text.getBoundingClientRect().height > 20 : false,
        viewport: { w: innerWidth, h: innerHeight },
      };
    });
    record.portrait = portraitState;
    await ppage.screenshot({ path: join(artifactDir, "portrait-dialogue-390x844.png") });
    await pctx.close();
  } finally {
    await browser.close();
  }
  writeFileSync(join(artifactDir, "stage4-measurements.json"), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 1));
} finally {
  server.close();
}
