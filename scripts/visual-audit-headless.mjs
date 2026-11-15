import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer, waitForGameBoot } from "../tests/browser/helpers.mjs";
import { finishStarterPact } from "./finish-starter-pact.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const auditDir = join(root, "artifacts", "visual-audit");
mkdirSync(auditDir, { recursive: true });

const VIEWPORTS = [
  { name: "mobile-portrait", width: 390, height: 844 },
  { name: "mobile-small", width: 320, height: 568 },
  { name: "mobile-landscape", width: 844, height: 390 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

async function runAudit() {
  const { server, baseUrl } = await startStaticServer(0);
  const browser = await chromium.launch({ headless: true });
  const findings = [];
  const metrics = [];

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n=== Auditing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));

      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await waitForGameBoot(page);

      // Check overflow helper
      async function checkOverflow(sceneName) {
        const overflow = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const issues = [];
          if (docEl.scrollWidth > window.innerWidth) {
            issues.push(`document scrollWidth (${docEl.scrollWidth}) > innerWidth (${window.innerWidth})`);
          }
          if (body.scrollWidth > window.innerWidth) {
            issues.push(`body scrollWidth (${body.scrollWidth}) > innerWidth (${window.innerWidth})`);
          }
          // find any elements that overflow viewport horizontally
          const all = document.querySelectorAll("*");
          for (const el of all) {
            const rect = el.getBoundingClientRect();
            if (rect.right > window.innerWidth + 2 && rect.width > 0 && rect.height > 0) {
              const cls = el.className || el.tagName;
              // Ignore non-visible or root elements
              if (rect.width < 5000 && !["HTML", "BODY"].includes(el.tagName)) {
                issues.push(`element <${el.tagName} class="${cls}"> right edge (${Math.round(rect.right)}) > viewport (${window.innerWidth})`);
              }
            }
          }
          return issues;
        });
        if (overflow.length > 0) {
          findings.push({
            severity: "P2",
            viewport: vp.name,
            scene: sceneName,
            type: "HORIZONTAL_OVERFLOW",
            details: overflow,
          });
        }
      }

      // Helper: get layout bounding boxes
      async function getElementBoxes(selectors) {
        return await page.evaluate((sels) => {
          const res = {};
          for (const [key, sel] of Object.entries(sels)) {
            const el = document.querySelector(sel);
            if (el) {
              const r = el.getBoundingClientRect();
              const cs = window.getComputedStyle(el);
              res[key] = {
                visible: r.width > 0 && r.height > 0,
                x: Math.round(r.x),
                y: Math.round(r.y),
                width: Math.round(r.width),
                height: Math.round(r.height),
                fontSize: cs.fontSize,
                color: cs.color,
                backgroundColor: cs.backgroundColor,
                zIndex: cs.zIndex,
              };
            } else {
              res[key] = null;
            }
          }
          return res;
        }, selectors);
      }

      // --- Scene 1: Title Screen ---
      await page.screenshot({ path: join(auditDir, `${vp.name}-01-title.png`) });
      await checkOverflow("Title Screen");

      // --- Scene 2: Start Game & Intro Cinematic Dialogue ---
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.waitForSelector(".dialog", { timeout: 10_000 });
      const dialogBoxes = await getElementBoxes({
        dialogScene: ".dialog-scene",
        dialogButton: "button.dialog",
        dialogText: ".dialog-text",
        dialogNameplate: ".dialog-nameplate",
        dialogNext: ".dialog-next",
      });
      metrics.push({ viewport: vp.name, scene: "Intro Dialogue", boxes: dialogBoxes });
      await page.screenshot({ path: join(auditDir, `${vp.name}-02-intro-dialogue.png`) });
      await checkOverflow("Intro Dialogue");

      // Advance through intro dialogue (3 clicks)
      for (let i = 0; i < 3; i++) {
        if ((await page.locator("button.dialog").count()) > 0) {
          await page.locator("button.dialog").click();
          await page.waitForTimeout(100);
        }
      }

      // --- Scene 3: World Overworld (Cottage Interior) ---
      await page.waitForSelector(".hud-menu", { timeout: 10_000 });
      const overworldBoxes = await getElementBoxes({
        hudRow: ".hud-row",
        hudStats: ".hud-stats",
        hudGold: ".hud-gold",
        hudCompanion: ".hud-companion",
        hudObjective: ".hud-chip",
        hudMenu: ".hud-menu",
        touchPad: ".touch",
      });
      metrics.push({ viewport: vp.name, scene: "Overworld Cottage", boxes: overworldBoxes });

      // Check if Menu button and touch controls overlap
      if (overworldBoxes.hudMenu && overworldBoxes.touchPad) {
        const m = overworldBoxes.hudMenu;
        const t = overworldBoxes.touchPad;
        if (m.y + m.height > t.y && m.x + m.width > t.x && m.x < t.x + t.width) {
          findings.push({
            severity: "P1",
            viewport: vp.name,
            scene: "Overworld",
            type: "TOUCH_HUD_OVERLAP",
            details: `HUD menu overlaps TouchPad: menu=${JSON.stringify(m)}, touch=${JSON.stringify(t)}`,
          });
        }
      }

      await page.screenshot({ path: join(auditDir, `${vp.name}-03-cottage-overworld.png`) });
      await checkOverflow("Cottage Overworld");

      // --- Scene 4: Objective Expander ---
      await page.locator(".hud-objective-btn").click();
      await page.waitForTimeout(200);
      const objectiveExpandedBoxes = await getElementBoxes({
        hudRow: ".hud-row",
        hudMenu: ".hud-menu",
        hudObjectiveFull: ".hud-objective-full",
      });
      metrics.push({ viewport: vp.name, scene: "Objective Expanded", boxes: objectiveExpandedBoxes });
      await page.screenshot({ path: join(auditDir, `${vp.name}-04-objective-expanded.png`) });
      await checkOverflow("Objective Expanded");
      // Collapse objective
      await page.locator(".hud-objective-btn").click();
      await page.waitForTimeout(200);

      // --- Scene 5: Party Screen (Empty/Starter-less) ---
      await page.locator(".hud-menu").click();
      await page.waitForSelector(".overlay-panel", { timeout: 5000 });
      await page.getByRole("button", { name: "Party", exact: true }).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(auditDir, `${vp.name}-05-menu-party-empty.png`) });
      await checkOverflow("Party Menu Empty");

      // Close menu
      await page.getByRole("button", { name: "Back" }).click();
      await page.waitForTimeout(200);
      await page.getByRole("button", { name: "Close" }).click().catch(() => {});
      await page.waitForTimeout(200);

      // --- Scene 6: Binding Grove & Starter Confirmation ---
      // Use test probes to walk to Grove
      const { MAPS } = await import("../src/game/maps.ts");
      const { pathFor } = await import("./natural-journey-path.mjs");
      async function travelTo(mapId, target) {
        const start = await page.evaluate(() => window.__controlsTest?.getPos?.());
        if (!start) return;
        for (const step of pathFor(MAPS[mapId], start, target, false)) {
          await page.evaluate(async ({ step, mapId }) => {
            window.__controlsTest.setKeys([step.key]);
            try {
              await new Promise((resolve) => {
                const check = () => {
                  const pos = window.__controlsTest.getPos();
                  if (pos.map !== mapId || (pos.x === step.x && pos.y === step.y)) resolve(pos);
                  else requestAnimationFrame(check);
                };
                requestAnimationFrame(check);
              });
            } finally {
              window.__controlsTest.setKeys([]);
            }
          }, { step, mapId });
        }
      }

      await travelTo("home", { x: 5, y: 8 });
      await travelTo("elderhall", { x: 0, y: 10 });
      await travelTo("grove", { x: 4, y: 7 });

      // Turn up to inspect starter
      await page.evaluate(async () => {
        window.__controlsTest?.setKeys(["KeyW"]);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        window.__controlsTest?.setKeys([]);
      });
      await page.keyboard.press("KeyZ");
      await page.waitForTimeout(300);

      // Inspect starter description
      await page.screenshot({ path: join(auditDir, `${vp.name}-06-starter-inspect.png`) });

      // Advance starter pact and capture NamePrompt state
      await finishStarterPact(page, {
        onNamePrompt: async () => {
          const namePromptBoxes = await getElementBoxes({
            namePrompt: ".name-prompt",
            namePromptInput: ".name-prompt input",
            namePromptSubmit: ".name-prompt button.btn-primary",
            namePromptKeep: ".name-prompt button:not(.btn-primary)",
          });
          metrics.push({ viewport: vp.name, scene: "NamePrompt", boxes: namePromptBoxes });
          await page.screenshot({ path: join(auditDir, `${vp.name}-09-name-prompt.png`) });
          await checkOverflow("NamePrompt");
        },
      });

      // --- Scene 8: Overworld with Companion HUD ---
      await page.waitForSelector(".hud-companion-name", { timeout: 5000 });
      const companionHudBoxes = await getElementBoxes({
        hudRow: ".hud-row",
        hudStats: ".hud-stats",
        hudGold: ".hud-gold",
        hudCompanion: ".hud-companion",
        hudCompanionName: ".hud-companion-name",
        hudCompanionHp: ".hud-companion-hp",
        hudCompanionMeter: ".hud-companion-meter",
        hudMenu: ".hud-menu",
      });
      metrics.push({ viewport: vp.name, scene: "Companion HUD", boxes: companionHudBoxes });
      await page.screenshot({ path: join(auditDir, `${vp.name}-11-companion-hud.png`) });
      await checkOverflow("Companion HUD");

      // --- Scene 9: Party Screen with Companion Card ---
      await page.locator(".hud-menu").click();
      await page.waitForSelector(".overlay-panel", { timeout: 5000 });
      await page.getByRole("button", { name: "Party", exact: true }).click();
      await page.waitForSelector(".party-grid", { timeout: 5000 });
      const partyBoxes = await getElementBoxes({
        partyGrid: ".party-grid",
        beastCard: ".beast-card",
        beastName: ".beast-name",
        actionBtn: ".party-grid button",
      });
      metrics.push({ viewport: vp.name, scene: "Party Screen", boxes: partyBoxes });
      await page.screenshot({ path: join(auditDir, `${vp.name}-12-party-with-companion.png`) });
      await checkOverflow("Party Screen");

      // Card actions sub-panel
      try {
        await page.locator(".party-grid .beast-card").click();
        await page.waitForTimeout(200);
        await page.screenshot({ path: join(auditDir, `${vp.name}-13-card-actions.png`) });
      } catch (err) {
        findings.push({ severity: "P2", viewport: vp.name, scene: "Card Actions", type: "INTERACTION_ERROR", details: [String(err)] });
      }

      // Close back to world with keyboard Esc/KeyX
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(200);

      // --- Scene 10: Wild Battle Screen ---
      try {
        // Walk from Grove back to Elderhall, then north to Briar Road
        await travelTo("grove", { x: 15, y: 7 });
        await travelTo("elderhall", { x: 10, y: 0 });
        // Trigger battle on Briar Road
        await page.evaluate(() => window.__controlsTest?.startWild?.());
        await page.waitForSelector(".battle-ui, .cmd", { timeout: 10_000 });
        const battleBoxes = await getElementBoxes({
          battleUi: ".battle-ui",
          battleHud: ".battle-hud",
          battleCmds: ".cmd",
          recap: ".recap-log",
        });
        metrics.push({ viewport: vp.name, scene: "Battle Screen", boxes: battleBoxes });
        await page.screenshot({ path: join(auditDir, `${vp.name}-14-battle-command.png`) });
        await checkOverflow("Battle Command");

        // Skills submenu
        const skillBtn = page.getByRole("button", { name: "Skill", exact: true });
        if (await skillBtn.isVisible()) {
          await skillBtn.click();
          await page.waitForTimeout(200);
          await page.screenshot({ path: join(auditDir, `${vp.name}-15-battle-skills.png`) });
          // Back
          await page.keyboard.press("KeyX");
          await page.waitForTimeout(100);
        }
      } catch (err) {
        findings.push({ severity: "P2", viewport: vp.name, scene: "Battle Screen", type: "BATTLE_CAPTURE_ERROR", details: [String(err)] });
      }

      if (consoleErrors.length > 0) {
        findings.push({
          severity: "P1",
          viewport: vp.name,
          scene: "Global",
          type: "CONSOLE_ERRORS",
          details: consoleErrors,
        });
      }

      await context.close();
    }

    const report = {
      timestamp: new Date().toISOString(),
      viewportsAudited: VIEWPORTS.map((v) => `${v.name} (${v.width}x${v.height})`),
      totalFindings: findings.length,
      findings,
      metrics,
    };
    writeFileSync(join(auditDir, "visual-audit-report.json"), JSON.stringify(report, null, 2));
    console.log(`\n=== Visual Audit Complete: ${findings.length} findings recorded in artifacts/visual-audit ===\n`);
  } finally {
    await browser.close();
    server.close();
  }
}

runAudit().catch((err) => {
  console.error("Visual audit failed:", err);
  process.exit(1);
});
