"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Nav } from "@/components/nav"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts"
import {
  TrendingUp, TrendingDown, AlertTriangle, Eye,
  Copy, Check, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff,
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
  n == null ? "text-zinc-400" : n >= 0 ? "text-emerald-400" : "text-[#7ab0cc]"

function shortDate(iso: string) {
  return iso.slice(5)
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

// ─── Circuit Breaker Badge ────────────────────────────────────────────────────
function CircuitBreakerBadge({ state }: { state: string }) {
  const cfg: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    NORMAL:      { label: "NORMAL",      cls: "bg-emerald-900/40 text-emerald-300 border-emerald-700/40", icon: <ShieldCheck className="w-3 h-3" /> },
    REDUCE_ONLY: { label: "REDUCE ONLY", cls: "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",   icon: <ShieldAlert className="w-3 h-3" /> },
    HALT:        { label: "HALT",        cls: "bg-red-950/60 text-red-300/70 border-red-900/40",          icon: <ShieldOff className="w-3 h-3" /> },
    UNKNOWN:     { label: "UNKNOWN",     cls: "bg-zinc-800 text-zinc-500 border-zinc-700",              icon: <ShieldAlert className="w-3 h-3" /> },
  }
  const c = cfg[state] ?? cfg.UNKNOWN
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded border ${c.cls}`}>
      {c.icon} {c.label}
    </span>
  )
}

// ─── Verdict Badge ────────────────────────────────────────────────────────────
function VerdictBadge({ verdict }: { verdict: string }) {
  const cfg: Record<string, string> = {
    PASS:    "bg-emerald-900/40 text-emerald-300 border-emerald-700/40",
    WARN:    "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",
    FAIL:    "bg-red-950/60 text-red-300/70 border-red-900/40",
    UNKNOWN: "bg-zinc-800 text-zinc-500 border-zinc-700",
  }
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-1 rounded border ${cfg[verdict] ?? cfg.UNKNOWN}`}>
      {verdict}
    </span>
  )
}

// ─── Pipeline Status Bar ──────────────────────────────────────────────────────
function PipelineStatusBar({ ps }: { ps: PipelineStatus }) {
  const hasIssues = ps.critical_issues > 0 || ps.high_issues > 0
  return (
    <div className={`rounded-lg border px-4 py-3 flex flex-wrap items-center gap-3 text-xs ${
      ps.verdict === "FAIL" ? "bg-zinc-900 border-red-950/50" :
      ps.verdict === "WARN" ? "bg-zinc-900 border-yellow-900/40" :
      "bg-zinc-900 border-zinc-800"
    }`}>
      <span className="text-zinc-500 font-mono">{ps.trading_date ?? "—"}</span>
      <CircuitBreakerBadge state={ps.circuit_breaker} />
      <VerdictBadge verdict={ps.verdict} />
      {ps.critical_issues > 0 && (
        <span className="text-red-400 font-medium">{ps.critical_issues} critical</span>
      )}
      {ps.high_issues > 0 && (
        <span className="text-orange-400 font-medium">{ps.high_issues} high</span>
      )}
      {ps.medium_issues > 0 && (
        <span className="text-yellow-400">{ps.medium_issues} medium</span>
      )}
      {!hasIssues && ps.verdict !== "UNKNOWN" && (
        <span className="text-emerald-400">No critical issues</span>
      )}
      {ps.approval_path && (
        <span className="ml-auto text-zinc-600">{ps.approval_path.replace(/_/g, " ")}</span>
      )}
    </div>
  )
}

