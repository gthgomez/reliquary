# Reliquary — revision evidence log

All commands executed in `D:\AgentData\worktrees\reliquary\reliquary-s-revision`
(worktree of `D:\Workspace\Games\Web\reliquary`, branch `codex/reliquary-s-revision`,
base `af378c8725a1871fc9728d92719de9ca31d74a6a`). Dates: 2026-11-05.
Environment: Windows (win32), Node v24.22.0, npm 11.19.0, Playwright 1.62.1,
Chromium 151.0.7922.34 (Playwright bundle). Desktop measurements only — no
physical-device claims are made anywhere in this document.

## Source drift check

```
git fetch origin && git status --porcelain=v1 -b && git ls-remote origin main
→ main...origin/main (clean)
→ af378c8725a1871fc9728d92719de9ca31d74a6a  refs/heads/main
```

The audited baseline **is** current origin/main. Every finding was assessed
against the identical tree the auditors reviewed.

## Baseline gates (before repairs, on the revision branch)

First install attempt note (recorded for honesty): an initial background
`npm ci` shell died mid-run leaving a partial tree; the machine's global npm
config sets `omit=dev` + `NODE_ENV=production`, so devDependencies required an
explicit `--include=dev`. Final deterministic install:

```
npm ci --legacy-peer-deps --include=dev --no-audit --no-fund
→ added 686 packages; typescript 5.9.3, vite 8.2.2 (local toolchain;
  the earlier `npx tsc --version` 7.0.2 was a global TypeScript, not the project's)
```

Historical synthesis numbers (282 core passes locally; 440+1+6 platform with a
browser-launch blocker; CI 441/6/0) were treated as historical facts, not
results of this run.

## Gate results on the final revision tree (HEAD 8f7d262 + docs)

| Command | Result |
|---|---|
| `npm run typecheck` | pass (0 errors) |
| `npm test` | **291 pass / 0 fail / 0 skip** (282 pre-existing + 9 new revision tests) |
| `npm run validate:content` | pass |
| `npm run lint` | pass (0 errors, 19 pre-existing unused-var warnings) |
| `npm run test:platform` | **451 pass / 6 skip / 0 fail** (457 total; includes the new build-pwa precache invariant test) |
| `npm run test:browser -- --suite=all` | **passed** (all 14 suites + battle-sprite-overlap; includes 4 new suites: save-permission, title-consent, battle-item-scope, battle-reach) |
| `npm run build:web` | pass (113 files / 8,582,477 B precache; `assert-production-web-shell` ok) |
| `npm run verify:web:runtime` | pass |
| `npm run verify:pwa` + `npm run test:pwa` | pass |

## Key reproductions (this revision's own evidence)

### S01 — real two-page writer authorization (tests/browser/save-permission.mjs)
One browser context, two pages, same origin (shared Web Locks + localStorage).
A acquires the real lock and saves; B is denied through its real UI (toast
"Another window holds your save"), B's Import of a valid file is refused, all
slots byte-identical, B's live purse unchanged; A saves and imports normally
(gold 777 applied, prior run rotated to backup); after A closes, B reloads and
saves (reacquisition). **PASSED.**

### S03 — blocked-flush update veto (tests/browser/pwa-update.mjs, scenario 2)
Build A served; worker controls the page; baseline saved via the real menu;
`Storage.prototype.setItem` replaced with a throwing stub; two live steps walked
(live y 8 vs durable y 6); build B activated → **zero reloads**, session alive,
old durable bytes byte-identical, persistent "Update paused — the save could
not be written…" status visible; stub removed → poll flushes → **exactly one
reload** onto B; Continue restores the walked transaction. **PASSED** (plus the
original clean A→B single-reload scenario).

### S10 — short-landscape battle dock (tests/browser/battle-reach.mjs)
Reproduced at current head with measured geometry
(`scripts/debug-battle-items-geometry.mjs`): at 844×390 the item submenu body
measured 40px client height vs 116px scroll height (row 0 center occluded by
the actions bar; row 1 outside the viewport); at 568×320 the bind submenu body
collapsed. After the dock repair, the matrix passes at 844×390, 667×375, and
568×320: all six commands, every submenu Back, item rows, and forced-switch
choices are fully in-viewport, elementFromPoint-hit, and actually actuate.
Report: `artifacts/browser/battle-reach-report.json`; screenshots
`battle-reach-*.png`. **PASSED.**

