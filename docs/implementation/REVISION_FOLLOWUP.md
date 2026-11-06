# PR #38 review follow-up — November 6, 2026

The owner requested repair of the review findings, then push and merge after
verification. This follow-up starts at `517cb0359b1a79497e84fa170c263fabecd71ca3`
on `codex/reliquary-s-revision`; the audited base is
`af378c8725a1871fc9728d92719de9ca31d74a6a`. The original candidate comprised
10 commits, 41 changed files and +2640/-169 lines. Its successful CI was
[42128122546](https://github.com/gthgomez/reliquary/actions/runs/42128122546),
not the earlier run cited for a different head.

## Repairs and reproductions

| Finding | Repair and observed regression evidence |
|---|---|
| S06 hidden turn/end recap | Command/win/lose recaps now keep their parent body visible. The recap has an opaque parchment surface and remains bounded to eight events. The new browser suite failed on the hidden parent before repair; it passes all three display phases at 390x844, 320x568, 844x390 and 568x320 with actions fully exposed. A real resolved turn supplies the event contents; display-phase fixtures do not claim to award victory/loss outcomes. |
| S10 clipped landscape choices | The landscape height override now follows the base dock rule. One landscape command row retains 44px targets and leaves room for the status area and recap. The strengthened reach test failed before repair and passes at 844x390, 667x375 and 568x320. It intersects viewport and clipping ancestors, scrolls only the submenu body, and checks complete target visibility and center hits. Commands, Back and switch choices actuate; item-row activation is outside this suite's claim. |
| S20 vacuous stale-precache invariant | The guard accepts Workbox's actual relative asset URLs as well as root-relative URLs and rejects a manifest with no client chunks. Relative-URL, empty-manifest and actual Workbox stale-build cases failed before repair. All nine PWA tests pass, including stale-output rejection and clean-output acceptance. |
| S22 ineffective enlarged-text evidence | The shared helper applies `textScale: 2` on each document/reload; every old unsupported `fontSize` caller was replaced. The modal suite first proves actual 32px root and menu text, then checks complete row/focus visibility at 390x844, 320x568 and 640x320. The old 16px behavior fails that assertion. |
| Real 200% overlay failure exposed by the corrected test | A variable objective description left a 6px body for 88px menu rows. Descriptions now scroll with the choices, compact fixed chrome leaves usable space, and focus reveals the whole control. Initial focus, every row, forward Tab and reverse focus wrapping pass the stronger checks. |
| Shift+Tab cancels a menu | The reverse-focus test reproduced the legacy Shift cancel shortcut closing the dialog. Shift remains a native modifier while focus is in a dialog; the legacy shortcut elsewhere and Escape/other cancel routes remain. The regression verifies the dialog stays open and the wrapped Close button is fully exposed. |
| Evidence and handoff gaps | Coverage dispositions distinguish bounded automation from human/device validation. The new manual packet contains install/offline/update, TalkBack and five-novice procedures, anonymous result forms and two production-valid save fixtures. Historical test totals, CI identity and hosted-preview statements are corrected. |

## Verification

Environment: Windows, Node v24.22.0, npm 11.19.0, Playwright 1.62.1 and its
bundled desktop Chromium. Local heavy jobs run serially under a bounded Node
heap because host memory is constrained. The platform run uses the same file
inventory/exclusion and browser-test environment as `test:platform`, with
`--test-concurrency=1` to bound workers.

The current head/checks in
[PR #38](https://github.com/gthgomez/reliquary/pull/38) bind subsequent CI and
review; historical CI is not proof for a later SHA.

| Check | Result |
|---|---|
| Typecheck, lint, content | Typecheck passed; lint 0 errors / 22 existing warnings; content valid |
| Complete platform inventory, one worker | 462 total / 456 passed / 0 failed / 6 skipped |
| Full browser suite | All 16 suites plus renderer integration passed |
| Production → browser-test → production, production runtime and PWA gates | Passed: production `index-CFPRmpaN.js` restored byte-identically after test `index-DNxBneUZ.js`; test chunk absent; invariant inspected one real relative-URL client chunk; runtime and PWA gates passed |
| Manual fixtures and coverage inventory | Both save files accepted by production parser/serializer; 32 distinct S-IDs, optional mappings retained |

Local evidence is retained outside the product checkout at
`D:\AgentData\evidence\reliquary\pr38-fixes-20261106`. It includes the failing
pre-fix logs, focused passing runs, full-run logs, screenshots, clipping/recap
reports and fixture validation. The earlier review evidence remains at
`D:\AgentData\evidence\reliquary\pr38-review-20261106`. Existing untracked
`ci-artifacts/` is preserved and excluded from this change.

## Remaining validation and owner inputs

Physical Android PWA testing, TalkBack play and the five-novice study have not
been performed. No device or recruited/consenting participants were supplied.
An `adb devices` probe listed no devices; it also automatically restarted an
older ADB daemon because the installed client's server version differed.
That tool side effect was disclosed; no device validation is inferred from it.

Use [REVISION_MANUAL_VALIDATION.md](REVISION_MANUAL_VALIDATION.md) and its
disposable fixtures for those checks. Full nonvisual world traversal remains
a product-scope decision. Source-asset/branding clearance remains unresolved
in [ASSET_PROVENANCE.md](../ASSET_PROVENANCE.md). A Ready Vercel preview was
observed; tester access, production readiness and rights clearance do not
follow from that status. This work does not claim a physical-device result,
human comprehension outcome or release approval.
