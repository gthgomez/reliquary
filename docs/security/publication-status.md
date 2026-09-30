# Publication status

Point-in-time publication and removal status for this public repository.
Recorded 2026-09-29 against commit `577a101aeb02554017a113cbd83b9d086b6b09b3`
(`origin/main`). This is a status record, not a legal clearance, and it does not
change the proprietary license terms in [LICENSE](../../LICENSE).

## Public runtime build vs. private art masters

Verified on 2026-09-29 at the commit above, from a clean checkout:

- `npm ci` — succeeded (418 packages, Node v24.12.0 / npm 11.19.0).
- `npm run build` — succeeded.
- No file under `src/`, `server/`, or `migrations/` references the `assets/`
  directory; the Vite build uses the default `publicDir` (`public/`). The
  engine's 78 preload paths (`collectPaths()`, `src/game/engine.ts`) all resolve
  inside `public/game/`, and all of them exist in the committed tree.
- Generator scripts (`scripts/process-game-assets.py`,
  `scripts/fast-process-assets.py`, `scripts/recook-sprites.py`) require the
  external, non-committed `artifacts/imagine_images` masters only when
  re-generating art; the ordinary run/build/test path does not.

Conclusion: the public runtime build does not require private art masters.
Regenerating art from source does, and those masters' rights remain unresolved.

## Removal record: partial, not complete

Raw art masters were removed from the working tree and purged from the
reachable branch/tag history (see
[ASSET_PROVENANCE.md](../ASSET_PROVENANCE.md)). This **does not** prove total
removal:

- On 2026-09-29, `git ls-remote origin refs/pull/1/head` still resolves to
  `e3c7222a046efef2dcc17eeb3c8d44041c9797b2` (the pre-purge PR #1 head). The
  blobs remain reachable through that hidden ref until GitHub clears it.
  Objects were *not* fetched or redistributed during this verification.
- Purging `main` or deleting files on the default branch never removes blobs
  while any ref — including hidden refs — points at them.

**Owner-only action, explicitly pending:** clearing `refs/pull/1/head` requires
a GitHub Support request (GitHub rejects writes to hidden refs). No history
rewrite, force-push, or support request has been performed by contributors;
this remains an owner decision and owner action.

## Rights status

- The repository is proprietary (public source visibility is not an
  open-source license).
- Shipped game art is derived from source masters whose authorship/generator
  (human, AI, or third-party) could not be established from the repository.
  **Unknown rights are not cleared.** Per-category status lives in
  [ASSET_PROVENANCE.md](../ASSET_PROVENANCE.md).
- No infringement is asserted against anyone; this record simply documents
  that clearance evidence is absent.

## Owner decisions required

1. File the GitHub Support request to clear `refs/pull/1/head` (removes public
   fetchability of the purged blobs), or explicitly accept the residual
   exposure.
2. Decide, per unclear-asset category in the provenance manifest: replace with
   cleared art, relicense/obtain rights for existing art, or retain with
   recorded proof of rights. Required before any commercial release.
3. Confirm the Imagine source masters are actually retained in private storage
   with appropriate rights documentation (the repository cannot verify this).
4. Dispose of the unused `public/game/sprites/player.png` (remove or document).
