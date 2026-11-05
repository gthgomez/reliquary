import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame } from "./engine.ts";
import { currentStats, makeBeast } from "./content.ts";
import { parseSave, SAVE_BACKUP, SAVE_KEY, serializeSave } from "./save.ts";
import type { GameSave } from "./types.ts";

/** Recording SaveStorage: captures every durable byte for identity asserts. */
function makeStore(): {
  data: Map<string, string>;
  history: string[];
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  snapshot(): string;
} {
  const data = new Map<string, string>();
  const history: string[] = [];
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      history.push(`${key}=${value}`);
      data.set(key, value);
    },
    removeItem: (key: string) => {
      history.push(`-${key}`);
      data.delete(key);
    },
  };
  return { data, history, storage, snapshot: () => JSON.stringify([...data.entries()]) };
}

type BasicStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

function withLocalStorage<T>(store: BasicStorage, run: () => T): T {
  const globals = globalThis as Record<string, unknown>;
  const previous = globals.localStorage;
  globals.localStorage = store;
  try {
    return run();
  } finally {
    if (previous === undefined) delete globals.localStorage;
    else globals.localStorage = previous;
  }
}

async function withGame(run: (game: ReliquaryGame, frame: (ts: number) => void) => Promise<void> | void): Promise<void> {
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
  const frame = (ts: number): void => rafCallback(ts);
  try {
    await game.boot({ width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement);
    await run(game, frame);
  } finally {
    game.destroy();
    for (const [name, value] of previous) {
      if (value === undefined) delete globals[name];
      else globals[name] = value;
    }
  }
}

/** A valid, serializable run: produced by the engine itself, so the schema is authoritative. */
function seedOldRun(game: ReliquaryGame, store: ReturnType<typeof makeStore>): string {
  game.startNew();
  game.dialog = null;
  game.party = [makeBeast("emberkit", 5, { random: () => 0.5 })];
  game.flags.starter = true;
  game.caught.emberkit = true;
  game.seen.emberkit = true;
  game.gold = 137;
  assert.equal(game.persist(), true);
  const primary = store.data.get(SAVE_KEY);
  assert.ok(primary, "seed run must be durable");
  return primary;
}

test("S01: a denied writer's Import is refused before any slot changes and before live state is applied", async () => {
  await withGame(async (game) => {
    const store = makeStore();
    withLocalStorage(store.storage, () => {
      const oldRun = seedOldRun(game, store);
      const before = store.snapshot();
      const liveGoldBefore = game.gold;
      game.setSaveWriteAllowed(false);
      const incoming = serializeSave({ ...parseSave(oldRun)!, gold: 777 } as GameSave);
      assert.ok(incoming);
      assert.equal(game.importGame(incoming), false);
      assert.equal(store.snapshot(), before, "denied import must not touch any slot");
      assert.equal(game.gold, liveGoldBefore, "denied import must not apply live state");
      assert.equal(game.getSnapshot().toast, "Another window holds your save. This tab is read-only.");
      // Re-granting the session restores the full import path with rotation.
      game.setSaveWriteAllowed(true);
      assert.equal(game.importGame(incoming), true);
      assert.equal(game.gold, 777);
      assert.equal(store.data.get(SAVE_KEY), incoming);
      assert.equal(store.data.get(SAVE_BACKUP), oldRun, "grant restores rotation: old run to backup");
    });
  });
});

test("S01: malformed and forward-format imports are refused without writing", async () => {
  await withGame(async (game) => {
    const store = makeStore();
    withLocalStorage(store.storage, () => {
      seedOldRun(game, store);
      const before = store.snapshot();
      assert.equal(game.importGame("{not json"), false);
      assert.equal(game.importGame(JSON.stringify({ version: 99, playerName: "Future" })), false);
      assert.equal(game.importGame(JSON.stringify({ version: 3, worldRevision: 99 })), false);
      assert.equal(store.snapshot(), before);
    });
  });
});

test("S04+S30: selling through the shop adds half price once, shrinks the list, and persists immediately", async () => {
  await withGame(async (game) => {
    const store = makeStore();
    withLocalStorage(store.storage, () => {
      seedOldRun(game, store);
      game.dialog = null;
      game.mode = "shop";
      game.shopMode = "sell";
      game.inventory = { tonic: 2 };
      game.gold = 100;
      game.shopIndex = 0;
      game.shopConfirm();
      assert.equal(game.gold, 110, "sell price is floor(20/2)");
      assert.equal(game.inventory.tonic, 1);
      const durable = parseSave(store.data.get(SAVE_KEY)!);
      assert.ok(durable, "sale must checkpoint immediately");
      assert.equal(durable.gold, 110);
      assert.equal(durable.inventory.tonic, 1);
      game.shopConfirm();
      assert.equal(game.gold, 120);
      assert.equal(game.inventory.tonic, 0);
      assert.equal(game.shopIndex, 0, "last-item sale clamps the selection");
      const goldBefore = game.gold;
      game.shopConfirm();
      assert.equal(game.gold, goldBefore, "empty sell list is inert");
      assert.equal(parseSave(store.data.get(SAVE_KEY)!)?.inventory.tonic ?? 0, 0);
    });
  });
});

test("S30: buying checkpoints immediately; a denied writer reports the truth without changing slots", async () => {
  await withGame(async (game) => {
    const store = makeStore();
    withLocalStorage(store.storage, () => {
      seedOldRun(game, store);
      game.dialog = null;
      game.mode = "shop";
      game.shopMode = "buy";
      game.gold = 200;
      game.inventory = {};
      game.shopIndex = 0; // Field Tonic, 20 cr
      game.shopConfirm();
      assert.equal(game.gold, 180);
      assert.equal(game.inventory.tonic, 1);
      const durable = parseSave(store.data.get(SAVE_KEY)!);
      assert.equal(durable?.gold, 180);
      // Denied writer: the purchase still happens live, storage is untouched,
      // and the feedback says the write failed rather than claiming success.
      const before = store.snapshot();
      game.setSaveWriteAllowed(false);
      game.shopConfirm();
      assert.equal(game.gold, 160);
      assert.equal(game.inventory.tonic, 2);
      assert.equal(store.snapshot(), before);
      assert.match(game.getSnapshot().toast ?? "", /could not be written/);
    });
  });
});

test("S08: Phoenix Ash is not offered in battle but revives a fainted reserve from the pack", async () => {
  await withGame(async (game) => {
    const active = makeBeast("emberkit", 5, { random: () => 0.5 });
    const faintedA = makeBeast("dewslime", 5, { random: () => 0.5 });
    faintedA.hp = 0;
    const faintedB = makeBeast("gutterrat", 5, { random: () => 0.5 });
    faintedB.hp = 0;
    game.party = [active, faintedA, faintedB];
    game.inventory = { phoenix_ash: 1 };
    game.mode = "world";
    assert.ok(game.usableItems().includes("phoenix_ash"), "the field pack offers the ash");
    // A battle hides it from the item route entirely.
    window.__controlsTest?.startWild?.();
    assert.equal(game.mode, "battle");
    assert.equal(game.usableItems().includes("phoenix_ash"), false, "the battle item list excludes revive-kind items");
    game.battle = null;
    game.mode = "world";
    game.encounterLock = false;
    // Field use: two fainted targets open the picker; exactly one Ash is
    // consumed and exactly the chosen creature is revived at half HP.
    game.menu = "items";
    game.menuIndex = 0;
    game.menuConfirm();
    assert.equal(game.menu, "itemTarget");
    assert.deepEqual(game.packTarget?.uids, [faintedA.uid, faintedB.uid]);
    game.menuIndex = 1;
    game.menuConfirm();
    assert.equal(game.inventory.phoenix_ash, 0, "exactly one ash consumed");
    assert.ok(faintedB.hp > 0, "the chosen reserve is revived");
    assert.equal(faintedB.hp, Math.floor(currentStats(faintedB).hp / 2), "half-HP revive behavior preserved");
    assert.equal(faintedA.hp, 0, "the other fainted reserve is untouched");
  });
});

test("S13+S29: consequential dialogs expose an action label and the commits flag", async () => {
  await withGame(async (game) => {
    game.openDialog("Innmother", ["Fifteen crowns for a clean bed."], () => {}, null, "Rest for 15 crowns");
    let view = game.getSnapshot().dialog;
    assert.equal(view?.commits, true);
    assert.equal(view?.doneLabel, "Rest for 15 crowns");
    game.openDialog("Sign", ["Elderhall — west gate."]);
    view = game.getSnapshot().dialog;
    assert.equal(view?.commits, false);
    assert.equal(view?.doneLabel, null);
  });
});

test("S14: a skipped epilogue is re-presented until delivered, without duplicate rewards", async () => {
  await withGame(async (game) => {
    const store = makeStore();
    withLocalStorage(store.storage, () => {
      const oldRun = seedOldRun(game, store);
      const base = parseSave(oldRun)!;
      const ended = serializeSave({
        ...base,
        mapId: "thornkeep",
        flags: { ...base.flags, starter: true, trial: true, ending: true },
      } as GameSave);
      assert.ok(ended);
      store.data.set(SAVE_KEY, ended);
      store.data.delete(SAVE_BACKUP);
      game.hasSave = true;
      game.continueGame();
      assert.equal(game.getSnapshot().dialog?.speaker, "Warden Cael", "epilogue owed after reload");
      assert.equal(game.getSnapshot().dialog?.commits, true);
      // Cancel drops the presentation; nothing is paid and nothing is marked.
      const sigilsBefore = game.inventory.thorn_sigil ?? 0;
      game.cancel();
      assert.equal(game.dialog, null);
      assert.equal(game.inventory.thorn_sigil ?? 0, sigilsBefore);
      assert.equal(game.flags.ending_seen, undefined);
      // Reload/continue again: the epilogue is still owed.
      game.dialog = null;
      game.continueGame();
      assert.equal(game.getSnapshot().dialog?.speaker, "Warden Cael");
      // Deliver it fully: victory mode, ending_seen durable, no new grants.
      while (game.dialog) game.confirm();
      assert.equal(game.mode, "victory");
      assert.equal(game.flags.ending_seen, true);
      assert.equal(game.inventory.thorn_sigil ?? 0, sigilsBefore, "replay never pays twice");
      const durable = parseSave(store.data.get(SAVE_KEY)!);
      assert.equal(durable?.flags.ending_seen, true);
      // One more Continue must NOT re-present it.
      game.dialog = null;
      game.mode = "title";
      game.continueGame();
      assert.equal(game.dialog, null, "delivered epilogue is not repeated");
    });
  });
});

test("S16: the Sound menu row toggles mute and persists the preference", async () => {
  await withGame(async (game) => {
    const store = makeStore();
    withLocalStorage(store.storage, () => {
      game.mode = "world";
      game.menu = "root";
      game.menuIndex = 7; // Party Storage Reliquary Pack Save Export Import Sound Close
      game.menuConfirm();
      assert.equal(game.menu, "root", "the Sound toggle stays in the menu");
      assert.equal(game.menuIndex, 7, "the Sound row stays selected for repeated toggles");
      assert.equal(game.getSnapshot().soundOff, true);
      assert.equal(store.data.get("reliquary-muted"), "1");
      game.menuConfirm(); // repeat toggle without re-navigation
      assert.equal(game.getSnapshot().soundOff, false);
      assert.equal(store.storage.getItem("reliquary-muted"), null);
      game.menuIndex = 0;
    });
  });
});

test("S06: a resolved two-actor turn keeps both actions in the bounded recap", async () => {
  await withGame(async (game, frame) => {
    game.startNew();
    game.dialog = null;
    game.party = [makeBeast("emberkit", 6, { random: () => 0.5 })];
    game.flags.starter = true;
    window.__controlsTest?.startWild?.();
    assert.equal(game.mode, "battle");
    assert.ok(game.battle);
    game.confirm(); // Strike (first command)
    // Drive the cosmetic anim until the turn resolves back to command phase.
    for (let ts = 1000; ts <= 4000 && game.battle?.phase !== "command"; ts += 100) frame(ts);
    const recap = game.battle?.recap ?? [];
    assert.ok(recap.length >= 2, `both sides must be recorded, got ${JSON.stringify(recap)}`);
    assert.ok(recap.some((l) => l.includes("Emberkit")), `player action recorded, got ${JSON.stringify(recap)}`);
    assert.ok(recap.length <= 8, "recap is bounded");
  });
});
