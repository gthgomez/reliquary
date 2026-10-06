# Reliquary v0.2 — Recruiter-Grade Vertical Slice Campaign Plan

> **For agentic workers:** This is the campaign-level plan. Each PR (A–L) gets
> its own task-level plan file in `docs/superpowers/plans/`. Execute a PR plan
> with `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, task by task.

**Goal:** Turn the existing Reliquary prototype into a correct, architecturally
coherent, demonstrably tested, immediately playable portfolio game.

**Architecture:** Keep the client-side React/Vite canvas game. Converge battle
rules into one canonical resolver, extract battle state transitions into a pure
reducer, shrink `engine.ts` to runtime orchestration, and wrap the golden path
in integration + Playwright tests. Presentation and content stay separate from
rules.

**Tech Stack:** React 19, TypeScript 5.7, Vite 8 / Nitro, native Node test
runner (`node --test` + `--experimental-strip-types`), Zod, Playwright (already
a devDependency, not yet configured), ESLint 9, Prettier.

**Spec:** This file is the spec and roadmap. Detailed per-PR plans reference it.

---

## Global Constraints

These apply to every task in every PR in this campaign. Copy them verbatim into
each PR plan.

- **Node 24 / npm 11** (`.nvmrc` = `24`). CI runs `ubuntu-latest` + `windows-latest`.
- **Proprietary license** (`UNLICENSED`, `private: true`). Do not add
  open-source licensing, do not relax contribution policy.
- **No new gameplay content** during P0/P1. Polish the existing 21 species /
  14 areas / 48 skills; do not add creatures, maps, or skills.
- **Public behavior stays stable** during structural refactors unless the PR
  explicitly changes behavior (and then its plan says so and tests it).
- **One authoritative formula per rule.** Never duplicate a gameplay formula
  between `engine.ts` and `src/game/systems/*`.
- **Reproduce before fixing.** Every correctness bug gets a failing test or an
  explicit negative control first.
- **Never weaken a test** to make a change pass.
- **Full verification gate before every PR handoff** (see Gate below).
- **Test runner:** `npm test` runs `src/game/**/*.test.ts` plus the three
  `src/lib` test files (see `scripts/run-tests.mjs`). New gameplay tests must be
  under `src/game/` to be picked up by the default public gate.
- **No DOM in gameplay tests where avoidable.** Battle logic must be testable
  with a stub `window`/`localStorage` only.

### The verification gate (run before every PR handoff)

```bash
npm ci                 # only when lockfile changed
npm run typecheck
npm run lint
npm test
npm run validate:content
npm run build
```

Record exact base/head SHA in the PR description.

---

## Baseline evidence (Phase 0 result)

Established 2026-10-06 on this machine.

| Evidence | Value |
|---|---|
| Repo | `https://github.com/gthgomez/reliquary.git` |
| Frozen `main` HEAD | `64e2a24` ("fix(auth): redact preview OAuth credential… (#4)") |
| Preview credential fix | **landed** — PR #4 merged into `origin/main`; branch content identical |
| Campaign branch | `campaign/reliquary-v0.2` |
| Working tree | clean (plans only) |
| Node / npm | v24.21.0 / 11.19.0 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — **55 tests**, 9 suites |
| `npm run validate:content` | PASS — `[content] valid` |
| `npm run build` | PASS (Vite/Nitro → `.vercel/output`) |
| Playwright config / E2E dir | **absent** — E2E does not exist yet |
| Screenshots / hero asset | **absent** from README |
| Production DB needed for build | no |

**Baseline resolved:** PR #4 (preview OAuth fail-closed fix) is merged into
`origin/main`; local `main` was fast-forwarded to `64e2a24`, and the campaign
branch `campaign/reliquary-v0.2` is cut from it. The gates above were re-run
green on `64e2a24`.

### Confirmed defect inventory (read from source)

These are the actual P0 defects, with exact locations. They are the basis for
PR-A/B/C tests.

