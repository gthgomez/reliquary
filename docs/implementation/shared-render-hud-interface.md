# Shared render ↔ HUD interface

Renderer-owned hooks for the parallel UI agent (`cursor/compact-battle-hud-93fe`). **Do not** duplicate layout math in CSS for canvas-aligned regions.

## Primary world/battle HUD metric (UI-owned)

On `.viewport`:

- **`--ui-safe-top-px`** (CSS px): distance from **viewport top** to **`.top-stack` bottom + 4px** (`UI_SAFE_TOP_GAP_PX` in `src/game/ui/ui-geometry.ts`).
- Updated via `ResizeObserver` in `GameApp` on the UI branch.

Renderer reads this in **`readUiSafeTopCanvas`** (`src/game/render/ui-safe-top.ts`), mapping into canvas space. If the variable is absent (pre-merge), **`measureTopStackBottomCanvas`** uses the same +4px gap — no second geometry assumption.

World camera relief uses **`readUiSafeTopCanvas` only** (not a parallel stack query in engine).

## Battle anchors vs cosmetic motion

| Concept | Meaning |
| --- | --- |
| **`spriteAnchors`** | Layout boxes from `computeBattleLayout(..., { stableReserve: true })` — **constant for the encounter** (not menu height, not idle phase). |
| **`cosmeticOffset`** | Per-frame idle/strike draw delta (`player` full idle; `foe` `dy * 0.35`, `dx` when foe attacks). Screenshots show **anchor + cosmetic**. |

**Historical note (c187385):** battle sprites used **`measureBattleUiReserveCanvas` per frame**, so menu height changes moved layout — independent of any later idle animation work.

## QA reports (`window.__battleStageReport`, `window.__worldCameraReport`)

Published **only** when `import.meta.env.VITE_RELIQUARY_BROWSER_TEST === "1"` (`render-report-gate.ts`, same gate as economy probes). Production bundles must not mutate these globals.

Browser evidence: `node scripts/build-web-test.mjs` then `node scripts/battle-stage-browser.mjs`.

## UI agent scope

Objective expand/collapse, currency/Menu shift, fade/scrim/hysteresis, forced-switch copy, Gust MP label, party row density — DOM only.

## Renderer scope

Stable battle reserve, Nip/Gust cosmetic timing (combat resolves before `phase: "anim"`), world `camY` relief.

## Fallback when hooks are missing

- Battle layout: `stableBattleUiReserveTop` + `computeBattleLayout(..., { stableReserve: true })`.
- World camera: no inset adjustment when `readUiSafeTopCanvas` returns `source: null`.
