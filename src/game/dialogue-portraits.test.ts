import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame } from "./engine.ts";
import { makeBeast } from "./content.ts";

/**
 * Dialogue flow with portrait metadata: NPC identity threads from the map
 * placement through talk()/openDialog() into the snapshot, choice dialogs
 * keep their confirm/cancel semantics, and non-NPC dialog stays text-only.
 */

async function withGame(run: (game: ReliquaryGame, frame: (ts: number) => void) => void) {
  const globals = globalThis as Record<string, unknown>;
  const names = [
    "window",
    "document",
    "Image",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "localStorage",
    "HTMLElement",
  ];
  const previous = names.map((name) => [name, globals[name]] as const);
  let callback: (ts: number) => void = () => {};
  const events = new Map<string, EventListener>();
  globals.window = {
    addEventListener: (name: string, fn: EventListener) => events.set(name, fn),
    removeEventListener() {},
  };
  globals.document = {
    visibilityState: "visible",
    addEventListener: (name: string, fn: EventListener) => events.set(name, fn),
    removeEventListener() {},
  };
  globals.HTMLElement = class {};
  globals.Image = class {
    onload?: () => void;
    set src(_: string) {
      queueMicrotask(() => this.onload?.());
    }
  };
  globals.requestAnimationFrame = (fn: (ts: number) => void) => {
    callback = fn;
    return 1;
  };
  globals.cancelAnimationFrame = () => {};
  globals.localStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
  };
  const game = new ReliquaryGame({ random: () => 0.5 });
  try {
    await game.boot({
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement);
    run(game, (ts) => callback(ts));
  } finally {
    game.destroy();
    for (const [name, value] of previous) {
      if (value === undefined) delete globals[name];
      else globals[name] = value;
    }
  }
}

function talk(
  game: ReliquaryGame,
  id: string,
  name: string,
  npc?: { npcId: string; sprite: string },
): void {
  (
    game as unknown as {
      talk(id: string, name: string, npc?: { npcId: string; sprite: string }): void;
    }
  ).talk(id, name, npc);
}

test("interact threads the placed NPC identity into dialog state", async () => {
  await withGame((game) => {
    game.mode = "world";
    // Elder Maren stands at elderhall (7, 9); stand one tile below, facing up.
    game.tx = 7;
    game.ty = 10;
    game.dir = 3;
    game.confirm();
    const d = game.getSnapshot().dialog;
    assert.ok(d, "dialog opened by interact");
    assert.equal(d!.speaker, "Elder Maren");
    assert.equal(d!.npcId, "maren", "stable npc id, not the display name");
    assert.equal(d!.portraitKey, "elder-maren", "authored artwork for Maren");
    assert.equal(d!.last, false, "first of two pages");
    game.confirm();
    assert.equal(game.getSnapshot().dialog!.last, true);
    game.confirm();
    assert.equal(game.getSnapshot().dialog, null, "dialog closes on the last page");
  });
});

test("Warden Cael keeps his choice semantics and portrait through confirm and cancel", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.mapId = "thornkeep";
    game.flags.starter = true;
    game.party = [makeBeast("emberkit", 5)];
    // Warden Cael stands at thornkeep (11, 6); stand below, facing up.
    game.tx = 11;
    game.ty = 7;
    game.dir = 3;

    game.confirm();
    const d = game.getSnapshot().dialog;
    assert.ok(d);
    assert.equal(d!.speaker, "Warden Cael");
    assert.equal(d!.npcId, "cael");
    assert.equal(d!.portraitKey, "warden-cael");

    // Cancel declines the trial: dialog closes, no battle, no onDone side effects.
    game.cancel();
    assert.equal(game.getSnapshot().dialog, null);
    assert.equal(game.battle, null, "cancel must not start the trial");

    // Confirm through all three pages accepts and starts the trial battle.
    game.confirm(); // reopen via interact
    assert.equal(game.getSnapshot().dialog!.portraitKey, "warden-cael");
    game.confirm(); // page 2
    game.confirm(); // page 3 (last)
    game.confirm(); // close and run onDone: startWarden
    assert.equal(game.getSnapshot().dialog, null);
    assert.equal(game.battle!.kind, "trial", "confirm on the last page runs onDone");
    game.battle = null;
    game.mode = "world";
  });
});

