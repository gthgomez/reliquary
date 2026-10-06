# PR-C — Save-Result and Item-Targeting Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make save success honest (durability before UI confirmation) and make
item use validate its target before consuming, with Quiet Bell explicitly
overworld-only.

**Architecture:** Inject `SaveStorage` into the engine so persistence is
testable; make `persist()` return the `writeSave` result and only flip
`hasSave` on success. Add a pure `systems/items.ts` targeting/validation rule
and an explicit battle `item-target` phase. No effect is applied and no item is
consumed until validation passes.

**Tech Stack:** TypeScript, Zod (already used in `save.ts`), native Node test
runner.

**Spec:** `docs/superpowers/plans/2026-10-06-reliquary-v0.2-campaign.md`
(Global Constraints apply).

**Defects fixed:** B5, B6, B7, B8, B9.

**Depends on:** PR-A (item call site and battle turn flow). PR-B is independent.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `src/game/types.ts` | `BattleState` | add `pendingItem`, add `"item-target"` phase |
| `src/game/save.ts` | storage contract | export/keep `SaveStorage` (already exported) |
| `src/game/systems/items.ts` | pure item targeting rules | **create** |
| `src/game/engine.ts` | orchestration | storage injection, `persist()` bool, item flow |
| `src/game/ui/Overlays.tsx` | battle UI | render party list in `item-target` phase |
| `src/game/items.test.ts` | rules unit tests | **create** |
| `src/game/engine-save.test.ts` | save fault tests | **create** |
| `src/game/battle-items.test.ts` | item integration tests | **create** |

**Interfaces produced:**
- `ReliquaryGame` constructor: `new ReliquaryGame({ random?, storage?: SaveStorage | null })`.
- `persist(): boolean` — `true` iff the save was written durably.
- `validateItemUse(item, party, activeIndex, inBattle, requestedTarget?) =>
  ItemUsePlan`.

---

### Task C1: Make `persist()` report durability and only then mark `hasSave`

**Files:**
- Modify: `src/game/engine.ts:127`, `:138-142`, `:422-440`, `:1373-1377`
- Test: `src/game/engine-save.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast } from "./content.ts";
import { ReliquaryGame } from "./engine.ts";
import { SAVE_KEY, type SaveStorage } from "./save.ts";
import { sequenceRandom } from "./rng.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };

class MemoryStorage implements SaveStorage {
  data = new Map<string, string>();
  failOn: string | null = null;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failOn) throw new Error("quota exceeded");
    this.data.set(key, value);
  }
  removeItem(key: string) { this.data.delete(key); }
}

function gameWith(storage: SaveStorage): ReliquaryGame {
  const g = new ReliquaryGame({ random: sequenceRandom([0.5]), storage });
  g.party = [makeBeast("emberkit", 5, { temperament: "calm", ivs: IVS })];
  g.flags.starter = true;
  return g;
}

test("a successful save is durable and marks the lantern written", () => {
  const store = new MemoryStorage();
  const g = gameWith(store);
  g.menu = "root";
  g.menuIndex = 3; // "Save"
  g.menuConfirm();
  assert.equal(store.data.has(SAVE_KEY), true);
  assert.equal(g.hasSave, true);
  assert.equal(g.toast, "The lantern is written.");
});

test("a failed save neither reports success nor falsely marks hasSave", () => {
  const store = new MemoryStorage();
  const g = gameWith(store);
  store.failOn = SAVE_KEY;
  g.menu = "root";
  g.menuIndex = 3;
  g.menuConfirm();
  assert.equal(g.hasSave, false, "hasSave must not be set when the write failed");
  assert.equal(store.data.has(SAVE_KEY), false);
  assert.notEqual(g.toast, "The lantern is written.");
});

test("hasSave reflects an existing durable save at construction", () => {
  const store = new MemoryStorage();
  const first = gameWith(store);
  first.persist();
  const second = new ReliquaryGame({ random: sequenceRandom([0.5]), storage: store });
  assert.equal(second.hasSave, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test src/game/engine-save.test.ts`
Expected: FAIL — constructor has no `storage` option; failed save still toasts
"The lantern is written."

- [ ] **Step 3: Inject storage and make persistence honest**

In `src/game/engine.ts`:

Add the import type:
```ts
import { hasSave, loadSave, writeSave, type SaveStorage } from "./save.ts";
```

