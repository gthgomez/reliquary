import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame, ROOT_MENU, TILE } from "./engine.ts";
import { currentStats, makeBeast } from "./content.ts";
import { playerActsFirst } from "./systems/combat.ts";
import { SAVE_BACKUP, SAVE_FORWARD_KEY, SAVE_KEY, SAVE_VERSION, WORLD_REVISION, loadSave, parseSave } from "./save.ts";
import { MAPS } from "./maps.ts";
import { makeElderhallCandidate } from "./maps/elderhall-candidate.ts";
import { chooseTileVariant } from "./world/terrain.ts";
import { tileAtlasQuadrant } from "./render/tile-surface.ts";
import type { Beast } from "./types.ts";

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

test("arrow navigation moves focus to the selected menu button", async () => {
  await withGame((game, _frame, events) => {
    game.mode = "world";
    game.menu = "root";
    let focused = 0;
    const buttons = Array.from({ length: ROOT_MENU.length }, (_, index) => ({
      disabled: index === 1,
      focus: () => {
        focused = index;
      },
    }));
    const list = { querySelectorAll: () => buttons };
    const target = Object.assign(new HTMLElement(), {
      closest: (selector: string) => (selector === "ul.cmd, ul.menu-list" ? list : null),
    });
    events.get("keydown")!({
      target,
      code: "ArrowDown",
      repeat: false,
      preventDefault() {},
    } as unknown as Event);
    assert.equal(game.menuIndex, 2);
    assert.equal(focused, 2);
  });
});

test("root menu arrows move focus between the sticky Close and menu rows", async () => {
  await withGame((game, _frame, events) => {
    game.mode = "world";
    game.menu = "root";
    game.menuIndex = ROOT_MENU.length - 1;
    let focused = -1;
    const buttons = Array.from({ length: ROOT_MENU.length }, (_, index) => ({
      disabled: false,
      focus: () => { focused = index; },
    }));
    const panel = { querySelectorAll: () => buttons };
    const target = Object.assign(new HTMLElement(), {
      closest: (selector: string) => selector === ".overlay-panel" ? panel : null,
    });
    events.get("keydown")!({ target, code: "ArrowUp", repeat: false, preventDefault() {} } as unknown as Event);
    assert.equal(game.menuIndex, ROOT_MENU.length - 2);
    assert.equal(focused, ROOT_MENU.length - 2, "focus follows selection out of the footer");
    events.get("keydown")!({ target, code: "ArrowDown", repeat: false, preventDefault() {} } as unknown as Event);
    assert.equal(focused, ROOT_MENU.length - 1, "focus returns to the sticky Close button");
  });
});

