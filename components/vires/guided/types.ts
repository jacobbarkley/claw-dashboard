// Stage 2 mocked previews — TypeScript mirror of the frozen Phase 0 contracts
// in trading-bot src/openclaw_core/models/guided.py.
//
// These types exist so the mocks can be type-checked against the contract
// shape without inventing new vocabulary. When Codex's backend emits real
// projections, the read-side fetch swaps into these same types.
//
// IMPORTANT: do not drift from guided.py. If the UX needs a field these
// types don't carry, that's "Stage 2 contract friction" for Audit 0.5,
// not a permission to extend the type here.

export type GuidedSleeve = "STOCKS" | "OPTIONS" | "CRYPTO" | "PREDICTIONS"
export type BrokerEnvironment = "PAPER" | "LIVE"
export type LibraryEntryStatus = "CANDIDATE" | "ACTIVE" | "PAUSED" | "DEPRECATED" | "RETIRED"
export type LibraryMandate = "FULL_ALLOCATOR" | "TACTICAL_PARTIAL" | "CORE_SATELLITE" | "OVERLAY" | "TBD"
export type ChangeClassification = "MATERIAL" | "NOTICE_ONLY" | "COSMETIC"

export type EvidenceType =
  | "BACKTEST"
  | "SHADOW_FORWARD_OBSERVED"
  | "BENCH_MULTI_ERA"
  | "PAPER_FORWARD_SANDBOX"
  | "PAPER_FORWARD_PROMOTED"
  | "LIVE_OBSERVED"

export type BrokerRealism = "NONE" | "SIMULATED" | "PAPER_BROKER" | "LIVE_BROKER"
export type FillRealism = "NONE" | "MIDPOINT_SIMULATED" | "SPREAD_AWARE_SIMULATED" | "PAPER_FILLS" | "LIVE_FILLS"

export type ProposalStatus = "PENDING_ACCEPTANCE" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "SUPERSEDED"
export type CandidateDecision = "SELECTED" | "REJECTED"

export type EnrollmentStatus =
  | "ACCEPTED_PENDING_BROKER"
  | "ACTIVE"
  | "PAUSED"
  | "STOP_HOLD_TO_CLOSE"
  | "STOP_LIQUIDATE"
  | "BROKER_RETRYABLE"
  | "BROKER_ACTION_REQUIRED"
  | "BROKER_INELIGIBLE"
  | "ENDED"

export type BackingStrategyState =
  | "CURRENT"
  | "UPGRADE_AVAILABLE"
  | "UNDER_REVIEW"
  | "DEPRECATED"
  | "FORCED_EXIT_PENDING"
  | "NO_LONGER_SUPPORTED"

export type BrokerCapabilityStatus = "NOT_CHECKED" | "CHECKING" | "VERIFIED" | "FAILED"
export type BrokerFailureState = "BROKER_RETRYABLE" | "BROKER_ACTION_REQUIRED" | "BROKER_INELIGIBLE"
export type DisclosureState = "NORMAL" | "NOTICE_PENDING" | "REAFFIRMATION_DUE" | "RE_ACCEPTANCE_REQUIRED"

export type GuidedCommandType =
  | "accept_match"
  | "decline_match"
  | "request_rematch"
  | "request_re_questionnaire"
  | "start_enrollment"
  | "pause_enrollment"
  | "resume_enrollment"
  | "retry_broker_setup"
  | "stop_hold_to_close"
  | "stop_liquidate"
  | "accept_upgrade"
  | "acknowledge_notice"
  | "reaffirm_consent"

export type GuidedActorType = "USER" | "OPERATOR" | "SYSTEM"
export type SystemEventType = "broker_capability_lost" | "suspend_for_capability_loss" | "notify"
export type AuditVisibility = "USER_VISIBLE" | "INTERNAL_ONLY"

export type GuidedEventSource =
  | "strategy_execution"
  | "portfolio_action"
  | "cash_management"
  | "broker_confirmation"
  | "manual_action"
  | "support_intervention"
  | "system"
  | "crypto"
  | "options"

export type GuidedEventKind =
  | "STATE_CHANGE"
  | "HOLDINGS_CHANGE"
  | "BROKER_CONFIRMATION"
  | "CONSENT"
  | "NOTICE"
  | "SUPPORT_INTERVENTION"
  | "SYSTEM"
export type GuidedHoldingRole = "STRATEGY_POSITION" | "CASH_RESERVE" | "OTHER"

export type RetentionClass =
  | "PUBLIC_STATIC"
  | "USER_STATE"
  | "CONSENT_RECORD"
  | "BROKER_REFERENCE"
  | "ANONYMIZED_AGGREGATE"
export type DeleteBehavior = "DELETE" | "TOMBSTONE" | "RETAIN_FOR_AUDIT" | "ANONYMIZE"

// ─── Shared metadata ────────────────────────────────────────────────────────

export interface ContractMigrationMetadata {
  introduced_in_schema_version: string
  compatible_from_schema_version: string
  migration_policy: "ADDITIVE_ONLY" | "VERSION_BUMP_REQUIRED" | "DUAL_WRITE_REQUIRED"
}

