# Performance and gameplay QA implementation plan

**Goal:** Exercise current Reliquary, repair reproduced defects, and establish a repeatable 60 FPS regression loop. Base: `64e2a2466b6146bc2d2c8e9934294fa7a52170c1`.

**Architecture:** Keep the canvas engine and deterministic rule modules. Cache static terrain in one disposable canvas for the current map, cull invisible entities, and keep React notifications tied to visible state changes. Retain current content and save v2 compatibility. Implement gameplay additions on separate branches.

**Tech stack:** React 19, TypeScript, native Node tests, Playwright, TanStack Start/Vite.

## Scope and decisions

Owner clarified: implement fixes and additions, keeping gameplay changes on different branches. Begin with performance/QA, then independent gameplay slices. Prefer a terrain cache to an engine rewrite: it removes repeated tile draws without new dependencies; invalidate on asset completion, destroy and map change. Do not reduce resolution, remove art, or change encounter balance to obtain an FPS result.

## Acceptance and evidence

- Record revision, browser, viewport, renderer and host pressure with raw frame intervals. Warm assets before steady-state measurement; report load and transition stalls separately.
- Aim for at least 60 rendered frames/sec on a display/browser capable of it, p95 frame intervals near the 16.67 ms budget and no repeated >50 ms stalls. Record scheduler tolerance explicitly; average FPS alone is insufficient.
- Sample idle world, actual walking, battle and portrait/mobile layout. Probe all map rendering paths. Headless timing is limited evidence; physical mobile hardware and sustained foreground play remain separate requirements.
- All existing required checks: typecheck, lint, tests, content validation, build. Self-review and fresh read-only review for this multi-component candidate, subject to measured resource admission.

## Tasks

- [ ] Establish baseline browser gameplay journey and frame-time capture under `scripts/game-qa.mjs`; raw evidence stays outside Git under `D:/AgentData/evidence/reliquary/20261026`.
- [ ] Reproduce toast expiry, false save success, audio listener accumulation, held-confirm repeat and forced-switch failures in focused Node/browser checks before repairs. Files: `src/game/engine.ts`, `audio.ts`, associated tests.
- [ ] Measure rendering work, cache static terrain, cull off-screen objects/NPCs, and verify visible draw ordering and map/asset invalidation. Files: engine and rendering tests.
- [ ] Run checks sequentially, repeat the same gameplay/performance scenarios, inspect screenshots and report limitations. No fabricated performance pass.
- [ ] Document findings with severity, reproduction, evidence label, status, acceptance criteria and concrete next work. Publish a detailed gameplay roadmap grounded in existing species, combat, maps and progression.
- [ ] Commit the performance candidate. Develop gameplay slices independently on branches, retaining compatibility and tests. Fresh review precedes publication/integration when available; never bypass a missing gate.

## Review focus

Storage unavailable/quota failures; boot-destroy-boot races; keyboard repeat and DOM focus; forced party selection with exactly one survivor; map and asset cache invalidation; tiny viewports and tall sprites; background-tab timing; migration compatibility for future creature data.

## Execution record

- OBSERVED: canonical checkout preserved on its existing hardening branch. Task worktree created from fetched origin/main.
- OBSERVED: lockfiles identical, but existing dependencies contain missing files. Reuse attempt failed before gameplay. Fresh npm install uses a task-local cache because default npm cache produced ENOTDIR. These are environment failures, not game performance findings.
- Ruling: execute serially; available RAM was approximately 3 GiB and then below 3 GiB, so no new subagents or overlapping heavy jobs.