| ID | Defect | Location | Mechanism |
|---|---|---|---|
| B1 | Enemy attacks the **switched-out** creature | `engine.ts` `playerAction` ~1033–1059 | `doPlayer` mutates `b.playerIndex` on switch, but `doFoe()` reuses the `me` captured before the switch; `foeTurn(foe, me)` targets the old creature. |
| B2 | Forced switch after faint is clobbered | `engine.ts` `playerAction` ~1060–1086 + `playerDown` ~1193–1207 | In the player-first branch, `playerDown()` sets `phase="party"` but lacks `return`; line ~1079 then overwrites `phase="command"`, so the "Choose another" party selection never appears, and `playerIndex` was already silently moved to the next living creature. |
| B3 | Pending switch conflated with active index | `engine.ts` `playerDown` ~1196–1202 | `playerDown` sets `b.playerIndex = next` **and** `phase="party"`. Selecting that creature is then rejected by the `idx === b.playerIndex` guard. |
| B4 | Canonical combat resolver is dead code | `engine.ts` `useSkill` ~1088–1134 vs `systems/combat.ts` `resolveElementalDamage` | Engine re-implements the entire damage formula (base/STAB/type/crit/variance/ward/bless) and never calls the tested resolver. |
| B5 | Save success reported on write failure | `engine.ts` `persist` ~422–440 | `writeSave(...)` return value discarded; `this.hasSave = true` unconditionally. |
| B6 | "The lantern is written." shown on failed save | `engine.ts` `menuConfirm` ~1373–1377 | Toast fires after `persist()` regardless of result. |
| B7 | Battle items always target the active creature | `engine.ts` `playerAction` item branch ~1049 → `useItem(act.item!, me, true)` | Revive can never target a fainted party member; heal can be consumed on an invalid target. |
| B8 | Item consumed before validation | `engine.ts` `useItem` ~1273–1296 | `this.inventory[id] -= 1` executes before the revive `hp <= 0` check and for field items even when blocked in battle. |
| B9 | Quiet Bell activates and is consumed in battle | `engine.ts` `useItem` field branch ~1276–1281 | Decrements inventory, sets `quietBell`, toasts "The grass stills.", then logs "The Quiet Bell cannot be heard here." |

---

## Priority roadmap → PR mapping

| Priority | Phase | PR(s) | Why | Gate |
|---|---|---|---|---|
| P0 | 0 — Baseline | (setup) | Prevent agents "fixing" imagined problems | Current `main` verified, branch `campaign/reliquary-v0.2` |
| P0 | 1 — Gameplay correctness | **A** | Real player-facing battle bugs | Battle switch/faint regressions red→green |
| P1 | 1 — Battle architecture | **B** | Tests must exercise production rules | Negative-control proves engine uses resolver |
| P0 | 2 — Persistence/items | **C** | Save lies to the player; items misbehave | Save-fault + item-target tests |
| P1 | 3 — Battle domain | **D** | Battle not testable without engine | Pure reducer tests, no DOM |
| P1 | 4 — Engine decomposition | **E** | `engine.ts` owns too much | Architecture doc matches code |
| P1 | 5 — Verification | **F** | Biggest coverage hole | Golden-path integration tests |
| P1 | 5 — E2E | **G** | No browser-level proof | Playwright golden path passes |
| P2 | 6 — Repo simplification | **H** | Repo looks app-builder-generated | Reachability audit, pruned deps |
| P2 | 7 — Asset/security closure | **I** | Art provenance unresolved | Every runtime asset dispositioned |
| P2 | 8 — Portfolio surface | **J** | Repo hides the game | One-click demo + hero/screens/GIF |
| P3 | 9 — Game feel | **K** | Vertical slice feels unfinished | Combat/exploration presentation improved |
| P3 | 10 — Release | **L** | Convert work into proof | v0.2.0 qualification matrix |

**Recommended PR train.** Branch from `campaign/reliquary-v0.2` (or stacked
branches). Do **not** combine A–G into one refactor.

