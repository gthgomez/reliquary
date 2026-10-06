# PR-B — Canonical Combat Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the production engine call the tested combat system for all
elemental damage, so `systems/combat.ts` is the single authoritative
implementation and the engine contains no second copy.

**Architecture:** Extend `resolveElementalDamage` to include the status
modifiers the engine currently applies (ward/bless), then replace the damage
branch of `ReliquaryGame.useSkill` with a call to it. Heal and status-only
skills keep their existing branches. RNG consumption order is preserved.

**Tech Stack:** TypeScript, native Node test runner, `sequenceRandom`.

**Spec:** `docs/superpowers/plans/2026-10-06-reliquary-v0.2-campaign.md`
(Global Constraints apply).

**Defect fixed:** B4 in the campaign doc.

**Depends on:** PR-A (battle switch/faint) for a stable battle turn flow. If
executing before PR-A lands, the engine test must avoid switch/faint paths.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `src/game/systems/combat.ts` | pure combat rules | add ward/bless modifiers to the resolver |
| `src/game/engine.ts` | orchestration | `useSkill` delegates damage to the resolver |
| `src/game/battle-combat.test.ts` | integration proof | **create** |

**Interfaces produced:**
- `resolveElementalDamage(attacker, defender, skill, attackerElements,
  defenderElements, random): SkillResolution` remains the canonical damage
  function; `SkillResolution = { hit, critical, damage, multiplier }`.
- After this PR, no other module computes `base * stab * multiplier * crit *
  variance`.

---

### Task B1: Add status modifiers to the canonical resolver

The engine currently applies `ward`/`bless` *after* the base formula
(`engine.ts:1120-1121`). For the resolver to be authoritative, it must own them
too.

**Files:**
- Modify: `src/game/systems/combat.ts:35-40`

- [ ] **Step 1: Extend the resolver**

Replace the tail of `resolveElementalDamage` (from the `const critical` line
onward) with:

```ts
  const critical = random() < .06 + aStats.lck / 400;
  let damage = Math.max(1, Math.floor(base * stab * multiplier * (critical ? 1.6 : 1) * (.85 + random() * .15)));
  if (defender.status === "ward") damage = Math.floor(damage * .7);
  if (attacker.status === "bless") damage = Math.floor(damage * 1.15);
  return { hit: true, critical, damage, multiplier };
```

This preserves the engine's exact arithmetic and RNG order. (The existing
`systems.test.ts` uses neutral-status beasts, so its expectations are
unchanged.)

- [ ] **Step 2: Run the existing system tests**

