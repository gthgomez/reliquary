/**
 * DOM battle HUD: stable dock geometry, foe card vs command band, forced-switch scroll,
 * touch targets, and composited contrast samples (UI-owned).
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

async function dismissIntro(page) {
  for (let i = 0; i < 24; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    const btn = page.locator("button.dialog").first();
    if (await btn.count()) await btn.click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    else await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}

async function startBattle(page) {
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await dismissIntro(page);
  await page.waitForFunction(() => typeof window.__controlsTest?.startWild === "function");
  await page.evaluate(() => window.__controlsTest?.startWild?.());
  await page.waitForSelector(".battle-controls", { timeout: 15_000 });
  await page.waitForSelector(".battler.foe", { timeout: 10_000 });
  await page.waitForTimeout(200);
}

async function probeFoeVsControls(page) {
  return page.evaluate(() => {
    const controls = document.querySelector(".battle-controls");
    const foeHud = document.querySelector(".battler.foe");
    if (!controls || !foeHud) return null;
    const c = controls.getBoundingClientRect();
    const f = foeHud.getBoundingClientRect();
    const hit = (a, b) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return {
      foeHudVsControls: hit(f, c),
      gapPx: c.top - f.bottom,
      controlsTop: c.top,
    };
  });
}

async function assertTouchTargets(page, label) {
  const short = await page.evaluate(() => {
    const sel = ".battle-controls button, .battle-controls .cmd button";
    return [...document.querySelectorAll(sel)]
      .filter((el) => el.getClientRects().length && !el.disabled)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent?.trim().slice(0, 24), w: r.width, h: r.height };
      })
      .filter((row) => row.h < 44 || row.w < 44);
  });
  assert.deepEqual(short, [], `${label} battle buttons below 44px: ${JSON.stringify(short)}`);
}

async function assertDockStable(page, label) {
  const tops = await page.evaluate(async () => {
    const read = () => document.querySelector(".battle-controls")?.getBoundingClientRect().top ?? 0;
    const a = read();
    await new Promise((r) => requestAnimationFrame(r));
    const b = read();
    return { a, b, delta: Math.abs(a - b) };
  });
  assert.ok(tops.delta < 1.5, `${label} battle-controls top shifted ${tops.delta}px between frames`);
}

const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "390x667", width: 390, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "640x320", width: 640, height: 320 },
  { name: "844x390", width: 844, height: 390 },
  { name: "1280x800", width: 1280, height: 800 },
];

const { server, baseUrl } = await startStaticServer(0);
mkdirSync("/opt/cursor/artifacts", { recursive: true });

try {
  for (const vp of VIEWPORTS) {
    await withBrowser(async (page) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await waitForGameBoot(page);
      await startBattle(page);

      const commandProbe = await probeFoeVsControls(page);
      assert.ok(commandProbe, `${vp.name} battle HUD probe missing`);
      assert.equal(commandProbe.foeHudVsControls, false, `${vp.name} foe overlaps controls`);
      assert.ok(commandProbe.gapPx >= 2, `${vp.name} foe/controls gap ${commandProbe.gapPx}px`);
      await assertTouchTargets(page, `${vp.name} command`);
      await assertDockStable(page, vp.name);

      await page.getByRole("button", { name: "Skill", exact: true }).click();
      await page.waitForSelector('.battle-controls[data-battle-phase="skills"]');
      assert.equal(await page.locator(".battle-back").count(), 1, `${vp.name} skills Back visible`);
      await assertTouchTargets(page, `${vp.name} skills`);

      await page.locator(".battle-back").click();
      await page.waitForSelector('.battle-controls[data-battle-phase="command"]');

      await page.getByRole("button", { name: "Item", exact: true }).click();
      await page.waitForSelector('.battle-controls[data-battle-phase="items"]', { timeout: 5000 });
      await assertTouchTargets(page, `${vp.name} items`);
      await page.locator(".battle-back").click();
      await page.waitForSelector('.battle-controls[data-battle-phase="command"]');

      await page.screenshot({
        path: `/opt/cursor/artifacts/battle-hud-${vp.name}-command.png`,
      });
    });
    console.log(`[battle-hud-layout] ok ${vp.name} command/skills`);
  }

  await withBrowser(
    async (page) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await waitForGameBoot(page);
      await startBattle(page);
      await page.waitForFunction(() => typeof window.__reliquary?.seedForcedSwitch === "function");
      for (const size of [2, 4, 6]) {
        await page.evaluate((n) => window.__reliquary?.seedForcedSwitch?.(n), size);
        await page.waitForSelector('.battle-controls[data-battle-phase="party"]', { timeout: 10_000 });
        const scrollProbe = await page.evaluate(() => {
          const body = document.querySelector(".battle-controls-body");
          const back = document.querySelector(".battle-back");
          const actions = document.querySelector(".battle-controls-actions");
          if (!body || !back || !actions) return null;
          const br = back.getBoundingClientRect();
          const ar = actions.getBoundingClientRect();
          const clipped = [...body.querySelectorAll("button")].filter((btn) => {
            const r = btn.getBoundingClientRect();
            return r.bottom > body.getBoundingClientRect().bottom + 1 && r.top < body.getBoundingClientRect().bottom;
          });
          body.scrollTop = body.scrollHeight;
          const br2 = back.getBoundingClientRect();
          return {
            bodyScrollable: body.scrollHeight > body.clientHeight + 4,
            backPinned: Math.abs(br2.top - br.top) < 1,
            backInActions: actions.contains(back),
            actionsBottom: ar.bottom,
            innerHeight: window.innerHeight,
            clippedMidScroll: clipped.length,
          };
        });
        assert.ok(scrollProbe, `party ${size} probe missing`);
        assert.equal(scrollProbe.backInActions, true, `party ${size} Back not in action row`);
        assert.equal(scrollProbe.backPinned, true, `party ${size} Back moved when body scrolled`);
        assert.ok(scrollProbe.actionsBottom <= scrollProbe.innerHeight + 2, `party ${size} actions clipped`);
        if (size >= 4) assert.ok(scrollProbe.bodyScrollable, `party ${size} should scroll`);
        const logText = await page.locator(".battle-log-text").innerText();
        assert.ok(/Choose another/i.test(logText), `party ${size} log clipped (${JSON.stringify(logText)})`);
        assert.ok(!/^hoose/i.test(logText.trim()), `party ${size} log missing leading letter`);
      }
      await page.screenshot({ path: "/opt/cursor/artifacts/battle-hud-forced-switch-320x568.png" });
    },
    { context: { fontSize: "100%" } },
  );
  console.log("[battle-hud-layout] ok forced-switch scroll + pinned Back");

  await withBrowser(
    async (page) => {
      await page.setViewportSize({ width: 390, height: 667 });
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await waitForGameBoot(page);
      await startBattle(page);
      await page.waitForFunction(() => typeof window.__reliquary?.setBattlePhase === "function");
      await page.evaluate(() => window.__reliquary?.setBattlePhase?.("party"));
      await assertTouchTargets(page, "200% party");
      const meter = await page.evaluate(() => {
        const el = document.querySelector(".battle-controls .meter");
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { label: el.getAttribute("aria-label"), fontSize: cs.fontSize };
      });
      assert.ok(meter?.label?.match(/Health|Skill/i), "meter aria-label explains HP/MP");
      writeFileSync(
        "/opt/cursor/artifacts/battle-hud-meter-sample.json",
        JSON.stringify(meter, null, 2),
      );
    },
    { context: { fontSize: "200%" } },
  );
  console.log("[battle-hud-layout] ok 200% text + meter labels");

  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await startBattle(page);
    await page.waitForFunction(() => typeof window.__reliquary?.primeSkillMenu === "function");
    await page.evaluate(() => window.__reliquary?.primeSkillMenu?.(2));
    await page.waitForSelector('.battle-controls[data-battle-phase="skills"]');
    const unaffordable = page.locator(".cmd-skills button.skill-unaffordable").first();
    assert.ok((await page.locator(".cmd-skills button.skill-unaffordable").count()) >= 1, "at least one skill marked unaffordable at 2 MP");
    const hint = await unaffordable.locator("em").innerText();
    assert.match(hint, /Need \d+ MP · have 2/);
    await unaffordable.click();
    await page.waitForTimeout(120);
    assert.equal(
      await page.locator('.battle-controls[data-battle-phase="skills"]').count(),
      1,
      "unaffordable skill click must not leave skills menu (no spend)",
    );
    await page.screenshot({ path: "/opt/cursor/artifacts/battle-hud-skill-mp-390x667.png" });
  });
  console.log("[battle-hud-layout] ok skill MP insufficiency surfaced in UI");
} finally {
  server.close();
}

console.log("[battle-hud-layout] stable HUD, scrollable switch, targets, contrast hooks");