| PR | Purpose | Detailed plan |
|---|---|---|
| PR-A | Battle switch/faint regressions | `2026-10-06-pr-a-battle-switch-faint.md` |
| PR-B | Canonical combat resolution | `2026-10-06-pr-b-canonical-combat.md` |
| PR-C | Save-result + item-targeting correctness | `2026-10-06-pr-c-save-item-correctness.md` |
| PR-D | Battle state/reducer extraction | (write when Phase 3 opens) |
| PR-E | Engine responsibility decomposition | (write when Phase 4 opens) |
| PR-F | Gameplay integration tests | (write when Phase 5 opens) |
| PR-G | Playwright golden path | (write when Phase 5 opens) |
| PR-H | Scaffold/dependency cleanup | (write when Phase 6 opens) |
| PR-I | Asset + security closure | (write when Phase 7 opens) |
| PR-J | README/demo/portfolio presentation | (write when Phase 8 opens) |
| PR-K | Game-feel polish | (write when Phase 9 opens) |
| PR-L | v0.2 release qualification | (write when Phase 10 opens) |

---

## Phase detail

### Phase 0 — Freeze and characterize current main

**Deliverable:** campaign branch, baseline evidence table above completed on
`main`, current known bugs documented.

Steps:
1. Confirm clean tree on the intended base; record HEAD SHA, Node/npm, test
   count, build result.
2. Create `campaign/reliquary-v0.2` from the frozen base.
3. Capture screenshots of the title, overworld, battle, and Reliquary screens
   (also needed by Phase 8).
4. Do **not** change architecture yet.

**Gate:** all five commands pass on the frozen base; no unrelated working-tree
changes.

### Phase 1 — P0 gameplay correctness (PR-A, PR-B)

Detailed plans:
- `2026-10-06-pr-a-battle-switch-faint.md`
- `2026-10-06-pr-b-canonical-combat.md`

### Phase 2 — P0 persistence and item correctness (PR-C)

Detailed plan: `2026-10-06-pr-c-save-item-correctness.md`

### Phase 3 — P1 create a real battle domain (PR-D)

**Objective:** extract battle transitions so a battle can be simulated without
the engine or a DOM.

Target structure (progressive; do not rewrite the engine in one pass):

```text
src/game/
  engine.ts
  battle/
    state.ts        battle state shape + initial state
    actions.ts      action union types
    reducer.ts      (state, action, rng) -> { state, events }
    ai.ts           enemy skill selection
    resolution.ts   turn order, applying action results
  systems/
    combat.ts capture.ts progression.ts status.ts economy.ts world.ts items.ts
```

A battle action becomes `state + action + RNG → next state + events`; the engine
becomes a subscriber that renders events and plays audio. `BattleState` gains an
immutable transition function.

**Gate:** at least the PR-A/B/C regression suites are re-expressed against the
reducer and pass without the engine; `engine.ts` delegates to it.

### Phase 4 — P1 reduce `engine.ts` (PR-E)

Extract coherent boundaries (not an arbitrary line target):

```text
src/game/runtime/  GameRuntime.ts input.ts renderer.ts assets.ts presentation.ts
src/game/world/    movement.ts interactions.ts
src/game/story/    interactions.ts progression.ts
```

Remove from the central engine: raw damage math, item effect rules, capture
formulas, content decisions, large story/NPC routing tables. Keep: tick, input
dispatch, mode coordination, canvas lifecycle, presentation scheduling,
snapshot emission.

**Gate:** `docs/ARCHITECTURE.md` describes what the code **actually does**.

### Phase 5 — P1 gameplay verification campaign (PR-F, PR-G)

Integration tests around player actions (list in the spec is authoritative):
battle start, attack uses canonical resolver, miss, status apply/expiry, switch,
faint recoverable, final faint = loss, capture success/failure, revive, invalid
item target not consumed, victory rewards/flags/save, Warden trial, save/reload.

Add `playwright.config.ts` + one golden path:

```text
Launch → Start → starter → leave town → forced encounter → fight
→ bind → menu → save → reload → continue → verify restored state
```

A second E2E targets the Warden victory route. Reuse
`window.__controlsTest` (`warp`, `startWild`) installed by `engine.ts`
`installProbe()` and `window.__reliquary` (`confirm`, `cancel`, `startNew`).

**Gate:** golden path passes headless in CI.

### Phase 6 — P2 repository simplification (PR-H)

Audit and classify every major subsystem: `ACTIVE`, `NEAR-TERM PLANNED`,
`PLATFORM-SPECIFIC`, `UNUSED`. Candidates: `src/lib/auth`,
`src/lib/app-data`, `src/lib/db.ts`, `src/lib/multiplayer`, `server/`,
`migrations/`, Grok/App Builder integration, and the large unused dependency
surface in `package.json` (Radix UI, TanStack Table/Router/Query/Start, Recharts,
react-day-picker, react-hook-form, Kysely, PGlite, pg, better-auth, … none of
which the canvas game imports).

