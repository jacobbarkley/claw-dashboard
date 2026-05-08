// Hand-mirrored zod schemas for the frozen Phase 0 Guided contracts.
//
// SOURCE OF TRUTH: trading-bot src/openclaw_core/models/guided.py.
//
// These schemas are a HAND MIRROR of those Pydantic models. They exist
// because the dashboard reads JSON snapshots that bypass Pydantic
// validation; without runtime validation here, stale or malformed
// nested artifacts would silently leak past the read boundary and
// either break the UI or violate contract invariants without surfacing.
//
// DRIFT WARNING:
//   Every time guided.py moves (new field, enum extension, mandate
//   class added, retention class added, etc.) these schemas have to
//   move with it. Today that is manual. Track as follow-up: generate
//   these from the Pydantic source (Pydantic → JSON Schema →
//   ts-zod / zod-from-json-schema) so the source-of-truth is one
//   file, not two.
//
// Until then, treat any drift here as a P1 contract finding — same
// severity as the schema_version-only validation that motivated this
// file in the first place.
//
// SCOPE: only the artifacts the dashboard reads from disk are
// validated here. Command/event payloads written from the runtime
// remain Pydantic-validated upstream; the dashboard does not write
// them.

import { z } from "zod"

// ─── Enums ──────────────────────────────────────────────────────────────────

const GuidedSleeve = z.enum(["STOCKS", "OPTIONS", "CRYPTO", "PREDICTIONS"])
const BrokerEnvironment = z.enum(["PAPER", "LIVE"])
const LibraryEntryStatus = z.enum(["CANDIDATE", "ACTIVE", "PAUSED", "DEPRECATED", "RETIRED"])
const LibraryMandate = z.enum(["FULL_ALLOCATOR", "TACTICAL_PARTIAL", "CORE_SATELLITE", "OVERLAY", "TBD"])
const ChangeClassification = z.enum(["MATERIAL", "NOTICE_ONLY", "COSMETIC"])
const EvidenceType = z.enum([
  "BACKTEST",
  "SHADOW_FORWARD_OBSERVED",
  "BENCH_MULTI_ERA",
  "PAPER_FORWARD_SANDBOX",
  "PAPER_FORWARD_PROMOTED",
  "LIVE_OBSERVED",
])
const BrokerRealism = z.enum(["NONE", "SIMULATED", "PAPER_BROKER", "LIVE_BROKER"])
const FillRealism = z.enum([
  "NONE",
  "MIDPOINT_SIMULATED",
  "SPREAD_AWARE_SIMULATED",
  "PAPER_FILLS",
  "LIVE_FILLS",
])
const ProposalStatus = z.enum(["PENDING_ACCEPTANCE", "ACCEPTED", "DECLINED", "EXPIRED", "SUPERSEDED"])
const CandidateDecision = z.enum(["SELECTED", "REJECTED"])
const EnrollmentStatus = z.enum([
  "ACCEPTED_PENDING_BROKER",
  "ACTIVE",
  "PAUSED",
  "STOP_HOLD_TO_CLOSE",
  "STOP_LIQUIDATE",
  "BROKER_RETRYABLE",
  "BROKER_ACTION_REQUIRED",
  "BROKER_INELIGIBLE",
  "ENDED",
])
const BackingStrategyState = z.enum([
  "CURRENT",
  "UPGRADE_AVAILABLE",
  "UNDER_REVIEW",
  "DEPRECATED",
  "FORCED_EXIT_PENDING",
  "NO_LONGER_SUPPORTED",
])
const BrokerCapabilityStatus = z.enum(["NOT_CHECKED", "CHECKING", "VERIFIED", "FAILED"])
const BrokerFailureState = z.enum(["BROKER_RETRYABLE", "BROKER_ACTION_REQUIRED", "BROKER_INELIGIBLE"])
const DisclosureState = z.enum(["NORMAL", "NOTICE_PENDING", "REAFFIRMATION_DUE", "RE_ACCEPTANCE_REQUIRED"])
const GuidedActorType = z.enum(["USER", "OPERATOR", "SYSTEM"])
const GuidedHoldingRole = z.enum(["STRATEGY_POSITION", "CASH_RESERVE", "OTHER"])
const AuditVisibility = z.enum(["USER_VISIBLE", "INTERNAL_ONLY"])
const GuidedEventSource = z.enum([
  "strategy_execution",
  "portfolio_action",
  "cash_management",
  "broker_confirmation",
  "manual_action",
  "support_intervention",
  "system",
  "crypto",
  "options",
])
const GuidedEventKind = z.enum([
  "STATE_CHANGE",
  "HOLDINGS_CHANGE",
  "BROKER_CONFIRMATION",
  "CONSENT",
  "NOTICE",
  "SUPPORT_INTERVENTION",
  "SYSTEM",
])
const GuidedSide = z.enum(["BUY", "SELL", "NONE"])
const RetentionClass = z.enum([
  "PUBLIC_STATIC",
  "USER_STATE",
  "CONSENT_RECORD",
  "BROKER_REFERENCE",
  "ANONYMIZED_AGGREGATE",
])
const DeleteBehavior = z.enum(["DELETE", "TOMBSTONE", "RETAIN_FOR_AUDIT", "ANONYMIZE"])
const MigrationPolicy = z.enum(["ADDITIVE_ONLY", "VERSION_BUMP_REQUIRED", "DUAL_WRITE_REQUIRED"])
const NotificationType = z.enum([
  "STATE_CHANGE",
  "USER_ACTION_REQUIRED",
  "NOTICE",
  "BROKER_ACTION_REQUIRED",
])
const GuidedCommandType = z.enum([
  "accept_match",
  "decline_match",
  "request_rematch",
  "request_re_questionnaire",
  "start_enrollment",
  "pause_enrollment",
  "resume_enrollment",
  "retry_broker_setup",
  "stop_hold_to_close",
  "stop_liquidate",
  "accept_upgrade",
  "acknowledge_notice",
  "reaffirm_consent",
])

