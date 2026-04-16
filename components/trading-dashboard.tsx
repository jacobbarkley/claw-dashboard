"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import { Nav } from "@/components/nav"
import {
  ComposedChart, Line, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts"
import {
  Eye, Copy, Check, RefreshCw,
  ChevronDown, ChevronUp, Info,
  Sparkles, Send, Loader2, Trash2, X,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface Position {
  symbol: string
  qty: number
  side: string
  entry_price: number
  current_price: number
  market_value: number
  unrealized_pnl: number
  unrealized_pct: number
  change_today_pct: number
}

interface ExitCandidate {
  symbol: string
  decision: string
  urgency: string
  reason: string
  overnight_risk: string
  unrealized_pnl: number | null
  unrealized_pct: number | null
}

interface WatchlistItem {
  symbol: string
  trigger: string
  stop: string
  target: string
  modifier: string
  note: string
  in_position?: boolean
  // Optional card accent tone — callers can compute this per-symbol.
  // Not held: defaults to "medium" (champagne — optimistic candidate).
  // Held: tone based on today's performance (good/bad/medium).
  tone?: "good" | "medium" | "bad"
}

interface BpsPosition {
  spread_id: string | null
  symbol: string
  expiry: string
  short_strike: number
  long_strike: number
  width: number
  contracts: number
  collateral: number
  net_credit: number
  max_profit: number
  max_loss: number
  current_pl: number | null
  profit_pct_of_max: number | null
  dte: number
  exit_reasons: string[]
}

interface BpsTarget {
  symbol: string
  price: number | null
  sector: string
  expiry: string | null
  dte: number | null
  short_strike: number | null
  long_strike: number | null
  spread_width: number | null
  net_credit: number | null
  credit_width_ratio: number | null
  annualized_yield_pct: number | null
  max_loss_per_contract: number | null
  iv_rank_proxy: number | null
  decision: "APPROVE" | "CONDITIONAL"
  rationale: string
  selected: boolean
}

interface BpsFill {
  symbol: string
  action: string | null
  status: string | null
  expiry: string | null
  short_strike: number | null
  long_strike: number | null
  contracts: number | null
  limit_credit: number | null
  exit_reasons: string[]
}

interface BpsUniverseItem {
  symbol: string
  sector: string
  final_score: number | null
  rsi_14: number | null
  earnings_blackout: boolean
}

interface BpsData {
  as_of: string | null
  account_equity: number | null
  available_capital: number | null
  free_capital: number | null
  current_open_positions: number
  new_positions_possible: number
  max_active_positions: number
  exits_needed: string[]
  positions: BpsPosition[]
  targets: BpsTarget[]
  recent_fills: BpsFill[]
  screener_status: string | null
  scanned: number | null
  approved: number | null
  universe_watch: BpsUniverseItem[]
  universe_date: string | null
}

interface Tunables {
  trading_mode: string
  live_trading_enabled: boolean
  paper_autopilot_enabled: boolean
  max_daily_loss_pct: number
  max_risk_per_trade_pct: number
  max_aggregate_open_risk_pct: number
  max_concurrent_positions: number
  consecutive_loss_limit: number
  consecutive_loss_size_modifier: string
  reduce_only_size_cap: string
  updated_at: string
}

interface PipelineStatus {
  trading_date: string | null
  run_id: string | null
  circuit_breaker: string
  verdict: string
  critical_issues: number
  high_issues: number
  medium_issues: number
  chain_ok: boolean
  approval_path: string | null
  paper_compliant: boolean
  audit_written_at: string | null
}

interface OperatorMode {
  current_mode?: string
  effective_mode?: string
  requested_mode?: string | null
  target_paper_mode?: string
  target_live_mode?: string
  broker_environment?: string
  execution_enabled?: boolean
  approval_required?: boolean
  live_autonomous_available?: boolean
  allowed_transitions?: string[]
  last_transition_reason?: string
  applied_at?: string | null
  requested_at?: string | null
  gate_state?: {
    checkpoint05_passed?: boolean
    live_capital_enabled?: boolean
    blocking_incidents?: string[]
  }
  note?: string
}

interface OperatorModeHistoryEvent {
  event_type?: string | null
  from_mode?: string | null
  to_mode?: string | null
  requested_by?: string | null
  reason?: string | null
  timestamp?: string | null
}

interface OperatorModeHistory {
  history_window?: number
  event_count?: number
  latest_event?: OperatorModeHistoryEvent | null
  recent_events?: OperatorModeHistoryEvent[]
  note?: string | null
}

interface OperatorSession {
  run_id?: string
  phase?: string
  entry_mode?: string
  policy_version?: string
}

interface OperatorCheckpoint {
  checkpoint_status?: string
  evidence_sufficient?: boolean | null
  total_shadow_days?: number
  substantive_shadow_days?: number
  substantive_pregate_days?: number
  one_sided_days?: number
  trivial_days?: number
  avg_substantive_match?: number | null
  latest_suppression_cause?: string | null
  blocking_notes?: string[]
}

interface OperatorPlan {
  pre_gate_status?: string
  pre_gate_candidate_count?: number
  pre_gate_symbols?: string[]
  trade_plan_status?: string
  trade_plan_count?: number
  trade_plan_symbols?: string[]
  blocked_reasons?: string[]
  suppression_cause?: string | null
  narrative?: string
}

interface OperatorResearch {
  tradable_symbol_count?: number
  coverage_symbols?: string[]
  research_item_count?: number
  thesis_item_count?: number
  long_bias_count?: number
  short_bias_count?: number
  neutral_count?: number
  narrative?: string
  top_theses?: Array<{
    symbol?: string
    side_bias?: string
    confidence?: string
    catalyst_label?: string
  }>
}

interface OperatorRegime {
  vix_level?: number | null
  vix_regime?: string | null
  hmm_regime?: string | null
  jump_variation_pctile?: number | null
  notes?: string[]
  populated?: boolean
  narrative?: string
}

interface StrategyPerformanceSummary {
  verdict_reason?: string | null
  total_trades?: number | null
  evaluated_trading_days?: number | null
  total_return_pct?: number | null
  benchmark_return_pct?: number | null
  excess_return_pct?: number | null
  deployment_matched_benchmark_return_pct?: number | null
  deployment_matched_excess_return_pct?: number | null
  sharpe_ratio?: number | null
  sortino_ratio?: number | null
  calmar_ratio?: number | null
  max_drawdown_pct?: number | null
  profit_factor?: number | null
  expectancy_per_trade_usd?: number | null
  win_rate_pct?: number | null
  profitable_fold_pct?: number | null
}

interface StrategyBankRecord {
  record_id: string
  selected?: boolean
  strategy_id?: string
  variant_id?: string
  strategy_family?: string
  display_name?: string
  description?: string | null
  promotion_stage?: string | null
  signal_source?: string | null
  allowed_sides?: string[]
  symbols?: string[]
  max_positions?: number | null
  risk_pct_per_trade?: number | null
  stop_loss_pct?: number | null
  target_pct?: number | null
  max_hold_days?: number | null
  performance_summary?: StrategyPerformanceSummary | null
  notes?: string[]
  evidence?: {
    campaign_id?: string | null
    campaign_run_id?: string | null
    experiment_id?: string | null
    validation_run_id?: string | null
  } | null
}

interface StrategyBankSection {
  active_record_id?: string | null
  strategy_count?: number | null
  active?: StrategyBankRecord | null
  banked_strategies?: StrategyBankRecord[]
}

interface OperatorData {
  mode?: OperatorMode
  mode_history?: OperatorModeHistory | null
  session?: OperatorSession
  checkpoint05?: OperatorCheckpoint
  plan?: OperatorPlan
  research?: OperatorResearch
  regime?: OperatorRegime
  approval?: {
    active_count?: number
    pending_count?: number
    latest_status?: string | null
    latest_expiry?: string | null
    scope?: string | null
    plan_id?: string | null
    trade_count?: number | null
    symbols?: string[]
    gross_risk_pct?: number | null
    entry_mode?: string | null
    blocked_reasons?: string[]
    status_note?: string | null
  } | null
  strategy_bank?: StrategyBankSection | null
  incident_flags?: string[]
  notes?: string[]
}

interface OptionsCandidate {
  symbol: string
  current_price: number
  expiry: string
  dte: number
  atm_iv: number
  iv_rank: number | null
  iv_rank_source: string
  in_equity_pipeline: boolean
  thesis_direction: string | null
  thesis_conviction: string | null
  strike: number
  bid: number
  delta: number
  premium_yield_pct: number
  annualized_yield_pct: number
  assignment_capital: number
  open_interest: number | null
}

interface OptionsScreened {
  symbol: string
  thesis_alignment: number | null
  assignment_willing: string | null
  narrative_risk: string[]
  recommendation: string | null
  rationale: string
}

interface OptionsExecution {
  symbol: string
  type: string
  strike: number
  expiry: string
  contracts: number
  fill_price: number | null
  premium: number | null
  filled_at: string | null
  status: string | null
  pnl: number | null
}

interface OptionsData {
  gate: {
    status: string
    checked_at: string | null
    csp_slots_used: number
    csp_slots_max: number
    available_capital: number | null
    cash_buffer_pct: number | null
  }
  candidates: OptionsCandidate[]
  screened: OptionsScreened[]
  active_trades: Array<{
    symbol: string; type: string; strike: number; expiry: string;
    dte: number; contracts: number; limit_price: number | null;
    wheel_state: string; status: string | null;
    current_price?: number | null; unrealized_pnl?: number | null;
    unrealized_pct?: number | null; market_value?: number | null;
    side?: string | null;
  }>
  executions: OptionsExecution[]
  scan_summary: { scanned: number; passed: number } | null
  as_of: string | null
}

interface HedgeCandidate {
  symbol: string
  strike: number | null
  expiry: string | null
  dte: number | null
  bid: number | null
  ask: number | null
  mid: number | null
  otm_pct: number | null
  protection_cost_pct: number | null
  total_hedge_cost: number | null
  oi: number | null
  volume: number | null
}

interface HedgesData {
  status: string
  regime: {
    vix_level: number | null
    vix_regime: string | null
    cb_state: string | null
    active: boolean
  }
  routing_reason: string
  positions_screened: number
  candidates_found: number
  candidates: HedgeCandidate[]
  live_positions?: OptionsData["active_trades"]
  as_of: string | null
}

interface TradingData {
  contract_version?: string
  generated_at: string
  as_of_date: string
  source_context?: {
    mode?: string
    label?: string
    override_active?: boolean
    override_keys?: string[]
    note?: string | null
  }
  options?: OptionsData
  hedges?: HedgesData | null
  account: {
    // True account values from Alpaca
    equity: number | null
    cash: number | null
    buying_power: number | null
    base_value: number | null       // starting equity ($100k)
    total_pnl: number | null        // equity - base_value
    total_pnl_pct: number | null
    today_pnl: number | null        // equity - prior close
    today_pnl_pct: number | null
    // Positions breakdown
    positions_value: number
    equity_deployed: number | null
    options_deployed: number | null
    unrealized_pnl: number
    unrealized_pnl_pct: number | null
  }
  positions: Position[]
  pipeline_status?: PipelineStatus
  kpis: {
    total_trades: number
    closed_trades: number
    open_trades: number
    win_rate_pct: number | null
    profit_factor: number | null
    expectancy: number | null
    net_pnl: number
    max_drawdown_pct: number | null
    max_drawdown_usd: number | null
    max_win_streak: number
    max_loss_streak: number
  }
  daily_performance: Array<{ date: string; net_pnl: number; trades: number; winners: number; losers: number }>
  equity_curve: Array<{ date: string; equity: number; profit_loss?: number | null }>
  watchlist: { items: WatchlistItem[]; as_of: string | null; source: string }
  exit_candidates: ExitCandidate[]
  tunables: Tunables
  bps?: BpsData | null
  operator?: OperatorData
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, prefix = "", suffix = "", decimals = 2) =>
  n == null ? "—" : `${prefix}${n.toFixed(decimals)}${suffix}`

// Accounting notation: negatives in (parens), positives with optional +
const fmtAcct = (n: number | null | undefined, prefix = "", suffix = "", decimals = 2, showPlus = false) =>
  n == null ? "—" : n < 0
    ? `(${prefix}${Math.abs(n).toFixed(decimals)}${suffix})`
    : `${showPlus && n > 0 ? "+" : ""}${prefix}${n.toFixed(decimals)}${suffix}`

const pnlColor = (n: number | null | undefined) =>
  n == null ? "text-[var(--cb-text-secondary)]"
  : n >= 0 ? "text-[var(--cb-green)]"
  : "text-[var(--cb-steel)]"

function shortDate(iso: string) {
  return iso.slice(5)
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function titleizeToken(value: string | null | undefined): string {
  if (!value) return "Unknown"
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatEventTimestamp(value: string | null | undefined): string {
  if (!value) return "Not recorded"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Not recorded"
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function summarizeSymbols(symbols: string[] | null | undefined, limit = 4): string {
  const cleaned = (symbols ?? []).filter(Boolean)
  if (!cleaned.length) return "None yet"
  const visible = cleaned.slice(0, limit)
  if (cleaned.length > limit) {
    return `${visible.join(", ")} +${cleaned.length - limit} more`
  }
  return visible.join(", ")
}

function humanizeSuppression(cause: string | null | undefined): string {
  if (!cause) return "No data yet"
  const map: Record<string, string> = {
    GATE_BLOCKED: "Blocked by risk gate",
    NO_SIGNAL: "No qualifying signal",
    GATE_PLUS_NO_SIGNAL: "Blocked and no signal",
    NOT_SUPPRESSED: "Would have traded",
  }
  return map[cause] ?? titleizeToken(cause)
}

function humanizeLabel(label: string | null | undefined): string {
  if (!label) return "Preview"
  const map: Record<string, string> = {
    decision_support_premier: "Decision Support preview",
    decision_support_preview: "Decision Support preview",
    canonical: "Production",
  }
  return map[label] ?? titleizeToken(label)
}

function humanizeIncident(code: string): { label: string; detail: string; action: string } {
  const map: Record<string, { label: string; detail: string; action: string }> = {
    "legacy.direction_defaulted_long": {
      label: "Direction defaulted",
      detail: "Legacy pipeline didn't set trade direction explicitly. Rebuild defaults to LONG.",
      action: "No action needed — safe default.",
    },
    "legacy.positions_snapshot_date_mismatch": {
      label: "Stale position data",
      detail: "Position snapshot is from a prior trading date, not today.",
      action: "Resolves automatically on next pipeline run.",
    },
    "legacy.market_status_missing": {
      label: "Market status missing",
      detail: "Legacy market status artifact not found for today.",
      action: "Check if the legacy pipeline ran today.",
    },
    "legacy.positions_snapshot_missing": {
      label: "Positions missing",
      detail: "Legacy positions snapshot not found.",
      action: "Check Alpaca connection and legacy pipeline health.",
    },
    "legacy.market_calendar_date_mismatch": {
      label: "Calendar date mismatch",
      detail: "Market calendar date doesn't match the resolved trading date.",
      action: "Usually resolves on next pipeline run.",
    },
    "legacy.market_closed_in_calendar": {
      label: "Market closed",
      detail: "Market calendar says the market is closed today.",
      action: "Expected on holidays/weekends. No action needed.",
    },
  }
  const entry = map[code]
  if (entry) return entry
  return {
    label: titleizeToken(code.replace("legacy.", "")),
    detail: code,
    action: "Investigate — this is an unrecognized incident type.",
  }
}

function humanizeBlockedReason(reason: string): string {
  const map: Record<string, string> = {
    "entry_mode_reduce_only": "Legacy gate set REDUCE_ONLY — only existing positions can trade. Usually caused by a pipeline stall, not market conditions.",
    "entry_mode_halt": "Legacy gate set HALT — all trading suspended. Check for critical pipeline failures.",
    "trade_plan_blocked_by_entry_mode": "Today's plan was blocked because the entry mode prevents new positions.",
  }
  return map[reason] ?? titleizeToken(reason)
}

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] hover:opacity-80 transition-opacity"
        style={{ color: "var(--cb-text-tertiary)" }}
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {label}
      </button>
      {open && <div className="mt-1.5 pl-4">{children}</div>}
    </div>
  )
}

// ─── Command Strip ─────────────────────────────────────────────────────────────
function CommandStrip({
  tunables,
  pipeline,
  operator,
  lastFetched,
  refreshing,
  onRefresh,
  onOpenAssistant,
}: {
  tunables: Tunables
  pipeline?: PipelineStatus
  operator?: OperatorData
  lastFetched: Date
  refreshing: boolean
  onRefresh: () => void
  onOpenAssistant?: () => void
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15000)
    return () => clearInterval(id)
  }, [])

  const isLive = tunables.trading_mode !== "PAPER"
  const modeColor = isLive ? "text-[var(--cb-red)]" : "text-[var(--cb-steel)]"
  const currentMode = operator?.mode?.current_mode ?? tunables.trading_mode
  const brokerEnvironment = operator?.mode?.broker_environment ?? tunables.trading_mode
  const currentModeLabel = titleizeToken(currentMode)
  const brokerEnvironmentLabel = titleizeToken(brokerEnvironment)
  const checkpoint = operator?.checkpoint05
  const plan = operator?.plan

  // Pipeline verdict display
  let verdictDotColor = "var(--cb-text-tertiary)"
  let verdictText = "Pipeline · —"
  if (pipeline) {
    const v = pipeline.verdict
    if (v === "PASS") {
      verdictDotColor = "var(--cb-green)"
      verdictText = "Pipeline · PASS"
    } else if (v === "WARN") {
      verdictDotColor = "var(--cb-amber)"
      const parts = ["Pipeline · WARN"]
      if (pipeline.critical_issues > 0) parts.push(`${pipeline.critical_issues} critical`)
      if (pipeline.high_issues > 0) parts.push(`${pipeline.high_issues} high`)
      verdictText = parts.join(" — ")
    } else if (v === "FAIL") {
      verdictDotColor = "var(--cb-red)"
      verdictText = "Pipeline · FAIL"
    } else {
      verdictText = "Pipeline · " + v
    }
  }

  const checkpointChip = checkpoint
    ? titleizeToken(checkpoint.checkpoint_status)
    : "—"
  const planChip = plan
    ? titleizeToken(plan.trade_plan_status)
    : "—"
  return (
    <div
      className="px-6 py-2 flex items-center justify-between gap-4 backdrop-blur-md sticky top-[52px] z-30"
      style={{
        borderBottom: "1px solid rgba(90, 110, 180, 0.14)",
        background: "rgba(5, 8, 26, 0.92)",
      }}
    >
      {/* Left: mode */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="cb-live-dot" />
        <div className="min-w-0">
          <div className={`text-[11px] font-semibold tracking-wide ${modeColor}`}>
            {currentModeLabel}
          </div>
          <div className="text-[10px] truncate" style={{ color: "var(--cb-text-tertiary)" }}>
            {brokerEnvironmentLabel} broker
          </div>
        </div>
      </div>

      {/* Center: compact chips */}
      <div className="hidden sm:flex items-center gap-2 text-[11px] min-w-0">
        <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(120, 140, 200, 0.10)", color: "var(--cb-text-secondary)" }}>
          Checkpoint {checkpointChip}
        </span>
        <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(120, 140, 200, 0.10)", color: "var(--cb-text-secondary)" }}>
          Plan {planChip}
        </span>
      </div>

      {/* Right: pipeline + refresh */}
      <div className="flex items-center gap-3 text-[11px]">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: verdictDotColor,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <span style={{ color: verdictDotColor }}>{verdictText}</span>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[10px] hover:opacity-80 transition-opacity"
          style={{ color: "var(--cb-text-tertiary)" }}
        >
          <span className="hidden sm:inline" style={{ color: "var(--cb-text-tertiary)" }}>
            Updated {timeAgo(lastFetched.toISOString())}
          </span>
          <RefreshCw
            className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
            style={{ color: "var(--cb-text-tertiary)" }}
          />
        </button>

        {onOpenAssistant && (
          <button
            onClick={onOpenAssistant}
            aria-label="Open Talon assistant"
            className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-all hover:scale-[1.03]"
            style={{
              background: "radial-gradient(circle at 20% 20%, rgba(124, 58, 237, 0.22), transparent 55%), rgba(14, 20, 40, 0.90)",
              border: "1px solid rgba(124, 58, 237, 0.40)",
              boxShadow: "inset 0 1px 0 rgba(180, 195, 235, 0.06), 0 2px 14px rgba(124, 58, 237, 0.18), 0 2px 10px rgba(5, 8, 26, 0.5)",
            }}
          >
            <Sparkles className="w-4 h-4" style={{ color: "var(--cb-brand)" }} />
            <span
              className="hidden sm:inline"
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "var(--cb-text-primary)",
              }}
            >
              Talon
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

function OperatorOverview({ data, tunables }: { data: TradingData; tunables: Tunables }) {
  const operator = data.operator
  const pipeline = data.pipeline_status

  if (!operator || !pipeline) return null

  const checkpoint = operator.checkpoint05
  const plan = operator.plan
  const mode = operator.mode
  const session = operator.session
  const research = operator.research
  const regime = operator.regime
  const approval = operator.approval
  const modeHistory = operator.mode_history
  const incidents = operator.incident_flags ?? []
  const blockingNotes = checkpoint?.blocking_notes ?? []
  const gateBlockers = mode?.gate_state?.blocking_incidents ?? []
  const allowedTransitions = mode?.allowed_transitions ?? []
  const preGateSymbols = plan?.pre_gate_symbols ?? []
  const readySymbols = plan?.trade_plan_symbols ?? []
  const effectiveModeLabel = titleizeToken(mode?.effective_mode ?? mode?.current_mode)
  // Only show "next" if there's a meaningful forward transition (not a regression to Shadow)
  const forwardTransitions = allowedTransitions.filter((t: string) => t !== "SHADOW")
  const nextModeLabel = forwardTransitions[0]
    ? titleizeToken(forwardTransitions[0])
    : null
  const topThesis = research?.top_theses?.[0]

  const regimeSummary = !regime?.populated
    ? "Regime unavailable"
    : [
        regime?.vix_level != null ? `VIX ${regime.vix_level.toFixed(1)}` : null,
        regime?.vix_regime ? titleizeToken(regime.vix_regime) : null,
        regime?.hmm_regime ? `HMM ${titleizeToken(regime.hmm_regime)}` : null,
      ].filter(Boolean).join(" · ")

  // Deduplicated symbol display: show ready symbols, explain filtering if different
  const normalizedSymbols = (symbols: string[]) => [...symbols].sort().join("|")
  const setsMatch = normalizedSymbols(preGateSymbols) === normalizedSymbols(readySymbols)

  // Approval
  const approvalPending = (approval?.pending_count ?? 0) > 0
  const isDecisionSupport = mode?.current_mode === "DECISION_SUPPORT"

  // Tone: incidents → bad, suppressed plan or approval pending → medium, ready → good
  const planStatus = (plan?.trade_plan_status ?? "").toUpperCase()
  const overviewTone: CardTone =
    incidents.length > 0 || gateBlockers.length > 0
      ? "bad"
      : planStatus.includes("SUPPRESS") || approvalPending
        ? "medium"
        : planStatus.includes("READY") || planStatus.includes("ACTIVE")
          ? "good"
          : "medium"

  return (
    <section className="space-y-3">
      {/* Hero header */}
      <div className={`cb-card-t1 ${toneClass(overviewTone)} px-5 py-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-base font-medium" style={{ color: "var(--cb-text-primary)", letterSpacing: "-0.01em" }}>
              {effectiveModeLabel}
              {nextModeLabel && (
                <span className="text-xs font-normal ml-2" style={{ color: "var(--cb-text-tertiary)" }}>
                  {nextModeLabel} next
                </span>
              )}
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              {titleizeToken(mode?.broker_environment ?? tunables.trading_mode)} broker · Execution {mode?.execution_enabled ? "enabled" : "disabled"}
              {mode?.approval_required ? " · Approval required" : ""}
            </div>
          </div>
          <div
            className="rounded-full border px-2.5 py-1 text-[11px] font-medium flex-shrink-0"
            style={{
              borderColor: pipeline.verdict === "PASS" ? "rgba(34,197,94,0.28)" : pipeline.verdict === "FAIL" ? "rgba(239,68,68,0.28)" : "rgba(245,158,11,0.28)",
              color: pipeline.verdict === "PASS" ? "var(--cb-green)" : pipeline.verdict === "FAIL" ? "var(--cb-red)" : "var(--cb-amber)",
              background: pipeline.verdict === "PASS" ? "rgba(34,197,94,0.08)" : pipeline.verdict === "FAIL" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
            }}
          >
            {pipeline.chain_ok ? "Healthy" : "Issues"} · {pipeline.verdict ?? "WARN"}
          </div>
        </div>

        {/* Summary cards — just the essentials */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">

          {/* Card 1: Today's Plan */}
          <div className="cb-card-t3 px-4 py-3 space-y-1.5 overflow-hidden">
            <div className="cb-label">Today&apos;s Plan</div>
            <div className="text-sm font-medium truncate" style={{ color: "var(--cb-text-primary)" }}>
              {titleizeToken(plan?.trade_plan_status)} · {plan?.trade_plan_count ?? 0} ready
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              {readySymbols.length > 0
                ? `${readySymbols.length} cleared risk · ${summarizeSymbols(readySymbols, 5)}`
                : preGateSymbols.length > 0
                  ? `${preGateSymbols.length} surfaced, none cleared`
                  : "No candidates in current snapshot"}
            </div>
            {plan?.suppression_cause && plan.suppression_cause !== "NOT_SUPPRESSED" && (
              <div className="text-xs" style={{ color: "var(--cb-text-tertiary)" }}>
                {humanizeSuppression(plan.suppression_cause)}
              </div>
            )}
          </div>

          {/* Card 2: Market Regime */}
          <div className="cb-card-t3 px-4 py-3 space-y-1.5 overflow-hidden">
            <div className="cb-label">Market Regime</div>
            <div className="text-sm font-medium" style={{ color: "var(--cb-text-primary)" }}>
              {regimeSummary}
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              {research?.tradable_symbol_count ?? 0} tradable names · {research?.thesis_item_count ?? 0} theses
            </div>
            {regime?.narrative && (
              <div className="text-xs" style={{ color: "var(--cb-text-tertiary)" }}>{regime.narrative}</div>
            )}
          </div>

        </div>

        {/* Incidents & status — deduplicated, legacy noise filtered */}
        {(() => {
          // Merge incidents + gate blockers into one deduplicated list
          // Filter out retired legacy checks
          const RETIRED = new Set(["legacy.market_status_missing"])
          // Expected/informational items — normal outcomes, not real blockers
          const INFORMATIONAL = new Set([
            "shadow.trade_plan_empty",
            "strategy.thesis_set_empty",
          ])
          const isInformational = (code: string) =>
            INFORMATIONAL.has(code) || code.startsWith("steward.position_watch_only")
          const allCodes = new Set([...incidents, ...gateBlockers].filter((c: string) => !RETIRED.has(c)))
          const blockerSet = new Set(gateBlockers)
          const dedupedIssues = [...allCodes].map((code: string) => ({
            code,
            // Only flag as blocker if it's in the blocker set AND not an expected/informational item
            isBlocker: blockerSet.has(code) && !isInformational(code),
            isInfo: isInformational(code),
          }))

          const realIssues = dedupedIssues.filter(i => !i.isInfo)
          const infoItems = dedupedIssues.filter(i => i.isInfo)
          const issueCount = realIssues.length

          return dedupedIssues.length > 0 || !pipeline.chain_ok ? (
            <Disclosure label={`${issueCount > 0 ? `${issueCount} issue${issueCount !== 1 ? "s" : ""}` : "No issues"}${infoItems.length > 0 ? ` · ${infoItems.length} info` : ""} · ${pipeline.chain_ok ? "chain healthy" : "chain has incidents"} · ${data.as_of_date}`}>
              <div className="mt-2 space-y-2">
                {realIssues.map(({ code, isBlocker }) => {
                  const info = humanizeIncident(code)
                  return (
                    <div key={code} className="text-xs space-y-0.5">
                      <div className="font-medium flex items-center gap-2" style={{ color: isBlocker ? "var(--cb-red)" : "var(--cb-amber)" }}>
                        {info.label}
                        {isBlocker && (
                          <span className="rounded-full border px-1.5 py-0 text-[9px] font-medium" style={{ borderColor: "rgba(239,68,68,0.3)", color: "var(--cb-red)" }}>
                            blocker
                          </span>
                        )}
                      </div>
                      <div style={{ color: "var(--cb-text-secondary)" }}>{info.detail}</div>
                      <div style={{ color: "var(--cb-text-tertiary)" }}>{info.action}</div>
                    </div>
                  )
                })}
                {infoItems.length > 0 && (
                  <div className="pt-1 border-t border-zinc-800/40">
                    <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "var(--cb-text-tertiary)" }}>Expected / Informational</div>
                    {infoItems.map(({ code }) => {
                      const info = humanizeIncident(code)
                      return (
                        <div key={code} className="text-xs py-0.5" style={{ color: "var(--cb-text-tertiary)" }}>
                          {info.label}
                        </div>
                      )
                    })}
                  </div>
                )}
                {plan?.blocked_reasons?.map((reason: string) => (
                  <div key={`reason-${reason}`} className="text-xs space-y-0.5">
                    <div className="font-medium" style={{ color: "var(--cb-amber)" }}>Plan blocked</div>
                    <div style={{ color: "var(--cb-text-secondary)" }}>{humanizeBlockedReason(reason)}</div>
                  </div>
                ))}
              </div>
            </Disclosure>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-[11px] mt-3">
              <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "rgba(34,197,94,0.2)", color: "var(--cb-green)" }}>
                Chain healthy
              </span>
              <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--cb-border-std)", color: "var(--cb-text-secondary)" }}>
                {data.as_of_date}
              </span>
            </div>
          )
        })()}
      </div>
    </section>
  )
}

// ─── Promoted Strategy ────────────────────────────────────────────────────────
function formatPctSigned(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(digits)}%`
}

function formatPctPlain(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${value.toFixed(digits)}%`
}

function formatRatio(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toFixed(digits)
}

function promotionStageColor(stage: string | null | undefined): { color: string; border: string; bg: string } {
  const s = (stage ?? "").toUpperCase()
  if (s.includes("ACTIVE") || s.includes("LIVE") || s === "PROMOTED") {
    return { color: "var(--cb-green)", border: "rgba(34,197,94,0.28)", bg: "rgba(34,197,94,0.08)" }
  }
  if (s.includes("FROZEN") || s.includes("CONFIRMATION") || s.includes("PENDING")) {
    return { color: "var(--cb-amber)", border: "rgba(245,158,11,0.28)", bg: "rgba(245,158,11,0.08)" }
  }
  return { color: "var(--cb-text-secondary)", border: "rgba(120, 140, 200, 0.22)", bg: "rgba(120, 140, 200, 0.06)" }
}

function StrategyMetric({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "neutral" }) {
  const color =
    tone === "pos" ? "var(--cb-green)" :
    tone === "neg" ? "var(--cb-red)" :
    "var(--cb-text-primary)"
  return (
    <div className="flex-shrink-0 min-w-[88px]">
      <div className="cb-label">{label}</div>
      <div className="text-sm font-medium tabular-nums" style={{ color }}>{value}</div>
    </div>
  )
}

function strategyRuleSummary(record: StrategyBankRecord): string {
  const parts: string[] = []
  if (record.stop_loss_pct != null) parts.push(`Stop ${record.stop_loss_pct}%`)
  if (record.target_pct != null) parts.push(`Target ${record.target_pct}%`)
  if (record.max_hold_days != null) parts.push(`${record.max_hold_days}d hold`)
  if (record.max_positions != null) parts.push(`${record.max_positions} max pos`)
  if (record.risk_pct_per_trade != null) parts.push(`${record.risk_pct_per_trade}%/trade`)
  return parts.join(" · ") || "—"
}

function humanizeStrategyName(name: string | null | undefined): string {
  if (!name) return "Unknown"
  // "regime_aware_momentum:stop_5_target_15" → "Regime Aware Momentum (5% stop / 15% target)"
  const parts = name.split(":")
  const family = parts[0].replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  if (parts.length < 2) return family
  const variant = parts[1]
  // Try to extract stop/target numbers from variant name
  const stopMatch = variant.match(/stop[_]?(\d+)/)
  const targetMatch = variant.match(/target[_]?(\d+)/)
  if (stopMatch && targetMatch) {
    return `${family} (${stopMatch[1]}% stop / ${targetMatch[1]}% target)`
  }
  return `${family} · ${variant.replace(/_/g, " ")}`
}

function PromotedStrategy({ bank }: { bank: StrategyBankSection | null | undefined }) {
  if (!bank || !bank.active) return null
  const active = bank.active
  const banked = (bank.banked_strategies ?? []).filter(r => r.record_id !== active.record_id)
  const perf = active.performance_summary ?? {}
  const stageColors = promotionStageColor(active.promotion_stage)

  const stage = (active.promotion_stage ?? "").toUpperCase()
  const strategyTone: CardTone =
    stage.includes("ACTIVE") || stage.includes("LIVE") || stage === "PROMOTED"
      ? "good"
      : stage.includes("FROZEN") || stage.includes("CONFIRMATION") || stage.includes("PENDING")
        ? "medium"
        : "medium"

  return (
    <section>
      <div className="cb-label mb-3">Active Strategy</div>

      <div className={`cb-card-t3 ${toneClass(strategyTone)} px-4 py-3 space-y-2`}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium" style={{ color: "var(--cb-text-primary)" }}>
            {humanizeStrategyName(active.display_name ?? active.record_id)}
          </div>
          {active.promotion_stage && (
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] flex-shrink-0"
              style={{ borderColor: stageColors.border, color: stageColors.color, background: stageColors.bg }}
            >
              {titleizeToken(active.promotion_stage)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--cb-text-secondary)" }}>
          <span>{formatPctPlain(perf.total_return_pct)} return</span>
          <span>Sharpe {formatRatio(perf.sharpe_ratio)}</span>
          <span>{formatPctPlain(perf.max_drawdown_pct)} max DD</span>
          <span>{perf.total_trades ?? "—"} trades</span>
          <span>{formatPctPlain(perf.win_rate_pct, 1)} win rate</span>
        </div>

        {active.symbols && active.symbols.length > 0 && (
          <div className="text-xs" style={{ color: "var(--cb-text-tertiary)" }}>
            {active.symbols.join(", ")} · {strategyRuleSummary(active)}
          </div>
        )}

        <Disclosure label="How this strategy works">
          <div className="space-y-2 text-xs leading-relaxed" style={{ color: "var(--cb-text-secondary)" }}>
            <p>
              {active.strategy_family === "REGIME_AWARE_MOMENTUM"
                ? `This strategy trades momentum in a fixed universe of ${active.symbols?.length ?? 0} large-cap names (${active.symbols?.join(", ") ?? "none"}).`
                  + ` It only enters LONG positions when the market regime is favorable (HMM reads CALM).`
                  + ` When the regime turns volatile, it stops opening new trades and lets existing positions hit their stops or targets.`
                : `This strategy runs on ${active.symbols?.length ?? 0} names: ${active.symbols?.join(", ") ?? "none"}.`}
            </p>
            <ul className="space-y-1 pl-3" style={{ listStyleType: "disc" }}>
              <li><span style={{ color: "var(--cb-text-tertiary)" }}>Universe:</span> {active.symbols?.length ?? 0} fixed names — {active.symbols?.join(", ") ?? "none"}</li>
              <li><span style={{ color: "var(--cb-text-tertiary)" }}>Direction:</span> {active.allowed_sides?.join(" / ") ?? "LONG"} only</li>
              <li><span style={{ color: "var(--cb-text-tertiary)" }}>Max positions:</span> {active.max_positions ?? "—"} at a time, {active.risk_pct_per_trade ?? "—"}% of capital risked per trade</li>
              <li><span style={{ color: "var(--cb-text-tertiary)" }}>Entry:</span> Buys when a name shows strong recent momentum and the regime filter is green</li>
              <li><span style={{ color: "var(--cb-text-tertiary)" }}>Exit:</span> {active.stop_loss_pct ?? "—"}% stop loss, {active.target_pct ?? "—"}% profit target, or {active.max_hold_days ?? "—"}-day max hold — whichever hits first</li>
              <li><span style={{ color: "var(--cb-text-tertiary)" }}>Backtest:</span> {perf.total_trades ?? "—"} trades over {perf.evaluated_trading_days ?? "—"} days, {formatPctPlain(perf.win_rate_pct, 1)} win rate, {formatRatio(perf.profit_factor)} profit factor</li>
            </ul>
          </div>
        </Disclosure>
      </div>

      {banked.length > 0 && (
        <Disclosure label={`${banked.length} other banked strateg${banked.length === 1 ? "y" : "ies"}`}>
          <div className="space-y-2 mt-2">
            {banked.map((record) => {
              const rPerf = record.performance_summary ?? {}
              return (
                <div key={record.record_id} className="flex items-center justify-between gap-3 text-xs py-1.5">
                  <span style={{ color: "var(--cb-text-secondary)" }}>
                    {humanizeStrategyName(record.display_name ?? record.record_id)}
                  </span>
                  <span className="flex gap-3 flex-shrink-0 tabular-nums" style={{ color: "var(--cb-text-tertiary)" }}>
                    <span>{formatPctPlain(rPerf.total_return_pct)}</span>
                    <span>S {formatRatio(rPerf.sharpe_ratio)}</span>
                    <span>{formatPctPlain(rPerf.max_drawdown_pct)} DD</span>
                  </span>
                </div>
              )
            })}
          </div>
        </Disclosure>
      )}
    </section>
  )
}

// ─── Capital Hero ─────────────────────────────────────────────────────────────
function CapitalHero({
  account,
}: {
  account: TradingData["account"]
}) {
  const todayPnl  = account.today_pnl
  const todayPct  = account.today_pnl_pct
  const totalPnl  = account.total_pnl
  const totalPct  = account.total_pnl_pct
  const equity    = account.equity ?? account.positions_value
  const baseValue = account.base_value

  const tone = pnlTone(todayPnl)

  return (
    <div className={`cb-card-hero ${toneClass(tone)}`}>
      {/* Primary zone: deployed capital + today's move */}
      <div className="cb-hero-primary">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div
              className="cb-number"
              style={{ fontSize: "clamp(2.2rem, 5vw, 3rem)", lineHeight: 1, fontWeight: 200, letterSpacing: "-0.02em", color: "var(--cb-text-primary)" }}
            >
              ${account.positions_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="cb-label mt-2">
              deployed capital
              {account.equity_deployed != null && account.options_deployed != null && (
                <span style={{ opacity: 0.6, marginLeft: "0.5rem" }}>
                  (eq ${account.equity_deployed.toLocaleString("en-US", { maximumFractionDigits: 0 })} / opt ${account.options_deployed.toLocaleString("en-US", { maximumFractionDigits: 0 })})
                </span>
              )}
            </div>
          </div>
          {todayPnl != null && (
            <div className="text-right">
              <div className={`cb-number ${pnlColor(todayPnl)}`} style={{ fontSize: "1.6rem", fontWeight: 200, lineHeight: 1, letterSpacing: "-0.01em" }}>
                {fmtAcct(todayPnl, "$", "", 2, true)}
              </div>
              <div className="cb-label mt-1.5">{fmtAcct(todayPct, "", "%", 2)} today</div>
            </div>
          )}
        </div>
      </div>

      {/* Support zone: equity / cash / unrealized / total */}
      <div className="cb-hero-support">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {equity != null && (
            <div>
              <div className="cb-label mb-1">Account equity</div>
              <div className="text-sm font-medium cb-number" style={{ color: "var(--cb-steel)" }}>
                ${equity.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </div>
          )}
          {account.cash != null && (
            <div>
              <div className="cb-label mb-1">Cash</div>
              <div className="text-sm font-medium cb-number" style={{ color: "var(--cb-steel)" }}>
                ${account.cash.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </div>
          )}
          {account.unrealized_pnl != null && (
            <div>
              <div className="cb-label mb-1">Unrealized</div>
              <div className={`text-sm font-medium cb-number ${pnlColor(account.unrealized_pnl)}`}>
                {fmtAcct(account.unrealized_pnl, "$", "", 2, true)}
                <span className="text-xs ml-1 opacity-60">{fmtAcct(account.unrealized_pnl_pct, "", "%", 2)}</span>
              </div>
            </div>
          )}
          {totalPnl != null && (
            <div>
              <div className="cb-label mb-1">Total return{baseValue ? ` · from $${baseValue.toLocaleString()}` : ""}</div>
              <div className={`text-sm font-medium cb-number ${pnlColor(totalPnl)}`}>
                {fmtAcct(totalPnl, "$", "", 2, true)}
                <span className="text-xs ml-1 opacity-60">{fmtAcct(totalPct, "", "%", 2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Premium Tooltip ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatter, labelFormatter }: {
  active?: boolean; payload?: any[]; label?: any
  formatter?: (val: any, name: any) => [string, string]
  labelFormatter?: (l: any) => string
}) {
  if (!active || !payload?.length) return null
  const heading = labelFormatter ? labelFormatter(label) : String(label)
  return (
    <div style={{
      background: "rgba(10, 14, 31, 0.97)",
      border: "1px solid rgba(110, 135, 210, 0.22)",
      borderRadius: 10,
      padding: "10px 14px",
      boxShadow: "0 8px 32px rgba(5, 8, 26, 0.9), inset 0 1px 0 rgba(180, 195, 235, 0.03)",
      minWidth: 120,
    }}>
      <div style={{ fontSize: 9, color: "var(--cb-text-tertiary)", marginBottom: 7, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {heading}
      </div>
      {payload.map((entry: any, i: number) => {
        const [val, name] = formatter ? formatter(entry.value, entry.name) : [`${entry.value}`, entry.name]
        return (
          <div key={i}>
            <div className="cb-number" style={{ fontSize: 16, fontWeight: 300, color: "var(--cb-text-primary)", letterSpacing: "-0.02em" }}>{val}</div>
            {name && <div style={{ fontSize: 9, color: "var(--cb-text-tertiary)", marginTop: 2, letterSpacing: "0.06em" }}>{name}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Equity Curve ─────────────────────────────────────────────────────────────
type Timeframe = "1D" | "1W" | "1M" | "YTD" | "1Y" | "3Y" | "5Y" | "ALL"

const TF_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: "1D",  label: "1 Day"   },
  { value: "1W",  label: "1 Week"  },
  { value: "1M",  label: "1 Month" },
  { value: "YTD", label: "YTD"     },
  { value: "1Y",  label: "1 Year"  },
  { value: "3Y",  label: "3 Years" },
  { value: "5Y",  label: "5 Years" },
  { value: "ALL", label: "All Time"},
]

function cutoffForTf(tf: Timeframe): string | null {
  if (tf === "ALL") return null
  const now = new Date()
  if (tf === "YTD") {
    return `${now.getFullYear()}-01-01`
  }
  const days: Record<string, number> = { "1D": 1, "1W": 7, "1M": 30, "1Y": 365, "3Y": 1095, "5Y": 1825 }
  const d = new Date(now)
  d.setDate(d.getDate() - (days[tf] ?? 0))
  return d.toISOString().slice(0, 10)
}

function EquityCurve({ data, baseValue }: { data: TradingData["equity_curve"]; baseValue?: number | null }) {
  const [tf, setTf] = useState<Timeframe>("ALL")

  const displayData = useMemo(() => {
    const cutoff = cutoffForTf(tf)
    const filtered = cutoff ? data.filter(d => d.date >= cutoff) : data
    return filtered.length ? filtered : data
  }, [data, tf])

  if (!data.length) return (
    <div className="cb-card-t2 px-4 pt-4 pb-6">
      <div className="cb-label mb-3">Account Equity</div>
      <div className="flex items-center justify-center h-[140px]">
        <p className="text-xs" style={{ color: "var(--cb-text-tertiary)" }}>No history available yet</p>
      </div>
    </div>
  )

  const equities = displayData.map(d => d.equity)
  const minEq = Math.min(...equities)
  const maxEq = Math.max(...equities)
  const mid = (minEq + maxEq) / 2
  const naturalPad = Math.max((maxEq - minEq) * 0.1, mid * 0.01)
  const yMin = Math.floor((minEq - naturalPad) / 10) * 10
  const yMax = Math.ceil((maxEq + naturalPad) / 10) * 10
  const fmtK = (v: number) => `$${(v / 1000).toFixed(1)}k`

  // Tone: compare last equity to first over visible window
  const tone: CardTone = equities.length >= 2
    ? pnlTone(equities[equities.length - 1] - equities[0], mid * 0.001)
    : "medium"

  return (
    <div className={`cb-card-t2 ${toneClass(tone)} px-4 pt-4 pb-4`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="cb-label">
          Account Equity
          {baseValue && <span className="ml-2 font-normal normal-case" style={{ color: "var(--cb-text-tertiary)" }}>started ${baseValue.toLocaleString()}</span>}
        </span>
        <select
          value={tf}
          onChange={e => setTf(e.target.value as Timeframe)}
          className="cursor-pointer focus:outline-none"
          style={{
            background: "transparent",
            border: "1px solid var(--cb-border-std)",
            color: "var(--cb-text-secondary)",
            fontSize: 10,
            borderRadius: 6,
            padding: "2px 8px",
          }}
        >
          {TF_OPTIONS.map(o => (
            <option key={o.value} value={o.value} style={{ background: "var(--cb-surface-1)" }}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="relative px-2">
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={displayData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="cb-equity-halo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#10b981" stopOpacity="0.24" />
                <stop offset="60%"  stopColor="#10b981" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "#7b7892" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 10, fill: "#7b7892" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtK}
              width={44}
              domain={[yMin, yMax]}
            />
            <Tooltip
              content={<ChartTooltip
                formatter={(v: unknown) => [`$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Equity"]}
                labelFormatter={(l: unknown) => shortDate(String(l))}
              />}
            />
            {baseValue && <ReferenceLine y={baseValue} stroke="rgba(120, 140, 200, 0.22)" strokeDasharray="4 3" />}
            <Area type="monotone" dataKey="equity" stroke="none" fill="url(#cb-equity-halo)" isAnimationActive={false} />
            <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={1.2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Daily P&L ────────────────────────────────────────────────────────────────
const PNL_TF_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: "1W",  label: "1 Week"  },
  { value: "1M",  label: "1 Month" },
  { value: "YTD", label: "YTD"     },
  { value: "1Y",  label: "1 Year"  },
  { value: "3Y",  label: "3 Years" },
  { value: "5Y",  label: "5 Years" },
  { value: "ALL", label: "All Time"},
]

function DailyPnlChart({ data }: { data: Array<{ date: string; net_pnl: number }> }) {
  const [tf, setTf] = useState<Timeframe>("1M")

  const displayData = useMemo(() => {
    const cutoff = cutoffForTf(tf)
    const filtered = cutoff ? data.filter(d => d.date >= cutoff) : data
    return filtered.length ? filtered : data
  }, [data, tf])

  const hasData = displayData.some(d => d.net_pnl !== 0)

  if (!hasData) return (
    <div className="cb-card-t2 px-4 pt-4 pb-6">
      <div className="cb-label mb-3">Daily P&L</div>
      <div className="flex items-center justify-center h-[100px]">
        <p className="text-xs" style={{ color: "var(--cb-text-tertiary)" }}>No closed trade P&L recorded yet</p>
      </div>
    </div>
  )

  const periodSum = displayData.reduce((acc, d) => acc + (d.net_pnl ?? 0), 0)
  const tone = pnlTone(periodSum)

  return (
    <div className={`cb-card-t2 ${toneClass(tone)} px-4 pt-4 pb-4`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="cb-label">Daily P&L</span>
        <select
          value={tf}
          onChange={e => setTf(e.target.value as Timeframe)}
          className="cursor-pointer focus:outline-none"
          style={{
            background: "transparent",
            border: "1px solid var(--cb-border-std)",
            color: "var(--cb-text-secondary)",
            fontSize: 10,
            borderRadius: 6,
            padding: "2px 8px",
          }}
        >
          {PNL_TF_OPTIONS.map(o => (
            <option key={o.value} value={o.value} style={{ background: "var(--cb-surface-1)" }}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="relative px-2">
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={displayData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "#7b7892" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "#7b7892" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={48} />
            <Tooltip
              content={<ChartTooltip
                formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "P&L"]}
                labelFormatter={(l: unknown) => shortDate(String(l))}
              />}
            />
            <ReferenceLine y={0} stroke="rgba(120, 140, 200, 0.22)" />
            <Bar dataKey="net_pnl" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {displayData.map((d, i) => (
                <Cell key={i} fill={d.net_pnl >= 0 ? "#10b981" : "#7ab0cc"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Sentiment tone helper ────────────────────────────────────────────────────
// Maps a card's semantic state to a cb-tone-* class. Used by every major card
// to make the shared accent gradient carry good/medium/bad signal at a glance.
type CardTone = "good" | "medium" | "bad"

function toneClass(tone: CardTone | null | undefined): string {
  if (tone === "good") return "cb-tone-good"
  if (tone === "bad") return "cb-tone-bad"
  if (tone === "medium") return "cb-tone-medium"
  return ""
}

function pnlTone(value: number | null | undefined, epsilon = 0.01): CardTone {
  if (value == null || !Number.isFinite(value)) return "medium"
  if (value > epsilon) return "good"
  if (value < -epsilon) return "bad"
  return "medium"
}

// ─── Performance Grid ─────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, tooltip, tone }: { label: string; value: string; sub?: string; tooltip?: string; tone?: "good" | "bad" | "neutral" }) {
  const [show, setShow] = useState(false)
  const toneCls = tone === "good" ? "cb-tone-good" : tone === "bad" ? "cb-tone-bad" : "cb-tone-medium"
  return (
    <div
      className={`relative cb-metric ${toneCls}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div className="cb-number" style={{ fontSize: 20, fontWeight: 300, color: "var(--cb-text-primary)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{value}</div>
      <div className="flex items-center gap-1 mt-1.5" style={{ fontSize: 9, color: "var(--cb-text-secondary)", letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.7 }}>
        {label}
        {tooltip && <Info className="w-3 h-3 shrink-0" style={{ color: "var(--cb-text-tertiary)" }} />}
      </div>
      {sub && <div style={{ fontSize: 9, color: "var(--cb-text-tertiary)" }} className="mt-0.5">{sub}</div>}
      {tooltip && show && (
        <div
          className="absolute bottom-full left-0 mb-1.5 z-50 rounded-lg px-3 py-2 text-[11px] w-52 leading-snug shadow-xl pointer-events-none"
          style={{
            background: "var(--cb-surface-1)",
            border: "1px solid var(--cb-border-std)",
            color: "var(--cb-text-secondary)",
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  )
}

function PerformanceGrid({ kpis }: { kpis: TradingData["kpis"] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {/* Execution Quality */}
      <div>
        <div className="cb-label mb-2">Execution Quality</div>
        <div className="grid grid-cols-3 gap-2">
          <MetricCard
            label="Win Rate"
            value={kpis.win_rate_pct != null ? `${kpis.win_rate_pct.toFixed(1)}%` : "—"}
            tooltip="Percentage of closed trades that ended in profit. Above 50% means more winners than losers."
            tone={kpis.win_rate_pct == null ? "neutral" : kpis.win_rate_pct >= 55 ? "good" : kpis.win_rate_pct >= 40 ? "neutral" : "bad"}
          />
          <MetricCard
            label="Profit Factor"
            value={fmt(kpis.profit_factor)}
            tooltip="Gross profit divided by gross loss. Above 1.0 means the system makes more than it loses overall."
            tone={kpis.profit_factor == null ? "neutral" : kpis.profit_factor >= 1.5 ? "good" : kpis.profit_factor >= 1.0 ? "neutral" : "bad"}
          />
          <MetricCard
            label="Expectancy"
            value={fmt(kpis.expectancy, "$")}
            tooltip="Average dollar return per trade, accounting for win rate and average win/loss size. Positive means edge."
            tone={kpis.expectancy == null ? "neutral" : kpis.expectancy > 0 ? "good" : kpis.expectancy > -50 ? "neutral" : "bad"}
          />
        </div>
      </div>

      {/* Risk Character */}
      <div>
        <div className="cb-label mb-2">Risk Character</div>
        <div className="grid grid-cols-3 gap-2">
          <MetricCard
            label="Max Drawdown"
            value={kpis.max_drawdown_usd != null ? `$${kpis.max_drawdown_usd.toFixed(2)}` : "—"}
            sub={kpis.max_drawdown_pct != null ? `${kpis.max_drawdown_pct.toFixed(2)}% of base` : undefined}
            tooltip="Largest peak-to-trough loss in cumulative realized P&L, expressed as a dollar amount and % of starting equity ($100k)."
            tone={kpis.max_drawdown_pct == null ? "neutral" : kpis.max_drawdown_pct <= 2 ? "good" : kpis.max_drawdown_pct <= 5 ? "neutral" : "bad"}
          />
          <MetricCard
            label="Win Streak"
            value={String(kpis.max_win_streak)}
            sub="best"
            tooltip="Longest consecutive string of winning trades recorded."
            tone={kpis.max_win_streak >= 5 ? "good" : kpis.max_win_streak >= 2 ? "neutral" : "bad"}
          />
          <MetricCard
            label="Loss Streak"
            value={String(kpis.max_loss_streak)}
            sub="worst"
            tooltip="Longest consecutive string of losing trades. The consecutive loss limit in risk policy will halt trading when hit."
            tone={kpis.max_loss_streak <= 2 ? "good" : kpis.max_loss_streak <= 5 ? "neutral" : "bad"}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Option symbol parser ──────────────────────────────────────────────────────
// Parses Alpaca OCC-style option tickers: {SYMBOL}{YYMMDD}{P|C}{STRIKE*1000, 8 digits}
// e.g. AMD260410P00190000 → underlying=AMD, expiry=2026-04-10, type=P, strike=190
function parseOptionSymbol(symbol: string) {
  const m = symbol.match(/^([A-Z]+)(\d{6})([PC])(\d{8})$/)
  if (!m) return null
  const [, underlying, dateStr, type, strikePad] = m
  const expiry = `20${dateStr.slice(0,2)}-${dateStr.slice(2,4)}-${dateStr.slice(4,6)}`
  const strike = parseInt(strikePad, 10) / 1000
  const expiryDate = new Date(`${expiry}T00:00:00`)
  const today = new Date(); today.setHours(0,0,0,0)
  const dte = Math.round((expiryDate.getTime() - today.getTime()) / 86400000)
  const expiryLabel = expiryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return { underlying, expiry, expiryLabel, type: type as "P" | "C", strike, dte }
}

// ─── Position Row ─────────────────────────────────────────────────────────────
function PositionRow({ p, exitDecision, underlyingChangePct }: {
  p: Position
  exitDecision?: ExitCandidate
  underlyingChangePct?: number   // today's % move of the underlying stock (for option positions)
}) {
  const [open, setOpen] = useState(false)
  const opt = parseOptionSymbol(p.symbol)

  // Severity border class
  let severityClass = ""
  if (exitDecision) {
    if (exitDecision.decision === "URGENT_CLOSE") severityClass = "cb-severity-critical"
    else if (exitDecision.decision === "CLOSE_BEFORE_BELL") severityClass = "cb-severity-high"
  }

  // Exit decision inline text
  let exitLabel: React.ReactNode = null
  if (exitDecision) {
    let labelText = ""
    let labelColor = "var(--cb-text-tertiary)"
    if (exitDecision.decision === "URGENT_CLOSE") {
      labelText = "Exit now"
      labelColor = "var(--cb-red)"
    } else if (exitDecision.decision === "CLOSE_BEFORE_BELL") {
      labelText = "Exit today"
      labelColor = "var(--cb-amber)"
    } else if (exitDecision.decision !== "HOLD") {
      labelText = exitDecision.decision.replace(/_/g, " ").toLowerCase()
      labelColor = "var(--cb-text-secondary)"
    }
    if (labelText) {
      exitLabel = (
        <span style={{ fontSize: 10, color: labelColor, fontWeight: 500, letterSpacing: "0.02em" }}>{labelText}</span>
      )
    }
  }

  // Option-specific derived values
  // For short options: a negative change_today_pct means the option lost value = profit
  const isShort = p.qty < 0
  const optBadge = opt
    ? (isShort && opt.type === "P" ? "CSP" : isShort && opt.type === "C" ? "CC" : opt.type === "P" ? "LP" : "LC")
    : null
  const optPctOfMax = opt && p.entry_price > 0
    ? Math.min(100, (p.unrealized_pnl / (Math.abs(p.qty) * p.entry_price * 100)) * 100)
    : null
  // For short options: today's option price move is inverted from P&L direction
  const optTodayColor = opt && isShort
    ? (p.change_today_pct <= 0 ? "var(--cb-green)" : "var(--cb-red)")
    : undefined

  const positionTone = pnlTone(p.unrealized_pnl)

  return (
    <div
      className={`cb-card-t2 ${toneClass(positionTone)} hover:opacity-90 transition-opacity cursor-pointer ${severityClass}`}
      onClick={() => setOpen(o => !o)}
    >
      {/* Main row */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-[var(--cb-text-primary)] text-base">
                {opt ? `${opt.underlying} $${opt.strike}${opt.type}` : p.symbol}
              </span>
              {!opt && COMPANY_NAMES[p.symbol] && (
                <span className="text-[11px]" style={{ color: "var(--cb-text-tertiary)" }}>
                  {COMPANY_NAMES[p.symbol]}
                </span>
              )}
              {optBadge && (
                <span style={{ fontSize: 10, color: "var(--cb-brand)", fontFamily: "monospace", fontWeight: 600 }}>{optBadge}</span>
              )}
              {exitLabel && !opt && <span style={{ color: "var(--cb-border-std)" }}>·</span>}
              {!opt && exitLabel}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {opt ? (
                <>
                  <span style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
                    {opt.expiryLabel} · {opt.dte}d · {isShort ? "short" : "long"} {opt.type === "P" ? "put" : "call"}
                  </span>
                  {exitLabel && <><span style={{ color: "var(--cb-border-std)" }}>·</span>{exitLabel}</>}
                </>
              ) : (
                <>
                  <span style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
                    {p.qty} sh · avg ${p.entry_price?.toFixed(2) ?? "—"} · ${p.market_value?.toLocaleString("en-US", { maximumFractionDigits: 0 }) ?? "—"} value
                  </span>
                  {exitLabel && <span style={{ color: "var(--cb-border-std)" }}>·</span>}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: price + pnl + chevron */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            {opt ? (
              <>
                <div className={`text-base font-medium cb-number ${pnlColor(p.unrealized_pnl)}`}>
                  {fmtAcct(p.unrealized_pnl, "$", "", 2, true)}
                </div>
                <div style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
                  {optPctOfMax != null ? `${optPctOfMax.toFixed(0)}% of max` : `${fmtAcct(p.unrealized_pct, "", "%", 1)} unrealized`}
                </div>
              </>
            ) : (
              <>
                <div className="text-base font-medium text-[var(--cb-text-primary)]">
                  ${p.current_price?.toFixed(2) ?? "—"}
                </div>
                <div className={`text-xs font-medium cb-number ${pnlColor(p.unrealized_pnl)}`}>
                  {fmtAcct(p.unrealized_pnl, "$", "", 2, true)}
                  <span className="opacity-70 ml-1">{fmtAcct(p.unrealized_pct, "", "%", 1)}</span>
                </div>
              </>
            )}
          </div>
          {open
            ? <ChevronUp className="w-4 h-4 shrink-0" style={{ color: "var(--cb-text-tertiary)" }} />
            : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--cb-text-tertiary)" }} />
          }
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div
          className="px-4 pb-3 pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs"
          style={{
            borderTop: "1px solid var(--cb-border-dim)",
            background: "var(--cb-surface-1)",
          }}
        >
          {opt ? (
            <>
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>Strike</div>
                <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>${opt.strike} {opt.type === "P" ? "put" : "call"}</div>
              </div>
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>Expiry</div>
                <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>{opt.expiryLabel} · {opt.dte}d</div>
              </div>
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>Premium sold</div>
                <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>${p.entry_price?.toFixed(2)}/sh</div>
              </div>
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>Current value</div>
                <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>${p.current_price?.toFixed(2)}/sh</div>
              </div>
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>Option today</div>
                <div className="font-medium cb-number" style={{ color: optTodayColor }}>
                  {fmtAcct(p.change_today_pct, "", "%", 2)}
                  {isShort && p.change_today_pct < 0 && (
                    <span style={{ color: "var(--cb-text-tertiary)", fontWeight: 400 }}> (premium decay)</span>
                  )}
                </div>
              </div>
              {underlyingChangePct != null && (
                <div>
                  <div style={{ color: "var(--cb-text-tertiary)" }}>{opt.underlying} today</div>
                  <div className={`font-medium cb-number ${pnlColor(underlyingChangePct)}`}>
                    {fmtAcct(underlyingChangePct, "", "%", 2)}
                    {isShort && opt.type === "P" && underlyingChangePct > 0 && (
                      <span style={{ color: "var(--cb-text-tertiary)", fontWeight: 400 }}> → put OTM</span>
                    )}
                  </div>
                </div>
              )}
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>P&L</div>
                <div className={`font-medium cb-number ${pnlColor(p.unrealized_pnl)}`}>
                  {fmtAcct(p.unrealized_pnl, "$", "", 2, true)}
                  {optPctOfMax != null && <span style={{ color: "var(--cb-text-tertiary)", fontWeight: 400 }}> ({optPctOfMax.toFixed(0)}% of max)</span>}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>Market Value</div>
                <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>${p.market_value?.toFixed(2) ?? "—"}</div>
              </div>
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>Today</div>
                <div className={`font-medium cb-number ${pnlColor(p.change_today_pct)}`}>
                  {fmtAcct(p.change_today_pct, "", "%", 2)}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>Entry</div>
                <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>${p.entry_price?.toFixed(2) ?? "—"}</div>
              </div>
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>Side</div>
                <div className="font-medium capitalize" style={{ color: "var(--cb-text-primary)" }}>{p.side}</div>
              </div>
            </>
          )}
          {exitDecision?.reason && (
            <div className="col-span-2 sm:col-span-4">
              <p style={{ color: "var(--cb-text-secondary)" }} className="leading-snug">{exitDecision.reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PositionsList({ positions, exitCandidates }: { positions: Position[]; exitCandidates: ExitCandidate[] }) {
  if (!positions.length) return (
    <div className="text-sm py-6 text-center" style={{ color: "var(--cb-text-tertiary)" }}>No open positions</div>
  )
  const exitMap = Object.fromEntries(exitCandidates.map(e => [e.symbol, e]))
  // Build a map of underlying stock changes so option rows can show context
  const stockChanges = Object.fromEntries(
    positions
      .filter(p => !parseOptionSymbol(p.symbol))
      .map(p => [p.symbol, p.change_today_pct])
  )
  return (
    <div className="space-y-2">
      {positions.map(p => {
        const opt = parseOptionSymbol(p.symbol)
        return (
          <PositionRow
            key={p.symbol}
            p={p}
            exitDecision={exitMap[p.symbol]}
            underlyingChangePct={opt ? stockChanges[opt.underlying] : undefined}
          />
        )
      })}
    </div>
  )
}

// ─── Exit Candidates standalone (non-position items) ─────────────────────────
function ExitCandidatesPanel({ items, positions }: { items: ExitCandidate[]; positions: Position[] }) {
  const heldSymbols = new Set(positions.map(p => p.symbol))
  const orphaned = items.filter(i => !heldSymbols.has(i.symbol))
  if (!orphaned.length) return null
  return (
    <div className="space-y-2">
      {orphaned.map(item => {
        const urgency = (item.decision ?? "").toUpperCase()
        const exitTone: CardTone =
          urgency === "URGENT_CLOSE" ? "bad"
          : urgency === "CLOSE_BEFORE_BELL" ? "medium"
          : "medium"
        return (
        <div key={item.symbol} className={`cb-card-t2 ${toneClass(exitTone)} p-3 space-y-1`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-[var(--cb-text-primary)]">{item.symbol}</span>
              <span style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>
                {item.decision.replace(/_/g, " ")}
              </span>
            </div>
            {item.unrealized_pnl != null && (
              <span className={`text-xs font-medium cb-number ${pnlColor(item.unrealized_pnl)}`}>
                {fmt(item.unrealized_pnl, "$")} ({fmt(item.unrealized_pct, "", "%", 1)})
              </span>
            )}
          </div>
          <p className="text-xs leading-snug" style={{ color: "var(--cb-text-secondary)" }}>{item.reason}</p>
        </div>
        )
      })}
    </div>
  )
}

// ─── Qualified Setups (Watchlist) ──────────────────────────────────────────────
const COMPANY_NAMES: Record<string, string> = {
  AAPL: "Apple", AMZN: "Amazon", AMD: "Advanced Micro Devices", AVGO: "Broadcom",
  BAC: "Bank of America", CAT: "Caterpillar", COST: "Costco", CVX: "Chevron",
  GS: "Goldman Sachs", JPM: "JPMorgan Chase", KKR: "KKR & Co", LLY: "Eli Lilly",
  META: "Meta Platforms", MS: "Morgan Stanley", MSFT: "Microsoft", NFLX: "Netflix",
  NVDA: "NVIDIA", TSLA: "Tesla", TSM: "Taiwan Semiconductor", GOOG: "Alphabet",
  GOOGL: "Alphabet", UNH: "UnitedHealth", ASML: "ASML Holdings", JNJ: "Johnson & Johnson",
  SPY: "SPDR S&P 500 ETF", QQQ: "Invesco Nasdaq 100 ETF", SGOV: "iShares 0-3M Treasury Bond ETF",
  BIL: "SPDR 1-3M T-Bill ETF",
}

function QualifiedSetups({
  items,
  as_of,
  source,
}: {
  items: WatchlistItem[]
  as_of: string | null
  source: string
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const visibleItems = showAll ? items : items.slice(0, 5)
  if (!items.length) return (
    <div className="py-6 text-center space-y-1">
      <div className="text-sm" style={{ color: "var(--cb-text-tertiary)" }}>
        No qualified setups
      </div>
      <div className="text-[11px]" style={{ color: "var(--cb-text-tertiary)", opacity: 0.55 }}>
        Nightly watchlist generator runs at 11 PM ET
      </div>
    </div>
  )
  return (
    <div className="space-y-2">
      {visibleItems.map(item => (
        <div key={item.symbol} className={`cb-card-t2 ${toneClass(item.tone ?? "medium")}`}>
          <button
            onClick={() => setExpanded(e => e === item.symbol ? null : item.symbol)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
          >
            <div className="flex items-center gap-3">
              <span className={`font-mono font-semibold ${item.in_position ? "text-[var(--cb-text-tertiary)]" : "text-[var(--cb-text-primary)]"}`}>
                {item.symbol}
              </span>
              {COMPANY_NAMES[item.symbol] && (
                <span className="text-[11px]" style={{ color: "var(--cb-text-tertiary)" }}>
                  {COMPANY_NAMES[item.symbol]}
                </span>
              )}
              {item.in_position && (
                <span style={{ fontSize: 9, color: "var(--cb-green)", fontWeight: 500, letterSpacing: "0.04em" }}>HELD</span>
              )}
              {item.modifier === "FULL" ? (
                <span style={{ fontSize: 10, color: "var(--cb-brand)", fontWeight: 500 }}>{item.modifier}</span>
              ) : item.modifier ? (
                <span style={{ fontSize: 10, color: "var(--cb-amber)", fontWeight: 500 }}>{item.modifier}</span>
              ) : null}
            </div>
            <Eye className="w-3.5 h-3.5" style={{ color: "var(--cb-brand-soft)", opacity: 0.7 }} />
          </button>
          {expanded === item.symbol && (
            <div
              className="px-3 pb-3 space-y-1.5 text-xs pt-2"
              style={{ borderTop: "1px solid var(--cb-border-dim)" }}
            >
              {item.trigger && (
                <div>
                  <span style={{ color: "var(--cb-text-tertiary)" }}>Entry: </span>
                  <span style={{ color: "var(--cb-text-secondary)" }}>{item.trigger}</span>
                </div>
              )}
              {item.stop && (
                <div>
                  <span style={{ color: "var(--cb-text-tertiary)" }}>Stop: </span>
                  <span style={{ color: "var(--cb-text-secondary)" }}>{item.stop}</span>
                </div>
              )}
              {item.target && (
                <div>
                  <span style={{ color: "var(--cb-text-tertiary)" }}>Target: </span>
                  <span style={{ color: "var(--cb-text-secondary)" }}>{item.target}</span>
                </div>
              )}
              {item.note && (
                <div>
                  <span style={{ color: "var(--cb-text-tertiary)" }}>Note: </span>
                  <span style={{ color: "var(--cb-text-tertiary)", fontStyle: "italic" }}>{item.note}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {items.length > 5 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full py-2 text-[11px] hover:opacity-80 transition-opacity"
          style={{ color: "var(--cb-brand-soft)" }}
        >
          {showAll ? `Show less` : `Show ${items.length - 5} more`}
        </button>
      )}

      <div className="pt-1 flex items-center justify-between text-[10px]" style={{ color: "var(--cb-text-tertiary)", opacity: 0.5 }}>
        {as_of && (
          <span>{source === "weekly" ? "Weekly watchlist" : "Strategy spec"} · as of {as_of}</span>
        )}
        <span className="ml-auto">
          <span style={{ color: "var(--cb-brand)" }}>FULL</span> full size ·{" "}
          <span style={{ color: "var(--cb-amber)" }}>HALF</span> / <span style={{ color: "var(--cb-amber)" }}>SMALL</span> reduced
        </span>
      </div>
    </div>
  )
}

// ─── BPS Panel ────────────────────────────────────────────────────────────────
function BpsSpreadRow({ p }: { p: BpsPosition }) {
  const [open, setOpen] = useState(false)
  const plColor = p.current_pl == null
    ? "var(--cb-text-tertiary)"
    : p.current_pl >= 0 ? "var(--cb-green)" : "var(--cb-steel)"
  const profitPct = p.profit_pct_of_max

  return (
    <div className="cb-card-t2 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setOpen(o => !o)}>
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-[var(--cb-text-primary)] text-base">{p.symbol}</span>
            <span style={{ fontSize: 10, color: "var(--cb-brand)", fontFamily: "monospace" }}>BPS</span>
            <span style={{ fontSize: 10, color: "var(--cb-text-tertiary)", fontFamily: "monospace" }}>
              ${p.short_strike}/${p.long_strike}P
            </span>
            {p.exit_reasons.length > 0 && p.exit_reasons.map((r, i) => (
              <span key={i} style={{ fontSize: 9, color: "var(--cb-amber)", fontWeight: 500 }}>{r}</span>
            ))}
          </div>
          <div className="mt-0.5" style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
            exp {p.expiry} · {p.dte}d · {p.contracts} contract{p.contracts !== 1 ? "s" : ""} · width ${p.width}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-medium cb-number" style={{ color: plColor }}>
            {p.current_pl != null ? `${p.current_pl >= 0 ? "+" : ""}$${p.current_pl.toFixed(2)}` : "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
            {profitPct != null ? `${profitPct.toFixed(0)}% of max` : `max $${p.max_profit.toFixed(2)}`}
          </div>
        </div>
      </div>
      {open && (
        <div
          className="px-4 pb-3 pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs"
          style={{ borderTop: "1px solid var(--cb-border-dim)", background: "var(--cb-surface-1)" }}
        >
          <div>
            <div style={{ color: "var(--cb-text-tertiary)" }}>Net Credit</div>
            <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>${p.net_credit.toFixed(2)}/sh</div>
          </div>
          <div>
            <div style={{ color: "var(--cb-text-tertiary)" }}>Collateral</div>
            <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>${p.collateral.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ color: "var(--cb-text-tertiary)" }}>Max Profit</div>
            <div className="font-medium" style={{ color: "var(--cb-green)" }}>${p.max_profit.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ color: "var(--cb-text-tertiary)" }}>Max Loss</div>
            <div className="font-medium" style={{ color: "var(--cb-steel)" }}>${p.max_loss.toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function BpsTargetRow({ t }: { t: BpsTarget }) {
  const [open, setOpen] = useState(false)
  const decisionColor = t.decision === "APPROVE" ? "var(--cb-green)" : "var(--cb-amber)"
  const ratioColor =
    (t.credit_width_ratio ?? 0) >= 0.45 ? "var(--cb-green)"
    : (t.credit_width_ratio ?? 0) >= 0.40 ? "var(--cb-amber)"
    : "var(--cb-text-secondary)"

  return (
    <div className="cb-card-t2 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setOpen(o => !o)}>
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-[var(--cb-text-primary)] text-base">{t.symbol}</span>
            <span style={{ fontSize: 10, color: decisionColor, fontWeight: 600 }}>{t.decision}</span>
            {t.selected && (
              <span style={{ fontSize: 9, color: "var(--cb-brand)", fontWeight: 500, letterSpacing: "0.04em" }}>SELECTED</span>
            )}
            {t.sector && (
              <span style={{ fontSize: 9, color: "var(--cb-text-tertiary)" }}>{t.sector}</span>
            )}
          </div>
          <div className="mt-0.5" style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
            {t.short_strike != null && t.long_strike != null
              ? `$${t.short_strike}/$${t.long_strike}P · `
              : ""}
            {t.expiry ?? "—"} · {t.dte != null ? `${t.dte}d` : "—"}
          </div>
        </div>
        <div className="text-right">
          {t.credit_width_ratio != null ? (
            <>
              <div className="text-base font-medium cb-number" style={{ color: ratioColor }}>
                {(t.credit_width_ratio * 100).toFixed(0)}%
                <span className="text-xs ml-1 font-normal" style={{ color: "var(--cb-text-tertiary)" }}>c/w</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
                {t.net_credit != null ? `$${t.net_credit.toFixed(2)} credit` : ""}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--cb-text-tertiary)" }}>pending</div>
          )}
        </div>
      </div>
      {open && t.rationale && (
        <div
          className="px-4 pb-3 pt-2 text-xs leading-snug"
          style={{ borderTop: "1px solid var(--cb-border-dim)", color: "var(--cb-text-secondary)" }}
        >
          <span style={{ color: "var(--cb-text-tertiary)" }}>Agent-20: </span>
          {t.rationale}
        </div>
      )}
    </div>
  )
}


// ─── Trading tabs + sleeves ──────────────────────────────────────────────────
type TradingTab = "home" | "stocks" | "options" | "crypto"
type Sleeve = "stocks" | "options" | "crypto"

const TAB_META: Record<TradingTab, { label: string; accent: string }> = {
  home:    { label: "Home",    accent: "#e3e6f0" },  // near-white, neutral — portfolio-wide
  stocks:  { label: "Stocks",  accent: "#10b981" },
  options: { label: "Options", accent: "#d4c28a" },
  crypto:  { label: "Crypto",  accent: "#8b5cf6" },
}
const SLEEVE_META = TAB_META  // back-compat alias used by sleeve sub-components

function fmtSleeveUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v < 0.5) return "—"
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

// Underlined tabs — product-level control, not a content widget.
// Home gets a neutral near-white accent, each sleeve gets its chromatic accent.
function TradingTabs({ active, onChange }: { active: TradingTab; onChange: (t: TradingTab) => void }) {
  const order: TradingTab[] = ["home", "stocks", "options", "crypto"]
  return (
    <div
      className="flex items-center gap-7 sm:gap-9 overflow-x-auto snap-x -mx-4 px-4 sm:-mx-6 sm:px-6"
      style={{ borderBottom: "1px solid var(--cb-border-dim)", scrollbarWidth: "none" }}
    >
      {order.map(tab => {
        const meta = TAB_META[tab]
        const isActive = active === tab
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className="relative shrink-0 snap-start pt-1 pb-3 transition-colors outline-none"
            style={{
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: isActive ? "var(--cb-text-primary)" : "var(--cb-text-tertiary)",
            }}
          >
            {meta.label}
            <span
              aria-hidden
              className="absolute left-0 right-0 bottom-[-1px] transition-all duration-200"
              style={{
                height: 2,
                background: isActive ? meta.accent : "transparent",
                boxShadow: isActive ? `0 0 10px ${meta.accent}55` : "none",
                borderRadius: 1,
              }}
            />
          </button>
        )
      })}
    </div>
  )
}

// Compact placeholder banner for sleeves without real capital/data.
function SleeveCapitalPlaceholder({ accent, title, message, sub }: {
  accent: string; title: string; message: string; sub?: string
}) {
  return (
    <div
      className="rounded-xl px-5 py-5"
      style={{
        background: `radial-gradient(circle at 12% 10%, ${accent}14, transparent 48%), var(--cb-surface-0)`,
        border: `1px solid ${accent}33`,
      }}
    >
      <div className="cb-label mb-2">{title}</div>
      <div style={{ fontSize: 13, color: "var(--cb-text-primary)", lineHeight: 1.55 }}>
        {message}
      </div>
      {sub && (
        <div className="mt-3" style={{ fontSize: 11, color: "var(--cb-text-secondary)", lineHeight: 1.5 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// Placeholder chart card for sleeves without data yet.
function ChartPlaceholder({ label, height = 160 }: { label: string; height?: number }) {
  return (
    <div className="cb-card-t2 px-4 pt-4 pb-6">
      <div className="cb-label mb-3">{label}</div>
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-xs" style={{ color: "var(--cb-text-tertiary)" }}>
          Awaiting first sleeve-scoped feed
        </p>
      </div>
    </div>
  )
}

// ─── Home view — portfolio-wide, the default landing ──────────────────────────
function HomeView({ data }: { data: TradingData }) {
  return (
    <div className="space-y-8">
      <p style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--cb-text-tertiary)", opacity: 0.55 }}>
        Portfolio overview · {data.operator?.mode?.current_mode ?? data.tunables.trading_mode} · {titleizeToken(data.operator?.mode?.broker_environment ?? data.tunables.trading_mode)} broker
      </p>

      <section>
        <CapitalHero account={data.account} />
      </section>

      <section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EquityCurve data={data.equity_curve} baseValue={data.account.base_value} />
          <DailyPnlChart data={data.daily_performance} />
        </div>
      </section>

      <section>
        <PerformanceGrid kpis={data.kpis} />
      </section>

      <section>
        <OperatorOverview data={data} tunables={data.tunables} />
      </section>
    </div>
  )
}


// ─── Sleeve positions mini-chart ──────────────────────────────────────────────
// Hand-rolled horizontal bar chart showing today's % move for each open position.
// Lives inside a sleeve (not portfolio-level) so it reflects just what's invested.
function SleevePositionsChart({ positions }: { positions: Position[] }) {
  if (!positions.length) return null
  const maxAbs = Math.max(...positions.map(p => Math.abs(p.change_today_pct ?? 0)), 0.5)
  return (
    <div className="cb-card-t2 px-4 pt-4 pb-4">
      <div className="cb-label mb-3">Today&rsquo;s moves · sleeve positions</div>
      <div className="space-y-1.5">
        {positions.map(p => {
          const pct = p.change_today_pct ?? 0
          const pctWidth = (Math.abs(pct) / maxAbs) * 48
          const isPositive = pct >= 0
          const opt = parseOptionSymbol(p.symbol)
          const label = opt ? `${opt.underlying} ${opt.strike}${opt.type}` : p.symbol
          return (
            <div key={p.symbol} className="flex items-center gap-2 text-[11px]">
              <span className="font-mono w-16 truncate" style={{ color: "var(--cb-text-secondary)" }} title={label}>
                {label}
              </span>
              <div className="flex-1 relative h-4 flex items-center">
                <div className="absolute top-0 bottom-0" style={{ left: "50%", width: 1, background: "var(--cb-border-std)" }} />
                <div
                  className="absolute top-0.5 bottom-0.5 rounded-sm transition-all"
                  style={{
                    [isPositive ? "left" : "right"]: "50%",
                    width: `${pctWidth}%`,
                    background: isPositive ? "var(--cb-green)" : "var(--cb-red)",
                    opacity: 0.85,
                  }}
                />
              </div>
              <span
                className="cb-number text-right tabular-nums"
                style={{
                  width: 56,
                  color: isPositive ? "var(--cb-green)" : "var(--cb-red)",
                  fontWeight: 400,
                }}
              >
                {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StocksSleeve({ data }: { data: TradingData }) {
  const equityPositions = data.positions.filter(p => !parseOptionSymbol(p.symbol))
  const equitySymbols = new Set(equityPositions.map(p => p.symbol))
  const equityExits = data.exit_candidates.filter(e => equitySymbols.has(e.symbol) || !data.positions.find(p => p.symbol === e.symbol && parseOptionSymbol(p.symbol)))

  const allocation = data.account.equity_deployed
    ?? equityPositions.reduce((acc, p) => acc + (p.market_value ?? 0), 0)
  const totalDeployed = data.account.positions_value ?? 0
  const deployedPct = totalDeployed > 0 ? (allocation / totalDeployed) * 100 : null

  const modeLabel = data.operator?.mode?.current_mode
    ? titleizeToken(data.operator.mode.current_mode)
    : titleizeToken(data.tunables.trading_mode)

  // Strategy universe — always show when an active strategy has symbols.
  // Annotate each symbol with its status today (held / qualified today / awaiting).
  const activeStrategy = data.operator?.strategy_bank?.active
  const strategySymbols: string[] = activeStrategy?.symbols ?? []
  const heldSymbols = new Set(equityPositions.map(p => p.symbol))
  const qualifiedSymbols = new Set(data.watchlist.items.map(i => i.symbol))
  const qualifiedToday = strategySymbols.filter(s => qualifiedSymbols.has(s)).length

  const positionBySymbol = new Map(equityPositions.map(p => [p.symbol, p]))
  const universeItems = strategySymbols.length > 0
    ? strategySymbols.map(sym => {
        const held = heldSymbols.has(sym)
        const qualified = qualifiedSymbols.has(sym)
        const watchlistEntry = data.watchlist.items.find(i => i.symbol === sym)
        // Tone: held → today's performance; otherwise champagne (optimistic candidate)
        const heldPos = held ? positionBySymbol.get(sym) : null
        const tone: "good" | "medium" | "bad" = heldPos
          ? pnlTone(heldPos.change_today_pct)
          : "medium"
        return {
          symbol: sym,
          in_position: held,
          modifier: watchlistEntry?.modifier ?? "",
          trigger: watchlistEntry?.trigger
            ?? (activeStrategy?.strategy_family === "REGIME_AWARE_MOMENTUM" ? "Momentum signal + regime filter" : ""),
          stop: watchlistEntry?.stop
            ?? (activeStrategy?.stop_loss_pct ? `${activeStrategy.stop_loss_pct}% stop loss` : ""),
          target: watchlistEntry?.target
            ?? (activeStrategy?.target_pct ? `${activeStrategy.target_pct}% profit target` : ""),
          note: held
            ? "Currently held"
            : qualified
              ? "Qualified today — entry signal active"
              : "In strategy universe · awaiting entry signal",
          tone,
        }
      })
    : data.watchlist.items

  const universeLabel = strategySymbols.length > 0
    ? `Strategy Universe · ${strategySymbols.length} names`
    : `Qualified Setups · ${data.watchlist.items.length}`

  // Suppress unused-var warnings — allocation/deployedPct/modeLabel still useful
  // if SleeveHeader is reintroduced later; kept computed for v2 feed transition.
  void allocation; void deployedPct; void modeLabel;

  return (
    <div className="space-y-8">
      <p style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--cb-text-tertiary)", opacity: 0.55 }}>
        Stocks sleeve · regime-aware equities · showing portfolio-level figures until feed v2 lands per-sleeve
      </p>

      {/* Stocks capital banner — today duplicates portfolio since ~100% stocks */}
      <section>
        <CapitalHero account={data.account} />
      </section>

      {/* Stocks performance charts — duplicate of home until feed v2 splits per-sleeve */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EquityCurve data={data.equity_curve} baseValue={data.account.base_value} />
          <DailyPnlChart data={data.daily_performance} />
        </div>
      </section>

      {/* Strategy KPIs for stocks */}
      <section>
        <PerformanceGrid kpis={data.kpis} />
      </section>

      {/* Open positions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <span className="cb-label">Open Positions · {equityPositions.length}</span>
          {equityExits.length > 0 && (
            <span className="text-[10px]" style={{ color: "var(--cb-amber)" }}>
              {equityExits.length} exit signal{equityExits.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <PositionsList positions={equityPositions} exitCandidates={equityExits} />
      </section>

      {/* Today's moves — mini-chart of what's invested, not the whole equity */}
      <section>
        <SleevePositionsChart positions={equityPositions} />
      </section>

      {/* Exit signals not tied to current positions */}
      {equityExits.some(e => !equityPositions.find(p => p.symbol === e.symbol)) && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <span className="cb-label">Exit Signals · No Current Position</span>
          </div>
          <ExitCandidatesPanel items={equityExits} positions={equityPositions} />
        </section>
      )}

      {/* Strategy universe — always visible when an active strategy exists */}
      {universeItems.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <span className="cb-label">{universeLabel}</span>
            {strategySymbols.length > 0 && (
              <span className="text-[10px]" style={{ color: "var(--cb-text-tertiary)" }}>
                {qualifiedToday > 0 ? `${qualifiedToday} qualified today` : "none qualified today"} · {heldSymbols.size} held
              </span>
            )}
          </div>
          <QualifiedSetups
            items={universeItems}
            as_of={data.watchlist.as_of ?? new Date().toISOString().slice(0, 10)}
            source={strategySymbols.length > 0 ? "active_strategy" : data.watchlist.source}
          />
        </section>
      )}

      {/* Active strategy — bottom of sleeve */}
      <PromotedStrategy bank={data.operator?.strategy_bank} />
    </div>
  )
}

function OptionsSleeve({ data }: { data: TradingData }) {
  const optionPositions = data.positions.filter(p => parseOptionSymbol(p.symbol))
  const meta = SLEEVE_META.options

  return (
    <div className="space-y-8">
      <p style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--cb-text-tertiary)", opacity: 0.55 }}>
        Options sleeve · derivatives · awaiting first promoted strategy
      </p>

      {/* Options capital banner — templated */}
      <SleeveCapitalPlaceholder
        accent={meta.accent}
        title="Deployed capital"
        message="$0 deployed in options. Sleeve activates once a directional spread or covered-call strategy clears the bench."
        sub="Per-sleeve capital breakdown lands with operator-feed v2."
      />

      {/* Options charts — placeholders */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartPlaceholder label="Options sleeve equity" />
          <ChartPlaceholder label="Options daily P&L" height={120} />
        </div>
      </section>

      {/* Options KPIs — placeholder grid */}
      <section>
        <div className="cb-label mb-3">Strategy KPIs</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {["Win rate", "Profit factor", "Expectancy", "Max drawdown"].map(label => (
            <div key={label} className="cb-metric cb-tone-medium">
              <div className="cb-number" style={{ fontSize: 20, fontWeight: 300, color: "var(--cb-text-tertiary)" }}>—</div>
              <div className="flex items-center gap-1 mt-1.5" style={{ fontSize: 9, color: "var(--cb-text-secondary)", letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.7 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Option positions */}
      {optionPositions.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <span className="cb-label">Open Option Positions · {optionPositions.length}</span>
          </div>
          <PositionsList positions={optionPositions} exitCandidates={data.exit_candidates} />
        </section>
      ) : (
        <section>
          <div className="cb-label mb-3">Open Positions · 0</div>
          <div
            className="rounded-xl px-5 py-4"
            style={{
              background: `radial-gradient(circle at 12% 10%, ${meta.accent}10, transparent 48%), var(--cb-surface-0)`,
              border: `1px solid var(--cb-border-std)`,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--cb-text-secondary)" }}>
              No open option positions.
            </div>
          </div>
        </section>
      )}

      {/* Active strategy — bottom */}
      <div className="cb-card-t3 cb-tone-medium px-4 py-3">
        <div className="cb-label mb-1">Active strategy</div>
        <div style={{ fontSize: 13, color: "var(--cb-text-primary)" }}>
          None promoted yet
        </div>
        <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)", marginTop: 4 }}>
          Options research parked — see redesign plan Phase 4
        </div>
      </div>
    </div>
  )
}

function CryptoSleeve() {
  const meta = SLEEVE_META.crypto
  const universe = ["BTC", "ETH", "SOL", "LINK", "AVAX", "ADA", "XRP", "DOGE", "LTC", "BCH"]

  return (
    <div className="space-y-8">
      <p style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--cb-text-tertiary)", opacity: 0.55 }}>
        Crypto sleeve · 24/7 research · SHADOW · paper data pending
      </p>

      {/* Crypto capital banner — templated */}
      <SleeveCapitalPlaceholder
        accent={meta.accent}
        title="Deployed capital"
        message="$0 deployed in crypto. Integration lands after equities checkpoint 05 passes and the first crypto campaign closes a promoted backtest."
        sub={`First strategy family: crypto_regime_aware_momentum. Data provider: Alpaca (paper) with Coinbase planned for live.`}
      />

      {/* Crypto charts — placeholders */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartPlaceholder label="Crypto sleeve equity" />
          <ChartPlaceholder label="Crypto daily P&L" height={120} />
        </div>
      </section>

      {/* Crypto KPIs — placeholder grid */}
      <section>
        <div className="cb-label mb-3">Strategy KPIs</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {["Win rate", "Profit factor", "Expectancy", "Max drawdown"].map(label => (
            <div key={label} className="cb-metric cb-tone-medium">
              <div className="cb-number" style={{ fontSize: 20, fontWeight: 300, color: "var(--cb-text-tertiary)" }}>—</div>
              <div className="flex items-center gap-1 mt-1.5" style={{ fontSize: 9, color: "var(--cb-text-secondary)", letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.7 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Positions placeholder */}
      <section>
        <div className="cb-label mb-3">Open Positions · 0</div>
        <div
          className="rounded-xl px-5 py-4"
          style={{
            background: `radial-gradient(circle at 12% 10%, ${meta.accent}10, transparent 48%), var(--cb-surface-0)`,
            border: `1px solid var(--cb-border-std)`,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--cb-text-secondary)" }}>
            No crypto positions yet.
          </div>
        </div>
      </section>

      {/* Today's plan + bench summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="cb-card-t3 cb-tone-medium px-4 py-3">
          <div className="cb-label mb-1">Today&rsquo;s plan</div>
          <div style={{ fontSize: 13, color: "var(--cb-text-primary)" }}>
            Plan generation not live
          </div>
          <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)", marginTop: 4 }}>
            Landing with operator-feed v2
          </div>
        </div>
        <div className="cb-card-t3 cb-tone-medium px-4 py-3">
          <div className="cb-label mb-1">Bench summary</div>
          <div style={{ fontSize: 13, color: "var(--cb-text-primary)" }}>
            No bench runs queued
          </div>
          <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)", marginTop: 4 }}>
            Will populate from Q-077 overnight runs
          </div>
        </div>
      </div>

      {/* Planned universe chips */}
      <section>
        <div className="cb-label mb-3">Planned universe · {universe.length} liquids</div>
        <div className="flex flex-wrap gap-2">
          {universe.map(sym => (
            <span
              key={sym}
              className="rounded-full px-3 py-1 font-mono"
              style={{
                fontSize: 11,
                background: `${meta.accent}12`,
                border: `1px solid ${meta.accent}33`,
                color: "var(--cb-text-primary)",
                letterSpacing: "0.02em",
              }}
            >
              {sym}
            </span>
          ))}
        </div>
      </section>

      {/* Active strategy — bottom */}
      <div className="cb-card-t3 cb-tone-medium px-4 py-3">
        <div className="cb-label mb-1">Active strategy</div>
        <div style={{ fontSize: 13, color: "var(--cb-text-primary)" }}>
          None promoted yet
        </div>
        <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)", marginTop: 4 }}>
          Awaiting first clean bench run
        </div>
      </div>
    </div>
  )
}

// ─── Assistant sheet ──────────────────────────────────────────────────────────
// Overlay chat surface — replaces the old full-page /chat tab. Desktop renders
// as a right-anchored 420px panel; mobile as a bottom sheet at 78vh. Backdrop
// blur lets the dashboard show through so context stays visible.

function contextChipsForTab(tab: TradingTab): string[] {
  switch (tab) {
    case "home":
      return [
        "Explain today's P&L",
        "Any incidents right now?",
        "Summarize the portfolio",
        "What changed overnight?",
      ]
    case "stocks":
      return [
        "How's the stocks sleeve doing?",
        "Explain the active strategy",
        "Why these six names?",
        "What would trigger a new entry?",
      ]
    case "options":
      return [
        "What's blocking options from going live?",
        "Which strategies are on the bench for options?",
      ]
    case "crypto":
      return [
        "When does crypto come online?",
        "Explain the planned crypto universe",
        "What's checkpoint 05?",
      ]
  }
}

function AssistantSheet({ open, onClose, activeTab }: {
  open: boolean
  onClose: () => void
  activeTab: TradingTab
}) {
  const transport = useMemo(() => new TextStreamChatTransport({ api: "/api/chat" }), [])
  const chat = useChat({ transport })
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Auto-scroll to bottom only when new messages arrive — never on open.
  // Opening the sheet should show chips at the top, not shove them off-screen.
  useEffect(() => {
    if (scrollRef.current && chat.messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chat.messages])

  // When sheet opens with an existing conversation, park at the bottom so the
  // latest message is visible. Empty state: scroll to top so chips show.
  useEffect(() => {
    if (!open || !scrollRef.current) return
    if (chat.messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    } else {
      scrollRef.current.scrollTop = 0
    }
  }, [open, chat.messages.length])

  // Esc to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // Lock body scroll while sheet is open so the page behind can't drift.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Focus input on desktop only — mobile auto-focus pops the keyboard and
  // eats space before the user can see the suggested chips.
  useEffect(() => {
    if (!open || !inputRef.current) return
    if (typeof window !== "undefined" && window.innerWidth >= 640) {
      inputRef.current.focus()
    }
  }, [open])

  const isLoading = chat.status === "streaming" || chat.status === "submitted"

  const send = () => {
    const text = input.trim()
    if (!text || isLoading) return
    chat.sendMessage({ text })
    setInput("")
    if (inputRef.current) inputRef.current.style.height = "auto"
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = "auto"
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"
  }

  if (!mounted) return null

  const chips = contextChipsForTab(activeTab)
  const tabMeta = TAB_META[activeTab]

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-[45] transition-opacity duration-200"
        style={{
          background: "rgba(5, 8, 26, 0.40)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {/* Sheet — desktop right overlay / mobile bottom sheet */}
      <div
        role="dialog"
        aria-label="ClawBoy Assistant"
        className={`fixed z-[50] flex flex-col transition-transform duration-300 ease-out
          sm:top-0 sm:right-0 sm:bottom-0 sm:h-auto sm:w-[420px] sm:max-w-[94vw] sm:rounded-none
          left-0 right-0 bottom-0 h-[78vh] rounded-t-3xl
          ${open
            ? "translate-y-0 sm:translate-x-0"
            : "translate-y-full sm:translate-y-0 sm:translate-x-full"
          }`}
        style={{
          background: "rgba(10, 14, 31, 0.97)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid var(--cb-border-hi)",
          borderLeft: "1px solid var(--cb-border-hi)",
          boxShadow: "0 -20px 60px rgba(5, 8, 26, 0.6), -20px 0 60px rgba(5, 8, 26, 0.55)",
        }}
      >
        {/* Mobile grab handle */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--cb-border-std)" }} />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--cb-border-dim)" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: tabMeta.accent }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--cb-text-primary)", letterSpacing: "0.01em" }}>
              Talon
            </span>
            <span style={{ fontSize: 10, color: "var(--cb-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              · {tabMeta.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {chat.messages.length > 0 && (
              <button
                onClick={() => chat.setMessages([])}
                aria-label="Clear conversation"
                className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--cb-text-tertiary)" }} />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close assistant"
              className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" style={{ color: "var(--cb-text-tertiary)" }} />
            </button>
          </div>
        </div>

        {/* Messages + empty state */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
          {chat.messages.length === 0 && (
            <div className="space-y-4 py-2">
              <div className="text-xs leading-relaxed" style={{ color: "var(--cb-text-secondary)" }}>
                Ask anything about your portfolio, today&rsquo;s plan, the active strategy, or the market regime.
                I have live context from the operator feed.
              </div>
              <div className="space-y-2">
                <div className="cb-label">Suggested</div>
                <div className="flex flex-col gap-1.5">
                  {chips.map(chip => (
                    <button
                      key={chip}
                      onClick={() => chat.sendMessage({ text: chip })}
                      className="text-left text-xs px-3 py-2 rounded-lg transition-colors hover:bg-white/5"
                      style={{
                        border: "1px solid var(--cb-border-std)",
                        color: "var(--cb-text-secondary)",
                        background: "rgba(14, 20, 40, 0.55)",
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {chat.messages.map(m => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user" ? "rounded-br-md" : "rounded-bl-md"
                }`}
                style={
                  m.role === "user"
                    ? {
                        background: `radial-gradient(circle at 20% 20%, ${tabMeta.accent}26, transparent 55%), rgba(14, 20, 40, 0.92)`,
                        border: `1px solid ${tabMeta.accent}33`,
                        color: "var(--cb-text-primary)",
                      }
                    : {
                        background: "rgba(14, 20, 40, 0.85)",
                        border: "1px solid var(--cb-border-std)",
                        color: "var(--cb-text-secondary)",
                      }
                }
              >
                {m.parts?.map((part, i) => part.type === "text" ? <span key={i}>{part.text}</span> : null)}
              </div>
            </div>
          ))}

          {isLoading && chat.messages[chat.messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div
                className="rounded-2xl rounded-bl-md px-3.5 py-2.5"
                style={{ background: "rgba(14, 20, 40, 0.85)", border: "1px solid var(--cb-border-std)" }}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--cb-text-tertiary)" }} />
              </div>
            </div>
          )}

          {chat.error && (
            <div className="flex justify-start">
              <div
                className="rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed max-w-[86%]"
                style={{
                  background: "rgba(40, 14, 20, 0.85)",
                  border: "1px solid rgba(224, 82, 82, 0.35)",
                  color: "var(--cb-text-secondary)",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--cb-red)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                  Connection error
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                  {chat.error.message || "Couldn't reach the assistant endpoint."}
                </div>
                <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)", marginTop: 6 }}>
                  Check that /api/chat is deployed and ANTHROPIC_API_KEY is set in Vercel env.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div
          className="px-4 sm:px-5 py-3 shrink-0"
          style={{ borderTop: "1px solid var(--cb-border-dim)" }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={`Ask about ${activeTab === "home" ? "the portfolio" : `the ${tabMeta.label.toLowerCase()} sleeve`}...`}
              rows={1}
              className="flex-1 resize-none rounded-xl px-3.5 py-2 text-sm outline-none placeholder:text-[var(--cb-text-tertiary)]"
              style={{
                background: "rgba(14, 20, 40, 0.85)",
                border: "1px solid var(--cb-border-std)",
                color: "var(--cb-text-primary)",
              }}
            />
            <button
              onClick={send}
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
              className="p-2 rounded-xl transition-all disabled:opacity-30"
              style={{
                background: input.trim() ? `${tabMeta.accent}26` : "transparent",
                border: `1px solid ${input.trim() ? tabMeta.accent + "55" : "var(--cb-border-std)"}`,
                color: tabMeta.accent,
              }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function TradingDashboard({ initialData }: { initialData: TradingData | null }) {
  const [data, setData] = useState<TradingData | null>(initialData)
  const [lastFetched, setLastFetched] = useState(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<TradingTab>("home")
  const [assistantOpen, setAssistantOpen] = useState(false)

  // Cmd+J / Ctrl+J toggles assistant
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        setAssistantOpen(v => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [staticRes, liveRes] = await Promise.all([
        fetch("/api/trading", { cache: "no-store" }),
        fetch("/api/trading/live", { cache: "no-store" }).catch(() => null),
      ])
      if (staticRes.ok) {
        const json = await staticRes.json()
        // Merge live Alpaca data if available
        if (liveRes?.ok) {
          try {
            const live = await liveRes.json()
            if (live.positions && !live.error) {
              // Replace equity positions with live data (options separated)
              json.positions = live.positions.map((lp: Record<string, unknown>) => ({
                symbol: lp.symbol,
                qty: lp.qty,
                side: lp.side,
                entry_price: lp.avg_entry,
                current_price: lp.current_price,
                market_value: lp.market_value,
                unrealized_pnl: lp.unrealized_pnl,
                unrealized_pct: lp.unrealized_pct,
                change_today_pct: lp.change_today_pct ?? 0,
              }))
              // Merge live options positions — route to Wheel (CSP/sold) or Hedges (long puts)
              if (live.options_positions?.length > 0) {
                if (!json.options) {
                  json.options = { gate: { status: "PASS", checked_at: null, csp_slots_used: 0, csp_slots_max: 2, available_capital: null, cash_buffer_pct: null }, candidates: [], screened: [], active_trades: [], executions: [], scan_summary: null, as_of: null }
                }

                const mapPosition = (op: Record<string, unknown>) => ({
                  symbol: op.symbol as string,
                  type: op.type as string,
                  strike: op.strike as number,
                  expiry: op.expiry as string,
                  dte: op.dte as number,
                  contracts: op.contracts as number,
                  limit_price: op.avg_entry as number,
                  wheel_state: op.side === "short" ? "CSP_OPEN" : "OPEN",
                  status: "FILLED",
                  current_price: op.current_price as number,
                  market_value: Math.abs(op.market_value as number),
                  unrealized_pnl: op.unrealized_pnl as number,
                  unrealized_pct: op.unrealized_pct as number,
                  side: op.side as string,
                })

                // Long puts = hedges (protective puts). Short puts = wheel (CSP).
                const longPuts = live.options_positions.filter(
                  (op: Record<string, unknown>) => op.side === "long" && op.type === "PUT"
                )
                const wheelPositions = live.options_positions.filter(
                  (op: Record<string, unknown>) => !(op.side === "long" && op.type === "PUT")
                )

                json.options.active_trades = wheelPositions.map(mapPosition)

                // Merge long puts into hedges as live positions
                if (longPuts.length > 0) {
                  if (!json.hedges) {
                    json.hedges = { status: "live", regime: { vix_level: null, vix_regime: null, cb_state: null, active: true }, routing_reason: "live positions", positions_screened: 0, candidates_found: 0, candidates: [], as_of: live.fetched_at as string }
                  }
                  json.hedges.live_positions = longPuts.map(mapPosition)
                }

                json.options.gate.csp_slots_used = wheelPositions.filter(
                  (op: Record<string, unknown>) => op.side === "short" && op.type === "PUT"
                ).length
              }
              // Update account with live values
              if (live.account) {
                json.account = {
                  ...json.account,
                  equity: live.account.equity,
                  cash: live.account.cash,
                  buying_power: live.account.buying_power,
                  positions_value: live.account.positions_value,
                  equity_deployed: live.account.equity_deployed ?? null,
                  options_deployed: live.account.options_deployed ?? null,
                  total_pnl: live.account.equity - (json.account.base_value ?? 100000),
                  total_pnl_pct: ((live.account.equity - (json.account.base_value ?? 100000)) / (json.account.base_value ?? 100000)) * 100,
                }
                // Append today's equity to the curve if not already there
                const today = new Date().toISOString().slice(0, 10)
                const curve = json.equity_curve ?? []
                const lastEntry = curve[curve.length - 1]
                if (lastEntry && lastEntry.date !== today) {
                  curve.push({
                    date: today,
                    equity: live.account.equity,
                    profit_loss: live.account.equity - (lastEntry?.equity ?? live.account.equity),
                    profit_loss_pct: lastEntry?.equity ? ((live.account.equity - lastEntry.equity) / lastEntry.equity) * 100 : 0,
                  })
                  json.equity_curve = curve
                } else if (lastEntry && lastEntry.date === today) {
                  lastEntry.equity = live.account.equity
                }
              }
              // Update KPIs with live data
              if (live.kpis) {
                // Only merge live KPI fields that have real values.
                // The live API computes KPIs from a 50-order window which is often
                // incomplete (no matched buy-sell pairs). Don't overwrite the accurate
                // static KPIs (from performance_aggregator.py) with nulls/zeros.
                const liveKpis = live.kpis as Record<string, unknown>
                for (const [k, v] of Object.entries(liveKpis)) {
                  if (v != null && v !== 0) {
                    (json.kpis as Record<string, unknown>)[k] = v
                  }
                }
              }
              // Filter exit candidates to only held positions
              if (json.exit_candidates) {
                const heldSymbols = new Set(live.positions.map((p: Record<string, unknown>) => p.symbol))
                json.exit_candidates = json.exit_candidates.filter(
                  (e: { symbol: string }) => heldSymbols.has(e.symbol)
                )
              }
            }
          } catch {
            // live merge failed — use static data as-is
          }
        }
        setData(json)
        setLastFetched(new Date())
      }
    } catch {
      // silently fail — keep stale data
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Fetch live data immediately on mount, then poll every 60 seconds
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  // Also refresh on tab focus
  useEffect(() => {
    const onFocus = () => refresh()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [refresh])

  if (!data) {
    return (
      <div className="flex flex-col h-screen text-[var(--cb-text-primary)]">
        <Nav active="trading" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div style={{ color: "var(--cb-text-secondary)" }}>No trading data found</div>
            <div className="text-xs font-mono" style={{ color: "var(--cb-text-tertiary)" }}>python3 scripts/push-trading-data.py</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[var(--cb-text-primary)] font-sans pb-16 sm:pb-0">
      <Nav active="trading" />

      <CommandStrip
        tunables={data.tunables}
        pipeline={data.pipeline_status}
        operator={data.operator}
        lastFetched={lastFetched}
        refreshing={refreshing}
        onRefresh={refresh}
        onOpenAssistant={() => setAssistantOpen(true)}
      />

      <AssistantSheet
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        activeTab={activeTab}
      />

      {/* ═══ STICKY TRADING TABS — Home / Stocks / Options / Crypto ═══ */}
      <div
        className="sticky z-[29] backdrop-blur-md"
        style={{
          top: 100,
          background: "rgba(5, 8, 26, 0.92)",
        }}
      >
        <div className="px-4 sm:px-6 max-w-5xl mx-auto">
          <TradingTabs active={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
        {activeTab === "home"    && <HomeView data={data} />}
        {activeTab === "stocks"  && <StocksSleeve data={data} />}
        {activeTab === "options" && <OptionsSleeve data={data} />}
        {activeTab === "crypto"  && <CryptoSleeve />}
      </div>
    </div>
  )
}
