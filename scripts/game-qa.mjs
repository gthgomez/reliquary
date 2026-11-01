/** Repeatable game journey and frame pacing evidence. Does not alter production saves. */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const url = process.argv[2] ?? "http://127.0.0.1:8180";
const output = process.argv[3];
if (!output) throw new Error("usage: node scripts/game-qa.mjs [url] <evidence-directory>");
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Local test servers only");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = {
  url,
  browser: browser.version(),
  configuration: "headless Edge; isolated context; no CPU throttle",
  scenarios: [],
  errors: [],
};
try {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => results.errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400)
        results.errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    await page.addInitScript(() => {
      window.__qaDraws = 0;
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (this.canvas.classList?.contains("game-canvas")) window.__qaDraws++;
        return draw.apply(this, args);
      };
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 3; i++) await page.locator("button.dialog").click();
    await page.waitForFunction(() => !window.__controlsTest?.getPos?.().dialog);
    await page.keyboard.down("ArrowLeft");
    await page.waitForFunction(() => window.__controlsTest?.getPos?.().x < 5);
    await page.keyboard.up("ArrowLeft");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    if (!(await page.evaluate(() => !!localStorage.getItem("reliquary.save.v2"))))
      throw new Error("Save journey failed");
    // Existing diagnostic probe assists map/battle coverage; this is recorded rather than represented as a full natural playthrough.
    for (const scene of ["elderhall", "wildwood", "battle"]) {
      await page.evaluate((scene) => {
        if (scene === "battle") window.__controlsTest.startWild();
        else window.__controlsTest.warp(scene, 8, 10);
      }, scene);
      await page.waitForFunction(() => [...document.images].every((image) => image.complete));
      const metrics = await page.evaluate(async () => {
        const intervals = [],
          draws = [];
        let last = 0,
          previousDraws = window.__qaDraws;
        const started = performance.now();
        return await new Promise((resolve) => {
          function sample(ts) {
            if (last) {
              intervals.push(ts - last);
              draws.push(window.__qaDraws - previousDraws);
            }
            last = ts;
            previousDraws = window.__qaDraws;
            if (performance.now() - started < 5000) {
              requestAnimationFrame(sample);
              return;
            }
            const sorted = [...intervals].sort((a, b) => a - b);
            const percentile = (p) =>
              sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
            resolve({
              frames: intervals.length,
              fps: (1000 * intervals.length) / intervals.reduce((a, b) => a + b, 0),
              p50Ms: percentile(0.5),
              p95Ms: percentile(0.95),
              p99Ms: percentile(0.99),
              stallsOver50Ms: intervals.filter((ms) => ms > 50).length,
              meanVisibleDrawCalls: draws.reduce((a, b) => a + b, 0) / draws.length,
              renderedFrames: draws.filter((n) => n > 0).length,
              intervals,
            });
          }
          requestAnimationFrame(sample);
        });
      });
      const { intervals: _, ...summary } = metrics;
      console.log(JSON.stringify({ viewport, scene, ...summary }));
      results.scenarios.push({ viewport, scene, ...metrics });
      await page.screenshot({ path: join(output, `${viewport.width}-${scene}.png`) });
    }
    await context.close();
  }
} finally {
  writeFileSync(join(output, "frames.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
if (results.errors.length) {
  console.error(results.errors);
  process.exitCode = 1;
}