// ─── Shared metadata ────────────────────────────────────────────────────────

const ContractMigrationMetadataSchema = z.object({
  introduced_in_schema_version: z.string().min(1),
  compatible_from_schema_version: z.string().min(1),
  migration_policy: MigrationPolicy,
})

// RetentionPolicy.validate_flags_match_class — guided.py:128-138
const RetentionPolicySchema = z
  .object({
    retention_class: RetentionClass,
    delete_behavior: DeleteBehavior,
    contains_user_data: z.boolean(),
    contains_broker_data: z.boolean(),
    contains_regulated_data: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if ((v.retention_class === "USER_STATE" || v.retention_class === "CONSENT_RECORD") && !v.contains_user_data) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "user-state and consent records must set contains_user_data=true",
        path: ["contains_user_data"],
      })
    }
    if (v.retention_class === "BROKER_REFERENCE" && !v.contains_broker_data) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "broker-reference records must set contains_broker_data=true",
        path: ["contains_broker_data"],
      })
    }
    if (
      v.retention_class === "PUBLIC_STATIC" &&
      (v.contains_user_data || v.contains_broker_data || v.contains_regulated_data)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "public static contracts must not carry user, broker, or regulated data",
        path: ["retention_class"],
      })
    }
  })

// GuidedScope._safe_segment — guided.py:99-105 + 148-151
function isUnsafeSegment(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return true
  return trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")
}

const GuidedScopeSchema = z
  .object({
    user_id: z.string(),
    account_id: z.string(),
    strategy_group_id: z.string(),
  })
  .superRefine((v, ctx) => {
    for (const field of ["user_id", "account_id", "strategy_group_id"] as const) {
      if (isUnsafeSegment(v[field])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "scope segment must be non-empty and path-safe (no /, \\, or ..)",
          path: [field],
        })
      }
    }
  })

// ─── Evidence ───────────────────────────────────────────────────────────────

// EvidenceFreshness.validate_window_order — guided.py:162-168
const EvidenceFreshnessSchema = z
  .object({
    last_evaluated_at: z.string().min(1),
    data_window_start: z.string().min(1),
    data_window_end: z.string().min(1),
    staleness_policy: z.string(),
  })
  .superRefine((v, ctx) => {
    // String compare on ISO-8601 timestamps; relies on Codex's runtime emitting
    // canonical ISO format. If a non-ISO timestamp leaks through, the lexical
    // compare may misfire — flag both branches with explicit messages.
    if (v.data_window_end < v.data_window_start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "data_window_end must be on or after data_window_start",
        path: ["data_window_end"],
      })
    }
    if (v.staleness_policy.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "staleness_policy must be populated",
        path: ["staleness_policy"],
      })
    }
  })

