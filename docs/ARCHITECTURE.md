# Reliquary architecture

Reliquary remains a client-side React/Vite game. The existing canvas engine is
the integration boundary, while deterministic rules now live in small modules
that can be tested without a browser.

```text
src/game/
  GameApp.tsx       React mount, responsive canvas shell, UI composition
  engine.ts         runtime orchestration, rendering, input, state transitions
  content.ts        data-driven species, skills, items, stat formulas
  maps.ts           Hollowmere map data and tile constants
  portraits.ts      npc-id/sprite → dialogue portrait key mapping (issue #24)
  save.ts           versioned local save validation, migration, recovery
  rng.ts            production random source and deterministic test source
  systems/
    combat.ts       accuracy, turn order, elemental damage primitives
    capture.ts      binding probability and deterministic result
    economy.ts      purchase and sale invariants
    progression.ts  XP, level-up, learnset, evolution rules
    status.ts       status application and turn expiration
    world.ts        map geometry, walkability, warp validation
  content-validation.ts  cross-reference gate for content data
```

The engine intentionally still owns presentation side effects (audio, logs,
animations, and snapshot emission). New mechanics should be added to a pure
system first, then called by the engine. Content should reference IDs rather
than embedding behavior.

The NPC dialogue focus scene (issue #24) follows that split: the engine
threads a stable placed-NPC id and a resolved portrait key through
`DialogView`; `portraits.ts` holds the pure data-driven npc-id → portrait map
(with a sprite-kind fallback and `null` for narrator/sign/object/system
dialogue); `src/game/ui/NpcPortrait.tsx` owns the original inline SVG artwork
and `src/game/ui/NpcDialogScene.tsx` the layered HTML/CSS scene rendered over
the canvas. Portrait identity is never derived from speaker name strings or
dialogue text.

The `src/lib/auth`, `src/lib/db`, `src/lib/app-data`, preview bridge, PWA
middleware, and multiplayer folders are platform/future scaffolding. They are
not used by the current root game route for gameplay state. They remain
isolated because removing them would discard substantial integration work; new
gameplay code must not depend on them.

`npm test` is the public gameplay/core gate. The legacy Grok/App Builder corpus
is available through `npm run test:platform` for a connected platform checkout;
it is not a required public-clone gate because it expects the ignored `.grok`
skill workspace.
