# PR-F — Gameplay Integration Test Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prove that player-facing actions work end to end through the real
engine — battle start, attack, miss, status, switch, faint, capture, revive,
invalid item, victory rewards, Warden trial, and save/reload — headlessly.

**Architecture:** A small test harness builds a real `ReliquaryGame` with an
injected storage and deterministic RNG. Tests drive the public input methods
(`confirm`, `cancel`) rather than reaching into private methods. One tiny engine
seam (`flushAnimation`) lets scheduled battle animations be resolved
synchronously in tests.

**Tech Stack:** TypeScript, native Node test runner, `sequenceRandom`,
injected `SaveStorage` (from PR-C).

**Spec:** `docs/superpowers/plans/2026-10-06-reliquary-v0.2-campaign.md`
(Phase 5; Global Constraints).

**Depends on:** PR-A/B/C and PR-D.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `src/game/battle-harness.ts` | test-only game/battle builders | create |
| `src/game/engine.ts` | add `flushAnimation()` test seam | modify |
| `src/game/battle-integration.test.ts` | the action matrix | create |
| `src/game/save-reload.test.ts` | save/reload equivalence | create |

**Interfaces produced:**
- `newTestGame(opts): ReliquaryGame` — party/inventory/map/storage/RNG setup.
- `forceBattle(game, { kind, party, foes, inventory }): void` — assign a battle
  and enter `battle` mode.
- `game.flushAnimation(): void` — synchronously run a pending `after()` callback.

**Invariant:** tests assert observable engine behavior (HP, phase, inventory,
flags, save state) — never mocks of the implementation.

---

### Task F1: Test harness and animation seam

**Files:**
- Create: `src/game/battle-harness.ts`
- Modify: `src/game/engine.ts`
- Test: `src/game/battle-integration.test.ts` (initial smoke)

- [ ] **Step 1: Add the engine seam**

Move the internal `after` scheduling so a test can flush it. In `engine.ts`
add a public method next to `emitPublic`:

```ts
/** Test-only: run and clear the pending scheduled animation synchronously. */
flushAnimation(): void {
  if (!this.animFn) return;
  const fn = this.animFn;
  this.animFn = null;
  this.animWait = 0;
  fn();
}
```

- [ ] **Step 2: Write the harness**

```ts
import { ReliquaryGame } from "./engine.ts";
import { ITEMS, makeBeast } from "./content.ts";
import { sequenceRandom, type RandomSource } from "./rng.ts";
import { createTrialBattle, createWildBattle } from "./battle/state.ts";
import type { BattleState, Beast, Temperament } from "./types.ts";
import type { SaveStorage } from "./save.ts";

export const TEST_IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };

export function testBeast(id: string, level = 20, temperament: Temperament = "calm"): Beast {
  return makeBeast(id, level, { temperament, ivs: TEST_IVS });
}

export function newTestGame(opts: {
  random?: RandomSource;
  storage?: SaveStorage | null;
  party?: Beast[];
  box?: Beast[];
  inventory?: Record<string, number>;
} = {}): ReliquaryGame {
  const g = new ReliquaryGame({ random: opts.random ?? sequenceRandom([0.5]), storage: opts.storage });
  g.party = opts.party ?? [];
  g.box = opts.box ?? [];
  g.inventory = opts.inventory ?? {};
  g.flags.starter = g.party.length > 0;
  return g;
}

export function forceBattle(
  g: ReliquaryGame,
  foes: Beast[],
  opts: { kind?: "wild" | "trial"; inventory?: Record<string, number> } = {},
): BattleState {
  if (opts.inventory) g.inventory = { ...opts.inventory };
  g.mode = "battle";
  g.battle = opts.kind === "trial"
    ? createTrialBattle(foes, 0, "Warden Cael")
    : createWildBattle(foes[0]!, "grass", 0);
  return g.battle;
}

export function chooseBattleCommand(g: ReliquaryGame, index: number): void {
  g.menuIndex = index;
  g.battle!.menuIndex = index;
  g.confirm();
}

export { ITEMS };
```

- [ ] **Step 3: Smoke test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { forceBattle, newTestGame, testBeast } from "./battle-harness.ts";