test("root menu wraps over its actions and cancel closes it", async () => {
  await withGame((game, _frame, events) => {
    game.mode = "world";
    game.menu = "root";
    game.menuIndex = ROOT_MENU.length - 1;
    game.menuConfirm();
    assert.equal(game.menu, null, "confirming the Close row closes the menu");
    game.menu = "root";
    game.menuIndex = ROOT_MENU.length - 1;
    events.get("keydown")!({ target: null, code: "ArrowDown", repeat: false, preventDefault() {} } as unknown as Event);
    assert.equal(game.menuIndex, 0);
    game.menuIndex = ROOT_MENU.length;
    game.menuConfirm();
    assert.equal(game.menu, "root", "a stale index must not close the menu or invoke an action");
    game.cancel();
    assert.equal(game.menu, null);
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

test("a caught beast can take a nickname, and declining leaves the species name", async () => {
  await withGame((game, frame) => {
    game.party = [makeBeast("emberkit", 5)];
    (game as unknown as { random: () => number }).random = () => 0;
    let ts = 100;
    const catchOne = () => {
      window.__controlsTest!.startWild!();
      game.battle!.foes[0]!.hp = 1;
      (game as unknown as { tryCatch(item: string): void }).tryCatch("common_sigil");
      const end = ts + 3000;
      for (; ts <= end; ts += 100) frame(ts);
      assert.equal(game.battle?.phase, "win");
      game.confirm();
    };
    catchOne();
    const offer = game.getSnapshot().dialog;
    assert.match(offer?.text ?? "", /accepts the compact/);
    assert.equal(offer?.doneLabel, "Give a name");
    const kept = game.party[1]!.nickname;
    game.cancel();
    assert.equal(game.getSnapshot().namePrompt, null);
    assert.equal(game.party[1]!.nickname, kept);

    catchOne();
    game.confirm();
    assert.equal(game.getSnapshot().namePrompt?.kind, "tame");
    const beforeBlank = game.party[2]!.nickname;
    game.submitCreatureName("   ");
    assert.equal(game.getSnapshot().namePrompt, null);
    assert.equal(game.party[2]!.nickname, beforeBlank);

    catchOne();
    game.confirm();
    game.submitCreatureName("Pebble");
    assert.equal(game.party[3]!.nickname, "Pebble");
    assert.equal(game.getSnapshot().namePrompt, null);

    while (game.party.length < 4) game.party.push(makeBeast("mirewhelp", 5));
    catchOne();
    game.confirm();
    game.submitCreatureName("Moss");
    assert.ok(game.box.some((beast) => beast.nickname === "Moss"));
    assert.equal(game.party.some((beast) => beast.nickname === "Moss"), false);
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

test("items with no effect are not consumed and do not spend a battle turn", async () => {
  await withGame((game) => {
    const beast = makeBeast("emberkit", 5);
    game.party = [beast];
    const use = (id: string) =>
      (
        game as unknown as { useItem(item: string, target: typeof beast, inBattle: boolean): void }
      ).useItem(id, beast, false);
    const tonics = game.inventory.tonic!;
    use("tonic");
    assert.equal(game.inventory.tonic, tonics);
    const salves = game.inventory.salve!;
    use("salve");
    assert.equal(game.inventory.salve, salves);
    beast.status = "ward";
    use("salve");
    assert.equal(game.inventory.salve, salves);
    assert.equal(beast.status, "ward");
    beast.status = null;
    game.inventory.phoenix_ash = 1;
    use("phoenix_ash");
    assert.equal(game.inventory.phoenix_ash, 1);
    window.__controlsTest!.startWild!();
    game.battle!.phase = "items";
    game.battle!.menuIndex = game.usableItems().indexOf("tonic");
    (game as unknown as { battleConfirm(): void }).battleConfirm();
    assert.equal(game.inventory.tonic, tonics);
    assert.equal(beast.hp, currentStats(beast).hp);
    assert.equal(game.battle!.phase, "items");
    beast.hp = 1;
    use("tonic");
    assert.equal(game.inventory.tonic, tonics - 1);
    assert.equal(beast.hp, currentStats(beast).hp);
    beast.hp = 0;
    use("phoenix_ash");
    assert.equal(game.inventory.phoenix_ash, 0);
    assert.ok(beast.hp > 0);
  });
});

test("a queued offer never requests a rename and opens from the storage menu too", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "storage";
    const beast = makeBeast("emberkit", 17);
    beast.pendingSkills = ["flare"];
    game.party = [beast];
    game.selectedUid = null;
    game.menuIndex = 0;
    game.menuConfirm();
    const actions = (game as unknown as { cardActions: () => string[] }).cardActions();
    assert.ok(actions.includes("learn"));
    game.menuIndex = actions.indexOf("learn");
    game.menuConfirm();
    assert.equal(game.menu, "learn");
    assert.deepEqual(game.getSnapshot().learnMenu, { uid: beast.uid, nickname: beast.nickname, skill: "flare" });
    assert.equal(game.selectedUid, null);
    game.cancel();
    assert.equal(game.menu, "storage");
  });
});

test("closing the menu forgets a half-open card action", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "party";
    const beast = makeBeast("emberkit", 5);
    game.party = [beast];
    game.gold = 500;
    game.menuIndex = 0;
    game.menuConfirm();
    assert.deepEqual(game.cardAction, { uid: beast.uid });
    game.toggleMenu();
    assert.equal(game.cardAction, null);
    assert.equal(game.menu, null);
    game.toggleMenu();
    game.menuIndex = 0;
    game.menuConfirm();
    assert.equal(game.menu, "party");
    // The next confirm opens a card sheet instead of running a stale action.
    game.menuConfirm();
    assert.deepEqual(game.cardAction, { uid: beast.uid });
    assert.equal(game.gold, 500);
    assert.equal(beast.exp, 0);
  });
});

test("a field item is used at once rather than asking which companion", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "items";
    const lead = makeBeast("emberkit", 5);
    const second = makeBeast("mothwisp", 5);
    game.party = [lead, second];
    game.inventory = { quiet_bell: 1 };
    game.menuIndex = 0;
    game.menuConfirm();
    assert.equal(game.packTarget, null);
    assert.equal(game.menu, "items");
    assert.equal(game.inventory.quiet_bell, 0);
  });
});

test("exporting hands out the live state as a readable file", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.playerName = "Rowan";
    game.gold = 275;
    game.party = [makeBeast("emberkit", 5)];
    let handed: { name: string; text: string } | null = null;
    game.exportFile = (name, text) => { handed = { name, text }; return true; };
    assert.equal(game.exportGame(), true);
    assert.deepEqual(handed!.name, "reliquary-rowan.json");
    const read = parseSave(handed!.text);
    assert.equal(read?.gold, 275);
    assert.equal(read?.party[0]?.speciesId, "emberkit");
    game.exportFile = null;
    assert.equal(game.exportGame(), false);
    assert.match(game.getSnapshot().toast ?? "", /will not hand out/);
  });
});

