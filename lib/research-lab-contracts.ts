// Research Lab — TypeScript contracts.
//
// Regenerated from trading-bot/docs/architecture-rebuild/33-research-lab-contracts.md
// (commit 0514fdd on codex/research-lab-phase0). Keep this file in lockstep
// with that source — it is the only way the dashboard authors shapes that
// downstream code can trust.
//
// Do NOT extend these types with fields the contracts doc doesn't declare.
// If a new field is needed, it lands in 33-research-lab-contracts.md first;
// this file follows.

// ─── Scope ─────────────────────────────────────────────────────────────────

export interface ScopeTriple {
  user_id: string
  account_id: string
  strategy_group_id: string
}

// ─── Enums ─────────────────────────────────────────────────────────────────

export type ResearchSleeve = "STOCKS" | "CRYPTO" | "OPTIONS"

export type IdeaStatus =
  | "DRAFT"
  | "READY"
  | "QUEUED"
  | "ACTIVE"
  | "SHELVED"
  | "RETIRED"

export type IdeaSource = "CONVERSATION" | "MANUAL" | "IMPORTED"

export type StrategyRefKind = "NONE" | "SPEC_PENDING" | "REGISTERED"

export type SpecAuthoringMode = "AI_DRAFTED" | "OPERATOR_DRAFTED"

export type StrategySpecState =
  | "DRAFTING"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "IMPLEMENTING"
  | "REGISTERED"
  | "REJECTED"
  | "SUPERSEDED"

export type SpecImplementationQueueState =
  | "QUEUED"
  | "CLAIMED"
  | "IMPLEMENTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"

// Phase 1a/1b allowed job states. CANCELLED is reserved but not exercised
// until Phase 1c.
export type JobState =
  | "QUEUED"
  | "COMPILING"
  | "RUNNING"
  | "POST_PROCESSING"
  | "DONE"
  | "FAILED"
  | "RETRY_QUEUED"
  | "CANCELLED"

export type JobPhase = "compile" | "grid_sweep" | "validate" | "summarize"

export type Submitter =
  | "USER_ONDEMAND"
  | "AUTOPILOT_NIGHTLY"
  | "API"
  | "AI_TRIAGE"

export type ExecutionIntent = "FULL_CAMPAIGN" | "DRY_RUN"

export type Priority = "LOW" | "NORMAL" | "HIGH"

export type AdapterStatus =
  | "WIRED"
  | "CODE_COMPLETE_UNWIRED"
  | "NOT_IMPLEMENTED"

export type ReadinessOverallStatus =
  | "READY_TO_NOMINATE"
  | "MONITORED"
  | "BLOCKED"
  | "EMPTY_STATE"

export type ReadinessGateStatus =
  | "PASS"
  | "FAIL"
  | "PENDING"
  | "INCONCLUSIVE"
  | "BLOCKED"

export type NominationState = "PENDING" | "APPLIED" | "REJECTED"

export type NominationIdentityMode = "NEW_RECORD" | "REPLACE_EXISTING"

export type PlateauAnalysis =
  | "STABLE"
  | "LUCKY_PEAK"
  | "MIXED"
  | "INSUFFICIENT_EVIDENCE"

// ─── Provenance ─────────────────────────────────────────────────────────────

export interface ResearchLabProvenance {
  conversation_id?: string | null
  commit_sha?: string | null
  notes?: string | null
}

// ─── idea.v1 ────────────────────────────────────────────────────────────────

export interface IdeaPromotionTarget {
  passport_role_id: string
  target_action: "NEW_RECORD" | "REPLACE_EXISTING"
  supersedes_record_id?: string | null
}

export interface IdeaV1 extends ScopeTriple {
  schema_version: "research_lab.idea.v1"
  idea_id: string
  title: string
  thesis: string
  sleeve: ResearchSleeve
  /** Registry join key — MUST match backtest/bench/strategy_registry.json. */
  strategy_id: string
  status: IdeaStatus
  created_at: string
  created_by: string
  source: IdeaSource
  params: Record<string, unknown>
  /** Descriptive only; strategy_id is the authoritative join. */
  strategy_family?: string | null
  tags?: string[] | null
  provenance?: ResearchLabProvenance | null
  /** §12.3 trigger #1 — flag to force rollup on the first DONE job. */
  promote_to_campaign?: boolean
  /** §12.4.a — optional at idea-authoring, operator can fill via the
   *  campaign detail "Assign promotion slot" action post-hoc. When
   *  absent, Nominate remains disabled on the spawned campaign. */
  promotion_target?: IdeaPromotionTarget | null
  /** Dashboard-side capture surface — operator authored an idea before
   *  any strategy code exists. strategy_id holds a sentinel value;
   *  submit-to-lab is blocked. Forms the inbox for Talon V1 (or manual
   *  Codex implementation). When the strategy lands, the idea's
   *  strategy_id is updated to the registered name and code_pending is
   *  cleared. */
  code_pending?: boolean
}

