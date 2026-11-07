# Preview an AGES asset in Reliquary

Requires Node.js 24, a clean checkout with `npm ci` complete, and an AGES
`PREVIEW_ONLY` runtime export using schema 1.7.0.

1. Export the candidate to a local folder outside Reliquary's `public/` tree.
   Keep the package SHA-256 from the AGES export result.
2. Run `npm run build:ages-preview`. Its JSON summary reports the dedicated
   build at `dist/ages-preview`.
3. Serve this directory on a dedicated localhost origin. For example, with
   Python 3 installed, run
   `python -m http.server 4181 --bind 127.0.0.1 --directory dist/ages-preview`.
   Open [the preview session](http://127.0.0.1:4181/?ages-preview=1).
4. Open **AGES preview** outside battle. Select **Creature**, paste the SHA-256
   from step 1, and select all four files together. The files are `atlas.png`,
   `integrity.json`, `provenance.json`, and `sprite.runtime.json`. Select
   **Load preview**. The panel shows the subject, candidate ID and accepted
   digest, or a machine-readable error code. If the package's subject is an
   experimental id rather than a game species, put the game species id in
   **Preview as species (optional)**. This is a session-only presentation
   binding: the package keeps its real subject id and provenance.
5. To include an effect, load a second four-file package in the **Impact
   effect** slot. Use that package's own digest.
6. Play a battle with the creature matching the package's subject ID.
   **Clear previews** removes both selections. Reloading also clears them.

This build includes Reliquary's existing browser test hooks. Keep it on a
local port used exclusively for preview. The opted-in session has read-only
save access in the separate `ages-preview:` storage namespace and does not
register a service worker. The package stays in browser memory and the file
picker does not upload it or resolve paths from it. Never copy either package
into `public/` or deploy `dist/ages-preview`.

## Runtime mapping

| AGES metadata | Reliquary behavior |
| --- | --- |
| `subject_id` | Exact match for either battle side, or the explicit **Preview as species** alias. Other species use canonical art. |
| `idle` | Uses the exported loop flag. Without the state or after a non-looping clip ends, canonical art is available. |
| `attack_melee` / `attack_elemental` | Chosen from the authoritative skill `kind` (`strike` → melee, spell/hex → elemental), with `attack`/`cast` fallbacks. |
| `miss` | Starts on an authoritative miss; a missing miss clip uses the attack frames without impact. |
| `hit` reaction | Plays on a landed hit after the attacker's real `impact` marker, or a bounded 240 ms fallback when the loaded package lacks that timing. It waits for the defender's own clip to finish. |
| `faint` / `defeat` | Starts at the attacker's impact marker (or bounded fallback) and holds the final frame; the fainted side stays visible for the defeat pose. |
| `impact` event | The first marker opens the effect window on a hit. Duplicate markers cannot replay that impact. |
| Optional effect states | `impact_<element>` → `impact_<kind>` → `impact`; drawn over the resolved target with the package's own pivot. |
| Frame rectangles, duration, logical pivot and offsets | Drive Canvas drawing. Gameplay root and event payload remain metadata. |
| Reduced motion | Holds the first preview frame, disables impact overlays, and shows the final defeat pose. |

The importer's size limits are 32 MiB for the atlas, 512 KiB per JSON member,
4096 px for each atlas edge, and 1,024 total frames. The browser requires the
full four-file package, verifies its hashes, and accepts only
`PREVIEW_ONLY`. The package digest should come from the export result, rather
than from the selected files. Preview validates identity and package structure.
AGES remains the source of licensing, review, promotion, and rollback decisions.

## Reproduce the browser proof

Install Chromium with `npx playwright install chromium`. Generate the synthetic
fixture with the AGES repository's `scripts/qualify_external_preview.py`.
Then run:

```text
npm run build:ages-preview
node tests/browser/ages-preview.mjs ../ages-preview-fixture artifacts/browser/ages-preview
npm run build:web
npm run verify:web:runtime
npm run verify:pwa
```

The browser test imports the actual AGES export through the file picker, takes
a real combat turn, checks Canvas pixels and package digests, and writes
`report.json` and screenshots. The viewport checks simulate screen dimensions
in Chromium. The production runtime gate also tries the preview query, checks
the service worker's cache and tests offline reload.

AGES can also inspect this checkout using `.agent-game/manifest.yaml`. Its
T0 checks invoke typechecking, content validation, and the production web build.
T1 invokes the core gameplay and save regressions.

## Experimental Procedural Pixel Creatures fixtures

Three real AGES exports from the optional Procedural Pixel Creatures backend
(upstream `a2207c4bd6f1be51d426684cf58f11668def7579`) are committed under
`tests/fixtures/ages-ppc/`:

| Fixture | Genome | Preview alias | Direction |
|---|---|---|---|
| `amorphous-424242` | `Grovek` `0244d2df6da7136f` | `dewslime` | east |
| `quadruped-7` | `Kromoubel` `a5f5e26966e0282b` | `gutterrat` | east |
| `reptile-424242` | `Grovek` `e0a142e3787bbe00` | `mirewhelp` | east |

All three are **experimental and preview-only**: they are not canonical artwork
and do not reidentify the aliased species. Use **Preview as species** for the
alias; each package keeps its true subject id (`ppc_<family>_<seed>`), genome,
upstream commit, generator fingerprint and rights in `source/`.

The packages use `--bake-hit-flash false`, so the first hit frame keeps the
recoil pose instead of a full-white silhouette. PPC has no impact-event timing,
so they demonstrate idle, generic `action` → `attack_melee`, `hit`, recovery and
reduced motion; they do not claim elemental effects or a defeat animation.

```text
npm run test:ppc
npm run test:ppc-creatures
```

`tests/browser/ages-ppc.mjs` covers the slime's idle, attack, hit, recovery,
reduced motion, mobile viewport and save isolation.
`tests/browser/ages-ppc-creatures.mjs` covers all three candidates' idle, attack,
hit and recovery in actual Chromium battles, with screenshots in
`artifacts/browser/ages-ppc-creatures/`.

Visual fit: the ox and crocodile read clearly at game size; the slime is small but
appropriate for its body plan. None is a canonical replacement. The AGES visual
review (`docs/PPC_VISUAL_REVIEW.md` in the AGES repository) records the winged
seed-424242 failure and the gene preset that fixes it; that genome is deliberately
not shipped as a Reliquary candidate.
