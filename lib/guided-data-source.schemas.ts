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

const RetentionPolicySchema = z.object({
  retention_class: RetentionClass,
  delete_behavior: DeleteBehavior,
  contains_user_data: z.boolean(),
  contains_broker_data: z.boolean(),
  contains_regulated_data: z.boolean(),
})

const GuidedScopeSchema = z.object({
  user_id: z.string().min(1),
  account_id: z.string().min(1),
  strategy_group_id: z.string().min(1),
})

// ─── Evidence ───────────────────────────────────────────────────────────────

const EvidenceFreshnessSchema = z.object({
  last_evaluated_at: z.string().min(1),
  data_window_start: z.string().min(1),
  data_window_end: z.string().min(1),
  staleness_policy: z.string().min(1),
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

export const QuestionnaireSchema = z.object({
  schema_version: z.literal("questionnaire.v1"),
  questionnaire_id: z.string().min(1),
  version: z.string().min(1),
  title: z.string().min(1),
  questions: z.array(QuestionnaireQuestionSchema).min(1),
  retention: RetentionPolicySchema,
  migration: ContractMigrationMetadataSchema,
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

const LibraryAdmissionGateSchema = z.object({
  promoted: z.boolean(),
  disclosed: z.boolean(),
  evidence_typed: z.boolean(),
  mandate_stated: z.boolean(),
  broker_capability_checked: z.boolean(),
  operator_approved: z.boolean(),
  approved_by: z.string().nullable(),
  approved_at: z.string().nullable(),
})

const StrategyLibraryEntrySchema = z.object({
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

export const StrategyLibrarySchema = z.object({
  schema_version: z.literal("strategy_library.v1"),
  generated_at: z.string().min(1),
  entries: z.array(StrategyLibraryEntrySchema),
  retention: RetentionPolicySchema,
  migration: ContractMigrationMetadataSchema,
})

// ─── Disclosure ─────────────────────────────────────────────────────────────

const DisclosureSectionSchema = z.object({
  section_id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  required: z.boolean(),
})

export const DisclosureVersionSchema = z.object({
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

// ─── Match proposal + composed view ─────────────────────────────────────────

const CandidateConsiderationSchema = z.object({
  library_entry_id: z.string().min(1),
  library_entry_version: z.number().int().min(1),
  decision: CandidateDecision,
  rationale: z.string().min(1),
  matched_tags: z.array(z.string()),
  rejection_reason_code: z.string().nullable(),
  rejection_reason_label: z.string().nullable(),
})

const GuidedMatchProposalSchema = z.object({
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

export const GuidedMatchProposalViewSchema = z.object({
  schema_version: z.literal("guided_match_proposal_view.v1"),
  scope: GuidedScopeSchema,
  generated_at: z.string().min(1),
  proposal: GuidedMatchProposalSchema,
  library_entry: StrategyLibraryEntrySchema,
  disclosure: DisclosureVersionSchema,
  retention: RetentionPolicySchema,
  migration: ContractMigrationMetadataSchema,
})

// ─── Enrollment ─────────────────────────────────────────────────────────────

const DisclosureAcceptanceSnapshotSchema = z.object({
  disclosure_version_id: z.string().min(1),
  accepted_at: z.string().min(1),
  accepted_by_actor_id: z.string().min(1),
  idempotency_key: z.string().min(1),
})

const BrokerCapabilitySnapshotSchema = z.object({
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

export const GuidedEnrollmentSchema = z.object({
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

// ─── Events ─────────────────────────────────────────────────────────────────

const GuidedEventProvenanceSchema = z.object({
  enrollment_id: z.string().nullable(),
  library_entry_id: z.string().nullable(),
  library_entry_version: z.number().int().nullable(),
  backing_record_id: z.string().nullable(),
  execution_manifest_id: z.string().nullable(),
  strategy_parameters_hash: z.string().nullable(),
})

const GuidedEventSchema = z.object({
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
  quantity: z.number().nullable(),
  broker_order_id: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  retention: RetentionPolicySchema,
  migration: ContractMigrationMetadataSchema,
})

export const EnrollmentEventsViewSchema = z.object({
  schema_version: z.literal("enrollment_events_view.v1"),
  scope: GuidedScopeSchema,
  generated_at: z.string().min(1),
  events: z.array(GuidedEventSchema),
  retention: RetentionPolicySchema,
  migration: ContractMigrationMetadataSchema,
})

// ─── Read model (enrollment view) ───────────────────────────────────────────

const GuidedHoldingViewSchema = z.object({
  symbol: z.string().min(1),
  asset_type: z.string().min(1),
  quantity: z.number(),
  market_value_usd: z.number(),
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

const GuidedNotificationIntentSchema = z.object({
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

export const GuidedEnrollmentViewSchema = z.object({
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
  current_value_usd: z.number().nullable(),
  cash_value_usd: z.number().nullable(),
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
