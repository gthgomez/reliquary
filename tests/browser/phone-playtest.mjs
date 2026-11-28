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
const cases = artifacts ? matrix : [[320, 568], [390, 844], [568, 320], [844, 390], [1280, 800]];
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
    const verifyTransitionFrame = !baseline && buildsCandidate && width === 390 && height === 844;
    if (verifyTransitionFrame) {
      await page.addInitScript(() => {
        window.reliquaryCanvasTransitions = [];
        new MutationObserver((records) => {
          const canvas = records.find(({ target }) => target.matches(".game-canvas"))?.target;
          const map = canvas?.closest(".game-root")?.dataset.worldMap;
          if (!map) return;
          const { width, height } = canvas;
          const context = canvas.getContext("2d");
          const samplePoints = [[0, 0], [width - 1, 0], [0, height - 1],
            [width - 1, height - 1], [Math.floor(width / 2), Math.floor(height / 2)]];
          const minAlpha = Math.min(...samplePoints.map(([x, y]) => context.getImageData(x, y, 1, 1).data[3]));
          window.reliquaryCanvasTransitions.push({ map, width, height, minAlpha });
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ["width", "height"] });
      });
    }
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
    const introFrames = {};
    const introComposition = async () => {
      const frame = await page.locator(".game-canvas").boundingBox();
      const panel = await page.locator(".dialog").boundingBox();
      const action = await advance.boundingBox();
      assert.ok(frame && panel && action);
      const scroll = await page.locator(".dialog-content").evaluate((main) => [main.clientHeight, main.scrollHeight]);
      return {
        anchors: [frame.x, frame.y, frame.width, frame.height, panel.y, action.y, action.height],
        textHeight: scroll,
      };
    };
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
      if (buildsCandidate) {
        assert.equal(await page.getByRole("button", { name: "Next", exact: true }).count(), 1,
          "the default touch layout has one dialogue advance action");
        assert.equal(await page.getByRole("button", { name: "A — Next", exact: true }).count(), 0);
      }
    }
    introFrames["page 1"] = await introComposition();
    const stableIntro = !baseline && portrait;
    const checkIntro = async (label) => {
      const composition = await introComposition();
      introFrames[label] = composition;
      if (!stableIntro) return;
      const start = introFrames["page 1"].anchors;
      assert.ok(composition.anchors.every((position, index) => Math.abs(position - start[index]) <= 1),
        `${label}: cottage and dialogue actions remain anchored: ${JSON.stringify(introFrames)}`);
      const lineHeight = await page.locator(".dialog-text").evaluate((text) => parseFloat(getComputedStyle(text).lineHeight));
      assert.ok(composition.textHeight[0] >= 2 * lineHeight - 1, `${label}: room for two readable lines`);
      assert.ok((await measureTargetVisibility(advance)).hitOk, `${label}: dialogue action is reachable`);
    };
    await capture("01-cottage-intro");
    await advance.click();
    await checkIntro("page 2");
    await capture("01b-cottage-intro-story");
    if (stableIntro) {
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await checkIntro("back to page 1");
      await advance.click();
    }
    await advance.click();
    await checkIntro("page 3");
    await capture("01c-cottage-intro-controls");
    const [visibleText, totalText] = introFrames["page 3"].textHeight;
    if (stableIntro && textScale === 2 && totalText > visibleText) {
      await page.locator(".dialog-content").focus();
      await page.keyboard.press("End");
      await page.waitForFunction(() => document.querySelector(".dialog-content")?.scrollTop > 0);
    }
    if (!baseline) {
      assert.match(await page.locator(".dialog-text").innerText(),
        buildsCandidate ? /Maren beside the village well/ : /Maren near the Chapter House/);
    }
    await advance.click();
    await page.locator(".hud-objective-preview").waitFor();
    if (!baseline) {
      assert.equal(await page.locator(".hud-objective-preview").innerText(), "Leave the cottage");
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
      if (!baseline && width === 844 && height === 390) {
        const objective = await page.locator(".hud-objective-preview").evaluate((element) => {
          const box = element.getBoundingClientRect();
          return { width: box.width, lines: box.height / Number.parseFloat(getComputedStyle(element).lineHeight) };
        });
        assert.ok(objective.width >= 200 && objective.lines <= 3.1,
          `landscape objective has room to read: ${JSON.stringify(objective)}`);
      }
      await capture("03-elderhall");

      const checkGroveFrame = !baseline && portrait && height >= 800;
      const readWorldFrame = async () => ({
        canvas: await page.locator(".game-canvas").boundingBox(),
        south: await page.getByRole("button", { name: "South", exact: true }).boundingBox(),
      });
      const elderhallFrame = checkGroveFrame ? await readWorldFrame() : null;

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
      if (elderhallFrame) {
        await page.locator(".hud-place").filter({ hasText: "Binding Grove" }).waitFor();
        const groveFrame = await readWorldFrame();
        const groveHeight = MAPS.grove.ground.length;
        assert.ok(Math.abs(groveFrame.canvas.height - groveFrame.canvas.width * groveHeight / 10) < 1,
          `the Grove canvas ends at its map edge: ${JSON.stringify(groveFrame)}`);
        assert.equal(groveFrame.canvas.width, elderhallFrame.canvas.width, "the warp keeps the world scale");
        assert.equal(groveFrame.canvas.y, elderhallFrame.canvas.y, "the warp keeps the world anchored");
        assert.deepEqual(groveFrame.south, elderhallFrame.south, "the warp keeps the D-pad under the player's thumb");
        await capture("04b-grove-arrival");
      }
      const starters = !baseline && width === 390 && height === 844
        ? ["mirewhelp", "emberkit", "briarling"] : ["mirewhelp"];
      for (const species of starters) {
        const starter = MAPS.grove.objects.find((object) => object.sprite === species);
        await walk(page, "grove", { x: starter.x, y: starter.y + 1 });
        await faceDirection(page, "KeyW", Math.PI);
        if (!baseline) {
          await page.locator(".world-interaction-hint")
            .filter({ hasText: new RegExp(`Inspect ${species}`, "i") }).waitFor();
        }
        await page.keyboard.press("KeyZ");
        await page.locator(".dialog-name").waitFor();
        if (!baseline) {
          const sprite = page.locator(`.dialog img[src$="/${species}.png"]`);
          await sprite.waitFor();
          await sprite.evaluate((img) => img.decode());
          assert.ok(await sprite.evaluate((img) => img.complete && img.naturalWidth > 0), `${species} sprite loaded`);
        }
        await capture(`05-starter-${species}`);
        if (!baseline) {
          const frame = checkGroveFrame ? await page.locator(".game-canvas").boundingBox() : null;
          await advance.click();
          assert.match(await page.locator(".dialog-text").innerText(), /Starting skills/);
          if (frame) {
            assert.deepEqual(await page.locator(".game-canvas").boundingBox(), frame,
              "starter dialogue pages share the same world frame");
            assert.ok((await measureTargetVisibility(advance)).hitOk, "starter dialogue remains reachable");
          }
          await page.keyboard.press("KeyX");
          await page.keyboard.press("KeyX");
          assert.equal(await page.locator(".dialog").count(), 0, "Back then Cancel returns to the grove");
          assert.equal((await page.locator(".hud-companion").innerText()).trim(), "No pact yet");
        }
      }
    }
    assert.deepEqual(failures, []);
    const canvasTransitions = verifyTransitionFrame ? await page.evaluate(() => window.reliquaryCanvasTransitions) : [];
    if (verifyTransitionFrame) {
      assert.ok(canvasTransitions.some(({ map }) => map === "elderhall"), "observed a resized Elderhall canvas");
      assert.ok(canvasTransitions.every(({ minAlpha }) => minAlpha === 255),
        `the resized canvas is painted before the browser can present it: ${JSON.stringify(canvasTransitions)}`);
    }
    records.push({ viewport: [width, height], textScale, browser: context.browser().version(), introFrames, shots, failures, canvasTransitions });
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
    await exercise(width, height, Number(process.env.RELIQUARY_PHONE_TEXT_SCALE ?? 1));
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