Run: `npm test`
Expected: PASS (55 tests, unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/game/systems/combat.ts
git commit -m "refactor(combat): own ward/bless modifiers in the canonical resolver"
```

---

### Task B2: Write the integration test with an independent oracle

**Files:**
- Test: `src/game/battle-combat.test.ts` (create)

- [ ] **Step 1: Write the test with an independent damage oracle**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStats, makeBeast, SPECIES, typeMod } from "./content.ts";
import { ReliquaryGame } from "./engine.ts";
import { sequenceRandom } from "./rng.ts";
import type { BattleState, Beast, Skill } from "./types.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string, level = 10) =>
  makeBeast(id, level, { temperament: "calm", ivs: IVS });

function strikeFor(b: Beast): Skill {
  return {
    id: "strike", name: "Strike", element: SPECIES[b.speciesId]!.elements[0]!,
    kind: "strike", power: 45, accuracy: 100, mp: 0, desc: "A plain blow.",
  };
}

/**
 * Independent restatement of the canonical strike rule, used only as a test
 * oracle so a mutation in systems/combat.ts is observable here. It calls the
 * SAME number of RNG draws in the same order as production.
 */
function oracleDamage(me: Beast, foe: Beast, skill: Skill, r: () => number): number {
  const aS = currentStats(me);
  const dS = currentStats(foe);
  const atkStat = skill.kind === "strike" ? aS.atk : aS.mag;
  const defStat = skill.kind === "strike" ? dS.def : dS.res;
  const base = Math.floor((2 * me.level / 5 + 2) * skill.power * atkStat / Math.max(1, defStat) / 50) + 2;
  const stab = SPECIES[me.speciesId]!.elements.includes(skill.element) ? 1.25 : 1;
  const mul = typeMod(skill.element, SPECIES[foe.speciesId]!.elements);
  const crit = r() < .06 + aS.lck / 400;
  let dmg = Math.max(1, Math.floor(base * stab * mul * (crit ? 1.6 : 1) * (.85 + r() * .15)));
  if (foe.status === "ward") dmg = Math.floor(dmg * .7);
  if (me.status === "bless") dmg = Math.floor(dmg * 1.15);
  return dmg;
}

function battleGame(party: Beast[], foes: Beast[], random: () => number): ReliquaryGame {
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

test("engine strike damage is produced by the canonical combat rule", () => {
  const me = beast("galeskip", 20);
  const foe = beast("mothwisp", 18);
  // Order draw (playerActsFirst) then crit/variance; galeskip is faster.
  const seq = [0.1, 0.9, 0.99, 0.42];
  const g = battleGame([me], [foe], sequenceRandom(seq));
  const before = foe.hp;

  // The engine consumes two RNG draws for turn order before resolving.
  const expected = oracleDamage(me, foe, strikeFor(me), sequenceRandom(seq.slice(2)));

  g.menuIndex = 0;
  g.battle!.menuIndex = 0;
  g.confirm(); // "Strike"

  assert.equal(foe.hp, before - expected);
});
```

- [ ] **Step 2: Run the test (it can pass before the refactor — see Step 3)**

Run: `node --experimental-strip-types --test src/game/battle-combat.test.ts`
Expected: PASS or FAIL, *inconclusive*. The oracle is a copy of the rule, so it
cannot by itself prove the engine calls the resolver. The mutation test in
Task B3 Step 5 is what proves routing. Do not tune the oracle to force a red
here.

- [ ] **Step 3: Commit the test**

```bash
git add src/game/battle-combat.test.ts
git commit -m "test(combat): assert engine damage matches the canonical oracle"
```

---

### Task B3: Make `useSkill` delegate damage to the resolver

**Files:**
- Modify: `src/game/engine.ts:1088-1134`
- Modify: `src/game/engine.ts:16` (import)

- [ ] **Step 1: Import the resolver**

Change the `systems/combat.ts` import in `engine.ts` to include
`resolveElementalDamage`:

```ts
import { accuracySucceeds, healBeast, playerActsFirst, resolveElementalDamage, spendSkillMp, statusSucceeds } from "./systems/combat.ts";
```

- [ ] **Step 2: Replace `useSkill`**

Replace the entire `useSkill` method with:

```ts
private useSkill(atk: Beast, def: Beast, foeSide: boolean, skill: Skill, logIt: boolean): void {
  const b = this.battle!;
  const aS = currentStats(atk);
  if (skill.kind === "heal") {
    if (!accuracySucceeds(skill, atk, this.random)) {
      if (logIt) b.log = [`${atk.nickname}'s ${skill.name} misses.`];
      sfxPlay.fail();
      return;
    }
    const heal = healBeast(atk, skill.power * (aS.mag / 40));
    b.log = [`${atk.nickname} mends for ${heal}.`];
    sfxPlay.heal();
    return;
  }
  if (skill.kind === "ward" || skill.kind === "hex" && skill.power === 0) {
    if (!accuracySucceeds(skill, atk, this.random)) {
      if (logIt) b.log = [`${atk.nickname}'s ${skill.name} misses.`];
      sfxPlay.fail();
      return;
    }
    if (skill.status) {
      applyStatus(def, skill.status);
      b.log = [`${skill.name}: ${def.nickname} is ${skill.status}.`];
    }
    sfxPlay.menu();
    return;
  }
  const resolution = resolveElementalDamage(
    atk,
    def,
    skill,
    SPECIES[atk.speciesId]!.elements,
    SPECIES[def.speciesId]!.elements,
    this.random,
  );
  if (!resolution.hit) {
    if (logIt) b.log = [`${atk.nickname}'s ${skill.name} misses.`];
    sfxPlay.fail();
    return;
  }
  def.hp = Math.max(0, def.hp - resolution.damage);
  let line = `${atk.nickname} uses ${skill.name}! ${resolution.damage} harm.`;
  if (resolution.multiplier > 1.2) line += " It bites deep.";
  else if (resolution.multiplier < 0.8) line += " It glances.";
  if (resolution.critical) line += " A true cut.";
  if (skill.status && statusSucceeds(skill.statusChance ?? 0, this.random) && def.hp > 0) {
    applyStatus(def, skill.status);
    line += ` ${def.nickname} is ${skill.status}.`;
  }
  b.log = [line];
  if (resolution.critical) sfxPlay.crit();
  else sfxPlay.hit();
}
```

`foeSide` is retained for signature compatibility (enemy turns also call
`useSkill`); it was already unused for damage direction.

- [ ] **Step 3: Confirm no duplicate formula remains in the engine**

Run: `grep -n "1.6\|\.85 + this.random\|Math.max(1, Math.floor(base" src/game/engine.ts`
Expected: no matches.

- [ ] **Step 4: Run the test and full gate**

```bash
node --experimental-strip-types --test src/game/battle-combat.test.ts
npm run typecheck
npm run lint
npm test
npm run validate:content
npm run build
```

Expected: all PASS.

- [ ] **Step 5: Re-run the negative control (acceptance)**

Change `1.25` → `9.0` in `src/game/systems/combat.ts`; run the engine test.

Expected: **FAIL** — proving the integrated engine observes the mutated system.
Then revert to `1.25` and re-run to confirm PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/engine.ts
git commit -m "refactor(battle): route all engine damage through systems/combat"
```

---

## Self-review notes

- **Spec coverage:** B4 fixed; RQ11 acceptance (negative control) is an explicit
  step (B3 Step 5).
- **RNG order:** heal/ward branches still draw accuracy first; damage branch
  draws accuracy (via resolver, short-circuited for 100% skills), crit, variance
  — identical to the pre-change engine.
- **Type consistency:** `resolveElementalDamage` signature unchanged; only its
  internal arithmetic grows. The test oracle is a deliberately frozen copy for
  mutation detection, not a second production implementation.
- **Out of scope:** moving status-application rolls into the resolver (PR-D
  can decide); explicit `CombatResolution.statusApplied` (only add if PR-D needs
  it).
