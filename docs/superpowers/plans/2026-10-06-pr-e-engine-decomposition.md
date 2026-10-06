# PR-E — Engine Responsibility Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reduce `engine.ts` to runtime orchestration by extracting world
geometry, interaction lookup, NPC/story routing, and canvas rendering into
focused modules — without changing playable behavior.

**Architecture:** Extract pure/decoupled units first (`world/`,
`story/`), then rendering (`runtime/renderer.ts`). The engine keeps `tick`,
input dispatch, mode coordination, canvas lifecycle, presentation scheduling,
and snapshot emission. `docs/ARCHITECTURE.md` is updated to match the result.

**Tech Stack:** TypeScript, native Node test runner.

**Spec:** `docs/superpowers/plans/2026-10-06-reliquary-v0.2-campaign.md`
(Global Constraints).

**Depends on:** PR-D (battle domain), already merged into the campaign branch.

**Non-goal:** an arbitrary line-count target. Only coherent boundaries move.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `src/game/world/movement.ts` | facing vectors, tile math, occupancy | create |
| `src/game/world/interactions.ts` | interaction target lookup + world data tables | create |
| `src/game/story/interactions.ts` | NPC dialogue routing (data) + effect tags | create |
| `src/game/runtime/renderer.ts` | canvas world/battle rendering + asset path list | create |
| `src/game/engine.ts` | orchestration only | modify |
| `docs/ARCHITECTURE.md` | match the code | modify |
| tests | `world/movement.test.ts`, `world/interactions.test.ts`, `story/interactions.test.ts` | create |

**Interfaces produced:**
- `DIRS`, `YAW`, `facingOffset(dir)`, `isOccupied(map, flags, x, y)`
- `findInteractionTarget(map, fx, fy)`
- `WARP_TABLE`, `SIGN_TEXT`, `CHEST_LOOT`, `npcDialogue(id, flags)`
- `drawWorld(ctx, view)`, `drawBattle(ctx, view)`, `collectPaths()`

**Invariant:** no public behavior change; all existing tests stay green.

---

### Task E1: World movement geometry

**Files:**
- Create: `src/game/world/movement.ts`
- Test: `src/game/world/movement.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS, BLOCKED } from "../maps.ts";
import { DIRS, facingOffset, isOccupied } from "./movement.ts";

test("facing offsets match the four directions", () => {
  assert.deepEqual(facingOffset(0), { x: 0, y: 1 });
  assert.deepEqual(facingOffset(1), { x: -1, y: 0 });
  assert.deepEqual(facingOffset(2), { x: 1, y: 0 });
  assert.deepEqual(facingOffset(3), { x: 0, y: -1 });
  assert.equal(DIRS[0].name, "down");
});

test("blocked ground and solids are occupied, open ground is not", () => {
  const map = MAPS.elderhall!;
  const [blockedTile] = Object.keys(BLOCKED);
  assert.equal(isOccupied(map, {}, map.spawn.x, map.spawn.y), false);
  // Find a wall tile in the map and assert it is occupied.
  let wall: { x: number; y: number } | null = null;
  for (let y = 0; y < map.ground.length && !wall; y++) {
    for (let x = 0; x < map.ground[y]!.length; x++) {
      if (BLOCKED.has(map.ground[y]![x]!)) { wall = { x, y }; break; }
    }
  }
  if (wall) assert.equal(isOccupied(map, {}, wall.x, wall.y), true);
  assert.ok(blockedTile);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/game/world/movement.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Move `DIRS` and `YAW` out of `engine.ts` into `world/movement.ts`, plus:

```ts
import { BLOCKED } from "../maps.ts";
import type { Dir, MapDef } from "../types.ts";

export const DIRS: Record<Dir, { x: number; y: number; name: string }> = {
  0: { x: 0, y: 1, name: "down" },
  1: { x: -1, y: 0, name: "left" },
  2: { x: 1, y: 0, name: "right" },
  3: { x: 0, y: -1, name: "up" },
};
export const YAW: Record<Dir, number> = { 0: 0, 1: Math.PI / 2, 2: -Math.PI / 2, 3: Math.PI };

