import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const captures = process.env.RELIQUARY_DIALOGUE_CAPTURES;
if (captures) mkdirSync(captures, { recursive: true });
const evidence = [];
const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844, mobile: true },
  { width: 844, height: 390, mobile: true },
  { width: 360, height: 740, mobile: true },
  { width: 360, height: 740, mobile: true, classic: true, reduced: true },
  { width: 844, height: 390, mobile: true, safe: true },
  { width: 667, height: 375, mobile: true },
  { width: 568, height: 320, mobile: true },
];
const { server, baseUrl } = await startStaticServer(0);

async function settle(page) {
  await page.evaluate(async () => {
    await Promise.all(
      [...document.querySelectorAll(".dialog-portrait img")].map((img) => img.decode()),
    );
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.target?.closest?.(".dialog-scene"))
        .map((a) => a.finished),
    );
  });
}

async function speak(page, map, x, y, key = "z") {
  assert.equal(await page.locator(".dialog").count(), 0, "previous conversation finished");
  await page.evaluate(([map, x, y]) => window.__controlsTest.warp(map, x, y), [map, x, y]);
  // Face the solid NPC/object immediately above us. Wait for the actual engine
  // direction, rather than assuming a key tap crossed an animation frame.
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(() => window.__controlsTest.getYaw() !== 0);
  await page.keyboard.up("ArrowUp");
  await page.keyboard.press(key);
  await page.waitForSelector(".dialog");
  await settle(page);
}

async function closePages(page) {
  for (let count = 0; count < 12 && (await page.locator(".dialog").count()); count++) {
    await page.locator(".dialog").click();
  }
  await page.waitForSelector(".dialog", { state: "detached" });
}