const GuidedEvidenceRecordSchema = z.object({
  evidence_id: z.string().min(1),
  evidence_type: EvidenceType,
  freshness: EvidenceFreshnessSchema,
  sample_size: z.number().int().nullable(),
  regime_coverage: z.array(z.string()),
  broker_realism: BrokerRealism,
  fill_realism: FillRealism,
  source_refs: z.record(z.string(), z.string()),
  notes: z.array(z.string()),
})

// ─── Questionnaire ──────────────────────────────────────────────────────────

const QuestionnaireAnswerOptionSchema = z.object({
  option_id: z.string().min(1),
  label: z.string().min(1),
  matcher_value: z.string().min(1),
  matcher_tags: z.array(z.string()),
})

const QuestionnaireQuestionSchema = z.object({
  key: z.string().min(1),
  sequence: z.number().int().min(1),
  text: z.string().min(1),
  why_we_ask_text: z.string().min(1),
  answer_options: z.array(QuestionnaireAnswerOptionSchema).min(1),
})

// Questionnaire.validate_unique_questions — guided.py:222-230
export const QuestionnaireSchema = z
  .object({
    schema_version: z.literal("questionnaire.v1"),
    questionnaire_id: z.string().min(1),
    version: z.string().min(1),
    title: z.string().min(1),
    questions: z.array(QuestionnaireQuestionSchema).min(1),
    retention: RetentionPolicySchema,
    migration: ContractMigrationMetadataSchema,
  })
  .superRefine((v, ctx) => {
    const keys = v.questions.map(q => q.key)
    const sequences = v.questions.map(q => q.sequence)
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "questionnaire question keys must be unique",
        path: ["questions"],
      })
    }
    if (new Set(sequences).size !== sequences.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "questionnaire question sequences must be unique",
        path: ["questions"],
      })
    }
  })

const QuestionnaireAnswerSnapshotSchema = z.object({
  question_key: z.string().min(1),
  option_id: z.string().min(1),
  matcher_value: z.string().min(1),
  answered_at: z.string().nullable(),
})

// ─── Backing strategy / library ─────────────────────────────────────────────

const BackingStrategyRefSchema = z.object({
  backing_record_id: z.string().min(1),
  strategy_id: z.string().min(1),
  variant_id: z.string().min(1),
  passport_role_id: z.string().nullable(),
  execution_manifest_id: z.string().min(1),
  execution_manifest_path: z.string().nullable(),
  strategy_parameters_hash: z.string().min(1),
})

// LibraryAdmissionGate.validate_operator_approval_metadata — guided.py:279-283
const LibraryAdmissionGateSchema = z
  .object({
    promoted: z.boolean(),
    disclosed: z.boolean(),
    evidence_typed: z.boolean(),
    mandate_stated: z.boolean(),
    broker_capability_checked: z.boolean(),
    operator_approved: z.boolean(),
    approved_by: z.string().nullable(),
    approved_at: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.operator_approved && (!v.approved_by || v.approved_at === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "operator_approved admission gate requires approved_by and approved_at",
        path: ["operator_approved"],
      })
    }
  })

// StrategyLibraryEntry.validate_active_admission — guided.py:318-326
const StrategyLibraryEntrySchema = z
  .object({
    schema_version: z.literal("strategy_library_entry.v1"),
    library_entry_id: z.string().min(1),
    library_entry_version: z.number().int().min(1),
    status: LibraryEntryStatus,
    sleeve: GuidedSleeve,
    mandate: LibraryMandate,
    mandate_subtitle: z.string().min(1),
    friendly_name: z.string().min(1),
    plain_english_thesis: z.string().min(1),
    drawdown_headline: z.string().min(1),
    risk_summary: z.string().min(1),
    holding_period_typical_label: z.string().min(1),
    trade_frequency_typical_label: z.string().min(1),
    asset_class_label: z.string().min(1),
    coverage_tags: z.array(z.string()),
    backing_strategy: BackingStrategyRefSchema,
    disclosure_version_id: z.string().min(1),
    evidence: z.array(GuidedEvidenceRecordSchema).min(1),
    admission: LibraryAdmissionGateSchema,
    retention: RetentionPolicySchema,
    migration: ContractMigrationMetadataSchema,
  })
  .superRefine((v, ctx) => {
    if (v.status !== "ACTIVE") return
    const a = v.admission
    const allCleared =
      a.promoted &&
      a.disclosed &&
      a.evidence_typed &&
      a.mandate_stated &&
      a.broker_capability_checked &&
      a.operator_approved
    if (!allCleared) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ACTIVE library entries must clear all six admission gates",
        path: ["admission"],
      })
    }
    if (v.mandate === "TBD") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ACTIVE library entries require a non-TBD mandate",
        path: ["mandate"],
      })
    }
    // .min(1) on evidence already enforces non-empty for parsed inputs; keep
    // the explicit invariant for parity with guided.py and future schema edits.
    if (v.evidence.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ACTIVE library entries require at least one typed evidence record",
        path: ["evidence"],
      })
    }
  })

