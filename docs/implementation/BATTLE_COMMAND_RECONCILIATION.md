# Battle command/log reconciliation — 2026-11-15

## Revision and environment

| Item | Value |
|---|---|
| Main at start | `15f9235` (`origin/main`, PR #48 merged) |
| PR #50 head (battle reconstruction) | `945214f` |
| PR #49 head (exploration chrome + pact names) | `a1a8eac` |
| Integration merge | `f8adcf2` (PR #50 + PR #49, one layout conflict resolved) |
| Verified fix commit | `fe9a916` (`fix/battle: sync journey waits with resolved logs and unclip narrow recap`) |
| Worktree | `/home/ubuntu/work/reliquary-battlefix`, branch `fix/battle-command-reconciliation-20261115` |
| Baseline worktree | `/home/ubuntu/work/reliquary-baseline-pr50` at `945214f` |
| Runtime | Ubuntu 24.04, Node `24.22.2`, npm `11.19.1` (`NODE_ENV` unset; `npm ci --include=dev`) |
| Browser | Playwright Chromium `151.0.7922.34`, headless |

Evidence class: **headless rendered browser and built artifacts**. No physical device,
installed PWA, live provider call, deployment or merge was performed.

## What was red on `945214f`

All four failures were reproduced locally on the untouched PR #50 head before changing
behavior:

1. `node tests/browser/battle-recap.mjs` at 320×568/win:
   `AssertionError: win: recap must not clip an action` with
   `{"box":{"right":323.64},"clip":{"right":320},"fullyVisible":false}`.
2. `scripts/chapter-one-qa.mjs`:
   `binding did not succeed: A wild Mothwisp steps from the grass.`
3. `scripts/natural-journey-qa.mjs`:
   `Expected the failed binding result in the battle log: A wild Mothwisp steps from the grass.`
4. `scripts/chapter-one-fixture-qa.mjs`:
   `[warden-trial] Error: trial did not conclude within 240 rounds`, with
   `phase=command rows=[]` from round 10 onward.

The clone/floor metadata (`node_modules`, static shell) was verified before these runs;
failures 1–4 are not historical CI claims.

## Root causes and fixes

| Area | Cause | Fix |
|---|---|---|
| 320px recap clipping | `.battle-footer` is a grid item with `min-width:auto`; its min-content width expanded the dock's single column track to 326.7px inside a 302px container. The right-aligned Continue button then ended at x=323.6 under a 320px viewport. | `.battle-footer { min-width: 0; }`. Measured live: track 302.1px, button right edge 305.05px inside the 311.05px card. No test assertion changed. |
| Natural bind waits | PR #50 replaced `.cmd` with `.battle-action`, but the command grid is mounted in every phase. `waitForFunction` returned immediately and the script read the encounter intro before the turn resolved. | Wait for the resolved `.battle-log-text` (`accepts the compact` / `breaks the sigil`). The outcome assertions remain. |
| Warden trial loop | Script still counted `.battle-ui ul.cmd` (old submenu selector) and a no-space HP regex. `cmd=0` skipped every action until the round cap. | Drive the loop from `.battle-controls[data-battle-phase]` and the six accessible `.battle-action` buttons; read `HP 74 / 74` with a whitespace-tolerant regex. Forced-switch rows still use enabled-row semantics. |
| Journey coverage | Party rename/save existed, but box storage and failed-bind retry were not exercised on the natural route. | Added keyboard-only Storage → Store Fogmote → saved party/box assertion → reload → retrieve → Party, plus a failed-bind retry that succeeds. |

## Verification on `fe9a916`

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | pass |
| Lint | `npm run lint` | pass |
| Unit | `npm test` | 429/429 pass |
| CI platform | `npm run test:platform` | 608 pass, 0 fail, 6 platform-only skips |
| Content | `npm run validate:content` | pass |
| Production build | `npm run build` | pass |
| Production web artifact | `npm run build:web` | pass |
| Production runtime | `npm run verify:web:runtime` | pass; all mutator hooks absent/unusable |
| PWA | `npm run verify:pwa && npm run test:pwa` | pass; 9/9 |
| Browser suite | `npm run test:browser -- --suite=all` | all suites pass |
| Chapter journeys | `RELIQUARY_QA_CHANNEL=chromium node scripts/journeys-ci.mjs` | 5/5 pass |
| Main-battle animation capture | `node scripts/battle-stage-browser.mjs .vercel/output/static artifacts/browser/battle-stage-anim` | 6 viewports + reduced motion |

Browser suite coverage included: layout at 320×568, 360×800, 390×667, 390×844,
412×915, 640×320, 844×390, 1280×800; battle stage at 1536×864, 1440×900, 1280×800,
844×390, 640×320, 568×320, 390×844, 390×667, 320×568, 768×1024, 834×1112;
battle recap at seven sizes; keyboard/touch parity; live resize; sprite overlap;
save permission; title consent; PWA offline/update; cinematic dialogue; AGES animation
and PPC previews.

## Journey evidence (headless, real UI, seeded random where stated)

`chapter-one-qa.mjs` — fresh Rowan, cottage → Elderhall → Binding Grove, Emberkit
starter, Briar Road wild Mothwisp, successful bind, capture nickname `Glimmermote`,
keyboard rename to `Fogmote`, storage round trip, inn decline/rest, save, reload,
stored-state verification, retrieve, Party, portrait Pack/Party taps:

- `Stored Fogmote in the box; the saved party/box counts match the UI`
- `Reload preserved the stored Fogmote and the one-companion party`
- `Saved and reloaded; storage round trip, renamed companion, gold and map survived`

`natural-journey-qa.mjs` — no warps/battle shortcuts; wild bind fails, then retries and
succeeds:

- `Mothwisp breaks the sigil. Mothwisp uses Gleam! 4 harm.`
- `Retried the failed sigil and bound the wild beast: Mothwisp accepts the compact.`

`chapter-one-fixture-qa.mjs` — prepared saves (explicitly not natural progression):
learn replace/decline, whiteout, Cael advisory decline, Pack targeting, and the Warden
trial won through the real UI with Thorn Mark and post-trial objective.

Independent state checks read the v3 save, not only the DOM:

- after Store: `party.length === 1`, `box.length === 1`, `box[0].nickname === "Fogmote"`;
- after reload: storage screen showed one travelling companion and stored Fogmote;
- after retrieval: `party.length === 2`, `box.length === 0`.

## Captures

In `docs/implementation/evidence/battle-command-reconciliation/`:

| File | Shows |
|---|---|
| `before-945214f-recap-320x568-win.png` | Continue clipped at the 320px right edge |
| `after-fe9a916-recap-320x568-win.png` | Continue fully inside the card |
| `before-945214f-trial-stuck-100.png` | Trial idling at round 100 with zero rows found |
| `after-fe9a916-trial-victory.png` | Trial won and reward screen |
| `after-fe9a916-storage-box.png` | Fogmote stored, party/box counts visible |
| `after-fe9a916-storage-after-reload.png` | Stored Fogmote survived reload |
| `after-fe9a916-failed-bind-retry.png` | Retry succeeded after a failed sigil |

The posture, status-card, control, sprite-grounding and animation captures from the
matrix are in `artifacts/browser/` (gitignored): `battle-stage-browser/`,
`battle-stage-anim/`, `battle-journeys/`, `battle-recap-*.png`.

## Not verified / boundaries

- No physical Android/iOS device, installed PWA, screen reader, or human comprehension
  session. Frame-rate samples are headless desktop measurements, not a device baseline.
- No deployment, merge, live billed provider call, or production database migration.
- The battle engine's combat math was not reimplemented or rebalanced. The selector
  failures were harness synchronization, not evidence of combat correctness; combat was
  exercised through the real engine in the five journeys and `battle-journeys.mjs`.
- PR #49 and PR #50 are still open and unmerged. This work is a local integration branch
  plus a verified fix commit; publishing it needs separate authorization.

## Asset rights — unresolved

`docs/ASSET_PROVENANCE.md` remains the authority. Nothing here clears rights:

- shipped species, NPC, prop, tile, background and UI art are derived from external
  Imagine source art whose generator/authorship is unrecorded;
- full-resolution masters are outside this repository in unverified private storage;
- `refs/pull/1/head` still exposes 37 removed blobs (GitHub Support needed);
- branding assets (`favicon.svg`, `og.jpg`, `x-banner.jpg`) have no identified source;
- the Elderhall candidate pack is preview-only generated art, not production approval.

No new art was added in this change.

## Next slice

Selected from the repository's own sequencing (`docs/CREATURE_ROADMAP.md`): **single
authored rescue egg + Binding Grove nursery prototype** — one family, one egg, an
explicit preview/confirm, step-based incubation, explicit party-vs-box destination,
and save-version/migration tests that never consume a parent or rename it. This is the
documented next progression prototype after battle/input/save reliability; it is not
implemented here and needs owner go-ahead before content expansion.