export interface RetentionPolicy {
  retention_class: RetentionClass
  delete_behavior: DeleteBehavior
  contains_user_data: boolean
  contains_broker_data: boolean
  contains_regulated_data: boolean
}

export interface GuidedScope {
  user_id: string
  account_id: string
  strategy_group_id: string
}

// ─── Evidence ───────────────────────────────────────────────────────────────

export interface EvidenceFreshness {
  last_evaluated_at: string
  data_window_start: string
  data_window_end: string
  staleness_policy: string
}

export interface GuidedEvidenceRecord {
  evidence_id: string
  evidence_type: EvidenceType
  freshness: EvidenceFreshness
  sample_size: number | null
  regime_coverage: string[]
  broker_realism: BrokerRealism
  fill_realism: FillRealism
  source_refs: Record<string, string>
  notes: string[]
}

// ─── Questionnaire ──────────────────────────────────────────────────────────

export interface QuestionnaireAnswerOption {
  option_id: string
  label: string
  matcher_value: string
  matcher_tags: string[]
}

export interface QuestionnaireQuestion {
  key: string
  sequence: number
  text: string
  why_we_ask_text: string
  answer_options: QuestionnaireAnswerOption[]
}

export interface Questionnaire {
  schema_version: "questionnaire.v1"
  questionnaire_id: string
  version: string
  title: string
  questions: QuestionnaireQuestion[]
  retention: RetentionPolicy
  migration: ContractMigrationMetadata
}

export interface QuestionnaireAnswerSnapshot {
  question_key: string
  option_id: string
  matcher_value: string
  answered_at: string | null
}

// ─── Backing strategy / library ─────────────────────────────────────────────

export interface BackingStrategyRef {
  backing_record_id: string
  strategy_id: string
  variant_id: string
  passport_role_id: string | null
  execution_manifest_id: string
  execution_manifest_path: string | null
  strategy_parameters_hash: string
}

export interface LibraryAdmissionGate {
  promoted: boolean
  disclosed: boolean
  evidence_typed: boolean
  mandate_stated: boolean
  broker_capability_checked: boolean
  operator_approved: boolean
  approved_by: string | null
  approved_at: string | null
}

export interface StrategyLibraryEntry {
  schema_version: "strategy_library_entry.v1"
  library_entry_id: string
  library_entry_version: number
  status: LibraryEntryStatus
  sleeve: GuidedSleeve
  mandate: LibraryMandate
  mandate_subtitle: string
  friendly_name: string
  plain_english_thesis: string
  drawdown_headline: string
  risk_summary: string
  holding_period_typical_label: string
  trade_frequency_typical_label: string
  asset_class_label: string
  coverage_tags: string[]
  backing_strategy: BackingStrategyRef
  disclosure_version_id: string
  evidence: GuidedEvidenceRecord[]
  admission: LibraryAdmissionGate
  retention: RetentionPolicy
  migration: ContractMigrationMetadata
}

export interface StrategyLibrary {
  schema_version: "strategy_library.v1"
  generated_at: string
  entries: StrategyLibraryEntry[]
  retention: RetentionPolicy
  migration: ContractMigrationMetadata
}

// ─── Disclosure ─────────────────────────────────────────────────────────────

export interface DisclosureSection {
  section_id: string
  title: string
  body: string
  required: boolean
}

export interface DisclosureVersion {
  schema_version: "disclosure_version.v1"
  disclosure_version_id: string
  library_entry_id: string
  library_entry_version: number
  version_label: string
  change_classification: ChangeClassification
  plain_english_thesis: string
  mandate_disclosure_paragraph: string
  drawdown_headline: string
  drawdown_headline_pct: number
  drawdown_headline_period_label: string
  paper_live_distinction: string
  not_guaranteed_copy: string
  what_you_accept_bullets: string[]
  required_attestation_text: string
  evidence_summary: GuidedEvidenceRecord[]
  technical_details: DisclosureSection[]
  technical_details_payload: Record<string, unknown>
  effective_at: string
  created_at: string
  created_by: string
  consent_expires_at: string | null
  reaffirmation_due_at: string | null
  supersedes_disclosure_version_id: string | null
  retention: RetentionPolicy
  migration: ContractMigrationMetadata
}

// ─── Match proposal ─────────────────────────────────────────────────────────

export interface CandidateConsideration {
  library_entry_id: string
  library_entry_version: number
  decision: CandidateDecision
  rationale: string
  matched_tags: string[]
  rejection_reason_code: string | null
  rejection_reason_label: string | null
}

export interface GuidedMatchProposal {
  schema_version: "guided_match_proposal.v1"
  scope: GuidedScope
  proposal_id: string
  status: ProposalStatus
  questionnaire_version: string
  matcher_version: string
  questionnaire_answers_snapshot: QuestionnaireAnswerSnapshot[]
  matched_library_entry_id: string
  matched_library_entry_version: number
  disclosure_version_id: string
  considered_candidates: CandidateConsideration[]
  match_quality_score: number
  matched_answer_keys: string[]
  mismatched_answer_keys: string[]
  source_failure_id: string | null
  created_at: string
  expires_at: string | null
  accepted_at: string | null
  declined_at: string | null
  superseded_by_proposal_id: string | null
  decline_reason: string | null
  retention: RetentionPolicy
  migration: ContractMigrationMetadata
}

