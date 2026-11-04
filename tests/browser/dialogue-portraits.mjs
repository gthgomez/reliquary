import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "phone-portrait", width: 390, height: 844, mobile: true },
  { name: "phone-landscape", width: 844, height: 390, mobile: true },
];

const { server, baseUrl } = await startStaticServer(0);

async function dismissIntro(page) {
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(100);
  }
  await page.waitForSelector(".hud-menu", { timeout: 15_000 });
}

async function walkTo(page, map, x, y) {
  await page.evaluate(({ map, x, y }) => window.__controlsTest?.warp?.(map, x, y), { map, x, y });
  await page.waitForTimeout(120);
}

async function speak(page) {
  await page.keyboard.press("z");
}

async function faceUp(page) {
  // The game reads direction on its animation frame, so a tap is too short.
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(160);
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(60);
}

async function layoutMetrics(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const dialog = document.querySelector(".dialog");
    const portrait = document.querySelector(".dialog-portrait");
    const img = document.querySelector(".dialog-portrait img");
    return {
      dialog: box(dialog),
      portrait: box(portrait),
      text: box(document.querySelector(".dialog-text")),
      img: img ? { complete: img.complete, naturalWidth: img.naturalWidth, src: img.getAttribute("src") } : null,
      role: document.querySelector(".dialog-role")?.textContent ?? "",
      name: document.querySelector(".dialog-name")?.textContent ?? "",
      rootKey: document.querySelector(".game-root")?.getAttribute("data-dialog-portrait"),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    };
  });
}

function assertInsideViewport(metrics, viewport, label) {
  const { dialog, portrait, text } = metrics;
  assert.ok(dialog, `${label}: dialogue panel exists`);
  for (const [name, rect] of [["dialog", dialog], ["portrait", portrait], ["text", text]]) {
    if (!rect) continue;
    assert.ok(rect.left >= -1, `${label}: ${name} not clipped left (${rect.left})`);
    assert.ok(rect.right <= viewport.width + 1, `${label}: ${name} not clipped right (${rect.right})`);
    assert.ok(rect.top >= -1, `${label}: ${name} not clipped top (${rect.top})`);
    assert.ok(rect.bottom <= viewport.height + 1, `${label}: ${name} not clipped bottom (${rect.bottom})`);
  }
  assert.ok(text.top >= dialog.top - 1, `${label}: text starts inside panel`);
  assert.ok(text.bottom <= dialog.bottom - 4, `${label}: text is not hidden by panel edge`);
  assert.ok(
    metrics.scroll.width <= viewport.width + 1,
    `${label}: no horizontal overflow (${metrics.scroll.width})`,
  );
  assert.ok(
    metrics.scroll.height <= viewport.height + 1,
    `${label}: no document scroll (${metrics.scroll.height})`,
  );
}

try {
  for (const viewport of VIEWPORTS) {
    await withBrowser(
      async (page) => {
        await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
        await waitForGameBoot(page);
        await page.click("text=Start");
        await dismissIntro(page);

        // Elder Maren: bespoke portrait, first page.
        await walkTo(page, "elderhall", 7, 8);
        await speak(page);
        await page.waitForSelector('.dialog[data-portrait="maren"]', { timeout: 5000 });
        await page.waitForFunction(
          () => {
            const img = document.querySelector(".dialog-portrait img");
            return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
          },
          undefined,
          { timeout: 5000 },
        );
        await page.waitForTimeout(320);
        const maren = await layoutMetrics(page);
        assert.equal(maren.name, "Elder Maren", `${viewport.name}: nameplate names Maren`);
        assert.match(maren.role, /Elder of Hollowmere/i, `${viewport.name}: role label`);
        assert.equal(maren.rootKey, "maren", `${viewport.name}: root exposes portrait id`);
        assert.match(maren.img?.src ?? "", /maren\.svg$/, `${viewport.name}: Maren art loaded`);
        assert.ok((maren.img?.naturalWidth ?? 0) > 0, `${viewport.name}: Maren art decoded`);
        assertInsideViewport(maren, viewport, `${viewport.name} maren`);

        // Advancing still closes pages and returns control to the world.
        for (let i = 0; i < 8; i += 1) {
          if ((await page.locator(".dialog").count()) === 0) break;
          await page.locator(".dialog").click();
          await page.waitForTimeout(100);
        }
        await page.waitForFunction(() => window.__controlsTest?.getPos?.().dialog === false, undefined, {
          timeout: 5000,
        });

        // Warden Cael: a second, visually distinct bespoke portrait.
        await walkTo(page, "thornkeep", 11, 5);
        await speak(page);
        await page.waitForSelector('.dialog[data-portrait="cael"]', { timeout: 5000 });
        await page.waitForFunction(
          () => {
            const img = document.querySelector(".dialog-portrait img");
            return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
          },
          undefined,
          { timeout: 5000 },
        );
        await page.waitForTimeout(320);
        const cael = await layoutMetrics(page);
        assert.equal(cael.name, "Warden Cael", `${viewport.name}: nameplate names Cael`);
        assert.match(cael.role, /Warden of Thornkeep/i, `${viewport.name}: role label`);
        assert.match(cael.img?.src ?? "", /cael\.svg$/, `${viewport.name}: Cael art loaded`);
        assert.notEqual(cael.img?.src, maren.img?.src, `${viewport.name}: bespoke art is distinct`);
        assertInsideViewport(cael, viewport, `${viewport.name} cael`);
        await page.evaluate(() => window.__reliquary?.cancel?.());
        await page.waitForSelector(".dialog", { state: "detached", timeout: 5000 }).catch(() => {});

        // A sign is readable text, not a borrowed face.
        await walkTo(page, "elderhall", 13, 2);
        await faceUp(page);
        await speak(page);
        await page.waitForSelector('.dialog[data-portrait="none"]', { timeout: 5000 });
        assert.equal(await page.locator(".dialog-portrait").count(), 0, `${viewport.name}: sign is text-only`);
        const sign = await layoutMetrics(page);
        assert.equal(sign.name, "Sign", `${viewport.name}: sign nameplate`);
        assertInsideViewport(sign, viewport, `${viewport.name} sign`);
        await page.evaluate(() => window.__reliquary?.cancel?.());

        // A named NPC without bespoke art gets the shared fallback.
        await walkTo(page, "elderhall", 11, 3);
        await faceUp(page);
        await speak(page);
        await page.waitForSelector('.dialog[data-portrait="guard"]', { timeout: 5000 });
        await page.waitForTimeout(320);
        assert.equal(await page.locator(".dialog-portrait .portrait-fallback-art").count(), 1, `${viewport.name}: fallback art`);
        const guard = await layoutMetrics(page);
        assert.equal(guard.name, "Gateward", `${viewport.name}: fallback keeps the real name`);
        assertInsideViewport(guard, viewport, `${viewport.name} guard`);
        await page.evaluate(() => window.__reliquary?.cancel?.());

        console.log(`[dialogue-portraits] ok ${viewport.width}x${viewport.height}`);
      },
      {
        context: {
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.mobile,
          hasTouch: viewport.mobile,
          deviceScaleFactor: viewport.mobile ? 2 : 1,
        },
      },
    );
  }
} finally {
  server.close();
}

console.log("[dialogue-portraits] NPC focus scenes, fallback and text-only dialogue passed");
