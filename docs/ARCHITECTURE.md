# Reliquary architecture

Reliquary is a client-side React/Vite game. The canvas engine is the integration
boundary; deterministic rules and battle/world logic live in small modules that
can be tested without a browser.

```text
src/game/
  GameApp.tsx        React mount, responsive canvas shell, UI composition
  engine.ts          runtime orchestration: tick, input dispatch, mode
                     coordination, canvas lifecycle, presentation scheduling,
                     snapshot emission
  content.ts         data-driven species, skills, items, stat formulas
  maps.ts            Hollowmere map data and tile constants
  save.ts            versioned local save validation, migration, recovery
  rng.ts             production random source, deterministic and seeded sources

  battle/
    actions.ts       battle action and event vocabulary
    state.ts         battle-state factories and active-combatant accessors
    ai.ts            pure enemy skill selection
    resolution.ts    pure attack outcome (damage/heal/status -> events)
    reducer.ts       attack transition entry point (state + skill + RNG)

  world/
    movement.ts      facing geometry, tile math, occupancy
    interactions.ts  interaction-target lookup, warp/sign/chest data tables

  story/
    interactions.ts  NPC dialogue routing (data) and effect tags

  runtime/
    renderer.ts      canvas world/battle rendering and the asset path list

  systems/
    combat.ts        accuracy, turn order, elemental damage primitives, and the
                     shared non-damaging-skill predicate
    items.ts         item target validation
    capture.ts       binding probability and deterministic result
    economy.ts       purchase and sale invariants
    progression.ts   XP, level-up, learnset, evolution rules
    status.ts        status application and turn expiration
    world.ts         map geometry, walkability, warp validation

  content-validation.ts  cross-reference gate for content data
```

Responsibility split:

| Layer | Responsibility |
|---|---|
| `systems/*` | pure deterministic rules (no engine, no DOM) |
| `battle/*` | battle state, enemy AI, and attack resolution |
| `world/*`, `story/*` | map geometry, interactions, and dialogue data |
| `engine.ts` | runtime orchestration only |
| `runtime/renderer.ts` | canvas presentation |
| React overlays (`ui/Overlays.tsx`) | UI rendering/input |
| `content.ts`, `maps.ts` | data only |

The engine intentionally still owns presentation side effects (audio, logs,
animations, and snapshot emission) and maps battle-domain events to them. New
mechanics should be added to a pure system or battle/world module first, then
called by the engine. Content should reference IDs rather than embedding
behavior.

The `src/lib/auth`, `src/lib/db`, `src/lib/app-data`, preview bridge, PWA
middleware, and multiplayer folders are platform/future scaffolding. They are
not used by the current root game route for gameplay state. They remain
isolated because removing them would discard substantial integration work; new
gameplay code must not depend on them.

`npm test` is the public gameplay/core gate. The legacy Grok/App Builder corpus
is available through `npm run test:platform` for a connected platform checkout;
it is not a required public-clone gate because it expects the ignored `.grok`
skill workspace.
