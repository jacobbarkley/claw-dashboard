"use client"

import { useState } from "react"
import { Nav } from "@/components/nav"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts"
import { TrendingUp, TrendingDown, AlertTriangle, Eye, Copy, Check } from "lucide-react"

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

interface TradingData {
  generated_at: string
  as_of_date: string
  account: {
    positions_value: number
    unrealized_pnl: number
    unrealized_pnl_pct: number
    cash: number | null
  }
  positions: Position[]
  kpis: {
    total_trades: number
    closed_trades: number
    open_trades: number
    win_rate_pct: number | null
    profit_factor: number | null
    expectancy: number | null
    net_pnl: number
    max_drawdown_pct: number | null
    max_win_streak: number
    max_loss_streak: number
  }
  daily_performance: Array<{ date: string; net_pnl: number; trades: number; winners: number; losers: number }>
  equity_curve: Array<{ date: string; equity: number }>
  watchlist: WatchlistItem[]
  exit_candidates: ExitCandidate[]
  tunables: Tunables
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, prefix = "", suffix = "", decimals = 2) =>
  n == null ? "—" : `${prefix}${n.toFixed(decimals)}${suffix}`

const pnlColor = (n: number | null | undefined) =>
  n == null ? "text-zinc-400" : n >= 0 ? "text-emerald-400" : "text-red-400"

function shortDate(iso: string) {
  return iso.slice(5) // MM-DD
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="text-xl font-bold text-zinc-100">{value}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  )
}

