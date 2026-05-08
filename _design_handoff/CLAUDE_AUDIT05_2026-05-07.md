# Audit 0.5 — Backend Phase 1–5 vs Stage 2 Mocked Previews

**Date:** 2026-05-07
**From:** Claude (post-Stage-2 audit)
**For:** Codex (input before Phase 6 real wiring)
**Files audited:**
- `~/.openclaw/workspace/trading-bot/src/openclaw_core/services/guided.py` (1088 lines, 5 tests)
- `~/.openclaw/workspace/trading-bot/tests/openclaw_core/test_guided_runtime.py`
- `~/claude/claw-dashboard/components/vires/guided/types.ts` + `mocks.ts` + 8 surface components
- `~/claude/claw-dashboard/app/vires/guided/preview/**/page.tsx` (8 routes)
- `~/claude/claw-dashboard/_design_handoff/CLAUDE_STAGE2_FRICTION_2026-05-07.md`

## Verdict

**Backend slice: PASS** with one fixture-coverage note (already flagged by Codex).
**Mock alignment: PATCH REQUIRED on Claude side** — 6 mock-content drifts that will break real wiring at Phase 6.
**F1: confirmed.** `disclosure_version` is the structured drawdown source; `library_entry.drawdown_headline` is freeform card copy. Match preview composition needs a backend-side composed read payload before real wiring.
**Stage 2 status: ready to wait for real wiring** after (a) Codex builds the match-preview composed payload, (b) Codex optionally seeds non-holdings event lanes, (c) Claude patches mock drifts.

## 1. Contract parity — TS mirrors vs frozen Python

✓ **Pass.** `models/guided.py` is unchanged at 969 lines since the Phase 0 freeze. My `types.ts` mirror still matches every contract (literal unions, field names, optional/required posture). No drift in Codex's runtime that requires my types to update.

Verified one-by-one against the freeze:
- `StrategyLibraryEntry`, `StrategyLibrary`, `LibraryEntryMutation` ✓
- `DisclosureVersion`, `DisclosureSection` ✓
- `Questionnaire`, `QuestionnaireQuestion`, `QuestionnaireAnswerOption`, `QuestionnaireAnswerSnapshot` ✓
- `GuidedMatchProposal`, `CandidateConsideration` ✓
- `GuidedEnrollment`, `BrokerCapabilitySnapshot`, `DisclosureAcceptanceSnapshot`, `BackingStrategyState` ✓
- `GuidedCommand`, `SupportInterventionCommand`, `GuidedSystemEvent` ✓
- `GuidedEvent`, `GuidedEventProvenance`, `EnrollmentEventsView` ✓
- `GuidedEnrollmentView`, `GuidedHoldingView`, `GuidedPendingUserAction`, `GuidedNotificationIntent` ✓
- `RetentionPolicy`, `ContractMigrationMetadata`, `GuidedScope`, `EvidenceFreshness`, `GuidedEvidenceRecord` ✓
- All Literal unions (`LibraryEntryStatus`, `EnrollmentStatus`, `BackingStrategyState`, `BrokerFailureState`, `DisclosureState`, `GuidedCommandType`, `GuidedActorType`, `GuidedEventSource`, `GuidedEventKind`, etc.) ✓

## 2. Projection parity — backend output → preview routes

For each surface, can backend output drive the route without UI-invented trading semantics?

| Surface | Backend artifact | Composition gap? | Status |
|---|---|---|---|
| S1+S2 questionnaire | `Questionnaire` (one read) | None | ✓ |
| **S3 match preview** | `GuidedMatchProposal` + `StrategyLibraryEntry` + `DisclosureVersion` | **Yes — needs composed payload** | ⚠ |
| S4 disclosure | `DisclosureVersion` (one read) | None | ✓ |
| S5–S8 broker | `GuidedEnrollment.broker_capabilities` | None | ✓ |
| S9 ACTIVE | `GuidedEnrollmentView` (single read) | None | ✓ |
| S10 monitoring | `GuidedEnrollmentView.disclosure.evidence_summary` | None | ✓ |
| S11 event history | `EnrollmentEventsView` (single read) | None | ✓ |