test("inn rest offer keeps the portrait through the onDone callback", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.gold = 100;
    talk(game, "innkeep", "Innmother Cald", { npcId: "innkeep", sprite: "innkeep" });
    const d = game.getSnapshot().dialog;
    assert.ok(d);
    assert.equal(d!.portraitKey, "innkeep", "cohesive fallback for Innmother Cald");
    assert.match(d!.text, /A rest · B not now/);

    game.confirm(); // accept: charges 15 and reopens as Innmother Cald
    assert.equal(game.gold, 85);
    const after = game.getSnapshot().dialog;
    assert.ok(after);
    assert.equal(after!.speaker, "Innmother Cald");
    assert.equal(after!.portraitKey, "innkeep", "portrait survives the onDone chain");
    assert.equal(after!.npcId, "innkeep");
  });
});

test("goblin trader Patch resolves by npc id, not his reused shopkeep sprite", async () => {
  await withGame((game) => {
    game.mode = "world";
    talk(game, "goblin_trader", "Patch", { npcId: "goblin_trader", sprite: "shopkeep" });
    const d = game.getSnapshot().dialog;
    assert.ok(d);
    assert.equal(d!.npcId, "goblin_trader");
    assert.equal(d!.portraitKey, "patch");
    assert.notEqual(d!.portraitKey, "shopkeep");
  });
});

test("unlisted npc id falls back to the sprite kind; unknown identity is text-only", async () => {
  await withGame((game) => {
    game.mode = "world";
    // Known talk script, unknown placement id: the sprite kind decides the sigil.
    talk(game, "guard", "Mystery Guard", { npcId: "mystery", sprite: "guard" });
    assert.equal(game.getSnapshot().dialog!.portraitKey, "guard");
    assert.equal(game.getSnapshot().dialog!.npcId, "mystery");
    game.cancel(); // guard script has no onDone: cancel advances and closes

    // Unknown sprite kind alongside an unknown id: never a guessed portrait.
    game.openDialog("Stranger", ["The road is quiet."], undefined, {
      npcId: "mystery",
      sprite: "martian",
    });
    assert.equal(game.getSnapshot().dialog!.portraitKey, null);

    // No identity at all: narrator text-only.
    game.openDialog("Sign", ["BRIAR ROAD"]);
    assert.equal(game.getSnapshot().dialog!.portraitKey, null);
    assert.equal(game.getSnapshot().dialog!.npcId, null);
  });
});

test("narrator, sign and object dialog stay text-only", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.openDialog("Sign", ["BRIAR ROAD — north to Wildwood."]);
    let d = game.getSnapshot().dialog;
    assert.equal(d!.npcId, null);
    assert.equal(d!.portraitKey, null);

    game.openDialog("", ["You rest. The lantern ticks."]);
    d = game.getSnapshot().dialog;
    assert.equal(d!.npcId, null);
    assert.equal(d!.portraitKey, null);
  });
});

test("gateward warp warning carries the guard portrait", async () => {
  await withGame((game, frame) => {
    game.mode = "world";
    game.flags = {};
    // Stand just inside the elderhall north warp, facing up into it.
    game.tx = 11;
    game.ty = 1;
    game.dir = 3;
    game.setKeys(["KeyW"]);
    frame(16);
    const d = game.getSnapshot().dialog;
    assert.ok(d, "warp block opens Gateward's warning");
    assert.equal(d!.speaker, "Gateward");
    assert.equal(d!.npcId, "guard");
    assert.equal(d!.portraitKey, "guard");
    game.setKeys([]);
  });
});