// ─── Account Overview ─────────────────────────────────────────────────────────
function AccountOverview({ account, kpis, asOf }: {
  account: TradingData["account"]
  kpis: TradingData["kpis"]
  asOf: string
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="text-2xl font-bold text-zinc-100">${fmt(account.positions_value)}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Positions Value</div>
          <div className="text-[10px] text-zinc-600 mt-0.5">as of {asOf}</div>
        </CardContent>
      </Card>
      <Card className={`border ${account.unrealized_pnl >= 0 ? "bg-zinc-900 border-zinc-800" : "bg-red-950/20 border-red-500/30"}`}>
        <CardContent className="pt-4 pb-3 px-4">
          <div className={`text-2xl font-bold ${pnlColor(account.unrealized_pnl)}`}>
            {account.unrealized_pnl >= 0 ? "+" : ""}{fmt(account.unrealized_pnl, "$")}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Unrealized P&L</div>
          <div className={`text-[10px] mt-0.5 ${pnlColor(account.unrealized_pnl_pct)}`}>
            {fmt(account.unrealized_pnl_pct, "", "%")}
          </div>
        </CardContent>
      </Card>
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 pb-3 px-4">
          <div className={`text-2xl font-bold ${pnlColor(kpis.net_pnl)}`}>
            {fmt(kpis.net_pnl, "$")}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Realized P&L (all time)</div>
          <div className="text-[10px] text-zinc-600 mt-0.5">{kpis.closed_trades} closed trades</div>
        </CardContent>
      </Card>
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="text-2xl font-bold text-zinc-100">{kpis.total_trades}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Total Trades</div>
          <div className="text-[10px] text-zinc-600 mt-0.5">{kpis.open_trades} open</div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Equity Curve ─────────────────────────────────────────────────────────────
function EquityCurve({ data }: { data: Array<{ date: string; equity: number }> }) {
  if (!data.length) return null
  const last = data[data.length - 1]
  const isPositive = last.equity >= 0
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Equity Curve
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "#52525b" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "#52525b" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={48} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 11 }}
              formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Equity"]}
              labelFormatter={(l: any) => shortDate(String(l))}
            />
            <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="equity" stroke={isPositive ? "#34d399" : "#f87171"} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ─── Daily P&L bars ───────────────────────────────────────────────────────────
function DailyPnlChart({ data }: { data: Array<{ date: string; net_pnl: number }> }) {
  const recent = data.slice(-30)
  if (!recent.length) return null
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Daily P&L (last 30 days)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={recent} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "#52525b" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "#52525b" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={48} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 11 }}
              formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "P&L"]}
              labelFormatter={(l: any) => shortDate(String(l))}
            />
            <ReferenceLine y={0} stroke="#3f3f46" />
            <Bar dataKey="net_pnl" radius={[2, 2, 0, 0]}>
              {recent.map((d, i) => (
                <Cell key={i} fill={d.net_pnl >= 0 ? "#34d399" : "#f87171"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ─── KPI grid ─────────────────────────────────────────────────────────────────
function KpiGrid({ kpis }: { kpis: TradingData["kpis"] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      <KpiCard label="Win Rate"       value={kpis.win_rate_pct != null ? `${kpis.win_rate_pct.toFixed(1)}%` : "—"} />
      <KpiCard label="Profit Factor"  value={fmt(kpis.profit_factor)} />
      <KpiCard label="Expectancy"     value={fmt(kpis.expectancy, "$")} />
      <KpiCard label="Max Drawdown"   value={kpis.max_drawdown_pct != null ? `${kpis.max_drawdown_pct.toFixed(1)}%` : "—"} />
      <KpiCard label="Win Streak"     value={String(kpis.max_win_streak)} sub="best" />
      <KpiCard label="Loss Streak"    value={String(kpis.max_loss_streak)} sub="worst" />
    </div>
  )
}

// ─── Positions table ──────────────────────────────────────────────────────────
function PositionsTable({ positions }: { positions: Position[] }) {
  if (!positions.length) return (
    <div className="text-sm text-zinc-600 py-4 text-center">No open positions</div>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-zinc-500 border-b border-zinc-800">
            <th className="text-left pb-2 font-medium">Symbol</th>
            <th className="text-right pb-2 font-medium">Qty</th>
            <th className="text-right pb-2 font-medium">Entry</th>
            <th className="text-right pb-2 font-medium">Current</th>
            <th className="text-right pb-2 font-medium">Mkt Val</th>
            <th className="text-right pb-2 font-medium">Unreal P&L</th>
            <th className="text-right pb-2 font-medium">Today</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(p => (
            <tr key={p.symbol} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
              <td className="py-2 font-mono font-semibold text-zinc-100">{p.symbol}</td>
              <td className="py-2 text-right text-zinc-400">{p.qty}</td>
              <td className="py-2 text-right text-zinc-400">${p.entry_price?.toFixed(2)}</td>
              <td className="py-2 text-right text-zinc-300">${p.current_price?.toFixed(2)}</td>
              <td className="py-2 text-right text-zinc-300">${p.market_value?.toFixed(2)}</td>
              <td className={`py-2 text-right font-medium ${pnlColor(p.unrealized_pnl)}`}>
                {p.unrealized_pnl >= 0 ? "+" : ""}{fmt(p.unrealized_pnl, "$")}
                <span className="text-[10px] ml-1 opacity-70">({fmt(p.unrealized_pct, "", "%", 1)})</span>
              </td>
              <td className={`py-2 text-right text-[11px] ${pnlColor(p.change_today_pct)}`}>
                {fmt(p.change_today_pct, "", "%", 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

// ─── Exit Candidates ─────────────────────────────────────────────────────────
function ExitCandidates({ items }: { items: ExitCandidate[] }) {
  if (!items.length) return <div className="text-sm text-zinc-600 py-4 text-center">No exit candidates</div>
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.symbol} className={`rounded-lg border p-3 space-y-1 ${item.urgency === "HIGH" ? "border-red-500/40 bg-red-950/10" : "border-orange-500/30 bg-orange-950/10"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-zinc-100">{item.symbol}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${item.urgency === "HIGH" ? "bg-red-500/20 text-red-300" : "bg-orange-500/20 text-orange-300"}`}>
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
    { key: "max_daily_loss_pct",           label: "Max Daily Loss",              suffix: "%" },
    { key: "max_risk_per_trade_pct",        label: "Max Risk Per Trade",          suffix: "%" },
    { key: "max_aggregate_open_risk_pct",   label: "Max Aggregate Open Risk",     suffix: "%" },
    { key: "max_concurrent_positions",      label: "Max Concurrent Positions",    suffix: ""  },
    { key: "consecutive_loss_limit",        label: "Consecutive Loss Limit",      suffix: ""  },
    { key: "consecutive_loss_size_modifier",label: "Loss Size Modifier",          suffix: ""  },
    { key: "reduce_only_size_cap",          label: "Reduce-Only Size Cap",        suffix: ""  },
  ]

  const editCommand = `# Edit risk policy tunables
# File: ~/.openclaw/workspace/trading-bot/policies/risk_policy.json
# After editing, sync to repo:
cp ~/.openclaw/workspace/trading-bot/policies/risk_policy.json \\
   ~/claude/OpenClaw-s-Brain/System/Policies/risk_policy.json
cd ~/claude/OpenClaw-s-Brain && git add System/Policies/risk_policy.json \\
  trading-bot/policies/risk_policy.json && \\
  git commit -m "policy: update risk tunables" && \\
  GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_claude" git push`

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
        <p className="text-[11px] text-zinc-500 mb-2">
          Tunables are edited directly in the policy file on WSL. Copy the command below.
        </p>
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

// ─── Main ─────────────────────────────────────────────────────────────────────
export function TradingDashboard({ data }: { data: TradingData | null }) {
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <Nav active="trading" />

      <div className="px-6 py-6 space-y-6 max-w-7xl mx-auto">

        {/* Account overview */}
        <AccountOverview account={data.account} kpis={data.kpis} asOf={data.as_of_date} />

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EquityCurve data={data.equity_curve} />
          <DailyPnlChart data={data.daily_performance} />
        </div>

        {/* KPIs */}
        <KpiGrid kpis={data.kpis} />

        <Separator className="bg-zinc-800" />

        {/* Positions */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Open Positions — {data.positions.length}
          </h2>
          <PositionsTable positions={data.positions} />
        </div>

        <Separator className="bg-zinc-800" />

        {/* Watchlist + Exit candidates side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
              Watchlist — Potential Buys ({data.watchlist.length})
            </h2>
            <Watchlist items={data.watchlist} />
          </div>
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
              Exit Candidates ({data.exit_candidates.length})
            </h2>
            <ExitCandidates items={data.exit_candidates} />
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* Risk tunables */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Risk Policy — Tunables
          </h2>
          <TunablesPanel tunables={data.tunables} />
        </div>

      </div>
    </div>
  )
}