// StrategyLibrary.validate_unique_entry_versions — guided.py:345-353
export const StrategyLibrarySchema = z
  .object({
    schema_version: z.literal("strategy_library.v1"),
    generated_at: z.string().min(1),
    entries: z.array(StrategyLibraryEntrySchema),
    retention: RetentionPolicySchema,
    migration: ContractMigrationMetadataSchema,
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>()
    for (let i = 0; i < v.entries.length; i++) {
      const entry = v.entries[i]
      const key = `${entry.library_entry_id}::${entry.library_entry_version}`
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "strategy library entries must be unique by id and version",
          path: ["entries", i],
        })
      }
      seen.add(key)
    }
  })

// ─── Disclosure ─────────────────────────────────────────────────────────────

const DisclosureSectionSchema = z.object({
  section_id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  required: z.boolean(),
})

// DisclosureVersion.validate_required_copy — guided.py:449-466
export const DisclosureVersionSchema = z
  .object({
    schema_version: z.literal("disclosure_version.v1"),
    disclosure_version_id: z.string().min(1),
    library_entry_id: z.string().min(1),
    library_entry_version: z.number().int().min(1),
    version_label: z.string().min(1),
    change_classification: ChangeClassification,
    plain_english_thesis: z.string().min(1),
    mandate_disclosure_paragraph: z.string().min(1),
    drawdown_headline: z.string().min(1),
    drawdown_headline_pct: z.number(),
    drawdown_headline_period_label: z.string().min(1),
    paper_live_distinction: z.string().min(1),
    not_guaranteed_copy: z.string().min(1),
    what_you_accept_bullets: z.array(z.string()).min(1),
    required_attestation_text: z.string().min(1),
    evidence_summary: z.array(GuidedEvidenceRecordSchema).min(1),
    technical_details: z.array(DisclosureSectionSchema),
    technical_details_payload: z.record(z.string(), z.unknown()),
    effective_at: z.string().min(1),
    created_at: z.string().min(1),
    created_by: z.string().min(1),
    consent_expires_at: z.string().nullable(),
    reaffirmation_due_at: z.string().nullable(),
    supersedes_disclosure_version_id: z.string().nullable(),
    retention: RetentionPolicySchema,
    migration: ContractMigrationMetadataSchema,
  })
  .superRefine((v, ctx) => {
    const requiredCopy = [
      "plain_english_thesis",
      "mandate_disclosure_paragraph",
      "drawdown_headline",
      "drawdown_headline_period_label",
      "paper_live_distinction",
      "not_guaranteed_copy",
      "required_attestation_text",
    ] as const
    for (const field of requiredCopy) {
      if (v[field].trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} must be populated`,
          path: [field],
        })
      }
    }
    // ISO-8601 lexical compare: relies on canonical ISO emission upstream.
    if (v.consent_expires_at && v.consent_expires_at <= v.effective_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "consent_expires_at must be after effective_at",
        path: ["consent_expires_at"],
      })
    }
    if (v.reaffirmation_due_at && v.reaffirmation_due_at < v.effective_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reaffirmation_due_at must be on or after effective_at",
        path: ["reaffirmation_due_at"],
      })
    }
  })

// ─── Match proposal + composed view ─────────────────────────────────────────

// CandidateConsideration.validate_decision_metadata — guided.py:480-486
const CandidateConsiderationSchema = z
  .object({
    library_entry_id: z.string().min(1),
    library_entry_version: z.number().int().min(1),
    decision: CandidateDecision,
    rationale: z.string().min(1),
    matched_tags: z.array(z.string()),
    rejection_reason_code: z.string().nullable(),
    rejection_reason_label: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "SELECTED" && v.matched_tags.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "selected candidates require matched_tags",
        path: ["matched_tags"],
      })
    }
    if (
      v.decision === "REJECTED" &&
      (v.rejection_reason_code === null) !== (v.rejection_reason_label === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "rejected candidates must pair rejection_reason_code and rejection_reason_label when either is present",
        path: ["rejection_reason_code"],
      })
    }
  })

// GuidedMatchProposal.validate_proposal_state — guided.py:528-557
const GuidedMatchProposalSchema = z
  .object({
    schema_version: z.literal("guided_match_proposal.v1"),
    scope: GuidedScopeSchema,
    proposal_id: z.string().min(1),
    status: ProposalStatus,
    questionnaire_version: z.string().min(1),
    matcher_version: z.string().min(1),
    questionnaire_answers_snapshot: z.array(QuestionnaireAnswerSnapshotSchema).min(1),
    matched_library_entry_id: z.string().min(1),
    matched_library_entry_version: z.number().int().min(1),
    disclosure_version_id: z.string().min(1),
    considered_candidates: z.array(CandidateConsiderationSchema).min(1),
    match_quality_score: z.number().min(0).max(1),
    matched_answer_keys: z.array(z.string()),
    mismatched_answer_keys: z.array(z.string()),
    source_failure_id: z.string().nullable(),
    created_at: z.string().min(1),
    expires_at: z.string().nullable(),
    accepted_at: z.string().nullable(),
    declined_at: z.string().nullable(),
    superseded_by_proposal_id: z.string().nullable(),
    decline_reason: z.string().nullable(),
    retention: RetentionPolicySchema,
    migration: ContractMigrationMetadataSchema,
  })
  .superRefine((v, ctx) => {
    const winners = v.considered_candidates.filter(
      c =>
        c.decision === "SELECTED" &&
        c.library_entry_id === v.matched_library_entry_id &&
        c.library_entry_version === v.matched_library_entry_version,
    )
    if (winners.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "proposal must include exactly one selected candidate matching the winner",
        path: ["considered_candidates"],
      })
    }
    const answerKeys = new Set(v.questionnaire_answers_snapshot.map(a => a.question_key))
    const matchedKeys = new Set(v.matched_answer_keys)
    const mismatchedKeys = new Set(v.mismatched_answer_keys)
    let overlap = false
    for (const k of matchedKeys) {
      if (mismatchedKeys.has(k)) {
        overlap = true
        break
      }
    }
    if (overlap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "matched_answer_keys and mismatched_answer_keys must not overlap",
        path: ["matched_answer_keys"],
      })
    }
    for (const k of [...matchedKeys, ...mismatchedKeys]) {
      if (!answerKeys.has(k)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "match answer-key metadata must reference questionnaire_answers_snapshot keys",
          path: ["matched_answer_keys"],
        })
        break
      }
    }
    if (matchedKeys.size === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "proposals require at least one matched answer key",
        path: ["matched_answer_keys"],
      })
    }
    if (v.status === "ACCEPTED" && v.accepted_at === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ACCEPTED proposals require accepted_at",
        path: ["accepted_at"],
      })
    }
    if (v.status === "DECLINED" && v.declined_at === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DECLINED proposals require declined_at",
        path: ["declined_at"],
      })
    }
    if (v.status === "SUPERSEDED" && !v.superseded_by_proposal_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SUPERSEDED proposals require superseded_by_proposal_id",
        path: ["superseded_by_proposal_id"],
      })
    }
    // ISO-8601 lexical compare; relies on canonical ISO emission upstream.
    if (v.expires_at && v.expires_at <= v.created_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "proposal expires_at must be after created_at",
        path: ["expires_at"],
      })
    }
  })

// GuidedMatchProposalView.validate_match_preview_composition — guided.py:584-598
export const GuidedMatchProposalViewSchema = z
  .object({
    schema_version: z.literal("guided_match_proposal_view.v1"),
    scope: GuidedScopeSchema,
    generated_at: z.string().min(1),
    proposal: GuidedMatchProposalSchema,
    library_entry: StrategyLibraryEntrySchema,
    disclosure: DisclosureVersionSchema,
    retention: RetentionPolicySchema,
    migration: ContractMigrationMetadataSchema,
  })
  .superRefine((v, ctx) => {
    if (
      v.proposal.scope.user_id !== v.scope.user_id ||
      v.proposal.scope.account_id !== v.scope.account_id ||
      v.proposal.scope.strategy_group_id !== v.scope.strategy_group_id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "proposal scope must match match proposal view scope",
        path: ["proposal", "scope"],
      })
    }
    if (v.proposal.matched_library_entry_id !== v.library_entry.library_entry_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "proposal winner must match the projected library entry",
        path: ["library_entry", "library_entry_id"],
      })
    }
    if (v.proposal.matched_library_entry_version !== v.library_entry.library_entry_version) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "proposal winner version must match the projected library entry",
        path: ["library_entry", "library_entry_version"],
      })
    }
    if (v.proposal.disclosure_version_id !== v.disclosure.disclosure_version_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "proposal disclosure_version_id must match the projected disclosure",
        path: ["disclosure", "disclosure_version_id"],
      })
    }
    if (v.disclosure.library_entry_id !== v.library_entry.library_entry_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "disclosure must describe the projected library entry",
        path: ["disclosure", "library_entry_id"],
      })
    }
    if (v.disclosure.library_entry_version !== v.library_entry.library_entry_version) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "disclosure version must describe the projected library entry version",
        path: ["disclosure", "library_entry_version"],
      })
    }
  })

// ─── Enrollment ─────────────────────────────────────────────────────────────

// DisclosureAcceptanceSnapshot.validate_idempotency_key — guided.py:609-614
const DisclosureAcceptanceSnapshotSchema = z
  .object({
    disclosure_version_id: z.string().min(1),
    accepted_at: z.string().min(1),
    accepted_by_actor_id: z.string().min(1),
    idempotency_key: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    const colonCount = (v.idempotency_key.match(/:/g) || []).length
    if (colonCount < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "idempotency_key must encode at least user/action/target/session scope",
        path: ["idempotency_key"],
      })
    }
  })

// BrokerCapabilitySnapshot.validate_capability_failure — guided.py:634-654
const BrokerCapabilitySnapshotSchema = z
  .object({
    status: BrokerCapabilityStatus,
    checked_at: z.string().nullable(),
    broker_adapter: z.string().nullable(),
    broker_connection_id: z.string().nullable(),
    broker_account_ref: z.string().nullable(),
    environment: BrokerEnvironment,
    supported_sleeves: z.array(GuidedSleeve),
    failure_state: BrokerFailureState.nullable(),
    failure_reason_code: z.string().nullable(),
    failure_human_label: z.string().nullable(),
    failure_reason: z.string().nullable(),
    remediation_steps: z.array(z.string()),
    external_link: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.status === "VERIFIED") {
      const requiredRefs = ["checked_at", "broker_adapter", "broker_connection_id", "broker_account_ref"] as const
      for (const field of requiredRefs) {
        if (v[field] === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "VERIFIED broker capabilities require checked_at and broker/account refs",
            path: [field],
          })
        }
      }
      if (v.supported_sleeves.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "VERIFIED broker capabilities require supported_sleeves",
          path: ["supported_sleeves"],
        })
      }
    }
    if (v.status === "FAILED" && v.failure_state === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FAILED broker capabilities require failure_state",
        path: ["failure_state"],
      })
    }
    if (v.status === "FAILED" && (!v.failure_reason_code || !v.failure_human_label)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FAILED broker capabilities require failure_reason_code and failure_human_label",
        path: ["failure_reason_code"],
      })
    }
    if (v.failure_state === "BROKER_ACTION_REQUIRED" && v.remediation_steps.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BROKER_ACTION_REQUIRED requires remediation_steps",
        path: ["remediation_steps"],
      })
    }
    if (v.failure_state !== null && v.status !== "FAILED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "failure_state is only valid when status=FAILED",
        path: ["failure_state"],
      })
    }
  })

// GuidedEnrollment.validate_enrollment_state — guided.py:695-708
export const GuidedEnrollmentSchema = z
  .object({
    schema_version: z.literal("guided_enrollment.v1"),
    scope: GuidedScopeSchema,
    enrollment_id: z.string().min(1),
    proposal_id: z.string().min(1),
    status: EnrollmentStatus,
    environment: BrokerEnvironment,
    library_entry_id: z.string().min(1),
    library_entry_version: z.number().int().min(1),
    backing_record_id: z.string().min(1),
    execution_manifest_id: z.string().min(1),
    strategy_parameters_hash: z.string().min(1),
    matcher_version: z.string().min(1),
    disclosure_acceptance: DisclosureAcceptanceSnapshotSchema,
    broker_capabilities: BrokerCapabilitySnapshotSchema,
    backing_strategy_state: BackingStrategyState,
    created_at: z.string().min(1),
    activated_at: z.string().nullable(),
    paused_at: z.string().nullable(),
    ended_at: z.string().nullable(),
    retention: RetentionPolicySchema,
    migration: ContractMigrationMetadataSchema,
  })
  .superRefine((v, ctx) => {
    if (v.status === "ACTIVE") {
      if (v.activated_at === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ACTIVE enrollments require activated_at",
          path: ["activated_at"],
        })
      }
      if (v.broker_capabilities.status !== "VERIFIED") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ACTIVE enrollments require verified broker capabilities",
          path: ["broker_capabilities", "status"],
        })
      }
    }
    if (v.status.startsWith("BROKER_")) {
      if (v.broker_capabilities.status !== "FAILED") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "BROKER_* enrollment statuses require failed broker capability snapshot",
          path: ["broker_capabilities", "status"],
        })
      }
      if (v.broker_capabilities.failure_state !== v.status) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "BROKER_* enrollment status must match broker capability failure_state",
          path: ["broker_capabilities", "failure_state"],
        })
      }
    }
    if (v.environment !== v.broker_capabilities.environment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "enrollment environment must match broker capability environment",
        path: ["environment"],
      })
    }
  })

// ─── Events ─────────────────────────────────────────────────────────────────

const GuidedEventProvenanceSchema = z.object({
  enrollment_id: z.string().nullable(),
  library_entry_id: z.string().nullable(),
  library_entry_version: z.number().int().nullable(),
  backing_record_id: z.string().nullable(),
  execution_manifest_id: z.string().nullable(),
  strategy_parameters_hash: z.string().nullable(),
})

// GuidedEvent.validate_holdings_change_provenance — guided.py:906-922
// Note: quantity ge=0 is enforced at the field level (z.number().min(0)) below.
const GuidedEventSchema = z
  .object({
    schema_version: z.literal("guided_event.v1"),
    event_id: z.string().min(1),
    scope: GuidedScopeSchema,
    occurred_at: z.string().min(1),
    kind: GuidedEventKind,
    source: GuidedEventSource,
    actor_type: GuidedActorType,
    actor_id: z.string().min(1),
    reason_code: z.string().min(1),
    reason: z.string().min(1),
    reason_label: z.string().nullable(),
    audit_visibility: AuditVisibility,
    user_notified: z.boolean().nullable(),
    provenance: GuidedEventProvenanceSchema,
    symbol: z.string().nullable(),
    asset_type: z.string().nullable(),
    side: GuidedSide,
    quantity: z.number().min(0).nullable(),
    broker_order_id: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
    retention: RetentionPolicySchema,
    migration: ContractMigrationMetadataSchema,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "HOLDINGS_CHANGE") {
      if (v.reason.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "holdings-change events require reason",
          path: ["reason"],
        })
      }
      if (v.reason_code.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "holdings-change events require reason_code",
          path: ["reason_code"],
        })
      }
      if (!v.provenance.enrollment_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "holdings-change events require enrollment provenance",
          path: ["provenance", "enrollment_id"],
        })
      }
      if (!v.source) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "holdings-change events require source lane",
          path: ["source"],
        })
      }
    }
    if (v.source === "support_intervention") {
      if (v.actor_type !== "OPERATOR") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "support_intervention events require actor_type=OPERATOR",
          path: ["actor_type"],
        })
      }
      if (v.user_notified === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "support_intervention events require user_notified",
          path: ["user_notified"],
        })
      }
    }
  })

// EnrollmentEventsView.validate_unique_events — guided.py:948-953
export const EnrollmentEventsViewSchema = z
  .object({
    schema_version: z.literal("enrollment_events_view.v1"),
    scope: GuidedScopeSchema,
    generated_at: z.string().min(1),
    events: z.array(GuidedEventSchema),
    retention: RetentionPolicySchema,
    migration: ContractMigrationMetadataSchema,
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>()
    for (let i = 0; i < v.events.length; i++) {
      const id = v.events[i].event_id
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "enrollment events view event ids must be unique",
          path: ["events", i, "event_id"],
        })
      }
      seen.add(id)
    }
  })

// ─── Read model (enrollment view) ───────────────────────────────────────────

// GuidedHoldingView — guided.py:956-964 (quantity ge=0, market_value_usd ge=0)
const GuidedHoldingViewSchema = z.object({
  symbol: z.string().min(1),
  asset_type: z.string().min(1),
  quantity: z.number().min(0),
  market_value_usd: z.number().min(0),
  unrealized_pnl_usd: z.number().nullable(),
  holding_role: GuidedHoldingRole,
})

const GuidedPendingUserActionSchema = z.object({
  action_id: z.string().min(1),
  action_type: GuidedCommandType,
  reason_code: z.string().min(1),
  reason_label: z.string().min(1),
  due_at: z.string().nullable(),
})

// GuidedNotificationIntent.validate_action_payload — guided.py:741-745
const GuidedNotificationIntentSchema = z
  .object({
    schema_version: z.literal("notification_intent.v1"),
    notification_id: z.string().min(1),
    scope: GuidedScopeSchema,
    created_at: z.string().min(1),
    trigger_event_id: z.string().min(1),
    notification_type: NotificationType,
    title: z.string().min(1),
    body: z.string().min(1),
    target_enrollment_id: z.string().nullable(),
    target_proposal_id: z.string().nullable(),
    requires_user_action: z.boolean(),
    action_type: GuidedCommandType.nullable(),
    retention: RetentionPolicySchema,
    migration: ContractMigrationMetadataSchema,
  })
  .superRefine((v, ctx) => {
    if (v.requires_user_action && v.action_type === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "user-action-required notification intents require action_type",
        path: ["action_type"],
      })
    }
  })

// GuidedEnrollmentView.validate_projection_consistency — guided.py:1015-1025
// Note: current_value_usd and cash_value_usd carry ge=0 in the Pydantic source.
export const GuidedEnrollmentViewSchema = z
  .object({
    schema_version: z.literal("guided_enrollment_view.v1"),
    scope: GuidedScopeSchema,
    generated_at: z.string().min(1),
    library_entry: StrategyLibraryEntrySchema,
    proposal: GuidedMatchProposalSchema.nullable(),
    enrollment: GuidedEnrollmentSchema.nullable(),
    disclosure: DisclosureVersionSchema,
    disclosure_state: DisclosureState,
    evidence: z.array(GuidedEvidenceRecordSchema),
    holdings: z.array(GuidedHoldingViewSchema),
    current_value_usd: z.number().min(0).nullable(),
    cash_value_usd: z.number().min(0).nullable(),
    paper_observation_days_count: z.number().int().min(0),
    cumulative_paper_pnl_realized: z.number().nullable(),
    cumulative_paper_pnl_unrealized: z.number().nullable(),
    recent_events: z.array(GuidedEventSchema),
    pending_user_actions: z.array(GuidedPendingUserActionSchema),
    notifications: z.array(GuidedNotificationIntentSchema),
    events_view: EnrollmentEventsViewSchema,
    retention: RetentionPolicySchema,
    migration: ContractMigrationMetadataSchema,
  })
  .superRefine((v, ctx) => {
    const scopesEqual = (a: { user_id: string; account_id: string; strategy_group_id: string }) =>
      a.user_id === v.scope.user_id &&
      a.account_id === v.scope.account_id &&
      a.strategy_group_id === v.scope.strategy_group_id
    if (v.proposal && !scopesEqual(v.proposal.scope)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "proposal scope must match projection scope",
        path: ["proposal", "scope"],
      })
    }
    if (v.enrollment && !scopesEqual(v.enrollment.scope)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "enrollment scope must match projection scope",
        path: ["enrollment", "scope"],
      })
    }
    if (!scopesEqual(v.events_view.scope)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "events view scope must match projection scope",
        path: ["events_view", "scope"],
      })
    }
    if (v.disclosure.library_entry_id !== v.library_entry.library_entry_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "disclosure must describe the projected library entry",
        path: ["disclosure", "library_entry_id"],
      })
    }
  })