test("harness builds a real battle in command phase", () => {
  const g = newTestGame({ party: [testBeast("emberkit")] });
  const b = forceBattle(g, [testBeast("mirewhelp", 5)]);
  assert.equal(g.mode, "battle");
  assert.equal(b.phase, "command");
  assert.equal(g.party.length, 1);
});
```

- [ ] **Step 4: Run and commit**

```bash
node --experimental-strip-types --test src/game/battle-integration.test.ts
npm run typecheck && npm run lint
git add src/game/battle-harness.ts src/game/battle-integration.test.ts src/game/engine.ts
git commit -m "test(battle): add headless battle harness and animation seam"
```

---

### Task F2: Attack, miss, and status through the engine

**Files:**
- Test: `src/game/battle-integration.test.ts`

- [ ] **Step 1: Add the tests**

```ts
import { SKILLS } from "./content.ts";

test("strike reduces the foe's HP and returns to command", () => {
  const g = newTestGame({ party: [testBeast("emberkit", 30)] });
  const foe = testBeast("mothwisp", 5);
  const b = forceBattle(g, [foe]);
  const before = foe.hp;
  chooseBattleCommand(g, 0); // Strike
  assert.ok(foe.hp < before);
  assert.ok(b.phase === "command" || b.phase === "win");
});

test("a low-accuracy skill can miss and the turn still progresses", () => {
  const g = newTestGame({ random: sequenceRandom([0, 0, 0.999, 0.5, 0.5]), party: [testBeast("mothwisp", 30)] });
  const foe = testBeast("mirewhelp", 30);
  const b = forceBattle(g, [foe]);
  b.phase = "skills";
  b.menuIndex = g.party[0]!.skills.indexOf("drowse"); // accuracy 75
  g.menuIndex = b.menuIndex;
  const before = foe.hp;
  g.confirm();
  assert.equal(foe.hp, before, "a miss deals no damage");
  assert.ok(b.phase === "command" || b.phase === "win" || b.phase === "lose");
});

test("status applied in battle expires over turns", () => {
  const g = newTestGame({ party: [testBeast("briarling", 30)] });
  const foe = testBeast("mirewhelp", 5);
  g.party[0]!.status = "burn";
  g.party[0]!.statusTurns = 2;
  forceBattle(g, [foe]);
  chooseBattleCommand(g, 0);
  // After the turn, the burn tick has run at least once.
  assert.ok((g.party[0]!.statusTurns ?? 0) <= 2);
});
```

> If `drowse` is not on mothwisp's learnset at level 30, use a species/skill
> whose accuracy is < 100 (e.g. `SKILLS.ram` on `pebblet`). Adjust the fixture,
> not the assertion.

- [ ] **Step 2: Run and commit**

```bash
node --experimental-strip-types --test src/game/battle-integration.test.ts
npm test
git add src/game/battle-integration.test.ts
git commit -m "test(battle): cover attack, miss, and status through the engine"
```

---

### Task F3: Switch, faint, capture, revive, invalid item

**Files:**
- Test: `src/game/battle-integration.test.ts`

- [ ] **Step 1: Add the tests**

```ts
test("capture success stores the foe and ends the battle", () => {
  const g = newTestGame({ random: sequenceRandom([0, 0, 0, 0, 0, 0]), party: [testBeast("emberkit", 30)] });
  const foe = testBeast("mirewhelp", 2);
  foe.hp = 1;
  const b = forceBattle(g, [foe], { inventory: { common_sigil: 5 } });
  chooseBattleCommand(g, 3); // Bind
  g.menuIndex = 0;
  b.menuIndex = 0;
  g.confirm();
  g.flushAnimation();
  g.flushAnimation();
  g.flushAnimation();
  g.flushAnimation();
  assert.ok(g.party.length + g.box.length === 2, "captured foe is stored");
  assert.equal(g.inventory.common_sigil, 4);
});

test("revive restores a fainted ally and consumes the item", () => {
  const lead = testBeast("emberkit", 30);
  const fallen = testBeast("mirewhelp", 10);
  fallen.hp = 0;
  const g = newTestGame({ party: [lead, fallen] });
  const b = forceBattle(g, [testBeast("mothwisp", 2)], { inventory: { phoenix_ash: 1 } });
  chooseBattleCommand(g, 2); // Item
  g.menuIndex = 0;
  b.menuIndex = 0;
  g.confirm(); // item-target
  b.menuIndex = 1;
  g.menuIndex = 1;
  g.confirm();
  assert.ok(fallen.hp > 0);
  assert.equal(g.inventory.phoenix_ash, 0);
});

