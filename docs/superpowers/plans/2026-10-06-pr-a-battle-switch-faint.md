# PR-A — Battle Switch/Faint State Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make battle switching and fainting obey three invariants: the active
index always identifies the creature on field; a pending switch is separate from
the active combatant index; and an enemy action always targets the combatant
active when that enemy action executes.

**Architecture:** Minimal state-model correction in the existing
`ReliquaryGame` engine. Add one field to `BattleState` (`pendingSwitch`), fix the
stale-reference target bug, and stop `playerDown` from silently mutating
`playerIndex`. No engine rewrite — extraction is PR-D.

**Tech Stack:** TypeScript, native Node test runner
(`node --experimental-strip-types --test`), `sequenceRandom` for deterministic
RNG.

**Spec:** `docs/superpowers/plans/2026-10-06-reliquary-v0.2-campaign.md`
(Global Constraints apply to every task).

**Defects fixed:** B1, B2, B3 in the campaign doc.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `src/game/types.ts` | `BattleState` shape | add `pendingSwitch: boolean` |
| `src/game/audio.ts` | audio bootstrap | no-op `unlockAudio` when no `AudioContext` (headless-test enabler) |
| `src/game/engine.ts` | battle orchestration | fix `playerAction`, `playerDown`, `battleConfirm`, `cancel` |
| `src/game/battle-switch.test.ts` | regression suite | **create** |

**Interfaces produced (used by later PRs):**
- `BattleState.pendingSwitch: boolean` — `true` while the player must choose a
  replacement for a fainted active creature.
- `ReliquaryGame` continues to be constructed as
  `new ReliquaryGame({ random?: RandomSource })`.
- Public fields used by tests: `party`, `box`, `battle`, `mode`, `menuIndex`,
  and public methods `confirm()`, `cancel()`.

---

### Task A1: Make engine input headless-safe (test enabler)

`confirm()` begins with `unlockAudio()`, which constructs `window.AudioContext`.
In Node there is no `window`, so any headless engine test crashes before reaching
an assertion. Production behavior is unchanged: without an audio context the
game should simply be silent.

**Files:**
- Modify: `src/game/audio.ts:11-29`
- Test: `src/game/audio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { unlockAudio } from "./audio.ts";

test("unlockAudio is a no-op when no AudioContext exists", () => {
  assert.doesNotThrow(() => unlockAudio());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/game/audio.test.ts`
Expected: FAIL — `TypeError` reading `AudioContext`/`window`.

- [ ] **Step 3: Implement the guard**

Replace the opening of `unlockAudio` in `src/game/audio.ts`:

```ts
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC({ latencyHint: "interactive" });
    // ...unchanged body...
  }
  // ...unchanged tail...
}
```

Keep the existing `if (!ctx)` block and `ctx.state === "suspended"` handling
intact; only add the two guards at the top.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/game/audio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/audio.ts src/game/audio.test.ts
git commit -m "test(engine): allow headless input by guarding audio bootstrap"
```

---

### Task A2: Add `pendingSwitch` to the battle state model

**Files:**
- Modify: `src/game/types.ts:159-184`
- Test: covered by A3

- [ ] **Step 1: Add the field**

In `BattleState`, after `menuIndex: number;` add:

```ts
  /** True while the player must replace a fainted active creature. */
  pendingSwitch: boolean;