// ─── Hero Section ─────────────────────────────────────────────────────────────
function HeroSection({
  account, kpis, tunables, pipeline, lastFetched, refreshing, onRefresh,
}: {
  account: TradingData["account"]
  kpis: TradingData["kpis"]
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

  const equity     = account.equity ?? account.positions_value
  const totalPnl   = account.total_pnl
  const totalPct   = account.total_pnl_pct
  const todayPnl   = account.today_pnl
  const todayPct   = account.today_pnl_pct
  const baseValue  = account.base_value

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          {/* Main number: value invested in market */}
          <div className="text-5xl font-thin text-zinc-100 tracking-wide">
            ${account.positions_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "#b0bcc6" }}>invested</div>

          {/* Unrealized P&L on open positions */}
          <div className={`text-lg font-semibold mt-1 ${pnlColor(account.unrealized_pnl)}`}>
            {account.unrealized_pnl >= 0 ? "+" : ""}{fmt(account.unrealized_pnl, "$")}
            <span className="text-sm ml-1.5 opacity-80">({fmt(account.unrealized_pnl_pct, "", "%", 2)})</span>
            <span className="text-xs ml-2 font-normal" style={{ color: "#b0bcc6" }}>unrealized</span>
          </div>

          {/* Supporting: total account equity + cash */}
          <div className="text-xs mt-1.5 flex flex-wrap gap-3" style={{ color: "#b0bcc6" }}>
            {equity != null && (
              <span>
                Account:{" "}
                <span className="font-medium" style={{ color: "#7ab0cc" }}>
                  ${equity.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </span>
            )}
            {account.cash != null && (
              <span>
                Cash:{" "}
                <span className="font-medium" style={{ color: "#7ab0cc" }}>
                  ${account.cash.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </span>
            )}
          </div>

          {/* Today + total P&L */}
          <div className="text-xs mt-1 flex flex-wrap gap-3" style={{ color: "#b0bcc6" }}>
            {todayPnl != null && (
              <span>
                Today:{" "}
                <span className={`font-medium ${pnlColor(todayPnl)}`}>
                  {todayPnl >= 0 ? "+" : ""}{fmt(todayPnl, "$")} ({fmt(todayPct, "", "%", 2)})
                </span>
              </span>
            )}
            {totalPnl != null && (
              <span>
                Total:{" "}
                <span className={`font-medium ${pnlColor(totalPnl)}`}>
                  {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl, "$")} ({fmt(totalPct, "", "%", 2)})
                </span>
                {baseValue && <span className="ml-1" style={{ color: "#b0bcc6" }}>from ${baseValue.toLocaleString()}</span>}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${
              tunables.trading_mode === "PAPER"
                ? "bg-blue-900/40 text-blue-300 border-blue-700/40"
                : "bg-red-900/40 text-red-300 border-red-700/40"
            }`}>
              {tunables.trading_mode}
            </span>
            {pipeline && <CircuitBreakerBadge state={pipeline.circuit_breaker} />}
            {pipeline && <VerdictBadge verdict={pipeline.verdict} />}
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${refreshing ? "bg-yellow-400 animate-pulse" : "bg-emerald-500 animate-pulse"}`} />
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            {timeAgo(lastFetched.toISOString())}
          </button>
        </div>
      </div>

      {pipeline && <PipelineStatusBar ps={pipeline} />}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, tooltip }: { label: string; value: string; sub?: string; tooltip?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="text-xl font-bold text-zinc-100">{value}</div>
          <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
            {label}
            {tooltip && <Info className="w-3 h-3 text-zinc-700 shrink-0" />}
          </div>
          {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
        </CardContent>
      </Card>
      {tooltip && show && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[11px] text-zinc-300 w-52 leading-snug shadow-xl pointer-events-none">
          {tooltip}
        </div>
      )}
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
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Account Equity</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-6 flex items-center justify-center h-[140px]">
        <p className="text-xs text-zinc-600">No history available yet</p>
      </CardContent>
    </Card>
  )

  const last = displayData[displayData.length - 1]
  const isUp = baseValue != null ? last.equity >= baseValue : last.equity >= displayData[0].equity

  // Y-axis: fit to visible data ±10%, minimum band of 1% of value so flat lines still show
  const equities = displayData.map(d => d.equity)
  const minEq = Math.min(...equities)
  const maxEq = Math.max(...equities)
  const mid = (minEq + maxEq) / 2
  const naturalPad = Math.max((maxEq - minEq) * 0.1, mid * 0.01)
  const yMin = Math.floor((minEq - naturalPad) / 10) * 10
  const yMax = Math.ceil((maxEq + naturalPad) / 10) * 10
  const fmtK = (v: number) => `$${(v / 1000).toFixed(1)}k`

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest shrink-0" style={{ color: "#b8860b" }}>
            Account Equity
            {baseValue && <span className="ml-2 font-normal normal-case" style={{ color: "#b8860b" }}>started ${baseValue.toLocaleString()}</span>}
          </CardTitle>
          <select
            value={tf}
            onChange={e => setTf(e.target.value as Timeframe)}
            className="text-[11px] bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1 cursor-pointer focus:outline-none hover:border-zinc-500 transition-colors"
          >
            {TF_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="relative">
          <OrbitalRings />
          <ResponsiveContainer width="100%" height={160}>
          <LineChart data={displayData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "#b0bcc6" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 10, fill: "#b0bcc6" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtK}
              width={44}
              domain={[yMin, yMax]}
            />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 11 }}
              formatter={(v: any, name: any) => [
                `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                name === "equity" ? "Equity" : "Daily P&L",
              ]}
              labelFormatter={(l: any) => shortDate(String(l))}
            />
            {baseValue && <ReferenceLine y={baseValue} stroke="#3f3f46" strokeDasharray="3 3" />}
            <Line type="monotone" dataKey="equity" stroke="#16a34a" strokeWidth={0.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
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
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest shrink-0" style={{ color: "#b8860b" }}>Daily P&L</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-6 flex items-center justify-center h-[100px]">
        <p className="text-xs text-zinc-600">No closed trade P&L recorded yet</p>
      </CardContent>
    </Card>
  )

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest shrink-0" style={{ color: "#b8860b" }}>Daily P&L</CardTitle>
          <select
            value={tf}
            onChange={e => setTf(e.target.value as Timeframe)}
            className="text-[11px] bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1 cursor-pointer focus:outline-none hover:border-zinc-500 transition-colors"
          >
            {PNL_TF_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="relative">
          <OrbitalRings />
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={displayData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "#b0bcc6" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "#b0bcc6" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={48} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 11 }}
                formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "P&L"]}
                labelFormatter={(l: any) => shortDate(String(l))}
              />
              <ReferenceLine y={0} stroke="#3f3f46" />
              <Bar dataKey="net_pnl" radius={[2, 2, 0, 0]}>
                {displayData.map((d, i) => (
                  <Cell key={i} fill={d.net_pnl >= 0 ? "#34d399" : "#4eb8c8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── KPI grid ─────────────────────────────────────────────────────────────────
function KpiGrid({ kpis }: { kpis: TradingData["kpis"] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      <KpiCard
        label="Win Rate"
        value={kpis.win_rate_pct != null ? `${kpis.win_rate_pct.toFixed(1)}%` : "—"}
        tooltip="Percentage of closed trades that ended in profit. Above 50% means more winners than losers."
      />
      <KpiCard
        label="Profit Factor"
        value={fmt(kpis.profit_factor)}
        tooltip="Gross profit divided by gross loss. Above 1.0 means the system makes more than it loses overall."
      />
      <KpiCard
        label="Expectancy"
        value={fmt(kpis.expectancy, "$")}
        tooltip="Average dollar return per trade, accounting for win rate and average win/loss size. Positive means edge."
      />
      <KpiCard
        label="Max Drawdown"
        value={kpis.max_drawdown_usd != null ? `$${kpis.max_drawdown_usd.toFixed(2)}` : "—"}
        sub={kpis.max_drawdown_pct != null ? `${kpis.max_drawdown_pct.toFixed(2)}% of starting equity` : undefined}
        tooltip="Largest peak-to-trough loss in cumulative realized P&L, expressed as a dollar amount and % of starting equity ($100k)."
      />
      <KpiCard
        label="Win Streak"
        value={String(kpis.max_win_streak)}
        sub="best"
        tooltip="Longest consecutive string of winning trades recorded."
      />
      <KpiCard
        label="Loss Streak"
        value={String(kpis.max_loss_streak)}
        sub="worst"
        tooltip="Longest consecutive string of losing trades. The consecutive loss limit in risk policy will halt trading when hit."
      />
    </div>
  )
}

// ─── Position Row (Robinhood-style) ───────────────────────────────────────────
function PositionRow({ p, exitDecision }: { p: Position; exitDecision?: ExitCandidate }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800/60 transition-colors cursor-pointer"
      onClick={() => setOpen(o => !o)}
    >
      {/* Main row */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Symbol + side indicator */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-zinc-100 text-base">{p.symbol}</span>
              {exitDecision && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-400">
                  {exitDecision.decision.replace(/_/g, " ")}
                </span>
              )}
            </div>
            <span className="text-[11px] text-zinc-500">
              {p.qty} sh · avg ${p.entry_price?.toFixed(2) ?? "—"}
            </span>
          </div>
        </div>

        {/* Right: current price + pnl + chevron */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-base font-semibold text-zinc-100">
              ${p.current_price?.toFixed(2) ?? "—"}
            </div>
            <div className={`text-xs font-medium ${pnlColor(p.unrealized_pnl)}`}>
              {p.unrealized_pnl >= 0 ? "+" : ""}{fmt(p.unrealized_pnl, "$")}
              <span className="opacity-70 ml-1">({fmt(p.unrealized_pct, "", "%", 1)})</span>
            </div>
          </div>
          {open
            ? <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />
          }
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-zinc-800/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-zinc-500">Market Value</div>
            <div className="text-zinc-200 font-medium">${p.market_value?.toFixed(2) ?? "—"}</div>
          </div>
          <div>
            <div className="text-zinc-500">Today</div>
            <div className={`font-medium ${pnlColor(p.change_today_pct)}`}>
              {fmt(p.change_today_pct, "", "%", 2)}
            </div>
          </div>
          <div>
            <div className="text-zinc-500">Entry</div>
            <div className="text-zinc-200 font-medium">${p.entry_price?.toFixed(2) ?? "—"}</div>
          </div>
          <div>
            <div className="text-zinc-500">Side</div>
            <div className="text-zinc-200 font-medium capitalize">{p.side}</div>
          </div>
          {exitDecision?.reason && (
            <div className="col-span-2 sm:col-span-4">
              <div className="text-zinc-500">Exit signal</div>
              <div className="text-zinc-400 leading-snug">{exitDecision.reason}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PositionsList({ positions, exitCandidates }: { positions: Position[]; exitCandidates: ExitCandidate[] }) {
  if (!positions.length) return (
    <div className="text-sm text-zinc-600 py-6 text-center">No open positions</div>
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

// ─── Watchlist ────────────────────────────────────────────────────────────────
function Watchlist({ items }: { items: WatchlistItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (!items.length) return <div className="text-sm text-zinc-600 py-4 text-center">No watchlist candidates</div>
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.symbol} className="rounded-lg border border-zinc-800 bg-zinc-900">
          <button
            onClick={() => setExpanded(e => e === item.symbol ? null : item.symbol)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-zinc-100">{item.symbol}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.modifier === "FULL" ? "bg-blue-900/40 text-blue-300" : "bg-zinc-800 text-zinc-400"}`}>
                {item.modifier}
              </span>
            </div>
            <Eye className="w-3.5 h-3.5 text-zinc-600" />
          </button>
          {expanded === item.symbol && (
            <div className="px-3 pb-3 space-y-2 text-xs border-t border-zinc-800 pt-2">
              <div><span className="text-zinc-500">Entry: </span><span className="text-zinc-300">{item.trigger}</span></div>
              <div><span className="text-zinc-500">Stop: </span><span className="text-zinc-300">{item.stop}</span></div>
              <div><span className="text-zinc-500">Target: </span><span className="text-zinc-300">{item.target}</span></div>
              {item.note && <div><span className="text-zinc-500">Note: </span><span className="text-zinc-400 italic">{item.note}</span></div>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Exit Candidates standalone (non-position items) ─────────────────────────
function ExitCandidatesPanel({ items, positions }: { items: ExitCandidate[]; positions: Position[] }) {
  const heldSymbols = new Set(positions.map(p => p.symbol))
  // Only show items NOT already rendered inline in position rows
  const orphaned = items.filter(i => !heldSymbols.has(i.symbol))
  if (!orphaned.length) return null
  return (
    <div className="space-y-2">
      {orphaned.map(item => (
        <div key={item.symbol} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-zinc-100">{item.symbol}</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-400">
                {item.decision.replace(/_/g, " ")}
              </span>
            </div>
            {item.unrealized_pnl != null && (
              <span className={`text-xs font-medium ${pnlColor(item.unrealized_pnl)}`}>
                {fmt(item.unrealized_pnl, "$")} ({fmt(item.unrealized_pct, "", "%", 1)})
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 leading-snug">{item.reason}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Tunables ─────────────────────────────────────────────────────────────────
function TunablesPanel({ tunables }: { tunables: Tunables }) {
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
        <div className={`text-xs font-semibold px-2 py-1 rounded ${tunables.trading_mode === "PAPER" ? "bg-blue-900/40 text-blue-300" : "bg-red-900/40 text-red-300"}`}>
          {tunables.trading_mode}
        </div>
        <div className={`text-xs px-2 py-1 rounded ${tunables.paper_autopilot_enabled ? "bg-emerald-900/40 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}>
          autopilot {tunables.paper_autopilot_enabled ? "ON" : "OFF"}
        </div>
        {tunables.updated_at && (
          <span className="text-[10px] text-zinc-600 ml-auto">updated {tunables.updated_at.slice(0, 10)}</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {fields.map(({ key, label, suffix }) => (
          <div key={key} className="bg-zinc-800/50 rounded-lg px-3 py-2">
            <div className="text-[10px] text-zinc-500">{label}</div>
            <div className="text-sm font-semibold text-zinc-200 mt-0.5">
              {(tunables as any)[key]}{suffix}
            </div>
          </div>
        ))}
      </div>
      <div className="pt-1">
        <p className="text-[11px] text-zinc-500 mb-2">Tunables are edited directly in the policy file on WSL.</p>
        <button
          onClick={() => { navigator.clipboard.writeText(editCommand); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied!" : "Copy edit command"}
        </button>
      </div>
    </div>
  )
}

// ─── Options Panel ────────────────────────────────────────────────────────────
function OptionsGateBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    PASS:    "bg-emerald-900/40 text-emerald-300 border-emerald-700/40",
    FAIL:    "bg-red-950/60 text-red-300/70 border-red-900/40",
    UNKNOWN: "bg-zinc-800 text-zinc-500 border-zinc-700",
  }
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-1 rounded border ${cfg[status] ?? cfg.UNKNOWN}`}>
      GATE {status}
    </span>
  )
}

function OptionsCandidateRow({ c, screened }: { c: OptionsCandidate; screened?: OptionsScreened }) {
  const [open, setOpen] = useState(false)
  const yieldColor = c.annualized_yield_pct >= 50 ? "text-emerald-400" : c.annualized_yield_pct >= 30 ? "text-yellow-400" : "text-zinc-300"
  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800/60 transition-colors cursor-pointer"
      onClick={() => setOpen(o => !o)}
    >
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-zinc-100 text-base">{c.symbol}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 font-semibold">CSP</span>
              {c.in_equity_pipeline && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-900/30 text-violet-400">in pipeline</span>
              )}
              {screened?.recommendation && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                  screened.recommendation === "PROCEED" ? "bg-emerald-900/40 text-emerald-300" :
                  screened.recommendation === "SKIP"    ? "bg-red-900/30 text-red-400" :
                  "bg-yellow-900/30 text-yellow-400"
                }`}>{screened.recommendation}</span>
              )}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              ${c.strike}P · exp {c.expiry} · {c.dte}d · δ {c.delta?.toFixed(2) ?? "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className={`text-base font-semibold ${yieldColor}`}>
              {c.annualized_yield_pct?.toFixed(1)}%
              <span className="text-xs text-zinc-500 ml-1 font-normal">ann.</span>
            </div>
            <div className="text-[11px] text-zinc-500">
              ${c.bid} bid · ${c.assignment_capital?.toLocaleString()} capital
            </div>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />}
        </div>
      </div>
      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-zinc-800/60 space-y-2 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-zinc-500">Current Price</div>
              <div className="text-zinc-200 font-medium">${c.current_price?.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-zinc-500">ATM IV</div>
              <div className="text-zinc-200 font-medium">{c.atm_iv?.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-zinc-500">IV Rank</div>
              <div className="text-zinc-400">{c.iv_rank != null ? `${c.iv_rank.toFixed(0)}%` : `— (${c.iv_rank_source?.replace(/_/g, " ")})`}</div>
            </div>
            <div>
              <div className="text-zinc-500">Open Interest</div>
              <div className="text-zinc-200 font-medium">{c.open_interest?.toLocaleString() ?? "—"}</div>
            </div>
            <div>
              <div className="text-zinc-500">Premium Yield</div>
              <div className="text-zinc-200 font-medium">{c.premium_yield_pct?.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-zinc-500">Assignment Capital</div>
              <div className="text-zinc-200 font-medium">${c.assignment_capital?.toLocaleString()}</div>
            </div>
            {c.thesis_direction && (
              <div>
                <div className="text-zinc-500">Thesis</div>
                <div className="text-zinc-200 font-medium capitalize">{c.thesis_direction} · {c.thesis_conviction}</div>
              </div>
            )}
            {screened?.thesis_alignment != null && (
              <div>
                <div className="text-zinc-500">Thesis Alignment</div>
                <div className="text-zinc-200 font-medium">{screened.thesis_alignment}/5</div>
              </div>
            )}
          </div>
          {screened?.rationale && (
            <div>
              <div className="text-zinc-500 mb-0.5">Agent-17 rationale</div>
              <div className="text-zinc-400 leading-snug">{screened.rationale}</div>
            </div>
          )}
          {screened?.narrative_risk && screened.narrative_risk.length > 0 && (
            <div>
              <div className="text-zinc-500 mb-0.5">Risk flags</div>
              <div className="flex flex-wrap gap-1">
                {screened.narrative_risk.map((r, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/30 text-orange-400">{r}</span>
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
    IDLE:      "bg-zinc-800 text-zinc-500",
    CSP_OPEN:  "bg-blue-900/40 text-blue-300",
    ASSIGNED:  "bg-yellow-900/40 text-yellow-300",
    CC_OPEN:   "bg-violet-900/40 text-violet-300",
    COMPLETED: "bg-emerald-900/40 text-emerald-300",
  }
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-zinc-100">{t.symbol}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 font-semibold">{t.type}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${wheelColors[t.wheel_state] ?? wheelColors.IDLE}`}>
            {t.wheel_state.replace(/_/g, " ")}
          </span>
        </div>
        <div className="text-[11px] text-zinc-500 mt-0.5">
          ${t.strike}P · {t.expiry} · {t.contracts} contract{t.contracts !== 1 ? "s" : ""} · {t.dte}d
        </div>
      </div>
      {t.limit_price != null && (
        <div className="text-right">
          <div className="text-sm font-semibold text-zinc-100">${t.limit_price.toFixed(2)}</div>
          <div className="text-[11px] text-zinc-500">limit</div>
        </div>
      )}
    </div>
  )
}

function OptionsPanel({ options }: { options: OptionsData }) {
  const { gate, candidates, screened, active_trades, executions, scan_summary, as_of } = options
  const screenedMap = Object.fromEntries(screened.map(s => [s.symbol, s]))
  const hasActive = active_trades.length > 0
  const hasExec = executions.length > 0

  return (
    <div className="space-y-4">
      {/* Header row: gate badge + slot usage + capital */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <OptionsGateBadge status={gate.status} />
        <span className="text-zinc-500">
          {gate.csp_slots_used}/{gate.csp_slots_max} CSP slots used
        </span>
        {gate.available_capital != null && (
          <span className="text-zinc-500">
            ${gate.available_capital.toLocaleString()} available
          </span>
        )}
        {gate.cash_buffer_pct != null && (
          <span className={`font-medium ${gate.cash_buffer_pct >= 15 ? "text-emerald-400" : "text-red-400"}`}>
            {gate.cash_buffer_pct.toFixed(0)}% cash buffer
          </span>
        )}
        {scan_summary && (
          <span className="ml-auto text-zinc-600">
            {scan_summary.passed}/{scan_summary.scanned} passed screen
          </span>
        )}
      </div>

      {/* Active trades (filled/open options positions) */}
      {hasActive && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Active Positions</h3>
          {active_trades.map((t, i) => <ActiveOptionsRow key={i} t={t} />)}
        </div>
      )}

      {/* Execution log */}
      {hasExec && (
        <div className="space-y-1">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Recent Fills</h3>
          {executions.map((e, i) => (
            <div key={i} className="text-xs text-zinc-400 flex items-center gap-3 px-1">
              <span className="font-mono text-zinc-200">{e.symbol}</span>
              <span>{e.type} ${e.strike} {e.expiry}</span>
              {e.premium != null && <span className="text-emerald-400">+${e.premium.toFixed(2)}</span>}
              {e.pnl != null && <span className={pnlColor(e.pnl)}>{e.pnl >= 0 ? "+" : ""}{fmt(e.pnl, "$")}</span>}
              <span className="text-zinc-600 ml-auto">{e.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* CSP Candidates */}
      {candidates.length > 0 ? (
        <div className="space-y-2">
          {hasActive && <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Screened Candidates</h3>}
          {candidates.map(c => (
            <OptionsCandidateRow key={c.symbol} c={c} screened={screenedMap[c.symbol]} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-zinc-600 py-4 text-center">No candidates — screener runs weekday mornings at 08:22 ET</div>
      )}
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
      <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
        <Nav active="trading" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="text-zinc-400">No trading data found</div>
            <div className="text-zinc-600 text-xs font-mono">python3 scripts/push-trading-data.py</div>
          </div>
        </div>
      </div>
    )
  }

  const exitSet = new Set(data.exit_candidates.map(e => e.symbol))
  const exitMap = Object.fromEntries(data.exit_candidates.map(e => [e.symbol, e]))

  const nebulaBg = {
    background: `
      radial-gradient(ellipse at 15% 55%, rgba(88, 28, 220, 0.28) 0%, transparent 50%),
      radial-gradient(ellipse at 85% 12%, rgba(109, 40, 217, 0.20) 0%, transparent 45%),
      radial-gradient(ellipse at 50% 90%, rgba(67, 20, 140, 0.22) 0%, transparent 48%),
      radial-gradient(ellipse at 70% 50%, rgba(76, 29, 149, 0.12) 0%, transparent 40%),
      #07021a
    `,
  }

  return (
    <div className="min-h-screen text-zinc-100 font-sans pb-16 sm:pb-0" style={nebulaBg}>
      <Nav active="trading" />

      <div className="px-4 sm:px-6 py-6 space-y-6 max-w-7xl mx-auto">

        {/* About blurb */}
        <p className="text-xs text-zinc-600 leading-relaxed">
          Live view of an AI-managed paper trading portfolio — built in public. All positions, P&L, and decisions are generated autonomously by OpenClaw, a custom agent pipeline running on Alpaca paper trading.
        </p>

        {/* Hero */}
        <HeroSection
          account={data.account}
          kpis={data.kpis}
          tunables={data.tunables}
          pipeline={data.pipeline_status}
          lastFetched={lastFetched}
          refreshing={refreshing}
          onRefresh={refresh}
        />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EquityCurve data={data.equity_curve} baseValue={data.account.base_value} />
          <DailyPnlChart data={data.daily_performance} />
        </div>

        {/* KPIs */}
        <KpiGrid kpis={data.kpis} />

        <Separator className="bg-zinc-800" />

        {/* Positions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Positions — {data.positions.length}
            </h2>
            {data.exit_candidates.length > 0 && (
              <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {data.exit_candidates.length} exit signal{data.exit_candidates.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <PositionsList positions={data.positions} exitCandidates={data.exit_candidates} />
        </div>

        {/* Exit candidates for symbols not in current positions */}
        {data.exit_candidates.some(e => !data.positions.find(p => p.symbol === e.symbol)) && (
          <>
            <Separator className="bg-zinc-800" />
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                Exit Signals (no current position)
              </h2>
              <ExitCandidatesPanel items={data.exit_candidates} positions={data.positions} />
            </div>
          </>
        )}

        <Separator className="bg-zinc-800" />

        {/* Watchlist */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
            Watchlist — {data.watchlist.length}
          </h2>
          <Watchlist items={data.watchlist} />
        </div>

        {/* Options */}
        {data.options && (
          <>
            <Separator className="bg-zinc-800" />
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <TrendingDown className="w-3.5 h-3.5 text-blue-400" />
                Options — Wheel Strategy
              </h2>
              <OptionsPanel options={data.options} />
            </div>
          </>
        )}

      </div>
    </div>
  )
}
