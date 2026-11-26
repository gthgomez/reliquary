import assert from "node:assert/strict";
import { test } from "node:test";
import { collectGameAssets, isEssentialWorldAsset } from "./assets.ts";
import { ReliquaryGame } from "./engine.ts";
import { serializeSave } from "./save.ts";

type FakeImage = { url: string; requestUrl: string; abandoned: boolean; onload?: () => void; onerror?: () => void; src: string };

async function withImages(run: (game: ReliquaryGame, pending: FakeImage[]) => Promise<void>, saveSource = { getItem: () => null as string | null }) {
  const globals = globalThis as Record<string, unknown>;
  const names = ["window", "document", "Image", "requestAnimationFrame", "cancelAnimationFrame"];
  const previous = names.map((name) => [name, globals[name]] as const);
  const pending: FakeImage[] = [];
  globals.window = { addEventListener() {}, removeEventListener() {} };
  globals.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  globals.Image = class {
    url = "";
    requestUrl = "";
    abandoned = false;
    onload?: () => void;
    onerror?: () => void;
    set src(url: string) {
      this.requestUrl = url;
      this.url = url.split("?")[0]!;
      pending.push(this);
    }
    removeAttribute() { this.abandoned = true; }
  };
  globals.requestAnimationFrame = () => 1;
  globals.cancelAnimationFrame = () => {};
  const game = new ReliquaryGame({ readOnlySaveSource: saveSource });
  try {
    await run(game, pending);
  } finally {
    game.destroy();
    for (const [name, value] of previous) {
      if (value === undefined) delete globals[name];
      else globals[name] = value;
    }
  }
}

function settleWorld(pending: FakeImage[], failureUrl?: string) {
  const required = new Set(collectGameAssets().filter(isEssentialWorldAsset).map((entry) => entry.url));
  for (const image of pending) {
    if (!required.has(image.url)) continue;
    if (image.url === failureUrl) image.onerror?.();
    else image.onload?.();
  }
}

test("pending world art blocks Start and Continue without touching the save source", async () => {
  let reads = 0;
  await withImages(async (game, pending) => {
    const before = reads;
    const boot = game.boot({ width: 0, height: 0 } as HTMLCanvasElement);
    game.startNew();
    game.continueGame();
    assert.equal(game.mode, "title");
    assert.equal(game.dialog, null);
    assert.equal(reads, before, "Continue does not inspect or rewrite a save while waiting");
    assert.ok(pending.length > 0);
    settleWorld(pending);
    await boot;
    assert.equal(game.worldAssetsReady, true);
    assert.equal(game.mode, "title");
  }, { getItem: () => { reads++; return null; } });
});

test("an essential image failure blocks entry and retry recovers without changing the save", async () => {
  await withImages(async (game, pending) => {
    const bedUrl = "/game/props/bed.png";
    const boot = game.boot({ width: 0, height: 0 } as HTMLCanvasElement);
    settleWorld(pending, bedUrl);
    await boot;
    assert.equal(game.worldAssetsReady, false);
    assert.deepEqual(game.worldAssetFailures, [bedUrl]);
    game.startNew();
    assert.equal(game.mode, "title");
    assert.equal(game.mapId, "elderhall");
    const retry = game.retryWorldAssets();
    const failedBeds = pending.filter((image) => image.url === bedUrl);
    const failedBed = failedBeds[failedBeds.length - 1]!;
    assert.ok(failedBed);
    failedBed.onload?.();
    await retry;
    assert.equal(game.worldAssetsReady, true);
    game.startNew();
    assert.equal(game.mode, "world");
  });
});

test("ready Continue resumes the saved map after world art is available", async () => {
  let saveText: string | null = null;
  let reads = 0;
  await withImages(async (game, pending) => {
    saveText = serializeSave(game.currentSave());
    reads = 0;
    const boot = game.boot({ width: 0, height: 0 } as HTMLCanvasElement);
    settleWorld(pending);
    await boot;
    game.continueGame();
    assert.equal(game.mode, "world");
    assert.equal(game.mapId, "elderhall");
    assert.ok(reads > 0, "Continue reads the saved journey after readiness");
  }, { getItem: () => { reads++; return saveText || null; } });
});

test("a world failure unlocks retry even while another essential image stays pending", async () => {
  await withImages(async (game, pending) => {
    const failedUrl = "/game/props/bed.png";
    const hangingUrl = "/game/props/boulder.png";
    const boot = game.boot({ width: 0, height: 0 } as HTMLCanvasElement);
    const required = new Set(collectGameAssets().filter(isEssentialWorldAsset).map((entry) => entry.url));
    for (const image of pending) {
      if (!required.has(image.url)) continue;
      if (image.url === failedUrl) image.onerror?.();
      else if (image.url !== hangingUrl) image.onload?.();
    }
    await boot;
    assert.ok(game.worldAssetFailures.includes(failedUrl));
    assert.equal(game.worldAssetsLoading, false, "failure is published without waiting for the hanging image");

    const retryStart = pending.length;
    const retry = game.retryWorldAssets();
    assert.equal(pending.find((image) => image.url === hangingUrl)?.abandoned, true,
      "retry detaches the previous attempt's pending image");
    assert.deepEqual(game.getSnapshot().worldAssetFailures, [], "retry clears the prior failure immediately");
    assert.equal(game.getSnapshot().worldAssetsLoading, true, "retry progress is published immediately");
    const retryImages = pending.slice(retryStart);
    assert.notEqual(retryImages.find((image) => image.url === hangingUrl)?.requestUrl, hangingUrl,
      "retry does not reuse the hung image request");
    for (const image of retryImages) {
      if (image.url === failedUrl || image.url === hangingUrl) image.onload?.();
    }
    await retry;
    assert.equal(game.worldAssetsReady, true);
  });
});

