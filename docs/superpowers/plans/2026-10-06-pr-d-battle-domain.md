# PR-D — Battle Domain Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extract a testable battle domain from `engine.ts`: an action/event
vocabulary, battle-state factories, enemy AI, and pure attack resolution — so
battle decisions are exercised without a DOM or the engine.

**Architecture:** New `src/game/battle/` modules hold pure logic; `engine.ts`
keeps orchestration and maps domain events to logs/audio/snapshot. This PR is
the first step of Phase 3; the full battle reducer migration continues in PR-E.

**Tech Stack:** TypeScript, native Node test runner, `sequenceRandom`.

**Spec:** `docs/superpowers/plans/2026-10-06-reliquary-v0.2-campaign.md`
(Global Constraints apply).

**Depends on:** PR-A, PR-B, PR-C (all merged into `campaign/reliquary-v0.2`).

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `src/game/battle/actions.ts` | `BattleAction` / `BattleEvent` union types | create |
| `src/game/battle/state.ts` | battle-state factories + active accessors | create |
| `src/game/battle/ai.ts` | pure enemy skill selection | create |
| `src/game/battle/resolution.ts` | pure attack outcome (damage/heal/status + events) | create |
| `src/game/battle/reducer.ts` | `reduceAttack` pure transition | create |
| `src/game/engine.ts` | call the new modules | modify |
| tests | `battle/ai.test.ts`, `battle/resolution.test.ts`, `battle/state.test.ts` | create |

**Interfaces produced (consumed by PR-E):**
- `BattleAction`, `BattleEvent` (actions.ts)
- `createWildBattle`, `createTrialBattle`, `activeBeast`, `activeFoe` (state.ts)
- `chooseFoeSkill(foe, targetElements, skills, fallback): Skill` (ai.ts)
- `resolveAttack(attacker, defender, skill, rng): AttackOutcome` (resolution.ts)
- `reduceAttack(attacker, defender, skill, rng): { defenderHp: number; outcome: AttackOutcome }` (reducer.ts)

**Invariants:** RNG draw order is preserved exactly (PR-B's oracle and the
`systems.test.ts` ward/bless assertions must stay green). No gameplay change.
`engine.ts` must not re-implement any domain rule.

---

### Task D1: Action and event vocabulary

**Files:**
- Create: `src/game/battle/actions.ts`

- [ ] **Step 1: Write the types**

```ts
export type BattleAction =
  | { type: "strike" }
  | { type: "skill"; skill: string }
  | { type: "item"; item: string; targetIndex: number }
  | { type: "bind"; item: string }
  | { type: "switch"; index: number }
  | { type: "flee" };

export type BattleEvent =
  | { kind: "message"; text: string }
  | { kind: "hit"; critical: boolean }
  | { kind: "miss" }
  | { kind: "heal" }
  | { kind: "status" }
  | { kind: "faint" }
  | { kind: "confirm" }
  | { kind: "fail" };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/game/battle/actions.ts
git commit -m "feat(battle): add action and event vocabulary"
```

---

### Task D2: Battle-state factories

Extract the two `this.battle = {...}` literals from `engine.ts` so battle
construction is testable and identical in shape.

**Files:**
- Create: `src/game/battle/state.ts`
- Modify: `src/game/engine.ts` `startWild`, `startWarden`
- Test: `src/game/battle/state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast, SPECIES } from "../content.ts";
import { createTrialBattle, createWildBattle, activeBeast, activeFoe } from "./state.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string) => makeBeast(id, 5, { temperament: "calm", ivs: IVS });

test("wild battle starts in command with an opening log", () => {
  const foe = beast("mirewhelp");
  const b = createWildBattle(foe, "marsh", 0);
  assert.equal(b.kind, "wild");
  assert.equal(b.phase, "command");
  assert.equal(b.canFlee, true);
  assert.equal(b.pendingItem, null);
  assert.equal(b.pendingSwitch, false);
  assert.equal(b.foes[0], foe);
  assert.match(b.log[0]!, new RegExp(SPECIES.mirewhelp.name));
});

test("trial battle has the trainer, ordered foes, and no flee", () => {
  const b = createTrialBattle([beast("ironnewt"), beast("chapelite")], 0, "Warden Cael");
  assert.equal(b.kind, "trial");
  assert.equal(b.canFlee, false);
  assert.equal(b.trainerName, "Warden Cael");
  assert.equal(b.foes.length, 2);
});

test("active accessors track indices", () => {
  const party = [beast("emberkit"), beast("pebblet")];
  const b = createTrialBattle([beast("ironnewt"), beast("chapelite")], 1, "Cael");
  assert.equal(activeBeast(b, party), party[1]);
  b.foeIndex = 1;
  assert.equal(activeFoe(b).speciesId, "chapelite");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/game/battle/state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the factories**

```ts
import { SPECIES } from "../content.ts";
import type { BattleBg, BattleState, Beast } from "../types.ts";

