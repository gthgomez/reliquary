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
   digest, or a machine-readable error code.
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
| `subject_id` | Matches an existing species ID for either battle side. Other species use their canonical art. |
| `idle` | Uses the exported loop flag. Without the state or after a non-looping clip ends, canonical art is available. |
| `attack` and optional `miss` | Starts on the existing damage or miss result. A missing miss clip uses the attack frames without impact. |
| `impact` event | The first marker opens an optional effect window on a hit. Duplicate markers cannot replay that impact. |
| Optional effect package `impact` state | Draws RGBA frames over the resolved target. Loops only during the triggering attack when the effect state requests it. |
| Frame rectangles, duration, logical pivot and offsets | Drive Canvas drawing. Gameplay root and event payload remain metadata. |
| Reduced motion | Holds the first preview frame and omits impact overlays. |

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
