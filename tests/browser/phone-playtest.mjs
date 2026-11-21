import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAPS } from "../../src/game/maps.ts";
import { faceDirection, walkTo } from "../../scripts/natural-journey-controls.mjs";
import { measureTargetVisibility, startStaticServer, waitForGameBoot, withBrowser } from "./helpers.mjs";

const matrix = [
  [320, 568], [360, 740], [390, 667], [390, 844], [412, 915],
  [568, 320], [640, 320], [844, 390], [1280, 800], [1440, 900], [1536, 864],
];
const artifacts = process.env.RELIQUARY_PHONE_EVIDENCE;
const baseline = process.argv.includes("--baseline");
const buildsCandidate = process.env.VITE_ELDERHALL_CANDIDATE === "1";
const cases = artifacts ? matrix : [[320, 568], [390, 844], [568, 320], [1280, 800]];
const records = [];
const { server, baseUrl } = await startStaticServer();

async function walk(page, map, target, expectedMap = map) {
  assert.equal((await walkTo(page, MAPS[map], target)).map, expectedMap);
}

async function verifyHeldDirectionStops(page, context) {
  const north = await page.getByRole("button", { name: "North", exact: true }).boundingBox();
  const cdp = await context.newCDPSession(page);
  const before = await page.evaluate(() => window.__controlsTest.getPos().y);
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x: north.x + north.width / 2, y: north.y + north.height / 2 }],
    });
    await page.waitForFunction((y) => window.__controlsTest.getPos().y < y, before);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => window.__controlsTest.getSpeed() === 0);
    const after = await page.evaluate(() => window.__controlsTest.getPos());
    assert.equal(after.map, "home", "the held input did not leave the room");
  } finally {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await page.setViewportSize({ width: 390, height: 844 });
    await cdp.detach();
  }
}

