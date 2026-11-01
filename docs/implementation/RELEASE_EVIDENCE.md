# Playable Hollowmere — release evidence

**Branch:** `cursor/playable-hollowmere-36d6`  
**Scope:** T04 mobile overlays, T05 terrain kit integration, T06 map module split + Briar Road habitats, T10 browser/CI gates.

## Automated gates (local / CI)

| Command | Purpose |
|---|---|
| `npm ci` | reproducible install |
| `npm run typecheck` | TS |
| `npm test` | unit + gameplay tests (includes terrain, world graph, layout-related engine tests) |
| `npm run validate:content` | maps, encounters, species |
| `npm run build` | default app build |
| `npm run build:web` | public static shell + Workbox precache |
| `npm run test:pwa` | manifest/icons/shell contract |
| `npm run verify:pwa` | post-build `index.html` + `sw.js` |
| `npm run test:browser -- --suite=all` | Playwright layout, offline reload, journey smoke |

## T04 — Mobile layout

- Shared `OverlayPanel` (header / scroll body / footer) used for root menu, party card actions, and shop.
- CSS: `touch-action: pan-y` on panel bodies; safe-area-friendly stage padding retained for touch controls.
- `tests/browser/layout.mjs` checks five viewports with `elementFromPoint` on menu actions.

## T05 — Terrain kit

- `world/terrain.ts`: stable `chooseTileVariant`, edge/shadow overlays, ground/canopy decorations.
- Engine terrain cache uses `bakeMapTerrain` (invalidates on asset load as before).
- Representative décor on `elderhall` and `briar_road` via `MapDef.decorations`.

## T06 — World pass

- Map data split under `src/game/maps/` (`registry.ts`, `helpers.ts`) with stable `MAPS` export.
- Briar Road damp verge + cart clearing `encounterRegions` per world spec.
- Wildwood → Ashenbarrow landing aligned to spawn `(9,14)`.
- `maps/world.test.ts` reachability and warp landing checks.

## T10 — Browser verification

- Playwright suites: `tests/browser/{helpers,layout,pwa,journey}.mjs`.
- `scripts/browser-regression.mjs` orchestrates `--suite=all|layout|pwa|journey`.
- CI installs Chromium and runs full browser suite after `build:web`.

## Physical device

**Physical Android install (Galaxy S25 Ultra) — pending.** Automated browser verification does not replace installed-icon offline play on hardware.
