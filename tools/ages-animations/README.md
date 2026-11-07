# Reliquary AGES animation authoring

Original, deterministic creature and combat-effect animations for Reliquary,
authored as procedural pixel art and imported through AGES's real
external-import → runtime-export pipeline.

## Provenance and rights

- Every shape is composed at run time from primitives in `generate.py`. No
  third-party, commercial, or copied sprite sheet is read or traced.
- Each AGES declaration records the source as `Original-Procedural-Art` with an
  evidence string pointing back to this directory. The imported candidate keeps
  `source-declaration.json`, `source-provenance.json`, and its per-frame hashes.
- The exported packages are `PREVIEW_ONLY`. They are **not** production-approved
  artwork and do not replace canonical sprites. Promotion still requires the
  existing AGES review, rights, runtime-qualification, and publication controls.

## What is authored

Per creature (`emberkit`, `mirewhelp`, `briarling`), five clips:

| State | Frames | Behaviour |
| --- | --- | --- |
| `idle` | 4 | Looping breath/tail sway |
| `attack_melee` | 5 | Anticipation → lunge → contact → follow-through → recover; `impact` on frame 2 |
| `attack_elemental` | 6 | Charge → rear → release → burst → recover; `impact` on frame 3 |
| `hit` | 3 | Recoil → flinch → settle |
| `faint` | 4 | Stagger → collapse → rest (holds the final frame) |

Effects package (`reliquary-effects`): `impact`, `impact_melee`,
`impact_ember`, `impact_tide`, `impact_verdant` (one-shot, transparent).

Timing is explicit per frame; timing is not forced to a uniform FPS. Pivots sit
at the creature's feet (`[32, 60]`); effect pivots are centred on the target
(`[32, 50]`).

## Reproduce

```bash
# 1. Generate editable sheets + AGES declarations
python tools/ages-animations/generate.py --out /tmp/ages-animations

# 2. Import through AGES and export preview packages (requires an AGES checkout)
python tools/ages-animations/build_packages.py \
  --ages ../gamedev \
  --source /tmp/ages-animations \
  --out tests/fixtures/ages-animations

# 3. Verify in a real browser against the dedicated preview build
npm run test:animations
```

`tests/fixtures/ages-animations/ages-evidence.json` records the AGES export
receipts (package and atlas digests) used by the browser acceptance test.

## Runtime mapping (Reliquary)

`src/game/preview/battle-preview.ts` selects clips from authoritative combat
results:

- hit: `attack_melee` for `strike`, else `attack_elemental`; falls back to
  `attack`/`cast` (keeps the original preview fixtures working).
- miss: `miss` → kind/element attack → `attack`.
- defender on hit: `hit`/`stagger`/`flinch`/`recoil`, delayed until the
  defender's own attack clip finishes.
- defeat: `faint`/`defeat`/`down`, held on the final frame.
- effect: `impact_<element>` → `impact_<kind>` → `impact`.

Gameplay remains authoritative: the preview only reads the resolved `hit`,
`kind`, `element`, and defeat state; it never mutates HP, accuracy, or turns.

## Limitations

- This is procedural pixel art, not Pixelorama/Effekseer output. Real-tool
  qualification for those editors is tracked separately.
- `AGE` native Studio recipes compile to a v2.0.0 candidate; the web preview
  consumes the v1.7.0 package produced by the external-import exporter, so this
  pipeline intentionally uses the import route.
- Assets are preview-only; production promotion is out of scope here.
