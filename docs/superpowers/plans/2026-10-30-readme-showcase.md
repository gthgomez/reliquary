# Reliquary README showcase

Approved scope: README-first pilot with genuine AI-operated local gameplay,
screenshots and a labeled gallery of existing shipped creature artwork. No hosted
deployment, game features, paid services, debug progression, or private masters.

1. Create an isolated branch from main; install dependencies and verify the
   existing game baseline. Record setup constraints.
2. Add a reproducible local-only browser capture script. Start a fresh game and
   use real keyboard/button inputs through the opening, starter selection,
   exploration, and a wild battle/binding attempt. Observe position through the
   existing read-only probe; never call debug warp/startWild or seed a save.
3. Capture a concise silent MP4, compact animated preview and four PNGs. Record
   exact source revision, duration, frame count, checksums and capture limitations.
   Inspect frames and screenshots. Keep the video small enough for repository
   media storage and use a preview link in README rather than assuming inline
   video playback.
4. Build a canonical 21-species gallery from content.ts and existing runtime PNGs.
   Label artwork separately from screenshots. Preserve all ownership/provenance
   notices, add quickstart and accurate limitations.
5. Run typecheck, lint, 55 existing tests, content validation, production build,
   media/link checks and a separate final diff review. Commit, normal non-force
   push to the task branch, and open a draft PR. Never merge or publish a release.

Verification centers on the real browser flow, inspected media and repository
checks; this documentation/capture task does not change game behavior.
