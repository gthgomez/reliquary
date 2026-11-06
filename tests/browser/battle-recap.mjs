import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { measureTargetVisibility, startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const artifactDir = process.env.RELIQUARY_BROWSER_ARTIFACTS
  ?? fileURLToPath(new URL("../../artifacts/browser/", import.meta.url));
const viewports = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 568, height: 320 },
];
const report = [];
const { server, baseUrl } = await startStaticServer(0);
mkdirSync(artifactDir, { recursive: true });
try {
  for (const viewport of viewports) {
    await withBrowser(async (page) => {
      await page.setViewportSize(viewport);
      await page.goto(baseUrl, { waitUntil: "load" });
      await waitForGameBoot(page);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      while (await page.locator(".dialog").count()) {
        await page.locator(".dialog").click();
      }
      await page.evaluate(() => window.__controlsTest.startWild());
      await page.getByRole("button", { name: "Strike", exact: true }).click();
      await page.waitForFunction(() => ["command", "win", "lose"].includes(
        document.querySelector(".battle-controls")?.getAttribute("data-battle-phase"),
      ));
      const recap = page.locator(".battle-recap");
      const events = await recap.locator("li").allTextContents();
      assert.ok(events.length >= 2 && events.length <= 8, `resolved turn must keep a bounded ordered recap: ${JSON.stringify(events)}`);
      // The real turn supplies the event contents; these fixtures exercise all
      // three display phases without changing combat or granting rewards.
      for (const phase of ["command", "win", "lose"]) {
        await page.evaluate((value) => window.__reliquary.setBattlePhase(value), phase);
        await page.waitForFunction((value) => document.querySelector(".battle-controls")?.getAttribute("data-battle-phase") === value, phase);
        assert.ok(await recap.isVisible(), `${viewport.width}x${viewport.height} ${phase}: the recap must be visible`);
        const bodyHeight = await page.locator(".battle-controls-body").evaluate((el) => el.clientHeight);
        assert.ok(bodyHeight >= 24, `${phase}: the recap needs a readable scrolling viewport, got ${bodyHeight}px`);
        const controls = page.locator(".battle-controls-actions button");
        for (let i = 0; i < await controls.count(); i++) {
          const visibility = await measureTargetVisibility(controls.nth(i));
          assert.ok(visibility.fullyVisible && visibility.hitOk, `${phase}: recap must not clip an action: ${JSON.stringify(visibility)}`);
        }
        report.push({ viewport, phase, bodyHeight, events });
        await page.screenshot({ path: join(artifactDir, `battle-recap-${viewport.width}x${viewport.height}-${phase}.png`) });
      }
    });
  }
  console.log("[battle-recap] visible ordered turn/end recap with reachable actions");
} finally {
  server.close();
  writeFileSync(join(artifactDir, "battle-recap-report.json"), JSON.stringify(report, null, 2));
}
