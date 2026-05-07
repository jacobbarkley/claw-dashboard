// Stage 2 mocks — every fixture conforms to the frozen Phase 0 contract
// shapes. Field names match guided.py exactly. The mocks are CANDIDATE-only,
// internal-preview-only, and non-public by construction.

import type {
  ContractMigrationMetadata,
  DisclosureVersion,
  EnrollmentEventsView,
  GuidedEnrollment,
  GuidedEnrollmentView,
  GuidedEvent,
  GuidedEvidenceRecord,
  GuidedMatchProposal,
  GuidedMatchProposalView,
  GuidedNotificationIntent,
  Questionnaire,
  RetentionPolicy,
  StrategyLibraryEntry,
} from "./types"

const NOW = "2026-05-07T15:30:00Z"
const ANCHOR = "2026-05-07T15:30:00Z"

const PUBLIC_STATIC_RETENTION: RetentionPolicy = {
  retention_class: "PUBLIC_STATIC",
  delete_behavior: "TOMBSTONE",
  contains_user_data: false,
  contains_broker_data: false,
  contains_regulated_data: false,
}

const USER_STATE_RETENTION: RetentionPolicy = {
  retention_class: "USER_STATE",
  delete_behavior: "TOMBSTONE",
  contains_user_data: true,
  contains_broker_data: true,
  contains_regulated_data: true,
}

const USER_PROPOSAL_RETENTION: RetentionPolicy = {
  retention_class: "USER_STATE",
  delete_behavior: "TOMBSTONE",
  contains_user_data: true,
  contains_broker_data: false,
  contains_regulated_data: true,
}

function migration(name: string): ContractMigrationMetadata {
  return {
    introduced_in_schema_version: name,
    compatible_from_schema_version: name,
    migration_policy: "ADDITIVE_ONLY",
  }
}

const SCOPE = {
  user_id: "jacob",
  account_id: "paper_main",
  strategy_group_id: "default",
}

// ─── Evidence (5-axis, never collapsed) ─────────────────────────────────────

const BENCH_EVIDENCE: GuidedEvidenceRecord = {
  evidence_id: "evidence_bench_steady_tide_001",
  evidence_type: "BENCH_MULTI_ERA",
  freshness: {
    last_evaluated_at: "2026-04-11T16:00:00Z",
    data_window_start: "2022-01-01T00:00:00Z",
    data_window_end: "2026-03-31T23:59:00Z",
    staleness_policy: "flag_after_30_days",
  },
  sample_size: 247,
  regime_coverage: ["CALM", "VOLATILE"],
  broker_realism: "SIMULATED",
  fill_realism: "SPREAD_AWARE_SIMULATED",
  source_refs: {
    bench_report:
      "backtest/campaigns/q076b_regime_aware_momentum_opt_02/results/2026-04-11-q076b-regime-opt-02/campaign_summary.json",
  },
  notes: ["Frozen-confirmation strategy variant", "5 bps slippage assumed"],
}

const SHADOW_EVIDENCE: GuidedEvidenceRecord = {
  evidence_id: "evidence_shadow_steady_tide_001",
  evidence_type: "SHADOW_FORWARD_OBSERVED",
  freshness: {
    last_evaluated_at: NOW,
    data_window_start: "2026-04-15T00:00:00Z",
    data_window_end: NOW,
    staleness_policy: "flag_after_3_days",
  },
  sample_size: 22,
  regime_coverage: ["CALM"],
  broker_realism: "NONE",
  fill_realism: "NONE",
  source_refs: { shadow_log: "state/rebuild_history/shadow_signals.jsonl" },
  notes: ["Live-time signal observation, no fills"],
}

