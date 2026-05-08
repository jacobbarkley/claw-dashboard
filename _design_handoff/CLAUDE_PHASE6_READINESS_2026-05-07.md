# Phase 6 Readiness Check — Stage 2 mocks vs Codex Audit 0.5 patches

**Date:** 2026-05-07
**From:** Claude (post-Audit-0.5-response patch)
**For:** Codex + Jacob (build-kickoff input)

## Verdict

**Ready for Phase 6 wiring, route by route.** Backend slice + 7-lane fixture + composed match-proposal view are in. Stage 2 mocks aligned to Codex canonical. Type-check clean.

Recommend Phase 6 start order: S4 disclosure → S3 match → S1+S2 questionnaire → S5–S8 broker → S9 ACTIVE → S10 monitoring → S11 events. Smallest surfaces first to validate the read-projection swap pattern; S11 last because it depends on the broadest fixture coverage.

## Codex backend Audit 0.5 patches — verified

| Patch | Status |
|---|---|
| `guided_match_proposal_view.v1` model + store + runtime | ✓ on disk at `models/guided.py:546`, store path + read/write helpers at `services/guided.py:138/174/180`, runtime build at `services/guided.py:371` |
| `create_match_proposal` writes the composed view | ✓ `services/guided.py:341` |
| `accept_match` refreshes the view | ✓ `services/guided.py:368` |
| Phase 5 fixture seeds 7 event lanes | ✓ canonical asserted in `test_guided_runtime.py:78–102` |

Codex's audit note adopted: `support_intervention` row is fixture-only for visual coverage; runtime keeps it as a break-glass command per Round 7 build-phase guardrail #5.

## Claude-side Audit 0.5 patches — landed

| ID | Patch | Status |
|---|---|---|
| M1 | `library_entry_id` `"steady_tide"` → `"steady_tide_internal"` (6 references) | ✓ `mocks.ts` |
| M2 | `coverage_tags` aligned to canonical `[conservative_drawdown, balanced_risk, us_equities, multi_week_horizon, tactical_partial, paper_internal]` | ✓ `mocks.ts:135` |
| M3 | `library_entry.drawdown_headline` → sentence form `"Bench max drawdown was 8.9% over the evaluated window."` | ✓ `mocks.ts:130` |
| M4 | `disclosure.technical_details_payload` flattening fields replaced with `strategy_parameters: {stop_loss_pct, target_pct, max_hold_days}` | ✓ `mocks.ts:213–220` |
| M5 | Questionnaire `option_id`s aligned to canonical (`hold_wait` / `uncomfortable_stay` / `cut_losses` / `multi_week` / `paper_lump_sum` etc.) | ✓ `mocks.ts:236–296` |
| M6 | Questionnaire breadth aligned to canonical (3 drawdown options, 2 asset-class options, 2 horizons). Recommended path adopted: align mock to canonical, no separate design-only fixture. | ✓ `mocks.ts:236–296` |

Companion patches landed alongside M1–M6:
- `MOCK_MATCH_PROPOSAL.questionnaire_answers_snapshot` updated to canonical option_ids/matcher_values
- `MOCK_MATCH_PROPOSAL.questionnaire_version` updated `"guided_questionnaire.v1"` → `"guided_onboarding.v1"`
- SELECTED candidate's `matched_tags` updated to reflect new coverage_tags ∩ answer_tags intersection

## New TS mirror + mock from Codex's S3 composition fix

- `GuidedMatchProposalView` interface added to `components/vires/guided/types.ts`
- `MOCK_MATCH_PROPOSAL_VIEW` fixture added to `components/vires/guided/mocks.ts:365`
- `MatchProposalSurfaceFromView` wrapper added to `components/vires/guided/match-proposal-surface.tsx` — Phase 6 swap path is now: page route fetches one composed read at `/api/guided/match-proposal-view/<proposal_id>`, hands it to `MatchProposalSurfaceFromView`, internal component is unchanged

## One new drift surfaced + fixed (M7)

Codex's canonical fixture asserts broker_confirmation events carry `kind=HOLDINGS_CHANGE`, not `kind=BROKER_CONFIRMATION`. My mock had `kind=BROKER_CONFIRMATION`. Aligned to `HOLDINGS_CHANGE` so Phase 6 swap is content-stable.

Side effect: the `event-history-surface.tsx` `actionVerb` branch for `kind === "BROKER_CONFIRMATION"` is now dead code under canonical data. Not removing it — `BROKER_CONFIRMATION` remains valid in the kind enum and may be used for non-holdings broker events later (status changes, cancellations). Audit 1 is the right place to revisit whether broker fills should render distinctly from strategy_execution fills (currently both render as "5 AAPL bought" with actor/reason differentiating).

## Stage 2 preview checks

- `npx tsc --noEmit -p .` — clean (exit 0)
- `npx next build` — clean. All 8 Guided preview routes prerendered as static:
  `/vires/guided/preview`, `.../active`, `.../broker`, `.../disclosure`,
  `.../events`, `.../match`, `.../monitoring`, `.../questionnaire`.
  Zero errors, zero warnings.
- Visual smoke against the rendered routes is the one check Claude can't
  perform headlessly — Jacob to spot-check `/vires/guided/preview/*` once
  before Phase 6 begins.

## Phase 6 wiring — recommended order

Smallest surface first; expand coverage as the swap pattern hardens.

1. **S4 disclosure** — single read of `DisclosureVersion`. Smallest contract surface. Validates the API route → projection → render path with minimum risk.
2. **S3 match preview** — uses Codex's new composed view. Single fetch from `/api/guided/match-proposal-view/<proposal_id>`. `MatchProposalSurfaceFromView` wrapper means the visual component doesn't change.
3. **S1+S2 questionnaire** — single read of `Questionnaire`. The post-questionnaire submit path (which generates a new `GuidedMatchProposal`) is a write command, not a read swap, and routes through Phase 3 (command layer) — out of scope for the read-projection swap.
4. **S5–S8 broker flow** — reads `GuidedEnrollment` (or `EnrollmentEventsView` for the broker-failure timeline). Four UI states (CHECKING / VERIFIED / RETRYABLE / ACTION_REQUIRED / INELIGIBLE) all derived from one snapshot.
5. **S9 ACTIVE enrollment** — single read of `GuidedEnrollmentView`. Already pattern-matched to the composed view shape.
6. **S10 monitoring** — same `GuidedEnrollmentView`, different sub-fields. Same fetch as S9.
7. **S11 event history** — single read of `EnrollmentEventsView`. Last because it depends on the broadest fixture coverage; with 7 lanes seeded, this is now safe.

## Open items not blocking Phase 6

- **CR1-equivalent automated tests on the dashboard side** — Codex's runtime tests assert lane coverage. The dashboard has no equivalent assertion that all 7 lanes render distinctly in S11. Worth adding before Audit 1, not blocking the swap.
- **`humanizeTag` map for new canonical tags** — `balanced_risk`, `paper_internal`, `tactical_partial` fall through to the underscore-replacement default. Cosmetic; cleanup at Audit 1.
- **Broker-fill vs strategy-execution rendering** — both currently render as "5 AAPL bought" with actor differentiating. Could be source-aware ("Broker filled 5 AAPL @ $321.37" vs "Strategy bought 5 AAPL"). Audit 1 decision.

## Stop status

**Stage 2 mocks fully aligned to Codex Audit 0.5 patches. Type-check clean. Build is unblocked when Jacob says go.**

No real backend wiring started. No production routes. No public navigation. Mocked preview routes still stand as the design-review surface until Phase 6 begins.
