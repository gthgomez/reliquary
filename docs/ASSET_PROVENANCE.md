# Asset provenance manifest

This is a working provenance manifest, not a legal clearance. No attribution or
source-license file was present in the initial repository, and the repository
has one initial commit. Unresolved entries are retained and flagged rather than
deleted.

| Path/category | Likely source | Transformation | Status/confidence | Action |
|---|---|---|---|---|
| `assets/sprites/**/raw-sheet*.png` | Original-looking source sheets; AI/Grok involvement cannot be established | Source inputs for sprite processing scripts | Unclear / low | Record generator/source and retain proof of rights |
| `assets/sprites/**/pipeline-meta.json` | Local processing record | Describes crop, component selection, sizing, and frame extraction | Observed / high for transformation, low for source | Keep with corresponding assets |
| `assets/sprites/**/sheet-transparent.png`, `single-1.png`, `animation.gif` | Derived from the raw sheets | `process-game-assets.py`, `fast-process-assets.py`, and recook scripts | Derived / high | Keep pipeline inputs and outputs paired |
| `assets/tiles/**` | Original-looking tile source/processed pairs | Raw tile sources and 64px/2x2 processed outputs | Unclear / low | Verify author or generation source before commercial release |
| `public/game/bg`, `props`, `sprites`, `tiles` | Production copies/derivatives of game art | Browser-ready asset processing/export | Derived / medium | Confirm each source mapping and avoid shipping unused raw sheets |
| `public/og.jpg`, `public/x-banner.jpg`, `public/favicon.svg` | Repository branding assets | Static web deployment assets | Unclear / low | Confirm ownership or replace with cleared assets |

The metadata's `prompt` and `role` fields are empty in the initial commit, so it
does not establish whether an asset is human-authored, AI-generated, generated
by Grok, or derived from a supplied third-party source. This uncertainty is a
pre-commercialization clearance item, not a reason to remove valuable game art.
