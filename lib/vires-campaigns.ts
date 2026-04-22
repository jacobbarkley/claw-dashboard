// Bench Campaigns — shared types + pure utilities. No Node built-ins here so
// client components can import these freely. Server-only loaders live in
// `./vires-campaigns.server.ts` and read manifests off disk.
//
// Source of truth for shapes:
//   design_handoff_vires_capital/campaigns/DATA_PRIMER.md   (v1)
//   design_handoff_vires_capital/campaigns/PRIMER_v2_campaign_contract.md   (v2)

// ─── Types ─────────────────────────────────────────────────────────────────

export type Sleeve = "STOCKS" | "OPTIONS" | "CRYPTO"
export type CampaignStatus = "EXPLORING" | "CONVERGING" | "MONITORED" | "PROMOTED" | string
export type CandidateRole = "LEADER" | "CHALLENGER" | "PROMOTED_REFERENCE" | string
export type ChangeKind =
  | "LEADER_CHANGED"
  | "PROMOTION_REFERENCE_ADDED"
  | "CANDIDATE_ADDED"
  | "BENCHMARK_UPDATED"
  | "CANDIDATE_RETIRED"
  | string
export type Actor = "codex" | "claude" | "user" | "openclaw" | string

export interface RunStatsEra {
  label: string
  pass: boolean
}

export interface RunStats {
  period?: { start: string; end: string; trading_days?: number | null }
  eras?: RunStatsEra[]
  eras_passed?: number | null
  eras_total?: number | null
  total_return_pct?: number | null
  benchmark_return_pct?: number | null
  excess_return_pct?: number | null
  max_drawdown_pct?: number | null
  benchmark_max_drawdown_pct?: number | null
  sharpe?: number | null
  benchmark_sharpe?: number | null
  sortino?: number | null
  calmar?: number | null
  profit_factor?: number | null
  win_rate_pct?: number | null
  trades?: number | null
}

export type RunStatsStatus = "INDEXED" | "NOT_INDEXED" | "NO_RUN" | null

export interface LatestRun {
  run_id: string | null
  completed_at: string | null
  summary: string | null
  result_summary_path?: string | null
  run_stats?: RunStats | null
  run_stats_status?: RunStatsStatus
}

export interface Candidate {
  candidate_id: string
  title: string
  family_id: string
  role: CandidateRole
  artifact_kind?: string | null
  artifact_refs?: Record<string, string | null> | null
  latest_run: LatestRun
  notes?: string[] | null
}

export interface FamilyGroup {
  family_id: string
  title: string
  summary: string
}

export interface RunnerUpGap {
  metric?: string | null
  value?: number | null
  summary?: string | null
}

export interface RecencySignals {
  last_leader_change_at?: string | null
  leader_stability_sessions?: number | null
  runner_up_candidate_id?: string | null
  runner_up_gap?: RunnerUpGap | null
  last_param_sweep_at?: string | null
  days_since_param_sweep?: number | null
}

export interface ChangeLogEvent {
  at: string
  kind: ChangeKind
  title: string
  detail?: string | null
  actor: Actor
  candidate_id?: string | null
  from_candidate_id?: string | null
  to_candidate_id?: string | null
}

// v2 — wire-in contract (optional while Codex is producing)
export type BaselineKind = "PROMOTED_REFERENCE" | "FROZEN_REFERENCE" | "NONE"

export interface BaselineBlock {
  kind: BaselineKind
  candidate_id: string | null
  strategy_name: string | null
  strategy_id: string | null
  variant: string | null
  why: string | null
}

export interface BaselinePerformance extends RunStats {
  evaluation_window?: { start: string; end: string; trading_days?: number | null }
  source?: {
    kind: "PASSPORT" | "RESULT_BUNDLE" | "CHECKED_IN" | string
    passport_id?: string | null
    bundle_path?: string | null
    generated_at?: string | null
  } | null
}

export type LeaderComparisonStatus = "AHEAD" | "MIXED" | "NOT_YET_AHEAD" | "INSUFFICIENT_EVIDENCE"

