// Mock data for <EquityCurveSwarm /> while the producer-side
// research_lab.equity_swarm.v1 artifact is being wired by Codex.
//
// Mirrors the contract from
//   _design_handoff/CODEX_PRIMER_2026-04-28_lab_equity_swarm_contract.md
//
// Once the real artifact lands, the canonical EquitySwarmV1 type moves
// to lib/research-lab-contracts.ts (regenerated from the contracts doc)
// and this file goes away.

// Mirrors EquitySwarmV1 from
//   trading-bot/src/openclaw_core/research_lab/models.py
// (commit bdb4f8d, 2026-04-28). Once the real artifact is wired into
// the live Lab view, this type moves to lib/research-lab-contracts.ts.

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

export interface EquitySwarmV1 {
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

// ─── Mock generation ──────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function tradingDays(start: string, end: string): string[] {
  const out: string[] = []
  const cur = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cur <= last) {
    const dow = cur.getUTCDay()
    if (dow !== 0 && dow !== 6) out.push(isoDate(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

// Seeded LCG so mock is stable across renders.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function buildHeadlineCurve(
  dates: string[],
  startCapital: number,
  driftPctDaily: number,
  volPctDaily: number,
  seed: number,
): EquitySwarmPoint[] {
  const r = rng(seed)
  let value = startCapital
  return dates.map(date => {
    const shock = (r() - 0.5) * 2 * volPctDaily
    value = value * (1 + driftPctDaily + shock)
    const value_pct = ((value - startCapital) / startCapital) * 100
    return { date, value_usd: value, value_pct }
  })
}

function buildTrade(
  id: string,
  symbol: string,
  entry: string,
  exit: string | null,
  notional: number,
  finalPnlUsd: number,
  bars: string[],
  seed: number,
  exitReason: string | null = null,
): EquitySwarmTrade {
  const r = rng(seed)
  const startIdx = bars.indexOf(entry)
  const endIdx = exit == null ? bars.length - 1 : bars.indexOf(exit)
  const span = bars.slice(startIdx, endIdx + 1)
  const shares = Math.round(notional / 150)
  const entry_price = 150 + r() * 80
  const exit_price = exit == null ? null : entry_price + finalPnlUsd / shares

  // Random walk that lands at finalPnlUsd
  const n = span.length
  const noise = Array.from({ length: n }, () => (r() - 0.5) * 2)
  const cum = noise.map((_, i) => noise.slice(0, i + 1).reduce((a, b) => a + b, 0))
  const drift = Array.from({ length: n }, (_, i) => (i / (n - 1)) * finalPnlUsd)
  const lastCum = cum[cum.length - 1] || 0
  const scale = Math.abs(finalPnlUsd) * 0.3 / Math.max(1, Math.abs(lastCum))
  const mtm_curve: EquitySwarmPoint[] = span.map((date, i) => {
    const value_usd = i === 0 ? 0 : drift[i] + cum[i] * scale
    const value_pct = (value_usd / notional) * 100
    return { date, value_usd, value_pct }
  })
  // Pin endpoints
  mtm_curve[0] = { date: span[0], value_usd: 0, value_pct: 0 }
  mtm_curve[mtm_curve.length - 1] = {
    date: span[span.length - 1],
    value_usd: finalPnlUsd,
    value_pct: (finalPnlUsd / notional) * 100,
  }

  return {
    trade_id: id,
    symbol,
    side: "LONG",
    entry_date: entry,
    exit_date: exit,
    entry_price,
    exit_price,
    shares,
    notional_usd_at_entry: notional,
    pnl_usd: finalPnlUsd,
    pnl_pct: (finalPnlUsd / notional) * 100,
    status: exit == null ? "OPEN" : "CLOSED",
    exit_reason: exit == null ? null : exitReason,
    mtm_curve,
  }
}

const START = "2026-01-05"
const END = "2026-04-24"
const STARTING_CAPITAL = 100_000

const DAYS = tradingDays(START, END)

export const MOCK_EQUITY_SWARM: EquitySwarmV1 = {
  schema_version: "research_lab.equity_swarm.v1",
  result_id: "mock_result_q076b_2026_q1",
  job_id: "mock_job_q076b_2026_q1",
  idea_id: "mock_idea_regime_aware_momentum",
  run_id: "mock_run_q076b_20260417",
  campaign_id: "q076b_regime_aware_momentum_frozen_reference",
  source_variant_id: "stop_5_target_15",
  source_fold: "holdback",
  source_simulation_path: "backtest/experiments/q076b_regime_aware_momentum_opt_02__stop_5_target_15/simulations/holdback.simulation_run.json",
  source_dataset_path: null,
  generated_at: "2026-04-28T11:50:00-04:00",
  starting_capital_usd: STARTING_CAPITAL,
  currency: "USD",
  date_range: { start: START, end: END, as_of_date: null },
  strategy_curve: buildHeadlineCurve(DAYS, STARTING_CAPITAL, 0.0011, 0.008, 42),
  benchmark: {
    symbol: "SPY",
    label: "SPY",
    curve: buildHeadlineCurve(DAYS, STARTING_CAPITAL, 0.0006, 0.006, 117),
  },
  trades: [
    buildTrade("trade_0001", "AAPL",  "2026-01-15", "2026-02-03", 24_000,  +1_640, DAYS, 11, "target"),
    buildTrade("trade_0002", "MSFT",  "2026-01-22", "2026-02-12", 18_000,    +420, DAYS, 12, "max-hold"),
    buildTrade("trade_0003", "NVDA",  "2026-01-28", "2026-02-09", 12_000,  +3_180, DAYS, 13, "target"),
    buildTrade("trade_0004", "AMD",   "2026-02-04", "2026-02-25", 15_000,    -780, DAYS, 14, "stop"),
    buildTrade("trade_0005", "GOOGL", "2026-02-18", "2026-03-10", 22_000,  +1_220, DAYS, 15, "target"),
    buildTrade("trade_0006", "META",  "2026-02-26", "2026-03-06", 14_000,    -340, DAYS, 16, "stop"),
    buildTrade("trade_0007", "TSLA",  "2026-03-09", "2026-03-31", 16_000, -1_910,  DAYS, 17, "stop"),
    buildTrade("trade_0008", "CRM",   "2026-03-16", "2026-04-08", 11_000,    +590, DAYS, 18, "max-hold"),
    buildTrade("trade_0009", "ADBE",  "2026-03-23", "2026-04-15",  9_000,    -160, DAYS, 19, "stop"),
    buildTrade("trade_0010", "AVGO",  "2026-04-01", "2026-04-22", 13_000,  +2_040, DAYS, 20, "target"),
    buildTrade("trade_0011", "ORCL",  "2026-04-07", null,         10_500,    +280, DAYS, 21),
    buildTrade("trade_0012", "ASML",  "2026-04-14", null,         12_500,    -120, DAYS, 22),
  ],
}