Add the field near `hasSave = false;`:
```ts
private readonly storage?: SaveStorage | null;
```

Extend the constructor:
```ts
constructor(options: { random?: RandomSource; storage?: SaveStorage | null } = {}) {
  this.random = options.random ?? mathRandom;
  this.storage = options.storage;
  this.snap = this.buildSnap();
  this.hasSave = hasSave(this.storage);
}
```

Replace `persist()`:
```ts
persist(): boolean {
  const ok = writeSave({
    version: 2,
    playerName: this.playerName,
    mapId: this.mapId,
    x: this.tx,
    y: this.ty,
    dir: this.dir,
    gold: this.gold,
    playTime: this.playTime,
    party: this.party,
    box: this.box,
    inventory: this.inventory,
    flags: this.flags,
    seen: this.seen,
    caught: this.caught,
  }, this.storage);
  if (ok) this.hasSave = true;
  return ok;
}
```

Replace the Save branch of `menuConfirm()`:
```ts
else if (c === "Save") {
  const ok = this.persist();
  if (ok) {
    sfxPlay.save();
    this.toastMsg("The lantern is written.");
  } else {
    sfxPlay.fail();
    this.toastMsg("The lantern will not take the ink. Try again.");
  }
  this.menu = null;
}
```

> `hasSave(this.storage)` with `this.storage === undefined` falls through to the
> default browser storage; explicit `null` forces "no storage" in tests.

- [ ] **Step 4: Run tests and gate**

```bash
node --experimental-strip-types --test src/game/engine-save.test.ts
npm run typecheck && npm run lint && npm test && npm run validate:content && npm run build
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/engine.ts src/game/engine-save.test.ts
git commit -m "fix(save): report durability and never mark hasSave on a failed write"
```

---

### Task C2: Pure item targeting/validation rules

**Files:**
- Create: `src/game/systems/items.ts`
- Test: `src/game/items.test.ts` (create)

- [ ] **Step 1: Write the failing unit tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ITEMS, makeBeast } from "./content.ts";
import { validateItemUse } from "./systems/items.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string) => makeBeast(id, 5, { temperament: "calm", ivs: IVS });

test("healing requires a living target", () => {
  const alive = beast("emberkit");
  const fallen = beast("mirewhelp");
  fallen.hp = 0;
  assert.deepEqual(validateItemUse(ITEMS.tonic, [alive, fallen], 0, true, 1), {
    ok: false, reason: "invalid-target",
  });
  assert.deepEqual(validateItemUse(ITEMS.tonic, [alive, fallen], 0, true, 0), {
    ok: true, targetIndex: 0, consume: true,
  });
});

test("revive requires a fainted target and picks one by default", () => {
  const alive = beast("emberkit");
  const fallen = beast("mirewhelp");
  fallen.hp = 0;
  assert.deepEqual(validateItemUse(ITEMS.phoenix_ash, [alive, fallen], 0, true, 0), {
    ok: false, reason: "invalid-target",
  });
  assert.deepEqual(validateItemUse(ITEMS.phoenix_ash, [alive, fallen], 0, true), {
    ok: true, targetIndex: 1, consume: true,
  });
  assert.deepEqual(validateItemUse(ITEMS.phoenix_ash, [alive], 0, true), {
    ok: false, reason: "no-target",
  });
});

test("field items are overworld-only and blocked in battle", () => {
  assert.deepEqual(validateItemUse(ITEMS.quiet_bell, [beast("emberkit")], 0, true), {
    ok: false, reason: "field-only",
  });
  assert.deepEqual(validateItemUse(ITEMS.quiet_bell, [beast("emberkit")], 0, false), {
    ok: true, targetIndex: -1, consume: true,
  });
});

