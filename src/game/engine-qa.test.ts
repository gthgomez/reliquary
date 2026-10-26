import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame } from "./engine.ts";
import { makeBeast } from "./content.ts";
import { SAVE_KEY } from "./save.ts";

async function withGame(
  run: (
    game: ReliquaryGame,
    frame: (ts: number) => void,
    events: Map<string, EventListener>,
  ) => void,
) {
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
    run(game, (ts) => callback(ts), events);
  } finally {
    game.destroy();
    for (const [name, value] of previous) {
      if (value === undefined) delete globals[name];
      else globals[name] = value;
    }
  }
}

test("toast expiry reaches the subscribed UI without another input", async () => {
  await withGame((game, frame) => {
    game.toastMsg("Temporary");
    for (let ts = 100; ts <= 2600; ts += 100) frame(ts);
    assert.equal(game.toast, null);
    assert.equal(game.getSnapshot().toast, null);
  });
});

test("hiding the title never writes over an existing playthrough", async () => {
  await withGame((game, frame, events) => {
    let writes = 0;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => null,
      setItem: () => {
        writes++;
      },
    };
    Object.assign(document, { visibilityState: "hidden" });
    events.get("visibilitychange")!(new Event("visibilitychange"));
    frame(16);
    frame(32);
    assert.equal(writes, 0);
    assert.equal(game.playTime, 0);
  });
});

test("keyboard repeat cannot toggle the menu repeatedly", async () => {
  await withGame((game, _frame, events) => {
    game.mode = "world";
    const keydown = events.get("keydown")!;
    const event = { code: "KeyM", target: null, repeat: false, preventDefault() {} };
    keydown(event as unknown as Event);
    assert.equal(game.menu, "root");
    keydown({ ...event, repeat: true } as unknown as Event);
    assert.equal(game.menu, "root");
  });
});

test("the Storage menu entry opens storage", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "root";
    game.menuIndex = 1;
    game.menuConfirm();
    assert.equal(game.menu, "storage");
  });
});

test("practice trains a capable party creature and charges only on success", async () => {
  await withGame((game) => {
    const beast = makeBeast("emberkit", 5);
    game.party = [beast];
    game.mode = "battle";
    game.menu = "party";
    game.gold = 100;
    game.trainCreature(beast.uid);
    assert.equal(game.gold, 100);
    assert.equal(beast.exp, 0);
    game.mode = "world";
    game.trainCreature(beast.uid);
    assert.equal(game.gold, 55);
    assert.ok(beast.exp > 0 || beast.level > 5);
    beast.hp = 0;
    game.trainCreature(beast.uid);
    assert.equal(game.gold, 55);
  });
});

test("multiple evolutions in one award record every form in the Reliquary", async () => {
  await withGame((game) => {
    const beast = makeBeast("emberkit", 5);
    (game as unknown as { grantXp(target: typeof beast, xp: number): void }).grantXp(
      beast,
      1_000_000,
    );
    assert.equal(game.caught.pyrefox, true);
    assert.equal(game.caught.crownwyrm, true);
    assert.equal(game.seen.pyrefox, true);
    assert.equal(game.seen.crownwyrm, true);
  });
});

test("failed persistence never advertises an available save", async () => {
  await withGame((game) => {
    assert.equal(game.hasSave, false);
    game.persist();
    assert.equal(game.hasSave, false);
    assert.match(game.getSnapshot().toast ?? "", /save.*fail|could not.*save|couldn't.*save/i);
  });
});

test("focused buttons keep native activation but suppress held Enter", async () => {
  await withGame((_game, _frame, events) => {
    const target = Object.assign(new HTMLElement(), {
      closest: (selector: string) => (selector === "button" ? target : null),
    });
    let prevented = 0;
    const event = {
      target,
      code: "Enter",
      repeat: false,
      preventDefault() {
        prevented++;
      },
    };
    events.get("keydown")!(event as unknown as Event);
    assert.equal(prevented, 0);
    events.get("keydown")!({ ...event, repeat: true } as unknown as Event);
    assert.equal(prevented, 1);
  });
});

test("successful persistence advertises Continue and returns true", async () => {
  await withGame((game) => {
    const slots = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (key: string) => slots.get(key) ?? null,
      setItem: (key: string, value: string) => slots.set(key, value),
      removeItem: (key: string) => slots.delete(key),
    };
    assert.equal(game.persist(), true);
    assert.equal(game.hasSave, true);
    assert.ok(slots.has(SAVE_KEY));
  });
});

test("fainted active beast remains selected until the survivor is confirmed", async () => {
  await withGame((game) => {
    game.party = [makeBeast("emberkit", 5), makeBeast("mirewhelp", 5)];
    window.__controlsTest!.startWild!();
    game.party[0]!.hp = 0;
    (game as unknown as { playerDown(): void }).playerDown();
    assert.equal(game.battle!.phase, "party");
    assert.equal(game.battle!.playerIndex, 0);
    assert.equal(game.battle!.menuIndex, 1);
    game.cancel();
    assert.equal(game.battle!.phase, "party");
  });
});

test("foe retaliation targets the incoming beast on a voluntary switch", async () => {
  await withGame((game) => {
    game.party = [makeBeast("emberkit", 5), makeBeast("mirewhelp", 5)];
    window.__controlsTest!.startWild!();
    const outgoingHp = game.party[0]!.hp;
    const incomingHp = game.party[1]!.hp;
    (game as unknown as { playerAction(act: { type: string; index: number }): void }).playerAction({
      type: "switch",
      index: 1,
    });
    assert.equal(game.party[0]!.hp, outgoingHp);
    assert.ok(game.party[1]!.hp < incomingHp);
  });
});

test("failed binding remains visible alongside the foe's response", async () => {
  await withGame((game, frame) => {
    game.party = [makeBeast("emberkit", 5)];
    window.__controlsTest!.startWild!();
    (game as unknown as { tryCatch(item: string): void }).tryCatch("common_sigil");
    for (let ts = 100; ts <= 3000; ts += 100) frame(ts);
    assert.match(game.battle!.log.join(" "), /breaks the sigil/);
  });
});

test("terrain is reused between frames and rebuilt when the map changes", async () => {
  await withGame((game, frame) => {
    let terrainDraws = 0;
    let visibleDraws = 0;
    const ground = {
      drawImage() {
        terrainDraws++;
      },
      fillRect() {},
    };
    const canvas = { getContext: () => ground, width: 0, height: 0 };
    Object.assign(document, { createElement: () => canvas });
    const screen = {
      drawImage() {
        visibleDraws++;
      },
      fillRect() {},
    };
    game.canvas = { getContext: () => screen } as unknown as HTMLCanvasElement;
    game.mode = "world";
    frame(16);
    const first = terrainDraws;
    assert.ok(first > 100);
    assert.ok(visibleDraws < 30, `${visibleDraws} visible image draws`);
    frame(32);
    assert.equal(terrainDraws, first);
    window.__controlsTest!.warp!("wildwood", 8, 10);
    frame(48);
    assert.ok(terrainDraws > first);
  });
});