export function facingOffset(dir: Dir): { x: number; y: number } {
  const d = DIRS[dir];
  return { x: d.x, y: d.y };
}

export function isOccupied(map: MapDef, flags: Record<string, boolean>, x: number, y: number): boolean {
  const row = map.ground[y];
  if (!row || x < 0 || x >= row.length) return true;
  if (BLOCKED.has(row[x]!)) return true;
  for (const o of map.objects) {
    if (!o.solid) continue;
    if (flags.starter && o.id.startsWith("st_")) continue;
    const fy = o.y + o.h - o.foot;
    if (x >= o.x && x < o.x + o.w && y >= fy && y < o.y + o.h) return true;
  }
  for (const n of map.npcs) if (n.x === x && n.y === y) return true;
  return false;
}
```

- [ ] **Step 4: Delegate from the engine**

In `engine.ts`, import `DIRS`, `YAW`, `facingOffset`, `isOccupied`; delete the
local `DIRS`/`YAW`; replace `private occupied(...)` body with
`return isOccupied(this.map(), this.flags, x, y);` (or inline the call at the
two sites). Keep `this.map()`.

- [ ] **Step 5: Run gate**

```bash
node --experimental-strip-types --test src/game/world/movement.test.ts
npm run typecheck && npm run lint && npm test && npm run validate:content && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/game/world/movement.ts src/game/world/movement.test.ts src/game/engine.ts
git commit -m "refactor(world): extract movement geometry and occupancy"
```

---

### Task E2: Interaction lookup and world data tables

**Files:**
- Create: `src/game/world/interactions.ts`
- Test: `src/game/world/interactions.test.ts`
- Modify: `src/game/engine.ts` `interact`, `handleInteract`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { CHEST_LOOT, SIGN_TEXT, WARP_TABLE, findInteractionTarget } from "./interactions.ts";

test("warp, sign, and chest tables are intact", () => {
  assert.deepEqual(WARP_TABLE.enter_home, ["home", 5, 6]);
  assert.match(SIGN_TEXT.sign_road!, /BRIAR ROAD/);
  assert.deepEqual(CHEST_LOOT.chest_briar, ["thorn_sigil", 1]);
});

test("finds an NPC or interactable object at a facing tile", () => {
  const map = MAPS.elderhall!;
  let npc: { x: number; y: number } | null = null;
  for (const n of map.npcs) { npc = { x: n.x, y: n.y }; break; }
  if (npc) {
    const found = findInteractionTarget(map, npc.x, npc.y);
    assert.ok(found.npc || found.object);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/game/world/interactions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Move the `warps` record, `signs` record, and `loot` record out of
`handleInteract` into exported constants, and add:

```ts
import type { MapDef, MapNpc, MapObj } from "../types.ts";

export const WARP_TABLE: Record<string, [string, number, number]> = {
  enter_home: ["home", 5, 6],
  enter_guild: ["guild_in", 6, 8],
  enter_inn: ["inn_in", 6, 7],
  enter_shop: ["shop_in", 5, 6],
  enter_cave: ["ashenbarrow", 9, 16],
  enter_hall: ["warden_hall", 7, 10],
  enter_keep_inn: ["keep_inn", 6, 7],
  enter_keep_shop: ["keep_shop", 5, 6],
};

export const SIGN_TEXT: Record<string, string> = { /* copy the engine's signs map verbatim */ };
export const CHEST_LOOT: Record<string, [string, number]> = {
  chest_briar: ["thorn_sigil", 1],
  chest_wood: ["greater_tonic", 2],
  chest_mire: ["relic_sigil", 1],
  chest_cave: ["phoenix_ash", 1],
};

