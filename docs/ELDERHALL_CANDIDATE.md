# Elderhall environment candidate

This is an experimental AGES environment pack, not a production art approval.
Its generated cottage, guild hall, shop, roofed well, tree and gate were created for this task
with the built-in OpenAI image tool using the owner-supplied Elderhall image as
the visual reference. The guild and shop also used the generated cottage as a
supporting style reference, recorded in each asset's generation method. Their
original-image and reference SHA-256 hashes,
preparation operations and candidate status are in
`assets/elderhall-candidate/manifest.json`. The terrain, flowers, bench and
other simple props were drawn deterministically for this task. No AGES engine
source or generated master images are part of this public pack.

The owner requested generation and integration into this public project.
OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use/) assign output
rights to the user as between the user and OpenAI, subject to applicable law.
This record does not independently establish third-party rights in the supplied
reference or any exclusive copyright in generated output. Existing game art has
its own unresolved provenance noted in `ASSET_PROVENANCE.md`. Visual and rights
review are still required before production promotion.

## Build and verify

* A Vercel preview build includes the candidates. Locally, run
  `RELIQUARY_ELDERHALL_CANDIDATE=1 npm run build:web`.
* A Vercel production build never includes the candidate files, even if the
  local override is set. A normal `npm run build:web` also omits them.
* `node --test scripts/elderhall-pack.test.mjs` verifies hashes, decodability,
  manifest identity, selected export paths and the actual atlas cell edges.
* The pack is supplied by AGES as `ages.environment-pack/1`. Re-export it in
  AGES, replace `assets/elderhall-candidate/`, run the test above, then build a
  preview. The build copies a selected subset only after validation.

The pack records source image dimensions, anchors and authored render sizes.
`src/game/render/elderhall-visual.ts` explicitly applies scene-scale choices
to those values. Collision is owned by the game map, not the source art: the
gate uses two separate solid post rectangles and an open center, while the
well and buildings retain their existing footprint sizes. The preview moves the
well, Maren, the green tree and a villager to recompose the village; the normal
map retains its coordinates. The preview uses world revision 4 and relocates
older saves only when a new solid footprint makes their position invalid.
Preview saves use a newer revision than production, so they are not silently
treated as compatible with the production world.

The exploration camera can use more portrait height while leaving a separate
touch-control band. It keeps the authored tile scale and caps the visible
height against the map; dialogue, menus, battles and landscape keep their
existing layouts. Browser screenshots and actual-device checks are still needed
for the revised composition and transitions.

If a candidate image fails to load, existing art remains the fallback for the
well, houses and tree; the gate uses visible placeholder posts rather than
invisible blockers. The generated gate and candidate artwork still need
browser-based review at multiple camera positions and device sizes. The pack
does not certify reference fidelity, gameplay, accessibility, licensing or
commercial readiness merely because its structural checks pass.
