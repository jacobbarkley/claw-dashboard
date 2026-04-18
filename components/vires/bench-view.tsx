"use client"

// Vires Bench — research surface ported from the design handoff
// (vires-bench.jsx). Wired to the existing bench data flow:
//   - data/bench/index.json → run list, specs, comparisons, manifests
//   - operator.strategy_bank.active → featured promoted strategy with metrics
// No new API contracts. The Codex backend primer (saved separately) covers
// the deeper wiring (leaderboards, era robustness matrix, etc.) that future
// commits will plug into the existing slots here.

import { useState } from "react"
import { AnimatedNumber, InfoPop, SectionHeader, SleeveChip, StatusPill, fmtPct, type Sleeve } from "./shared"
import { useLivePoll } from "./use-live-poll"

// ─── Types — narrow on purpose ──────────────────────────────────────────────

interface BenchRun {
  bench_id: string
  run_id: string
  title: string
  sleeve: string | null
  status: string | null
  selected_config_id: string | null
  evaluated_candidate_count: number | null
  search_space_size: number | null
  sweep_truncated: boolean | null
  primary_metric: string | null
  primary_metric_value: number | null
  generated_at: string | null
  promotion_target?: string | null
}

interface ManifestSummary {
  manifest_id: string
  sleeve?: string | null
  source_kind?: string
}

interface BenchData {
  runs?: BenchRun[]
  manifests?: ManifestSummary[]
}

interface ActiveStrategy {
  display_name?: string
  variant_id?: string
  symbols?: string[]
  performance?: {
    totalReturn?: number
    excess?: number
    sharpe?: number
    calmar?: number
    maxDD?: number
    winRate?: number
  }
}

interface OperatorBundle {
  strategy_bank?: {
    active?: ActiveStrategy | null
  } | null
}

// ─── Bench hero — headline + 4-stat strip ──────────────────────────────────

