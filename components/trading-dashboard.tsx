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
  }>
  executions: OptionsExecution[]
  scan_summary: { scanned: number; passed: number } | null
  as_of: string | null
}

interface TradingData {
  generated_at: string
  as_of_date: string
  options?: OptionsData
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
  watchlist: WatchlistItem[]
  exit_candidates: ExitCandidate[]
  tunables: Tunables
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, prefix = "", suffix = "", decimals = 2) =>
  n == null ? "—" : `${prefix}${n.toFixed(decimals)}${suffix}`

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

// ─── Command Strip ─────────────────────────────────────────────────────────────
function CommandStrip({
  tunables,
  pipeline,
  lastFetched,
  refreshing,
  onRefresh,
}: {
  tunables: Tunables
  pipeline?: PipelineStatus
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

  // Pipeline verdict display
  let verdictColor = "color: var(--cb-text-tertiary)"
  let verdictDotColor = "var(--cb-text-tertiary)"
  let verdictText = "Pipeline · —"
  if (pipeline) {
    const v = pipeline.verdict
    if (v === "PASS") {
      verdictDotColor = "var(--cb-green)"
      verdictColor = "color: var(--cb-green)"
      verdictText = "Pipeline · PASS"
    } else if (v === "WARN") {
      verdictDotColor = "var(--cb-amber)"
      verdictColor = "color: var(--cb-amber)"
      const parts = ["Pipeline · WARN"]
      if (pipeline.critical_issues > 0) parts.push(`${pipeline.critical_issues} critical`)
      if (pipeline.high_issues > 0) parts.push(`${pipeline.high_issues} high`)
      verdictText = parts.join(" — ")
    } else if (v === "FAIL") {
      verdictDotColor = "var(--cb-red)"
      verdictColor = "color: var(--cb-red)"
      verdictText = "Pipeline · FAIL"
    } else {
      verdictText = "Pipeline · " + v
    }
  }

  return (
    <div className="cb-card-t3 px-4 py-2 flex items-center justify-between gap-4 mx-4 sm:mx-6 mt-2 mb-0">
      {/* Left: mode */}
      <div className="flex items-center gap-2">
        <span className="cb-live-dot" />
        <span className={`text-[11px] font-semibold tracking-wide ${modeColor}`}>
          {tunables.trading_mode}
        </span>
      </div>

      {/* Center: pipeline */}
      <div className="flex items-center gap-1.5 text-[11px]">
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
      </div>

      {/* Right: refresh */}
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
    <div className="cb-card-t1 px-6 py-5 space-y-4">
      {/* Hero number */}
      <div>
        <div className="text-5xl font-thin tracking-tight text-[var(--cb-text-primary)] cb-number">
          ${account.positions_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="cb-label mt-1">in market</div>
      </div>

      {/* Today P&L */}
      {todayPnl != null && (
        <div>
          <span className={`text-lg font-medium cb-number ${pnlColor(todayPnl)}`}>
            {todayPnl >= 0 ? "+" : ""}{fmt(todayPnl, "$")}
            <span className="text-sm ml-1.5 opacity-75">({fmt(todayPct, "", "%", 2)})</span>
          </span>
          <span className="text-xs ml-2" style={{ color: "var(--cb-text-tertiary)" }}>session</span>
        </div>
      )}

      {/* Account + Cash */}
      <div className="flex flex-wrap gap-6">
        {equity != null && (
          <div>
            <div className="cb-label">Account equity</div>
            <div className="text-sm font-medium cb-number" style={{ color: "var(--cb-steel)" }}>
              ${equity.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>
        )}
        {account.cash != null && (
          <div>
            <div className="cb-label">Cash</div>
            <div className="text-sm font-medium cb-number" style={{ color: "var(--cb-steel)" }}>
              ${account.cash.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>
        )}
      </div>

      {/* Unrealized + Total */}
      <div className="flex flex-wrap gap-6 text-xs">
        {account.unrealized_pnl != null && (
          <span>
            <span className={`font-medium cb-number ${pnlColor(account.unrealized_pnl)}`}>
              {account.unrealized_pnl >= 0 ? "+" : ""}{fmt(account.unrealized_pnl, "$")}
              <span className="opacity-70 ml-1">({fmt(account.unrealized_pnl_pct, "", "%", 2)})</span>
            </span>
            <span className="ml-1" style={{ color: "var(--cb-text-tertiary)" }}>unrealized</span>
          </span>
        )}
        {totalPnl != null && (
          <span>
            <span className={`font-medium cb-number ${pnlColor(totalPnl)}`}>
              {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl, "$")} ({fmt(totalPct, "", "%", 2)})
            </span>
            <span className="ml-1" style={{ color: "var(--cb-text-tertiary)" }}>total return</span>
            {baseValue && (
              <span className="ml-1" style={{ color: "var(--cb-text-tertiary)" }}>
                from ${baseValue.toLocaleString()}
              </span>
            )}
          </span>
        )}
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
              contentStyle={{ background: "var(--cb-surface-1)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 8, fontSize: 11 }}
              formatter={(v: unknown) => [
                `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                "Equity",
              ]}
              labelFormatter={(l: unknown) => shortDate(String(l))}
            />
            {baseValue && <ReferenceLine y={baseValue} stroke="rgba(139,92,246,0.15)" strokeDasharray="3 3" />}
            <Line type="monotone" dataKey="equity" stroke="#16a34a" strokeWidth={0.5} dot={false} />
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
              contentStyle={{ background: "var(--cb-surface-1)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 8, fontSize: 11 }}
              formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "P&L"]}
              labelFormatter={(l: unknown) => shortDate(String(l))}
            />
            <ReferenceLine y={0} stroke="rgba(139,92,246,0.15)" />
            <Bar dataKey="net_pnl" radius={[2, 2, 0, 0]}>
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

// ─── Performance Grid ─────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, tooltip }: { label: string; value: string; sub?: string; tooltip?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div
      className="relative cb-card-t3 px-3 py-2.5"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div className="text-xl font-thin cb-number text-[var(--cb-text-primary)]">{value}</div>
      <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>
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

// ─── Position Row ─────────────────────────────────────────────────────────────
function PositionRow({ p, exitDecision }: { p: Position; exitDecision?: ExitCandidate }) {
  const [open, setOpen] = useState(false)

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
      labelText = "· Urgent close"
      labelColor = "var(--cb-red)"
    } else if (exitDecision.decision === "CLOSE_BEFORE_BELL") {
      labelText = "· Close before bell"
      labelColor = "var(--cb-amber)"
    } else if (exitDecision.decision !== "HOLD") {
      labelText = `· ${exitDecision.decision.replace(/_/g, " ").toLowerCase()}`
      labelColor = "var(--cb-text-tertiary)"
    }
    if (labelText) {
      exitLabel = (
        <span style={{ fontSize: 10, color: labelColor }}>{labelText}</span>
      )
    }
  }

  return (
    <div
      className={`cb-card-t2 hover:opacity-90 transition-opacity cursor-pointer ${severityClass}`}
      onClick={() => setOpen(o => !o)}
    >
      {/* Main row */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-semibold text-[var(--cb-text-primary)] text-base">{p.symbol}</span>
              {exitLabel}
            </div>
            <span style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
              {p.qty} sh · avg ${p.entry_price?.toFixed(2) ?? "—"}
            </span>
          </div>
        </div>

        {/* Right: price + pnl + chevron */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-base font-medium text-[var(--cb-text-primary)]">
              ${p.current_price?.toFixed(2) ?? "—"}
            </div>
            <div className={`text-xs font-medium cb-number ${pnlColor(p.unrealized_pnl)}`}>
              {p.unrealized_pnl >= 0 ? "+" : ""}{fmt(p.unrealized_pnl, "$")}
              <span className="opacity-70 ml-1">({fmt(p.unrealized_pct, "", "%", 1)})</span>
            </div>
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
          <div>
            <div style={{ color: "var(--cb-text-tertiary)" }}>Market Value</div>
            <div className="font-medium" style={{ color: "var(--cb-text-primary)" }}>${p.market_value?.toFixed(2) ?? "—"}</div>
          </div>
          <div>
            <div style={{ color: "var(--cb-text-tertiary)" }}>Today</div>
            <div className={`font-medium cb-number ${pnlColor(p.change_today_pct)}`}>
              {fmt(p.change_today_pct, "", "%", 2)}
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
  return (
    <div className="space-y-2">
      {positions.map(p => (
        <PositionRow key={p.symbol} p={p} exitDecision={exitMap[p.symbol]} />
      ))}
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
function QualifiedSetups({ items }: { items: WatchlistItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (!items.length) return (
    <div className="text-sm py-4 text-center" style={{ color: "var(--cb-text-tertiary)" }}>No qualified setups</div>
  )
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.symbol} className="cb-card-t2">
          <button
            onClick={() => setExpanded(e => e === item.symbol ? null : item.symbol)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-[var(--cb-text-primary)]">{item.symbol}</span>
              {item.modifier === "FULL" ? (
                <span style={{ fontSize: 10, color: "var(--cb-brand)", fontWeight: 500 }}>{item.modifier}</span>
              ) : (
                <span style={{ fontSize: 10, color: "var(--cb-amber)", fontWeight: 500 }}>{item.modifier}</span>
              )}
            </div>
            <Eye className="w-3.5 h-3.5" style={{ color: "var(--cb-brand-soft)", opacity: 0.7 }} />
          </button>
          {expanded === item.symbol && (
            <div
              className="px-3 pb-3 space-y-1.5 text-xs pt-2"
              style={{ borderTop: "1px solid var(--cb-border-dim)" }}
            >
              <div>
                <span style={{ color: "var(--cb-text-tertiary)" }}>Entry: </span>
                <span style={{ color: "var(--cb-text-secondary)" }}>{item.trigger}</span>
              </div>
              <div>
                <span style={{ color: "var(--cb-text-tertiary)" }}>Stop: </span>
                <span style={{ color: "var(--cb-text-secondary)" }}>{item.stop}</span>
              </div>
              <div>
                <span style={{ color: "var(--cb-text-tertiary)" }}>Target: </span>
                <span style={{ color: "var(--cb-text-secondary)" }}>{item.target}</span>
              </div>
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
    </div>
  )
}

// ─── Premium Yield (Options) ───────────────────────────────────────────────────
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
  const wheelColors: Record<string, string> = {
    IDLE:      "var(--cb-text-tertiary)",
    CSP_OPEN:  "var(--cb-steel)",
    ASSIGNED:  "var(--cb-amber)",
    CC_OPEN:   "var(--cb-brand)",
    COMPLETED: "var(--cb-green)",
  }
  return (
    <div className="cb-card-t2 px-4 py-3 flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-[var(--cb-text-primary)]">{t.symbol}</span>
          <span style={{ fontSize: 10, color: "var(--cb-brand)", fontFamily: "monospace" }}>{t.type}</span>
          <span style={{ fontSize: 9, color: wheelColors[t.wheel_state] ?? wheelColors.IDLE, fontWeight: 500 }}>
            {t.wheel_state.replace(/_/g, " ")}
          </span>
        </div>
        <div className="mt-0.5" style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
          ${t.strike}P · {t.expiry} · {t.contracts} contract{t.contracts !== 1 ? "s" : ""} · {t.dte}d
        </div>
      </div>
      {t.limit_price != null && (
        <div className="text-right">
          <div className="text-sm font-medium cb-number text-[var(--cb-text-primary)]">${t.limit_price.toFixed(2)}</div>
          <div style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>limit</div>
        </div>
      )}
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
      {/* Gate + slot meta */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: gateOpen ? "var(--cb-green)" : "var(--cb-red)",
            display: "inline-block",
          }} />
          <span style={{ color: gateOpen ? "var(--cb-green)" : "var(--cb-red)", fontWeight: 500 }}>
            Gate {gateOpen ? "open" : "closed"}
          </span>
        </div>
        <span style={{ color: "var(--cb-text-tertiary)" }}>
          {gate.csp_slots_used} / {gate.csp_slots_max} slots
        </span>
        {gate.available_capital != null && (
          <span style={{ color: "var(--cb-text-tertiary)" }}>
            ${gate.available_capital.toLocaleString()} available
          </span>
        )}
        {gate.cash_buffer_pct != null && (
          <span className="font-medium" style={{ color: gate.cash_buffer_pct >= 15 ? "var(--cb-green)" : "var(--cb-red)" }}>
            {gate.cash_buffer_pct.toFixed(0)}% cash buffer
          </span>
        )}
        {scan_summary && (
          <span className="ml-auto" style={{ color: "var(--cb-text-tertiary)" }}>
            {scan_summary.passed}/{scan_summary.scanned} passed screen
          </span>
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

// ─── Main ─────────────────────────────────────────────────────────────────────
export function TradingDashboard({ initialData }: { initialData: TradingData | null }) {
  const [data, setData] = useState<TradingData | null>(initialData)
  const [lastFetched, setLastFetched] = useState(new Date())
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/trading", { cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastFetched(new Date())
      }
    } catch {
      // silently fail — keep stale data
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Poll every 60 seconds
  useEffect(() => {
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
        lastFetched={lastFetched}
        refreshing={refreshing}
        onRefresh={refresh}
      />

      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-8">

        {/* About blurb */}
        <p className="text-xs leading-relaxed" style={{ color: "var(--cb-text-tertiary)" }}>
          Autonomous paper trading, run entirely by AI. Positions, decisions, and risk management are handled by a 16-agent pipeline built on OpenClaw + Alpaca.
        </p>

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
              {data.watchlist.length > 0
                ? `Qualified Setups · ${data.watchlist.length}`
                : "No qualified setups"}
            </span>
          </div>
          <QualifiedSetups items={data.watchlist} />
        </section>

        {/* Premium Yield / Options */}
        {data.options && (
          <>
            <div style={{ height: 1, background: "var(--cb-border-dim)" }} className="my-2" />
            <section>
              <div className="flex items-center justify-between mb-3">
                <span className="cb-label">Premium Yield · Wheel Strategy</span>
              </div>
              <OptionsPanel options={data.options} />
            </section>
          </>
        )}

      </div>
    </div>
  )
}