export function createWildBattle(foe: Beast, bg: BattleBg, playerIndex: number): BattleState {
  return {
    kind: "wild", bg, playerIndex, foes: [foe], foeIndex: 0,
    log: [`A wild ${SPECIES[foe.speciesId]!.name} steps from the ${bg}.`],
    phase: "command", menuIndex: 0, pendingItem: null, pendingSwitch: false,
    shake: 0, catchStone: null, pendingXp: 0, escaped: false, canFlee: true,
  };
}

export function createTrialBattle(foes: Beast[], playerIndex: number, trainerName: string): BattleState {
  return {
    kind: "trial", bg: "keep", playerIndex, foes, foeIndex: 0, trainerName,
    log: [`${trainerName} sends out ${SPECIES[foes[0]!.speciesId]!.name}.`],
    phase: "command", menuIndex: 0, pendingItem: null, pendingSwitch: false,
    shake: 0, catchStone: null, pendingXp: 0, escaped: false, canFlee: false,
  };
}

export function activeBeast(battle: BattleState, party: Beast[]): Beast {
  return party[battle.playerIndex]!;
}

export function activeFoe(battle: BattleState): Beast {
  return battle.foes[battle.foeIndex]!;
}
```

- [ ] **Step 4: Use the factories in the engine**

Replace the `this.battle = {...}` literal in `startWild()` with:

```ts
this.encounterLock = true;
sfxPlay.encounter();
this.battle = createWildBattle(foe, this.map().battleBg, this.firstAble());
this.mode = "battle";
this.menuIndex = 0;
this.emit();
```

Replace the literal in `startWarden()` with:

```ts
this.battle = createTrialBattle(foes, this.firstAble(), "Warden Cael");
this.mode = "battle";
this.emit();
```

Add `import { createTrialBattle, createWildBattle } from "./battle/state.ts";`
and remove now-unused imports only if the compiler/lint flags them.

- [ ] **Step 5: Run tests and full gate**

```bash
node --experimental-strip-types --test src/game/battle/state.test.ts
npm run typecheck && npm run lint && npm test && npm run validate:content && npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/battle/state.ts src/game/battle/state.test.ts src/game/engine.ts
git commit -m "refactor(battle): extract battle-state factories from the engine"
```

---

### Task D3: Pure enemy skill selection

Extract `foeTurn`'s selection logic (the heal-if-low branch and the
power×typeMod score loop) from `engine.ts`.

**Files:**
- Create: `src/game/battle/ai.ts`
- Test: `src/game/battle/ai.test.ts`
- Modify: `src/game/engine.ts` `foeTurn`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast, SKILLS, SPECIES } from "../content.ts";
import { chooseFoeSkill } from "./ai.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string, level = 20) =>
  makeBeast(id, level, { temperament: "calm", ivs: IVS });

test("picks the highest power×effectiveness affordable skill", () => {
  const foe = beast("emberkit");
  const target = beast("briarling"); // verdant -> ember is strong
  const chosen = chooseFoeSkill(foe, SPECIES.briarling.elements, [SKILLS.nip, SKILLS.cinder], SKILLS.nip);
  assert.equal(chosen.id, "cinder");
});

test("uses a heal when below a third of max HP and MP allows", () => {
  const foe = beast("briarling");
  foe.hp = 1;
  const chosen = chooseFoeSkill(foe, SPECIES.emberkit.elements, [SKILLS.nip, SKILLS.mossmend], SKILLS.nip);
  assert.equal(chosen.id, "mossmend");
});

test("uses the first skill when none is eligible, preserving original fallback", () => {
  const foe = beast("emberkit");
  foe.mp = 0;
  const chosen = chooseFoeSkill(foe, SPECIES.briarling.elements, [SKILLS.cinder], SKILLS.nip);
  assert.equal(chosen.id, "cinder");
});

test("uses the fallback skill when the skill list is empty", () => {
  const foe = beast("emberkit");
  const chosen = chooseFoeSkill(foe, SPECIES.briarling.elements, [], SKILLS.nip);
  assert.equal(chosen.id, "nip");
});
```

