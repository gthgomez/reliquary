# Hollowmere integration baseline

Integrated **2026-11-01** on branch `cursor/playable-hollowmere-36d6`.

| Ref | SHA |
|---|---|
| Previous `main` | `d0070b8dbb5087916ea91cd7b353c0de709ed23e` |
| Merged chapter candidate | `239f96856681dd9aef0480588cead23e1cf6a9ab` (`feat/chapter-one-20261028`) |

## Gate results (integrated revision)

| Command | Result |
|---|---|
| `npm ci` | pass (with `.npmrc` `legacy-peer-deps=true`) |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | pass |
| `npm run validate:content` | pass |
| `npm run build` | pass |
| `npm run build:web` | pass (standalone client + Workbox) |
| `npm run test:pwa` | pass |
| `npm run verify:pwa` | pass |
| `npm run test:browser` | pass after `build:web` (Playwright layout/pwa/journey) |

## Scope landed in this branch

- Save **v3** with `worldRevision: 1`, safe spawn migration, checkpoints, Web Locks helper
- Canonical `isOccupied` / reachability, encounter regions, fixed faction/boss fights
- Seven new species + three maps (Cellar, Crownpool, Briar Camp), Ashenbarrow north passage
- Reliquary public manifest, asset registry, Workbox post-build (`build:web`)
- T04 `OverlayPanel`, T05 terrain/decor bake, T06 `maps/` module split, T10 browser CI + `RELEASE_EVIDENCE.md`

Physical Android install verification remains **pending** (automated unit/content gates only in this environment).