export interface LeaderComparisonToBaseline {
  leader_candidate_id: string | null
  evaluation_window?: { start: string; end: string; trading_days?: number | null }
  return_delta_pct?: number | null
  excess_delta_pct?: number | null
  sharpe_delta?: number | null
  drawdown_delta_pct?: number | null
  eras_pass_delta?: number | null
  status: LeaderComparisonStatus
  summary: string
}

export type CampaignPressureStatus =
  | "BASELINE_CLEARLY_AHEAD"
  | "CHALLENGER_WITHIN_STRIKING_DISTANCE"
  | "LEADER_NOT_YET_QUALITY_GATED"
  | "LEADER_APPROACHING_PROMOTION"
  | "NEEDS_FRESH_RUNS"
  | "EXPLORATORY"

export interface CampaignPressure {
  status: CampaignPressureStatus
  summary: string
  as_of: string
}

// ─── Promotion readiness (Passport v2 spec §4) ─────────────────────────────
// Per-campaign scorecard of promotion gates. Backend emits this on every
// campaign refresh / run completion. Frontend renders a live scorecard;
// promote button lights only when overall_status is READY_TO_NOMINATE.

export type GateStatus = "PASS" | "FAIL" | "PENDING" | "INCONCLUSIVE"
export type GateSourceKind = "VALIDATION_GATE" | "BENCH_AGGREGATE"

export interface ReadinessGate {
  gate_id: string
  label: string
  status: GateStatus
  source_kind: GateSourceKind
  value?: number | null
  threshold?: number | null
  summary?: string | null
}

export type OverallReadinessStatus = "READY_TO_NOMINATE" | "BLOCKED" | "PARTIAL"

export interface Readiness {
  gates: ReadinessGate[]
  overall_status: OverallReadinessStatus
  blockers: string[]
  as_of: string
}

export type PromotionTargetAction = "CREATE_NEW" | "REPLACE_EXISTING"

export interface PromotionReadiness {
  schema_version?: string
  origin_candidate_id: string | null
  passport_role_id: string | null
  target_action?: PromotionTargetAction
  supersedes_record_id?: string | null
  readiness: Readiness | null
}

export interface ProductionLinkHistoryEntry {
  record_id: string
  stage: string
  at: string
  event: string
}

export interface ProductionLinks {
  active_record_id: string | null
  passport_role_id: string | null
  history: ProductionLinkHistoryEntry[]
}

export interface PromotionEvent {
  event_id: string
  event_type: string
  at: string
  actor: Actor
  campaign_id?: string | null
  candidate_id?: string | null
  passport_role_id?: string | null
  target_action?: PromotionTargetAction | null
  supersedes_record_id?: string | null
  notes?: string | null
}

export interface CampaignManifest {
  schema_version: "bench_campaign_manifest.v1" | "bench_campaign_manifest.v2" | string
  campaign_id: string
  title: string
  sleeve: Sleeve | string
  objective: string
  benchmark_symbol: string
  status: CampaignStatus
  summary: string
  updated_at: string
  updated_by: Actor
  current_leader_candidate_id: string | null
  last_run_at?: string | null
  last_meaningful_change_at?: string | null
  last_meaningful_change?: string | null
  promotion_target?: string | null
  recency_signals: RecencySignals
  family_groups: FamilyGroup[]
  candidates: Candidate[]
  change_log: ChangeLogEvent[]

  // v2 (optional until Codex ships)
  baseline?: BaselineBlock | null
  baseline_performance?: BaselinePerformance | null
  leader_comparison_to_baseline?: LeaderComparisonToBaseline | null
  campaign_pressure?: CampaignPressure | null

  // Passport v2 §4 — promotion readiness scorecard (optional until Codex ships)
  promotion_readiness?: PromotionReadiness | null
  production_links?: ProductionLinks | null
  promotion_events?: PromotionEvent[] | null
}

export interface CampaignRegistryEntry {
  campaign_id: string
  title: string
  sleeve: Sleeve | string
  status: CampaignStatus
  manifest_path: string
}

export interface CampaignRegistry {
  schema_version: string
  generated_at: string
  campaigns: CampaignRegistryEntry[]
}