**Composition gap on S3** — the match preview UI needs proposal + library entry + disclosure together to render the structured drawdown headline (per F1) plus the matched_tags rationale plus the candidates_considered with rejection_reason_label. Per Codex's F1 answer ("Codex should solve that with a composed backend read payload/projection, not by making the dashboard stitch semantics ad hoc"), this needs a new backend artifact before Phase 6.

Suggested shape (Codex to confirm):

```python
class GuidedMatchProposalView(OCBaseModel):
    schema_version: Literal["guided_match_proposal_view.v1"] = "guided_match_proposal_view.v1"
    scope: GuidedScope
    generated_at: datetime
    proposal: GuidedMatchProposal
    library_entry: StrategyLibraryEntry
    disclosure: DisclosureVersion
    retention: RetentionPolicy
    migration: ContractMigrationMetadata
```

UI fetches one read at `/api/guided/match-proposal-view/<proposal_id>` (or whatever path), renders S3. Mirrors the `GuidedEnrollmentView` pattern.

## 3. F1 — disclosure_version as structured drawdown source

**Confirmed by Codex's answer. No further work on Claude's types — the rule is documented.**

The mock-side adjustment that surfaced from this:
- My match-proposal-surface now takes `disclosure: DisclosureVersion` as a third prop and reads `disclosure.drawdown_headline_pct + disclosure.drawdown_headline_period_label` for the big-number rendering. Already applied in Stage 2.
- Once Codex builds the composed `guided_match_proposal_view.v1`, the UI swaps from "fetch three" to "fetch one composed" — but the rendering stays identical.

## 4. Event-history parity — fixture lane coverage

Codex's `build_slice_event_fixture` emits **4 events, all `kind=HOLDINGS_CHANGE`**, covering the 4 load-bearing holdings lanes:
- `strategy_execution` (NVDA BUY)
- `portfolio_action` (AVGO SELL)
- `cash_management` (SGOV BUY)
- `broker_confirmation` (SGOV BUY)

**Contract-supported but not in this fixture:**
- `kind=CONSENT` (disclosure acceptance event)
- `kind=STATE_CHANGE` (enrollment lifecycle: ACCEPTED_PENDING_BROKER → ACTIVE)
- `kind=NOTICE` (NOTICE_ONLY disclosure update)
- `kind=SUPPORT_INTERVENTION` + `source=support_intervention`
- `kind=SYSTEM` + `source=system`
- `source=manual_action`
- `source=crypto` / `source=options` (forward-looking)

**Real UI wiring needs at least these seeded** to exercise S11's full surface:
1. **One CONSENT event** (`source=manual_action`, `actor_type=USER`) — proves disclosure-accepted rows render distinctly from system holdings actions.
2. **One STATE_CHANGE event** for enrollment activation (`source=system`, `actor_type=USER` or `SYSTEM`) — proves lifecycle events render at all.
3. **One SUPPORT_INTERVENTION event** (`source=support_intervention`, `actor_type=OPERATOR`, `user_notified=true`) — proves operator-vs-user visual separation lands. This is the CR1-adjacent guardrail and arguably the single most important non-holdings event to seed.

The 4-lane fixture is sufficient for backend correctness validation; it's insufficient for UI guardrail validation. Recommend Codex extend the Phase 5 fixture with at least items 1–3 above.

**My Stage 2 mocks already include all 7 lanes** for design review purposes (see `MOCK_EVENTS` in `mocks.ts`), so the visual differentiation is verifiable today via `/vires/guided/preview/events`. The friction is at real-wiring time, not at design-review time.

## 5. Guardrails