```

- [ ] **Step 2: Initialize it at every battle construction site**

In `src/game/engine.ts`, add `pendingSwitch: false,` to the `this.battle = {...}`
literals in `startWild()` (~line 865) and `startWarden()` (~line 894).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (all `BattleState` literals now include the field).

- [ ] **Step 4: Commit**

```bash
git add src/game/types.ts src/game/engine.ts
git commit -m "feat(battle): track pending replacement switch separately from active index"
```

---

### Task A3: Write failing regression tests for switch/faint behavior

**Files:**
- Test: `src/game/battle-switch.test.ts` (create)

- [ ] **Step 1: Write the failing test suite**

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

function battleGame(
  party: ReturnType<typeof beast>[],
  foes: ReturnType<typeof beast>[],
  random = sequenceRandom([0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
): ReliquaryGame {
  const g = new ReliquaryGame({ random });
  g.party = party;
  g.mode = "battle";
  g.battle = {
    kind: "wild", bg: "grass", playerIndex: 0, foes, foeIndex: 0, log: [],
    phase: "command", menuIndex: 0, shake: 0, catchStone: null,
    pendingXp: 0, escaped: false, canFlee: true, pendingSwitch: false,
  } satisfies BattleState;
  return g;
}

function chooseCommand(g: ReliquaryGame, index: number): void {
  g.menuIndex = index;
  g.battle!.menuIndex = index;
  g.confirm();
}

test("an enemy action targets the creature active after a manual switch", () => {
  const outgoing = beast("emberkit", 20);
  const incoming = beast("mirewhelp", 20);
  const foe = beast("keepdrake", 25);
  const g = battleGame([outgoing, incoming], [foe]);
  const outgoingMax = currentStats(outgoing).hp;
  const incomingMax = currentStats(incoming).hp;

  chooseCommand(g, 4); // "Party" (wild battle: Strike, Skill, Item, Bind, Party, Flee)
  assert.equal(g.battle!.phase, "party");

  g.menuIndex = 1;
  g.battle!.menuIndex = 1;
  g.confirm(); // switch to incoming

  assert.equal(outgoing.hp, outgoingMax, "switched-out creature must not be hit");
  assert.ok(incoming.hp < incomingMax, "switched-in creature takes the enemy hit");
});

test("a fainted active creature opens a real replacement choice", () => {
  const weak = beast("mothwisp", 2);
  weak.hp = 1;
  const backup = beast("pebblet", 20);
  const foe = beast("keepdrake", 30);
  const g = battleGame([weak, backup], [foe]);

  chooseCommand(g, 0); // Strike; whichever side acts first, the foe KOs the active creature

  assert.equal(g.battle!.phase, "party", "must wait for a replacement");
  assert.equal(g.battle!.playerIndex, 0, "active index still identifies the fallen creature");
  assert.equal(g.battle!.pendingSwitch, true);
});

test("a forced replacement resumes command without granting the foe a free action", () => {
  const weak = beast("mothwisp", 2);
  weak.hp = 1;
  const backup = beast("pebblet", 20);
  const foe = beast("keepdrake", 30);
  const g = battleGame([weak, backup], [foe]);
  chooseCommand(g, 0);
  const backupMax = currentStats(backup).hp;
  const foeHpAfterFaint = foe.hp;

  g.menuIndex = 1;
  g.battle!.menuIndex = 1;
  g.confirm();

  assert.equal(g.battle!.phase, "command");
  assert.equal(g.battle!.playerIndex, 1);
  assert.equal(g.battle!.pendingSwitch, false);
  assert.equal(backup.hp, backupMax, "foe must not act again during the forced switch");
  assert.equal(foe.hp, foeHpAfterFaint, "foe must not act again during the forced switch");
});

test("selecting the fainted active creature performs no switch", () => {
  const weak = beast("mothwisp", 2);
  weak.hp = 1;
  const backup = beast("pebblet", 20);
  const foe = beast("keepdrake", 30);
  const g = battleGame([weak, backup], [foe]);
  chooseCommand(g, 0);
  assert.equal(g.battle!.phase, "party");

  g.menuIndex = 0; // the fainted creature
  g.battle!.menuIndex = 0;
  g.confirm();

  assert.equal(g.battle!.phase, "party");
  assert.equal(g.battle!.playerIndex, 0);
  assert.equal(g.battle!.pendingSwitch, true);
});

test("a forced replacement cannot be cancelled", () => {
  const weak = beast("mothwisp", 2);
  weak.hp = 1;
  const backup = beast("pebblet", 20);
  const foe = beast("keepdrake", 30);
  const g = battleGame([weak, backup], [foe]);
  chooseCommand(g, 0);
  g.cancel();
  assert.equal(g.battle!.phase, "party");
  assert.equal(g.battle!.pendingSwitch, true);
});

test("when the last creature faints the battle is lost", () => {
  const weak = beast("mothwisp", 2);
  weak.hp = 1;
  const foe = beast("keepdrake", 30);
  const g = battleGame([weak], [foe]);
  chooseCommand(g, 0);
  assert.equal(g.battle!.phase, "lose");
});
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node --experimental-strip-types --test src/game/battle-switch.test.ts`
Expected: FAIL — test 1 `incoming.hp` unchanged / `outgoing.hp` reduced;
test 2 `phase` is `"command"` not `"party"`; test 3–5 fail similarly.

- [ ] **Step 3: Commit the red tests**

```bash
git add src/game/battle-switch.test.ts
git commit -m "test(battle): regression suite for switch and faint state (red)"
```

---

### Task A4: Fix the stale encounter target and the faint flow

**Files:**
- Modify: `src/game/engine.ts` `playerAction`, `playerDown`, `battleConfirm`,
  `cancel`

- [ ] **Step 1: Fix `playerAction` turn flow**

Replace `playerAction` (engine.ts ~1033–1087) with:

```ts
private playerAction(act: { type: string; skill?: string; item?: string; index?: number }): void {
  const b = this.battle!;
  const me = this.party[b.playerIndex]!;
  const foe = b.foes[b.foeIndex]!;
  const playerFirst = playerActsFirst(me, foe, this.random) || act.type === "item" || act.type === "switch" || act.type === "bind";
  const doPlayer = () => {
    if (me.hp <= 0) return;
    if (act.type === "strike") this.useSkill(me, foe, false, basicStrike(me), true);
    else if (act.type === "skill") {
      const sk = SKILLS[act.skill!];
      if (!sk) return;
      if (!spendSkillMp(me, sk)) {
        b.log = [`${me.nickname} hasn't the breath.`];
        return;
      }
      this.useSkill(me, foe, false, sk, true);
    } else if (act.type === "item") this.useItem(act.item!, this.party[b.playerIndex]!, true);
    else if (act.type === "bind") this.tryCatch(act.item!);
    else if (act.type === "switch") {
      b.playerIndex = act.index!;
      b.log = [`${this.party[b.playerIndex]!.nickname} steps forward.`];
    }
  };
  const doFoe = () => {
    const active = this.party[b.playerIndex]!;
    if (foe.hp <= 0 || b.phase === "catch" || b.escaped || active.hp <= 0) return;
    this.foeTurn(foe, active);
  };
  if (playerFirst) {
    doPlayer();
    if (b.phase === "catch") return;
    if (foe.hp <= 0) {
      this.foeDown();
      return;
    }
    doFoe();
    if (this.party[b.playerIndex]!.hp <= 0) {
      this.playerDown();
      return;
    }
  } else {
    doFoe();
    if (this.party[b.playerIndex]!.hp <= 0) {
      this.playerDown();
      return;
    }
    doPlayer();
    if (b.phase === "catch") return;
    if (foe.hp <= 0) this.foeDown();
  }
  if (b.phase !== "win" && b.phase !== "lose") {
    b.phase = "command";
    b.menuIndex = 0;
    this.menuIndex = 0;
    this.tickStatus(this.party[b.playerIndex]!);
    this.tickStatus(foe);
  }
  this.emit();
}
```

Key changes: `doFoe` reads the **current** active creature; both faint branches
`return` immediately after `playerDown()`; `useItem` now receives the current
target (its signature changes in PR-C; here it keeps the old `useItem(id,
target, inBattle)` signature).

- [ ] **Step 2: Fix `playerDown`**

Replace `playerDown` (engine.ts ~1193–1207) with:

```ts
private playerDown(): void {
  const b = this.battle!;
  const fallen = this.party[b.playerIndex]!;
  sfxPlay.faint();
  const next = this.party.findIndex((p) => p.hp > 0);
  if (next >= 0) {
    b.log = [`${fallen.nickname} cannot stand.`, "Choose another."];
    b.phase = "party";
    b.pendingSwitch = true;
    b.menuIndex = next;
    this.menuIndex = next;
    this.emit();
    return;
  }
  b.log = ["The lantern goes out."];
  b.phase = "lose";
  this.emit();
}
```

`playerIndex` is deliberately **not** changed here: it continues to identify the
fallen creature until the player chooses a replacement.

- [ ] **Step 3: Fix the party confirm branch**

Replace the `b.phase === "party"` branch of `battleConfirm`
(engine.ts ~1005–1012) with:

```ts
if (b.phase === "party") {
  const idx = b.menuIndex;
  const target = this.party[idx];
  if (!target || target.hp <= 0) return;
  if (idx === b.playerIndex) return;
  if (b.pendingSwitch) {
    b.playerIndex = idx;
    b.pendingSwitch = false;
    b.phase = "command";
    b.menuIndex = 0;
    this.menuIndex = 0;
    b.log = [`${this.party[idx]!.nickname} steps forward.`];
    sfxPlay.confirm();
    this.emit();
    return;
  }
  this.playerAction({ type: "switch", index: idx });
}
```

> When PR-C lands, the item branch will route through the new targeting model;
> keep this party branch as-is.

- [ ] **Step 4: Prevent cancelling a forced replacement**

In `cancel()` (engine.ts ~598–606), before the existing battle-phase cancel
block, add:

```ts
if (this.battle) {
  if (this.battle.phase === "party" && this.battle.pendingSwitch) return;
  if (this.battle.phase === "skills" || this.battle.phase === "items" || this.battle.phase === "party" || this.battle.phase === "bind") {
    // ...existing body unchanged...
  }
  return;
}
```

- [ ] **Step 5: Run the regression suite**

Run: `node --experimental-strip-types --test src/game/battle-switch.test.ts`
Expected: PASS (all six tests).

- [ ] **Step 6: Run the full gate**

```bash
npm run typecheck
npm run lint
npm test
npm run validate:content
npm run build
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/game/engine.ts
git commit -m "fix(battle): target active creature and defer replacement choice after faint"
```

---

## Self-review notes

- **Spec coverage:** campaign defects B1 (stale target), B2 (clobbered forced
  switch), B3 (pending vs active index) are each covered by a named test.
- **Type consistency:** `pendingSwitch` is added to `BattleState` (Task A2)
  before it is referenced in tests (A3) and engine (A4). `useItem(id, target,
  inBattle)` keeps its current signature in this PR; PR-C owns its change.
- **Out of scope:** explicit item targeting / Quiet Bell (PR-C); reducer
  extraction (PR-D); UI prompt for the forced switch beyond the existing party
  list (PR-K).