// ─── idea.v2 / strategy_spec.v1 ────────────────────────────────────────────

export interface StrategyRefV2 {
  kind: StrategyRefKind
  active_spec_id?: string | null
  /** Only meaningful while kind === REGISTERED during a re-spec. */
  pending_spec_id?: string | null
  strategy_id?: string | null
  preset_id?: string | null
}

export interface ReferenceStrategy {
  /** Registered strategy this idea derives from. Lineage/context only. */
  strategy_id: string
  /** Operator note describing the intended delta from the parent. */
  delta_note?: string | null
}

export interface IdeaV2 extends ScopeTriple {
  schema_version: "research_lab.idea.v2"
  idea_id: string
  title: string
  thesis: string
  sleeve: ResearchSleeve
  tags?: string[] | null
  params: Record<string, unknown>
  /**
   * Parent strategies this idea derives from. This never routes execution;
   * strategy_ref remains the authoritative pointer for this idea's own code.
   */
  reference_strategies?: ReferenceStrategy[] | null
  strategy_ref: StrategyRefV2
  status: IdeaStatus
  /** Operator intent flag, only meaningful when strategy_ref.kind === NONE. */
  needs_spec?: boolean
  created_at: string
  created_by: string
  source: IdeaSource
  provenance?: ResearchLabProvenance | null
  promote_to_campaign?: boolean
  promotion_target?: IdeaPromotionTarget | null
}

export interface StrategySpecV1 extends ScopeTriple {
  schema_version: "research_lab.strategy_spec.v1"
  spec_id: string
  spec_version: number
  idea_id: string
  created_at: string
  authoring_mode: SpecAuthoringMode
  authored_by: string
  state: StrategySpecState
  signal_logic: string
  universe: Record<string, unknown>
  entry_rules: string
  exit_rules: string
  risk_model: Record<string, unknown>
  sweep_params: Record<string, unknown>
  required_data: string[]
  benchmark?: string | null
  acceptance_criteria: Record<string, unknown>
  candidate_strategy_family?: string | null
  implementation_notes?: string | null
  parent_spec_id?: string | null
  registered_strategy_id?: string | null
  /** Phase E approval metadata. Optional for pre-approval/backfilled specs. */
  approved_at?: string | null
  approved_by?: string | null
  /** Executable preset created by the implementation loop. */
  preset_id?: string | null
  /**
   * How this strategy will be judged once it runs.
   *
   * Optional for legacy/backfilled specs, but required before a spec can move
   * into AWAITING_APPROVAL or APPROVED in the v2 Lab flow.
   */
  experiment_plan?: ExperimentPlanV1 | null
}

export type ExperimentPlanIssueSeverity = "error" | "warn"
export type RunnableEraStatus = "AVAILABLE" | "INCOMPLETE_DATA" | "UNAVAILABLE"
export type ExperimentDataRequirementStatus = "AVAILABLE" | "PARTIAL" | "MISSING"
export type ExperimentEraMode = "single" | "multi"
export type BenchmarkComparisonMode = "absolute" | "deployment_matched" | "both"

export interface ExperimentPlanValidityIssue {
  field_id: string
  severity: ExperimentPlanIssueSeverity
  message: string
}

export interface ExperimentPlanBenchmark {
  symbol: string
  comparison_mode: BenchmarkComparisonMode
}

export interface ExperimentPlanWindows {
  requested_start: string
  requested_end: string
  fresh_data_required_from?: string | null
}

export interface ExperimentPlanDateRange {
  start: string
  end: string
}

export interface RunnableEraRef {
  era_id: string
  label: string
  date_range: ExperimentPlanDateRange
  status: RunnableEraStatus
  reason?: string | null
}

export interface ExperimentPlanEras {
  mode: ExperimentEraMode
  required_era_ids: string[]
}

