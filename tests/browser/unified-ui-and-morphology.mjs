/**
 * Browser verification for the unified forest-and-gold UI, morphology dossier,
 * equal-level comparison, non-spoiling Reliquary bestiary, storage filtering,
 * breadcrumb navigation, evolution presentation modal, and mobile viewports.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { makeBeast } from "../../src/game/content.ts";
import { SAVE_VERSION, WORLD_REVISION } from "../../src/game/save.ts";
import { startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

const shotDir = process.env.RELIQUARY_UI_SHOTS ?? "";
if (shotDir) mkdirSync(shotDir, { recursive: true });

async function snapShot(page, name) {
  if (!shotDir) return;
  await page.screenshot({ path: join(shotDir, name) });
}

function buildSaveFixture() {
  const lead = makeBeast("emberkit", 11, {
    nickname: "Cinderpaw",
    temperament: "calm",
    ivs: { hp: 10, mp: 9, atk: 8, def: 8, mag: 12, res: 10, spd: 11, lck: 9 },
    morphology: { size: 1.19, mass: 1.48 }, // Colossal build
  });
  const partner = makeBeast("dewslime", 11, {
    nickname: "Droplet",
    temperament: "keen",
    ivs: { hp: 8, mp: 8, atk: 7, def: 9, mag: 8, res: 8, spd: 10, lck: 8 },
    morphology: { size: 0.81, mass: 0.62 }, // Miniature build
  });
  // Near Lv 12 so one Practice (+80 lore vs 396 needed) triggers evolution to Bogslime.
  partner.exp = 350;
  const bench = makeBeast("mothwisp", 8, {
    nickname: "Lanternwing",
    temperament: "sage",
    morphology: { size: 0.99, mass: 0.97 },
  });
  const stored = makeBeast("pebblet", 7, {
    nickname: "Cobble",
    temperament: "warding",
    morphology: { size: 1.09, mass: 1.24 },
  });
  return {
    version: SAVE_VERSION,
    worldRevision: WORLD_REVISION,
    playerName: "Rowan",
    mapId: "elderhall",
    x: 12,
    y: 14,
    dir: 0,
    gold: 640,
    playTime: 480,
    party: [lead, partner, bench],
    box: [stored],
    inventory: { tonic: 3, common_sigil: 4, thorn_sigil: 1, etherdrop: 1 },
    flags: { starter: true, pact_emberkit: true },
    seen: { emberkit: true, dewslime: true, mothwisp: true, pebblet: true, pyrefox: true },
    caught: { emberkit: true, dewslime: true, mothwisp: true, pebblet: true },
    habitats: {
      emberkit: ["Briar Road"],
      pyrefox: ["Ashenbarrow"],
      dewslime: ["Briar Road", "Mirefen"],
    },
    records: {
      emberkit: { smallestCm: 48, largestCm: 57, lightestKg: 8.5, heaviestKg: 12.6, boundCount: 2, defeatedCount: 3 },
      pyrefox: { encounteredMinCm: 84, encounteredMaxCm: 92 },
    },
  };
}

const { server, baseUrl } = await startStaticServer(0);

try {
  await withBrowser(async (page) => {
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await waitForGameBoot(page);
    await page.evaluate((save) => localStorage.setItem("reliquary.save.v3", JSON.stringify(save)), buildSaveFixture());
    await page.reload({ waitUntil: "networkidle" });
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForSelector(".hud-menu", { timeout: 15_000 });

    // 1. Lantern Dashboard
    await page.keyboard.press("KeyM");
    await page.waitForSelector("#overlay-panel-title");
    assert.equal(await page.locator("#overlay-panel-title").innerText(), "Lantern");
    assert.match(await page.locator(".rq-lantern-summary").innerText(), /640 crowns/);
    await snapShot(page, "01-lantern-desktop.png");

    // 2. Party Roster + 3-Tab Companion Details + Comparison
    await page.getByRole("button", { name: "Party", exact: true }).click();
    assert.equal(await page.locator(".party-grid .beast-card").count(), 3);
    const partyText = await page.locator(".party-grid").innerText();
    assert.match(partyText, /Colossal/);
    assert.match(partyText, /Miniature/);
    await snapShot(page, "02-party-desktop.png");

    await page.getByRole("button", { name: "Inspect details for Cinderpaw" }).click();
    await page.waitForSelector(".rq-tab-strip");
    const overviewText = await page.locator(".rq-dossier-panel").innerText();
    assert.match(overviewText, /Build trade-offs/);
    assert.match(overviewText, /Vulnerable to/);
    await snapShot(page, "03-companion-overview.png");

    await page.getByRole("tab", { name: /^Skills/ }).click();
    assert.ok(await page.locator(".rq-skill-card").count() >= 1);

    await page.getByRole("tab", { name: "Compare" }).click();
    await page.waitForSelector(".rq-compare-heads");
    assert.match(await page.locator(".rq-dossier-panel").innerText(), /Scaled to Lv/);
    await snapShot(page, "04-companion-compare.png");

    // Verify breadcrumb navigation to Reliquary & back to Cinderpaw
    await page.getByRole("button", { name: "View in Reliquary" }).click();
    assert.equal(await page.locator("#overlay-panel-title").innerText(), "Reliquary");
    assert.match(await page.locator(".rq-lore-copy").innerText(), /fox-drake/i);
    await page.getByRole("button", { name: /Back to Cinderpaw/ }).click();
    assert.equal(await page.locator("#overlay-panel-title").innerText(), "Cinderpaw");

    // Close dossier -> verify Practice evolves Droplet immediately and shows EvolutionModal
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Practice with Droplet for 45 crowns" }).click();
    await page.waitForSelector(".rq-evo-dialog", { timeout: 10_000 });
    assert.match(await page.locator("#rq-evo-title").innerText(), /Droplet evolved into Bogslime/i);
    await snapShot(page, "05-evolution-modal.png");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForSelector(".rq-evo-dialog", { state: "detached" });
    await page.keyboard.press("Escape"); // close Party back to Lantern

    // 3. Reliquary Bestiary spoiler prevention + discovery levels
    await page.getByRole("button", { name: "Reliquary", exact: true }).click();
    // Undiscovered entry (#003 Crownwyrm) has zero name/element/img leak in its card
    const unheardCell = page.locator('[aria-label*="03 Unheard of"]');
    assert.equal(await unheardCell.count(), 1);
    assert.equal(await unheardCell.locator("img").count(), 0);
    // Encountered-only entry (#002 Pyrefox) has darkened silhouette and hides full stats
    await page.getByRole("button", { name: /Pyrefox — seen in the wild/ }).click();
    assert.equal(await page.locator(".rq-portrait.is-silhouette").count(), 1);
    assert.match(await page.locator(".rq-lore-copy").innerText(), /Sighting recorded/i);
    assert.equal(await page.locator(".rq-stats-grid").count(), 0);
    // Bound entry (#001 Emberkit) reveals lore, stats, and tappable Pyrefox link + sealed stage 3
    await page.getByRole("button", { name: /Emberkit — bound to your compact/ }).click();
    assert.equal(await page.locator(".rq-lineage-node.is-sealed").count(), 1);
    await page.getByRole("button", { name: "Open Tome Page" }).click();
    await snapShot(page, "06-reliquary-tome-desktop.png");

    // 4. Storage filters + sorting
    await page.getByRole("button", { name: "Back to Entry Grid" }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Storage", exact: true }).click();
    assert.equal(await page.locator(".party-grid .beast-card").count(), 4);
    await page.getByLabel("Filter stored creatures by element").selectOption("ember");
    assert.match(await page.locator(".overlay-panel-body").innerText(), /No stored creatures match/);
    await page.getByLabel("Filter stored creatures by element").selectOption("all");
    await snapShot(page, "07-storage-desktop.png");

    // 5. Responsive mobile & landscape viewports: no clipped dialog or horizontal overflow
    for (const [label, width, height] of [
      ["mobile-390", 390, 844],
      ["mobile-360", 360, 740],
      ["mobile-320", 320, 568],
      ["landscape-844", 844, 390],
      ["landscape-568", 568, 320],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(100);
      const metrics = await page.evaluate(() => {
        const panel = document.querySelector(".overlay-panel");
        const rect = panel?.getBoundingClientRect();
        return {
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
          inViewport: rect ? rect.left >= 0 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1 : false,
        };
      });
      assert.equal(metrics.overflowX, false, `${label} horizontal overflow`);
      assert.equal(metrics.inViewport, true, `${label} modal overflows viewport`);
      if (label === "mobile-390") {
        await snapShot(page, "08-storage-mobile-390.png");
      }
    }

    // 6. Reload persistence check: evolved Bogslime remains and evolution modal does NOT re-trigger
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "networkidle" });
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForSelector(".hud-menu", { timeout: 15_000 });
    assert.equal(await page.locator(".rq-evo-dialog").count(), 0);
    await page.keyboard.press("KeyM");
    await page.getByRole("button", { name: "Party", exact: true }).click();
    assert.match(await page.locator(".party-grid").innerText(), /Droplet[\s\S]*Bogslime/);
    await snapShot(page, "09-party-mobile-390.png");

    assert.deepEqual(consoleErrors, [], `unexpected browser errors: ${consoleErrors.join("; ")}`);
  });
  console.log("[unified-ui-and-morphology] ok");
} finally {
  server.close();
}
