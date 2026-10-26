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

- [x] Establish baseline browser gameplay journey and frame-time capture under `scripts/game-qa.mjs`; raw evidence stays outside Git under `D:/AgentData/evidence/reliquary/20261026`.
- [x] Reproduce toast expiry, false save success, audio listener accumulation and forced-switch failures in focused Node checks before repairs; held-confirm repeat was found by independent review. Files: `src/game/engine.ts`, `audio.ts`, associated tests.
- [x] Measure rendering work, cache static terrain, cull off-screen objects/NPCs, and verify map cache invalidation with a focused test. Visible draw ordering still needs broader visual coverage.
- [ ] Run checks sequentially, repeat the same gameplay/performance scenarios, inspect screenshots and report limitations. No fabricated performance pass.
- [x] Document findings with severity, reproduction, evidence label, status, acceptance criteria and concrete next work. Write a detailed gameplay roadmap grounded in existing species, combat, maps and progression.
- [ ] Commit the performance candidate. Develop gameplay slices independently on branches, retaining compatibility and tests. Fresh review precedes publication/integration when available; never bypass a missing gate.

## Review focus

Storage unavailable/quota failures; boot-destroy-boot races; keyboard repeat and DOM focus; forced party selection with exactly one survivor; map and asset cache invalidation; tiny viewports and tall sprites; background-tab timing; migration compatibility for future creature data.

## Execution record

- OBSERVED: canonical checkout preserved on its existing hardening branch. Task worktree created from fetched origin/main.
- OBSERVED: lockfiles identical, but existing dependencies contain missing files. Reuse attempt failed before gameplay. Fresh npm install uses a task-local cache because default npm cache produced ENOTDIR. These are environment failures, not game performance findings.
- Ruling: execute serially; available RAM was approximately 3 GiB and then below 3 GiB, so no new subagents or overlapping heavy jobs.
- Independent read-only review of `d1ed6b4` found hidden-tab music scheduling and focused-button repeat issues. Fixed and focused tests passed on `5158b3c`; a fresh review of material changes is still required.
- The first foundation browser comparison had approximately 59.61–60.01 FPS across six five-second scenes and 5–9 world image draws versus 215–314 at baseline. These are headless dev-server measurements, not a 60 FPS guarantee or a measured FPS improvement.
- Gameplay slices are stacked in `codex/gameplay-progression-20261026`, `codex/gameplay-party-20261026`, `codex/gameplay-storage-20261026`, `codex/gameplay-nicknames-20261026`, and `codex/gameplay-raising-20261026`. Compare each with its immediate parent.
- After implementation, the host dropped below 1 GiB available memory with 91% committed; defer browser, build and new review admission until capacity recovers. Other processes are user-owned and must not be terminated. The expanded journey script was authored but is not yet executed.
- After measured recovery, serialized checks passed: 73 core tests, content validation, lint, typecheck and the production build. The expanded release-build browser journey passed at desktop and portrait sizes; both six-second walking samples recorded 60.01 FPS and no >50 ms intervals. It uses a seeded save and diagnostic map transitions; complete natural progression and a fresh independent final review remain open.
- A further release-preview journey used direction input without warp or battle injection to select Emberkit, enter Briar Road, trigger a wild encounter and attempt binding. Natural victory/capture, the Warden trial and a full story playthrough remain open.
- The first natural binding attempt exposed an overwritten failure message. A focused red/green regression and a controlled-random release-preview journey verified the fix; 74 serialized core tests and a rebuilt production candidate passed.
- A no-effect item regression led to guards that preserve inventory and battle turns; the Pack now shares the engine's usable-item ordering while displaying binding stones separately. The rebuilt natural journey checked tonic and salve counts, and 75 serialized core tests passed.
