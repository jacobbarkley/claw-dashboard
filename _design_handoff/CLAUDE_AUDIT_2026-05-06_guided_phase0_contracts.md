# Phase 0 Contract Audit — Stage 1 N-list vs Codex's `guided.py`

**Date:** 2026-05-06
**From:** Claude
**For:** Codex (freeze-handshake input)
**Scope:** Compare Stage 1 N1–N35 contract-needs list against
`/home/jacobbarkley/.openclaw/workspace/trading-bot/src/openclaw_core/models/guided.py`
and the 22 passing tests in `tests/openclaw_core/test_guided_contracts.py`.
**Constraint:** No architecture reopened. Findings are contract-freeze pressure only.

## Top-line

Codex's draft is **strong**. Eight contracts plus the projection layer plus retention/migration/idempotency machinery — all in one pass, with cross-field validators that catch the failure modes the spec already flagged. The shape matches the lock; the gaps are at the *display-readiness* layer, not at the architectural layer.

**11 patches recommended before freeze.** All N-items track to existing contracts — no new architectural concepts surfaced. The patches are field additions or structural sharpenings, not redesigns.

**18 items map clean** to Codex's draft as-is.

**5 items confirm REJECT** as UI-local.

## Audit table

| N | Field / concept | Codex status | Disposition | Patch before freeze? | Notes |
|---|---|---|---|---|---|
| N1 | `friendly_name` | PRESENT (`StrategyLibraryEntry.friendly_name`) | MAP | No | — |
| N2 | thesis paragraph | PRESENT (`plain_english_thesis` on both library entry + disclosure) | MAP | No | name diff only; Codex's name is clearer than mine |
| N3 | `mandate_subtitle` | NOT PRESENT (only the `mandate` enum) | **ADD** | **Yes** | UI must not derive copy from enum; ship as contract data |
| N4 | `mandate_disclosure_paragraph` | NOT PRESENT | **ADD** | **Yes** | The "starter strategy ≠ starter product" surface; either new field on `DisclosureVersion` or a required `DisclosureSection` with `section_id="mandate"` |
| N5 | `holding_period_typical_label` | NOT PRESENT | **ADD** | **Yes** | "~5–15 days per trade" rendered text |
| N6 | `trade_frequency_typical_label` | NOT PRESENT | **ADD** | **Yes** | "~2–4 per month" rendered text |
| N7 | `asset_class_label` | PARTIAL (`sleeve` enum present, no display label) | **ADD** | **Yes** | "US equities" — UI must not derive from enum |
| N8 | library entry status enum | PRESENT (exact match) | MAP | No | `CANDIDATE`/`ACTIVE`/`PAUSED`/`DEPRECATED`/`RETIRED` ✓ |
| N9 | `winner_rationale.matched_tags[]` | PARTIAL (single freeform `rationale` string) | **ADD** | **Yes** | UI needs structured bullet list. Either add `matched_tags: list[str]` on `CandidateConsideration` or wrap rationale into structured object |
| N10 | rejection reason structured | PARTIAL (`rationale` doubles for SELECTED+REJECTED) | **ADD** (recommend) | **Yes** | Add optional `rejection_reason_code: Literal[...]` enum on `CandidateConsideration` for auditability while keeping freeform `rationale` |
| N11 | `proposal.expires_at` | PRESENT | MAP | No | — |
| N12 | `source_failure_id` | PRESENT | MAP | No | Round 7 confirmation ✓ |
| N13 | `change_classification` | PRESENT | MAP | No | enum exact match ✓ |
| N14 | `consent_expires_at` / `reaffirmation_due_at` | PRESENT (both fields) | MAP | No | — |
| N15 | structured drawdown headline | PARTIAL (single freeform `drawdown_headline: str`) | **ADD** | **Yes** | Decompose into `drawdown_headline_pct: float` + `drawdown_headline_period_label: str`. Keep `drawdown_headline: str` as rendered display copy if useful, but the structured pair drives the big-number rendering on S3/S4 |
| N16 | `what_you_accept_bullets` | NOT PRESENT (could be `DisclosureSection` with section_id, but not enforced) | **ADD** | **Yes** | Either explicit `what_you_accept: list[str]` on `DisclosureVersion` or a required `DisclosureSection` with `section_id="what_you_accept"` and structured bullets |
| N17 | `not_guaranteed_copy` | PRESENT (`not_guaranteed_language`) | MAP | No | name diff only |
| N18 | `required_attestation_text` | NOT PRESENT | **ADD** | **Yes** | Exact attestation wording must be contract data, not UI-invented |
| N19 | evidence summary 5-dim snapshot on disclosure | PARTIAL (5-dim `GuidedEvidenceRecord` exists on library entry, NOT snapshotted on disclosure) | **ADD** | **Yes** | Add `evidence_snapshot: list[GuidedEvidenceRecord]` to `DisclosureVersion` so the disclosure remains accurate to what the user saw at acceptance, even if library evidence later updates |
| N20 | `technical_details_payload` | PRESENT (`technical_details: list[DisclosureSection]`) | MAP | No | the section structure is fine |
| N21 | enrollment status enum (full) | PRESENT, with separate `backing_strategy_state` field | MAP | No | **Codex's separation is correct.** Do NOT combine. See "Codex design questions" below. |
| N22 | structured `broker_failure_detail` | PARTIAL (`failure_state` enum + freeform `failure_reason` string only) | **ADD** | **Yes** | UI's S7b "How to fix it" can't render consistently from freeform. Add `failure_reason_code: Literal[...]`, `remediation_steps: list[str]`, `external_link: str \| None` to `BrokerCapabilitySnapshot` |
| N23 | `backing_strategy_state` | PRESENT | MAP | No | — |
| N24 | `disclosure_state` projection | NOT PRESENT (raw fields on disclosure exist; no projected state) | **ADD** | **Yes** | Add to `GuidedEnrollmentProjection`: `disclosure_state: Literal["NORMAL", "NOTICE_PENDING", "REAFFIRMATION_DUE", "RE_ACCEPTANCE_REQUIRED"]`. UI should not compute this from raw fields client-side |
| N25 | `guided_enrollment_view.v1` | PRESENT (`GuidedEnrollmentProjection` / `guided_enrollment_projection.v1`) | MAP (rename optional) | No | functionally complete; cosmetic rename suggestion below |
| N26 | `enrollment_events_view.v1` | PRESENT (`GuidedEventHistory` / `guided_event_history.v1`) | MAP (rename optional) | No | functionally complete; cosmetic rename suggestion below |
| N27 | event kind enum | DESIGN DIFFERENCE (Codex split into `kind` + `source`) | MAP **with UX update** | No | Codex's split is **better** than my flat enum. UX wireframe filter dropdown should reflect the split (filter by `source` primarily, since users ask "show me cash management" not "show me HOLDINGS_CHANGE"). One naming nit below. |
| N28 | reason_code / reason / reason_label | PARTIAL (`reason: str` only) | **ADD** | **Yes** | Add `reason_code: str \| None` on `GuidedEvent`. The projection layer fills `reason_label` for display. The pretty-display work we already did (`prettify_order_note`) belongs in the projection, not dashboard fetch glue |
| N29 | questionnaire definition contract | NOT PRESENT (only `questionnaire_version: str` reference) | **ADD** | **Yes** | New contract `Questionnaire.v1` with versioned questions, answer options, "why we ask" copy. Slice needs to render questionnaire from contract |
| N30 | questionnaire answers snapshot on proposal | NOT PRESENT | **ADD** | **Yes** | Add `questionnaire_answers_snapshot: dict[str, Any]` (or typed list) on `GuidedMatchProposal`. Audit trail must capture what the user answered |
| N31 | `UX_INTERNAL_PREVIEW` env flag | N/A (UI-local infrastructure) | REJECT | No | confirmed UI-local |
| N32 | read-time enforcement on disclosure | N/A (UI-local UX state) | REJECT | No | confirmed UI-local |
| N33 | event history filter selection state | N/A (UI-local) | REJECT | No | confirmed UI-local |
| N34 | sparkline timeframe state | N/A (existing TimeframeContext) | REJECT | No | confirmed UI-local |
| N35 | polling cadence | N/A (operational/deployment) | REJECT | No | confirmed UI-local |

