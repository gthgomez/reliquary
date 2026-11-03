import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

async function measureSelectors(page, pairs) {
  return page.evaluate((selectors) => {
    const ctx = document.createElement("canvas").getContext("2d");
    const toRgb = (css) => {
      ctx.fillStyle = "#000000";
      ctx.fillStyle = css;
      const hex = ctx.fillStyle;
      const n = Number.parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const lum = ([r, g, b]) => {
      const ch = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const ratio = (fgCss, bgCss) => {
      const l1 = lum(toRgb(fgCss));
      const l2 = lum(toRgb(bgCss));
      const hi = Math.max(l1, l2);
      const lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    };
    const backdrop = (el) => {
      let node = el;
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && !bg.endsWith(", 0)") && bg !== "transparent") return bg;
        node = node.parentElement;
      }
      return "rgb(28, 24, 20)";
    };
    return selectors.map(([name, selector]) => {
      const el = document.querySelector(selector);
      if (!el) return { name, ratio: null, required: null, pass: null, fontSize: null };
      const cs = getComputedStyle(el);
      const px = Number.parseFloat(cs.fontSize);
      const required = px >= 18 ? 3 : 4.5;
    const fg = getComputedStyle(el).color;
    const bg = backdrop(el);
    const normalize = (css) => {
      const span = document.createElement("span");
      span.style.color = css;
      document.body.appendChild(span);
      const resolved = getComputedStyle(span).color;
      span.remove();
      return resolved;
    };
    const r = ratio(normalize(fg), normalize(bg));
      return {
        name,
        fontSize: cs.fontSize,
        ratio: Math.round(r * 100) / 100,
        required,
        pass: r >= required,
      };
    });
  }, pairs);
}

const { server, baseUrl } = await startStaticServer(0);

try {
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await page.click("text=Start");
    for (let i = 0; i < 16; i += 1) {
      if ((await page.locator(".dialog").count()) === 0) break;
      await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
      await page.waitForTimeout(120);
    }
    await page.waitForSelector(".hud-menu", { timeout: 15_000 });
    if (await page.locator(".hud-objective-btn").count()) {
      await page.locator(".hud-objective-btn").first().click();
    }

    const hudReport = await measureSelectors(page, [
      ["hud-muted", ".hud-chip .hud-muted"],
      ["hud-objective-preview", ".hud-objective-preview"],
      ["hud-objective-full", ".hud-objective-full"],
    ]);

    await page.click(".hud-menu");
    await page.waitForSelector(".overlay-panel .sheet-sub");
    const panelReport = await measureSelectors(page, [["sheet-sub", ".overlay-panel .sheet-sub"]]);

    const report = [...hudReport, ...panelReport];
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync("/opt/cursor/artifacts/ui-contrast-report.json", JSON.stringify(report, null, 2));

    const shortfalls = report.filter((row) => row.ratio != null && !row.pass);
    for (const row of report) {
      if (row.ratio == null) continue;
      assert.ok(row.pass, `${row.name} contrast ${row.ratio}:1 below ${row.required}:1`);
    }
    console.log("[contrast]", JSON.stringify({ report, shortfalls }));
  });
} finally {
  server.close();
}

console.log("[contrast] measured UI text samples");