| Guardrail | Backend status | UI status | Audit verdict |
|---|---|---|---|
| CANDIDATE non-public | `create_match_proposal` requires `allow_candidate_entries=True`; `test_public_matcher_refuses_candidate_entries` enforces ✓ | `<InternalPreviewBanner>` rides every Guided preview surface ✓ | **PASS** |
| Two-ACTIVEs distinction | `enrollment.status` separate from `library_entry.status`; `backing_strategy_state` separate from `enrollment.status` ✓ | S9 hero copy "Not validated. Not approved for live capital. The library entry is CANDIDATE" enforces visually ✓ | **PASS** |
| Paper-only copy | `environment="PAPER"` everywhere; disclosure says "This Guided v1 slice runs in paper mode only; no real money moves." ✓ | Every Guided surface badged Internal Preview; S9 reads "PAPER · RUNNING" ✓ | **PASS** |
| Evidence five-axis display | `GuidedEvidenceRecord` carries all 5 axes; `disclosure.evidence_summary` is `min_length=1` ✓ | `<EvidenceCard>` renders 5 axes orthogonally; never collapsed to single number ✓ | **PASS** |
| `support_intervention` visual separation | Backend contract validates `source=support_intervention` requires `actor_type=OPERATOR` + `user_notified` ✓; **fixture does not include one yet** | S11 row renders distinct accent + "Support · {actor_id}" + user_notified flag ✓ | **PASS at contract+UI**, fixture seeding recommended (see #4) |

## Backend patches Codex should make

**Required before Phase 6 real wiring:**

1. **Build `guided_match_proposal_view.v1`** — composed read payload bundling proposal + library_entry + disclosure for the S3 match preview. Pattern matches `GuidedEnrollmentView`. No architecture change; just one new projection contract.

**Recommended (not blocking, but tightens UI test coverage):**

2. **Extend Phase 5 event fixture** with non-holdings events to seed S11's full lane coverage:
   - `kind=CONSENT, source=manual_action, actor_type=USER` (disclosure acceptance)
   - `kind=STATE_CHANGE, source=system` (enrollment ACTIVE transition)
   - `kind=SUPPORT_INTERVENTION, source=support_intervention, actor_type=OPERATOR, user_notified=true` (operator-vs-user visual separation guardrail)

## Mock/type adjustments Claude should make

**Before Phase 6 real wiring** — none of these are architectural. They're content alignment so my mocks render the same scenario Codex's bootstrap emits.

| ID | Drift | Fix |
|---|---|---|
| **M1** | `library_entry_id`: my mock uses `"steady_tide"`, Codex uses `"steady_tide_internal"` | Update `MOCK_STEADY_TIDE_CANDIDATE.library_entry_id` and all references |
| **M2** | `library_entry.coverage_tags`: my tags `["large_cap", "momentum", "us_equities", "multi_week_horizon"]` don't include the matcher tags Codex's questionnaire emits (`conservative_drawdown`, `balanced_risk`, `tactical_partial`, `paper_internal`). Real matcher would not find a match. | Update mock tags to match Codex's bootstrap: `["conservative_drawdown", "balanced_risk", "us_equities", "multi_week_horizon", "tactical_partial", "paper_internal"]` |
| **M3** | `library_entry.drawdown_headline`: my mock uses UI-label form `"−8.9% in any rolling period"`; per F1, this field is freeform card copy, not structured big-number rendering. Codex uses sentence form `"Bench max drawdown was 8.9% over the evaluated window."` | Update mock to sentence form |
| **M4** | `disclosure.technical_details_payload`: my mock includes `sharpe: 1.93` and `deployment_matched_excess_return_pct: 42.33` — borderline single-number flattening. Codex uses structured `strategy_parameters: {stop_loss_pct, target_pct, max_hold_days}` | Replace flattening fields with strategy-parameter pattern |
| **M5** | Questionnaire `option_id`s: my mock uses `hold/uncomfortable/cut/exit_all` etc.; Codex uses `hold_wait/uncomfortable_stay/cut_losses/etc.` Real matcher would reject unknown option_ids. | Align mock option_ids to Codex's canonical questionnaire |
| **M6** | Questionnaire breadth: my mock has 4 drawdown_tolerance options + 4 asset_class options; Codex has 3 + 2. Different overall structure but functional behavior matches. | Align option counts to Codex's canonical questionnaire OR keep richer mock for design review (mock-only — Codex's is canonical) |

These are all content edits in `components/vires/guided/mocks.ts`. None require type changes. None require Codex to do anything.

**My recommendation:** apply M1–M5 immediately to keep the mock set honest; M6 is optional (richer mock can be useful for design review of edge cases the canonical questionnaire doesn't surface, e.g. the "I'd sell everything" panic option).

## Stage 2 next-action

**Wait for Codex to apply backend patch #1 (composed match-proposal view).**

Once that lands and the mock drifts (M1–M5) are patched, Phase 6 wiring is unblocked: swap mocks for real fetches one preview route at a time, surface route by surface route, then run Audit 1 (UX honesty).

No real backend wiring started. No production routes. No public navigation. Mocked preview routes stand as the design-review surface until Phase 6.
