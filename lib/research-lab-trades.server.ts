// Server-side loader for result_trades.v1 artifacts.
//
// RFC — the types below are pending Codex sign-off on the schema proposed in
// _design_handoff/CODEX_PRIMER_2026-05-07_result_trades_contract.md.
// Do NOT move these interfaces into research-lab-contracts.ts until
// 33-research-lab-contracts.md is updated and Codex has signed off.
//
// Storage path (proposed):
//   data/research_lab/<scope>/result_trades/result_trades_<result_id>.json

import { promises as fs } from "fs"
import path from "path"

import { PHASE_1_DEFAULT_SCOPE } from "./research-lab-contracts"
import type { ResearchSleeve, ScopeTriple } from "./research-lab-contracts"

// ─── RFC types (pending Codex sign-off) ─────────────────────────────────────

export type TradeSide = "LONG" | "SHORT"
export type TradeExitReason = "STOP" | "TARGET" | "TIME" | "REGIME_FLIP" | "OTHER"
export type TradeSizeUnit = "shares" | "contracts" | "units"

export interface ResultTradeSummary {
  total_trades: number
  winners: number
  losers: number
  /** Arithmetic mean across all trades, in seconds. */
  avg_holding_period: number
  /** All values are gross_pnl_pct. */
  pnl_distribution: {
    p25: number
    p50: number
    p75: number
    min: number
    max: number
  }
}

export interface ResultTradeEntry extends ScopeTriple {
  trade_id: string
  result_id: string
  variant_id: string
  idea_id: string
  sleeve: ResearchSleeve
  side: TradeSide
  /** Display label. Not a join key. */
  symbol?: string | null
  entry_at: string
  exit_at: string | null
  /** Seconds from entry_at to exit_at (or generated_at for open positions). */
  holding_period_seconds: number
  entry_price: number
  exit_price: number | null
  /** Numeric quantity; interpret with size_unit. */
  size: number
  size_unit: TradeSizeUnit
  /** entry_price × size (or notional equivalent for multi-leg). */
  notional_at_entry: number
  /** Pre-commission. For open positions: MTM as-of generated_at. */
  gross_pnl: number
  /** gross_pnl / notional_at_entry × 100 */
  gross_pnl_pct: number
  /** Benchmark return over the same entry→exit window. Absent if derivation is not available. */
  bench_mark_pnl_pct?: number | null
  regime_tag?: string | null
  exit_reason: TradeExitReason | null
}

export interface ResultTradesV1 extends ScopeTriple {
  schema_version: "research_lab.result_trades.v1"
  result_id: string
  job_id: string
  idea_id: string
  generated_at: string
  summary: ResultTradeSummary
  trades: ResultTradeEntry[]
}

// ─── Load result ─────────────────────────────────────────────────────────────

export type TradeLoadResult =
  | { state: "ok"; data: ResultTradesV1 }
  | { state: "empty" }
  | { state: "error"; message: string }

function scopeRoot(scope: ScopeTriple): string {
  return path.join(
    process.cwd(),
    "data",
    "research_lab",
    scope.user_id,
    scope.account_id,
    scope.strategy_group_id,
  )
}

export async function loadResultTrades(
  resultId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<TradeLoadResult> {
  if (!resultId || !/^[A-Za-z0-9_.:-]+$/.test(resultId)) return { state: "empty" }

  const absPath = path.join(
    scopeRoot(scope),
    "result_trades",
    `result_trades_${resultId}.json`,
  )

  try {
    const raw = await fs.readFile(absPath, "utf-8")
    const data = JSON.parse(raw) as ResultTradesV1
    return { state: "ok", data }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return { state: "empty" }
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[research-lab-trades] failed to read ${absPath}:`, err)
    return { state: "error", message }
  }
}
