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

## Historical local gates (HEAD 8f7d262 + docs, before review follow-up)

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
568×320. That historical check measured page bounds and center hits; the review
later showed it could miss clipping by the dock itself. The strengthened
follow-up intersects clipping ancestors and scrolls only the submenu body.
It actuates commands, Back and switch choices; item rows are exposed and
hit-tested, without claiming their activation in this particular suite.
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
   Android device) was reachable during the revision. The follow-up `adb devices`
   check also listed no attached device. The self-contained install/offline/update
   packet and exact-build identification are in [REVISION_MANUAL_VALIDATION.md](REVISION_MANUAL_VALIDATION.md).
2. **Unguided first-session study** — no participant recruitment/consent
   authority. A self-contained seven-task protocol, consent procedure, debrief and
   result form are now in [REVISION_MANUAL_VALIDATION.md](REVISION_MANUAL_VALIDATION.md).
3. **CI artifact inspection (S05/O1) — DONE.** The reviewed head `517cb03` has a successful
   CI run 42128122546. Its tested merge SHA is `fac112751bd0adbef3a1b6ef2c4b32c5eb2b04cc`.
   It uploaded `journey-evidence-ubuntu-latest` and
   `journey-evidence-windows-latest`, both inspected: per-journey JSON + PNGs + `manifest.json`
   (gitSha/gitRef/runId/node/platform/channel/journeys). The upload fails on missing evidence.
4. **Hosted access** — GitHub reports a Ready Vercel preview for PR #38. Whether a
   tester can access the exact build remains to be recorded; owner asset clearance
   is still open. No production-readiness or asset-rights conclusion follows from that status.

## Previously verified PR candidate (517cb03)

- PR: https://github.com/gthgomez/reliquary/pull/38 (draft, branch `codex/reliquary-s-revision`).
- Reviewed head: `517cb0359b1a79497e84fa170c263fabecd71ca3`. CI run
  [42128122546](https://github.com/gthgomez/reliquary/actions/runs/42128122546): all four
  jobs pass across Ubuntu and Windows; Vercel reports a Ready preview. The earlier
  run 42126685923 belongs to `d31b999`, not the final documentation commit.
- Ubuntu verify totals: platform suite 459 tests / 453 pass / 0 fail / 6 skipped (developer-local
  skips); browser-test-flag regression 6/6; browser-free deploy build regression 2/2; browser journeys
  all PASS on both OSes. Windows platform suite: 459/453/0/6.
- CI failures encountered and resolved during this revision (all root-caused, none masked):
  1. `battle-reach.mjs` — a Strike can fell a weak wild foe and a flee can succeed; the scenario now
     settles command-or-win and banks the win before the remaining checks (`880cec7`).
  2. `chapter-one-fixture-qa.mjs` forced-switch assertion called node-style `assert.equal`; the file
     defines its own boolean `assert` + `assertEq` helpers. Fixed to the file's convention, and the
     full journeys suite was run locally before push (`210053c`).
  3. Intermittent ubuntu pngjs "read requests waitng on finished stream" in the manifest-icons test:
     node --test runs test files concurrently and the regenerated PNGs were read mid-truncate. The
     generators now stage outside `public/` and `rename(2)` into place (`d31b999`). Journey runs
     around the fix: fail (assert bug) → pass → fail (race) → pass/pass after the atomic writes.

## November 6 review follow-up

The prior delivery comprised 10 commits (not 11) from `af378c8` through `517cb03`,
with 41 files changed (+2640/-169). The subsequent owner request authorizes repairing
the review findings, pushing and merging PR #38 after the checks and review gates.
Follow-up code and local verification are recorded in [REVISION_FOLLOWUP.md](REVISION_FOLLOWUP.md).
The current PR head/checks bind later CI results; the historical runs above must not
be used as evidence for a different candidate.

## Honesty notes

- The local `npm ci` differs from CI's installation procedure (as in the
  synthesis); CI uses plain `npm ci` where the global `omit=dev` does not apply.
- Browser suites ran on the bundled Chromium 151, not a physical device; the
  568×320 viewport is a stress case, not a phone claim.
- No human comprehension, enjoyment, or retention claims are made anywhere.
- One earlier session mistake is preserved in the record: an edit briefly
  touched `scripts/journeys-ci.mjs` in the canonical checkout; it was reverted
  immediately (`git checkout --`) and re-applied in the worktree.