export interface CampaignsIndexData {
  registry: CampaignRegistry
  campaigns: CampaignManifest[]
}

// ─── Derived helpers (v1→v2 graceful fallback) ─────────────────────────────

// Returns the best available performance block for the campaign's baseline.
// Preference order:
//   1. v2 campaign.baseline_performance (Codex's target shape)
//   2. v1 leader candidate's latest_run.run_stats when INDEXED
//   3. null — UI renders the honest empty state
export function resolveBaselinePerformance(c: CampaignManifest): BaselinePerformance | null {
  if (c.baseline_performance) return c.baseline_performance
  const leader = c.candidates.find(x => x.candidate_id === c.current_leader_candidate_id)
  if (leader?.latest_run?.run_stats_status === "INDEXED" && leader.latest_run.run_stats) {
    const stats = leader.latest_run.run_stats
    const period = stats.period
    const source: BaselinePerformance["source"] = leader.latest_run.result_summary_path
      ? {
          kind: "RESULT_BUNDLE",
          bundle_path: leader.latest_run.result_summary_path,
          generated_at: leader.latest_run.completed_at ?? null,
        }
      : null
    return {
      ...stats,
      evaluation_window: period
        ? { start: period.start, end: period.end, trading_days: period.trading_days ?? null }
        : undefined,
      source,
    }
  }
  return null
}

// Tells the UI which "empty state" to render when there's no performance data.
// Mirrors the prototype's three honest states so the wording stays consistent.
export type BaselinePerformanceState =
  | { kind: "present"; data: BaselinePerformance }
  | { kind: "not_indexed"; resultSummaryPath: string | null }
  | { kind: "no_run" }
  | { kind: "none" }

export function baselinePerformanceState(c: CampaignManifest): BaselinePerformanceState {
  const data = resolveBaselinePerformance(c)
  if (data) return { kind: "present", data }
  const leader = c.candidates.find(x => x.candidate_id === c.current_leader_candidate_id)
  const status = leader?.latest_run?.run_stats_status
  if (status === "NOT_INDEXED") {
    return { kind: "not_indexed", resultSummaryPath: leader?.latest_run?.result_summary_path ?? null }
  }
  if (status === "NO_RUN") return { kind: "no_run" }
  return { kind: "none" }
}

// v2-only helpers — return null until Codex wires the backend.
export function getCampaignPressure(c: CampaignManifest): CampaignPressure | null {
  return c.campaign_pressure ?? null
}

export function getLeaderComparison(c: CampaignManifest): LeaderComparisonToBaseline | null {
  return c.leader_comparison_to_baseline ?? null
}

export function getPromotionReadiness(c: CampaignManifest): PromotionReadiness | null {
  return c.promotion_readiness ?? null
}

export function getBaseline(c: CampaignManifest): BaselineBlock | null {
  if (c.baseline) return c.baseline
  // Synthesize a v1-equivalent baseline block from the leader candidate
  // (when that candidate's role is PROMOTED_REFERENCE). This keeps the UI
  // consistent while Codex is producing the real v2 block.
  const leader = c.candidates.find(x => x.candidate_id === c.current_leader_candidate_id)
  if (leader?.role === "PROMOTED_REFERENCE") {
    return {
      kind: "PROMOTED_REFERENCE",
      candidate_id: leader.candidate_id,
      strategy_name: leader.title,
      strategy_id: null,
      variant: null,
      why: leader.latest_run?.summary ?? null,
    }
  }
  return null
}

export function countsBySleeve(campaigns: CampaignManifest[]): Record<string, number> & { ALL: number } {
  const out: Record<string, number> = { STOCKS: 0, OPTIONS: 0, CRYPTO: 0 }
  for (const c of campaigns) {
    const k = c.sleeve?.toUpperCase?.() ?? "UNKNOWN"
    out[k] = (out[k] ?? 0) + 1
  }
  return { ...out, ALL: campaigns.length }
}

export function statusCounts(campaigns: CampaignManifest[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of campaigns) {
    const s = (c.status ?? "UNKNOWN").toUpperCase()
    out[s] = (out[s] ?? 0) + 1
  }
  return out
}
