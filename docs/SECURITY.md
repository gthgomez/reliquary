# Public-repository security notes

## Current audit

- Current tree and the complete available Git history were scanned for common
  credential filenames and high-confidence key formats. No active credential
  was found. This is an OBSERVED scan, not a guarantee against every secret
  format.
- `.env*`, key files, logs, build output, and `.grok/` are ignored. No tracked
  environment or key file exists in the initial history.
- `npm run build` does not connect to or mutate a database. Database migration
  is explicit in `npm run deploy` / `npm run db:migrate`.
- The preview bridge validates the message source, exact allowlisted origin,
  schema, version, and same-origin path before navigation.

## Platform scaffolding boundary

Better Auth, PGLite/Neon adapters, connector code, Grok preview/PWA middleware,
and P2P multiplayer are retained as isolated future/platform support. The root
route currently mounts only the passthrough auth provider, preview bridge, and
game. Multiplayer is not wired into game state or the UI.

The server middleware accepts forwarded host/proto values because the Grok
preview platform supplies dynamic origins. The deployment/proxy contract must
sanitize those headers before they reach the app; this remains a concrete
operational risk to verify before exposing auth or preview features on a new
host. Do not enable those features for a new deployment without an allowlist
test.

## Reporting

Treat any newly discovered credential as compromised: remove it from the tree,
rotate it at the provider, and review the full history before any public push.
