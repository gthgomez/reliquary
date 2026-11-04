import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const { server, baseUrl } = await startStaticServer(0);

async function dismissOpeningDialogs(page) {
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(".hud-place", { timeout: 15_000 });
}

async function faceAndSpeak(page, map, x, y) {
  await page.evaluate(([m, tx, ty]) => window.__controlsTest?.warp?.(m, tx, ty), [map, x, y]);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(120);
  await page.keyboard.up("ArrowUp");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".dialog", { timeout: 5_000 });
}

try {
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await page.click("text=Start");
    await dismissOpeningDialogs(page);

    // Elder Maren close-up: portrait asset resolves and the nameplate matches.
    await faceAndSpeak(page, "elderhall", 7, 10);
    await page.waitForSelector(".dialog-npc .dialog-portrait img", { timeout: 5_000 });
    await page.waitForFunction(() => {
      const img = document.querySelector(".dialog-npc .dialog-portrait img");
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }, { timeout: 10_000 });
    const maren = await page.evaluate(() => {
      const img = document.querySelector(".dialog-npc .dialog-portrait img");
      return {
        src: img?.getAttribute("src") ?? "",
        loaded: Boolean(img && img.complete && img.naturalWidth > 0),
        name: document.querySelector(".dialog-name")?.textContent ?? "",
        veil: document.querySelector(".game-root")?.classList.contains("is-dialog"),
      };
    });
    assert.equal(maren.src, "/game/portraits/elder-maren.svg");
    assert.equal(maren.loaded, true, "portrait SVG must actually load");
    assert.equal(maren.name, "Elder Maren");
    assert.equal(maren.veil, true);

    // Advancing and closing leaves no stuck dialog or dimmed scene.
    await page.locator(".dialog").click();
    await page.locator(".dialog").click();
    await page.waitForSelector(".dialog", { state: "detached", timeout: 5_000 });
    const closed = await page.evaluate(() => ({
      veil: document.querySelector(".game-root")?.classList.contains("is-dialog"),
      hud: document.querySelector(".hud-place")?.textContent ?? "",
    }));
    assert.equal(closed.veil, false);
    assert.match(closed.hud, /Elderhall/);

    // Narrator/sign dialog renders text-only, with no portrait element.
    await faceAndSpeak(page, "elderhall", 13, 2);
    const sign = await page.evaluate(() => ({
      npcCard: Boolean(document.querySelector(".dialog-npc")),
      portrait: Boolean(document.querySelector(".dialog-portrait img")),
      text: document.querySelector(".dialog-text")?.textContent ?? "",
    }));
    assert.equal(sign.npcCard, false);
    assert.equal(sign.portrait, false);
    assert.match(sign.text, /BRIAR ROAD/);
    await page.locator(".dialog").click();
    await page.waitForSelector(".dialog", { state: "detached", timeout: 5_000 });
  });
  console.log("[npc-portraits] Maren close-up, fallback, and text-only sign ok");
} finally {
  server.close();
}
