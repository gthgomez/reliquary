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
| `npm run test:pwa` | pass (manifest contract) |

## Scope landed in this branch

- Save **v3** with `worldRevision: 1`, safe spawn migration, checkpoints, Web Locks helper
- Canonical `isOccupied` / reachability, encounter regions, fixed faction/boss fights
- Seven new species + three maps (Cellar, Crownpool, Briar Camp), Ashenbarrow north passage
- Reliquary public manifest, asset registry, Workbox post-build (`build:web`)

Physical Android install verification remains **pending** (automated unit/content gates only in this environment).