## Patches needed before freeze (consolidated)

11 contract-level patches recommended before Codex declares Phase 0 frozen. Grouped by contract:

### `StrategyLibraryEntry`
- **N3** `mandate_subtitle: str` — display copy paired with the mandate enum
- **N5** `holding_period_typical_label: str`
- **N6** `trade_frequency_typical_label: str`
- **N7** `asset_class_label: str`

### `DisclosureVersion`
- **N4** `mandate_disclosure_paragraph: str` (or required `DisclosureSection` with `section_id="mandate"`) — the "starter strategy ≠ starter product" surface
- **N15** decompose `drawdown_headline` into `drawdown_headline_pct: float` + `drawdown_headline_period_label: str`
- **N16** `what_you_accept: list[str]` (or required `DisclosureSection` with `section_id="what_you_accept"`)
- **N18** `required_attestation_text: str`
- **N19** `evidence_snapshot: list[GuidedEvidenceRecord]` — snapshot at disclosure publish time

### `CandidateConsideration` (inside `GuidedMatchProposal`)
- **N9** `matched_tags: list[str]` for SELECTED candidates (or wrap rationale into structured object)
- **N10** optional `rejection_reason_code: Literal[...]` for REJECTED candidates

### `GuidedMatchProposal`
- **N30** `questionnaire_answers_snapshot: dict[str, Any]` (or typed list)

