/**
 * Verify coherent focus ownership and Enter-key interaction during exploration:
 * - Opening/closing Lantern (M, Close, Save, Objective) must not hijack Enter
 *   into reopening the menu while exploring or interacting with NPCs/objects.
 * - Enter matches Z / mobile A across dialogs, doors, signs, NPCs, and empty tiles.
 * - Deliberate Tab navigation to HUD buttons keeps standard Enter activation.
 */
import assert from "node:assert/strict";
import { MAPS } from "../../src/game/maps/registry.ts";
import { pathFor } from "../../scripts/natural-journey-path.mjs";
import { startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

const { server, baseUrl } = await startStaticServer(0);

async function dismissOpenDialogs(page) {
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog-next").click({ timeout: 2_000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(80);
  }
  await page.waitForFunction(() => !document.querySelector(".dialog"));
}

async function waitIdle(page) {
  await page.waitForFunction(() => window.__controlsTest?.getSpeed?.() === 0, null, { timeout: 10_000 });
}

async function walkPath(page, mapId, target, starterState = false) {
  await waitIdle(page);
  const pos = await page.evaluate(() => window.__controlsTest.getPos());
  assert.equal(pos.map, mapId, `expected player on map ${mapId}, got ${pos.map}`);
  const steps = pathFor(MAPS[mapId], { x: pos.x, y: pos.y }, target, starterState);
  for (const step of steps) {
    await page.evaluate((key) => window.__controlsTest.setKeys([key]), step.key);
    await page.waitForFunction(
      (expected) => {
        const current = window.__controlsTest?.getPos?.();
        return current && (current.map !== expected.fromMap || (current.x === expected.x && current.y === expected.y));
      },
      { ...step, fromMap: mapId },
      { timeout: 5_000 },
    );
    await page.evaluate(() => window.__controlsTest.setKeys([]));
    await waitIdle(page);
  }
}

async function faceDir(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(70);
  await page.keyboard.up(key);
  await waitIdle(page);
}

try {
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(baseUrl, { waitUntil: "load" });
    await waitForGameBoot(page);

    await page.getByRole("button", { name: "Start", exact: true }).click();
    await dismissOpenDialogs(page);
    await page.waitForSelector(".hud-menu", { timeout: 15_000 });

    // Scenario 1: Open menu via KeyM, close via Escape, walk to cottage ledger, press Enter.
    await page.keyboard.press("KeyM");
    await page.waitForSelector(".overlay-panel");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".overlay-panel", { state: "detached" });

    // Cottage ledger is at (8,1); stand at (8,2) facing north.
    await walkPath(page, "home", { x: 8, y: 2 });
    await faceDir(page, "ArrowUp");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);

    assert.equal(await page.locator(".overlay-panel").count(), 0,
      "Enter after M/Escape + walking must not reopen Lantern Menu");
    assert.equal(await page.locator(".dialog").count(), 1,
      "Enter facing Ledger must open its dialog");
    assert.match(await page.locator(".dialog-text").innerText(), /Pactwardens do not own beasts/i);
    await page.keyboard.press("Enter");
    await page.waitForSelector(".dialog", { state: "detached" });

    // Scenario 2: Facing nothing in open floor, Enter must NOT open menu or trigger errors.
    await walkPath(page, "home", { x: 5, y: 5 });
    await faceDir(page, "ArrowRight");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    assert.equal(await page.locator(".overlay-panel").count(), 0, "Enter on empty tile must not open Menu");
    assert.equal(await page.locator(".dialog").count(), 0, "Enter on empty tile must not open Dialog");

    // Scenario 3: Mouse-click Menu -> Save (returns to world), then Enter facing Ledger.
    await walkPath(page, "home", { x: 8, y: 2 });
    await faceDir(page, "ArrowUp");
    await page.click(".hud-menu");
    await page.waitForSelector(".overlay-panel");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForSelector(".overlay-panel", { state: "detached" });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    assert.equal(await page.locator(".overlay-panel").count(), 0,
      "Enter after saving from Menu must not reopen Menu");
    assert.equal(await page.locator(".dialog").count(), 1,
      "Enter after Save must interact with faced Ledger");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".dialog", { state: "detached" });

    // Scenario 4: Mouse-click Menu -> Close immediately (without walking) while facing Ledger -> Enter interacts.
    await page.click(".hud-menu");
    await page.waitForSelector(".overlay-panel");
    await page.click(".overlay-panel-close");
    await page.waitForSelector(".overlay-panel", { state: "detached" });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    assert.equal(await page.locator(".overlay-panel").count(), 0,
      "Enter after mouse Menu->Close facing an object must not reopen Menu");
    assert.equal(await page.locator(".dialog").count(), 1,
      "Enter after mouse Menu->Close must interact with faced object");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".dialog", { state: "detached" });

    // Exit home -> elderhall.
    await walkPath(page, "home", { x: 5, y: 8 });
    await page.waitForFunction(() => window.__controlsTest?.getPos?.().map === "elderhall");

    // Scenario 5: Objective button -> Escape -> walk to Elder Maren -> Enter talks + advances dialogue.
    const maren = MAPS.elderhall.npcs.find((n) => n.id === "maren");
    assert.ok(maren);
    await page.locator(".hud-objective-btn").click();
    await page.waitForSelector(".overlay-panel");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".overlay-panel", { state: "detached" });

    await walkPath(page, "elderhall", { x: maren.x, y: maren.y + 1 });
    await faceDir(page, "ArrowUp");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    assert.equal(await page.locator(".overlay-panel").count(), 0,
      "Enter after Objective->Escape + walk must not reopen Lantern");
    assert.equal(await page.locator(".dialog").count(), 1, "Enter talks to Elder Maren");
    assert.match(await page.locator(".dialog-text").innerText(), /Crown cracked/i);
    // Advance page 1 -> page 2 -> Close via Enter
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    assert.match(await page.locator(".dialog-text").innerText(), /Binding Grove/i);
    await page.keyboard.press("Enter");
    await page.waitForSelector(".dialog", { state: "detached" });

    // Scenario 6: Intentional M binding opens menu and Escape/M toggles it.
    await page.keyboard.press("KeyM");
    await page.waitForSelector(".overlay-panel");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".overlay-panel", { state: "detached" });

    // Scenario 7: Deliberate Tab navigation to HUD Menu button preserves keyboard activation.
    let reachedHudMenu = false;
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.classList.contains("hud-menu"))) {
        reachedHudMenu = true;
        break;
      }
    }
    assert.equal(reachedHudMenu, true, "Tab navigation must reach .hud-menu");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".overlay-panel");
    assert.equal(await page.locator(".overlay-panel").count(), 1,
      "Enter on Tab-focused .hud-menu must deliberately open the menu");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".overlay-panel", { state: "detached" });

    // And walking away releases keyboard focus back to exploration so Enter interacts again.
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(220);
    await page.keyboard.up("ArrowLeft");
    await waitIdle(page);
    await walkPath(page, "elderhall", { x: maren.x, y: maren.y + 1 });
    await faceDir(page, "ArrowUp");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    assert.equal(await page.locator(".dialog").count(), 1,
      "Enter interacts with NPC again after walking away from HUD focus");
    await dismissOpenDialogs(page);

    console.log("[explore-enter-focus] passed");
  });
} finally {
  server.close();
}