// ─── Enrollment ─────────────────────────────────────────────────────────────

export interface DisclosureAcceptanceSnapshot {
  disclosure_version_id: string
  accepted_at: string
  accepted_by_actor_id: string
  idempotency_key: string
}

export interface BrokerCapabilitySnapshot {
  status: BrokerCapabilityStatus
  checked_at: string | null
  broker_adapter: string | null
  broker_connection_id: string | null
  broker_account_ref: string | null
  environment: BrokerEnvironment
  supported_sleeves: GuidedSleeve[]
  failure_state: BrokerFailureState | null
  failure_reason_code: string | null
  failure_human_label: string | null
  failure_reason: string | null
  remediation_steps: string[]
  external_link: string | null
}

export interface GuidedEnrollment {
  schema_version: "guided_enrollment.v1"
  scope: GuidedScope
  enrollment_id: string
  proposal_id: string
  status: EnrollmentStatus
  environment: BrokerEnvironment
  library_entry_id: string
  library_entry_version: number
  backing_record_id: string
  execution_manifest_id: string
  strategy_parameters_hash: string
  matcher_version: string
  disclosure_acceptance: DisclosureAcceptanceSnapshot
  broker_capabilities: BrokerCapabilitySnapshot
  backing_strategy_state: BackingStrategyState
  created_at: string
  activated_at: string | null
  paused_at: string | null
  ended_at: string | null
  retention: RetentionPolicy
  migration: ContractMigrationMetadata
}

// ─── Events ─────────────────────────────────────────────────────────────────

export interface GuidedEventProvenance {
  enrollment_id: string | null
  library_entry_id: string | null
  library_entry_version: number | null
  backing_record_id: string | null
  execution_manifest_id: string | null
  strategy_parameters_hash: string | null
}

export interface GuidedEvent {
  schema_version: "guided_event.v1"
  event_id: string
  scope: GuidedScope
  occurred_at: string
  kind: GuidedEventKind
  source: GuidedEventSource
  actor_type: GuidedActorType
  actor_id: string
  reason_code: string
  reason: string
  reason_label: string | null
  audit_visibility: AuditVisibility
  user_notified: boolean | null
  provenance: GuidedEventProvenance
  symbol: string | null
  asset_type: string | null
  side: "BUY" | "SELL" | "NONE"
  quantity: number | null
  broker_order_id: string | null
  payload: Record<string, unknown>
  retention: RetentionPolicy
  migration: ContractMigrationMetadata
}

export interface EnrollmentEventsView {
  schema_version: "enrollment_events_view.v1"
  scope: GuidedScope
  generated_at: string
  events: GuidedEvent[]
  retention: RetentionPolicy
  migration: ContractMigrationMetadata
}

export interface GuidedMatchProposalView {
  schema_version: "guided_match_proposal_view.v1"
  scope: GuidedScope
  generated_at: string
  proposal: GuidedMatchProposal
  library_entry: StrategyLibraryEntry
  disclosure: DisclosureVersion
  retention: RetentionPolicy
  migration: ContractMigrationMetadata
}

// ─── Read model ─────────────────────────────────────────────────────────────

export interface GuidedHoldingView {
  symbol: string
  asset_type: string
  holding_role: GuidedHoldingRole
  quantity: number
  market_value_usd: number
  unrealized_pnl_usd: number | null
}

export interface GuidedPendingUserAction {
  action_id: string
  action_type: GuidedCommandType
  reason_code: string
  reason_label: string
  due_at: string | null
}

export interface GuidedNotificationIntent {
  schema_version: "notification_intent.v1"
  notification_id: string
  scope: GuidedScope
  created_at: string
  trigger_event_id: string
  notification_type: "STATE_CHANGE" | "USER_ACTION_REQUIRED" | "NOTICE" | "BROKER_ACTION_REQUIRED"
  title: string
  body: string
  target_enrollment_id: string | null
  target_proposal_id: string | null
  requires_user_action: boolean
  action_type: GuidedCommandType | null
  retention: RetentionPolicy
  migration: ContractMigrationMetadata
}

export interface GuidedEnrollmentView {
  schema_version: "guided_enrollment_view.v1"
  scope: GuidedScope
  generated_at: string
  library_entry: StrategyLibraryEntry
  proposal: GuidedMatchProposal | null
  enrollment: GuidedEnrollment | null
  disclosure: DisclosureVersion
  disclosure_state: DisclosureState
  evidence: GuidedEvidenceRecord[]
  holdings: GuidedHoldingView[]
  current_value_usd: number | null
  cash_value_usd: number | null
  paper_observation_days_count: number
  cumulative_paper_pnl_realized: number | null
  cumulative_paper_pnl_unrealized: number | null
  recent_events: GuidedEvent[]
  pending_user_actions: GuidedPendingUserAction[]
  notifications: GuidedNotificationIntent[]
  events_view: EnrollmentEventsView
  retention: RetentionPolicy
  migration: ContractMigrationMetadata
}