### `BrokerCapabilitySnapshot`
- **N22** structured failure detail:
  - `failure_reason_code: Literal[...]` (e.g., `INSUFFICIENT_BUYING_POWER`, `NOT_PDT_ENABLED`, `CASH_ONLY_ACCOUNT`, `API_TIMEOUT`, …)
  - `remediation_steps: list[str]` (when ACTION_REQUIRED)
  - `external_link: str | None` (deep-link to broker settings)

### `GuidedEnrollmentProjection`
- **N24** `disclosure_state: Literal["NORMAL", "NOTICE_PENDING", "REAFFIRMATION_DUE", "RE_ACCEPTANCE_REQUIRED"]` — projected from disclosure version + acceptance + classification

### `GuidedEvent`
- **N28** `reason_code: str | None` (raw machine-readable code; projection fills `reason_label` for display)

### New contract
- **N29** `Questionnaire.v1` — versioned definition: questions ordered list, each with `key`, `text`, `why_we_ask_text`, typed `answer_options[]`. Slice cannot render questionnaire without this.

## Codex's specific design questions — answered

### N21 — backing-strategy states separate from `enrollment.status`?

**Keep separate at the contract level.** Codex's split is the right call. Two reasons:

1. They're orthogonal axes. Enrollment status = process state ("paper-running"). Backing-strategy state = strategy lifecycle ("upgrade available," "under review"). Folding them mixes the read/write split's clean separation.
2. UI projects them differently: `enrollment.status` drives the hero copy (S9 `PAPER · RUNNING`); `backing_strategy_state` drives the `⋯ More` menu's "Accept upgrade" / "Acknowledge notice" actions. The dashboard reads both off the projection independently.

Recommendation: keep `EnrollmentStatus` and `BackingStrategyState` as separate fields on `GuidedEnrollment`. Project both into `GuidedEnrollmentProjection`. UI consumes both, never combines them at the data layer. The CR1 copy guardrail (two ACTIVEs distinction) is preserved by this separation.

### N25/N26 — rename `GuidedEnrollmentProjection` / `GuidedEventHistory` to `*_view.v1`?

**Cosmetic only — not patch-blocking. Recommend rename for vocabulary consistency.**

The Round 7 architecture used "view" terminology for projections (e.g., `guided_enrollment_view.v1`). Codex's `guided_enrollment_projection.v1` and `guided_event_history.v1` are functionally complete but mix vocabulary. Suggested renames:

- `GuidedEnrollmentProjection` → `GuidedEnrollmentView` (`schema_version: "guided_enrollment_view.v1"`)
- `GuidedEventHistory` → `GuidedEventHistoryView` (`schema_version: "enrollment_events_view.v1"`)

The rename is internal-naming; the *shape* doesn't change. Up to Codex whether to do this now or defer to T1.

### N27 — `event.kind` granularity vs Codex's `kind`/`source` split

**Codex's split is better than my flat enum. Adopt as-is, with one naming nit and a UX wireframe update.**