const PAPER_FORWARD_EVIDENCE: GuidedEvidenceRecord = {
  evidence_id: "evidence_paper_forward_steady_tide_001",
  evidence_type: "PAPER_FORWARD_PROMOTED",
  freshness: {
    last_evaluated_at: NOW,
    data_window_start: "2026-05-04T00:00:00Z",
    data_window_end: NOW,
    staleness_policy: "flag_after_1_day",
  },
  sample_size: 8,
  regime_coverage: ["CALM"],
  broker_realism: "PAPER_BROKER",
  fill_realism: "PAPER_FILLS",
  source_refs: { paper_log: "state/rebuild_latest/execution_report.json" },
  notes: ["3 paper-trading sessions so far. This is cold-start data."],
}

// ─── Library entry ──────────────────────────────────────────────────────────

export const MOCK_STEADY_TIDE_CANDIDATE: StrategyLibraryEntry = {
  schema_version: "strategy_library_entry.v1",
  library_entry_id: "steady_tide_internal",
  library_entry_version: 1,
  status: "CANDIDATE",
  sleeve: "STOCKS",
  mandate: "TACTICAL_PARTIAL",
  mandate_subtitle: "Tactical equity strategy",
  friendly_name: "Steady Tide",
  plain_english_thesis:
    "Trades a small set of large-cap US stocks when momentum aligns with a supportive market regime. Holds each position up to 15 days, exits on stop or target. Rest of your capital parks in short-term Treasury ETFs while waiting.",
  drawdown_headline: "Bench max drawdown was 8.9% over the evaluated window.",
  risk_summary: "Low single-position sizing with 5% stop, 15% target, and ~15-day max hold.",
  holding_period_typical_label: "~5–15 days per trade",
  trade_frequency_typical_label: "~2–4 trades per month",
  asset_class_label: "US equities",
  coverage_tags: [
    "conservative_drawdown",
    "balanced_risk",
    "us_equities",
    "multi_week_horizon",
    "tactical_partial",
    "paper_internal",
  ],
  backing_strategy: {
    backing_record_id: "regime_aware_momentum::stop_5_target_15",
    strategy_id: "regime_aware_momentum",
    variant_id: "stop_5_target_15",
    passport_role_id: "STOCKS_BROAD_MOMENTUM",
    execution_manifest_id: "q076b_regime_aware_momentum_frozen_reference.paper_v1",
    execution_manifest_path:
      "backtest/bench/manifests/q076b_regime_aware_momentum_frozen_reference.execution_manifest.json",
    strategy_parameters_hash: "sha256:placeholder_for_preview",
  },
  disclosure_version_id: "disc_steady_tide_v1",
  evidence: [BENCH_EVIDENCE, SHADOW_EVIDENCE, PAPER_FORWARD_EVIDENCE],
  admission: {
    promoted: false,
    disclosed: false,
    evidence_typed: false,
    mandate_stated: false,
    broker_capability_checked: false,
    operator_approved: false,
    approved_by: null,
    approved_at: null,
  },
  retention: PUBLIC_STATIC_RETENTION,
  migration: migration("strategy_library_entry.v1"),
}

// ─── Disclosure ─────────────────────────────────────────────────────────────

