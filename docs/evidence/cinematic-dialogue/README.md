# Cinematic NPC conversations — issue #31

Integration base: `3b8bcc1a1d8eca9a2fde12478dd32b26b5e514ef` (latest fetched
main when this isolated branch was created). No experimental PR was merged.

## Source evaluation and decisions

| Source | Inspected candidate | Kept | Intentionally left out |
|---|---|---|---|
| [A / #27](https://github.com/gthgomez/reliquary/pull/27) | `7b4f428c0c6f540df659f975ccdd9f63181594ab` | Large original Maren/Cael SVGs, world dimming, character beside parchment | Talk-key identity; generic hood/monogram for every other character; fixed portrait bottom offset on phones; no observed Actions run for this head |
| [B / #26](https://github.com/gthgomez/reliquary/pull/26) | `27ebd76d5d08d6ca9b6facd787f6f6a954f7c489` | Four restrained supporting role assets, status yields during dialogue, shop remains direct | Tiny avatar card; alternate Maren/Cael art; missing Patch portrait; hard-coded inn follow-up name |
| [C / #29](https://github.com/gthgomez/reliquary/pull/29) | `a8fdfa77ee7047c30054ae71981a0deebdfee601` | Placed `MapNpc.id`, typed portrait key, Patch precedence, engine flow tests | Large inline SVG framework, floating plaque, phone portrait near HUD, landscape status overlap |

OBSERVED: B's [CI run](https://github.com/gthgomez/reliquary/actions/runs/41752653455)
and C's [CI run](https://github.com/gthgomez/reliquary/actions/runs/41761365024)
both completed successfully on Linux and Windows. A had no Actions run returned
for its source head. Source claims were reviewed, not treated as verification of
this integration. Per the issue owner's correction, C is Ling 3.1 Flash.

One `portraits.ts` registry owns artwork, role labels, placed IDs and generic
sprite fallbacks. Named artwork never falls back from `elder` or `warden` to
Maren or Cael. Patch overrides his human shopkeeper map sprite. Unknown identity,
signs, objects, creatures and system text remain text-only. Supporting NPCs share
role portraits; their actual placed name always remains the nameplate.

One `DialogScene` renders the existing `.dialog` button, using the engine's
existing input/callback handling. A CSS grid gives portrait and text separate
space, including long pages. The nameplate and Next/Close cue are in normal text
flow, preventing plaque clipping and wrapped-text collisions. HUD/toast chrome
yields for NPC conversations; AppStatus stays mounted and yields for all dialogue.
Everything returns on close. Landscape A/B controls use the safe side gutter.
The default conversation layout releases the unused left D-pad gutter, so even
568×320 screens retain enough width for long speech without shrinking the font.
Classic touch retains its D-pad in the left gutter, removes its redundant bottom
reservation in landscape, and gives prose a larger share on small screens.
Entrance motion obeys reduced-motion; there is no delayed interactive exit.

The alternative of copying A's absolute positions would retain its phone text
collision risk; copying C's framed plaque would keep the landscape edge case.
The grid uses existing viewport/touch reservations without a new camera system,
dependency, runtime resize service, save schema or security change.

## Running-game screenshots

Chromium, CSS viewport dimensions below, actual keyboard/touch interactions.
All fixture warps use `build:web:test`; production probe gating is unchanged.
These are browser emulations, not physical-device photographs.

| Viewport | Maren | Cael's long trial page |
|---|---|---|
| Desktop 1440×900 | [Maren](1440x900-maren.png) | [Cael](1440x900-cael-long.png) |
| Phone 390×844 | [Maren](390x844-maren.png) | [Cael](390x844-cael-long.png) |
| Short landscape 844×390 | [Maren](844x390-maren.png) | [Cael](844x390-cael-long.png) |
| Smaller landscape 667×375 | [Maren](667x375-maren.png) | [Cael](667x375-cael-long.png) |
| Small landscape 568×320 | [Maren](568x320-maren.png) | [Cael](568x320-cael-long.png) |
| Narrow phone 360×740 | [Maren](360x740-maren.png) | [Cael](360x740-cael-long.png) |
| Landscape with safe insets (top 12, sides 44, bottom 21) | [Maren](844x390-safe-area-maren.png) | [Cael](844x390-safe-area-cael-long.png) |

[Patch](1440x900-briar_camp-patch.png) ·
[Guard role fallback](1440x900-elderhall-guard.png) ·
[Text-only sign](1440x900-sign.png)

### Visual comparison

| Reference | Source capture | Integration capture and observed change |
|---|---|---|
| A: cinematic scale | [Desktop Maren](https://raw.githubusercontent.com/gthgomez/reliquary/7b4f428c0c6f540df659f975ccdd9f63181594ab/docs/evidence/dialogue-portraits/maren-desktop-1440x900.png) | [Desktop Maren](1440x900-maren.png): same expressive upper-body art; secondary HUD yields |
| B: support treatment | [Desktop portrait card](https://raw.githubusercontent.com/gthgomez/reliquary/27ebd76d5d08d6ca9b6facd787f6f6a954f7c489/docs/benchmark/run-b/desktop-1440x900-elder-maren.png) | [Guard](1440x900-elderhall-guard.png): role art becomes a full character in the same scene, without its old rectangular card background |
| C: landscape defect | [Landscape Maren](https://raw.githubusercontent.com/gthgomez/reliquary/a8fdfa77ee7047c30054ae71981a0deebdfee601/docs/dialogue-portraits/landscape-844x390-maren.png) | [Landscape long page](844x390-cael-long.png): no status text through panel; plaque contained; A/B off the scene |
| C: Patch identity | [Patch sigil](https://raw.githubusercontent.com/gthgomez/reliquary/a8fdfa77ee7047c30054ae71981a0deebdfee601/docs/dialogue-portraits/desktop-1440x900-patch.png) | [Patch](1440x900-briar_camp-patch.png): retained goblin identity, now a distinct face in the supporting vector style |

## Reproduce

Use Node 24 (`.nvmrc`), npm, and the committed lockfile:

```powershell
npm ci --include=dev
npm run build:web:test
$env:RELIQUARY_DIALOGUE_CAPTURES = 'docs/evidence/cinematic-dialogue'
node tests/browser/cinematic-dialogue.mjs
```

Omit the capture environment variable to run assertions without writing images.
The `dialogue` and `all` browser suites include this test. Geometry captures
include panel, portrait, nameplate, text, Next/Close, visible HUD/status and touch
rectangles. Assertions cover containment, pairwise overlap, safe insets, both
document dimensions, long Cael/Wayfarer speech and multi-page navigation, two Maren/Cael
placements, Patch, guard, sign, starter and inn callbacks, cancel, movement lock,
movement restoration, menu return, classic touch and reduced motion.

## Local verification

Windows, Node 24.22.0, npm 11.19.0. Clean install succeeded using a task-local
npm cache after the host's shared `_cacache` was observed to be a file.
The lockfile and dependency versions are unchanged.

| Command | Observed outcome |
|---|---|
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; 11 existing warnings, no new warning locations |
| `npm test` | Exit 0; 212 tests passed (14 focused portrait/flow tests) |
| `npm run validate:content` | Exit 0; valid |
| `npm run build` | Exit 0 |
| `npm run build:web` | Exit 0; production shell gate passed |
| `npm run verify:web:runtime` | Exit 0; production controls/economy/battle test hooks absent or unusable |
| `npm run verify:pwa` | Exit 0 |
| `npm run test:pwa` | Exit 0; 5 tests passed |
| `npm run test:browser -- --suite=all` | Exit 0; all 11 browser files plus renderer overlap check passed |
| `node tests/browser/cinematic-dialogue.mjs` | Exit 0; expanded suite measured 100 dialogue states across 10 configurations, including classic landscape and safe areas |
| `node --test scripts/vite-browser-test-flag.test.mjs` | Exit 0; 6 tests passed |
| `node --test --test-name-pattern="production web artifact\|deploy build" scripts/assert-production-web-shell.test.mjs` | Exit 0; 2 tests passed |

Exact-head GitHub Actions status is recorded in the draft PR. No deployment or
merge is part of this change.

A fresh independent read-only review of `75a42f8` identified narrow-landscape
height as an uncertainty. Browser reproduction confirmed Maren's second page
clipped at 568×320. Releasing the unused conversation D-pad gutter fixed it;
both 667×375 and 568×320 now run through the full dialogue scenario matrix.
Review disposition for the final candidate is recorded in the draft PR.

## Limitations

- Static vector portraits; supporting characters share role art. New unillustrated
  NPC kinds remain text-only until deliberately added to the registry.
- Shopkeepers still open the existing shop directly, without an intervening
  dialogue. This preserves gameplay behavior.
- Physical mobile Safari/Android and screen-reader use have not been exercised.
- The unrelated managed-workspace layout check reports pre-existing unexpected
  root entries. No unrelated project or experimental worktree was modified.