export function findInteractionTarget(map: MapDef, fx: number, fy: number): { npc: MapNpc | null; object: MapObj | null } {
  const npc = map.npcs.find((n) => n.x === fx && n.y === fy) ?? null;
  const object = npc ? null : map.objects.find((o) => fx >= o.x && fx < o.x + o.w && fy >= o.y && fy < o.y + o.h) ?? null;
  return { npc, object };
}
```

> Copy the sign strings verbatim from `engine.ts` `handleInteract` so text does
> not drift.

- [ ] **Step 4: Delegate from the engine**

`interact()` calls `findInteractionTarget(this.map(), fx, fy)`; `handleInteract`
reads `WARP_TABLE`/`SIGN_TEXT`/`CHEST_LOOT`.

- [ ] **Step 5: Run gate and commit**

```bash
node --experimental-strip-types --test src/game/world/interactions.test.ts
npm run typecheck && npm run lint && npm test && npm run validate:content && npm run build
git add src/game/world/interactions.ts src/game/world/interactions.test.ts src/game/engine.ts
git commit -m "refactor(world): extract interaction lookup and data tables"
```

---

### Task E3: Story/NPC dialogue routing

**Files:**
- Create: `src/game/story/interactions.ts`
- Test: `src/game/story/interactions.test.ts`
- Modify: `src/game/engine.ts` `talk`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { npcDialogue } from "./interactions.ts";

test("Maren asks for a starter before anything else", () => {
  const r = npcDialogue("maren", {});
  assert.equal(r?.speaker, "Elder Maren");
  assert.match(r!.pages[0]!, /Crown cracked/);
  assert.equal(r?.effect, undefined);
});

test("Cael offers the trial only when a starter exists", () => {
  assert.equal(npcDialogue("cael", { starter: true })?.effect, "startWarden");
  assert.match(npcDialogue("cael", {})!.pages[0]!, /green lantern/);
});

test("shopkeep routes to the shop effect", () => {
  assert.equal(npcDialogue("shopkeep", {})?.effect, "shop");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/game/story/interactions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Define a data-driven router. `effect` is a tag the engine interprets (keeps
audio/state/emit in the engine):

```ts
import type { StatusId } from "../types.ts"; // if needed; otherwise omit

export type StoryEffect = "offerInn" | "startWarden" | "shop";
export type NpcDialogue = { speaker: string; pages: string[]; effect?: StoryEffect };

export function npcDialogue(id: string, flags: Record<string, boolean>): NpcDialogue | null {
  if (id === "maren" || id === "maren_guild") {
    if (!flags.starter) return { speaker: "Elder Maren", pages: ["The Crown cracked. We did not. ...", "Walk west to the Binding Grove. ..."] };
    if (!flags.trial) return { speaker: "Elder Maren", pages: ["Good. A pact is a name you intend to keep.", "Bind what you can on Briar Road. ..."] };
    return { speaker: "Elder Maren", pages: ["The Thorn Sigil sits well on you. ...", "Rest. Bind. Walk. That is the work."] };
  }
  if (id === "shopkeep") return { speaker: "Chandler", pages: [], effect: "shop" };
  if (id === "innkeep") return { speaker: "Innmother Cald", pages: ["Fifteen crowns for a clean bed and a whole lantern. Rest?"], effect: "offerInn" };
  if (id === "cael" || id === "cael_trial") {
    if (flags.trial) return { speaker: "Warden Cael", pages: ["You already keep the Thorn Mark. Don't make me bored."] };
    if (!flags.starter) return { speaker: "Warden Cael", pages: ["Come back with a pact, green lantern."] };
    return { speaker: "Warden Cael", pages: ["Warden Cael. I keep Thornkeep's road.", "Show me the compact is not a hobby. Three of mine against yours. Bind or break."], effect: "startWarden" };
  }
  // ...copy the remaining NPC branches verbatim (guard, lise, wayfarer, reedcutter, keep_guard)...
  return null;
}
```

- [ ] **Step 4: Delegate from the engine**

In `talk(id, name)`:

```ts
private talk(id: string, name: string): void {
  const d = npcDialogue(id, this.flags);
  if (!d) return;
  if (d.effect === "shop") { this.mode = "shop"; this.shopMode = "buy"; this.shopIndex = 0; sfxPlay.menu(); this.emit(); return; }
  const onDone = d.effect === "offerInn" ? () => this.offerInn()
    : d.effect === "startWarden" ? () => this.startWarden()
    : undefined;
  this.openDialog(d.speaker || name, d.pages, onDone);
}
```

- [ ] **Step 5: Run gate and commit**

```bash
node --experimental-strip-types --test src/game/story/interactions.test.ts
npm run typecheck && npm run lint && npm test && npm run validate:content && npm run build
git add src/game/story/interactions.ts src/game/story/interactions.test.ts src/game/engine.ts
git commit -m "refactor(story): extract NPC dialogue routing into data"
```

---

### Task E4: Canvas renderer extraction

**Files:**
- Create: `src/game/runtime/renderer.ts`
- Modify: `src/game/engine.ts` `draw`, `drawWorld`, `drawBattle`, `collectPaths`

- [ ] **Step 1: Define the view interface and move rendering**

Move `drawWorld` and `drawBattle` bodies into `runtime/renderer.ts` and the
asset list builder `collectPaths()` as an export. They must take a view object
so no engine instance is needed:

```ts
import { GROUND_TILE } from "../maps.ts";
import { SPECIES } from "../content.ts";
import { DIRS } from "../world/movement.ts";
import type { BattleState, Beast, MapDef } from "../types.ts";