export const MOCK_DISCLOSURE_STEADY_TIDE_V1: DisclosureVersion = {
  schema_version: "disclosure_version.v1",
  disclosure_version_id: "disc_steady_tide_v1",
  library_entry_id: "steady_tide_internal",
  library_entry_version: 1,
  version_label: "v1",
  change_classification: "MATERIAL",
  plain_english_thesis: MOCK_STEADY_TIDE_CANDIDATE.plain_english_thesis,
  mandate_disclosure_paragraph:
    "Steady Tide is not a full equity allocator. It deploys 5–30% of your stock allotment based on regime, and parks the rest in short-term Treasury ETFs while waiting. This is intentional. The strategy is a tactical participation strategy, not an attempt to be fully invested.",
  drawdown_headline: "Bench max drawdown was 8.9% over the evaluated window. It could be worse.",
  drawdown_headline_pct: 8.9,
  drawdown_headline_period_label: "in any rolling period",
  paper_live_distinction:
    "This internal preview runs only in paper mode. No real money is at risk. We're practicing with simulated capital.",
  not_guaranteed_copy:
    "Past performance does not guarantee future results. The strategy could lose money. The drawdown above is what we've observed in testing — real conditions could be worse.",
  what_you_accept_bullets: [
    "Steady Tide can buy and sell US equities on your paper account",
    "Cash that isn't deployed parks in short-term Treasury ETFs (SGOV)",
    "Each position has a 5% stop loss, 15% target, and ~15-day max hold",
    "You can pause or stop at any time",
  ],
  required_attestation_text:
    "I've read the above. I understand this is paper trading, the strategy can lose money, and past performance is not a guarantee.",
  evidence_summary: [BENCH_EVIDENCE, SHADOW_EVIDENCE, PAPER_FORWARD_EVIDENCE],
  technical_details: [
    {
      section_id: "backing_strategy",
      title: "Backing strategy",
      body:
        "regime_aware_momentum :: stop_5_target_15. Manifest q076b...frozen_reference. Strategy version v0.1. Matcher v1.0. Questionnaire v1.0.",
      required: false,
    },
    {
      section_id: "rejection_rationale",
      title: "Other strategies considered",
      body:
        "BTC Managed Exposure — declined; crypto preference not selected. Defensive Value Proxy — declined; sample size too small under the multi-era gate.",
      required: false,
    },
  ],
  technical_details_payload: {
    backing_record_id: "regime_aware_momentum::stop_5_target_15",
    execution_manifest_id: "q076b_regime_aware_momentum_frozen_reference.paper_v1",
    strategy_parameters: {
      stop_loss_pct: 5.0,
      target_pct: 15.0,
      max_hold_days: 15,
    },
  },
  effective_at: "2026-05-01T00:00:00Z",
  created_at: "2026-05-01T00:00:00Z",
  created_by: "operator_jacob",
  consent_expires_at: "2027-05-01T00:00:00Z",
  reaffirmation_due_at: "2026-11-01T00:00:00Z",
  supersedes_disclosure_version_id: null,
  retention: PUBLIC_STATIC_RETENTION,
  migration: migration("disclosure_version.v1"),
}

// ─── Questionnaire ──────────────────────────────────────────────────────────

export const MOCK_QUESTIONNAIRE_V1: Questionnaire = {
  schema_version: "questionnaire.v1",
  questionnaire_id: "guided_onboarding",
  version: "v1",
  title: "Guided onboarding",
  questions: [
    {
      key: "risk_profile",
      sequence: 1,
      text: "How much market movement are you comfortable seeing?",
      why_we_ask_text:
        "This helps separate conservative, balanced, and risk-on strategy matches.",
      answer_options: [
        { option_id: "conservative", label: "Conservative", matcher_value: "CONSERVATIVE", matcher_tags: ["conservative_drawdown"] },
        { option_id: "balanced", label: "Balanced", matcher_value: "BALANCED", matcher_tags: ["balanced_risk"] },
        { option_id: "risk_on", label: "Risk-on", matcher_value: "RISK_ON", matcher_tags: ["risk_on"] },
      ],
    },
    {
      key: "drawdown_tolerance",
      sequence: 2,
      text: "How would you feel if your account dropped 20% in a single month?",
      why_we_ask_text:
        "People often overestimate their tolerance until they see the number.",
      answer_options: [
        { option_id: "hold_wait", label: "I'd hold and wait it out", matcher_value: "HIGH_DRAWDOWN_TOLERANCE", matcher_tags: ["risk_on"] },
        { option_id: "uncomfortable_stay", label: "I'd be uncomfortable but stay", matcher_value: "CONSERVATIVE_DRAWDOWN", matcher_tags: ["conservative_drawdown"] },
        { option_id: "cut_losses", label: "I'd want to cut losses quickly", matcher_value: "LOW_DRAWDOWN_TOLERANCE", matcher_tags: ["conservative_drawdown"] },
      ],
    },
    {
      key: "asset_class_preference",
      sequence: 3,
      text: "Which sleeve do you want this paper strategy to practice with?",
      why_we_ask_text: "Guided v1 creates one paper enrollment at a time.",
      answer_options: [
        { option_id: "us_equities", label: "US equities", matcher_value: "STOCKS", matcher_tags: ["us_equities"] },
        { option_id: "crypto", label: "Crypto", matcher_value: "CRYPTO", matcher_tags: ["crypto"] },
      ],
    },
    {
      key: "time_horizon",
      sequence: 4,
      text: "How long should a typical trade last?",
      why_we_ask_text: "Holding period changes which strategy evidence is relevant.",
      answer_options: [
        { option_id: "multi_week", label: "A few days to a few weeks", matcher_value: "MULTI_WEEK", matcher_tags: ["multi_week_horizon"] },
        { option_id: "long_term", label: "Months or longer", matcher_value: "LONG_TERM", matcher_tags: ["long_term"] },
      ],
    },
  ],
  retention: PUBLIC_STATIC_RETENTION,
  migration: migration("questionnaire.v1"),
}