test("sigils and key items are never usable as consumables", () => {
  assert.deepEqual(validateItemUse(ITEMS.common_sigil, [beast("emberkit")], 0, true), {
    ok: false, reason: "unusable",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test src/game/items.test.ts`
Expected: FAIL — cannot find module `./systems/items.ts`.

- [ ] **Step 3: Implement the rules**

Create `src/game/systems/items.ts`:

```ts
import type { Beast, ItemDef } from "../types.ts";

export type ItemUseFailure = "unusable" | "field-only" | "no-target" | "invalid-target";

export type ItemUsePlan =
  | { ok: true; targetIndex: number; consume: true }
  | { ok: false; reason: ItemUseFailure };

/**
 * Decide whether an item may be used and on whom, without applying anything.
 * Consumption happens only after this returns `ok: true`.
 * `targetIndex` is -1 for items that take no party target (field items).
 */
export function validateItemUse(
  item: ItemDef | undefined,
  party: Beast[],
  activeIndex: number,
  inBattle: boolean,
  requestedTarget?: number,
): ItemUsePlan {
  if (!item) return { ok: false, reason: "unusable" };
  if (item.kind === "sigil" || item.kind === "key") return { ok: false, reason: "unusable" };
  if (item.kind === "field") {
    return inBattle ? { ok: false, reason: "field-only" } : { ok: true, targetIndex: -1, consume: true };
  }
  const fallback = item.kind === "revive"
    ? party.findIndex((b) => b.hp <= 0)
    : activeIndex;
  const targetIndex = requestedTarget ?? fallback;
  if (targetIndex < 0 || targetIndex >= party.length) return { ok: false, reason: "no-target" };
  const target = party[targetIndex]!;
  if (item.kind === "revive") {
    return target.hp > 0 ? { ok: false, reason: "invalid-target" } : { ok: true, targetIndex, consume: true };
  }
  return target.hp <= 0 ? { ok: false, reason: "invalid-target" } : { ok: true, targetIndex, consume: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test src/game/items.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/items.ts src/game/items.test.ts
git commit -m "feat(items): add pure target validation rules"
```

---

### Task C3: Battle `item-target` state fields

**Files:**
- Modify: `src/game/types.ts:167-178`
- Modify: `src/game/engine.ts` battle literals (`startWild`, `startWarden`)

- [ ] **Step 1: Extend `BattleState`**

Add `"item-target"` to the `phase` union and add the field:

```ts
  phase:
    | "intro" | "command" | "skills" | "items" | "item-target"
    | "party" | "bind" | "anim" | "win" | "lose" | "catch";
  menuIndex: number;
  /** Item id awaiting a target choice in the "item-target" phase. */
  pendingItem: string | null;
```

- [ ] **Step 2: Initialize in both battle literals**

Add `pendingItem: null,` to the `this.battle = {...}` literals in `startWild()`
and `startWarden()` in `engine.ts`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/game/types.ts src/game/engine.ts
git commit -m "feat(battle): add item-target phase and pendingItem state"
```

---

### Task C4: Route battle items through validation (no consume before valid)

**Files:**
- Modify: `src/game/engine.ts` `battleConfirm`, `menuLen`, `cancel`,
  `playerAction`, `useItem`
- Test: `src/game/battle-items.test.ts` (create)

- [ ] **Step 1: Write the failing integration tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStats, makeBeast } from "./content.ts";
import { ReliquaryGame } from "./engine.ts";
import { sequenceRandom } from "./rng.ts";
import type { BattleState } from "./types.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string, level = 10) =>
  makeBeast(id, level, { temperament: "calm", ivs: IVS });

function battleGame(party: ReturnType<typeof beast>[], foes: ReturnType<typeof beast>[], inventory: Record<string, number>): ReliquaryGame {
  const g = new ReliquaryGame({ random: sequenceRandom([0, 0, 0.5, 0.5, 0.5, 0.5]) });
  g.party = party;
  g.inventory = inventory;
  g.mode = "battle";
  g.battle = {
    kind: "wild", bg: "grass", playerIndex: 0, foes, foeIndex: 0, log: [],
    phase: "command", menuIndex: 0, shake: 0, catchStone: null,
    pendingXp: 0, escaped: false, canFlee: true, pendingSwitch: false, pendingItem: null,
  } satisfies BattleState;
  return g;
}

function openBattle(g: ReliquaryGame, phaseCommandIndex: number): void {
  g.menuIndex = phaseCommandIndex;
  g.battle!.menuIndex = phaseCommandIndex;
  g.confirm();
}

test("Quiet Bell cannot be consumed in battle", () => {
  const g = battleGame([beast("emberkit")], [beast("mothwisp")], { quiet_bell: 2 });
  openBattle(g, 2); // "Item"
  assert.equal(g.battle!.phase, "items");
  const itemIndex = g.usableItems().indexOf("quiet_bell");
  assert.ok(itemIndex >= 0, "field item remains visible so the block is explained");
  g.menuIndex = itemIndex;
  g.battle!.menuIndex = itemIndex;
  g.confirm(); // choose Quiet Bell -> item-target
  g.menuIndex = 0;
  g.battle!.menuIndex = 0;
  g.confirm(); // attempt on party[0]

  assert.equal(g.inventory.quiet_bell, 2, "must not be consumed");
  assert.equal(g.quietBell, 0, "must not still the grass");
  assert.equal(g.battle!.phase, "command", "returns to command");
  assert.ok(g.battle!.log.join(" ").includes("cannot be heard"));
});

test("revive targets a fainted creature and is consumed only once valid", () => {
  const lead = beast("emberkit", 12);
  const fallen = beast("mirewhelp", 12);
  fallen.hp = 0;
  const g = battleGame([lead, fallen], [beast("mothwisp", 5)], { phoenix_ash: 1 });
  const max = currentStats(fallen).hp;

  openBattle(g, 2); // Item
  g.menuIndex = g.usableItems().indexOf("phoenix_ash");
  g.battle!.menuIndex = g.menuIndex;
  g.confirm(); // -> item-target
  assert.equal(g.battle!.phase, "item-target");

  // Invalid: target the living lead.
  g.menuIndex = 0;
  g.battle!.menuIndex = 0;
  g.confirm();
  assert.equal(g.inventory.phoenix_ash, 1, "invalid target must not consume the item");
  assert.equal(g.battle!.phase, "item-target", "stays for another choice");

  // Valid: target the fainted creature.
  g.menuIndex = 1;
  g.battle!.menuIndex = 1;
  g.confirm();
  assert.equal(fallen.hp, Math.floor(max / 2));
  assert.equal(g.inventory.phoenix_ash, 0);
});

test("healing a fainted creature does not consume the item", () => {
  const lead = beast("emberkit", 12);
  const fallen = beast("mirewhelp", 12);
  fallen.hp = 0;
  const g = battleGame([lead, fallen], [beast("mothwisp", 5)], { tonic: 3 });

  openBattle(g, 2);
  g.menuIndex = g.usableItems().indexOf("tonic");
  g.battle!.menuIndex = g.menuIndex;
  g.confirm();
  g.menuIndex = 1; // fainted target
  g.battle!.menuIndex = 1;
  g.confirm();

  assert.equal(g.inventory.tonic, 3);
  assert.equal(g.battle!.phase, "item-target");
});

test("cancelling item-target returns to the command menu", () => {
  const g = battleGame([beast("emberkit")], [beast("mothwisp")], { tonic: 1 });
  openBattle(g, 2);
  g.menuIndex = 0;
  g.battle!.menuIndex = 0;
  g.confirm(); // -> item-target
  g.cancel();
  assert.equal(g.battle!.phase, "command");
  assert.equal(g.battle!.pendingItem, null);
  assert.equal(g.inventory.tonic, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test src/game/battle-items.test.ts`
Expected: FAIL — Quiet Bell is consumed; revive targets the active creature.

- [ ] **Step 3: Accept targeting in `menuLen` and `cancel`**

In `menuLen()` battle section, add before the `party` line:
```ts
if (b.phase === "item-target") return this.party.length;
```

In `cancel()`'s battle block, add `"item-target"` to the cancellable phases and
clear the pending item:
```ts
if (this.battle.phase === "skills" || this.battle.phase === "items" || this.battle.phase === "item-target" || this.battle.phase === "party" || this.battle.phase === "bind") {
  this.battle.pendingItem = null;
  this.battle.phase = "command";
  this.battle.menuIndex = 0;
  sfxPlay.cancel();
  this.emit();
}
```
(Preserve the `pendingSwitch` early-return added in PR-A ahead of this block.)

- [ ] **Step 4: Add the `item-target` flow to `battleConfirm`**

Replace the `b.phase === "items"` branch and add a new branch:

```ts
if (b.phase === "items") {
  const it = this.usableItems()[b.menuIndex];
  if (!it) return;
  b.phase = "item-target";
  b.pendingItem = it;
  b.menuIndex = 0;
  this.menuIndex = 0;
  sfxPlay.confirm();
  this.emit();
  return;
}
if (b.phase === "item-target") {
  const id = b.pendingItem;
  if (!id) {
    b.phase = "command";
    this.emit();
    return;
  }
  const plan = validateItemUse(ITEMS[id], this.party, b.playerIndex, true, b.menuIndex);
  if (!plan.ok) {
    const message = plan.reason === "field-only"
      ? "The Quiet Bell cannot be heard here."
      : plan.reason === "invalid-target"
        ? "That pact-beast cannot take it."
        : plan.reason === "no-target"
          ? "There is no one to use it on."
          : "Nothing happens.";
    b.log = [message];
    sfxPlay.fail();
    if (plan.reason === "field-only" || plan.reason === "no-target" || plan.reason === "unusable") {
      b.pendingItem = null;
      b.phase = "command";
      b.menuIndex = 0;
      this.menuIndex = 0;
    }
    this.emit();
    return;
  }
  b.pendingItem = null;
  this.playerAction({ type: "item", item: id, index: plan.targetIndex });
}
```

- [ ] **Step 5: Route `playerAction` items to the chosen target**

In `playerAction`'s `doPlayer`, replace the item line with:
```ts
else if (act.type === "item") this.useItem(act.item!, true, act.index);
```

- [ ] **Step 6: Rewrite `useItem` to validate before consuming**

Replace `useItem` with:

```ts
private useItem(id: string, inBattle: boolean, requestedTarget?: number): boolean {
  const def = ITEMS[id];
  const plan = validateItemUse(def, this.party, this.battle?.playerIndex ?? 0, inBattle, requestedTarget);
  if (!plan.ok) return false;
  this.inventory[id] -= 1;
  if (plan.targetIndex < 0) {
    this.quietBell = def!.power ?? 80;
    this.toastMsg("The grass stills.");
    return true;
  }
  const target = this.party[plan.targetIndex]!;
  const st = currentStats(target);
  if (def!.kind === "heal") {
    healBeast(target, def!.power ?? 40);
    sfxPlay.heal();
  } else if (def!.kind === "ether") {
    target.mp = Math.min(st.mp, target.mp + (def!.power ?? 30));
    sfxPlay.heal();
  } else if (def!.kind === "status") {
    target.status = null;
  } else if (def!.kind === "revive") {
    target.hp = Math.floor(st.hp * ((def!.power ?? 50) / 100));
  }
  if (this.battle) this.battle.log = [`${def!.name} on ${target.nickname}.`];
  return true;
}
```

Update the overworld Pack call site in `menuConfirm()` (the `menu === "items"`
branch) to `this.useItem(id, false)`.

Add the import:
```ts
import { validateItemUse } from "./systems/items.ts";
```

- [ ] **Step 7: Surface the phase in the UI**

In `src/game/ui/Overlays.tsx` `BattleHud`, add a block mirroring the `party`
block:

```tsx
{b.phase === "item-target" ? (
  <ul className="cmd">
    {snap.party.map((p, i) => (
      <li key={p.uid}>
        <button
          type="button"
          className={i === b.menuIndex ? "active" : ""}
          onClick={() => {
            game.menuIndex = i;
            if (game.battle) game.battle.menuIndex = i;
            game.confirm();
          }}
        >
          {p.nickname} <em>{p.hp} hp</em>
        </button>
      </li>
    ))}
  </ul>
) : null}
```

Do not disable fainted entries here; the engine explains invalid targets.

- [ ] **Step 8: Run the tests and full gate**

```bash
node --experimental-strip-types --test src/game/battle-items.test.ts
npm run typecheck && npm run lint && npm test && npm run validate:content && npm run build
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/game/engine.ts src/game/ui/Overlays.tsx src/game/battle-items.test.ts
git commit -m "fix(items): validate target before consuming; make Quiet Bell overworld-only"
```

---

## Self-review notes

- **Spec coverage:** B5/B6 (save durability + honest UI, C1); B7 (targeting
  model, C2+C4); B8 (validate-before-consume, C4 Step 6); B9 (Quiet Bell
  overworld-only, C4 Steps 4 and 6). RQ13 invariants and RQ14 are each covered
  by a named test.
- **Type consistency:** `pendingItem` is added in C3 before C4 uses it;
  `validateItemUse` returns `targetIndex: -1` for field items and the engine
  branches on `< 0`.
- **Turn economy:** because validation runs in `battleConfirm` before
  `playerAction`, an invalid target costs no turn and triggers no enemy action.
- **Out of scope:** explicit target *highlighting* / accessibility polish (PR-K);
  moving item effects into `systems/items.ts` as pure effect descriptors (PR-D
  can decide).
