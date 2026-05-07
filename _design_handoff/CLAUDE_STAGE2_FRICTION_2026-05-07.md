# Stage 2 Contract Friction (for Audit 0.5)

**Date:** 2026-05-07
**From:** Claude (UX Stage 2)
**For:** Codex (input to Audit 0.5, NOT a request to revise frozen contracts)

Captured per the Stage 2 discipline: if UX surfaces a contract problem, log it as friction for Audit 0.5; do not revise Phase 0 contracts directly. Stage 2 mocked previews are built; this doc is the handoff input alongside the preview routes themselves.

## Friction items

### F1 — Drawdown-headline rendering source ambiguity

- **Where it surfaced:** S3 match preview big-number rendering of "−8.9% in any rolling period."
- **Contract state today:**
  - `strategy_library_entry.v1.drawdown_headline: str` — freeform display string, e.g. `"−8.9% in any rolling period"`.
  - `disclosure_version.v1.drawdown_headline_pct: float` + `drawdown_headline_period_label: str` — structured numeric + period label.
- **The friction:** the match preview wants the structured big-number rendering (`-8.9%` huge, period label below). Reading `library_entry.drawdown_headline` and prepending `−` produces a double-negative or an awkward string render. Reading from `disclosure_version` works and is what the slice mock now does, but it requires every UX context that wants the headline to also fetch the disclosure version.
- **Resolution in Stage 2 mocks:** the match-proposal component takes `disclosure: DisclosureVersion` as a prop and renders the structured fields directly. Note added inline in the component.
- **Question for Codex / Audit 0.5:** is the contract intent (a) "always source the headline from disclosure_version, library_entry's drawdown_headline is a summary-card string only", or (b) "library_entry should also carry the structured pct + period label so summary surfaces don't need disclosure"? Either is workable; the projection layer (`guided_enrollment_view.v1`) already carries both. Mostly a documentation / convention question, not a schema add.

## What did NOT surface as friction

For completeness, every other surface mapped clean against the frozen contracts:

- **S1 + S2 questionnaire** — `questionnaire.v1` has every field the multi-step UI needs (key, sequence, text, why_we_ask_text, ordered options with matcher_value + matcher_tags). Unique-keys + unique-sequences validators caught structural drift.
- **S4 disclosure** — every required field present (mandate_disclosure_paragraph, structured drawdown, what_you_accept_bullets, not_guaranteed_copy, evidence_summary, required_attestation_text). Validators enforce non-empty and at least 1 evidence record.
- **S5–S8 broker flow** — `BrokerCapabilitySnapshot` has `failure_reason_code`, `failure_human_label`, `failure_reason`, `remediation_steps`, `external_link` — exactly what the three failure outcomes need. The `BROKER_ACTION_REQUIRED requires remediation_steps` validator pinned the discipline.
- **S9 ACTIVE enrollment** — `guided_enrollment.status` separate from `backing_strategy_state` makes the two-ACTIVEs distinction renderable cleanly. The hero shows `enrollment.status = ACTIVE` over `library_entry.status = CANDIDATE` with explicit "Not validated. Not approved for live capital." copy.
- **S10 monitoring** — `disclosure.evidence_summary` carries 5-axis evidence by tier; `view.paper_observation_days_count` + `cumulative_paper_pnl_realized/unrealized` give cold-start tracker fields; `disclosure.mandate_disclosure_paragraph` closes the "starter strategy ≠ starter product" gap.
- **S11 unified event history** — `enrollment_events_view.v1` carries every `GuidedEvent` with kind/source split, reason_code/reason/reason_label, actor_type, audit_visibility, user_notified, provenance. The source-primary filter UX maps cleanly. The `support_intervention requires actor_type=OPERATOR + user_notified` validator is the schema-level guarantee that operator actions never look like user actions in the unified history.
- **CANDIDATE non-public discipline** — banner is hard-coded across every Guided preview page via `<InternalPreviewBanner />`. The amber pill + "Internal preview · pre-admission" copy is loud and unmistakable.

## Notes on naming conventions

These are observations, not friction:

- `library_entry.drawdown_headline` (freeform string) vs `disclosure_version.drawdown_headline_pct + drawdown_headline_period_label` (structured) — see F1.
- `library_entry.mandate` (enum) vs `library_entry.mandate_subtitle` (display string) vs `disclosure_version.mandate_disclosure_paragraph` (full paragraph). Three layers of mandate copy at three levels of fidelity. Worked cleanly in the wireframes — each surface reads the appropriate layer. Not friction; it's the design.
- `guided_event.source` includes both `manual_action` and `support_intervention` lanes that overlap with `actor_type=OPERATOR` events. The filter dropdown labels them distinctly ("Manual" / "Support") and the row rendering uses actor_type as the dominant axis, so no UX confusion. Worth confirming Codex agrees the source/actor_type combinations are well-defined.

## Stage 2 mocked previews — file paths

### Components
- `components/vires/guided/types.ts` — TypeScript mirror of frozen Phase 0 contracts
- `components/vires/guided/mocks.ts` — fixture data conforming to those types
- `components/vires/guided/shared.tsx` — InternalPreviewBanner, EvidenceCard, GuidedHeroCard, formatting helpers
- `components/vires/guided/questionnaire-surface.tsx` — S1+S2 multi-step questionnaire
- `components/vires/guided/match-proposal-surface.tsx` — S3 match preview
- `components/vires/guided/disclosure-surface.tsx` — S4 disclosure acceptance
- `components/vires/guided/broker-flow-surface.tsx` — S5–S8 broker connect/check/outcomes (state picker)
- `components/vires/guided/active-enrollment-surface.tsx` — S9 ACTIVE paper-running hero
- `components/vires/guided/monitoring-surface.tsx` — S10 paper monitoring readback
- `components/vires/guided/event-history-surface.tsx` — S11 unified event history

### Routes
- `app/vires/guided/preview/page.tsx` — index linking to all 7 preview routes
- `app/vires/guided/preview/questionnaire/page.tsx`
- `app/vires/guided/preview/match/page.tsx`
- `app/vires/guided/preview/disclosure/page.tsx`
- `app/vires/guided/preview/broker/page.tsx`
- `app/vires/guided/preview/active/page.tsx`
- `app/vires/guided/preview/monitoring/page.tsx`
- `app/vires/guided/preview/events/page.tsx`

### Mock fixture names (exported from `components/vires/guided/mocks.ts`)
- `MOCK_QUESTIONNAIRE_V1` — `Questionnaire`
- `MOCK_STEADY_TIDE_CANDIDATE` — `StrategyLibraryEntry` with `status="CANDIDATE"`
- `MOCK_DISCLOSURE_STEADY_TIDE_V1` — `DisclosureVersion`
- `MOCK_MATCH_PROPOSAL` — `GuidedMatchProposal` in `PENDING_ACCEPTANCE`
- `MOCK_ENROLLMENT_PENDING_BROKER` — `GuidedEnrollment` in `ACCEPTED_PENDING_BROKER`
- `MOCK_ENROLLMENT_ACTIVE` — `GuidedEnrollment` in `ACTIVE`
- `MOCK_ENROLLMENT_BROKER_RETRYABLE`
- `MOCK_ENROLLMENT_BROKER_ACTION_REQUIRED`
- `MOCK_ENROLLMENT_BROKER_INELIGIBLE`
- `MOCK_EVENTS` + `MOCK_EVENTS_VIEW` — `EnrollmentEventsView` with all 7 lanes represented
- `MOCK_ENROLLMENT_VIEW_ACTIVE` — `GuidedEnrollmentView` (CANDIDATE library entry + ACTIVE enrollment + paper monitoring numbers)
- `MOCK_ENROLLMENT_VIEW_NOTICE_PENDING` — same as above but `disclosure_state="NOTICE_PENDING"` with a pending acknowledge_notice action

## Stop status

**Stage 2 mocked previews complete; waiting for Codex backend slice + Audit 0.5 before real wiring.**

No real backend fetches. No public navigation. No production routes. F1 is the only contract-friction note from Stage 2; everything else maps clean to the frozen contracts.