### S20 — mixed-build sequence (scripts/build-web.mjs + build-pwa.mjs invariant)
```
npm run build:web        → precached 113 files (8582477 bytes)
npm run build:web:test   → (browser-test probes build into the same dir)
npm run build:web        → precached 113 files (8582477 bytes)  ← reused output
dir .vercel/output/static/assets → index-DKs78b3E.js(+map), index-tOXiNG-Y.css only
node scripts/assert-production-web-shell.mjs → ok
```
No stale test bundle in the precache (synthesis E12 measured 114 files /
9,479,207 B before). **PASSED.**

### S25 red-before-green (touch-arbitration.mjs)
- Base (fix stashed, rebuilt): the held-key scenario FAILED — the phantom hold
  re-triggered the gate dialog after close (`.touch .d.up` never returned).
- Fix restored, rebuilt: **PASSED** — player stationary after pad unmount.
Root cause recorded: the pad stays mounted across the world↔dialog transition
(variant swap); cleanup runs on the variant transition + unmount.

### S28 — composited contrast (tests/browser/contrast.mjs)
Computed colors serialize as `oklab(...)` / `color(srgb ...)` / `rgba(...)` —
the old hex-only parser produced garbage (R09's non-hex observation confirmed
against the real UI). New parser converts oklab→sRGB and composites alpha.
Measured (390×844, battle canvas fills #ffffff/#000000):
hud-muted 13.00, hud-objective-preview 15.74, hud-objective-full 15.74,
sheet-sub 7.53, battler-name 14.38, battler-meta 11.87, meter-label 14.38 —
all ≥ 4.5 required. **PASSED** (report: `artifacts/browser/ui-contrast-report.json`).

### D-pad overlap measurement (touch-arbitration.mjs)
Measured at 390×844: adjacent directional targets overlap **64px² (8×8) on all
four diagonal pairs** at the 44px layout — R08-05's calculation confirmed by
hit-testing, not assumed. After the chamfer repair: each center hits its own
control; shared corners resolve to neither (dead pivot); no corner fires a
wrong direction. **PASSED.**

### Stage-4 measurements (scripts/stage4-measurements.mjs)
- S21 startup (desktop Chromium, 3 runs): title visible 188–211ms; world
  interactive 269–279ms warm, 1341–1364ms cold (first asset decode).
- S24 camera: calm steady-state canvas checksums identical (relief hysteresis
  real); menu-open shift measured (mechanism verified); perceived disruption
  requires human observation — no code change.
- S26 taps: 30/40/70/120ms taps each produced exactly **one** step — no
  dropped taps, so no buffer was added.
- Hidden file input: was a 1×1 focusable Tab stop with no visible indicator →
  `tabIndex={-1}` (programmatic picker verified still working); Tab walk shows
  no zero-size stops.
- Portrait dialogue (390×844, portrait NPC): scene 390×624, text visible,
  compact A/B pad 390×88 — no clipping. Screenshot recorded.

## Artifacts (this worktree, `artifacts/browser/`)

battle-reach-report.json, battle-reach-*.png (pass + fail), 
battle-item-scope-844x390.png, ui-contrast-report.json,
modal-200pct.png, camera-menu-open-390x844.png, portrait-dialogue-390x844.png,
stage4-measurements (also mirrored in the run log).

## Blocked items (exact missing access)

1. **Real Android PWA validation** — no physical Galaxy S25 Ultra (or any
   Android device) is reachable from this environment. The full checklist from
   the synthesis is ready to run; the exact build to install is this branch's
   `npm run build:web` artifact at the merge-commit SHA.
2. **Unguided first-session study** — no participant recruitment/consent
   authority. The synthesis's seven-task protocol and question set are ready.
3. **Exact-head CI artifact inspection (S05/O1)** — the repo-side fix is done
   and locally proven; inspecting the uploaded artifacts requires the next CI
   run on the merged head.
4. **Hosted playable build** — none exists in the repo; establishing one is an
   owner distribution decision (also gated on asset-provenance clearance).

## Honesty notes

- The local `npm ci` differs from CI's installation procedure (as in the
  synthesis); CI uses plain `npm ci` where the global `omit=dev` does not apply.
- Browser suites ran on the bundled Chromium 151, not a physical device; the
  568×320 viewport is a stress case, not a phone claim.
- No human comprehension, enjoyment, or retention claims are made anywhere.
- One earlier session mistake is preserved in the record: an edit briefly
  touched `scripts/journeys-ci.mjs` in the canonical checkout; it was reverted
  immediately (`git checkout --`) and re-applied in the worktree.