test("starter pact follow-up reopens as Elder Maren with her portrait", async () => {
  await withGame((game) => {
    game.mode = "world";
    (game as unknown as { chooseStarter(id: string): void }).chooseStarter("emberkit");
    const offer = game.getSnapshot().dialog;
    assert.ok(offer);
    assert.equal(offer!.speaker, "Emberkit", "creature offer stays text-only");
    assert.equal(offer!.portraitKey, null);

    game.confirm(); // bind
    game.confirm(); // close species pages, run onDone
    const after = game.getSnapshot().dialog;
    assert.ok(after, "Maren speaks after the pact");
    assert.equal(after!.speaker, "Elder Maren");
    assert.equal(after!.npcId, "maren");
    assert.equal(after!.portraitKey, "elder-maren");
    assert.equal(game.flags.starter, true);
    assert.equal(game.party[0]!.speciesId, "emberkit");
  });
});

test("starter inspection shows current skills and cancel leaves the pact unchosen", async () => {
  await withGame((game) => {
    game.mode = "world";
    for (const [id, element, skill] of [["emberkit", "Ember", "Cinder"], ["mirewhelp", "Tide", "Torrent"], ["briarling", "Verdant", "Rootgrasp"]] as const) {
      (game as unknown as { chooseStarter(id: string): void }).chooseStarter(id);
      game.confirm();
      const text = game.getSnapshot().dialog?.text ?? "";
      assert.match(text, new RegExp(element));
      assert.match(text, new RegExp(skill));
      game.cancel();
      assert.equal(game.flags.starter, undefined);
      assert.equal(game.party.length, 0);
    }
  });
});

test("alternate placements preserve identity, including inn success and insufficient funds", async () => {
  await withGame((game) => {
    game.mode = "world";
    for (const [map, x, y, npcId, portrait] of [
      ["guild_in", 6, 7, "maren2", "elder-maren"],
      ["warden_hall", 7, 5, "cael_hall", "warden-cael"],
    ] as const) {
      game.mapId = map;
      game.tx = x;
      game.ty = y;
      game.dir = 3;
      game.confirm();
      assert.equal(game.getSnapshot().dialog!.npcId, npcId);
      assert.equal(game.getSnapshot().dialog!.portraitKey, portrait);
      while (game.getSnapshot().dialog) game.confirm();
    }
    for (const gold of [0, 100]) {
      game.gold = gold;
      talk(game, "innkeep", "Innmother", { npcId: "keep_innkeep", sprite: "innkeep" });
      game.cancel();
      assert.equal(game.gold, gold, "cancel never charges");
      assert.equal(game.getSnapshot().dialog, null);
      talk(game, "innkeep", "Innmother", { npcId: "keep_innkeep", sprite: "innkeep" });
      game.confirm();
      assert.equal(game.getSnapshot().dialog!.speaker, "Innmother");
      assert.equal(game.getSnapshot().dialog!.npcId, "keep_innkeep");
      assert.equal(game.getSnapshot().dialog!.portraitKey, "innkeep");
      assert.equal(game.gold, gold ? gold - 15 : 0);
      game.confirm();
      assert.equal(game.getSnapshot().dialog, null);
    }
  });
});

test("trial victory keeps Cael's identity and executes the ending once", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.flags.trial = true;
    const victory = () => (game as unknown as { maybeVictory(): string }).maybeVictory();
    assert.equal(victory(), "world");
    for (let page = 0; page < 3; page++) {
      assert.equal(game.getSnapshot().dialog!.portraitKey, "warden-cael");
      assert.equal(game.getSnapshot().dialog!.npcId, "cael");
      game.confirm();
    }
    assert.equal(game.getSnapshot().dialog, null);
    assert.equal(game.mode, "victory");
    victory();
    assert.equal(game.getSnapshot().dialog, null, "ending is not replayed");
  });
});

test("shopkeepers still open the shop directly; display names cannot select artwork", async () => {
  await withGame((game) => {
    game.mode = "world";
    talk(game, "shopkeep", "Calder", { npcId: "shopkeep", sprite: "shopkeep" });
    assert.equal(game.mode, "shop");
    assert.equal(game.getSnapshot().dialog, null);
    game.openDialog("Elder Maren", ["System text with a familiar name."]);
    assert.equal(game.getSnapshot().dialog!.portraitKey, null);
  });
});