> Note: `SKILLS.cinder` costs 6 MP; `beast("emberkit", 20)` has enough MP.
> If a fixture unexpectedly lacks MP, set `foe.mp` explicitly in the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/game/battle/ai.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { currentStats, typeMod } from "../content.ts";
import type { Beast, ElementId, Skill } from "../types.ts";

/** Pure enemy skill choice. MP spending stays with the caller. */
export function chooseFoeSkill(
  foe: Beast,
  targetElements: ElementId[],
  skills: Skill[],
  fallback: Skill,
): Skill {
  const stats = currentStats(foe);
  if (foe.hp < stats.hp * .35) {
    const heal = skills.find((s) => s.kind === "heal" && foe.mp >= s.mp);
    if (heal) return heal;
  }
  let best = skills[0] ?? fallback;
  let bestScore = -1;
  for (const s of skills) {
    if (s.mp > foe.mp || s.kind === "heal") continue;
    const score = s.power * typeMod(s.element, targetElements);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}
```

- [ ] **Step 4: Use it in `foeTurn`**

Replace the selection body of `foeTurn` (everything before
`if (best.mp) foe.mp = ...`) with:

```ts
private foeTurn(foe: Beast, me: Beast): void {
  const skills = foe.skills.map((id) => SKILLS[id]).filter(Boolean) as Skill[];
  const best = chooseFoeSkill(foe, SPECIES[me.speciesId]!.elements, skills, SKILLS.nip);
  if (best.mp) foe.mp = Math.max(0, foe.mp - best.mp);
  this.useSkill(foe, me, true, best, true);
}
```

Add `import { chooseFoeSkill } from "./battle/ai.ts";`. Keep `playerActsFirst`
and existing imports as needed.

- [ ] **Step 5: Run tests and full gate**

```bash
node --experimental-strip-types --test src/game/battle/ai.test.ts
npm run typecheck && npm run lint && npm test && npm run validate:content && npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/battle/ai.ts src/game/battle/ai.test.ts src/game/engine.ts
git commit -m "refactor(battle): extract pure enemy skill selection"
```

---

### Task D4: Pure attack resolution + reducer

Compose the existing combat primitives into one pure transition that returns
events instead of performing logs/audio, and have the engine consume it.

**Files:**
- Create: `src/game/battle/resolution.ts`, `src/game/battle/reducer.ts`
- Test: `src/game/battle/resolution.test.ts`, `src/game/battle/reducer.test.ts`
- Modify: `src/game/engine.ts` `useSkill` (now imports `reduceAttack`)

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStats, makeBeast, SKILLS, SPECIES } from "../content.ts";
import { sequenceRandom } from "../rng.ts";
import { resolveAttack } from "./resolution.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string, level = 18) =>
  makeBeast(id, level, { temperament: "calm", ivs: IVS });

test("a damaging skill reduces the defender's HP and emits a hit event", () => {
  const attacker = beast("emberkit");
  const defender = beast("mothwisp");
  const before = defender.hp;
  const outcome = resolveAttack(attacker, defender, SKILLS.cinder, sequenceRandom([.99, .5]));
  assert.ok(outcome.damage > 0);
  assert.equal(defender.hp, before - outcome.damage);
  assert.ok(outcome.events.some((e) => e.kind === "hit"));
});

test("heal restores HP without damaging", () => {
  const attacker = beast("briarling");
  attacker.hp = 1;
  const outcome = resolveAttack(attacker, beast("mothwisp"), SKILLS.mossmend, sequenceRandom([.5]));
  assert.ok(outcome.healed > 0);
  assert.equal(outcome.damage, 0);
  assert.ok(outcome.events.some((e) => e.kind === "heal"));
});

test("ward applies a status without damage", () => {
  const defender = beast("mirewhelp");
  const outcome = resolveAttack(beast("mothwisp"), defender, SKILLS.wardveil, sequenceRandom([.5]));
  assert.equal(defender.status, "ward");
  assert.equal(outcome.damage, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/game/battle/resolution.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement resolution and reducer**

`src/game/battle/resolution.ts`:

```ts
import { accuracySucceeds, healBeast, isNonDamagingSkill, resolveElementalDamage, statusSucceeds } from "../systems/combat.ts";
import { applyStatus } from "../systems/status.ts";
import { currentStats, SPECIES } from "../content.ts";
import type { Beast, Skill, StatusId } from "../types.ts";
import type { RandomSource } from "../rng.ts";
import type { BattleEvent } from "./actions.ts";

export type AttackOutcome = {
  damage: number;
  healed: number;
  hit: boolean;
  critical: boolean;
  statusApplied: StatusId | null;
  events: BattleEvent[];
};

export function resolveAttack(attacker: Beast, defender: Beast, skill: Skill, rng: RandomSource): AttackOutcome {
  const events: BattleEvent[] = [];
  const outcome: AttackOutcome = { damage: 0, healed: 0, hit: false, critical: false, statusApplied: null, events };
  const miss = () => {
    events.push({ kind: "miss" }, { kind: "message", text: `${attacker.nickname}'s ${skill.name} misses.` });
  };

  if (skill.kind === "heal") {
    if (!accuracySucceeds(skill, attacker, rng)) {
      miss();
      return outcome;
    }
    const aS = currentStats(attacker);
    outcome.healed = healBeast(attacker, skill.power * (aS.mag / 40));
    outcome.hit = true;
    events.push({ kind: "heal" }, { kind: "message", text: `${attacker.nickname} mends for ${outcome.healed}.` });
    return outcome;
  }

  if (isNonDamagingSkill(skill)) {
    if (!accuracySucceeds(skill, attacker, rng)) {
      miss();
      return outcome;
    }
    outcome.hit = true;
    if (skill.status) {
      applyStatus(defender, skill.status);
      outcome.statusApplied = skill.status;
      events.push({ kind: "status" }, { kind: "message", text: `${skill.name}: ${defender.nickname} is ${skill.status}.` });
    }
    return outcome;
  }

  const result = resolveElementalDamage(
    attacker, defender, skill,
    SPECIES[attacker.speciesId]!.elements, SPECIES[defender.speciesId]!.elements, rng,
  );
  if (!result.hit) {
    miss();
    return outcome;
  }
  defender.hp = Math.max(0, defender.hp - result.damage);
  outcome.damage = result.damage;
  outcome.hit = true;
  outcome.critical = result.critical;
  let text = `${attacker.nickname} uses ${skill.name}! ${result.damage} harm.`;
  if (result.multiplier > 1.2) text += " It bites deep.";
  else if (result.multiplier < .8) text += " It glances.";
  if (result.critical) text += " A true cut.";
  events.push({ kind: "hit", critical: result.critical }, { kind: "message", text });
  if (skill.status && statusSucceeds(skill.statusChance ?? 0, rng) && defender.hp > 0) {
    applyStatus(defender, skill.status);
    outcome.statusApplied = skill.status;
    events.push({ kind: "status" }, { kind: "message", text: `${defender.nickname} is ${skill.status}.` });
  }
  return outcome;
}
```

`src/game/battle/reducer.ts`:

```ts
import { resolveAttack, type AttackOutcome } from "./resolution.ts";
import type { Beast, Skill } from "../types.ts";
import type { RandomSource } from "../rng.ts";

/** state (attacker, defender, skill) + RNG -> mutated outcome + events. */
export function reduceAttack(
  attacker: Beast,
  defender: Beast,
  skill: Skill,
  rng: RandomSource,
): { defenderHp: number; outcome: AttackOutcome } {
  const outcome = resolveAttack(attacker, defender, skill, rng);
  return { defenderHp: defender.hp, outcome };
}
```

- [ ] **Step 4: Write the reducer test**

`src/game/battle/reducer.test.ts` asserts `reduceAttack` returns the mutated
`defenderHp` and the same events as `resolveAttack` for the same RNG sequence:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast, SKILLS } from "../content.ts";
import { sequenceRandom } from "../rng.ts";
import { reduceAttack } from "./reducer.ts";
import { resolveAttack } from "./resolution.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string, level = 18) =>
  makeBeast(id, level, { temperament: "calm", ivs: IVS });

test("reduceAttack returns the mutated defenderHp and the same events as resolveAttack", () => {
  const attacker = beast("emberkit");
  const viaReducer = beast("mothwisp");
  const viaResolve = beast("mothwisp");
  const before = viaReducer.hp;
  const seq = [.99, .5];

  const { defenderHp, outcome } = reduceAttack(attacker, viaReducer, SKILLS.cinder, sequenceRandom(seq));
  const expected = resolveAttack(attacker, viaResolve, SKILLS.cinder, sequenceRandom(seq));

  assert.ok(defenderHp < before);
  assert.equal(defenderHp, viaReducer.hp);
  assert.equal(defenderHp, viaResolve.hp);
  assert.equal(outcome.damage, expected.damage);
  assert.deepEqual(outcome.events, expected.events);
});
```

Run: `node --experimental-strip-types --test src/game/battle/reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Make `engine.useSkill` consume `reduceAttack`**

Replace the body of `useSkill` with an adapter that calls `reduceAttack` and
maps events to `b.log` and sfx:

```ts
private useSkill(atk: Beast, def: Beast, _foeSide: boolean, skill: Skill, logIt: boolean): void {
  const b = this.battle!;
  const outcome = reduceAttack(atk, def, skill, this.random).outcome;
  const messages = outcome.events.filter((e) => e.kind === "message").map((e) => e.text);
  const missed = outcome.events.some((e) => e.kind === "miss");
  if (messages.length && (logIt || !missed)) b.log = [messages.join(" ")];
  if (missed) sfxPlay.fail();
  else if (outcome.events.some((e) => e.kind === "heal")) sfxPlay.heal();
  else if (outcome.events.some((e) => e.kind === "hit" && e.critical)) sfxPlay.crit();
  else if (outcome.events.some((e) => e.kind === "hit")) sfxPlay.hit();
  else sfxPlay.menu();
}
```

> `reduceAttack` is the production entry point (`engine.useSkill` imports it,
> not `resolveAttack`). The adapter joins all message events into a single
> `battle.log` entry so the HUD (`log[log.length - 1]`) shows the full line,
> including a damaging hit that also applies a status.

- [ ] **Step 6: Run tests and full gate**

The existing `battle-combat.test.ts` and `systems.test.ts` must stay green
(RNG order preserved). Run:

```bash
node --experimental-strip-types --test src/game/battle/resolution.test.ts
node --experimental-strip-types --test src/game/battle/reducer.test.ts
node --experimental-strip-types --test src/game/battle-combat.test.ts
npm run typecheck && npm run lint && npm test && npm run validate:content && npm run build
```

Expected: all PASS. If `battle-combat.test.ts` fails, the RNG order or damage
mapping drifted — fix the adapter, not the test.

- [ ] **Step 7: Commit**

```bash
git add src/game/battle/resolution.ts src/game/battle/reducer.ts src/game/battle/resolution.test.ts src/game/battle/reducer.test.ts src/game/engine.ts
git commit -m "refactor(battle): route engine attacks through a pure resolution/reducer"
```

---

## Self-review notes

- **RNG parity:** `resolveAttack` calls the same primitives in the same order as
  the pre-refactor `useSkill`, so PR-B's oracle stays green.
- **Scope:** item/capture/XP/win-loss orchestration remain in the engine; the
  full reducer migration is PR-E. This keeps PR-D reviewable.
- **Interfaces:** `chooseFoeSkill` takes a `fallback` skill (no content import
  of `SKILLS` inside ai.ts) to stay pure and testable.
- **Out of scope:** moving `playerAction` turn ordering into a reducer; DOM-free
  battle *simulation* of a whole fight (start with `reduceAttack`).