test("importing an unreadable file changes nothing", async () => {
  await withGame((game) => {
    const slots = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (key: string) => slots.get(key) ?? null,
      setItem: (key: string, value: string) => slots.set(key, value),
      removeItem: (key: string) => slots.delete(key),
    };
    game.mode = "world";
    game.playerName = "Rowan";
    game.gold = 200;
    game.party = [makeBeast("emberkit", 5)];
    assert.equal(game.persist(), true);
    const good = slots.get(SAVE_KEY);
    assert.equal(game.importGame("not a save at all"), false);
    assert.match(game.getSnapshot().dialog?.text ?? "", /nothing was changed/i);
    assert.equal(game.gold, 200);
    assert.equal(slots.get(SAVE_KEY), good);
    // Schema-valid JSON that fails semantics (off-map position) is refused too.
    const offMap = JSON.stringify({ ...game.currentSave(), x: 9_999 });
    assert.equal(game.importGame(offMap), false);
    assert.equal(slots.get(SAVE_KEY), good);
  });
});

test("importing a future-world file leaves the current run and stored saves untouched", async () => {
  await withGame((game) => {
    const slots = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (key: string) => slots.get(key) ?? null,
      setItem: (key: string, value: string) => slots.set(key, value),
      removeItem: (key: string) => slots.delete(key),
    };
    game.mode = "world";
    game.gold = 200;
    assert.equal(game.persist(), true);
    const before = new Map(slots);
    const current = game.currentSave();
    assert.equal(game.importGame(JSON.stringify({ ...current, worldRevision: WORLD_REVISION + 1, gold: 999 })), false);
    assert.deepEqual(game.currentSave(), current);
    assert.deepEqual(slots, before);
    assert.match(game.getSnapshot().dialog?.text ?? "", /nothing was changed/i);
  });
});

for (const slot of [SAVE_KEY, SAVE_BACKUP]) {
  test(`importing a compatible save aborts if the forward record in ${slot} cannot be archived`, async () => {
    await withGame((game) => {
      game.mode = "world";
      game.gold = 200;
      const current = game.currentSave();
      const slots = new Map([
        [SAVE_KEY, JSON.stringify(current)],
        [SAVE_BACKUP, JSON.stringify(current)],
      ]);
      slots.set(slot, JSON.stringify({ ...current, version: SAVE_VERSION + 1 }));
      const before = new Map(slots);
      (globalThis as Record<string, unknown>).localStorage = {
        getItem: (key: string) => slots.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (key === SAVE_FORWARD_KEY) throw new Error("archive quota exceeded");
          slots.set(key, value);
        },
        removeItem: (key: string) => slots.delete(key),
      };
      assert.equal(game.importGame(JSON.stringify({ ...current, gold: 999 })), false);
      assert.deepEqual(game.currentSave(), current);
      assert.deepEqual(slots, before);
      assert.match(game.getSnapshot().dialog?.text ?? "", /last save is untouched/i);
    });
  });
}

test("importing a valid file replaces the run and keeps the old save as backup", async () => {
  await withGame((game) => {
    const slots = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (key: string) => slots.get(key) ?? null,
      setItem: (key: string, value: string) => slots.set(key, value),
      removeItem: (key: string) => slots.delete(key),
    };
    game.mode = "world";
    game.playerName = "Rowan";
    game.gold = 200;
    game.party = [makeBeast("emberkit", 5)];
    assert.equal(game.persist(), true);
    const previous = slots.get(SAVE_KEY);
    const incoming = JSON.stringify({
      ...game.currentSave(),
      playerName: "Wren",
      gold: 640,
      party: [makeBeast("mothwisp", 9)],
    });
    assert.equal(game.importGame(incoming), true);
    assert.equal(game.playerName, "Wren");
    assert.equal(game.gold, 640);
    assert.equal(game.party[0]!.speciesId, "mothwisp");
    assert.equal(game.menu, null);
    assert.equal(slots.get(SAVE_BACKUP), previous);
    assert.equal(loadSave({ getItem: (key: string) => slots.get(key) ?? null, setItem() {}, removeItem() {} })?.playerName, "Wren");
  });
});

test("the root menu offers Export and Import, and Import asks the shell for a file", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.party = [makeBeast("emberkit", 5)];
    game.playerName = "Rowan";
    let handed = 0;
    game.exportFile = () => { handed += 1; return true; };
    game.menu = "root";
    game.menuIndex = ROOT_MENU.indexOf("Export");
    game.menuConfirm();
    assert.equal(handed, 1);
    const before = game.getSnapshot().importTicket;
    game.menu = "root";
    game.menuIndex = ROOT_MENU.indexOf("Import");
    game.menuConfirm();
    assert.equal(game.getSnapshot().importTicket, before + 1);
    assert.equal(game.menu, null);
  });
});

