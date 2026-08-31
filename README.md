# Reliquary

Reliquary is a medieval-fantasy monster-binding RPG set in Hollowmere. As a
new Pactwarden, bind wild creatures, walk the old roads, and carry the cracked
Crown of Binding's promise forward.

The current prototype includes Elderhall, Binding Grove, Briar Road, Wildwood,
Mirefen, Ashenbarrow, Thornkeep, creature progression/evolution, elemental
battles, binding, party and box storage, items, shops, NPC dialogue, saves, and
keyboard/touch controls.

**Status:** active prototype / gameplay foundation hardening.

Copyright © 2026 Jonathan Gomez. All rights reserved. This is public source
visibility, not an open-source license. GitHub's Terms necessarily provide
limited platform rights for accessing and using GitHub repository features;
outside those limited rights, no general right is granted to copy, modify,
distribute, commercialize, create derivative products from, or otherwise use
Reliquary. See [LICENSE](LICENSE).

## Development

Requires Node.js 24 and npm 11 (see [.nvmrc](.nvmrc)).

```bash
npm ci
npm run dev
```

Open the local Vite URL in a browser. WASD or the on-screen pad walks; Z / A
confirms and speaks; X / B cancels; M opens the menu.

Verification commands:

```bash
npm run typecheck
npm run lint
npm test
npm run validate:content
npm run build
```

`npm run build` compiles only. `npm run deploy` is the explicit deployment
orchestration command when a configured deployment database needs migrations.
No production database is required for local tests or builds.

## Contribution policy

Outside contributions are not currently accepted as a license or permission to
use the game. Please do not open a pull request expecting rights to reuse the
code, art, lore, names, or creatures. Contact the copyright owner for a
separate written agreement.

## Project notes

- [Architecture](docs/ARCHITECTURE.md)
- [Content system](docs/CONTENT_SYSTEM.md)
- [Asset provenance](docs/ASSET_PROVENANCE.md)
- [Security and public-repository notes](docs/SECURITY.md)
- [Brand-risk note](docs/BRAND_RISK.md)