// ─── Match proposal ─────────────────────────────────────────────────────────

export const MOCK_MATCH_PROPOSAL: GuidedMatchProposal = {
  schema_version: "guided_match_proposal.v1",
  scope: SCOPE,
  proposal_id: "proposal_steady_tide_001",
  status: "PENDING_ACCEPTANCE",
  questionnaire_version: "guided_onboarding.v1",
  matcher_version: "rules_matcher.v1",
  questionnaire_answers_snapshot: [
    { question_key: "risk_profile", option_id: "balanced", matcher_value: "BALANCED", answered_at: NOW },
    { question_key: "drawdown_tolerance", option_id: "uncomfortable_stay", matcher_value: "CONSERVATIVE_DRAWDOWN", answered_at: NOW },
    { question_key: "asset_class_preference", option_id: "us_equities", matcher_value: "STOCKS", answered_at: NOW },
    { question_key: "time_horizon", option_id: "long_term", matcher_value: "LONG_TERM", answered_at: NOW },
  ],
  matched_library_entry_id: "steady_tide_internal",
  matched_library_entry_version: 1,
  disclosure_version_id: "disc_steady_tide_v1",
  considered_candidates: [
    {
      library_entry_id: "steady_tide_internal",
      library_entry_version: 1,
      decision: "SELECTED",
      rationale: "Selected by deterministic rules from questionnaire coverage tags.",
      matched_tags: [
        "balanced_risk",
        "conservative_drawdown",
        "us_equities",
      ],
      rejection_reason_code: null,
      rejection_reason_label: null,
    },
    {
      library_entry_id: "btc_overlay",
      library_entry_version: 1,
      decision: "REJECTED",
      rationale: "User did not select crypto.",
      matched_tags: [],
      rejection_reason_code: "ASSET_CLASS_NOT_SELECTED",
      rejection_reason_label: "Crypto was not selected as a preferred asset class.",
    },
    {
      library_entry_id: "defensive_value_proxy",
      library_entry_version: 1,
      decision: "REJECTED",
      rationale: "Sample size below admission threshold.",
      matched_tags: [],
      rejection_reason_code: "SAMPLE_TOO_SMALL",
      rejection_reason_label: "Bench sample size was below the multi-era admission threshold.",
    },
  ],
  match_quality_score: 0.75,
  matched_answer_keys: ["risk_profile", "drawdown_tolerance", "asset_class_preference"],
  mismatched_answer_keys: ["time_horizon"],
  source_failure_id: null,
  created_at: NOW,
  expires_at: "2026-05-14T15:30:00Z",
  accepted_at: null,
  declined_at: null,
  superseded_by_proposal_id: null,
  decline_reason: null,
  retention: USER_PROPOSAL_RETENTION,
  migration: migration("guided_match_proposal.v1"),
}

// ─── Composed match-proposal view (Codex backend Audit 0.5 patch) ───────────
// Mirrors GuidedMatchProposalView from models/guided.py:546. Phase 6 wires
// the S3 surface to a single composed read instead of "fetch three."

