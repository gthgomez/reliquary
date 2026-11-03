/** Capture battle + overworld screenshots for visual-clarity verification. */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { startStaticServer, withBrowser, waitForGameBoot } from "../tests/browser/helpers.mjs";

const outDir = process.argv[2] ?? join(process.cwd(), "docs/implementation/evidence/visual-clarity");
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "phone-portrait", width: 390, height: 844 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "short-portrait", width: 390, height: 667 },
];

const { server, baseUrl } = await startStaticServer(0);

try {
  for (const vp of viewports) {
    await withBrowser(
      async (page) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
        await waitForGameBoot(page);
        await page.getByRole("button", { name: "Start", exact: true }).click();
        for (let i = 0; i < 6; i += 1) {
          if ((await page.locator(".dialog").count()) === 0) break;
          await page.keyboard.press("Enter");
          await page.waitForTimeout(120);
        }
        await page.waitForFunction(() => typeof window.__controlsTest?.warp === "function");
        await page.evaluate(() => {
          window.__controlsTest?.warp?.("wildwood", 10, 12);
        });
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(outDir, `${vp.name}-wildwood.png`) });
        await page.evaluate(() => window.__controlsTest?.startWild?.());
        await page.waitForSelector(".battle-ui", { timeout: 10_000 });
        await page.waitForTimeout(350);
        await page.screenshot({ path: join(outDir, `${vp.name}-battle.png`) });
        console.log(`[visual-clarity] ${vp.name}`);
      },
      { context: { serviceWorkers: "block" } },
    );
  }
} finally {
  server?.close();
}

console.log(`[visual-clarity] saved under ${outDir}`);