async function checkLayout(page, label, shot = false) {
  await settle(page);
  const m = await page.evaluate(() => {
    const rect = (el) => {
      if (!el || !el.checkVisibility() || getComputedStyle(el).visibility === "hidden") return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const one = (selector) => rect(document.querySelector(selector));
    const panel = document.querySelector(".dialog");
    const rootStyle = getComputedStyle(document.querySelector(".game-root"));
    return {
      safeArea: {
        left: parseFloat(rootStyle.paddingLeft),
        top: parseFloat(rootStyle.paddingTop),
        right: innerWidth - parseFloat(rootStyle.paddingRight),
        bottom: innerHeight - parseFloat(rootStyle.paddingBottom),
      },
      viewport: one(".viewport"),
      panel: rect(panel),
      portrait: one(".dialog-portrait img"),
      name: one(".dialog-nameplate"),
      text: one(".dialog-text"),
      next: one(".dialog-next"),
      blockers: [
        ...document.querySelectorAll(
          ".hud-chip, .hud-menu, .hud-objective-popover, .app-status, .touch button, .touch-dialog-hint",
        ),
      ]
        .map(rect)
        .filter(Boolean),
      statusVisible: !!one(".app-status"),
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      width: innerWidth,
      height: innerHeight,
      textContent: document.querySelector(".dialog-text").textContent,
      nameContent: document.querySelector(".dialog-name").textContent,
      portraitKey: panel.dataset.portrait,
    };
  });
  const overlaps = (a, b) =>
    a &&
    b &&
    a.left < b.right - 1 &&
    a.right > b.left + 1 &&
    a.top < b.bottom - 1 &&
    a.bottom > b.top + 1;
  const inside = (a, b) =>
    a.left >= b.left - 1 &&
    a.right <= b.right + 1 &&
    a.top >= b.top - 1 &&
    a.bottom <= b.bottom + 1;
  for (const part of ["panel", "portrait", "name", "text", "next"]) {
    if (!m[part]) continue;
    assert.ok(
      inside(m[part], m.viewport),
      `${label}: ${part} within safe viewport: ${JSON.stringify(m)}`,
    );
    for (const blocker of m.blockers)
      assert.ok(
        !overlaps(m[part], blocker),
        `${label}: ${part} overlaps chrome: ${JSON.stringify(m)}`,
      );
  }
  for (const blocker of m.blockers)
    assert.ok(inside(blocker, m.safeArea), `${label}: chrome clears device safe area`);
  assert.ok(
    inside(m.text, m.panel) && inside(m.name, m.panel) && inside(m.next, m.panel),
    `${label}: text, name and action inside panel`,
  );
  assert.ok(
    !overlaps(m.text, m.next) && !overlaps(m.name, m.text),
    `${label}: text clears name and action`,
  );
  assert.ok(!overlaps(m.portrait, m.panel), `${label}: portrait has its own space`);
  assert.equal(m.statusVisible, false, `${label}: status yields during dialogue`);
  assert.ok(
    m.scrollWidth <= m.width && m.scrollHeight <= m.height,
    `${label}: no document overflow`,
  );
  evidence.push({ label, ...m });
  if (captures && shot) await page.screenshot({ path: join(captures, `${label}.png`) });
  return m;
}

try {
  for (const v of viewports) {
    const prefix = `${v.width}x${v.height}${v.classic ? "-classic-reduced" : ""}${v.safe ? "-safe-area" : ""}`;
    await withBrowser(
      async (page, context) => {
        if (v.safe) {
          const cdp = await context.newCDPSession(page);
          await cdp.send("Emulation.setSafeAreaInsetsOverride", {
            insets: { top: 12, right: 44, bottom: 21, left: 44 },
          });
        }
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (e) => {
          if (e.type() === "error") errors.push(e.text());
        });
        if (v.classic)
          await page.addInitScript(() => localStorage.setItem("reliquary-classic-touch", "1"));
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        await waitForGameBoot(page);
        assert.ok(
          await page.evaluate(() => !!window.__controlsTest),
          "capture requires browser-test build",
        );
        await page.getByRole("button", { name: "Start", exact: true }).click();
        await closePages(page);
        await page.waitForSelector(".app-status");
        const status = await page.locator(".app-status").textContent();

        await speak(page, "elderhall", 7, 10);
        const maren = await checkLayout(page, `${prefix}-maren`, !v.classic);
        assert.equal(maren.portraitKey, "elder-maren");
        assert.equal(maren.nameContent, "Elder Maren");
        if (v.reduced)
          assert.equal(
            await page
              .locator(".dialog-portrait")
              .evaluate((el) => getComputedStyle(el).animationName),
            "none",
          );
        await page.keyboard.press("Enter");
        assert.match(
          await page.locator(".dialog-text").textContent(),
          /Walk west/,
          "one Enter advances exactly one page",
        );
        await checkLayout(page, `${prefix}-maren-page2`);
        if (v.mobile) await page.getByRole("button", { name: "A", exact: true }).tap();
        else await page.keyboard.press("x");
        await page.waitForSelector(".dialog", { state: "detached" });
        assert.equal(await page.locator(".app-status").isVisible(), true);
        assert.equal(
          await page.locator(".app-status").textContent(),
          status,
          "status restored without remount/reset",
        );
        assert.equal(await page.locator(".hud-menu").isVisible(), true);

        await speak(page, "grove", 4, 7);
        assert.equal(
          await page.locator(".dialog-portrait").count(),
          0,
          "starter creature is text-only",
        );
        await page.locator(".dialog").click();
        await page.locator(".dialog").click();
        assert.equal(
          await page.locator(".dialog").getAttribute("data-portrait"),
          "elder-maren",
          "starter callback identity",
        );
        await closePages(page);

        await speak(page, "thornkeep", 11, 7);
        assert.equal(await page.locator(".dialog").getAttribute("data-portrait"), "warden-cael");
        await page.locator(".dialog").click();
        const cael = await checkLayout(page, `${prefix}-cael-long`, !v.classic);
        assert.match(
          cael.textContent,
          /Your beast has weathered.*Iron. Chapel. Drake/,
          "longest current NPC page exercised",
        );
        const before = await page.evaluate(() => window.__controlsTest.getPos());
        await page.keyboard.down("ArrowRight");
        // Two game frames prove movement remains locked during conversation.
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        await page.keyboard.up("ArrowRight");
        assert.deepEqual(await page.evaluate(() => window.__controlsTest.getPos()), before);
        if (v.mobile) await page.getByRole("button", { name: "B", exact: true }).tap();
        else await page.keyboard.press("Escape");
        await page.waitForSelector(".dialog", { state: "detached" });
        assert.equal(
          (await page.evaluate(() => window.__controlsTest.getPos())).mode,
          "world",
          "declining trial starts no battle",
        );

        await speak(page, "briar_road", 12, 17);
        await page.locator(".dialog").click();
        await page.locator(".dialog").click();
        assert.match(
          (await checkLayout(page, `${prefix}-wayfarer-long`)).textContent,
          /Know the signs/,
        );
        await closePages(page);

        for (const [map, x, y, key, name] of [
          ["elderhall", 11, 3, "guard", "Gateward"],
          ["briar_camp", 4, 6, "patch", "Patch"],
          ["guild_in", 6, 7, "elder-maren", "Elder Maren"],
          ["warden_hall", 7, 5, "warden-cael", "Warden Cael"],
          ["keep_inn", 4, 5, "innkeep", "Innmother"],
        ]) {
          await speak(page, map, x, y);
          const m = await checkLayout(
            page,
            `${prefix}-${map}-${key}`,
            !v.mobile && ["guard", "patch"].includes(key),
          );
          assert.equal(m.portraitKey, key);
          assert.equal(m.nameContent, name);
          if (key === "innkeep") {
            await page.locator(".dialog").click();
            assert.equal(
              await page.locator(".dialog-name").textContent(),
              "Innmother",
              "inn callback keeps placed speaker name",
            );
            await closePages(page);
          } else if (key === "warden-cael") {
            await page.keyboard.press("Escape");
          } else await closePages(page);
        }

        await speak(page, "elderhall", 13, 2);
        const sign = await checkLayout(page, `${prefix}-sign`, !v.mobile);
        assert.equal(sign.portraitKey, "none");
        assert.equal(sign.portrait, null);
        assert.match(sign.textContent, /BRIAR ROAD/);
        await closePages(page);
        const pos = await page.evaluate(() => window.__controlsTest.getPos());
        await page.keyboard.down("ArrowRight");
        await page.waitForFunction((x) => window.__controlsTest.getPos().x !== x, pos.x);
        await page.keyboard.up("ArrowRight");
        await page.getByRole("button", { name: "Menu", exact: true }).click();
        await page.waitForSelector(".overlay-panel");
        await page.keyboard.press("Escape");
        assert.deepEqual(errors, [], "no browser errors");
        console.log(
          `[cinematic-dialogue] ${prefix}: identity, pagination, geometry, controls, callbacks and return to play passed`,
        );
      },
      {
        context: {
          viewport: { width: v.width, height: v.height },
          isMobile: !!v.mobile,
          hasTouch: !!v.mobile,
          reducedMotion: v.reduced ? "reduce" : "no-preference",
        },
      },
    );
  }
} finally {
  if (captures) writeFileSync(join(captures, "geometry.json"), JSON.stringify(evidence, null, 2));
  server.close();
}