async function exercise(width, height, textScale = 1) {
  const phone = width < 900;
  const portrait = phone && height > width;
  const label = `${width}x${height}${textScale === 1 ? "" : "-large-text"}`;
  await withBrowser(async (page, context) => {
    page.setDefaultTimeout(10_000);
    const failures = [];
    const shots = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
    });
    page.on("requestfailed", (request) => {
      if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push(`${request.url()} ${request.failure()?.errorText}`);
    });
    const capture = async (scene) => {
      if (!artifacts) return;
      const name = `${label}-${scene}.png`;
      await page.screenshot({ path: join(artifacts, name), animations: "disabled" });
      shots.push(name);
    };
    const advance = page.locator(".dialog-next");
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await waitForGameBoot(page);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.locator(".dialog-text").filter({ hasText: "A lantern ticks" }).waitFor();
    if (!baseline && portrait) {
      const room = await page.locator(".game-canvas").boundingBox();
      const narration = await page.locator(".dialog").boundingBox();
      const action = await measureTargetVisibility(advance);
      assert.ok(narration.y - room.y - room.height >= -1 && narration.y - room.y - room.height < 24,
        `the opening card belongs with the cottage: ${JSON.stringify({ room, narration })}`);
      assert.ok(action.fullyVisible && action.hitOk, "intro action remains reachable");
      assert.equal(await page.locator(".dialog-name").count(), 0);
    }
    await capture("01-cottage-intro");
    await advance.click();
    await advance.click();
    if (!baseline) {
      assert.match(await page.locator(".dialog-text").innerText(),
        buildsCandidate ? /Maren beside the village well/ : /Maren near the Chapter House/);
    }
    await advance.click();
    await page.locator(".hud-objective-preview").waitFor();
    if (!baseline) {
      assert.match(await page.locator(".hud-objective-preview").innerText(), /doorway at the bottom/);
      if (portrait) {
        assert.deepEqual(await page.locator(".game-canvas").evaluate((canvas) => [canvas.width, canvas.height]), [352, 288]);
        const down = await measureTargetVisibility(page.getByRole("button", { name: "South", exact: true }));
        assert.ok(down.fullyVisible && down.hitOk && down.box.width >= 44 && down.box.height >= 44);
        assert.ok(height - down.box.y - down.box.height >= 11.5, "D-pad clears the system gesture edge");
        const room = await page.locator(".game-canvas").boundingBox();
        const hud = await page.locator(".hud").boundingBox();
        assert.ok(hud.y + hud.height <= room.y + 1, "the HUD clears the room");
      }
    }
    await capture("02-cottage-explore");
    if (!baseline && textScale === 1 && width === 390 && height === 844) {
      await verifyHeldDirectionStops(page, context);
    }
    if (textScale === 1) {
      await walk(page, "home", { x: 5, y: 8 }, "elderhall");
      await page.locator(".hud-place").filter({ hasText: "Elderhall" }).waitFor();
      await capture("03-elderhall");

      const maren = MAPS.elderhall.npcs.find((npc) => npc.id === "maren");
      await walk(page, "elderhall", { x: maren.x, y: maren.y + 1 });
      await faceDirection(page, "KeyW", Math.PI);
      await page.keyboard.press("KeyZ");
      await advance.click();
      assert.match(await page.locator(".dialog-text").innerText(), /Walk west to the Binding Grove/);
      if (!baseline) {
        assert.equal((await advance.innerText()).trim(), "Close");
        if (portrait) {
          const portraitSlot = await page.locator(".dialog-portrait").boundingBox();
          const marenImage = await page.locator(".dialog-portrait img").boundingBox();
          assert.ok(marenImage.width <= portraitSlot.width * 0.77, "Maren leaves the village visible beside her");
        }
      }
      await capture("04-maren");
      await advance.click();

      await walk(page, "elderhall", { x: 0, y: 10 }, "grove");
      const starters = !baseline && width === 390 && height === 844
        ? ["mirewhelp", "emberkit", "briarling"] : ["mirewhelp"];
      for (const species of starters) {
        const starter = MAPS.grove.objects.find((object) => object.sprite === species);
        await walk(page, "grove", { x: starter.x, y: starter.y + 1 });
        await faceDirection(page, "KeyW", Math.PI);
        await page.keyboard.press("KeyZ");
        await page.locator(".dialog-name").waitFor();
        if (!baseline) {
          const sprite = page.locator(`.dialog img[src$="/${species}.png"]`);
          await sprite.waitFor();
          assert.ok(await sprite.evaluate((img) => img.complete && img.naturalWidth > 0), `${species} sprite loaded`);
        }
        await capture(`05-starter-${species}`);
        if (!baseline) {
          await advance.click();
          assert.match(await page.locator(".dialog-text").innerText(), /Starting skills/);
          await page.keyboard.press("KeyX");
          await page.keyboard.press("KeyX");
          assert.equal(await page.locator(".dialog").count(), 0, "Back then Cancel returns to the grove");
          assert.equal((await page.locator(".hud-companion").innerText()).trim(), "No pact yet");
        }
      }
    }
    assert.deepEqual(failures, []);
    records.push({ viewport: [width, height], textScale, browser: context.browser().version(), shots, failures });
    console.log(`[phone-playtest] ${label} passed`);
  }, {
    context: { viewport: { width, height }, isMobile: phone, hasTouch: phone, reducedMotion: "reduce", serviceWorkers: "allow" },
    textScale,
  });
}

try {
  if (artifacts) await mkdir(artifacts, { recursive: true });
  if (process.env.RELIQUARY_PHONE_VIEWPORT) {
    const [width, height] = process.env.RELIQUARY_PHONE_VIEWPORT.split("x").map(Number);
    await exercise(width, height);
  } else {
    for (const [width, height] of cases) await exercise(width, height);
    if (!baseline) await exercise(320, 568, 2);
  }
} finally {
  server.close();
  if (artifacts) {
    await writeFile(join(artifacts, "manifest.json"), JSON.stringify({
      revision: process.env.RELIQUARY_QA_SHA ?? null,
      node: process.version,
      platform: process.platform,
      baseline,
      elderhallCandidate: buildsCandidate,
      records,
    }, null, 2) + "\n");
  }
}
