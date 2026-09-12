# Dependency and license inventory

This is a concise inventory of the direct packages declared in `package.json`. It is a compatibility review for Reliquary's proprietary distribution model, not a replacement for generating a complete notices bundle at release time.

## Findings

- No direct production dependency with a GPL, LGPL, AGPL, or other strong copyleft license was found in the installed package metadata during the 2026-08-31 audit.
- Production dependencies are permissive-license packages, primarily MIT, Apache-2.0, and ISC. `@electric-sql/pglite` is Apache-2.0 and `lucide-react` is ISC.
- Development tooling is also primarily MIT/Apache-2.0. `lightningcss` is MPL-2.0; it is build tooling and is not shipped as Reliquary gameplay code.
- Transitive dependencies still need to be rechecked for every release, because lockfile resolution and package licensing can change over time.

## Direct dependency groups

| Group | Examples | Review result |
| --- | --- | --- |
| Runtime/UI | React, React DOM, TanStack Router, Radix UI packages, Zustand, Zod, Lucide | Permissive licenses observed; compatible with proprietary application distribution subject to notices. |
| Runtime/platform | Better Auth, `@electric-sql/pglite`, `pg`, Nitro/Vercel adapters, Vite runtime helpers | No direct GPL/AGPL finding; platform code is isolated from the canvas game at the root route. |
| Build/test | Vite, TypeScript, ESLint, Playwright, Vitest, Tailwind, Recharts | Permissive licenses observed except MPL-2.0 `lightningcss`; retain required notices when redistributing tooling binaries. |

## Release follow-up

Before a commercial release, regenerate a full production and development dependency report from the committed lockfile, inspect any newly introduced package with a custom or copyleft license, and retain the corresponding notices. Do not infer a package license from its name alone.