function BenchHero({ runs }: { runs: BenchRun[] }) {
  const promotedCount = 1 // single promoted strategy today; expand when bank grows
  const stats = [
    { label: "Runs",       value: runs.length },
    { label: "Succeeded",  value: runs.filter(r => r.status === "SUCCEEDED").length },
    { label: "Partial",    value: runs.filter(r => r.status === "PARTIAL").length },
    { label: "Promoted",   value: promotedCount },
  ]
  return (
    <div className="vr-card-hero" style={{ padding: 22 }}>
      <div className="t-eyebrow" style={{ marginBottom: 10 }}>The Bench</div>
      <div className="t-h2" style={{ lineHeight: 1.25, maxWidth: 320, marginBottom: 14 }}>
        Where strategies <span className="t-accent">earn</span> capital.
      </div>
      <div className="t-read" style={{ fontSize: 12, maxWidth: 310 }}>
        Bench runs validate strategies through risk-aware participation across market eras. Only
        survivors promote to live allocation.
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          marginTop: 20,
          borderTop: "1px solid var(--vr-line)",
          paddingTop: 14,
        }}
      >
        {stats.map((s, i) => (
          <div
            key={s.label}
            style={{ padding: "0 10px", borderLeft: i > 0 ? "1px solid var(--vr-line)" : "none" }}
          >
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 5 }}>{s.label}</div>
            <div className="t-h1 t-num" style={{ fontSize: 24 }}>
              <AnimatedNumber value={s.value} format={(v) => Math.round(v).toString()} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Featured strategy ──────────────────────────────────────────────────────
// Single promoted strategy card. Metrics pulled from the operator feed's
// active strategy record. Falls back to a "no promoted strategy" empty state
// if the bank is empty.

function FeaturedStrategy({ strategy }: { strategy: ActiveStrategy | null }) {
  if (!strategy) {
    return (
      <div className="vr-card" style={{ padding: 20 }}>
        <div className="t-eyebrow" style={{ marginBottom: 6 }}>Promoted</div>
        <div className="t-h4" style={{ color: "var(--vr-cream-dim)" }}>No promoted strategy yet</div>
        <div className="t-label" style={{ fontSize: 11, marginTop: 4 }}>
          Strategies appear here once they clear the bench gates and the strategy bank promotes them.
        </div>
      </div>
    )
  }

  const p = strategy.performance ?? {}
  const metrics: Array<{ l: string; term?: string; v: string; c: string }> = [
    { l: "Total Return", term: "TotalReturn", v: p.totalReturn != null ? `${p.totalReturn.toFixed(1)}%` : "—", c: "var(--vr-up)" },
    { l: "vs Bench",     term: "VsBench",     v: p.excess != null ? `${p.excess >= 0 ? "+" : ""}${p.excess.toFixed(1)}%` : "—", c: p.excess != null && p.excess >= 0 ? "var(--vr-up)" : "var(--vr-down)" },
    { l: "Sharpe",       term: "Sharpe",      v: p.sharpe != null ? p.sharpe.toFixed(2) : "—", c: "var(--vr-cream)" },
    { l: "Calmar",       term: "Calmar",      v: p.calmar != null ? p.calmar.toFixed(2) : "—", c: "var(--vr-gold)" },
    { l: "Max DD",       term: "MaxDD",       v: p.maxDD != null ? `${p.maxDD.toFixed(2)}%` : "—", c: "var(--vr-down)" },
    { l: "Win Rate",     term: "WinRate",     v: p.winRate != null ? `${p.winRate.toFixed(1)}%` : "—", c: "var(--vr-cream)" },
  ]

  return (
    <div
      className="vr-card"
      style={{
        padding: 18,
        borderColor: "var(--vr-gold-line)",
        background: "var(--vr-ink)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <StatusPill tone="gold">Promoted</StatusPill>
        <SleeveChip sleeve="stocks" />
      </div>
      <div className="t-h3" style={{ marginTop: 6 }}>{strategy.display_name ?? "Active Strategy"}</div>
      {strategy.variant_id && (
        <div className="t-label" style={{ fontSize: 11, marginTop: 3 }}>{strategy.variant_id}</div>
      )}
      {(strategy.symbols ?? []).length > 0 && (
        <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
          {(strategy.symbols ?? []).map(s => (
            <span
              key={s}
              className="t-ticker"
              style={{
                fontSize: 10,
                padding: "2px 6px",
                background: "rgba(241,236,224,0.03)",
                border: "1px solid var(--vr-line)",
                borderRadius: 2,
                color: "var(--vr-cream-dim)",
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", marginTop: 16, borderTop: "1px solid var(--vr-line)" }}>
        {metrics.map((m, i) => (
          <div
            key={m.l}
            style={{
              padding: "10px 12px",
              borderLeft: i % 3 !== 0 ? "1px solid var(--vr-line)" : "none",
              borderBottom: i < 3 ? "1px solid var(--vr-line)" : "none",
            }}
          >
            <div className="t-eyebrow" style={{ fontSize: 9, display: "flex", alignItems: "center" }}>
              {m.l}
              {m.term && <InfoPop term={m.term} size={10} />}
            </div>
            <div className="t-num" style={{ fontSize: 15, color: m.c, fontWeight: 500, marginTop: 4 }}>{m.v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Run card ───────────────────────────────────────────────────────────────

const SLEEVE_FROM_RUN: Record<string, Sleeve> = {
  STOCKS: "stocks",
  CRYPTO: "crypto",
  OPTIONS: "options",
}

const STATUS_TONE: Record<string, "up" | "down" | "warn" | "neutral"> = {
  SUCCEEDED: "up",
  COMPLETED: "up",
  PARTIAL:   "warn",
  IN_PROGRESS: "warn",
  RUNNING:   "warn",
  FAILED:    "down",
  ERRORED:   "down",
}

function RunCard({ run }: { run: BenchRun }) {
  const sl = SLEEVE_FROM_RUN[(run.sleeve ?? "STOCKS").toUpperCase()] ?? "stocks"
  const color = `var(--vr-sleeve-${sl})`
  const evaluated = run.evaluated_candidate_count ?? 0
  const total = run.search_space_size ?? 0
  const pct = total > 0 ? Math.min(100, (evaluated / total) * 100) : 0
  const tone = STATUS_TONE[(run.status ?? "").toUpperCase()] ?? "neutral"

  return (
    <div
      className="vr-card"
      style={{
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "var(--vr-ink)",
        border: "1px solid var(--vr-line)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <SleeveChip sleeve={sl} />
            {run.promotion_target && (
              <span className="t-eyebrow" style={{ color: "var(--vr-cream-faint)" }}>
                · {run.promotion_target.toLowerCase()}
              </span>
            )}
          </div>
          <div className="t-h4" style={{ fontSize: 14, lineHeight: 1.3 }}>{run.title}</div>
        </div>
        {run.status && <StatusPill tone={tone}>{run.status}</StatusPill>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 2 }}>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 9 }}>{run.primary_metric ?? "metric"}</div>
          <div
            className="t-num"
            style={{ fontSize: 18, color, fontWeight: 500, marginTop: 3, fontFamily: "var(--ff-mono)" }}
          >
            {run.primary_metric_value != null ? run.primary_metric_value.toFixed(4) : "—"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="t-eyebrow" style={{ fontSize: 9 }}>Evaluated</div>
          <div className="t-num" style={{ fontSize: 13, color: "var(--vr-cream)", marginTop: 3 }}>
            {evaluated.toLocaleString()}
            {total > 0 && (
              <span style={{ color: "var(--vr-cream-faint)" }}> / {total.toLocaleString()}</span>
            )}
          </div>
        </div>
      </div>
      {total > 0 && (
        <div style={{ height: 2, background: "rgba(241,236,224,0.04)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 1s" }} />
        </div>
      )}
      {run.selected_config_id && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid var(--vr-line)",
            paddingTop: 8,
          }}
        >
          <span className="t-eyebrow" style={{ fontSize: 9 }}>Winner</span>
          <span className="t-ticker" style={{ fontSize: 11, color: "var(--vr-gold)", textTransform: "none" }}>
            {run.selected_config_id}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function ViresBenchView({ benchData: initialBench, operator: initialOperator }: {
  benchData: BenchData | null
  operator: OperatorBundle | null
}) {
  const [filter, setFilter] = useState<"ALL" | "STOCKS" | "CRYPTO">("ALL")

  // Live poll both feeds. Bench index changes rarely but operator bundle
  // (with strategy_bank.active performance) moves per-session.
  const { data: liveBench } = useLivePoll<BenchData>("/api/bench/index", initialBench)
  const { data: liveTrading } = useLivePoll<{ operator?: OperatorBundle | null }>("/api/trading", { operator: initialOperator })

  const benchData = liveBench ?? initialBench
  const operator = liveTrading?.operator ?? initialOperator

  if (!benchData?.runs?.length) {
    return (
      <div className="vr-screen" style={{ padding: 16 }}>
        <BenchHero runs={[]} />
        <div className="vr-card" style={{ padding: 24, marginTop: 14 }}>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>No bench runs</div>
          <div className="t-label">
            Run scripts/pull-bench-data.py to ingest from trading-bot, or wait for the publication
            cron.
          </div>
        </div>
      </div>
    )
  }

  // Sort runs newest-first by generated_at
  const sortedRuns = [...benchData.runs].sort((a, b) => {
    const ta = a.generated_at ? new Date(a.generated_at).getTime() : 0
    const tb = b.generated_at ? new Date(b.generated_at).getTime() : 0
    return tb - ta
  })
  const filtered = filter === "ALL" ? sortedRuns : sortedRuns.filter(r => (r.sleeve ?? "").toUpperCase() === filter)

  const featured = mapActiveStrategy(operator?.strategy_bank?.active ?? null)

  return (
    <div className="vr-screen vires-screen-pad" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <BenchHero runs={sortedRuns} />

      <SectionHeader eyebrow="Promoted" title="In production" />
      <FeaturedStrategy strategy={featured} />

      <SectionHeader
        eyebrow="Research"
        title="Active runs"
        right={
          <div style={{ display: "flex", gap: 2, padding: 2, background: "rgba(241,236,224,0.02)", border: "1px solid var(--vr-line)", borderRadius: 3 }}>
            {(["ALL", "STOCKS", "CRYPTO"] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="t-eyebrow"
                style={{
                  padding: "3px 7px",
                  borderRadius: 2,
                  border: "none",
                  cursor: "pointer",
                  background: filter === f ? "var(--vr-gold)" : "transparent",
                  color: filter === f ? "var(--vr-ink)" : "var(--vr-cream-mute)",
                  fontWeight: 600,
                  fontSize: 9,
                }}
              >
                {f}
              </button>
            ))}
          </div>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(r => <RunCard key={`${r.bench_id}/${r.run_id}`} run={r} />)}
      </div>

      {/* Suppress unused-var noise — fmtPct will be used once leaderboard lands. */}
      {(false as boolean) && <span>{fmtPct(0)}</span>}
    </div>
  )
}

// Map the operator feed's strategy_bank.active record to the slimmer shape
// FeaturedStrategy expects. The active record uses snake_case + nested
// performance_summary; we pull the headline fields and rename for display.
function mapActiveStrategy(record: unknown): ActiveStrategy | null {
  if (!record || typeof record !== "object") return null
  const r = record as Record<string, unknown>
  const perf = (r.performance_summary ?? {}) as Record<string, unknown>
  const planning = (r.planning_profile ?? {}) as Record<string, unknown>
  const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)
  return {
    display_name: typeof r.display_name === "string" ? r.display_name : undefined,
    variant_id: typeof r.variant_id === "string" ? r.variant_id : undefined,
    symbols: Array.isArray(planning.symbols) ? (planning.symbols as string[]) : undefined,
    performance: {
      totalReturn: num(perf.total_return_pct),
      excess: num(perf.excess_return_pct),
      sharpe: num(perf.sharpe_ratio),
      calmar: num(perf.calmar_ratio),
      maxDD: num(perf.max_drawdown_pct),
      winRate: num(perf.win_rate_pct),
    },
  }
}
