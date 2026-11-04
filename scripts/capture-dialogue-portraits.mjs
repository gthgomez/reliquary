#!/usr/bin/env node
/**
 * Captures real gameplay evidence for the NPC dialogue close-ups.
 * Prerequisite: the browser-test static build exists
 * (`node scripts/build-web-test.mjs` and the public-game shell copy performed by
 * `npm run test:browser`). Run with: node scripts/capture-dialogue-portraits.mjs
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, withBrowser, waitForGameBoot } from "../tests/browser/helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/evidence/dialogue-portraits");
mkdirSync(outDir, { recursive: true });

const { server, baseUrl } = await startStaticServer(0);

async function start(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await waitForGameBoot(page);
  await page.click("text=Start");
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(100);
  }
  await page.waitForSelector(".hud-menu", { timeout: 15_000 });
}

async function openNpc(page, map, x, y, portraitKey) {
  await page.evaluate(({ map, x, y }) => window.__controlsTest?.warp?.(map, x, y), { map, x, y });
  await page.waitForTimeout(140);
  await page.keyboard.press("z");
  await page.waitForSelector(`.dialog[data-portrait="${portraitKey}"]`, { timeout: 5000 });
  await page.waitForFunction(
    () => {
      const img = document.querySelector(".dialog-portrait img");
      return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
    },
    undefined,
    { timeout: 5000 },
  );
  await page.waitForTimeout(400);
}

const shots = [
  {
    file: "maren-desktop-1440x900.png",
    viewport: { width: 1440, height: 900 },
    mobile: false,
    npc: ["elderhall", 7, 8, "maren"],
  },
  {
    file: "maren-phone-portrait-390x844.png",
    viewport: { width: 390, height: 844 },
    mobile: true,
    npc: ["elderhall", 7, 8, "maren"],
  },
  {
    file: "maren-phone-landscape-844x390.png",
    viewport: { width: 844, height: 390 },
    mobile: true,
    npc: ["elderhall", 7, 8, "maren"],
  },
  {
    file: "cael-desktop-1440x900.png",
    viewport: { width: 1440, height: 900 },
    mobile: false,
    npc: ["thornkeep", 11, 5, "cael"],
  },
];

try {
  for (const shot of shots) {
    await withBrowser(
      async (page) => {
        await start(page);
        await openNpc(page, ...shot.npc);
        const path = join(outDir, shot.file);
        await page.screenshot({ path, animations: "disabled" });
        console.log(`[capture] wrote ${shot.file} at ${shot.viewport.width}x${shot.viewport.height}`);
      },
      {
        context: {
          viewport: shot.viewport,
          isMobile: shot.mobile,
          hasTouch: shot.mobile,
          deviceScaleFactor: shot.mobile ? 2 : 1,
        },
      },
    );
  }
} finally {
  server.close();
}
