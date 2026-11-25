import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame, TILE } from "../engine.ts";
import { makeBeast } from "../content.ts";
import { MAPS } from "../maps.ts";
import { ELDERHALL_WORLD_REVISION } from "../build-flags.ts";
import { isOccupied } from "./movement.ts";

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

test("known painted door tiles enter, and the neighboring side tiles do not", async () => {
  await withGame((game, frame) => {
    let ts = 16;
    const centerX = ELDERHALL_WORLD_REVISION === 5;
    const doors = [
      ["h_home", "elderhall", centerX ? 5 : 4, 14, "home"],
      ["h_guild", "elderhall", centerX ? 5 : 4, 8, "guild_in"],
      ["h_inn", "elderhall", 16, 4, "inn_in"],
      ["h_shop", "elderhall", centerX ? 17 : 16, 8, "shop_in"],
      ["k_inn", "thornkeep", 4, 4, "keep_inn"],
      ["k_hall", "thornkeep", 14, 4, "warden_hall"],
      ["k_shop", "thornkeep", 14, 9, "keep_shop"],
    ] as const;
    for (const [id, mapId, doorX, doorY, destination] of doors) {
      const map = Object.values(MAPS).find((entry) => entry.objects.some((object) => object.id === id));
      assert.ok(map, id);
      assert.equal(map.id, mapId);
      const house = map.objects.find((object) => object.id === id)!;
      assert.ok(house.autoEnter && house.interact);
      stand(game, map.id, doorX, doorY + 1);
      game.setKeys(["KeyW"]);
      frame(ts);
      ts += 16;
      assert.equal(game.mapId, destination, `${id} door`);
      game.setKeys([]);
      frame(ts);
      ts += 16;
    }

    const home = MAPS.elderhall.objects.find((object) => object.id === "h_home")!;
    const doorX = centerX ? 5 : 4;
    for (const x of [doorX - 1, doorX + 1]) {
      stand(game, "elderhall", x, 15);
      game.setKeys(["KeyW"]);
      frame(ts);
      ts += 16;
      assert.equal(game.mapId, "elderhall", `approaching side tile ${x} does not enter`);
      assert.equal(game.dialog, null);
    }
    assert.equal(home.interactZone?.x, centerX ? 1 : 0, "house targeting follows this world revision");
  });
});

test("a doorway warp ignores auto-entry until the movement key is released, and confirm still enters", async () => {
  await withGame((game, frame) => {
    const x = ELDERHALL_WORLD_REVISION === 5 ? 5 : 4;
    const y = 15;
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

test("Elderhall inn rejects side entry in the candidate while preserving revision-2 behavior", async () => {
  const candidate = ELDERHALL_WORLD_REVISION === 5;
  assert.equal(isOccupied(MAPS.elderhall, {}, 15, 4), false, "the west approach is walkable");

  await withGame((game, frame) => {
    stand(game, "elderhall", 15, 4);
    game.setKeys(["KeyD"]);
    frame(16);
    assert.equal(game.mapId, candidate ? "elderhall" : "inn_in", "movement from west follows this revision's door contract");
  });

  await withGame((game) => {
    stand(game, "elderhall", 15, 4);
    game.dir = 2;
    game.confirm();
    assert.equal(game.mapId, candidate ? "elderhall" : "inn_in", "confirm from west follows this revision's door contract");

    stand(game, "elderhall", 16, 5);
    game.dir = 3;
    game.confirm();
    assert.equal(game.mapId, "inn_in", "confirm from the south still enters the inn");
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

test("starting forward movement clears a stationary interaction hint immediately", async () => {
  await withGame((game, frame) => {
    const sign = MAPS.elderhall.objects.find((object) => object.id === "sign_w")!;
    const wasSolid = sign.solid;
    try {
      sign.solid = false;
      game.mode = "world";
      window.__controlsTest?.warp?.("elderhall", 2, 7);
      frame(16);
      assert.equal(isOccupied(MAPS.elderhall, {}, 2, 8), false, "the test sign tile is walkable");
      assert.match(game.getSnapshot().interactionHint ?? "", /Read sign.*Z or Enter; tap A/,
        "settling beside the sign publishes its genuine contextual hint");
      game.setKeys(["KeyS"]);
      frame(32);
      assert.equal(game.moving, true);
      assert.equal(game.getSnapshot().interactionHint, null);
    } finally {
      sign.solid = wasSolid;
    }
  });
});

test("completed starter choices lose the hint without changing confirm behavior", async () => {
  await withGame((game, frame) => {
    game.flags.starter = true;
    game.party = [makeBeast("emberkit", 5, { random: () => 0.5 })];
    game.mode = "world";
    assert.equal(isOccupied(MAPS.grove, game.flags, 4, 7), false, "the tile south of the starter is walkable");
    window.__controlsTest?.warp?.("grove", 4, 8);
    game.setKeys(["KeyW"]);
    frame(16);
    game.setKeys([]);
    for (const ts of [32, 64, 96, 128, 160, 192, 224]) frame(ts);
    assert.equal(game.mapId, "grove");
    assert.deepEqual({ x: game.tx, y: game.ty }, { x: 4, y: 7 }, "the northbound step settles south of the starter");
    assert.equal(game.moving, false, "the player is settled after releasing movement");
    assert.equal(game.dir, 3, "the player is still facing the completed starter object");
    assert.equal(game.getSnapshot().interactionHint, null, "completed starter objects are not advertised");
    game.confirm();
    assert.match(game.getSnapshot().dialog?.text ?? "", /pact is already spoken/i,
      "confirm retains the existing completed-choice response");
  });
});

test("leaving each interior returns to its revision's painted door approach", async () => {
  await withGame((game, frame) => {
    const centerX = ELDERHALL_WORLD_REVISION === 5;
    for (const [mapId, insideX, insideY, x, y] of [["home", 5, 7, centerX ? 5 : 4, 15],
      ["guild_in", 6, 9, centerX ? 5 : 4, 9], ["shop_in", 5, 7, centerX ? 17 : 16, 9],
      ["inn_in", 6, 8, 16, 5]] as const) {
      stand(game, mapId, insideX, insideY);
      game.dir = 0;
      game.setKeys(["KeyS"]);
      frame(16);
      assert.equal(game.mapId, "elderhall", `${mapId} returns outside`);
      assert.deepEqual({ x: game.tx, y: game.ty }, { x, y }, `${mapId} lands at its doorway approach`);
      game.setKeys([]);
      frame(32);
    }
  });
});
