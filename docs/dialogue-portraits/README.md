# Dialogue portrait evidence (issue #24, run C)

Real in-game captures of the NPC dialogue focus scene on branch
`experiment/dialogue-portraits-model-c`, frozen baseline `abc4355`. Every shot
is the production web build (`npm run build:web`) served locally and driven
through real keyboard input (Z confirms/advances, Escape declines). Player
positioning used the engine's own `__controlsTest` warp probe, which is present
in production builds; all dialogue was then triggered and advanced through the
game's normal interact/confirm path.

| File | Viewport | Scene shown |
|---|---|---|
| `desktop-1440x900-narrator-intro.png` | 1440×900 desktop | Opening narration — text-only bar, unchanged |
| `desktop-1440x900-maren.png` | 1440×900 desktop | Elder Maren — authored portrait artwork, page 1 |
| `desktop-1440x900-cael.png` | 1440×900 desktop | Warden Cael — authored portrait artwork |
| `desktop-1440x900-gateward.png` | 1440×900 desktop | Gateward — hooded-sigil fallback portrait |
| `desktop-1440x900-patch.png` | 1440×900 desktop | Patch the goblin trader — goblin sigil (npc-id keyed, not sprite-keyed) |
| `desktop-1440x900-sign-text-only.png` | 1440×900 desktop | Road sign — text-only narrator/object rendering, unchanged |
| `phone-390x844-maren.png` | 390×844 portrait phone | Elder Maren with touch chrome (A/B row) |
| `phone-390x844-cael.png` | 390×844 portrait phone | Warden Cael with touch chrome |
| `phone-390x844-gateward.png` | 390×844 portrait phone | Gateward sigil fallback with touch chrome |
| `landscape-844x390-maren.png` | 844×390 landscape phone | Elder Maren, row layout |
| `landscape-844x390-gateward.png` | 844×390 landscape phone | Gateward sigil fallback, row layout |

Reproduce:

```bash
npm ci --legacy-peer-deps
npm run build:web
node scripts/capture-dialogue.mjs
```

`scripts/capture-dialogue.mjs` writes fresh PNGs into this directory. The same
flows are guarded by the browser regression suite `tests/browser/npc-dialogue.mjs`
(`npm run test:browser -- --suite dialogue`, also part of `--suite=all`).

Capture-time chrome note: the grey "Offline cache incomplete" line is the
game's real PWA status indicator (`AppStatus`). The local static server blocks
service workers, so the status honestly reports an incomplete cache. It is not
part of the dialogue scene and is unchanged from baseline.
