# Reliquary — evidence-led revision plan

**Assignment:** implement and verify the full actionable revision described in the
November 5, 2026 synthesis of 16 specialist audits (`00-synthesis.md`, Space file
`libfile_e9b8209260948191beb0f4587f463b45`), against `gthgomez/reliquary`.

**Baseline A (audited):** `af378c8725a1871fc9728d92719de9ca31d74a6a` on `main`.
**Current main at revision start:** the same SHA — verified by `git fetch` +
`git ls-remote origin main` on 2026-11-05. There is **no source drift** to
reconcile: every synthesis finding is assessed against the identical tree the
auditors reviewed. Newer-work preservation checks are therefore structural
(against the audit report) rather than a diff between baselines.

**Worktree:** `D:\AgentData\worktrees\reliquary\reliquary-s-revision`,
branch `codex/reliquary-s-revision`, created with
`tools/agent-storage/agent-worktree.ps1` per the workspace contract. The
canonical checkout `D:\Workspace\Games\Web\reliquary` stays untouched on `main`.

## Goal

Chapter One: safe to invest a session in, understandable and observable without
developer coaching — while preserving the existing playable slice, identity,
save guarantees, and content scope. Smallest coherent repairs for reproduced
problems; no scope expansion (no slots, species, regions, multiplayer, engine
migration, tutorial framework, art/audio replacement).

## Stages

1. **Five primary repairs** — S01 import authorization, S02 New Game consent,
   S03 failed-flush reload veto, S04 explicit Sell, S08 Phoenix Ash field-only.
   Retained as one reviewable unit with targeted regression tests.
2. **Verification/build pipeline** — S05/O1 CI journey artifact retention,
   S20/O2 stale test-bundle precache cleanup, S22 fixture selector repair.
3. **Semantic/interaction/continuity repairs** — S07, S09, S12, S13, S14, S16,
   S17, S23, S29, S30, S31, S32 (each re-checked against current source, then
   the smallest coherent fix plus regression coverage).
4. **Investigation + evidence-supported repairs** — S06, S10, S11, S15, S18,
   S19, S21, S24, S25, S26, S27, S28, plus supplemental leads (hidden file
   input, directional-control keyboard activation, adjacent D-pad targets,
   portrait dialogue reserve, asset provenance, exact-build access).
5. **Integrated validation** — full repository gates, browser/input matrix,
   save/lifecycle fault matrix, PWA update behavior, coverage matrix close-out,
   independent review, branch push and draft PR.

## Baseline checks (actual commands and results)

Recorded in `REVISION_EVIDENCE.md` as they run on the revision branch.
Synthesis-recorded historical results (282 core passes; 440+1+6 platform locally
with a browser-launch blocker; CI 441/6/0 on Ubuntu) are treated as historical
facts, not as results of this run.

## Boundaries honored

- The original assignment authorized branch push + draft PR only. The owner's
  November 6 follow-up authorizes fixes, push and merge of PR #38 after candidate
  verification and independent review pass. No manual production deployment,
  database mutation, credential creation or asset-rights clearance is included.
- Real-player saves never touched; disposable fixtures only; a failing safety
  test is never "fixed" by clearing storage.
- Preserved: save validation/migration/quarantine/rotation, no-effect item
  guards, last-capable-party protection, held-key protections, production
  test-mutator isolation, linked maps, battle genre, starter choices, dialogue
  identity, responsive scene.
- Human/device validation (Galaxy S25 Ultra, novice study) requires access this
  environment does not have; those items are delivered as blocked with a
  ready-to-run packet, never simulated.

## Living documents

- `REVISION_COVERAGE.md` — one row per S01–S32 (O1=S05, O2=S20, O3=S06 mapped,
  not double-counted) plus supplemental checks; final dispositions only from
  evidence.
- `REVISION_EVIDENCE.md` — actual commands, results, screenshots, manifests.
- `REVISION_FOLLOWUP.md` — November 6 review repairs and their verification.
- `REVISION_MANUAL_VALIDATION.md` — physical-device/TalkBack checks, novice study
  protocol, fixtures, exact-build identity and result forms; execution remains open.