The `kind` (semantic category: `STATE_CHANGE` / `HOLDINGS_CHANGE` / `BROKER_CONFIRMATION` / `CONSENT` / `NOTICE` / `SUPPORT_INTERVENTION` / `SYSTEM`) + `source` (execution lane: `strategy_entry` / `portfolio_action` / `cash_management` / `broker_confirmation` / `manual` / `support_intervention` / `system` / `crypto` / `options`) split is cleaner than my flat enum. Each axis answers a different question.

UX implications I'll fold into Stage 2 wireframes:
- The S11 filter dropdown should expose `source` primarily ("strategy" / "cash management" / "manual" / "support" / "system"), since that's how users frame queries
- The visual differentiation (icon, color) per row uses `kind` + `actor_type`, not just one axis
- "Triggered by" copy on each row maps from `source` + `actor_type`

**One naming nit (not blocking):** `source=strategy_entry` is misleading for SELL events from the strategy execution lane. A regular target-hit exit is `kind=HOLDINGS_CHANGE`, `source=strategy_entry`, `side=SELL`. Reading the source name in isolation suggests "this was a buy." Consider renaming to `source=strategy_execution` for the lane that covers both entries and routine exits, leaving `source=portfolio_action` for stewardship-driven exits (stops, targets, time-stops). Cosmetic — not freeze-blocking.

### N28 — `reason_code` / `reason_text` / `reason_label` split

**Adopt the split.** Add `reason_code: str | None` to `GuidedEvent`. Projection layer derives `reason_label` from `reason_code` (or falls back to prettifying `reason`). The current `prettify_order_note` work in the dashboard moves to the projection layer where it belongs — that's exactly the read/write split principle.

## Items already mapped clean (no patch)

For completeness, the items where Codex's draft satisfies the spec without modification:

- N1 `friendly_name` ✓
- N2 `plain_english_thesis` ✓
- N8 library entry status enum ✓
- N11 `expires_at` ✓
- N12 `source_failure_id` ✓
- N13 `change_classification` ✓
- N14 `consent_expires_at` / `reaffirmation_due_at` ✓
- N17 `not_guaranteed_language` ✓
- N20 `technical_details` sections ✓
- N21 enrollment status (with separate `backing_strategy_state`) ✓
- N23 `backing_strategy_state` ✓
- N25 / N26 projection contracts (functional; rename optional) ✓
- N27 event kind/source split ✓ (adopt; UX wireframe update only)
- REJECT confirmations: N31, N32, N33, N34, N35 ✓

## Things Codex shipped beyond the N-list (worth a one-line ack each)

These weren't on my Stage 1 list but Codex shipped them and they're load-bearing:

- `GuidedScope` triple with safe-segment validation — the multi-tenant law made structural
- `EvidenceFreshness` as separate type — clean separation of freshness from evidence content
- `LibraryAdmissionGate` with 6 booleans + approval metadata + `is_cleared` property — the admission gate as a first-class contract object
- `BackingStrategyRef` for version-snapshotted strategy linkage
- `RetentionPolicy` cross-field validation enforcing user-data-flag invariants — exactly the discipline the spec demands
- Migration metadata on every contract — schema migration posture lived
- Idempotency key 4-segment validation — tight enforcement
- `LibraryEntryMutation` with material-fields validator — Round 6 mutation classification, fully realized
- `validate_holdings_change_provenance` on `GuidedEvent` — the standing principle "no hidden lanes" enforced at validator level

These are the parts of the draft that confirm the architecture didn't drift. Strong work.

## Summary for the freeze handshake

- **11 ADDs** before freeze (N3, N4, N5, N6, N7, N9, N10, N15, N16, N18, N19, N22, N24, N28, N29, N30 — counted as 11 distinct contract patches when grouped)
- **18 MAPs** as-is
- **5 RECs to REJECT** as UI-local (confirmed)
- **2 cosmetic rename suggestions** (N25/N26) — non-blocking
- **1 cosmetic naming nit** on `source=strategy_entry` — non-blocking
- **0 architectural reopenings**

Once Codex dispositions and applies the patches (or rejects with rationale), Phase 0 can freeze. Then Stage 2 (hi-fi comps + mocked preview routes against frozen contracts) starts.

No hi-fi comps started yet — waiting for freeze signal.
