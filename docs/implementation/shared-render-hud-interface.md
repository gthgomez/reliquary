# Shared render ↔ HUD interface (proposal)

Renderer-owned hooks for the parallel UI agent. **Do not** duplicate layout math in CSS for canvas-aligned regions; read these reports or match documented fallbacks when the canvas is not mounted.

## Battle (`window.__battleStageReport`)

Updated each battle frame from `reportBattleStageGeometry` in `src/game/render/battle-stage-geometry.ts`.

| Field | Meaning |
| --- | --- |
| `layout` | Full `BattleLayout` (sprite boxes in **canvas pixels**) |
| `stableReserveTop` | Encounter-locked floor line; **ignores** live `.battle-controls` height changes between command/skills/bag/party |
| `commandZoneTop` | Same as `layout.uiReserveTop` (sprite feet must stay above) |
| `animCorridor` | Allowed cosmetic motion band for strike animations |
| `statusZonePlayer` / `statusZoneFoe` | Reserved canvas rects for stat readouts (renderer-side planning; UI may align cards here) |
| `spriteAnchors` | Stable anchor copy: `player { cx, cy }`, `foe { x, y, w, h }` — **constant for the encounter** regardless of `battlePhase` |
| `battlePhase` | Engine `BattleState.phase` (for QA only; must not affect `spriteAnchors`) |
| `canvasW`, `canvasH`, `ts` | Canvas backing store size and publish time |

**UI agent:** compact HUD, objective expand/collapse, forced-switch copy, MP labels, fade/scrim/hysteresis — all DOM-only. Use `stableReserveTop` vs measured `.battle-controls` only for **overlap QA**, not for moving canvas sprites.

**Renderer:** sprite positions come solely from `computeBattleLayout(..., { stableReserve: true })` and cached `battleStableReserve`. Foe sprites do **not** receive idle vertical bob (only player idle + strike anims).

## World exploration (`window.__worldCameraReport`)

Published each world frame when the exploration HUD is measurable.

| Field | Meaning |
| --- | --- |
| `hudInsetBottom` | Canvas Y of the bottom edge of `.top-stack` (HUD + toast column) + gap |
| `camRelief` | Hysteresis-smoothed camera upward bias (px) keeping the player below the HUD band |
| `playerHeadCanvasY` | Approximate player sprite top in canvas space after camera |
| `canvasW`, `canvasH`, `ts` | Canvas size and publish time |

**UI agent:** when objective expands and shifts currency/Menu, prefer **non-interactive** fade fallback with hysteresis; avoid invisible hit targets over the canvas.

**Renderer:** adjusts `camY` in `drawWorld` using `measureWorldHudInsetCanvas` — engine-only, no `GameApp` edits.

## Fallback when hooks are missing

- Battle: `stableBattleUiReserveTop(cw, ch)` + `computeBattleLayout(cw, ch, top, { stableReserve: true })`.
- World: no inset adjustment (`camRelief = 0`).

## Out of scope (UI owner)

- Gust `5 MP` label vs `2 MP` remaining (display; engine `spendSkillMp` unchanged).
- Forced-switch prompt clipping, party row density.
- Battle MP spend rules and turn order.
