import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame, TILE } from "./engine.ts";
import { currentStats, makeBeast } from "./content.ts";
import { playerActsFirst } from "./systems/combat.ts";
import { loadSave, SAVE_KEY } from "./save.ts";
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
    const buttons = Array.from({ length: 6 }, (_, index) => ({
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
    assert.match(game.getSnapshot().dialog!.text, /a dozen and this goes lighter/);
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