test("pending skill offers are taught by replace or decline, never silently", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "party";
    game.gold = 0;
    const beast = makeBeast("emberkit", 5);
    beast.skills = ["nip", "cinder", "scorch", "slash"];
    beast.pendingSkills = ["flare"];
    game.party = [beast];
    game.openLearnMenu(beast.uid);
    assert.equal(game.menu, "learn");
    assert.equal(game.menuIndex, 4);
    game.menuIndex = 1;
    game.menuConfirm();
    assert.deepEqual(beast.skills, ["nip", "flare", "scorch", "slash"]);
    assert.deepEqual(beast.pendingSkills, []);
    assert.equal(game.menu, "party");
    // decline path
    beast.pendingSkills = ["howl"];
    game.openLearnMenu(beast.uid);
    game.menuIndex = 4;
    game.menuConfirm();
    assert.deepEqual(beast.pendingSkills, []);
    assert.deepEqual(beast.skills, ["nip", "flare", "scorch", "slash"]);
  });
});

test("a queued offer survives save and reload", async () => {
  await withGame((game) => {
    const slots = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (key: string) => slots.get(key) ?? null,
      setItem: (key: string, value: string) => slots.set(key, value),
      removeItem: (key: string) => slots.delete(key),
    };
    const beast = makeBeast("emberkit", 17);
    beast.pendingSkills = ["flare"];
    game.party = [beast];
    game.mapId = "elderhall";
    game.tx = 12; game.ty = 14; game.px = game.tx * TILE; game.py = game.ty * TILE;
    assert.equal(game.persist(), true);
    const load = loadSave({
      getItem: (key: string) => slots.get(key) ?? null,
      setItem() {},
      removeItem() {},
    })!;
    assert.deepEqual(load.party[0]!.pendingSkills, ["flare"]);
  });
});

test("pack items with several eligible targets show a chooser with previews", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "items";
    const lead = makeBeast("emberkit", 5);
    const hurt = makeBeast("mirewhelp", 5);
    lead.hp = Math.max(1, currentStats(lead).hp - 30);
    hurt.hp = Math.max(1, currentStats(hurt).hp - 20);
    game.party = [lead, hurt];
    game.inventory.tonic = 2;
    game.menuIndex = game.usableItems().indexOf("tonic");
    game.menuConfirm();
    assert.equal(game.menu, "itemTarget");
    assert.deepEqual(
      game.getSnapshot().packTarget!.targets.map((t) => t.uid),
      [lead.uid, hurt.uid],
    );
    assert.match(game.getSnapshot().packTarget!.targets[1]!.note, /heal/i);
    game.menuIndex = 1;
    game.menuConfirm();
    assert.equal(game.menu, "items");
    assert.equal(hurt.hp, currentStats(hurt).hp);
    assert.equal(game.inventory.tonic, 1);
  });
});

test("a fainted non-lead beast can be woken from the pack by picking it", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "items";
    const lead = makeBeast("emberkit", 5);
    const downed = makeBeast("mirewhelp", 5);
    const downedToo = makeBeast("briarling", 5);
    downed.hp = 0;
    downedToo.hp = 0;
    game.party = [lead, downed, downedToo];
    game.inventory.phoenix_ash = 1;
    game.menuIndex = game.usableItems().indexOf("phoenix_ash");
    game.menuConfirm();
    assert.equal(game.menu, "itemTarget");
    game.menuIndex = 0;
    game.menuConfirm();
    assert.ok(downed.hp > 0);
    assert.equal(game.inventory.phoenix_ash, 0);
  });
});

test("canceling a pack choice returns to the same item without spending it", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "items";
    const hurt = makeBeast("emberkit", 5);
    const also = makeBeast("briarling", 5);
    hurt.hp -= 5;
    also.hp -= 5;
    game.party = [hurt, also];
    game.inventory.tonic = 1;
    game.menuIndex = game.usableItems().indexOf("tonic");
    game.menuConfirm();
    assert.equal(game.menu, "itemTarget");
    game.cancel();
    assert.equal(game.menu, "items");
    assert.equal(game.inventory.tonic, 1);
  });
});

test("a pack item useful to nobody is refused without consumption", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "items";
    const lead = makeBeast("emberkit", 5);
    game.party = [lead];
    game.inventory.tonic = 1;
    game.menuIndex = game.usableItems().indexOf("tonic");
    game.menuConfirm();
    assert.equal(game.menu, "items");
    assert.equal(game.inventory.tonic, 1);
    assert.match(game.getSnapshot().toast ?? "", /nothing/i);
  });
});

test("a dazed grip fumbles one attack in four, deterministically", async () => {
  await withGame((game) => {
    game.party = [makeBeast("emberkit", 5)];
    window.__controlsTest!.startWild!();
    const foe = game.battle!.foes[0]!;
    const raw = game as unknown as { foeTurn: (foe: Beast, me: Beast) => void; random: () => number };
    foe.status = "daze";
    foe.statusTurns = 3;
    let fumbles = 0;
    let total = 0;
    for (const value of [0.1, 0.3, 0.6, 0.9, 0.2, 0.8]) {
      raw.random = () => value;
      total++;
      raw.foeTurn(foe, game.party[0]!);
      if (/fumbles/.test(game.battle!.log[0] ?? "")) fumbles++;
    }
    assert.equal(total, 6);
    assert.equal(fumbles, 2);
  });
});

