"use client"

import { useState, useEffect, useCallback } from "react"
import { Nav } from "@/components/nav"
import { Card, CardContent } from "@/components/ui/card"
import { Copy, Check, RefreshCw, Settings } from "lucide-react"

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
  tunables: Tunables
  pipeline_status?: {
    circuit_breaker: string
    verdict: string
  }
}

const FIELDS: { key: keyof Tunables; label: string; suffix: string; tooltip: string }[] = [
  {
    key: "max_daily_loss_pct",
    label: "Max Daily Loss",
    suffix: "%",
    tooltip: "Pipeline halts all new entries if realized P&L for the day drops below this % of account equity.",
  },
  {
    key: "max_risk_per_trade_pct",
    label: "Max Risk Per Trade",
    suffix: "%",
    tooltip: "Maximum capital at risk on any single trade, calculated as (entry − stop) × qty / equity.",
  },
  {
    key: "max_aggregate_open_risk_pct",
    label: "Max Aggregate Open Risk",
    suffix: "%",
    tooltip: "Sum of risk across all open positions cannot exceed this % of equity. Prevents over-concentration.",
  },
  {
    key: "max_concurrent_positions",
    label: "Max Concurrent Positions",
    suffix: "",
    tooltip: "Hard cap on the number of positions that can be open simultaneously.",
  },
  {
    key: "consecutive_loss_limit",
    label: "Consecutive Loss Limit",
    suffix: "",
    tooltip: "If this many trades in a row close at a loss, the pipeline enters REDUCE_ONLY or HALT mode.",
  },
  {
    key: "consecutive_loss_size_modifier",
    label: "Loss Size Modifier",
    suffix: "",
    tooltip: "Position size multiplier applied after consecutive losses begin, to reduce exposure.",
  },
  {
    key: "reduce_only_size_cap",
    label: "Reduce-Only Size Cap",
    suffix: "",
    tooltip: "Maximum position size allowed when circuit breaker is in REDUCE_ONLY state.",
  },
]

const EDIT_COMMAND = `# Edit risk policy tunables
# File: ~/.openclaw/workspace/trading-bot/policies/risk_policy.json
cp ~/.openclaw/workspace/trading-bot/policies/risk_policy.json \\
   ~/claude/OpenClaw-s-Brain/System/Policies/risk_policy.json
cd ~/claude/OpenClaw-s-Brain && git add System/Policies/risk_policy.json && \\
  git commit -m "policy: update risk tunables" && \\
  GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_claude" git push`

function TunablesPanel({ tunables, refreshing, onRefresh }: { tunables: Tunables; refreshing: boolean; onRefresh: () => void }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="space-y-6">
      {/* Status badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
          tunables.trading_mode === "PAPER"
            ? "bg-blue-900/40 text-blue-300 border-blue-700/40"
            : "bg-red-900/40 text-red-300 border-red-700/40"
        }`}>
          {tunables.trading_mode} MODE
        </span>
        <span className={`text-xs px-3 py-1.5 rounded-full border ${
          tunables.paper_autopilot_enabled
            ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/40"
            : "bg-zinc-800 text-zinc-400 border-zinc-700"
        }`}>
          Autopilot {tunables.paper_autopilot_enabled ? "ON" : "OFF"}
        </span>
        <span className={`text-xs px-3 py-1.5 rounded-full border ${
          tunables.live_trading_enabled
            ? "bg-red-900/50 text-red-300 border-red-600/40"
            : "bg-zinc-800 text-zinc-500 border-zinc-700"
        }`}>
          Live Trading {tunables.live_trading_enabled ? "ENABLED" : "Disabled"}
        </span>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {tunables.updated_at && (
        <p className="text-[11px] text-zinc-600">Last policy update: {tunables.updated_at.slice(0, 10)}</p>
      )}

      {/* Fields grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {FIELDS.map(({ key, label, suffix, tooltip }) => (
          <Card key={key} className="bg-zinc-900 border-zinc-800 group relative">
            <CardContent className="px-4 py-3">
              <div className="text-2xl font-bold text-zinc-100 font-mono">
                {(tunables as any)[key]}{suffix}
              </div>
              <div className="text-xs text-zinc-500 mt-1">{label}</div>
              <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block z-50 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[11px] text-zinc-300 w-56 leading-snug shadow-xl pointer-events-none">
                {tooltip}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit instructions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
          <Settings className="w-3.5 h-3.5" />
          How to edit tunables
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Tunables live in <code className="text-zinc-400 font-mono bg-zinc-800 px-1 py-0.5 rounded">~/.openclaw/workspace/trading-bot/policies/risk_policy.json</code>.
          Edit the file on WSL, then sync to OpenClaw-s-Brain so the change is tracked in git.
        </p>
        <button
          onClick={() => { navigator.clipboard.writeText(EDIT_COMMAND); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Copy sync command"}
        </button>
      </div>
    </div>
  )
}

export function TunablesPageClient({ initialData }: { initialData: TradingData | null }) {
  const [data, setData] = useState<TradingData | null>(initialData)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/trading", { cache: "no-store" })
      if (res.ok) setData(await res.json())
    } catch { /* keep stale */ } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-16 sm:pb-0">
      <Nav active="tunables" />
      <div className="px-4 sm:px-6 py-6 space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Risk Policy Tunables</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Active constraints governing position sizing, daily loss limits, and circuit breaker thresholds.
          </p>
        </div>
        {data?.tunables ? (
          <TunablesPanel tunables={data.tunables} refreshing={refreshing} onRefresh={refresh} />
        ) : (
          <p className="text-sm text-zinc-600">No tunables data found.</p>
        )}
      </div>
    </div>
  )
}
