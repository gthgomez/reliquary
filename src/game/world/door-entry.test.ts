import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame, TILE } from "../engine.ts";
import { MAPS } from "../maps.ts";
import { WARP_TABLE } from "./interactions.ts";

async function withGame(run: (game: ReliquaryGame, frame: (ts: number) => void) => void) {
  const globals = globalThis as Record<string, unknown>;
  const names = ["window", "document", "Image", "requestAnimationFrame", "cancelAnimationFrame", "HTMLElement"];
  const previous = names.map((name) => [name, globals[name]] as const);
  let rafCallback: (ts: number) => void = () => {};
  globals.window = { addEventListener() {}, removeEventListener() {} };
  globals.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  globals.HTMLElement = class {};
  globals.Image = class {
    onload?: () => void;
    set src(_: string) {
      queueMicrotask(() => this.onload?.());
    }
  };
  globals.requestAnimationFrame = (fn: (ts: number) => void) => {
    rafCallback = fn;
    return 1;
  };
  globals.cancelAnimationFrame = () => {};
  const game = new ReliquaryGame({ random: () => 0.5 });
  try {
    await game.boot({ width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement);
    run(game, (ts) => rafCallback(ts));
  } finally {
    game.destroy();
    for (const [name, value] of previous) {
      if (value === undefined) delete globals[name];
      else globals[name] = value;
    }
  }
}

function stand(game: ReliquaryGame, mapId: string, x: number, y: number) {
  game.mode = "world";
  game.dialog = null;
  game.menu = null;
  game.moving = false;
  game.mapId = mapId;
  game.tx = x;
  game.ty = y;
  game.px = x * TILE;
  game.py = y * TILE;
  game.dir = 3;
}

test("walking into a painted door enters, and the neighboring wall does not", async () => {
  await withGame((game, frame) => {
    let ts = 16;
    for (const id of ["h_home", "h_guild", "h_inn", "h_shop", "k_inn", "k_hall", "k_shop"]) {
      const map = Object.values(MAPS).find((entry) => entry.objects.some((object) => object.id === id));
      assert.ok(map, id);
      const house = map.objects.find((object) => object.id === id)!;
      const zone = house.interactZone;
      assert.ok(zone && house.autoEnter && house.interact);
      const doorX = house.x + zone.x;
      const doorY = house.y + zone.y;
      stand(game, map.id, doorX, doorY + 1);
      game.setKeys(["KeyW"]);
      frame(ts);
      ts += 16;
      assert.equal(game.mapId, WARP_TABLE[house.interact]!.to, `${id} door`);
      game.setKeys([]);
      frame(ts);
      ts += 16;
    }

    const home = MAPS.elderhall.objects.find((object) => object.id === "h_home")!;
    stand(game, "elderhall", home.x + home.w - 1, home.y + home.h);
    game.setKeys(["KeyW"]);
    frame(ts);
    assert.equal(game.mapId, "elderhall", "the tile beside the painted door is a wall");
    assert.equal(game.dialog, null);
  });
});

test("a doorway warp ignores auto-entry until the movement key is released, and confirm still enters", async () => {
  await withGame((game, frame) => {
    const home = MAPS.elderhall.objects.find((object) => object.id === "h_home")!;
    const zone = home.interactZone!;
    const x = home.x + zone.x;
    const y = home.y + zone.y + 1;
    stand(game, "elderhall", x, y);
    game.setKeys(["KeyW"]);
    frame(16);
    assert.equal(game.mapId, "home");

    stand(game, "elderhall", x, y);
    game.setKeys(["KeyW"]);
    frame(32);
    assert.equal(game.mapId, "elderhall", "held Up does not immediately re-enter");

    game.confirm();
    assert.equal(game.mapId, "home", "confirm still enters while auto-entry is latched");

    stand(game, "elderhall", x, y);
    game.setKeys([]);
    frame(48);
    game.setKeys(["KeyW"]);
    frame(64);
    assert.equal(game.mapId, "home", "Up enters again after release");
  });
});

test("walking into a sign or the cellar hatch does not warp", async () => {
  await withGame((game, frame) => {
    stand(game, "elderhall", 2, 9);
    game.setKeys(["KeyW"]);
    frame(16);
    assert.equal(game.mapId, "elderhall");
    assert.equal(game.ty, 9);
    assert.equal(game.dialog, null, "a sign still needs confirm");

    stand(game, "shop_in", 8, 7);
    game.setKeys(["KeyW"]);
    frame(32);
    assert.equal(game.mapId, "shop_in");
    assert.equal(game.ty, 7, "the cellar hatch still needs confirm");
    assert.equal(game.dialog, null);
  });
});

test("leaving a building lands in front of the painted door", async () => {
  await withGame((game, frame) => {
    stand(game, "home", 5, 7);
    game.dir = 0;
    game.setKeys(["KeyS"]);
    frame(16);
    assert.equal(game.mapId, "elderhall");
    assert.deepEqual({ x: game.tx, y: game.ty }, { x: 4, y: 15 });
  });
});