test("a bound grip acts last and cannot flee", async () => {
  await withGame((game) => {
    game.party = [makeBeast("emberkit", 5)];
    window.__controlsTest!.startWild!();
    const me = game.party[0]!;
    me.status = "bind";
    me.statusTurns = 2;
    // cannot flee
    (game as unknown as { tryFlee(): void }).tryFlee();
    assert.match(game.battle!.log[0] ?? "", /Roots hold fast/);
    assert.ok(game.battle!.escaped !== true);
    // always acts last even against a slow foe
    const foe = game.battle!.foes[0]!;
    let playerFirst = 0;
    for (const value of [0.99]) {
      (game as unknown as { random: () => number }).random = () => value;
      const result = playerActsFirst(me, foe, () => value);
      if (result) playerFirst++;
    }
    assert.equal(playerFirst, 0);
  });
});

test("party cards are reachable and act through directional confirm alone", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "party";
    game.gold = 100;
    const lead = makeBeast("emberkit", 5);
    const second = makeBeast("mirewhelp", 5);
    game.party = [lead, second];
    // open the second card (its 1-based position), see the action list
    game.menuIndex = 1;
    game.menuConfirm();
    assert.equal(game.cardAction!.uid, second.uid);
    const view = game.getSnapshot().cardMenu!;
    assert.equal(view.nickname, second.nickname);
    assert.ok(view.actions.includes("lead"));
    assert.ok(view.actions.includes("practice"));
    assert.ok(view.actions.includes("rename"));
    // make lead
    game.menuIndex = view.actions.indexOf("lead");
    game.menuConfirm();
    assert.equal(game.party[0]!.uid, second.uid);
    assert.equal(game.cardAction, null);
    assert.equal(game.menuIndex, 0);
  });
});

test("storage cards are reachable and transfer through the action list", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "storage";
    const second = makeBeast("mirewhelp", 5);
    const stored = makeBeast("briarling", 5);
    game.party = [makeBeast("emberkit", 5), second];
    game.box = [stored];
    // combined list: party card index 0/1, box beast index 2
    game.menuIndex = 2;
    game.menuConfirm();
    assert.equal(game.cardAction!.uid, stored.uid);
    const view = game.getSnapshot().cardMenu!;
    assert.ok(view.actions.includes("in"));
    assert.ok(view.actions.includes("rename"));
    game.menuIndex = view.actions.indexOf("in");
    game.menuConfirm();
    assert.equal(game.party.length, 3);
    assert.deepEqual(game.party.map((beast) => beast.uid).includes(stored.uid), true);
    // open the mirewhelp party card and store it
    game.menuIndex = game.party.findIndex((beast) => beast.uid === second.uid);
    game.menuConfirm();
    game.menuIndex = game.getSnapshot().cardMenu!.actions.indexOf("store");
    game.menuConfirm();
    assert.equal(game.box.some((beast) => beast.uid === second.uid), true);
    assert.equal(game.menuIndex, 2);
  });
});