export type WorldView = {
  ctx: CanvasRenderingContext2D;
  map: MapDef;
  images: Record<string, HTMLImageElement>;
  flags: Record<string, boolean>;
  viewW: number; viewH: number; cw: number; ch: number;
  px: number; py: number; dir: 0 | 1 | 2 | 3; moving: boolean; walkFrame: number;
};
export function drawWorld(view: WorldView): void { /* existing body, using view.* */ }

export type BattleView = {
  ctx: CanvasRenderingContext2D;
  battle: BattleState;
  party: Beast[];
  images: Record<string, HTMLImageElement>;
  cw: number; ch: number;
};
export function drawBattle(view: BattleView): void { /* existing body */ }

export function collectPaths(): [string, string][] { /* move existing body */ }
```

- [ ] **Step 2: Delegate from the engine**

`draw()` calls `drawWorld({...})` / `drawBattle({...})`; `loadImages` calls the
imported `collectPaths`. The engine no longer imports `SPECIES`/`GROUND_TILE`
solely for rendering (leave other uses).

- [ ] **Step 3: Add a structural guard test**

`src/game/runtime/renderer.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { collectPaths } from "./renderer.ts";

test("every preloaded asset path exists under public/", () => {
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../../../public");
  const paths = collectPaths();
  assert.equal(paths.length, 78);
  for (const [, src] of paths) {
    const clean = src.split("?")[0]!;
    assert.ok(existsSync(join(publicDir, clean)), `missing ${clean}`);
  }
});
```

> If the count differs from 78, update the literal to the true count after
> confirming all files exist.

- [ ] **Step 4: Run gate and commit**

```bash
node --experimental-strip-types --test src/game/runtime/renderer.test.ts
npm run typecheck && npm run lint && npm test && npm run validate:content && npm run build
git add src/game/runtime/renderer.ts src/game/runtime/renderer.test.ts src/game/engine.ts
git commit -m "refactor(runtime): extract canvas world/battle rendering"
```

---

### Task E5: Architecture documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Rewrite the tree to match the code**

Update the module map to list the new `battle/`, `world/`, `story/`,
`runtime/` modules with their actual responsibilities, and state what
`engine.ts` still owns (tick, input, mode coordination, canvas lifecycle,
presentation scheduling, snapshot emission).

- [ ] **Step 2: Verify against reality**

Run: `ls src/game src/game/battle src/game/world src/game/story src/game/runtime 2>&1`
Expected: every module named in the doc exists.

- [ ] **Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: describe the decomposed engine architecture"
```

---

## Self-review notes

- **Behavior preserved:** every extraction moves code verbatim behind a thin
  adapter; existing tests are the guard.
- **Boundaries, not line counts:** only coherent units move.
- **Risk:** E4 (rendering) is the largest diff; it has no behavioral test, so
  the structural `collectPaths` guard plus the existing lifecycle test are the
  safety net. If rendering shows any regression, revert E4 alone — E1–E3 are
  independent.
- **Out of scope:** PWA/preview scaffolds (Phase 6), game feel (Phase 9).
