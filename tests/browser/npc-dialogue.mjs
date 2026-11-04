import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

/**
 * NPC conversation coverage for the portrait focus scene: authored artwork
 * for Elder Maren, the cohesive sigil fallback for Gateward, text-only
 * rendering for the sign, and post-dialogue movement integrity.
 */

const { server, baseUrl } = await startStaticServer(0);

const consoleMessages = [];

async function bootWorld(page) {
  await page.click("text=Start");
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(".hud-menu", { timeout: 15_000 });
}

/** Warp beside the NPC, face it (NPCs are solid, so the step only turns), then interact. */
async function talkTo(page, map, x, y, key) {
  await page.evaluate(
    ([m, px, py]) => window.__controlsTest?.warp?.(m, px, py),
    [map, x, y],
  );
  await page.evaluate((keys) => window.__controlsTest?.setKeys?.(keys), [key]);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__controlsTest?.setKeys?.([]));
  await page.evaluate(() => window.__reliquary?.confirm?.());
}

try {
  await withBrowser(async (page) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleMessages.push(`console: ${msg.text()}`);
    });
    page.on("pageerror", (err) => consoleMessages.push(`pageerror: ${err.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await bootWorld(page);

    // Elder Maren — authored close-up scene.
    await talkTo(page, "elderhall", 7, 10, "KeyW");
    await page.waitForSelector(".npc-scene", { timeout: 5000 });
    const maren = await page.evaluate(() => ({
      plaque: document.querySelector(".npc-plaque-name")?.textContent ?? "",
      portrait: document.querySelector(".npc-scene-portrait svg") != null,
      dialog: document.querySelector(".npc-scene-dialog") != null,
      text: document.querySelector(".npc-scene-dialog .dialog-text")?.textContent ?? "",
      next: document.querySelector(".npc-scene-dialog .dialog-next")?.textContent ?? "",
    }));
    assert.match(maren.plaque, /Elder Maren/, "nameplate names the speaker");
    assert.equal(maren.portrait, true, "authored portrait mounted");
    assert.equal(maren.dialog, true, "dialogue bar present");
    assert.match(maren.text, /Crown cracked/, "first page text");
    assert.equal(maren.next, "Next");

    // Portrait and dialog stay inside the viewport (no clipping/offscreen).
    const desktopFit = await page.evaluate(() => {
      const portrait = document.querySelector(".npc-scene-portrait")?.getBoundingClientRect();
      const dialog = document.querySelector(".npc-scene-dialog")?.getBoundingClientRect();
      return {
        portrait: portrait ? { l: portrait.left, r: portrait.right, t: portrait.top, b: portrait.bottom } : null,
        dialog: dialog ? { l: dialog.left, r: dialog.right, t: dialog.top, b: dialog.bottom } : null,
        innerW: window.innerWidth,
        innerH: window.innerHeight,
      };
    });
    assert.ok(desktopFit.portrait.l >= 0 && desktopFit.portrait.r <= desktopFit.innerW + 1, "portrait horizontally inside viewport");
    assert.ok(desktopFit.portrait.t >= 0 && desktopFit.portrait.b <= desktopFit.innerH + 1, "portrait vertically inside viewport");
    assert.ok(desktopFit.dialog.b <= desktopFit.innerH + 1, "dialog bar inside viewport");

    // Advance to the second page, then close.
    await page.locator(".npc-scene-dialog").click();
    await page.waitForTimeout(120);
    const page2 = await page.locator(".npc-scene-dialog .dialog-text").textContent();
    assert.match(page2 ?? "", /Binding Grove/, "second page after Next");
    await page.locator(".npc-scene-dialog").click();
    await page.waitForSelector(".npc-scene", { state: "detached", timeout: 5000 });

    // Gateward — cohesive sigil fallback for a named NPC without authored art.
    await talkTo(page, "elderhall", 11, 3, "KeyW");
    await page.waitForSelector(".npc-scene", { timeout: 5000 });
    const gateward = await page.evaluate(() => ({
      plaque: document.querySelector(".npc-plaque-name")?.textContent ?? "",
      portrait: document.querySelector(".npc-scene-portrait svg") != null,
      text: document.querySelector(".npc-scene-dialog .dialog-text")?.textContent ?? "",
    }));
    assert.match(gateward.plaque, /Gateward/);
    assert.equal(gateward.portrait, true, "fallback sigil portrait mounted");
    assert.match(gateward.text, /pact-beast/);
    await page.locator(".npc-scene-dialog").click();
    await page.waitForSelector(".npc-scene", { state: "detached", timeout: 5000 });

    // Sign — narrator/object dialogue stays a readable text-only bar.
    await talkTo(page, "elderhall", 13, 2, "KeyW");
    await page.waitForSelector(".dialog", { timeout: 5000 });
    const sign = await page.evaluate(() => ({
      scene: document.querySelector(".npc-scene") != null,
      text: document.querySelector(".dialog .dialog-text")?.textContent ?? "",
    }));
    assert.equal(sign.scene, false, "sign dialog renders text-only, no fake portrait");
    assert.match(sign.text, /BRIAR ROAD/);
    await page.locator(".dialog").click();
    await page.waitForSelector(".dialog", { state: "detached", timeout: 5000 });

    // Movement integrity: after dialogue the player can still walk. The sign
    // prop is solid, so step east into a free tile instead of back into it.
    const before = await page.evaluate(() => window.__controlsTest?.getPos?.());
    await page.evaluate(() => window.__controlsTest?.setKeys?.(["KeyD"]));
    await page.waitForTimeout(350);
    await page.evaluate(() => window.__controlsTest?.setKeys?.([]));
    const after = await page.evaluate(() => window.__controlsTest?.getPos?.());
    assert.equal(after.dialog, false, "no dialog left open");
    assert.notEqual(`${before.x},${before.y}`, `${after.x},${after.y}`, "player is not stuck after dialogue");
  });

  // Phone portrait: same conversation, compact layout, no overflow.
  await withBrowser(async (page) => {
    page.on("pageerror", (err) => consoleMessages.push(`pageerror: ${err.message}`));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await bootWorld(page);
    await talkTo(page, "elderhall", 7, 10, "KeyW");
    await page.waitForSelector(".npc-scene", { timeout: 5000 });
    const phone = await page.evaluate(() => {
      const portrait = document.querySelector(".npc-scene-portrait")?.getBoundingClientRect();
      const dialog = document.querySelector(".npc-scene-dialog")?.getBoundingClientRect();
      return {
        portrait: portrait ? { l: portrait.left, r: portrait.right, t: portrait.top, b: portrait.bottom } : null,
        dialog: dialog ? { l: dialog.left, r: dialog.right, t: dialog.top, b: dialog.bottom } : null,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        plaque: document.querySelector(".npc-plaque-name")?.textContent ?? "",
      };
    });
    assert.match(phone.plaque, /Elder Maren/);
    assert.ok(phone.portrait.r <= phone.innerW + 1, "portrait inside phone width");
    assert.ok(phone.portrait.t >= 0, "portrait below the top edge");
    assert.ok(phone.dialog.b <= phone.innerH + 1, "dialog bar inside phone height");
    assert.ok(phone.scrollW <= phone.innerW + 1, "no horizontal overflow on phone");
  });

  // Short landscape: scene must fit the squat viewport.
  await withBrowser(async (page) => {
    page.on("pageerror", (err) => consoleMessages.push(`pageerror: ${err.message}`));
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await bootWorld(page);
    await talkTo(page, "elderhall", 7, 10, "KeyW");
    await page.waitForSelector(".npc-scene", { timeout: 5000 });
    const landscape = await page.evaluate(() => {
      const portrait = document.querySelector(".npc-scene-portrait")?.getBoundingClientRect();
      const dialog = document.querySelector(".npc-scene-dialog")?.getBoundingClientRect();
      return {
        portrait: portrait ? { t: portrait.top, b: portrait.bottom } : null,
        dialog: dialog ? { l: dialog.left, r: dialog.right, b: dialog.bottom } : null,
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        scrollW: document.documentElement.scrollWidth,
      };
    });
    assert.ok(landscape.portrait.t >= 0 && landscape.portrait.b <= landscape.innerH + 1, "portrait fits landscape height");
    assert.ok(landscape.dialog.b <= landscape.innerH + 1, "dialog fits landscape height");
    assert.ok(landscape.scrollW <= landscape.innerW + 1, "no horizontal overflow in landscape");
  });
} finally {
  server.close();
}

assert.deepEqual(consoleMessages, [], "no console/page errors during NPC dialogue");
console.log("[npc-dialogue] maren art scene, gateward fallback, sign text-only, movement integrity ok");