export interface ExperimentPlanDataRequirement {
  capability_id: string
  required: boolean
  status: ExperimentDataRequirementStatus
  status_at_draft: ExperimentDataRequirementStatus
  purpose?: string | null
}

export interface ExperimentPlanEvidenceThresholds {
  minimum_trade_count: number
  minimum_evaluated_trading_days: number
}

export interface ExperimentPlanDecisiveVerdictRules {
  pass: string
  inconclusive: string
  fail: string
}

export interface ExperimentPlanV1 {
  schema_version: "research_lab.experiment_plan.v1"
  spec_id: string
  idea_id: string
  is_valid: boolean
  validity_reasons: ExperimentPlanValidityIssue[]
  benchmark: ExperimentPlanBenchmark
  windows: ExperimentPlanWindows
  runnable_eras: RunnableEraRef[]
  eras: ExperimentPlanEras
  data_requirements: ExperimentPlanDataRequirement[]
  evidence_thresholds: ExperimentPlanEvidenceThresholds
  decisive_verdict_rules: ExperimentPlanDecisiveVerdictRules
  known_limitations: string[]
}

export interface SpecImplementationQueueV1 extends ScopeTriple {
  schema_version: "research_lab.spec_implementation_queue.v1"
  queue_entry_id: string
  spec_id: string
  spec_version: number
  idea_id: string
  state: SpecImplementationQueueState
  queued_at: string
  queued_by: string
  claimed_at?: string | null
  claimed_by?: string | null
  attempts: number
  implementation_started_at?: string | null
  implementation_finished_at?: string | null
  implementation_commit?: string | null
  registered_strategy_id?: string | null
  preset_id?: string | null
  last_error?: string | null
  last_error_at?: string | null
  cancelled_at?: string | null
  cancelled_by?: string | null
  cancel_reason?: string | null
}

export interface SpecAuditEventV1 {
  event_id: string
  spec_id: string
  ts: string
  actor_kind: "operator" | "worker" | "system"
  actor_id: string
  transition: {
    from: StrategySpecState | null
    to: StrategySpecState
  }
  context: {
    dashboard_commit?: string | null
    implementation_commit?: string | null
    queue_entry_id?: string | null
    message?: string | null
  }
}

/** In-memory adapter shape used while v1 YAML and v2 YAML coexist. */
export interface IdeaArtifact extends IdeaV2 {
  /** Compatibility value for existing UI consumers; derived from strategy_ref. */
  strategy_id: string
  /** Joined at read-time from preset metadata; never persisted on idea.v2. */
  strategy_family?: string | null
  /** Compatibility value for the old code-pending shell. */
  code_pending: boolean
}

// ─── preset.v1 ──────────────────────────────────────────────────────────────

export interface PresetParamSchemaEntry {
  type: "enum_decimal" | "enum_int" | "enum_string" | "named_universe"
  units?: string | null
  default?: unknown
  options?: unknown[] | null
}

export interface PresetBounds {
  max_sweep_size: number
  max_era_windows: number
  max_wallclock_minutes: number
}

export interface PresetV1 {
  schema_version: "research_lab.preset.v1"
  preset_id: string
  display_name: string
  /** Phase tag for the preset surface (e.g. "1a", "1b"). */
  phase: string
  sleeve: ResearchSleeve
  /** Registry join key — MUST match backtest/bench/strategy_registry.json. */
  strategy_id: string
  strategy_family: string
  /** Must match one entry in registry `campaign_presets[].preset_id`. */
  source_registry_preset_id: string
  description: string
  param_schema: Record<string, PresetParamSchemaEntry>
  bounds: PresetBounds
  /** Compiler materializes the base campaign envelope from this block. */
  base_experiment: Record<string, unknown>
  notes?: string[] | null
}

export interface PresetIndexEntry {
  preset_id: string
  display_name: string
  phase: string
  sleeve: ResearchSleeve
  strategy_id: string
  strategy_family: string
  path: string
}

export interface PresetIndexV1 {
  schema_version: "research_lab.preset_index.v1"
  presets: PresetIndexEntry[]
}

// ─── campaign_request.v1 ────────────────────────────────────────────────────

