# A first road through Hollowmere

[![Excerpt of real Reliquary gameplay](preview.gif)](gameplay.mp4)

**[Watch the 53.8-second gameplay video](gameplay.mp4)** ·
[Creature-art gallery](CREATURES.md) · [Back to the project](../../README.md)

This is a silent recording of the actual production build in local Chromium,
operated by AI through real keyboard inputs and visible UI buttons. It starts
with an isolated browser context and a new game. No saves, creatures, random
values or progression flags were injected. The existing controls probe was used
only to observe position/mode and movement; debug warp/startWild were never used.

| In this take | Approximate time |
| --- | --- |
| Title, new game and Rowan's Cottage | 0–10 s |
| Elderhall and Binding Grove | 10–18 s |
| Emberkit's first pact, earned through starter dialogue | 18–24 s |
| Walk to Briar Road and encounter a wild Gravepup | 24–34 s |
| Strike and Common Sigil binding attempt | 34–43 s |
| Binding fails; escape through normal controls and view Party | 43–54 s |

Binding is probabilistic. This recording **does not show a successful wild
capture**. The starter pact succeeds, while Gravepup breaks the sigil. The final
party contains Emberkit. The gallery documents the current content registry,
not creatures unlocked during this short session.

## Recording evidence

- Game revision: [`64e2a2466b6146bc2d2c8e9934294fa7a52170c1`](https://github.com/gthgomez/reliquary/commit/64e2a2466b6146bc2d2c8e9934294fa7a52170c1).
- Browser: Chromium 154.0.8037.57; viewport 1280 × 800.
- Video: H.264 MP4, 538 frames at 10 fps, 53.8 seconds, 1,597,076 bytes; no audio.
- No runtime page errors or game-asset HTTP errors were observed in the successful take.
- [capture.json](capture.json) records scene timestamps and SHA-256 hashes of
  the original screenshots/video. [media.json](media.json) also covers the GIF.
- The 640 × 400 GIF is an excerpt from seconds 33.5–42.5 of this same video,
  sampled at 5 fps. It is not an asset animation or generated gameplay.

The original 1280 × 800 screenshots are [exploration](exploration.png),
[starter selection](starters.png), [battle](battle.png), and [party](party.png).
They were taken during the same run, without replacing or retouching game art.

## Reproduce locally

Requires Node.js 24, npm 11, Python 3.12+, Python Playwright, an installed Chromium
browser and FFmpeg/FFprobe with the `libx264` encoder. The repository's Node
Playwright dependency does not supply the Python module. On a machine that does
not already have Python Playwright, install it in your own virtual environment
with `python -m pip install playwright`. No API keys or paid services are needed.

```bash
npm ci --legacy-peer-deps
npm run build
npm run preview
```

The current committed lockfile triggers npm 11 optional-peer validation under
plain `npm ci`; the capture used `--legacy-peer-deps` without modifying the
lockfile. Build compiles only and does not run production migrations. **Do not
use `npm run deploy` to reproduce the video**; that command includes migrations.

In another terminal, from the repository root:

```bash
python scripts/showcase/capture.py --chromium /usr/bin/chromium
node --experimental-strip-types scripts/showcase/gallery.mjs
```

The capture defaults to `http://127.0.0.1:8081/` and writes only inside this
repository's `docs/showcase/`. Pass `--chromium` with your browser path. The script
accepts credential-free loopback URLs only, uses a fresh browser context, and
exits unsuccessfully with a diagnostic PNG/manifest if the real flow cannot
complete. It observes the existing read-only controls probe to plan legal walks;
all progression comes from ordinary inputs. Random encounters, stats and binding
outcomes remain unmodified, so a rerun is **not byte-for-byte deterministic**.
A run that fails its browser or asset checks must not be presented as complete.

To regenerate the preview for this take:

```bash
ffmpeg -y -ss 33.5 -t 9 -i docs/showcase/gameplay.mp4 \
  -vf 'fps=5,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3' \
  -loop 0 docs/showcase/preview.gif
python scripts/showcase/verify.py
```

For a new take, select the GIF's start time from its own `wild-encounter` event
and update the scene/outcome notes above. The verifier rewrites `media.json` only
after validating the captured media and gallery.

## Presentation and rights

This is a README showcase, not a hosted playable deployment. The full MP4 lives
in the repository because it is small; its link opens GitHub's file page, where
the original can be downloaded if playback is unavailable. The compact GIF is
the in-README preview. No release or hosting service was published.

Copyright © 2026 Jonathan Gomez Aguilar. All rights reserved. The existing
[proprietary license](../../LICENSE) remains in force. Creature cards reference
only the existing browser-ready PNGs under `public/game/sprites/`. Artwork
source/authorship records remain unresolved as described in
[asset provenance](../ASSET_PROVENANCE.md); this showcase does not assert
clearance or include removed private raw masters.
