"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Nav } from "@/components/nav"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts"
import {
  Eye, Copy, Check, RefreshCw,
  ChevronDown, ChevronUp, Info,
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
  trade_plan_status?: string
  trade_plan_count?: number
  blocked_reasons?: string[]
  suppression_cause?: string | null
}

interface OperatorResearch {
  tradable_symbol_count?: number
  research_item_count?: number
  thesis_item_count?: number
  long_bias_count?: number
  short_bias_count?: number
  neutral_count?: number
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

// ─── Command Strip ─────────────────────────────────────────────────────────────
function CommandStrip({
  tunables,
  pipeline,
  operator,
  lastFetched,
  refreshing,
  onRefresh,
}: {
  tunables: Tunables
  pipeline?: PipelineStatus
  operator?: OperatorData
  lastFetched: Date
  refreshing: boolean
  onRefresh: () => void
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

  const checkpointText = checkpoint
    ? `Checkpoint 05 · ${checkpoint.substantive_shadow_days ?? 0} post-gate · ${checkpoint.substantive_pregate_days ?? 0} pre-gate`
    : verdictText

  const planText = plan
    ? `${titleizeToken(plan.trade_plan_status)} · ${plan.trade_plan_count ?? 0} tradable`
    : "Legacy compatibility view"

  return (
    <div
      className="px-6 py-2 flex items-center justify-between gap-4 backdrop-blur-md sticky top-[52px] z-30"
      style={{
        borderBottom: "1px solid rgba(90, 70, 160, 0.14)",
        background: "rgba(3, 1, 12, 0.92)",
      }}
    >
      {/* Left: mode */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="cb-live-dot" />
        <div className="min-w-0">
          <div className={`text-[11px] font-semibold tracking-wide ${modeColor}`}>
            {currentMode}
          </div>
          <div className="text-[10px] truncate" style={{ color: "var(--cb-text-tertiary)" }}>
            {brokerEnvironment} broker
          </div>
        </div>
      </div>

      {/* Center: checkpoint */}
      <div className="hidden md:flex flex-col items-center text-[11px] text-center min-w-0">
        <span style={{ color: "var(--cb-text-secondary)" }}>{checkpointText}</span>
        <span className="text-[10px]" style={{ color: "var(--cb-text-tertiary)" }}>{planText}</span>
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
          <span style={{ color: "var(--cb-text-tertiary)" }}>
            Updated {timeAgo(lastFetched.toISOString())}
          </span>
          <RefreshCw
            className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
            style={{ color: "var(--cb-text-tertiary)" }}
          />
        </button>
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
  const latestModeEvent = modeHistory?.latest_event
  const topThesis = research?.top_theses?.[0]
  const approvalModeReady = mode?.target_live_mode === "DECISION_SUPPORT"
  const approvalIdleNote =
    mode?.current_mode === "DECISION_SUPPORT"
      ? "Decision-support is active, but no approval queue is open right now."
      : "Decision-support queue is idle until this sleeve is promoted into DECISION_SUPPORT."
  const regimeSummary = !regime?.populated
    ? "Regime unavailable"
    : [
        regime?.vix_level != null ? `VIX ${regime.vix_level.toFixed(1)}` : null,
        regime?.vix_regime ? titleizeToken(regime.vix_regime) : null,
        regime?.hmm_regime ? `HMM ${titleizeToken(regime.hmm_regime)}` : null,
      ].filter(Boolean).join(" · ")

  return (
    <section className="space-y-3">
      <div
        className="rounded-[22px] border px-5 py-5 space-y-4"
        style={{
          borderColor: "rgba(90, 70, 160, 0.18)",
          background:
            "radial-gradient(circle at top left, rgba(34, 197, 94, 0.14), transparent 28%), radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 28%), linear-gradient(180deg, rgba(6, 4, 16, 0.98), rgba(5, 3, 14, 0.96))",
          boxShadow: "0 14px 40px rgba(3, 1, 12, 0.35)",
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5">
            <div className="cb-label">Operator Layer</div>
            <div className="text-[1.2rem] cb-number" style={{ color: "var(--cb-text-primary)", fontWeight: 300, letterSpacing: "-0.02em" }}>
              {mode?.effective_mode ?? mode?.current_mode ?? "UNKNOWN"} live now, {allowedTransitions[0] ?? mode?.target_paper_mode ?? "NONE"} available next
            </div>
            <p className="text-sm max-w-2xl" style={{ color: "var(--cb-text-secondary)" }}>
              {mode?.note ?? "Trading page is now reading the rebuild operator contract instead of a legacy-only dashboard snapshot."}
            </p>
          </div>
          <div
            className="rounded-full border px-3 py-1.5 text-[11px] font-medium"
            style={{
              borderColor:
                pipeline.verdict === "PASS"
                  ? "rgba(34,197,94,0.28)"
                  : pipeline.verdict === "FAIL"
                    ? "rgba(239,68,68,0.28)"
                    : "rgba(245,158,11,0.28)",
              color:
                pipeline.verdict === "PASS"
                  ? "var(--cb-green)"
                  : pipeline.verdict === "FAIL"
                    ? "var(--cb-red)"
                    : "var(--cb-amber)",
              background:
                pipeline.verdict === "PASS"
                  ? "rgba(34,197,94,0.08)"
                  : pipeline.verdict === "FAIL"
                    ? "rgba(239,68,68,0.08)"
                    : "rgba(245,158,11,0.08)",
            }}
          >
            {pipeline.verdict ?? "WARN"}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="cb-card-t3 px-4 py-3 space-y-1.5">
            <div className="cb-label">Mode & Session</div>
            <div className="text-sm font-medium" style={{ color: "var(--cb-text-primary)" }}>
              {mode?.effective_mode ?? mode?.current_mode ?? "UNKNOWN"}
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Broker: <span style={{ color: "var(--cb-text-primary)" }}>{mode?.broker_environment ?? tunables.trading_mode}</span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Phase: <span style={{ color: "var(--cb-text-primary)" }}>{titleizeToken(session?.phase)}</span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Entry mode: <span style={{ color: "var(--cb-text-primary)" }}>{titleizeToken(session?.entry_mode ?? pipeline.circuit_breaker)}</span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Execution: <span style={{ color: "var(--cb-text-primary)" }}>{mode?.execution_enabled ? "Enabled" : "Disabled"}</span>
              <span style={{ color: "var(--cb-text-tertiary)" }}> · {mode?.approval_required ? "approval required" : "no approval gate"}</span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Audit: <span style={{ color: "var(--cb-text-primary)" }}>
                {latestModeEvent
                  ? `${titleizeToken(latestModeEvent.event_type)} ${titleizeToken(latestModeEvent.from_mode)} -> ${titleizeToken(latestModeEvent.to_mode)}`
                  : "No governed mode changes yet"}
              </span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Latest event: <span style={{ color: "var(--cb-text-primary)" }}>
                {latestModeEvent ? formatEventTimestamp(latestModeEvent.timestamp) : modeHistory?.note ?? "History not loaded"}
              </span>
            </div>
          </div>

          <div className="cb-card-t3 px-4 py-3 space-y-1.5">
            <div className="cb-label">Checkpoint 05</div>
            <div className="text-sm font-medium" style={{ color: "var(--cb-text-primary)" }}>
              {titleizeToken(checkpoint?.checkpoint_status)}
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Post-gate: <span style={{ color: "var(--cb-text-primary)" }}>{checkpoint?.substantive_shadow_days ?? 0}</span>
              <span style={{ color: "var(--cb-text-tertiary)" }}> / {checkpoint?.total_shadow_days ?? 0} days</span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Pre-gate: <span style={{ color: "var(--cb-text-primary)" }}>{checkpoint?.substantive_pregate_days ?? 0}</span>
              <span style={{ color: "var(--cb-text-tertiary)" }}> substantive</span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Latest suppression: <span style={{ color: "var(--cb-text-primary)" }}>{titleizeToken(checkpoint?.latest_suppression_cause)}</span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Transition gate: <span style={{ color: "var(--cb-text-primary)" }}>{mode?.gate_state?.checkpoint05_passed ? "Checkpoint ready" : "Checkpoint accumulating"}</span>
            </div>
          </div>

          <div className="cb-card-t3 px-4 py-3 space-y-1.5">
            <div className="cb-label">Today&apos;s Plan</div>
            <div className="text-sm font-medium" style={{ color: "var(--cb-text-primary)" }}>
              {titleizeToken(plan?.trade_plan_status)}
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Candidates: <span style={{ color: "var(--cb-text-primary)" }}>{plan?.pre_gate_candidate_count ?? 0}</span>
              <span style={{ color: "var(--cb-text-tertiary)" }}> pre-gate</span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Tradable: <span style={{ color: "var(--cb-text-primary)" }}>{plan?.trade_plan_count ?? 0}</span>
              <span style={{ color: "var(--cb-text-tertiary)" }}> post-gate</span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Why: <span style={{ color: "var(--cb-text-primary)" }}>{titleizeToken(plan?.suppression_cause)}</span>
            </div>
            {approval ? (
              <>
                <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
                  Approval queue: <span style={{ color: "var(--cb-text-primary)" }}>{approval.pending_count ?? approval.active_count ?? 0}</span>
                  <span style={{ color: "var(--cb-text-tertiary)" }}> pending item(s)</span>
                </div>
                <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
                  Review: <span style={{ color: "var(--cb-text-primary)" }}>{(approval.symbols ?? []).join(", ") || "No symbols"}</span>
                  <span style={{ color: "var(--cb-text-tertiary)" }}>
                    {approval.gross_risk_pct != null ? ` · ${approval.gross_risk_pct.toFixed(2)}% gross risk` : ""}
                  </span>
                </div>
                <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
                  Status: <span style={{ color: "var(--cb-text-primary)" }}>{titleizeToken(approval.latest_status)}</span>
                  <span style={{ color: "var(--cb-text-tertiary)" }}>
                    {approval.latest_expiry ? ` · expires ${formatEventTimestamp(approval.latest_expiry)}` : ""}
                  </span>
                </div>
              </>
            ) : approvalModeReady ? (
              <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
                Decision support: <span style={{ color: "var(--cb-text-primary)" }}>{approvalIdleNote}</span>
              </div>
            ) : null}
            {approval?.status_note && (
              <div className="text-[11px]" style={{ color: "var(--cb-text-tertiary)" }}>
                {approval.status_note}
              </div>
            )}
          </div>

          <div className="cb-card-t3 px-4 py-3 space-y-1.5">
            <div className="cb-label">Research & Regime</div>
            <div className="text-sm font-medium" style={{ color: "var(--cb-text-primary)" }}>
              {research?.research_item_count ?? 0} research · {research?.thesis_item_count ?? 0} theses
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Universe: <span style={{ color: "var(--cb-text-primary)" }}>{research?.tradable_symbol_count ?? 0}</span>
              <span style={{ color: "var(--cb-text-tertiary)" }}> tradable symbols</span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              Regime: <span style={{ color: "var(--cb-text-primary)" }}>{regimeSummary}</span>
            </div>
            <div className="text-xs" style={{ color: "var(--cb-text-secondary)" }}>
              {topThesis?.symbol
                ? `Top thesis: ${topThesis.symbol} ${titleizeToken(topThesis.side_bias)}`
                : "Top thesis: not populated yet"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "rgba(139,92,246,0.2)", color: "var(--cb-text-secondary)" }}>
            Contract v{data.contract_version ?? "legacy"}
          </span>
          <span
            className="rounded-full border px-2.5 py-1"
            style={{
              borderColor: pipeline.chain_ok ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)",
              color: pipeline.chain_ok ? "var(--cb-green)" : "var(--cb-amber)",
            }}
          >
            {pipeline.chain_ok ? "Chain healthy" : "Chain has incidents"}
          </span>
          <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "rgba(139,92,246,0.2)", color: "var(--cb-text-secondary)" }}>
            Approval path {pipeline.approval_path ?? "UNKNOWN"}
          </span>
          <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "rgba(139,92,246,0.2)", color: "var(--cb-text-secondary)" }}>
            Allowed next {allowedTransitions.length > 0 ? allowedTransitions.map(titleizeToken).join(" / ") : "none"}
          </span>
          <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "rgba(139,92,246,0.2)", color: "var(--cb-text-secondary)" }}>
            Mode events {modeHistory?.event_count ?? 0}
          </span>
          {incidents.length > 0 && (
            <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "rgba(245,158,11,0.2)", color: "var(--cb-amber)" }}>
              {incidents.length} incident flag{incidents.length === 1 ? "" : "s"}
            </span>
          )}
          {gateBlockers.length > 0 && (
            <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "rgba(245,158,11,0.2)", color: "var(--cb-amber)" }}>
              {gateBlockers.length} mode blocker{gateBlockers.length === 1 ? "" : "s"}
            </span>
          )}
          {blockingNotes.length > 0 && (
            <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "rgba(239,68,68,0.2)", color: "var(--cb-red)" }}>
              {blockingNotes.length} blocking note{blockingNotes.length === 1 ? "" : "s"}
            </span>
          )}
          <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "rgba(139,92,246,0.2)", color: "var(--cb-text-secondary)" }}>
            As of {data.as_of_date}
          </span>
        </div>
      </div>
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

  return (
    <div className="cb-card-hero">
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

// ─── Orbital Ring SVG overlay for charts ──────────────────────────────────────
function OrbitalRings() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 200"
      preserveAspectRatio="none"
    >
      <defs>
        <radialGradient id="chartGlow" cx="50%" cy="100%" r="70%">
          <stop offset="0%" stopColor="#4c1d95" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#07021a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="200" fill="url(#chartGlow)" />
      <ellipse cx="400" cy="230" rx="180" ry="80"  fill="none" stroke="#7c3aed" strokeOpacity="0.10" strokeWidth="0.6" />
      <ellipse cx="400" cy="230" rx="290" ry="130" fill="none" stroke="#7c3aed" strokeOpacity="0.08" strokeWidth="0.6" />
      <ellipse cx="400" cy="230" rx="400" ry="185" fill="none" stroke="#7c3aed" strokeOpacity="0.06" strokeWidth="0.5" />
      <ellipse cx="400" cy="230" rx="520" ry="240" fill="none" stroke="#7c3aed" strokeOpacity="0.04" strokeWidth="0.5" />
      <ellipse cx="400" cy="230" rx="650" ry="300" fill="none" stroke="#7c3aed" strokeOpacity="0.03" strokeWidth="0.5" />
    </svg>
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
      background: "rgba(5, 3, 14, 0.97)",
      border: "1px solid rgba(100, 80, 180, 0.22)",
      borderRadius: 10,
      padding: "10px 14px",
      boxShadow: "0 8px 32px rgba(3, 1, 12, 0.9), 0 0 0 1px rgba(255,255,255,0.02) inset",
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

  return (
    <div className="cb-card-t2 px-4 pt-4 pb-4">
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
            border: "1px solid rgba(139,92,246,0.2)",
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
        <OrbitalRings />
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={displayData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
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
            {baseValue && <ReferenceLine y={baseValue} stroke="rgba(90,70,160,0.18)" strokeDasharray="4 3" />}
            <Line type="monotone" dataKey="equity" stroke="#15803d" strokeWidth={0.8} dot={false} />
          </LineChart>
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

  return (
    <div className="cb-card-t2 px-4 pt-4 pb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="cb-label">Daily P&L</span>
        <select
          value={tf}
          onChange={e => setTf(e.target.value as Timeframe)}
          className="cursor-pointer focus:outline-none"
          style={{
            background: "transparent",
            border: "1px solid rgba(139,92,246,0.2)",
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
        <OrbitalRings />
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
            <ReferenceLine y={0} stroke="rgba(90,70,160,0.18)" />
            <Bar dataKey="net_pnl" radius={[2, 2, 0, 0]}>
              {displayData.map((d, i) => (
                <Cell key={i} fill={d.net_pnl >= 0 ? "#0f9e6e" : "#6a9eb8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Performance Grid ─────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, tooltip }: { label: string; value: string; sub?: string; tooltip?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div
      className="relative cb-metric"
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
            border: "1px solid rgba(139,92,246,0.2)",
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
          />
          <MetricCard
            label="Profit Factor"
            value={fmt(kpis.profit_factor)}
            tooltip="Gross profit divided by gross loss. Above 1.0 means the system makes more than it loses overall."
          />
          <MetricCard
            label="Expectancy"
            value={fmt(kpis.expectancy, "$")}
            tooltip="Average dollar return per trade, accounting for win rate and average win/loss size. Positive means edge."
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
          />
          <MetricCard
            label="Win Streak"
            value={String(kpis.max_win_streak)}
            sub="best"
            tooltip="Longest consecutive string of winning trades recorded."
          />
          <MetricCard
            label="Loss Streak"
            value={String(kpis.max_loss_streak)}
            sub="worst"
            tooltip="Longest consecutive string of losing trades. The consecutive loss limit in risk policy will halt trading when hit."
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

  return (
    <div
      className={`cb-card-t2 hover:opacity-90 transition-opacity cursor-pointer ${severityClass}`}
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
                    {p.qty} sh · avg ${p.entry_price?.toFixed(2) ?? "—"}
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
      {orphaned.map(item => (
        <div key={item.symbol} className="cb-card-t2 p-3 space-y-1">
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
      ))}
    </div>
  )
}

// ─── Qualified Setups (Watchlist) ──────────────────────────────────────────────
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
        <div key={item.symbol} className="cb-card-t2">
          <button
            onClick={() => setExpanded(e => e === item.symbol ? null : item.symbol)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
          >
            <div className="flex items-center gap-3">
              <span className={`font-mono font-semibold ${item.in_position ? "text-[var(--cb-text-tertiary)]" : "text-[var(--cb-text-primary)]"}`}>
                {item.symbol}
              </span>
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

function BpsPanel({ bps }: { bps: BpsData }) {
  const hasPositions = bps.positions.length > 0
  const hasTargets = bps.targets.length > 0
  const hasFills = bps.recent_fills.length > 0

  return (
    <div className="space-y-5">
      {/* Capacity row */}
      <div className="cb-card-t3 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="cb-label mb-1">Active Spreads</div>
          <div className="text-sm font-medium cb-number" style={{ color: "var(--cb-text-primary)" }}>
            {bps.current_open_positions}
            <span style={{ color: "var(--cb-text-tertiary)", fontWeight: 400 }}> / {bps.max_active_positions}</span>
          </div>
        </div>
        <div>
          <div className="cb-label mb-1">Slots Available</div>
          <div className="text-sm font-medium cb-number" style={{ color: bps.new_positions_possible > 0 ? "var(--cb-green)" : "var(--cb-text-tertiary)" }}>
            {bps.new_positions_possible}
          </div>
        </div>
        {bps.free_capital != null && (
          <div>
            <div className="cb-label mb-1">Free Capital</div>
            <div className="text-sm font-medium cb-number" style={{ color: "var(--cb-steel)" }}>
              ${bps.free_capital.toLocaleString()}
            </div>
          </div>
        )}
        {bps.scanned != null && (
          <div>
            <div className="cb-label mb-1">Screened</div>
            <div className="text-sm font-medium cb-number" style={{ color: "var(--cb-text-primary)" }}>
              {bps.approved ?? 0}
              <span style={{ color: "var(--cb-text-tertiary)", fontWeight: 400 }}> / {bps.scanned}</span>
            </div>
          </div>
        )}
      </div>

      {/* Active spreads */}
      {hasPositions ? (
        <div className="space-y-2">
          <div className="cb-label">Active Positions · {bps.positions.length}</div>
          {bps.positions.map((p, i) => <BpsSpreadRow key={p.spread_id ?? i} p={p} />)}
        </div>
      ) : (
        <div className="py-3 text-sm text-center" style={{ color: "var(--cb-text-tertiary)" }}>
          No open spread positions
        </div>
      )}

      {/* Today's targets */}
      {hasTargets && (
        <div className="space-y-2">
          <div className="cb-label">
            Today&apos;s Targets · {bps.targets.filter(t => t.selected).length} selected / {bps.targets.length} approved
          </div>
          {bps.targets.map((t, i) => <BpsTargetRow key={t.symbol ?? i} t={t} />)}
        </div>
      )}

      {/* Recent fills */}
      {hasFills && (
        <div className="space-y-1">
          <div className="cb-label mb-1">Recent Fills</div>
          {bps.recent_fills.map((f, i) => (
            <div key={i} className="text-xs flex items-center gap-3 px-1 flex-wrap" style={{ color: "var(--cb-text-secondary)" }}>
              <span className="font-mono" style={{ color: "var(--cb-text-primary)" }}>{f.symbol}</span>
              <span style={{ color: f.action === "OPEN" ? "var(--cb-green)" : "var(--cb-steel)" }}>{f.action}</span>
              {f.short_strike != null && f.long_strike != null && (
                <span>${f.short_strike}/${f.long_strike}P</span>
              )}
              {f.expiry && <span>{f.expiry}</span>}
              {f.limit_credit != null && (
                <span style={{ color: "var(--cb-green)" }}>+${f.limit_credit.toFixed(2)}</span>
              )}
              {f.exit_reasons.length > 0 && (
                <span style={{ color: "var(--cb-amber)" }}>{f.exit_reasons.join(", ")}</span>
              )}
              <span className="ml-auto" style={{ color: "var(--cb-text-tertiary)" }}>{f.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Universe on watch — shown only when screener hasn't run yet */}
      {!hasTargets && bps.universe_watch.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="cb-label">Universe · On Watch</div>
            {bps.universe_date && (
              <span className="text-[10px]" style={{ color: "var(--cb-text-tertiary)" }}>
                screened {bps.universe_date}
              </span>
            )}
          </div>
          <div className="cb-card-t3 divide-y" style={{ borderColor: "var(--cb-border-dim)" }}>
            {bps.universe_watch.map(c => (
              <div key={c.symbol} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-sm text-[var(--cb-text-primary)]">{c.symbol}</span>
                  <span style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>{c.sector}</span>
                  {c.earnings_blackout && (
                    <span style={{ fontSize: 9, color: "var(--cb-amber)", fontWeight: 500 }}>earnings</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {c.rsi_14 != null && (
                    <span style={{ fontSize: 10, color: "var(--cb-text-tertiary)", fontFamily: "monospace" }}>
                      RSI {c.rsi_14.toFixed(0)}
                    </span>
                  )}
                  {c.final_score != null && (
                    <span
                      className="font-mono text-xs font-medium"
                      style={{ color: c.final_score >= 8 ? "var(--cb-brand)" : c.final_score >= 6.5 ? "var(--cb-amber)" : "var(--cb-text-tertiary)" }}
                    >
                      {c.final_score.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] pt-1" style={{ color: "var(--cb-text-tertiary)", opacity: 0.55 }}>
            Spreads priced weekday mornings at 08:30 ET
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Premium Yield (Options — Wheel, archived) ─────────────────────────────────
function OptionsCandidateRow({ c, screened }: { c: OptionsCandidate; screened?: OptionsScreened }) {
  const [open, setOpen] = useState(false)
  const yieldColor =
    c.annualized_yield_pct >= 50 ? "var(--cb-green)" :
    c.annualized_yield_pct >= 30 ? "var(--cb-amber)" :
    "var(--cb-text-primary)"

  let recColor = "var(--cb-text-secondary)"
  if (screened?.recommendation === "PROCEED") recColor = "var(--cb-green)"
  else if (screened?.recommendation === "SKIP")    recColor = "var(--cb-steel)"
  else if (screened?.recommendation === "REVIEW")  recColor = "var(--cb-amber)"

  return (
    <div
      className="cb-card-t2 hover:opacity-90 transition-opacity cursor-pointer"
      onClick={() => setOpen(o => !o)}
    >
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-semibold text-[var(--cb-text-primary)] text-base">{c.symbol}</span>
              <span style={{ fontSize: 10, color: "var(--cb-brand)", fontFamily: "monospace" }}>CSP</span>
              {c.in_equity_pipeline && (
                <span style={{ fontSize: 9, color: "var(--cb-brand)" }}>in pipeline</span>
              )}
              {screened?.recommendation && (
                <span style={{ fontSize: 9, color: recColor, fontWeight: 600 }}>{screened.recommendation}</span>
              )}
            </div>
            <div className="mt-0.5" style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
              ${c.strike}P · exp {c.expiry} · {c.dte}d · δ {c.delta?.toFixed(2) ?? "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-base font-medium cb-number" style={{ color: yieldColor }}>
              {c.annualized_yield_pct?.toFixed(1)}%
              <span className="text-xs ml-1 font-normal" style={{ color: "var(--cb-text-tertiary)" }}>ann.</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
              ${c.bid} bid · ${c.assignment_capital?.toLocaleString()} capital
            </div>
          </div>
          {open
            ? <ChevronUp className="w-4 h-4 shrink-0" style={{ color: "var(--cb-text-tertiary)" }} />
            : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--cb-text-tertiary)" }} />
          }
        </div>
      </div>
      {open && (
        <div
          className="px-4 pb-3 pt-2 space-y-2 text-xs"
          style={{ borderTop: "1px solid var(--cb-border-dim)", background: "var(--cb-surface-1)" }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div style={{ color: "var(--cb-text-tertiary)" }}>Current Price</div>
              <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>${c.current_price?.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ color: "var(--cb-text-tertiary)" }}>ATM IV</div>
              <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>{c.atm_iv?.toFixed(1)}%</div>
            </div>
            <div>
              <div style={{ color: "var(--cb-text-tertiary)" }}>IV Rank</div>
              <div style={{ color: "var(--cb-text-secondary)" }}>{c.iv_rank != null ? `${c.iv_rank.toFixed(0)}%` : `— (${c.iv_rank_source?.replace(/_/g, " ")})`}</div>
            </div>
            <div>
              <div style={{ color: "var(--cb-text-tertiary)" }}>Open Interest</div>
              <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>{c.open_interest?.toLocaleString() ?? "—"}</div>
            </div>
            <div>
              <div style={{ color: "var(--cb-text-tertiary)" }}>Premium Yield</div>
              <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>{c.premium_yield_pct?.toFixed(2)}%</div>
            </div>
            <div>
              <div style={{ color: "var(--cb-text-tertiary)" }}>Assignment Capital</div>
              <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>${c.assignment_capital?.toLocaleString()}</div>
            </div>
            {c.thesis_direction && (
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>Thesis</div>
                <div className="font-medium capitalize" style={{ color: "var(--cb-text-primary)" }}>{c.thesis_direction} · {c.thesis_conviction}</div>
              </div>
            )}
            {screened?.thesis_alignment != null && (
              <div>
                <div style={{ color: "var(--cb-text-tertiary)" }}>Thesis Alignment</div>
                <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>{screened.thesis_alignment}/5</div>
              </div>
            )}
          </div>
          {screened?.rationale && (
            <div>
              <div className="mb-0.5" style={{ color: "var(--cb-text-tertiary)" }}>Agent-17 rationale</div>
              <div className="leading-snug" style={{ color: "var(--cb-text-secondary)" }}>{screened.rationale}</div>
            </div>
          )}
          {screened?.narrative_risk && screened.narrative_risk.length > 0 && (
            <div>
              <div className="mb-0.5" style={{ color: "var(--cb-text-tertiary)" }}>Risk flags</div>
              <div className="flex flex-wrap gap-1">
                {screened.narrative_risk.map((r, i) => (
                  <span key={i} style={{ fontSize: 10, color: "var(--cb-amber)" }}>{r}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ActiveOptionsRow({ t }: { t: OptionsData["active_trades"][number] }) {
  const pnl = t.unrealized_pnl ?? null
  const pnlColor = pnl == null ? "var(--cb-text-tertiary)" : pnl >= 0 ? "var(--cb-green)" : "var(--cb-red)"
  const mv = t.market_value ?? (t.current_price != null && t.contracts ? Math.abs(t.current_price * t.contracts * 100) : null)
  const typeLabel = t.type === "PUT" ? "P" : t.type === "CALL" ? "C" : t.type
  return (
    <div className="cb-card-t2 px-4 py-3 flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-[var(--cb-text-primary)]">{t.symbol}</span>
          <span style={{ fontSize: 10, color: "var(--cb-brand)", fontFamily: "monospace" }}>{t.type}</span>
          {t.side && (
            <span style={{ fontSize: 9, color: t.side === "short" ? "var(--cb-amber)" : "var(--cb-steel)", fontWeight: 500 }}>
              {t.side.toUpperCase()}
            </span>
          )}
        </div>
        <div className="mt-0.5" style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
          ${t.strike}{typeLabel} · {t.expiry} · {t.contracts}x · {t.dte}d
          {t.limit_price != null && <span> · entry ${t.limit_price.toFixed(2)}</span>}
        </div>
      </div>
      <div className="text-right">
        {mv != null && (
          <div className="text-sm font-medium cb-number text-[var(--cb-text-primary)]">
            ${mv.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        )}
        {pnl != null && (
          <div style={{ fontSize: 11, color: pnlColor, fontWeight: 500 }}>
            {pnl >= 0 ? "+" : ""}{pnl.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            {t.unrealized_pct != null && <span> ({t.unrealized_pct >= 0 ? "+" : ""}{t.unrealized_pct.toFixed(1)}%)</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function OptionsPanel({ options }: { options: OptionsData }) {
  const { gate, candidates, screened, active_trades, executions, scan_summary } = options
  const screenedMap = Object.fromEntries(screened.map(s => [s.symbol, s]))
  const hasActive = active_trades.length > 0
  const hasExec = executions.length > 0
  const gateOpen = gate.status === "PASS"

  return (
    <div className="space-y-4">
      {/* Gate summary — structured grid */}
      <div className="cb-card-t3 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="cb-label mb-1">Gate</div>
          <div className="text-sm font-medium" style={{ color: gateOpen ? "var(--cb-green)" : "var(--cb-red)" }}>
            {gateOpen ? "Open" : "Closed"}
          </div>
        </div>
        <div>
          <div className="cb-label mb-1">CSP Slots</div>
          <div className="text-sm font-medium cb-number" style={{ color: "var(--cb-text-primary)" }}>
            {gate.csp_slots_used} <span style={{ color: "var(--cb-text-tertiary)", fontWeight: 400 }}>/ {gate.csp_slots_max}</span>
          </div>
        </div>
        {gate.available_capital != null && (
          <div>
            <div className="cb-label mb-1">Available</div>
            <div className="text-sm font-medium cb-number" style={{ color: "var(--cb-steel)" }}>
              ${gate.available_capital.toLocaleString()}
            </div>
          </div>
        )}
        {gate.cash_buffer_pct != null && (
          <div>
            <div className="cb-label mb-1">Cash Buffer</div>
            <div className="text-sm font-medium cb-number" style={{ color: gate.cash_buffer_pct >= 15 ? "var(--cb-green)" : "var(--cb-red)" }}>
              {gate.cash_buffer_pct.toFixed(0)}%
            </div>
          </div>
        )}
        {scan_summary && (
          <div>
            <div className="cb-label mb-1">Screened</div>
            <div className="text-sm font-medium cb-number" style={{ color: "var(--cb-text-primary)" }}>
              {scan_summary.passed} <span style={{ color: "var(--cb-text-tertiary)", fontWeight: 400 }}>/ {scan_summary.scanned}</span>
            </div>
          </div>
        )}
      </div>

      {/* Active trades */}
      {hasActive && (
        <div className="space-y-2">
          <div className="cb-label">Active Positions</div>
          {active_trades.map((t, i) => <ActiveOptionsRow key={i} t={t} />)}
        </div>
      )}

      {/* Execution log */}
      {hasExec && (
        <div className="space-y-1">
          <div className="cb-label mb-1">Recent Fills</div>
          {executions.map((e, i) => (
            <div key={i} className="text-xs flex items-center gap-3 px-1" style={{ color: "var(--cb-text-secondary)" }}>
              <span className="font-mono" style={{ color: "var(--cb-text-primary)" }}>{e.symbol}</span>
              <span>{e.type} ${e.strike} {e.expiry}</span>
              {e.premium != null && <span style={{ color: "var(--cb-green)" }}>+${e.premium.toFixed(2)}</span>}
              {e.pnl != null && <span className={pnlColor(e.pnl)}>{e.pnl >= 0 ? "+" : ""}{fmt(e.pnl, "$")}</span>}
              <span className="ml-auto" style={{ color: "var(--cb-text-tertiary)" }}>{e.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* CSP Candidates */}
      {candidates.length > 0 ? (
        <div className="space-y-2">
          {hasActive && <div className="cb-label">Screened Candidates</div>}
          {candidates.map(c => (
            <OptionsCandidateRow key={c.symbol} c={c} screened={screenedMap[c.symbol]} />
          ))}
        </div>
      ) : (
        <div className="text-sm py-4 text-center" style={{ color: "var(--cb-text-tertiary)" }}>
          No setups yet — screener runs weekday mornings at 08:22
        </div>
      )}
    </div>
  )
}

// ─── Tunables ─────────────────────────────────────────────────────────────────
export function TunablesPanel({ tunables }: { tunables: Tunables }) {
  const [copied, setCopied] = useState(false)
  const fields = [
    { key: "max_daily_loss_pct",            label: "Max Daily Loss",           suffix: "%" },
    { key: "max_risk_per_trade_pct",         label: "Max Risk Per Trade",       suffix: "%" },
    { key: "max_aggregate_open_risk_pct",    label: "Max Aggregate Open Risk",  suffix: "%" },
    { key: "max_concurrent_positions",       label: "Max Concurrent Positions", suffix: ""  },
    { key: "consecutive_loss_limit",         label: "Consecutive Loss Limit",   suffix: ""  },
    { key: "consecutive_loss_size_modifier", label: "Loss Size Modifier",       suffix: ""  },
    { key: "reduce_only_size_cap",           label: "Reduce-Only Size Cap",     suffix: ""  },
  ]
  const editCommand = `# Edit risk policy tunables\n# File: ~/.openclaw/workspace/trading-bot/policies/risk_policy.json\ncp ~/.openclaw/workspace/trading-bot/policies/risk_policy.json \\\n   ~/claude/OpenClaw-s-Brain/System/Policies/risk_policy.json\ncd ~/claude/OpenClaw-s-Brain && git add System/Policies/risk_policy.json && \\\n  git commit -m "policy: update risk tunables" && \\\n  GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_claude" git push`

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 pb-1">
        <span
          className="text-xs font-medium"
          style={{ color: tunables.trading_mode === "PAPER" ? "#60a5fa" : "var(--cb-red)" }}
        >
          {tunables.trading_mode}
        </span>
        <span
          className="text-xs"
          style={{ color: tunables.paper_autopilot_enabled ? "var(--cb-green)" : "var(--cb-text-tertiary)" }}
        >
          autopilot {tunables.paper_autopilot_enabled ? "ON" : "OFF"}
        </span>
        {tunables.updated_at && (
          <span className="text-[10px] ml-auto" style={{ color: "var(--cb-text-tertiary)" }}>
            updated {tunables.updated_at.slice(0, 10)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {fields.map(({ key, label, suffix }) => (
          <div key={key} className="cb-card-t3 px-3 py-2">
            <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>{label}</div>
            <div className="text-sm font-medium mt-0.5" style={{ color: "var(--cb-text-primary)" }}>
              {(tunables as unknown as Record<string, unknown>)[key] as string}{suffix}
            </div>
          </div>
        ))}
      </div>
      <div className="pt-1">
        <p className="text-[11px] mb-2" style={{ color: "var(--cb-text-tertiary)" }}>Tunables are edited directly in the policy file on WSL.</p>
        <button
          onClick={() => { navigator.clipboard.writeText(editCommand); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="flex items-center gap-2 text-xs hover:opacity-80 transition-opacity"
          style={{ color: "#60a5fa" }}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied!" : "Copy edit command"}
        </button>
      </div>
    </div>
  )
}

// ─── Options Section (Strategy Tabs) ────────────────────────────────────────
function HedgesPanel({ hedges }: { hedges: HedgesData }) {
  const { regime, candidates, positions_screened, candidates_found } = hedges
  const livePositions = hedges.live_positions ?? []
  const hasLive = livePositions.length > 0
  const totalHedgeValue = livePositions.reduce((s, p) => s + (p.market_value ?? 0), 0)
  const totalHedgePnl = livePositions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0)

  // Show live positions even if regime is not active (we still hold them)
  if (!regime.active && !hasLive) {
    return (
      <div className="py-6 text-center text-sm" style={{ color: "var(--cb-text-tertiary)" }}>
        Bearish regime not active — hedging screener idle
        <div className="mt-1 text-[10px]">
          VIX {regime.vix_level ?? "?"} ({regime.vix_regime ?? "?"}) / CB: {regime.cb_state ?? "?"}
        </div>
      </div>
    )
  }

  if (candidates.length === 0 && !hasLive) {
    return (
      <div className="py-6 text-center text-sm" style={{ color: "var(--cb-text-tertiary)" }}>
        Regime active but no protective puts found
        <div className="mt-1 text-[10px]">
          VIX {regime.vix_level} ({regime.vix_regime}) — screened {positions_screened} positions
        </div>
      </div>
    )
  }

  // Group candidates by symbol, show best (cheapest) per symbol
  const bySymbol = new Map<string, HedgeCandidate[]>()
  for (const c of candidates) {
    const list = bySymbol.get(c.symbol) || []
    list.push(c)
    bySymbol.set(c.symbol, list)
  }

  return (
    <div className="space-y-2">
      {/* Regime banner */}
      <div className="rounded px-3 py-2 text-[11px]" style={{
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.2)",
        color: "var(--cb-text-secondary)",
      }}>
        <span className="font-semibold" style={{ color: "var(--cb-red)" }}>
          VIX {regime.vix_level?.toFixed(1)} ({regime.vix_regime})
        </span>
        {regime.cb_state && regime.cb_state !== "NORMAL" && (
          <span className="ml-2 font-semibold" style={{ color: "var(--cb-yellow)" }}>
            CB: {regime.cb_state}
          </span>
        )}
        <span className="ml-2">
          {candidates_found} puts across {positions_screened} positions
        </span>
      </div>

      {/* Live hedge positions */}
      {hasLive && (
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1">
            <div className="text-[11px] font-semibold" style={{ color: "var(--cb-text-secondary)" }}>
              Active Hedges
            </div>
            <div className="text-[11px]" style={{ color: "var(--cb-text-tertiary)" }}>
              ${totalHedgeValue.toLocaleString("en-US", { maximumFractionDigits: 0 })} deployed
              <span className="ml-2" style={{ color: totalHedgePnl >= 0 ? "var(--cb-green)" : "var(--cb-red)" }}>
                {totalHedgePnl >= 0 ? "+" : ""}${totalHedgePnl.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
          {livePositions.map((t, i) => <ActiveOptionsRow key={`hedge-${i}`} t={t} />)}
        </div>
      )}

      {/* Screened candidates */}
      {candidates.length > 0 && hasLive && (
        <div className="text-[11px] font-semibold px-1 pt-2" style={{ color: "var(--cb-text-secondary)" }}>
          Screened Candidates
        </div>
      )}

      {/* Per-symbol cards */}
      {Array.from(bySymbol.entries()).map(([symbol, puts]) => {
        const best = puts[0] // already sorted by cost
        return (
          <div key={symbol} className="rounded px-3 py-2" style={{
            background: "var(--cb-surface-1)",
            border: "1px solid var(--cb-border-dim)",
          }}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono font-semibold text-[13px]" style={{ color: "var(--cb-text-primary)" }}>
                  {symbol}
                </span>
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{
                  background: "rgba(239,68,68,0.1)",
                  color: "var(--cb-red)",
                }}>PUT</span>
              </div>
              <span className="text-[10px]" style={{ color: "var(--cb-text-tertiary)" }}>
                {puts.length} option{puts.length > 1 ? "s" : ""}
              </span>
            </div>
            {/* Best candidate detail */}
            <div className="mt-1 flex gap-4 text-[11px]" style={{ color: "var(--cb-text-secondary)" }}>
              <span>${best.strike} {best.expiry?.slice(5)} ({best.dte}d)</span>
              <span>mid ${best.mid?.toFixed(2)}</span>
              <span>{best.otm_pct?.toFixed(1)}% OTM</span>
              <span style={{ color: "var(--cb-yellow)" }}>
                cost {best.protection_cost_pct?.toFixed(1)}%
              </span>
            </div>
            {/* Additional options as subtle list */}
            {puts.length > 1 && (
              <div className="mt-1 text-[10px] flex flex-wrap gap-x-3" style={{ color: "var(--cb-text-tertiary)" }}>
                {puts.slice(1, 3).map((p, i) => (
                  <span key={i}>${p.strike} {p.expiry?.slice(5)} — {p.protection_cost_pct?.toFixed(1)}%</span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function OptionsSection({ options, bps, hedges }: { options?: OptionsData; bps?: BpsData | null; hedges?: HedgesData | null }) {
  const [tab, setTab] = useState<"spreads" | "wheel" | "hedges">("spreads")

  // Dot indicators: does each strategy have live data?
  const spreadsHasPositions = (bps?.positions?.length ?? 0) > 0
  const wheelHasPositions = (options?.active_trades?.length ?? 0) > 0
  const hedgesActive = hedges?.regime?.active ?? false

  const asOf = tab === "spreads"
    ? bps?.as_of?.slice(0, 10)
    : tab === "hedges"
    ? hedges?.as_of?.slice(0, 10)
    : options?.as_of?.slice(0, 10)

  return (
    <>
      <div style={{ height: 1, background: "var(--cb-border-dim)" }} className="my-2" />
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <span className="cb-label mr-2">Options</span>
            {(["spreads", "wheel", "hedges"] as const).map(t => {
              const active = tab === t
              const hasIndicator = t === "spreads" ? spreadsHasPositions
                : t === "wheel" ? wheelHasPositions
                : hedgesActive
              const indicatorColor = t === "hedges" ? "var(--cb-red)" : "var(--cb-green)"
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
                  style={{
                    background: active ? "var(--cb-surface-2)" : "transparent",
                    color: active ? "var(--cb-text-primary)" : "var(--cb-text-tertiary)",
                    border: active ? "1px solid var(--cb-border-std)" : "1px solid transparent",
                  }}
                >
                  {t === "spreads" ? "Spreads" : t === "wheel" ? "Wheel" : "Hedges"}
                  {hasIndicator && (
                    <span
                      className="inline-block ml-1.5 rounded-full"
                      style={{
                        width: 6, height: 6,
                        background: indicatorColor,
                        verticalAlign: "middle",
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>
          {asOf && (
            <span className="text-[10px]" style={{ color: "var(--cb-text-tertiary)" }}>{asOf}</span>
          )}
        </div>

        {tab === "spreads" ? (
          bps ? <BpsPanel bps={bps} /> : (
            <div className="py-6 text-center text-sm" style={{ color: "var(--cb-text-tertiary)" }}>
              No spread data yet
            </div>
          )
        ) : tab === "hedges" ? (
          hedges ? <HedgesPanel hedges={hedges} /> : (
            <div className="py-6 text-center text-sm" style={{ color: "var(--cb-text-tertiary)" }}>
              No hedge data yet
            </div>
          )
        ) : (
          options ? <OptionsPanel options={options} /> : (
            <div className="py-6 text-center text-sm" style={{ color: "var(--cb-text-tertiary)" }}>
              Wheel pipeline paused
            </div>
          )
        )}
      </section>
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function TradingDashboard({ initialData }: { initialData: TradingData | null }) {
  const [data, setData] = useState<TradingData | null>(initialData)
  const [lastFetched, setLastFetched] = useState(new Date())
  const [refreshing, setRefreshing] = useState(false)

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
      />

      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-8">

        {/* System caption */}
        <p style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--cb-text-tertiary)", opacity: 0.55 }}>
          Phase 1 equities sleeve · operator-feed contract · {data.operator?.mode?.current_mode ?? data.pipeline_status?.approval_path ?? data.tunables.trading_mode} mode
        </p>

        <OperatorOverview data={data} tunables={data.tunables} />

        {/* Capital Hero */}
        <section>
          <CapitalHero account={data.account} />
        </section>

        {/* Charts */}
        <section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EquityCurve data={data.equity_curve} baseValue={data.account.base_value} />
            <DailyPnlChart data={data.daily_performance} />
          </div>
        </section>

        {/* Performance Grid */}
        <section>
          <PerformanceGrid kpis={data.kpis} />
        </section>

        <div style={{ height: 1, background: "var(--cb-border-dim)" }} className="my-2" />

        {/* Positions */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <span className="cb-label">Open Positions · {data.positions.length}</span>
            {data.exit_candidates.length > 0 && (
              <span className="text-[10px]" style={{ color: "var(--cb-amber)" }}>
                {data.exit_candidates.length} exit signal{data.exit_candidates.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <PositionsList positions={data.positions} exitCandidates={data.exit_candidates} />
        </section>

        {/* Orphaned exit candidates */}
        {data.exit_candidates.some(e => !data.positions.find(p => p.symbol === e.symbol)) && (
          <>
            <div style={{ height: 1, background: "var(--cb-border-dim)" }} className="my-2" />
            <section>
              <div className="flex items-center justify-between mb-3">
                <span className="cb-label">Exit Signals · No Current Position</span>
              </div>
              <ExitCandidatesPanel items={data.exit_candidates} positions={data.positions} />
            </section>
          </>
        )}

        <div style={{ height: 1, background: "var(--cb-border-dim)" }} className="my-2" />

        {/* Qualified Setups */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <span className="cb-label">
              {data.watchlist.items.length > 0
                ? `Qualified Setups · ${data.watchlist.items.length}`
                : "Qualified Setups"}
            </span>
          </div>
          <QualifiedSetups
            items={data.watchlist.items}
            as_of={data.watchlist.as_of}
            source={data.watchlist.source}
          />
        </section>

        {/* Options — Strategy Tabs */}
        <OptionsSection options={data.options} bps={data.bps} hedges={data.hedges} />

      </div>
    </div>
  )
}