test("a continue whose save vanished says so before starting anew", async () => {
  await withGame((game) => {
    game.hasSave = true;
    game.continueGame();
    assert.match(game.getSnapshot().dialog!.text, /could not be read/);
    assert.equal(game.hasSave, false);
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
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, rect() {}, clip() {},
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

/** Capture the real terrain bake for a dirt tile immediately west of stone. */
async function stoneTransitionDraws(options: { candidate: boolean; atlas: boolean; mapId?: "elderhall" | "grove" }) {
  const mapId = options.mapId ?? "elderhall";
  const originalMap = MAPS[mapId]!;
  const originalFlag = process.env.VITE_ELDERHALL_CANDIDATE;
  const atlas = {} as HTMLImageElement;
  const legacy = {} as HTMLImageElement;
  const dirt = {} as HTMLImageElement;
  const grass = {} as HTMLImageElement;
  const draws: unknown[][] = [];
  process.env.VITE_ELDERHALL_CANDIDATE = options.candidate ? "1" : "0";
  MAPS[mapId] = { ...originalMap, ground: ["....", ".pc.", "...."], objects: [], npcs: [], decorations: [], terrainPathStyle: "soft" };
  try {
    await withGame((game, frame) => {
      const ground = {
        drawImage(...args: unknown[]) { draws.push(args); }, fillRect() {}, save() {}, restore() {},
        beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, rect() {}, clip() {},
      };
      Object.assign(document, { createElement: () => ({ getContext: () => ground, width: 0, height: 0 }) });
      game.canvas = { getContext: () => ({ drawImage() {}, fillRect() {} }) } as unknown as HTMLCanvasElement;
      game.images = { tile_cobble: legacy, tile_dirt: dirt, tile_grass: grass,
        ...(options.atlas ? { "tile_elderhall-stone-atlas": atlas } : {}) };
      game.mapId = mapId;
      game.mode = "world";
      frame(16);
    });
  } finally {
    MAPS[mapId] = originalMap;
    if (originalFlag === undefined) delete process.env.VITE_ELDERHALL_CANDIDATE;
    else process.env.VITE_ELDERHALL_CANDIDATE = originalFlag;
  }
  return { draws, atlas, legacy };
}

test("Elderhall candidate dirt-to-stone transition draws a deterministic candidate atlas cell", async () => {
  const { draws, atlas, legacy } = await stoneTransitionDraws({ candidate: true, atlas: true });
  const atPath = draws.filter((args) => args.length === 9 && args[0] === atlas && args[5] === TILE && args[6] === TILE);
  assert.equal(atPath.length, 1, "the candidate stone atlas is drawn into the dirt tile");
  const variant = chooseTileVariant("elderhall", 1, 1, "dirt", 3);
  const quadrant = tileAtlasQuadrant(variant, 1, 1);
  assert.deepEqual(atPath[0]!.slice(1, 5), [(quadrant & 1) * TILE, (quadrant >> 1) * TILE, TILE, TILE]);
  assert.equal(draws.some((args) => args.length === 5 && args[0] === legacy && args[1] === TILE && args[2] === TILE), false,
    "the legacy stone texture is not mixed into the candidate transition");
});

test("stone transitions fall back to the legacy tile in normal, missing-atlas, and other-map builds", async () => {
  for (const options of [
    { candidate: false, atlas: true },
    { candidate: true, atlas: false },
    { candidate: true, atlas: true, mapId: "grove" as const },
  ]) {
    const { draws, atlas, legacy } = await stoneTransitionDraws(options);
    assert.ok(draws.some((args) => args.length === 5 && args[0] === legacy && args[1] === TILE && args[2] === TILE),
      `legacy transition is drawn for ${JSON.stringify(options)}`);
    assert.equal(draws.some((args) => args.length === 9 && args[0] === atlas && args[5] === TILE && args[6] === TILE), false,
      `candidate atlas is not drawn for ${JSON.stringify(options)}`);
  }
});

test("a player behind the candidate gate dims only the overlapping area of the arch", async () => {
  const originalMap = MAPS.elderhall!;
  const originalFlag = process.env.VITE_ELDERHALL_CANDIDATE;
  process.env.VITE_ELDERHALL_CANDIDATE = "1";
  MAPS.elderhall = makeElderhallCandidate(originalMap);
  try {
    await withGame((game, frame) => {
      const gateImage = {} as HTMLImageElement;
      let alpha = 1;
      let rects: number[][] = [];
      type Clip = { rule: string; rects: number[][] } | null;
      let activeClip: Clip = null;
      const saved: { alpha: number; clip: Clip }[] = [];
      const gateDraws: { alpha: number; clip: Clip }[] = [];
      const screen = {
        get globalAlpha() { return alpha; }, set globalAlpha(value: number) { alpha = value; },
        save() { saved.push({ alpha, clip: activeClip }); },
        restore() { const previous = saved.pop(); if (previous) { alpha = previous.alpha; activeClip = previous.clip; } },
        beginPath() { rects = []; }, rect(...args: number[]) { rects.push(args); },
        clip(rule?: CanvasFillRule) { activeClip = { rule: rule ?? "nonzero", rects: rects.map((rect) => [...rect]) }; },
        drawImage(image: unknown) { if (image === gateImage) gateDraws.push({ alpha, clip: activeClip }); }, fillRect() {},
      };
      const ground = { drawImage() {}, fillRect() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
        quadraticCurveTo() {}, closePath() {}, rect() {}, clip() {} };
      Object.assign(document, { createElement: () => ({ getContext: () => ground, width: 0, height: 0 }) });
      game.canvas = { getContext: () => screen } as unknown as HTMLCanvasElement;
      game.images = { "prop_elderhall-gate-reference": gateImage };
      game.mapId = "elderhall"; game.mode = "world";
      game.tx = 11; game.ty = 4; game.px = 11 * TILE; game.py = 4 * TILE;
      frame(16);
      assert.deepEqual(gateDraws.map((draw) => draw.alpha), [1, 0.35], "the arch stays opaque outside the locally faded player area");
      assert.equal(gateDraws[0]!.clip?.rule, "evenodd", "the opaque pass excludes the player rectangle");
      assert.equal(gateDraws[0]!.clip?.rects.length, 2);
      assert.equal(gateDraws[1]!.clip?.rects.length, 1, "only the player rectangle is translucent");
      assert.equal(alpha, 1, "canvas opacity is restored for subsequent actors");
    });
  } finally {
    MAPS.elderhall = originalMap;
    if (originalFlag === undefined) delete process.env.VITE_ELDERHALL_CANDIDATE;
    else process.env.VITE_ELDERHALL_CANDIDATE = originalFlag;
  }
});

test("the objective follows the chapter's flags in the snapshot", async () => {
  await withGame((game) => {
    assert.match(game.getSnapshot().objective ?? "", /Binding Grove/);
    game.flags.starter = true;
    game.emitPublic();
    assert.match(game.getSnapshot().objective ?? "", /Wildwood/);
    game.flags.trial = true;
    game.emitPublic();
    assert.match(game.getSnapshot().objective ?? "", /Hollow Crown/);
  });
});

test("the inn names the A/B choice, charges on confirm, and skips on cancel", async () => {
  await withGame((game) => {
    game.mode = "world";
    const talk = (id: string, name: string) =>
      (game as unknown as { talk(id: string, name: string): void }).talk(id, name);
    game.gold = 100;
    talk("innkeep", "Innmother Cald");
    assert.match(game.getSnapshot().dialog!.text, /A rest · B not now/);
    game.confirm();
    assert.equal(game.gold, 85);
    game.party.forEach((beast) => {
      assert.equal(beast.hp, currentStats(beast).hp);
    });
    game.cancel();
    talk("innkeep", "Innmother Cald");
    game.cancel();
    assert.equal(game.gold, 85);
    assert.equal(game.getSnapshot().dialog, null);
    game.gold = 10;
    talk("innkeep", "Innmother Cald");
    game.confirm();
    assert.match(game.getSnapshot().dialog!.text, /Crowns first/);
    assert.equal(game.gold, 10);
  });
});

test("Cael telegraphs the trial, advises a weak party, and only begins on confirm", async () => {
  await withGame((game) => {
    game.mode = "world";
    const talk = (id: string, name: string) =>
      (game as unknown as { talk(id: string, name: string): void }).talk(id, name);
    game.flags.starter = true;
    game.party = [makeBeast("emberkit", 5)];
    talk("cael", "Warden Cael");
    game.confirm();
    assert.match(game.getSnapshot().dialog!.text, /Below a dozen, my three run lighter/);
    assert.match(game.getSnapshot().dialog!.text, /at a dozen they meet you at full strength/);
    assert.match(game.getSnapshot().dialog!.text, /Iron\. Chapel\. Drake/);
    game.cancel();
    assert.equal(game.getSnapshot().dialog, null);
    assert.equal(game.battle, null);
    talk("cael", "Warden Cael");
    game.confirm();
    game.confirm();
    game.confirm();
    assert.equal(game.battle!.kind, "trial");
    game.battle = null;
    game.mode = "world";
    game.party = [makeBeast("emberkit", 12)];
    talk("cael", "Warden Cael");
    game.confirm();
    assert.doesNotMatch(game.getSnapshot().dialog!.text, /seasons/);
    assert.match(game.getSnapshot().dialog!.text, /Iron\. Chapel\. Drake/);
  });
});

test("learned skills: replacing, declining, multiple pending offers, and party isolation", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.menu = "party";

    const ember = makeBeast("emberkit", 17);
    ember.skills = ["nip", "cinder", "scorch", "slash"];
    ember.pendingSkills = ["flare", "heatwave"];

    const mire = makeBeast("mirewhelp", 17);
    mire.skills = ["nip", "torrent", "soak", "lickwounds"];
    mire.pendingSkills = ["wardveil"];

    game.party = [ember, mire];

    // 1. Open learn menu for emberkit
    game.openLearnMenu(ember.uid);
    assert.equal(game.menu, "learn");
    assert.equal(game.getSnapshot().menu, "learn");

    // 2. Replace skill at index 1 ("cinder") with "flare"
    game.chooseMenu(1);
    assert.deepEqual(ember.skills, ["nip", "flare", "scorch", "slash"], "cinder replaced with flare");
    assert.deepEqual(ember.pendingSkills, ["heatwave"], "first pending offer cleared, second queued");
    // The second offer immediately becomes active
    assert.equal(game.menu, "learn", "menu remains in learn mode for next offer");
    assert.equal((game as unknown as { learnMenu: { skill: string } | null }).learnMenu?.skill, "heatwave");

    // 3. Decline the second offer (index === skills.length, which is 4)
    game.chooseMenu(4);
    assert.deepEqual(ember.skills, ["nip", "flare", "scorch", "slash"], "skills untouched after decline");
    assert.deepEqual(ember.pendingSkills, [], "all offers for emberkit cleared");
    assert.equal(game.menu, "party", "returns to party menu when offers exhausted");

    // 4. Verify mirewhelp's pending offers were completely untouched
    assert.deepEqual(mire.skills, ["nip", "torrent", "soak", "lickwounds"], "mirewhelp skills untouched");
    assert.deepEqual(mire.pendingSkills, ["wardveil"], "mirewhelp offer preserved");

    // 5. Decline mirewhelp's offer
    game.openLearnMenu(mire.uid);
    assert.equal(game.menu, "learn");
    game.chooseMenu(mire.skills.length);
    assert.deepEqual(mire.pendingSkills, [], "mirewhelp offer cleared after decline");
    assert.equal(game.menu, "party");
  });
});

test("starter confirmation flow: inspect, cancel, confirm, naming, Elder Maren follow-up", async () => {
  await withGame((game) => {
    game.mode = "world";
    const chooseStarter = (id: string) =>
      (game as unknown as { chooseStarter(id: string): void }).chooseStarter(id);

    const initialGold = game.gold;
    const initialSigils = game.inventory.common_sigil ?? 0;

    // 1. Inspecting a starter shows description and does not bind
    chooseStarter("emberkit");
    assert.ok(game.getSnapshot().dialog, "dialog open for starter description");
    assert.match(game.getSnapshot().dialog!.text, /Emberkit/);
    assert.equal(game.party.length, 0, "inspecting does not add to party");
    assert.equal(game.flags.starter, undefined, "starter flag not set");

    // 2. Cancelling leaves the player with no starter
    game.cancel();
    assert.equal(game.party.length, 0, "cancel leaves party empty");

    // 3. Inspecting again and confirming advances to pact confirmation
    chooseStarter("emberkit");
    // Advance first dialog page to "Speak the pact" action
    game.confirm();
    assert.ok(game.getSnapshot().dialog, "advance to pact offer");
    // Click "Speak the pact"
    game.confirm();
    assert.match(game.getSnapshot().dialog!.text, /Bind Emberkit as your first pact\?/);

    // 4. Confirming the bind sets starter, party, and triggers NamePrompt
    game.confirm();
    assert.equal(game.party.length, 1, "exactly one starter bound");
    assert.equal(game.flags.starter, true, "starter flag set");
    assert.equal(game.gold, initialGold + 40, "starter crowns granted");
    assert.equal(game.inventory.common_sigil, initialSigils + 3, "starter sigils granted");
    assert.ok(game.namePrompt, "namePrompt active");
    assert.equal(game.namePrompt?.kind, "starter");
    assert.equal(game.namePrompt?.speciesName, "Emberkit");

    // 5. Submit nickname "Ignis"
    game.submitCreatureName("Ignis");
    assert.equal(game.party[0].nickname, "Ignis", "nickname applied");
    assert.equal(game.namePrompt, null, "namePrompt closed");
    // Elder Maren speaks using the nickname
    assert.ok(game.getSnapshot().dialog, "Elder Maren follow-up dialog opens");
    assert.match(game.getSnapshot().dialog!.text, /So it is Ignis\. Keep the name\./);

    // 6. Dismiss Elder Maren dialog
    game.confirm();
    game.confirm();
    assert.equal(game.getSnapshot().dialog, null, "dialog closed");

    // 7. Attempting to inspect another starter does not bind or duplicate
    chooseStarter("mirewhelp");
    assert.match(game.getSnapshot().dialog!.text, /The grove is quiet\. Your pact is already spoken\./);
    assert.equal(game.party.length, 1, "party still contains only original starter");
    assert.equal(game.party[0].nickname, "Ignis");
  });
});

test("wild capture naming flow: capture offer, nickname submit, and cancel to keep default name", async () => {
  await withGame((game) => {
    game.mode = "world";
    game.flags.starter = true;
    game.party = [makeBeast("emberkit", 5)];

    const wildMoth = makeBeast("mothwisp", 4);
    game.party.push(wildMoth);

    const offerCapturedName = (uid: string) =>
      (game as unknown as { offerCapturedName(uid: string): void }).offerCapturedName(uid);

    // 1. Offer naming for captured creature
    offerCapturedName(wildMoth.uid);
    assert.ok(game.getSnapshot().dialog, "naming offer dialog opened");
    assert.match(game.getSnapshot().dialog!.text, /Mothwisp accepts the compact/);

    // Advance dialogue to namePrompt
    game.confirm();
    assert.ok(game.namePrompt, "namePrompt active");
    assert.equal(game.namePrompt?.kind, "tame");

    // Submit nickname "Glimmer"
    game.submitCreatureName("Glimmer");
    assert.equal(game.namePrompt, null, "namePrompt closed");
    assert.equal(game.party.find((b) => b.uid === wildMoth.uid)?.nickname, "Glimmer", "nickname applied to captured creature");

    // 2. Test cancel/default name on another captured creature
    const wildGale = makeBeast("galeskip", 4);
    game.party.push(wildGale);
    offerCapturedName(wildGale.uid);
    game.confirm();
    assert.ok(game.namePrompt);

    // Submit null (keep default species name)
    game.submitCreatureName(null);
    assert.equal(game.namePrompt, null);
    assert.equal(game.party.find((b) => b.uid === wildGale.uid)?.nickname, "Galeskip", "default name retained when naming declined");
  });
});
