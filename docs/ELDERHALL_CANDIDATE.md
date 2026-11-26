# Elderhall environment candidate

This document records the Elderhall candidate and its release requirements.
Pack 0.4.0 uses new, original pixel drawings for the cottage, guild hall, shop,
roofed well, tree and gate. The source script draws on blank canvases from the
written visual direction and the existing scene geometry. The six stable asset
IDs retain their `-reference` suffix, dimensions, anchors and render sizes.
`assets/elderhall-candidate/manifest.json` records the drawing source and each
PNG's SHA-256. No AGES engine source, unverified reference, or generated master
is needed to reproduce these six drawings.

The previous pack's six reference-conditioned landmarks were replaced because
the original reference and rights evidence could not be recovered. See
[`ASSET_PROVENANCE.md`](ASSET_PROVENANCE.md) for the separate historical hashes
and unrelated legacy artwork. The replacement bytes need their own visual
qualification. Production remains subject to the documented release gates.

## Build and verify

* A Vercel preview build includes the candidates. Locally, run
  `RELIQUARY_ELDERHALL_CANDIDATE=1 npm run build:web`.
* The public release revision is pinned in `scripts/elderhall-release.json`.
  Production ignores the preview override and serves the checked-in selection.
* The static build checks the emitted map and renderer modules, bundled save
  revision, exported asset hashes, and Workbox entries. CI runs the static
  runtime gate and offline entry on a revision 5 build without test controls.
* `node --test scripts/elderhall-pack.test.mjs` verifies hashes, decodability,
  manifest identity, provenance field structure, selected export paths and
  the actual atlas cell edges. The six original landmarks also bind their
  drawing source.
* To reproduce the six original landmark PNGs, run
  `python scripts/draw-elderhall-landmarks.py --out path/to/output --preview`
  with Python 3 and Pillow 10.4.0. Compare the PNG digests to the manifest.
* The pack is supplied by AGES as `ages.environment-pack/1`. Re-export it in
  AGES, replace `assets/elderhall-candidate/`, validate with
  `ages environment-pack-verify assets/elderhall-candidate --json` (private AGES
  checkout) or `node --test scripts/elderhall-pack.test.mjs`, then build a
  preview. AGES validates the environment pack. Reliquary selects the required
  environment art plus the inn and checks the separate seven-character portrait inventory.

The pack records source image dimensions, anchors and authored render sizes.
`src/game/render/elderhall-visual.ts` explicitly applies scene-scale choices
to those values. Collision is owned by the game map, not the source art: the
gate uses two separate solid post rectangles and an open center, while the
well and buildings retain their existing footprint sizes. The preview moves the
well, Maren, the green tree and a villager to recompose the village. Its gate
posts are at (9, 6) and (12, 6), the guard is at (13, 7), and the sign is at
(14, 4); the normal map retains its coordinates. The preview uses world
revision 5 while production remains at revision 2. It relocates older saves,
including revision 4, only when a new solid footprint makes their position
invalid; valid positions and the rest of the save are preserved. Preview saves
use a newer revision than production, so they are not silently treated as
compatible with the production world.

The exploration camera can use more portrait height while leaving a separate
touch-control band. It keeps the authored tile scale and caps the visible
height against the map; dialogue, menus, battles and landscape keep their
existing layouts. CI captures multiple browser viewpoints, while physical-device
checks and subjective visual review remain necessary.

The candidate terrain bake shapes road edges and well paving while retaining
tile movement. Binding Grove uses the same atlas family with woodland tones.
The objective summary opens the Lantern reading panel, and the gate uses a
local silhouette cue where opaque art covers the player.

These historical Chrome captures compare revision 5 before and after polish
with the previous landmark art. They use fixed positions for framing. The
natural journeys exercise the same locations through the game's controls.
[Terrain and thresholds](evidence/elderhall-final/terrain.webp)
· [Gate, objective and Maren](evidence/elderhall-final/readability.webp)

The title waits for required world art before entering the world and offers a
retry if loading fails or stalls. The renderer also has fallbacks for the well,
houses, tree and gate posts. The replacement gate and other landmarks still
need visual review at multiple camera positions and device sizes. The pack
does not certify reference fidelity, gameplay, accessibility, licensing or
commercial readiness merely because its structural checks pass.

## Promotion and rollback

The repository owner delegated the final artwork decision and authorized
production promotion after qualification. Record the decision as delegated
agent acceptance. Include the reviewed artwork, provenance, installed
Android results, visual evidence, and exact candidate commit in the release
record. Record the digest of the qualification artifact built without browser
probes. Update `scripts/elderhall-release.json` to revision 5 with an
`approval` object containing `evidence`, `candidateCommit`, `manifestSha256`,
`worldSha256`, `portraitsSha256`, and `artifactSha256`.

The world digest covers Elderhall, Binding Grove and four village interiors,
including prop layouts, collision and warps. The artifact digest binds served
files including the JavaScript, styles, images and offline worker. Diagnostic
source maps are verified separately by the build. Use a normal `npm ci` in
the qualification checkout so the emitted dependency paths match CI and Vercel.
Produce the digests from the accepted checkout with Node:

```sh
RELIQUARY_ELDERHALL_CANDIDATE=1 npm run build:web
node --input-type=module -e '
  import { approvedElderhallDigests, elderhallArtifactDigest } from "./scripts/elderhall-release.mjs";
  console.log({
    ...(await approvedElderhallDigests("assets/elderhall-candidate")),
    artifactSha256: elderhallArtifactDigest(".vercel/output/static"),
  });
'
```

Run `VERCEL_ENV=production npm run build:web`, then
`npm run verify:web:runtime`, and qualify that exact commit before an
authorized promotion. The production build compares its output with the
accepted runtime digest. Keep a known-good revision 5 artifact available to
roll forward if the release fails. If service must fall back to revision 2,
tell players with revision 5 saves to export the exact record from the title
screen and retain it until revision 5 returns. Leave browser storage intact.
The older build can restore service for compatible saves while revision 5
progress remains available for recovery in a compatible build. If a revision
2 write archived the revision 5 record, the restored revision 5 title offers
**Export archived save**. Export it and use **Import** from the Lantern menu
to resume it. The active run remains selected until the player imports.

Preserve the current production revision 2 artifact for rollback. It can
write an active revision 2 save while a distinct revision 5 archive and
backup remain in their original slots. An older revision 2 build can pause
an update when it cannot safely rotate a backup. In that case, export any
unsaved progress from Lantern before closing and reopening the game.

Run the same-origin transition check with the historical revision 2 artifact
for the initial upgrade, the current revision 2 build for rollback, and the
probe-free revision 5 build for upgrade and recovery.

```sh
RELIQUARY_LEGACY_STATIC_ROOT=/path/to/revision-2/.vercel/output/static \
  RELIQUARY_ROLLBACK_STATIC_ROOT=/path/to/current-revision-2/.vercel/output/static \
  RELIQUARY_QA_CHANNEL=chrome node tests/browser/elderhall-release-transition.mjs
```
