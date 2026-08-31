# Initial repository audit

## Classification

Target: `gthgomez/reliquary` at the single-repository clone root.

- Git boundary: repository root; origin is `https://github.com/gthgomez/reliquary.git`.
- Default branch: `main`.
- Starting HEAD: `747c59807b454e95ff5bb2adee8a4dab57469509`.
- Starting history: one initial commit; no open pull requests or workflows were
  present in the checkout.
- Stack: React 19, TanStack Start/Router, Vite/Nitro, TypeScript, native Node
  tests, Zod, PGLite/Neon/Better Auth scaffolding.

## Role classification

| Class | Observed contents |
|---|---|
| `CORE_GAME` | `src/game`, `src/routes/index.tsx`, `public/game`, game UI/styles |
| `GAME_SUPPORTING` | content/maps/assets, audio, save, content tests/validation |
| `DEPLOYMENT` | `vite.config.ts`, `server/`, `startup.sh`, migrations, Nitro/Vercel config |
| `GENERATED_PLATFORM_SCAFFOLDING` | Grok PWA/preview/auth/app-data integration, `.grok` references |
| `DEVELOPMENT_TOOLING` | asset processing, preview, environment wrapper, brand checks |
| `TEST_TOOLING` | Node script tests, preview/auth checks, new game tests |
| `POSSIBLY_UNUSED` | multiplayer and app-data modules are not reachable from the root game route |

## Findings and decisions

1. `npm run build` unexpectedly ran `db:migrate`; fixed by making build compile
   only and adding explicit `npm run deploy` orchestration.
2. `ReliquaryGame.destroy()` previously only cleared its canvas; fixed with
   listener, RAF, probe, transient-state, and remount cleanup. The React shell
   no longer uses a module-global instance.
3. Saves previously accepted any object and trusted nested data; fixed with
   Zod v1/v2 schemas, semantic registry/geometry validation, migration, and
   backup recovery.
4. The previous test command used a shell glob that discovered zero script tests
   on Windows; fixed with a cross-platform Node test-file runner. Public default
   tests now center actual game mechanics; platform tests remain opt-in.
5. The tracked zero-byte `.node_modules.lock` had no consumer and was removed.
6. License and README now distinguish GitHub's limited platform rights from the
   absence of a general license. The repo remains proprietary, `private: true`,
   and `UNLICENSED` in `package.json`.
7. The opt-in `npm run test:platform` corpus was probed: 222 passed and 17
   failed in the public clone. The failures are legacy App Builder/Grok tests
   that require the absent ignored `.grok` workspace or platform-specific
   assumptions; they do not fail the public gameplay/core gate.

## Remaining concrete follow-ups

- Establish source/creator records for art before commercial distribution.
- Test forwarded-header sanitization on the exact production proxy.
- Decide whether to archive or remove unused platform scaffolding after a
  separate product decision; it was not deleted during this hardening pass.
