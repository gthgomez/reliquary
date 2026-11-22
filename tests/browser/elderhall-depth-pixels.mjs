/** Exercise the actual compositing helpers against Chrome's canvas pixels. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(join(root, "src/game/render/world-actors.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const transformSource = readFileSync(join(root, "src/game/render/world-transform.ts"), "utf8");
const transformCode = ts.transpileModule(transformSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const browser = await chromium.launch({ headless: true, executablePath: process.env.RELIQUARY_QA_CHROMIUM || undefined,
  ...(process.env.RELIQUARY_QA_CHANNEL ? { channel: process.env.RELIQUARY_QA_CHANNEL } : {}) });
try {
  const page = await browser.newPage();
  const samples = await page.evaluate(async ({ moduleCode, cameraCode }) => {
    const url = URL.createObjectURL(new Blob([moduleCode], { type: "text/javascript" }));
    const cameraUrl = URL.createObjectURL(new Blob([cameraCode], { type: "text/javascript" }));
    const { paintActorBehindPost, paintPropWithLocalFade } = await import(url);
    const { snapWorldCameraForPlayer } = await import(cameraUrl);
    const makeCanvas = (width, height) => Object.assign(document.createElement("canvas"), { width, height });
    const actor = makeCanvas(8, 8);
    const actorCtx = actor.getContext("2d");
    actorCtx.fillStyle = "#2040a0";
    actorCtx.fillRect(0, 0, 8, 8);
    const post = makeCanvas(8, 12);
    const postCtx = post.getContext("2d");
    postCtx.fillStyle = "#765035";
    postCtx.fillRect(2, 0, 6, 12); // two transparent columns in the source art
    const screen = makeCanvas(24, 16);
    const ctx = screen.getContext("2d");
    ctx.fillStyle = "#284d30";
    ctx.fillRect(0, 0, 24, 16);
    ctx.drawImage(actor, 4, 2);
    ctx.drawImage(post, 8, 0);
    const pixel = (context, x, y) => Array.from(context.getImageData(x, y, 1, 1).data);
    const before = { actor: pixel(ctx, 8, 4), covered: pixel(ctx, 10, 4), post: pixel(ctx, 12, 4), base: pixel(ctx, 10, 9) };
    paintActorBehindPost(ctx, actor, post, { x: 8, y: 0, width: 8, height: 12 },
      { x: 4, y: 2, width: 8, height: 8 }, 8, { x: 0, y: 0, width: 8, height: 12 });
    const after = { actor: pixel(ctx, 8, 4), covered: pixel(ctx, 10, 4), post: pixel(ctx, 12, 4), base: pixel(ctx, 10, 9) };

    const roof = makeCanvas(30, 30);
    const roofCtx = roof.getContext("2d");
    roofCtx.fillStyle = "#a04020";
    roofCtx.fillRect(0, 0, 30, 30);
    const scene = makeCanvas(40, 40);
    const sceneCtx = scene.getContext("2d");
    sceneCtx.fillStyle = "#284d30";
    sceneCtx.fillRect(0, 0, 40, 40);
    sceneCtx.drawImage(actor, 12, 10, 8, 16);
    paintPropWithLocalFade(sceneCtx, roof, { x: 5, y: 5, width: 30, height: 30 },
      { x: 12, y: 10, width: 8, height: 16 }, 0.45, 30);
    const fade = { center: pixel(sceneCtx, 16, 17), outside: pixel(sceneCtx, 6, 6), base: pixel(sceneCtx, 16, 34) };

    const tree = makeCanvas(100, 100);
    const treeCtx = tree.getContext("2d");
    treeCtx.fillStyle = "#b6b52a";
    treeCtx.fillRect(0, 0, 100, 100);
    treeCtx.fillStyle = "#765035";
    treeCtx.fillRect(32, 62, 36, 38);
    const treeScene = makeCanvas(100, 100);
    const treeSceneCtx = treeScene.getContext("2d");
    treeSceneCtx.drawImage(actor, 35, 48, 60, 48);
    treeSceneCtx.drawImage(tree, 0, 0);
    const treeBefore = { side: pixel(treeSceneCtx, 80, 70), trunk: pixel(treeSceneCtx, 50, 70),
      base: pixel(treeSceneCtx, 80, 85), outside: pixel(treeSceneCtx, 5, 10) };
    treeSceneCtx.clearRect(0, 0, 100, 100);
    treeSceneCtx.drawImage(actor, 35, 48, 60, 48);
    paintPropWithLocalFade(treeSceneCtx, tree, { x: 0, y: 0, width: 100, height: 100 },
      { x: 35, y: 48, width: 60, height: 48 }, 0.15, 80, undefined, "elderhall-tree");
    const treeAfter = { side: pixel(treeSceneCtx, 80, 70), trunk: pixel(treeSceneCtx, 50, 70),
      base: pixel(treeSceneCtx, 80, 85), outside: pixel(treeSceneCtx, 5, 10) };

    // Compare actual Chrome raster pixels, including exact half-pixel camera
    // samples and HUD pan. Terrain and a prop share the same world marker.
    const ground = makeCanvas(96, 96);
    const groundCtx = ground.getContext("2d");
    groundCtx.fillStyle = "#fff";
    groundCtx.fillRect(50, 50, 5, 5);
    const marker = makeCanvas(5, 5);
    const markerCtx = marker.getContext("2d");
    markerCtx.fillStyle = "#fff";
    markerCtx.fillRect(0, 0, 5, 5);
    const view = makeCanvas(32, 32);
    const viewCtx = view.getContext("2d");
    viewCtx.imageSmoothingEnabled = false;
    const raster = () => Array.from(viewCtx.getImageData(0, 0, 32, 32).data);
    const mismatches = [];
    for (const fx of [0, 0.1, 0.25, 0.49, 0.5, 0.51, 0.75, 0.9]) {
      for (const fy of [0, 0.1, 0.25, 0.49, 0.5, 0.51, 0.75, 0.9]) {
        for (const playerFraction of [0, 0.25, 0.5, 0.75]) {
          for (const pan of [0, 0.5, 3.25]) {
            const cx = snapWorldCameraForPlayer(50 + playerFraction, 40 + fx);
            const cy = snapWorldCameraForPlayer(50 + playerFraction, 40 + fy - pan);
            viewCtx.clearRect(0, 0, 32, 32);
            viewCtx.drawImage(ground, cx, cy, 32, 32, 0, 0, 32, 32);
            const terrainPixels = raster();
            viewCtx.clearRect(0, 0, 32, 32);
            viewCtx.drawImage(marker, 50 - cx, 50 - cy);
            const propPixels = raster();
            if (terrainPixels.some((value, index) => value !== propPixels[index])) mismatches.push({ fx, fy, playerFraction, pan });
          }
        }
      }
    }
    const edgeGround = makeCanvas(96, 96);
    const edgeCtx = edgeGround.getContext("2d");
    edgeCtx.fillStyle = "#fff";
    edgeCtx.fillRect(10, 10, 5, 5);
    for (const playerFraction of [0, 0.25, 0.5, 0.75]) {
      for (const desired of [-5.5, -1.25, -0.5, 0]) {
        const cy = snapWorldCameraForPlayer(10 + playerFraction, desired);
        const top = Math.max(0, cy);
        const bottom = Math.min(96, cy + 32);
        viewCtx.clearRect(0, 0, 32, 32);
        if (cy < 0) viewCtx.drawImage(edgeGround, 0, 0, 32, 1, 0, 0, 32, -cy);
        if (bottom > top) viewCtx.drawImage(edgeGround, 0, top, 32, bottom - top, 0, top - cy, 32, bottom - top);
        const terrainPixels = raster();
        viewCtx.clearRect(0, 0, 32, 32);
        viewCtx.drawImage(marker, 10, 10 - cy);
        const propPixels = raster();
        if (terrainPixels.some((value, index) => value !== propPixels[index])) mismatches.push({ playerFraction, desired });
      }
    }
    URL.revokeObjectURL(url);
    URL.revokeObjectURL(cameraUrl);
    return { before, after, fade, treeBefore, treeAfter, mismatches };
  }, { moduleCode: code, cameraCode: transformCode });
  assert.notDeepEqual(samples.after.covered, samples.before.covered, "hidden actor pixels receive a visible cue");
  assert.deepEqual(samples.after.actor, samples.before.actor, "transparent artwork does not tint the visible actor");
  assert.deepEqual(samples.after.post, samples.before.post, "post pixels outside the actor remain unchanged");
  assert.deepEqual(samples.after.base, samples.before.base, "the solid post base remains unchanged");
  assert.notDeepEqual(samples.fade.center, [160, 64, 32, 255], "the overlap is locally softened");
  assert.deepEqual(samples.fade.outside, [160, 64, 32, 255], "unrelated roof pixels remain opaque");
  assert.deepEqual(samples.fade.base, [160, 64, 32, 255], "the grounded portion stays opaque");
  assert.notDeepEqual(samples.treeAfter.side, samples.treeBefore.side, "lower side foliage reveals the obscured actor");
  assert.deepEqual(samples.treeAfter.trunk, samples.treeBefore.trunk, "the tree trunk stays opaque");
  assert.deepEqual(samples.treeAfter.base, samples.treeBefore.base, "the tree base stays opaque");
  assert.deepEqual(samples.treeAfter.outside, samples.treeBefore.outside, "foliage outside the actor remains unchanged");
  assert.deepEqual(samples.mismatches, [], "terrain and sprite raster pixels remain aligned across camera fractions and HUD pan");
  console.log("[elderhall-depth-pixels] local compositing and 784 camera raster samples passed");
} finally {
  await browser.close();
}