export const MOCK_MATCH_PROPOSAL_VIEW: GuidedMatchProposalView = {
  schema_version: "guided_match_proposal_view.v1",
  scope: SCOPE,
  generated_at: NOW,
  proposal: MOCK_MATCH_PROPOSAL,
  library_entry: MOCK_STEADY_TIDE_CANDIDATE,
  disclosure: MOCK_DISCLOSURE_STEADY_TIDE_V1,
  retention: USER_PROPOSAL_RETENTION,
  migration: migration("guided_match_proposal_view.v1"),
}

// ─── Enrollment fixtures (one per state for the broker flow) ────────────────

const ACCEPTANCE_SNAPSHOT = {
  disclosure_version_id: "disc_steady_tide_v1",
  accepted_at: "2026-05-07T15:35:00Z",
  accepted_by_actor_id: "jacob",
  idempotency_key: "jacob:accept_match:proposal_steady_tide_001:session_001",
}

function buildEnrollment(
  status: GuidedEnrollment["status"],
  brokerOverride: Partial<GuidedEnrollment["broker_capabilities"]> = {},
  extras: Partial<GuidedEnrollment> = {},
): GuidedEnrollment {
  const baseBroker: GuidedEnrollment["broker_capabilities"] = {
    status: "VERIFIED",
    checked_at: "2026-05-07T15:36:00Z",
    broker_adapter: "alpaca_equities",
    broker_connection_id: "alpaca_paper_conn_001",
    broker_account_ref: "alpaca_paper_acct_001",
    environment: "PAPER",
    supported_sleeves: ["STOCKS"],
    failure_state: null,
    failure_reason_code: null,
    failure_human_label: null,
    failure_reason: null,
    remediation_steps: [],
    external_link: null,
    ...brokerOverride,
  }

  const base: GuidedEnrollment = {
    schema_version: "guided_enrollment.v1",
    scope: SCOPE,
    enrollment_id: "enrollment_steady_tide_001",
    proposal_id: "proposal_steady_tide_001",
    status,
    environment: "PAPER",
    library_entry_id: "steady_tide_internal",
    library_entry_version: 1,
    backing_record_id: "regime_aware_momentum::stop_5_target_15",
    execution_manifest_id: "q076b_regime_aware_momentum_frozen_reference.paper_v1",
    strategy_parameters_hash: "sha256:placeholder_for_preview",
    matcher_version: "rules_matcher.v1",
    disclosure_acceptance: ACCEPTANCE_SNAPSHOT,
    broker_capabilities: baseBroker,
    backing_strategy_state: "CURRENT",
    created_at: "2026-05-07T15:35:00Z",
    activated_at: status === "ACTIVE" ? "2026-05-07T15:37:00Z" : null,
    paused_at: null,
    ended_at: null,
    retention: USER_STATE_RETENTION,
    migration: migration("guided_enrollment.v1"),
    ...extras,
  }
  return base
}

export const MOCK_ENROLLMENT_PENDING_BROKER = buildEnrollment("ACCEPTED_PENDING_BROKER", {
  status: "CHECKING",
  checked_at: null,
  broker_adapter: "alpaca_equities",
  broker_connection_id: "alpaca_paper_conn_001",
  broker_account_ref: "alpaca_paper_acct_001",
})

export const MOCK_ENROLLMENT_ACTIVE = buildEnrollment("ACTIVE")

export const MOCK_ENROLLMENT_BROKER_RETRYABLE = buildEnrollment(
  "BROKER_RETRYABLE",
  {
    status: "FAILED",
    checked_at: "2026-05-07T15:36:00Z",
    broker_adapter: "alpaca_equities",
    broker_connection_id: "alpaca_paper_conn_001",
    broker_account_ref: null,
    failure_state: "BROKER_RETRYABLE",
    failure_reason_code: "API_TIMEOUT",
    failure_human_label: "Broker connection timed out",
    failure_reason: "Alpaca /v2/account did not respond within the timeout window.",
    remediation_steps: [],
    external_link: null,
  },
  { activated_at: null },
)

