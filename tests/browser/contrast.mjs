import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const artifactDir = process.env.RELIQUARY_BROWSER_ARTIFACTS
  ?? fileURLToPath(new URL("../../artifacts/browser/", import.meta.url));

async function measureSelectors(page, pairs) {
  return page.evaluate((selectors) => {
    // S28: parse the actual computed color instead of assuming a hex
    // serialization — Chromium returns rgb()/rgba() from getComputedStyle and
    // color(srgb …) for color-mix() results.
    const parseColor = (css) => {
      const s = String(css).trim().toLowerCase();
      let m = s.match(/^#([0-9a-f]{6})$/);
      if (m) return [0, 2, 4].map((i) => Number.parseInt(m[1].slice(i, i + 2), 16));
      m = s.match(/^#([0-9a-f]{3})$/);
      if (m) return [...m[1]].map((c) => Number.parseInt(c + c, 16));
      m = s.match(/^rgba?\(([^)]+)\)$/);
      if (m) {
        const parts = m[1].split(/[\s,/]+/).filter(Boolean);
        const conv = (token) =>
          token.endsWith("%") ? Math.round((Number.parseFloat(token) / 100) * 255) : Math.round(Number.parseFloat(token));
        if (parts.length < 3) return null;
        return [conv(parts[0]), conv(parts[1]), conv(parts[2])];
      }
      m = s.match(/^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      if (m) return [1, 2, 3].map((i) => Math.round(Number(m[i]) * 255));
      return null;
    };
    const lum = ([r, g, b]) => {
      const ch = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const ratio = (fgCss, bgCss) => {
      const fg = parseColor(fgCss);
      const bg = parseColor(bgCss);
      if (!fg || !bg) throw new Error(`unparsable computed color: ${!fg ? fgCss : bgCss}`);
      const l1 = lum(fg);
      const l2 = lum(bg);
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
    const normalize = (css) => {
      const span = document.createElement("span");
      span.style.color = css;
      document.body.appendChild(span);
      const resolved = getComputedStyle(span).color;
      span.remove();
      return resolved;
    };
    return selectors.map(([name, selector]) => {
      const el = document.querySelector(selector);
      if (!el) return { name, ratio: null, required: null, pass: null, fontSize: null };
      const cs = getComputedStyle(el);
      const px = Number.parseFloat(cs.fontSize);
      const required = px >= 18 ? 3 : 4.5;
      const fg = normalize(cs.color);
      const bg = normalize(backdrop(el));
      const r = ratio(fg, bg);
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

async function measureBattleComposited(page, canvasFills) {
  return page.evaluate((fills) => {
    const canvas = document.querySelector(".game-canvas");
    if (!canvas) return [];

    const parseRgba = (css) => {
      const m = css.match(
        /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/,
      );
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] != null ? Number(m[4]) : 1];
    };
    const compositeOver = (bottom, top) => {
      const [tr, tg, tb, ta] = top;
      if (ta <= 0) return bottom;
      if (ta >= 1) return [tr, tg, tb];
      const inv = 1 - ta;
      return [
        Math.round(tr * ta + bottom[0] * inv),
        Math.round(tg * ta + bottom[1] * inv),
        Math.round(tb * ta + bottom[2] * inv),
      ];
    };
    const lum = ([r, g, b]) => {
      const ch = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const contrast = (fg, bg) => {
      const l1 = lum(fg);
      const l2 = lum(bg);
      const hi = Math.max(l1, l2);
      const lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    };
    const sampleCanvas = (x, y) => {
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d");
      if (!ctx || rect.width <= 0 || rect.height <= 0) return [28, 24, 20];
      const sx = Math.min(canvas.width - 1, Math.max(0, Math.round(((x - rect.left) / rect.width) * canvas.width)));
      const sy = Math.min(canvas.height - 1, Math.max(0, Math.round(((y - rect.top) / rect.height) * canvas.height)));
      const data = ctx.getImageData(sx, sy, 1, 1).data;
      return [data[0], data[1], data[2]];
    };
    const effectiveBg = (el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      let bg = sampleCanvas(x, y);
      const overlays = [];
      let node = el;
      while (node && !node.classList.contains("battle-ui")) {
        const rgba = parseRgba(getComputedStyle(node).backgroundColor);
        if (rgba && rgba[3] > 0) overlays.push(rgba);
        if (node.classList.contains("battler")) break;
        node = node.parentElement;
      }
      for (let i = overlays.length - 1; i >= 0; i -= 1) {
        bg = compositeOver(bg, overlays[i]);
      }
      return bg;
    };

    const ctx = canvas.getContext("2d");
    const saved = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const targets = [
      ["battler-name", ".battle-ui .battler.foe strong"],
      ["battler-meta", ".battle-ui .battler.me span"],
      ["meter-label", ".battle-ui .battler.me .meter"],
    ];
    const rows = [];
    for (const fill of fills) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const [name, selector] of targets) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const cs = getComputedStyle(el);
        const px = Number.parseFloat(cs.fontSize);
        const required = px >= 18 ? 3 : 4.5;
        const fgRgba = parseRgba(cs.color);
        const fg = fgRgba ? [fgRgba[0], fgRgba[1], fgRgba[2]] : [255, 255, 255];
        const bg = effectiveBg(el);
        const r = contrast(fg, bg);
        rows.push({
          name: `${name}-${fill}`,
          fontSize: cs.fontSize,
          ratio: Math.round(r * 100) / 100,
          required,
          pass: r >= required,
          backing: fill,
        });
      }
    }
    ctx.putImageData(saved, 0, 0);
    const worstByTarget = new Map();
    for (const row of rows) {
      const key = row.name.replace(/-#[0-9a-f]+$/i, "");
      const prev = worstByTarget.get(key);
      if (!prev || row.ratio < prev.ratio) worstByTarget.set(key, row);
    }
    return [...worstByTarget.values()];
  }, canvasFills);
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

    await page.evaluate(() => window.__reliquary?.cancel?.());
    await page.waitForSelector(".hud-menu");
    await page.evaluate(() => window.__controlsTest?.startWild?.());
    await page.waitForSelector(".battle-ui .battler.foe strong", { timeout: 20_000 });

    const battleReport = await measureBattleComposited(page, ["#ffffff", "#000000"]);

    const report = [...hudReport, ...panelReport, ...battleReport];
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, "ui-contrast-report.json"), JSON.stringify(report, null, 2));

    for (const row of report) {
      if (row.ratio == null) continue;
      assert.ok(row.pass, `${row.name} contrast ${row.ratio}:1 below ${row.required}:1`);
    }
    const shortfalls = report.filter((row) => row.ratio != null && !row.pass);
    console.log("[contrast]", JSON.stringify({ report, shortfalls }));
  });
} finally {
  server.close();
}

console.log("[contrast] measured UI and battle composited samples");