Do not blindly delete multiplayer if it is genuinely on the roadmap — but
isolate or remove infrastructure with no product purpose. Prune dependencies
with no reachable production or tooling consumer.

**Gate:** a documented reachability audit; game-only clone still passes the
gate.

### Phase 7 — P2 asset/security closure (PR-I)

Every shipped category gets one disposition: `VERIFIED_ORIGINAL`, `LICENSED`,
`AI_GENERATED`, `REPLACED`, `BLOCKED` (commercial release target: zero `BLOCKED`
runtime assets). Existing records: `docs/ASSET_PROVENANCE.md`,
`docs/security/publication-status.md`.

Security: rewrite `docs/SECURITY.md` into a short professional policy; remove
the "proprietary software cannot have vulnerabilities" framing; keep unsupported
prototype / no SLA / no bounty / private reporting / credential rotation /
deployment assumptions. Verify the preview OAuth credential fixed in current
commit `5308e8f` was **rotated**, not merely removed from source.

**Gate:** every runtime asset dispositioned; `refs/pull/1/head` owner action
closed or explicitly accepted; secret rotation attested.

### Phase 8 — P2 portfolio transformation (PR-J)

README top section: hero media, one-line pitch, `[PLAY NOW]`, `[WATCH GAMEPLAY]`,
`[ARCHITECTURE]`; then Gameplay, Technical highlights, Architecture,
Reliability/testing, What I built, Screenshots, Running locally, Development
status. Add title/overworld/battle/reliquary screenshots + a 20–30s GIF/video.
Deploy a one-click playable build (the build already emits a Vercel/Nitro
output).

**Gate:** a recruiter can play without installing Node.

### Phase 9 — P3 game feel (PR-K)

Combat hit flashes, short attack motion, HP interpolation, status indicators,
effectiveness feedback, defeat transition. Exploration encounter transition,
camera behavior, interactive-object feedback, map-entry titles. UI
target-selection states, selected-command feedback, consistent back behavior,
accessible labels/focus, mobile feedback. No new creatures.

**Gate:** combat/exploration presentation measurably improved; no correctness
regression.

### Phase 10 — P3 v0.2.0 qualification (PR-L)

Qualification matrix (all required):

| Gate | Required |
|---|---|
| TypeScript | PASS |
| ESLint | PASS |
| unit tests | PASS |
| battle integration tests | PASS |
| save fault tests | PASS |
| content validation | PASS |
| Playwright golden path | PASS |
| Windows CI | PASS |
| Linux CI | PASS |
| production build | PASS |
| clean checkout run | PASS |
| live deployment smoke test | PASS |
| runtime asset provenance | CLEAR |
| no known P0/P1 gameplay defect | PASS |

Publish `v0.2.0 — Recruiter-ready vertical slice` with playable URL,
screenshots, clip, notable engineering changes, known limitations, test/CI
summary.

---

## Risks and stop-and-document items

Per operating rule 10, stop and document rather than invent:

1. **Baseline branch:** resolved — PR #4 is merged and the campaign branch is
   cut from `main` @ `64e2a24`.
2. **Headless engine tests:** `confirm()` calls `unlockAudio()`, which requires
   `window.AudioContext`. PR-A adds a guard so audio no-ops without a browser
   audio context (production-safe: no context ⇒ no sound).
3. **Asset rights:** `docs/ASSET_PROVENANCE.md` states shipped art derives from
   unresolved sources; no disposition may be invented. `refs/pull/1/head`
   clearing requires a GitHub Support request — owner action.
4. **Preview credential rotation:** cannot be verified from the repository;
   requires owner/provider attestation.
5. **Multiplayer/app-data:** retain/remove is a product decision, not an
   engineering guess.
6. **Playwright in CI:** needs a headless browser install step; confirm it runs
   on both matrix OSes before making the golden path a required gate.

---

## Definition of campaign complete

The playable product, the implementation, the tests, the architecture
documentation, and the portfolio presentation all tell the same story, and the
qualification matrix in Phase 10 is green.