export const MOCK_ENROLLMENT_BROKER_ACTION_REQUIRED = buildEnrollment(
  "BROKER_ACTION_REQUIRED",
  {
    status: "FAILED",
    checked_at: "2026-05-07T15:36:00Z",
    broker_adapter: "alpaca_equities",
    broker_connection_id: "alpaca_paper_conn_001",
    broker_account_ref: "alpaca_paper_acct_001",
    failure_state: "BROKER_ACTION_REQUIRED",
    failure_reason_code: "PAPER_EQUITIES_DISABLED",
    failure_human_label: "Paper-equities trading is not enabled on this account",
    failure_reason: "Alpaca account permissions do not include paper-equities.",
    remediation_steps: [
      "Open the Alpaca dashboard.",
      "Settings → Account → Trading permissions.",
      "Enable paper-equities trading.",
      "Return here and tap 'I've fixed it'.",
    ],
    external_link: "https://app.alpaca.markets/paper/dashboard/overview",
  },
  { activated_at: null },
)

export const MOCK_ENROLLMENT_BROKER_INELIGIBLE = buildEnrollment(
  "BROKER_INELIGIBLE",
  {
    status: "FAILED",
    checked_at: "2026-05-07T15:36:00Z",
    broker_adapter: "alpaca_equities",
    broker_connection_id: "alpaca_paper_conn_001",
    broker_account_ref: "alpaca_paper_acct_001",
    failure_state: "BROKER_INELIGIBLE",
    failure_reason_code: "CASH_ONLY_ACCOUNT",
    failure_human_label: "This account is cash-only and Steady Tide assumes margin availability",
    failure_reason: "Account type is cash-only; the strategy assumes day-trading buying power for short windows.",
    remediation_steps: [],
    external_link: null,
  },
  { activated_at: null },
)

// ─── Events fixture (every lane represented) ────────────────────────────────

const PROVENANCE = {
  enrollment_id: "enrollment_steady_tide_001",
  library_entry_id: "steady_tide_internal",
  library_entry_version: 1,
  backing_record_id: "regime_aware_momentum::stop_5_target_15",
  execution_manifest_id: "q076b_regime_aware_momentum_frozen_reference.paper_v1",
  strategy_parameters_hash: "sha256:placeholder_for_preview",
}

type RequiredEventFields = Pick<
  GuidedEvent,
  "event_id" | "kind" | "source" | "actor_type" | "actor_id" | "reason_code" | "reason" | "occurred_at" | "audit_visibility"
>

function buildEvent(partial: Partial<GuidedEvent> & RequiredEventFields): GuidedEvent {
  const defaults = {
    schema_version: "guided_event.v1" as const,
    scope: SCOPE,
    reason_label: null,
    user_notified: null,
    provenance: PROVENANCE,
    symbol: null,
    asset_type: null,
    side: "NONE" as const,
    quantity: null,
    broker_order_id: null,
    payload: {},
    retention: USER_STATE_RETENTION,
    migration: migration("guided_event.v1"),
  }
  return { ...defaults, ...partial }
}

void ANCHOR