export interface CampaignRequestV1 extends ScopeTriple {
  schema_version: "research_lab.campaign_request.v1"
  request_id: string
  /** Preallocated by the submitter. */
  job_id: string
  idea_id: string
  actor: string
  submitted_at: string
  submitted_by: Submitter
  preset_id: string
  /** Keys MUST be declared in the preset's param_schema. */
  param_sweep: Record<string, unknown[]>
  execution_intent: ExecutionIntent
  priority: Priority
  notes?: string | null
}

// ─── job_pending.v1 ─────────────────────────────────────────────────────────
//
// Transport-only receipt returned by the submit route. Not canonical queue
// state; not persisted in SQLite. The dashboard renders this until the
// worker materializes the first real job.v1 projection.

export interface JobPendingV1 extends ScopeTriple {
  schema_version: "research_lab.job_pending.v1"
  request_id: string
  job_id: string
  submitted_at: string
  submitted_by: Submitter
  state: "PENDING_ENQUEUE"
  summary: string
}

// ─── bench_bundle.v1 ────────────────────────────────────────────────────────

export interface BenchBundleValidation {
  compiler_checks_passed: boolean
  strategy_family_valid: boolean
  param_sweep_bounded: boolean
  universe_resolved: boolean
}

export interface BenchBundleV1 extends ScopeTriple {
  schema_version: "research_lab.bench_bundle.v1"
  bundle_id: string
  job_id: string
  request_id: string
  idea_id: string
  generated_at: string
  compiler_version: string
  /** The only artifact the executor actually runs. App never authors this. */
  bench_manifest: Record<string, unknown>
  validation: BenchBundleValidation
}

// ─── job.v1 ─────────────────────────────────────────────────────────────────

export interface JobProgress {
  variants_complete: number
  variants_total: number
  phase: JobPhase
}

export interface JobV1 extends ScopeTriple {
  schema_version: "research_lab.job.v1"
  /** Row primary key — preallocated via campaign_request.job_id. */
  job_id: string
  /** UNIQUE — enforces idempotent enqueue on duplicate request replay. */
  request_id: string
  state: JobState
  created_at: string
  updated_at: string
  /** Echoed from campaign_request.v1 — optional per spec, present in real runs. */
  idea_id?: string | null
  preset_id?: string | null
  bundle_id?: string | null
  executor_id?: string | null
  started_at?: string | null
  finished_at?: string | null
  heartbeat_at?: string | null
  progress?: JobProgress | null
  retry_count?: number | null
  retry_eligible_after?: string | null
  result_id?: string | null
  error_code?: string | null
  error?: string | null
}

// ─── result.v1 ──────────────────────────────────────────────────────────────

export interface ResultVariantMetrics {
  total_return_pct?: number | null
  sharpe_ratio?: number | null
  sortino_ratio?: number | null
  calmar_ratio?: number | null
  max_drawdown_pct?: number | null
  win_rate_pct?: number | null
  profit_factor?: number | null
  trades?: number | null
}

export interface ResultVariant {
  variant_id: string
  params: Record<string, unknown>
  metrics: ResultVariantMetrics
  era_scores?: number[] | null
  rank?: number | null
  winner?: boolean | null
}

export interface ResultBenchmark {
  symbol: string
  total_return_pct?: number | null
  sharpe_ratio?: number | null
}

export interface ResultV1 extends ScopeTriple {
  schema_version: "research_lab.result.v1"
  result_id: string
  job_id: string
  idea_id: string
  sleeve: ResearchSleeve
  completed_at: string
  variants: ResultVariant[]
  plateau_analysis: PlateauAnalysis
  plateau_spread?: number | null
  benchmark?: ResultBenchmark | null
  /** AI-filled from Phase 4; null until then. */
  interpretation_summary?: string | null
  /** Repo-relative pointer to the equity_swarm.v1 artifact for this result. */
  equity_swarm_artifact?: ResultArtifactRef | null
  /** Backtest evaluation window — informative; not a constraint Codex enforces. */
  evaluation_window?: ResultEvaluationWindow | null
}

export interface ResultArtifactRef {
  artifact_id: string
  artifact_type: string
  path: string
  description?: string | null
}

export interface ResultEvaluationWindow {
  from: string
  to: string
  days: number
}

// ─── equity_swarm.v1 ────────────────────────────────────────────────────────
//
// Per-result strategy + benchmark + per-trade equity series. Read from
// the path in `ResultV1.equity_swarm_artifact.path`. Renderer: TradeAtlas
// in components/vires/lab/equity-curve-swarm.tsx.