test("required battle art failure is reported but optional art failure is ignored", async () => {
  await withImages(async (game, pending) => {
    const assets = collectGameAssets();
    const battleAsset = assets.find((entry) => entry.key.startsWith("sprite_") && !isEssentialWorldAsset(entry));
    const optionalAsset = assets.find((entry) => !entry.required);
    assert.ok(battleAsset);
    assert.ok(optionalAsset);
    const boot = game.boot({ width: 0, height: 0 } as HTMLCanvasElement);
    settleWorld(pending);
    await boot;
    const battleImage = pending.find((image) => image.url === battleAsset.url)!;
    const optionalImage = pending.find((image) => image.url === optionalAsset.url)!;
    game.startNew();
    battleImage.onerror?.();
    optionalImage.onerror?.();
    assert.equal(game.mode, "world", "a battle-only failure does not eject an active player");
    assert.equal(game.worldAssetsReady, true, "battle art does not block the ready world");
    assert.ok(game.assetFailures.includes(battleAsset.url));
    assert.equal(game.assetFailures.includes(optionalAsset.url), false);

    const retryStart = pending.length;
    const retry = game.retryWorldAssets();
    assert.equal(game.worldAssetsReady, true, "retrying battle art preserves world readiness");
    const engineWarp = game as unknown as { warp: (to: string, x: number, y: number, dir: 0) => void };
    engineWarp.warp("grove", 4, 4, 0);
    assert.equal(game.mapId, "grove", "later map transitions remain available during battle art retry");
    const retryBattleImage = pending.slice(retryStart).find((image) => image.url === battleAsset.url)!;
    retryBattleImage.onload?.();
    await retry;
    assert.equal(game.worldAssetsReady, true);
    assert.equal(game.mode, "world");
  });
});

test("a solid Grove starter sprite is required world art", async () => {
  await withImages(async (game, pending) => {
    const starterUrl = "/game/sprites/emberkit.png";
    assert.equal(isEssentialWorldAsset(collectGameAssets().find((entry) => entry.url === starterUrl)!), true);
    const boot = game.boot({ width: 0, height: 0 } as HTMLCanvasElement);
    settleWorld(pending, starterUrl);
    await boot;
    assert.equal(game.worldAssetsReady, false);
    assert.ok(game.worldAssetFailures.includes(starterUrl));
  });
});

test("destroyed loads cannot mark a restarted game ready", async () => {
  await withImages(async (game, pending) => {
    const firstBoot = game.boot({ width: 0, height: 0 } as HTMLCanvasElement);
    const oldImages = [...pending];
    game.destroy();
    const secondBoot = game.boot({ width: 0, height: 0 } as HTMLCanvasElement);
    settleWorld(oldImages);
    assert.equal(game.worldAssetsReady, false);
    settleWorld(pending.slice(oldImages.length));
    await Promise.all([firstBoot, secondBoot]);
    assert.equal(game.worldAssetsReady, true);
  });
});

test("teardown from a loading subscriber does not start obsolete image requests", async () => {
  await withImages(async (game, pending) => {
    game.subscribe(() => {
      if (game.getSnapshot().worldAssetsLoading) game.destroy();
    });
    await game.boot({ width: 0, height: 0 } as HTMLCanvasElement);
    assert.equal(game.lifecycle, "stopped");
    assert.equal(pending.length, 0);
  });
});

test("revision-5 building art is part of the essential world readiness set", async () => {
  const old = process.env.VITE_ELDERHALL_CANDIDATE;
  process.env.VITE_ELDERHALL_CANDIDATE = "1";
  try {
    const candidate = collectGameAssets();
    const cottage = candidate.find((entry) => entry.key === "prop_elderhall-cottage-reference");
    assert.ok(cottage);
    assert.equal(isEssentialWorldAsset(cottage), true);
    await withImages(async (game, pending) => {
      const boot = game.boot({ width: 0, height: 0 } as HTMLCanvasElement);
      settleWorld(pending, cottage.url);
      await boot;
      assert.equal(game.worldAssetsReady, false);
      assert.ok(game.worldAssetFailures.includes(cottage.url));
      assert.equal(game.mode, "title");
    });
  } finally {
    if (old === undefined) delete process.env.VITE_ELDERHALL_CANDIDATE;
    else process.env.VITE_ELDERHALL_CANDIDATE = old;
  }
});