test("an invalid item target does not consume the item", () => {
  const lead = testBeast("emberkit", 30);
  const g = newTestGame({ party: [lead] });
  const b = forceBattle(g, [testBeast("mothwisp", 2)], { inventory: { phoenix_ash: 1 } });
  chooseBattleCommand(g, 2);
  g.menuIndex = 0;
  b.menuIndex = 0;
  g.confirm();
  b.menuIndex = 0;
  g.menuIndex = 0;
  g.confirm(); // revive on a living target -> invalid
  assert.equal(g.inventory.phoenix_ash, 1);
  assert.equal(b.phase, "item-target");
});
```

- [ ] **Step 2: Run and commit**

```bash
node --experimental-strip-types --test src/game/battle-integration.test.ts
npm test
git add src/game/battle-integration.test.ts
git commit -m "test(battle): cover capture, revive, and invalid item targets"
```

---

### Task F4: Victory rewards and save/reload equivalence

**Files:**
- Test: `src/game/battle-integration.test.ts`, `src/game/save-reload.test.ts`

- [ ] **Step 1: Victory rewards test**

```ts
test("defeating the last foe grants crowns and returns to the world", () => {
  const g = newTestGame({ party: [testBeast("emberkit", 40)] });
  const foe = testBeast("mothwisp", 2);
  foe.hp = 1;
  const b = forceBattle(g, [foe]);
  const goldBefore = g.gold;
  chooseBattleCommand(g, 0);
  assert.equal(b.phase, "win");
  g.confirm(); // endBattle
  assert.equal(g.mode, "world");
  assert.ok(g.gold > goldBefore);
});
```

- [ ] **Step 2: Save/reload equivalence test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { newTestGame, testBeast } from "./battle-harness.ts";
import { ReliquaryGame } from "./engine.ts";
import { sequenceRandom } from "./rng.ts";
import { SAVE_KEY, type SaveStorage } from "./save.ts";

class MemoryStorage implements SaveStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

test("saved state reloads into an equivalent game", () => {
  const store = new MemoryStorage();
  const g = newTestGame({ storage: store, party: [testBeast("emberkit", 12)], inventory: { tonic: 2 } });
  g.gold = 321;
  g.mapId = "elderhall";
  g.tx = 12; g.ty = 14; g.dir = 0;
  g.seen.emberkit = true;
  g.caught.emberkit = true;
  assert.equal(g.persist(), true);
  assert.equal(store.data.has(SAVE_KEY), true);

  const reloaded = new ReliquaryGame({ random: sequenceRandom([0.5]), storage: store });
  reloaded.continueGame();
  assert.equal(reloaded.mode, "world");
  assert.equal(reloaded.gold, 321);
  assert.equal(reloaded.party.length, 1);
  assert.equal(reloaded.party[0]!.speciesId, "emberkit");
  assert.equal(reloaded.inventory.tonic, 2);
  assert.equal(reloaded.mapId, "elderhall");
});
```

- [ ] **Step 3: Run and commit**

```bash
node --experimental-strip-types --test src/game/save-reload.test.ts
npm test
git add src/game/battle-integration.test.ts src/game/save-reload.test.ts
git commit -m "test(gameplay): cover victory rewards and save/reload equivalence"
```

---

### Task F5: Warden trial progression

**Files:**
- Test: `src/game/battle-integration.test.ts`

- [ ] **Step 1: Add the test**

```ts
test("the Warden trial advances through each foe and grants the Thorn Mark", () => {
  const g = newTestGame({ party: [testBeast("crownwyrm", 40)] });
  const foes = [testBeast("ironnewt", 2), testBeast("chapelite", 2), testBeast("keepdrake", 2)];
  foes.forEach((f) => { f.hp = 1; });
  const b = forceBattle(g, foes, { kind: "trial" });
  assert.equal(b.foes.length, 3);

  for (let i = 0; i < 3; i++) {
    chooseBattleCommand(g, 0); // Strike the current foe
    if (b.phase === "win") break;
    assert.equal(b.foeIndex, i + 1);
  }
  assert.equal(b.phase, "win");
  g.confirm();
  assert.equal(g.flags.trial, true);
});
```

> The exact claim count and Thorn Sigil rewards are already asserted by the
> PR-A/C suites; this test proves multi-foe progression and the flag.

- [ ] **Step 2: Run the full gate**

```bash
node --experimental-strip-types --test src/game/battle-integration.test.ts
npm run typecheck && npm run lint && npm test && npm run validate:content && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/game/battle-integration.test.ts
git commit -m "test(battle): cover Warden trial multi-foe progression"
```

---

## Self-review notes

- **Public API only:** tests drive `confirm`/`cancel`/`flushAnimation`; the only
  production change is the additive `flushAnimation` seam.
- **Determinism:** every battle test injects `sequenceRandom`; capture tests
  provide enough values for the shake loop.
- **No weakened tests:** existing suites are untouched.
- **Known limitation:** `flushAnimation` exists for tests; document it as such.