export interface EquitySwarmPoint {
  date: string
  value_usd: number
  value_pct: number
}

export interface EquitySwarmTrade {
  trade_id: string
  symbol: string
  side: string
  entry_date: string
  exit_date: string | null
  entry_price: number
  exit_price: number | null
  shares: number
  notional_usd_at_entry: number
  pnl_usd: number
  pnl_pct: number
  status: "OPEN" | "CLOSED"
  exit_reason: string | null
  mtm_curve: EquitySwarmPoint[]
}

export interface EquitySwarmBenchmark {
  symbol: string
  label: string
  curve: EquitySwarmPoint[]
}

export interface EquitySwarmDateRange {
  start: string
  end: string
  as_of_date: string | null
}

export interface EquitySwarmV1 extends ScopeTriple {
  schema_version: "research_lab.equity_swarm.v1"
  result_id: string
  job_id: string
  idea_id: string
  run_id: string
  campaign_id: string
  source_variant_id: string
  source_fold: string
  source_simulation_path: string
  source_dataset_path: string | null
  generated_at: string
  starting_capital_usd: number
  currency: "USD"
  date_range: EquitySwarmDateRange
  strategy_curve: EquitySwarmPoint[]
  benchmark: EquitySwarmBenchmark | null
  trades: EquitySwarmTrade[]
}

// ─── candidate.v1 ───────────────────────────────────────────────────────────

export interface ReadinessGate {
  gate_id: string
  label: string
  status: ReadinessGateStatus
  source_kind?: string | null
  value?: number | null
  threshold?: number | null
  summary?: string | null
  detail?: string | null
}

export interface ReadinessSnapshot {
  overall_status: ReadinessOverallStatus
  gates: ReadinessGate[]
  blockers?: string[] | null
  as_of?: string | null
}

export interface CandidateV1 extends ScopeTriple {
  schema_version: "research_lab.candidate.v1"
  candidate_id: string
  result_id: string
  idea_id: string
  sleeve: ResearchSleeve
  strategy_id: string
  evaluated_at: string
  adapter_status: AdapterStatus
  readiness: ReadinessSnapshot
  promotion_event_id?: string | null
  nomination_uri?: string | null
}

// ─── nomination.v1 ──────────────────────────────────────────────────────────

export interface NominationIdentityResolution {
  mode: NominationIdentityMode
  replaces_record_id?: string | null
  resolution_rule?: string | null
}

export interface NominationV1 extends ScopeTriple {
  schema_version: "research_lab.nomination.v1"
  nomination_id: string
  request_id: string
  candidate_id: string
  result_id: string
  actor: string
  submitted_at: string
  state: NominationState
  identity_resolution: NominationIdentityResolution
  /** Shape matches what the existing strategy bank already expects. */
  materialized_bank_record: Record<string, unknown>
  submitted_by?: Submitter | null
  campaign_state_on_promotion?: Record<string, unknown> | null
  promotion_event_id?: string | null
}

// ─── morning_report.v1 ──────────────────────────────────────────────────────

export interface MorningReportV1 extends ScopeTriple {
  schema_version: "research_lab.morning_report.v1"
  report_id: string
  generated_at: string
  window: { from: string; to: string }
  jobs_run: number
  by_sleeve: Record<ResearchSleeve, { jobs: number; candidates: number; promotions_proposed: number }>
  promotions_proposed: Array<Record<string, unknown>>
  strong_not_promoted: Array<Record<string, unknown>>
  interesting_findings: Array<Record<string, unknown>>
  postmortems: Array<Record<string, unknown>>
  /** Templated prose in Phase 3; AI-narrated in Phase 4. */
  narrative?: {
    opener?: string | null
    per_sleeve?: Partial<Record<ResearchSleeve, string>> | null
  } | null
}

// ─── Dashboard-side helpers ─────────────────────────────────────────────────

/**
 * Phase-0 scope default. Every UI surface that needs to render the default
 * scope without waiting for a user-selector uses this constant.
 */
export const PHASE_1_DEFAULT_SCOPE: ScopeTriple = {
  user_id: "jacob",
  account_id: "paper_main",
  strategy_group_id: "default",
}

export const CONTRACTS_SOURCE = {
  doc: "trading-bot/docs/architecture-rebuild/33-research-lab-contracts.md",
  phase_0_branch: "codex/research-lab-phase0",
  phase_0_commit: "0514fdd",
} as const