export const MOCK_EVENTS: GuidedEvent[] = [
  buildEvent({
    event_id: "event_disclosure_accepted",
    occurred_at: "2026-05-04T13:29:00Z",
    kind: "CONSENT",
    source: "manual_action",
    actor_type: "USER",
    actor_id: "jacob",
    reason_code: "DISCLOSURE_ACCEPTED",
    reason: "User accepted disclosure_version disc_steady_tide_v1",
    reason_label: "Disclosure accepted",
    audit_visibility: "USER_VISIBLE",
  }),
  buildEvent({
    event_id: "event_enrollment_active",
    occurred_at: "2026-05-04T13:30:00Z",
    kind: "STATE_CHANGE",
    source: "system",
    actor_type: "SYSTEM",
    actor_id: "guided_runtime",
    reason_code: "ENROLLMENT_ACTIVE",
    reason: "Broker paper capability was verified and the enrollment became active.",
    reason_label: "Enrollment active",
    audit_visibility: "USER_VISIBLE",
    user_notified: false,
  }),
  buildEvent({
    event_id: "event_cash_park_001",
    occurred_at: "2026-05-05T13:15:00Z",
    kind: "HOLDINGS_CHANGE",
    source: "cash_management",
    actor_type: "SYSTEM",
    actor_id: "cash_management_runtime",
    reason_code: "CASH_PARK",
    reason: "Idle capital reserve",
    reason_label: "Idle capital parked",
    audit_visibility: "USER_VISIBLE",
    symbol: "SGOV",
    asset_type: "EQUITY",
    side: "BUY",
    quantity: 6,
  }),
  buildEvent({
    event_id: "event_strategy_buy_aapl_001",
    occurred_at: "2026-05-06T15:45:00Z",
    kind: "HOLDINGS_CHANGE",
    source: "strategy_execution",
    actor_type: "SYSTEM",
    actor_id: "strategy_runtime",
    reason_code: "MOMENTUM_SIGNAL_REGIME_CALM",
    reason: "Momentum signal · regime CALM",
    reason_label: "Momentum signal · regime CALM",
    audit_visibility: "USER_VISIBLE",
    symbol: "AAPL",
    asset_type: "EQUITY",
    side: "BUY",
    quantity: 5,
    broker_order_id: "alpaca_paper_order_aapl_001",
  }),
  buildEvent({
    event_id: "event_protective_avgo_001",
    occurred_at: "2026-05-06T12:00:00Z",
    kind: "HOLDINGS_CHANGE",
    source: "portfolio_action",
    actor_type: "SYSTEM",
    actor_id: "portfolio_action_runtime",
    reason_code: "MAX_HOLD_DAYS_REACHED",
    reason: "Holding period ended",
    reason_label: "Holding period ended",
    audit_visibility: "USER_VISIBLE",
    symbol: "AVGO",
    asset_type: "EQUITY",
    side: "SELL",
    quantity: 3,
    broker_order_id: "alpaca_paper_order_avgo_001",
  }),
  buildEvent({
    event_id: "event_protective_meta_001",
    occurred_at: "2026-04-30T13:30:00Z",
    kind: "HOLDINGS_CHANGE",
    source: "portfolio_action",
    actor_type: "SYSTEM",
    actor_id: "portfolio_action_runtime",
    reason_code: "STOP_PRICE_BREACHED",
    reason: "Stop loss triggered",
    reason_label: "Stop loss triggered",
    audit_visibility: "USER_VISIBLE",
    symbol: "META",
    asset_type: "EQUITY",
    side: "SELL",
    quantity: 2,
    broker_order_id: "alpaca_paper_order_meta_001",
  }),
  buildEvent({
    event_id: "event_broker_confirmation_aapl_001",
    occurred_at: "2026-05-06T15:45:30Z",
    kind: "HOLDINGS_CHANGE",
    source: "broker_confirmation",
    actor_type: "SYSTEM",
    actor_id: "alpaca_webhook",
    reason_code: "ORDER_FILLED",
    reason: "Order filled at $321.37 (paper)",
    reason_label: "Order filled at $321.37 (paper)",
    audit_visibility: "USER_VISIBLE",
    symbol: "AAPL",
    asset_type: "EQUITY",
    side: "BUY",
    quantity: 5,
    broker_order_id: "alpaca_paper_order_aapl_001",
  }),
  buildEvent({
    event_id: "event_support_001",
    occurred_at: "2026-05-07T16:13:00Z",
    kind: "SUPPORT_INTERVENTION",
    source: "support_intervention",
    actor_type: "OPERATOR",
    actor_id: "operator_jacob",
    reason_code: "COMPLIANCE_REVIEW",
    reason: "Held for compliance review while we re-validate the disclosure version.",
    reason_label: "Held for compliance review",
    audit_visibility: "USER_VISIBLE",
    user_notified: true,
  }),
]

