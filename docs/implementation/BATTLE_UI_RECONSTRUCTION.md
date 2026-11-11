# Battle UI reconstruction

This document records the implementation contract behind Reliquary's rebuilt
battle presentation. The combat engine, save schema and battle outcomes are
unchanged; this work is rendering, layout and interface only.

## Viewport families

| Family | Selected when | Logical stage |
| --- | --- | --- |
| Desktop | usable stage wider than ~1.05:1 and taller than 520 CSS px | 16 columns, rows fitted to the stage (9 rows at 1536×864 = exact 16:9) |
| Compact landscape | landscape stage at or below 520 CSS px tall | 9 rows, columns fitted to the stage (16–21) |
| Portrait | phone/tablet portrait | 10 columns, rows fitted to the stage (16–24) |

`battlePresentation()` and `battleViewportForStage()` live in
`src/game/render/battle-viewport.ts`. The logical canvas is fitted into the
usable stage box by `ReliquaryGame.layout()`, so the canvas fills its stage
instead of leaving letterbox bars. Exploration keeps its existing 12×9 and
10×16 views.

At the reference size (1536×864) the logical stage is exactly 16×9. The
background is cover-cropped into the chosen aspect; it is never stretched.

## Layout contract

`computeBattleLayout()` in `src/game/render/battle-scene.ts` returns one object
shared by the renderer, geometry reports and tests:

- `statusPlayer` / `statusFoe` — upper-left / upper-right canvas bands.
- `groundY` — one ground line for both creatures.
- `player { cx, feetY, targetHeight }` — left, facing right.
- `foe { cx, feetY, targetHeight }` — right, facing left.
- `uiReserveTop` — stable top of the command dock. It never depends on the
  height of an open submenu, so creature anchors do not move between
  command/skills/items/party/bind.
- `presentation` — which responsive family produced the layout.

`src/game/render/battle-stage-geometry.ts` publishes the same anchors plus the
animation corridor, ground line and presentation for browser QA.

Sprite placement (`src/game/render/sprite-bounds.ts`) measures each sheet's
opaque alpha bounds once, caches them, and fits the silhouette to the target
height with its feet on `groundY`. This removes floating creatures, double
shadows and the dark radial "halo" plate that used the square image rectangle
instead of the visible silhouette.

## HUD structure

`src/game/ui/battle/BattleHud.tsx` composes:

- `BattleStatusCard` — portrait, live name/level, HP/MP bars, status chip.
- `BattleActionGrid` — fixed 3×2 slots: Strike/Skill/Item, Bind/Party/Flee.
- `BattleActionDetails` — selected action name, description, meta.
- `BattleSubmenu` — skills, items, sigils, party rows.
- `BattleFooter` — latest message, accurate keyboard/touch hints, Details.

`battle-commands.ts` maps presentation identities to the engine's **dynamic**
command list. A visual slot index is never passed to the engine: when Bind is
unavailable, Party occupies engine index 3 and Flee index 4 while their visual
positions stay fixed. Unavailable slots are `aria-disabled`, show an
explanation in the details panel, and cannot execute.

`battle-action-details.ts` is a pure resolver over `SKILLS`, `ITEMS`,
`SPECIES`, `currentStats`, inventory and party state. It never resolves a turn.

`src/game/ui/battle/battle.css` is scoped under `.battle-hud`. All legacy battle
rules were removed from `src/styles.css`; exploration, dialogue, inventory and
party overlays are untouched.

## Engine/UI cooperation

- `previewBattle(index)` now emits a snapshot, so hover/focus immediately
  updates the highlight and details.
- `previewBattleCommand(identity)` / `chooseBattleCommand(identity)` resolve the
  identity to the current engine index.
- `battleItemHasEffect(id)` exposes the engine's own item eligibility to the
  HUD; combat math is not duplicated.
- The existing `confirm`, `cancel`, `moveMenu`, `chooseBattle`, phase list,
  MP-affordability rule, forced switching, bind filter, recap cap and
  win/lose/catch flows are unchanged.

## Presentation details

- Background: the shipped plate is cover-cropped and colour-graded toward the
  reference sunset in `paintBattleBackdrop()`. The original asset on disk is
  untouched. The source plate remains a golden-hour meadow; its sky is less
  saturated than the reference's magenta cloudbank. This is an art-fidelity
  gap, not a UI/geometry gap.
- Creature art: the shipped Briarling and Galeskip sheets legitimately differ
  from the reference illustration (silhouette proportions, detail level).
- Shadows are drawn once per creature at the measured silhouette base.
- Reduced motion is honoured by existing canvas sampling and by CSS
  transitions inside the battle scope.
- Touch hints replace keyboard hints at runtime when the device reports touch
  (`navigator.maxTouchPoints` or coarse pointer); no gamepad prompts are shown
  because gamepad input is not implemented.

## Verification

Unit: `npm test` covers viewport selection, adaptive stages, layout/status
zones, coordinate conversion, alpha-fit placement, command identity mapping,
and action-details resolution.

Browser:

```bash
npm run build:web:test
node tests/browser/battle-stage-browser.mjs
node tests/browser/battle-input-parity.mjs
node tests/browser/battle-journeys.mjs
node tests/browser/battle-hud-layout.mjs
node tests/browser/battle-reach.mjs
node tests/browser/battle-item-scope.mjs
node tests/browser/battle-recap.mjs
npm run test:browser
```

Viewport matrix used by `battle-stage-browser.mjs`:
1536×864, 1440×900, 1280×800, 844×390, 640×320, 568×320, 390×844, 390×667,
320×568.

Screenshots and evidence are written to `artifacts/browser/` and
`artifacts/qa-shots/` (gitignored).
