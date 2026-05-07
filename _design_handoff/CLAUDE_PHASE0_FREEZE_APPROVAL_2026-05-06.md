# Phase 0 Freeze Approval — Final Audit

**Date:** 2026-05-06
**From:** Claude
**For:** Codex (freeze-handshake closure)
**Files audited:**
- `/home/jacobbarkley/.openclaw/workspace/trading-bot/src/openclaw_core/models/guided.py` (969 lines)
- `/home/jacobbarkley/.openclaw/workspace/trading-bot/tests/openclaw_core/test_guided_contracts.py` (721 lines)

**Test status confirmed by Codex:** 14 guided tests pass, 24 with sibling tests pass.

---

## Audit-question answers

### 1. Is the N-list fully dispositioned?

**Yes.** All 35 items now have a final disposition.

**11 patches applied** (every audit-recommended ADD landed):

| N | Patch | Verified at |
|---|---|---|
| N3 | `mandate_subtitle: str` on StrategyLibraryEntry | line 294 |
| N4 | `mandate_disclosure_paragraph: str` on DisclosureVersion + required-copy validator | lines 421, 452 |
| N5 | `holding_period_typical_label: str` | line 299 |
| N6 | `trade_frequency_typical_label: str` | line 300 |
| N7 | `asset_class_label: str` | line 301 |
| N9 | `matched_tags: list[str]` on CandidateConsideration + SELECTED-requires validator | lines 475, 481 |
| N10 | `rejection_reason_code` + `rejection_reason_label` paired + paired validator | lines 476–477, 483 |
| N15 | `drawdown_headline_pct: float` (0–100) + `drawdown_headline_period_label: str` + non-empty validator | lines 423–424, 454 |
| N16 | `what_you_accept_bullets: list[str]` with `min_length=1` | line 427 |
| N18 | `required_attestation_text: str` + non-empty validator | lines 428, 457 |
| N19 | `evidence_summary: list[GuidedEvidenceRecord]` with `min_length=1` (snapshotted on disclosure) | line 429 |
| N20 | `technical_details_payload: dict[str, Any]` (in addition to `technical_details: list[DisclosureSection]`) | line 431 |
| N22 | `failure_reason_code`, `failure_human_label`, `remediation_steps`, `external_link` + FAILED-requires + ACTION_REQUIRED-requires validators | lines 573–577, 593, 595 |
| N24 | `DisclosureState` enum + `disclosure_state: DisclosureState` field on GuidedEnrollmentView | lines 49, 931 |
| N28 | `reason_code: str` (required) + `reason: str` + `reason_label: str \| None` + HOLDINGS_CHANGE-requires validator | lines 823–825, 856 |
| N29 | New contract `Questionnaire.v1` with `QuestionnaireQuestion`, `QuestionnaireAnswerOption`, unique-keys + unique-sequences validators | lines 184–229 |
| N30 | `questionnaire_answers_snapshot: list[QuestionnaireAnswerSnapshot]` with `min_length=1` on GuidedMatchProposal | lines 232–238, 497 |

**18 MAPs preserved** (N1, N2, N8, N11, N12, N13, N14, N17, N20-secondary, N21, N23, N25, N26, N27, plus N31–N35 confirmed UI-local).

**Cosmetic alignments applied:**
- `not_guaranteed_language` → `not_guaranteed_copy` (rename to match my N17 spec — line 426)
- `GuidedEnrollmentProjection` → `GuidedEnrollmentView` (`schema_version: "guided_enrollment_view.v1"` — line 924)
- `GuidedEventHistory` → `EnrollmentEventsView` (`schema_version: "enrollment_events_view.v1"` — line 873)
- `source=strategy_entry` → `source=strategy_execution` (line 77)
- `source=manual` → `source=manual_action` (line 81) — bonus consistency win

**Codex design questions resolved:**
- **N21** — enrollment.status kept separate from backing_strategy_state ✓ (lines 29, 40, fields at 609 and 619)
- **N25/N26** — renamed projections to *_view.v1 ✓
- **N27** — kind/source split preserved + cosmetic source rename applied ✓
- **N28** — reason_code split adopted ✓

### 2. Is any UX-blocking field still missing?

**No.** Every wireframe surface (S1–S11 from Stage 1) has its required contract data present.

Quick coverage check by surface:

| Surface | Required fields | Present? |
|---|---|---|
| S1 questionnaire intro | UX env flag (UI-local) | N/A (correctly UI-local) |
| S2 questionnaire questions | Questionnaire / QuestionnaireQuestion / QuestionnaireAnswerOption (key, sequence, text, why_we_ask_text, options) | ✓ |
| S3 match preview | friendly_name, plain_english_thesis, drawdown_headline_pct + period_label, asset_class_label, holding_period_typical_label, trade_frequency_typical_label, mandate_subtitle, matched_tags, candidates_considered with rejection_reason_label | ✓ |
| S4 disclosure | drawdown_headline_pct + period_label, paper_live_distinction, what_you_accept_bullets, not_guaranteed_copy, evidence_summary, required_attestation_text, mandate_disclosure_paragraph, technical_details + technical_details_payload | ✓ |
| S5–S7 broker states | BrokerCapabilitySnapshot status + failure_state + failure_reason_code + failure_human_label + remediation_steps + external_link | ✓ |
| S8 ACCEPTED_PENDING_BROKER | EnrollmentStatus enum value present | ✓ |
| S9 ACTIVE | enrollment.status + backing_strategy_state separately, library_entry CANDIDATE projected via GuidedEnrollmentView | ✓ |
| S10 paper monitoring | evidence_summary 5-axis, paper_observation_days_count, current_value_usd, cash_value_usd, cumulative_paper_pnl_realized/unrealized, holdings, mandate_disclosure_paragraph | ✓ |
| S11 unified event history | EnrollmentEventsView with GuidedEvent rows, kind/source split, reason_code/reason/reason_label, actor_type, user_notified, audit_visibility, provenance | ✓ |

Bonus shapes Codex added that strengthen the read model:
- `GuidedHoldingView` (typed holding rows on the read model)
- `GuidedPendingUserAction` (typed pending-action rows for the ⋯ More menu)
- `events_view: EnrollmentEventsView` nested in `GuidedEnrollmentView` so a single fetch carries both the recent-events preview and the full history reference
- `validate_projection_consistency` on GuidedEnrollmentView ensures scope alignment + disclosure ↔ library_entry alignment at the schema level

### 3. Any naming/copy ambiguity between CANDIDATE library entries and ACTIVE enrollments?

**Not at the contract level.**

- `EnrollmentStatus = Literal[..., "ACTIVE", ...]` and `LibraryEntryStatus = Literal["CANDIDATE", "ACTIVE", ...]` share the literal string `"ACTIVE"` but are typed as distinct enums attached to distinct fields on distinct contracts (`enrollment.status` vs `library_entry.status`). No serialization path produces a bare "ACTIVE" without its parent path.
- The slice's intentional combination (enrollment ACTIVE against a CANDIDATE library entry) is supported by `GuidedEnrollmentView` carrying both: `library_entry: StrategyLibraryEntry` (which can be CANDIDATE) and `enrollment: GuidedEnrollment | None` (which can be ACTIVE). The validators do not conflate them.
- The new validator `validate_holdings_change_provenance` on GuidedEvent enforces `support_intervention` events have `actor_type=OPERATOR` and `user_notified` set — closes a CR1-adjacent ambiguity (operator actions never look like user actions in the unified history).
- UI bears the visual disambiguation responsibility per CR1, CR2, CR3. The contract correctly stays out of UI copy decisions while supplying every field needed to drive them.

## Validators added that enforce the audit spec at the schema level

Beyond just adding fields, Codex shipped validators that *require* the contract to be honest:

- `CandidateConsideration` — SELECTED candidates require `matched_tags`; REJECTED candidates pair `rejection_reason_code`/`rejection_reason_label`
- `DisclosureVersion.validate_required_copy` — non-empty enforced for `plain_english_thesis`, `mandate_disclosure_paragraph`, `drawdown_headline`, `drawdown_headline_period_label`, `paper_live_distinction`, `not_guaranteed_copy`, `required_attestation_text`
- `what_you_accept_bullets` and `evidence_summary` and `questionnaire_answers_snapshot` all carry `min_length=1`
- `Questionnaire` enforces unique question keys and unique sequences
- `BrokerCapabilitySnapshot` — FAILED requires reason_code + human_label; BROKER_ACTION_REQUIRED requires remediation_steps
- `GuidedEvent` — HOLDINGS_CHANGE requires reason, reason_code, provenance, source; support_intervention source requires OPERATOR + user_notified
- `GuidedEnrollment` — ACTIVE requires verified broker; BROKER_* status must match capability failure_state
- `LibraryAdmissionGate` — operator_approved requires approved_by + approved_at
- `StrategyLibraryEntry` — ACTIVE requires all 6 admission gates cleared, non-TBD mandate, ≥1 evidence record

These aren't documentation — they're contract-enforced honesty.

## Final verdict

**Phase 0 freeze approved; Stage 2 can begin.**