export const MOCK_EVENTS_VIEW: EnrollmentEventsView = {
  schema_version: "enrollment_events_view.v1",
  scope: SCOPE,
  generated_at: NOW,
  events: MOCK_EVENTS,
  retention: USER_STATE_RETENTION,
  migration: migration("enrollment_events_view.v1"),
}

// ─── Notifications + pending actions ────────────────────────────────────────

const MOCK_NOTIFICATIONS: GuidedNotificationIntent[] = [
  {
    schema_version: "notification_intent.v1",
    notification_id: "notification_paper_started_001",
    scope: SCOPE,
    created_at: "2026-05-04T13:30:00Z",
    trigger_event_id: "event_enrollment_active",
    notification_type: "STATE_CHANGE",
    title: "Paper trading is running",
    body: "Your internal paper enrollment is active. We'll keep you posted as the strategy operates.",
    target_enrollment_id: "enrollment_steady_tide_001",
    target_proposal_id: null,
    requires_user_action: false,
    action_type: null,
    retention: USER_STATE_RETENTION,
    migration: migration("notification_intent.v1"),
  },
]

// ─── Read-model projection ──────────────────────────────────────────────────

export const MOCK_ENROLLMENT_VIEW_ACTIVE: GuidedEnrollmentView = {
  schema_version: "guided_enrollment_view.v1",
  scope: SCOPE,
  generated_at: NOW,
  library_entry: MOCK_STEADY_TIDE_CANDIDATE,
  proposal: { ...MOCK_MATCH_PROPOSAL, status: "ACCEPTED", accepted_at: "2026-05-04T13:29:00Z" },
  enrollment: MOCK_ENROLLMENT_ACTIVE,
  disclosure: MOCK_DISCLOSURE_STEADY_TIDE_V1,
  disclosure_state: "NORMAL",
  evidence: [BENCH_EVIDENCE, SHADOW_EVIDENCE, PAPER_FORWARD_EVIDENCE],
  holdings: [
    {
      symbol: "AAPL",
      asset_type: "EQUITY",
      holding_role: "STRATEGY_POSITION",
      quantity: 5,
      market_value_usd: 1427,
      unrealized_pnl_usd: -179,
    },
    {
      symbol: "NVDA",
      asset_type: "EQUITY",
      holding_role: "STRATEGY_POSITION",
      quantity: 7,
      market_value_usd: 1440,
      unrealized_pnl_usd: -165,
    },
    {
      symbol: "SGOV",
      asset_type: "EQUITY",
      holding_role: "CASH_RESERVE",
      quantity: 511,
      market_value_usd: 51325,
      unrealized_pnl_usd: 0,
    },
  ],
  current_value_usd: 54192,
  cash_value_usd: 51325,
  paper_observation_days_count: 3,
  cumulative_paper_pnl_realized: -2640,
  cumulative_paper_pnl_unrealized: -345,
  recent_events: MOCK_EVENTS.slice(-5),
  pending_user_actions: [],
  notifications: MOCK_NOTIFICATIONS,
  events_view: MOCK_EVENTS_VIEW,
  retention: USER_STATE_RETENTION,
  migration: migration("guided_enrollment_view.v1"),
}

export const MOCK_ENROLLMENT_VIEW_NOTICE_PENDING: GuidedEnrollmentView = {
  ...MOCK_ENROLLMENT_VIEW_ACTIVE,
  disclosure_state: "NOTICE_PENDING",
  pending_user_actions: [
    {
      action_id: "pending_acknowledge_notice_001",
      action_type: "acknowledge_notice",
      reason_code: "DISCLOSURE_NOTICE_AVAILABLE",
      reason_label: "A clearer wording of the existing thesis is available. No re-acceptance needed.",
      due_at: "2026-06-07T00:00:00Z",
    },
  ],
}
