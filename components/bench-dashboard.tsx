"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Nav } from "@/components/nav"
import { ChevronDown, ChevronUp, RefreshCw, Info } from "lucide-react"
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, ZAxis, Cell, ReferenceLine,
} from "recharts"

// ─── Types ────────────────────────────────────────────────────────────────────
interface BenchIndexEntry {
  bench_id: string
  run_id: string
  title: string
  sleeve: string | null
  engine: string | null
  promotion_target: string | null
  status: string | null
  selected_config_id: string | null
  evaluated_candidate_count: number | null
  search_space_size: number | null
  candidate_cap: number | null
  sweep_truncated: boolean | null
  primary_metric: string | null
  primary_metric_value: number | null
  generated_at: string | null
}

interface BenchSpecEntry {
  bench_id: string
  title: string
  sleeve: string | null
  engine: string | null
  hypothesis: string | null
  has_runs: boolean
}

interface ComparisonLane {
  lane_id: string
  label: string
  role: string
  net_return_pct: number | null
  sharpe: number | null
  calmar: number | null
  max_drawdown_pct: number | null
  trades: number | null
  exposure_pct: number | null
  note: string | null
}

interface SleeveComparison {
  title: string
  sleeve: string
  dataset: { symbol?: string; start_date?: string; end_date?: string }
  lanes: ComparisonLane[]
}

interface BenchIndex {
  generated_at: string
  source: string
  runs: BenchIndexEntry[]
  specs?: BenchSpecEntry[]
  comparisons?: SleeveComparison[]
}

interface LeaderboardRow {
  rank: number
  config_id: string
  selected: boolean
  passes_hard_reject_rules: boolean
  plateau_passed: boolean | null
  params: Record<string, number | string | boolean | null>
  primary_metric_value: number | null
  net_total_compounded_return_pct: number | null
  trade_count: number | null
  median_era_sharpe: number | null
  minimum_era_sharpe: number | null
  max_single_era_pnl_share_pct: number | null
  benchmark_id?: string | null
  excess_return_vs_benchmark_pct?: number | null
  sharpe_delta_vs_benchmark?: number | null
  calmar_delta_vs_benchmark?: number | null
  drawdown_improvement_vs_benchmark_pct?: number | null
}

interface BenchSpec {
  schema_version?: string
  bench_id: string
  title: string
  hypothesis?: string
  sleeve?: string
  engine?: string
  promotion_target?: string
  dataset?: {
    provider?: string
    venue?: string
    symbol?: string
    benchmark_symbol?: string
    source_timeframe?: string
    target_timeframe?: string
    start_date?: string
    end_date?: string
    eras?: Array<{ era_id: string; label: string; start_date: string; end_date: string; regime_character?: string; rationale?: string }>
  }
  strategy?: {
    strategy_id?: string
    strategy_family?: string
    base_parameters?: Record<string, number | string | boolean | null>
    sweep_dimensions?: Array<{ parameter: string; values: (number | string)[]; description?: string }>
  }
  run?: {
    search_mode?: string
    fill_model?: string
    exposure_model?: string
    capital_base_usd?: number
    train_window_days?: number
    test_window_days?: number
    step_size_days?: number
  }
  cost_model?: {
    fee_bps_round_trip?: number
    fee_per_trade_usd?: number
    slippage_bps_one_way?: number
  }
  evaluation?: {
    baseline_ids?: string[]
    selection_metric?: string
    secondary_metrics?: string[]
    hard_reject_rules?: Array<{ gate_id: string; metric: string; operator: string; value: number; description?: string }>
    plateau_rule?: { required?: boolean; neighborhood_side?: number; minimum_passing_neighbors?: number; description?: string }
  }
}

interface BenchRunBundle {
  run_id: string
  bench_id: string
  generated_at: string
  status: string
  selected_config_id: string | null
  evaluated_candidate_count: number
  search_space_size: number
  candidate_cap: number | null
  sweep_truncated: boolean
  primary_metric: string
  primary_metric_value: number | null
}

interface BenchRunDetail {
  bundle: BenchRunBundle
  spec: BenchSpec
  leaderboard: LeaderboardRow[]
}

type BenchTab = "home" | "stocks" | "options" | "crypto"

// ─── Constants + helpers ──────────────────────────────────────────────────────
const TAB_META: Record<BenchTab, { label: string; accent: string; sleeveKey: string | null }> = {
  home:    { label: "Home",    accent: "#e3e6f0", sleeveKey: null },
  stocks:  { label: "Stocks",  accent: "#10b981", sleeveKey: "STOCKS"  },
  options: { label: "Options", accent: "#d4c28a", sleeveKey: "OPTIONS" },
  crypto:  { label: "Crypto",  accent: "#8b5cf6", sleeveKey: "CRYPTO"  },
}

const STATUS_TONE: Record<string, "good" | "medium" | "bad"> = {
  SUCCEEDED:   "good",
  COMPLETED:   "good",
  PARTIAL:     "medium",
  IN_PROGRESS: "medium",
  RUNNING:     "medium",
  FAILED:      "bad",
  ERRORED:     "bad",
}

function sleeveAccent(sleeve: string | null | undefined): string {
  if (!sleeve) return "#9ba0bc"
  const meta = Object.values(TAB_META).find(m => m.sleeveKey === sleeve.toUpperCase())
  return meta?.accent ?? "#9ba0bc"
}

function statusColor(status: string | null): string {
  if (!status) return "var(--cb-text-tertiary)"
  const tone = STATUS_TONE[status.toUpperCase()] ?? "medium"
  return tone === "good" ? "var(--cb-green)" : tone === "bad" ? "var(--cb-red)" : "var(--cb-amber)"
}

function shortHash(s: string | null | undefined, len = 8): string {
  if (!s) return "—"
  return s.length <= len ? s : s.slice(0, len)
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v.toFixed(digits)}%`
}

function fmtNum(v: number | null | undefined, digits = 4): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toFixed(digits)
}

function fmtCount(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("en-US")
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return "—"
  const diff = (Date.now() - t) / 1000
  if (diff < 60) return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function titleizeFamily(s: string | null | undefined): string {
  if (!s) return "—"
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Glossary ────────────────────────────────────────────────────────────────
// Definitions the UI can surface inline via InfoPop. Single source of truth so
// explanations stay consistent across the bench surface.
const GLOSSARY: Record<string, string> = {
  winner: "A candidate config that cleared every hard-reject rule and satisfies the plateau rule — meaning it also has enough neighboring configs in the parameter grid that pass the same gates. Not just a single lucky score.",
  partial: "A bounded sweep that stopped at its candidate cap before exhausting the full search space. Not a failure — it just means the runner ran the budget the spec asked for and reported what it found in that sample.",
  no_winner: "The bench hasn't promoted a candidate yet. Two common reasons: (a) the sweep is PARTIAL and hasn't reached the region where winners live, or (b) no config in the evaluated sample cleared the hard-reject rules and plateau check.",
  reject: "Candidate failed at least one hard-reject rule (e.g., too few trades, worst-era Sharpe below zero, or too much PnL concentrated in a single era). Real bench result, not an exception.",
  plateau_rule: "Promotion requires a local plateau in the parameter grid — the winning candidate plus at least N neighbors must all pass the gates. Stops spiky single-point winners from being promoted.",
  primary_metric: "The metric the bench uses to rank candidates. Usually something era-aware like median-era Sharpe so a config has to earn its rank across the whole catalog, not just one regime.",
  truncated: "The runner hit its candidate cap before exhausting the search space. Common for bounded sweeps. If the top ranks cluster near the cap, the spec is likely worth re-running with a higher cap.",
  col_primary: "The metric the bench ranks candidates by — usually median-era Sharpe. A config must earn its rank across every era, not just one favorable regime.",
  col_net_return: "Total compounded net return after fees and slippage over the full backtest period (e.g., 2016–2026). Raw headline number, not risk-adjusted.",
  col_med_era: "Median Sharpe ratio across all named eras. The bench's primary quality signal — it shows how consistently the config performs across different market regimes (mania, winter, recovery, etc.).",
  col_min_era: "Worst-era Sharpe — the config's weakest performance in any single era. The hard-reject rule requires this ≥ 0, meaning the config can't lose money in its worst regime.",
  col_max_era_pct: "Maximum percentage of total PnL coming from a single era. Capped at 50% by a hard-reject rule — if more than half the profit comes from one era, the edge may not be durable.",
  col_trades: "Total number of trades across all eras. Hard-reject minimum of 30 ensures enough data points for statistical confidence.",
  col_max_dd: "Maximum drawdown — the largest peak-to-trough drop during the backtest. If a portfolio goes from $100k to $25k before recovering, that's 75% max DD. Lower is better. Most retail investors panic-sell during deep drawdowns, so this is the consumer-grade safety metric.",
  col_exposure: "Percentage of time the strategy is invested (holding a position). 100% = always in the market (like HODL). 53% = only invested about half the time. Lower exposure with comparable returns means the strategy is selective — it earns during favorable regimes and sits out during dangerous ones.",
  col_sharpe: "Risk-adjusted return — measures return per unit of volatility. Above 1.0 is strong. Tells you whether the returns are earned through skill or just by taking more risk.",
  col_calmar: "Return divided by maximum drawdown. Our primary success metric for crypto. Higher = better compensation for the worst pain endured. Answers: 'was the ride worth the dip?'",
}

function InfoPop({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center justify-center rounded-full hover:opacity-100 transition-opacity"
        style={{ width: 13, height: 13, opacity: 0.55 }}
        aria-label="What does this mean?"
      >
        <Info className="w-3 h-3" style={{ color: "var(--cb-text-tertiary)" }} />
      </button>
      {open && (
        <span
          className="fixed z-50 rounded-lg px-3.5 py-2.5 text-[11px] leading-relaxed shadow-xl"
          style={{
            background: "rgba(10, 14, 31, 0.98)",
            border: "1px solid var(--cb-border-hi)",
            boxShadow: "0 12px 32px rgba(5, 8, 26, 0.9)",
            color: "var(--cb-text-secondary)",
            maxWidth: 260,
            width: "max-content",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            whiteSpace: "normal",
            wordWrap: "break-word",
            pointerEvents: "none",
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}

// ─── Bench tabs (Home | Stocks | Options | Crypto) ──────────────────────────
function BenchTabs({ active, onChange }: { active: BenchTab; onChange: (t: BenchTab) => void }) {
  const order: BenchTab[] = ["home", "stocks", "options", "crypto"]
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

// ─── Index card ──────────────────────────────────────────────────────────────
function BenchIndexCard({
  entry, active, onClick,
}: { entry: BenchIndexEntry; active: boolean; onClick: () => void }) {
  const accent = sleeveAccent(entry.sleeve)
  const statusCol = statusColor(entry.status)
  const evaluatedPct = entry.evaluated_candidate_count != null && entry.search_space_size
    ? Math.min(100, (entry.evaluated_candidate_count / entry.search_space_size) * 100)
    : null

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl px-4 py-3.5 transition-all"
      style={{
        background: active
          ? `radial-gradient(circle at 12% 15%, ${accent}26, transparent 55%), var(--cb-surface-0)`
          : "var(--cb-surface-0)",
        border: `1px solid ${active ? accent + "55" : "var(--cb-border-std)"}`,
        boxShadow: active
          ? `inset 0 1px 0 rgba(180, 195, 235, 0.04), 0 0 0 1px ${accent}14, 0 4px 16px rgba(5, 8, 26, 0.5)`
          : "inset 0 1px 0 rgba(180, 195, 235, 0.025), 0 2px 8px rgba(5, 8, 26, 0.35)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-block rounded-full shrink-0" style={{
            width: 7, height: 7, background: accent,
            boxShadow: active ? `0 0 8px ${accent}80` : "none",
            opacity: active ? 1 : 0.65,
          }} />
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: active ? "var(--cb-text-primary)" : "var(--cb-text-secondary)",
          }}>
            {entry.sleeve ?? "—"}
          </span>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
          textTransform: "uppercase", color: statusCol,
        }}>
          {entry.status ?? "—"}
        </span>
      </div>

      <div style={{
        fontSize: 13, fontWeight: 500,
        color: active ? "var(--cb-text-primary)" : "var(--cb-text-secondary)",
        lineHeight: 1.3, marginBottom: 4,
      }}>
        {entry.title}
      </div>

      <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)", marginBottom: 8 }}>
        {entry.run_id}  ·  {timeAgo(entry.generated_at)}
      </div>

      {evaluatedPct != null && (
        <div className="space-y-1">
          <div className="flex justify-between" style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>
            <span>{fmtCount(entry.evaluated_candidate_count)} / {fmtCount(entry.search_space_size)} evaluated</span>
            <span>{evaluatedPct.toFixed(1)}%</span>
          </div>
          <div className="relative h-1 rounded-full overflow-hidden" style={{ background: "var(--cb-surface-2)" }}>
            <div className="absolute inset-y-0 left-0 rounded-full transition-all"
              style={{ width: `${evaluatedPct}%`, background: accent, opacity: 0.75 }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-3" style={{ fontSize: 11 }}>
        <span style={{ color: "var(--cb-text-tertiary)" }}>Winner</span>
        {entry.selected_config_id
          ? <span className="font-mono" style={{ color: "var(--cb-green)" }}>{shortHash(entry.selected_config_id, 10)}</span>
          : <span style={{ color: "var(--cb-amber)" }}>none yet</span>}
      </div>
    </button>
  )
}

// ─── Run delta strip ─────────────────────────────────────────────────────────
// Shows a compact "vs previous run" comparison when there's an earlier run for
// the same bench_id. Three signals a first-timer needs to know if things are
// improving: evaluated count, primary metric, winner state.
function RunDelta({ current, previous, onJumpToPrevious }: {
  current: BenchRunBundle
  previous: BenchIndexEntry
  onJumpToPrevious: () => void
}) {
  const evalDelta = (current.evaluated_candidate_count ?? 0) - (previous.evaluated_candidate_count ?? 0)
  const hasMetric = current.primary_metric_value != null && previous.primary_metric_value != null
  const metricDelta = hasMetric ? (current.primary_metric_value as number) - (previous.primary_metric_value as number) : null

  let winnerChange: { label: string; tone: "good" | "medium" | "bad" } = { label: "no change", tone: "medium" }
  if (current.selected_config_id && !previous.selected_config_id) {
    winnerChange = { label: "winner found", tone: "good" }
  } else if (!current.selected_config_id && previous.selected_config_id) {
    winnerChange = { label: "winner lost", tone: "bad" }
  } else if (current.selected_config_id && previous.selected_config_id && current.selected_config_id !== previous.selected_config_id) {
    winnerChange = { label: "winner changed", tone: "medium" }
  } else if (!current.selected_config_id && !previous.selected_config_id) {
    winnerChange = { label: "still no winner", tone: "medium" }
  }

  return (
    <div
      className="mt-3 px-3 py-2 rounded-lg flex items-center gap-3 flex-wrap"
      style={{ background: "rgba(212, 194, 138, 0.06)", border: "1px solid rgba(212, 194, 138, 0.18)" }}
    >
      <button
        onClick={onJumpToPrevious}
        className="text-left hover:opacity-80 transition-opacity shrink-0"
        style={{ fontSize: 10, color: "var(--cb-text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" }}
      >
        vs previous · {shortHash(previous.run_id, 24)}
      </button>
      <div className="flex items-center gap-2.5 flex-wrap">
        <DeltaChip
          label={`${evalDelta >= 0 ? "+" : ""}${fmtCount(Math.abs(evalDelta))} evaluated`}
          tone={evalDelta > 0 ? "good" : evalDelta < 0 ? "bad" : "medium"}
          arrow={evalDelta > 0 ? "up" : evalDelta < 0 ? "down" : "flat"}
        />
        {metricDelta != null && (
          <DeltaChip
            label={`${metricDelta >= 0 ? "+" : ""}${metricDelta.toFixed(4)} ${current.primary_metric ?? "primary"}`}
            tone={metricDelta > 0 ? "good" : metricDelta < 0 ? "bad" : "medium"}
            arrow={metricDelta > 0 ? "up" : metricDelta < 0 ? "down" : "flat"}
          />
        )}
        <DeltaChip label={winnerChange.label} tone={winnerChange.tone} arrow={winnerChange.tone === "good" ? "up" : winnerChange.tone === "bad" ? "down" : "flat"} />
      </div>
    </div>
  )
}

function DeltaChip({ label, tone, arrow }: {
  label: string; tone: "good" | "medium" | "bad"; arrow: "up" | "down" | "flat"
}) {
  const color = tone === "good" ? "var(--cb-green)" : tone === "bad" ? "var(--cb-red)" : "var(--cb-text-secondary)"
  const arrowChar = arrow === "up" ? "↑" : arrow === "down" ? "↓" : "·"
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{
        fontSize: 11,
        background: `${color === "var(--cb-text-secondary)" ? "rgba(155, 160, 188, 0.08)" : tone === "good" ? "rgba(16, 185, 129, 0.10)" : "rgba(224, 82, 82, 0.10)"}`,
        color,
        border: `1px solid ${tone === "good" ? "rgba(16, 185, 129, 0.22)" : tone === "bad" ? "rgba(224, 82, 82, 0.22)" : "rgba(155, 160, 188, 0.18)"}`,
      }}
    >
      <span style={{ opacity: 0.7, fontSize: 10 }}>{arrowChar}</span>
      {label}
    </span>
  )
}

// ─── Bench role + result storytelling ────────────────────────────────────────
// Derives what role a bench plays and tells a plain-language result story so a
// first-time user understands what they're looking at without knowing the internals.

function deriveBenchRole(benchId: string, hypothesis: string | undefined): { role: string; roleLabel: string; roleDescription: string } {
  const id = benchId.toLowerCase()
  if (id.includes("neighborhood") || id.includes("probe")) {
    return {
      role: "probe",
      roleLabel: "NEIGHBORHOOD VALIDATION",
      roleDescription: "Follow-up investigation — zooms into the parameter neighborhood around the main sweep's top candidates to confirm the edge isn't a single spiky winner. A much smaller, focused grid.",
    }
  }
  if (id.includes("sweep")) {
    return {
      role: "sweep",
      roleLabel: "PARAMETER SWEEP",
      roleDescription: "Primary parameter search — explores the full grid of strategy configurations to find which combinations produce consistent risk-adjusted returns across all named eras.",
    }
  }
  return {
    role: "run",
    roleLabel: "RESEARCH RUN",
    roleDescription: hypothesis ?? "Bench validation run.",
  }
}

function deriveResultStory(bundle: BenchRunBundle, spec: BenchSpec): string {
  const passes = bundle.evaluated_candidate_count
  const total = bundle.search_space_size

  if (bundle.status === "SUCCEEDED" && bundle.selected_config_id) {
    return `Winner confirmed: ${bundle.selected_config_id} cleared all hard-reject gates and has stable neighbors in the parameter grid. ${spec.evaluation?.plateau_rule?.required ? "Plateau check passed." : ""} Primary metric (${bundle.primary_metric}): ${bundle.primary_metric_value?.toFixed(4) ?? "—"}.`
  }
  if (bundle.status === "SUCCEEDED" && !bundle.selected_config_id) {
    return `Completed full evaluation — ${passes} of ${total} configs tested. No candidate met all promotion criteria. The strategy hypothesis may need revision, or the gates may be too strict for this search space.`
  }
  if (bundle.status === "PARTIAL" && !bundle.selected_config_id) {
    const pct = total ? ((passes / total) * 100).toFixed(1) : "?"
    return `In progress — ${passes?.toLocaleString()} of ${total?.toLocaleString()} configs evaluated (${pct}% of search space). No winner yet from this bounded sample. A wider budget or follow-up neighborhood probe may find the passing region.`
  }
  if (bundle.status === "PARTIAL" && bundle.selected_config_id) {
    return `Found a passing candidate (${bundle.selected_config_id}) within a bounded sample of ${passes?.toLocaleString()} configs. Sweep is partial — more configs remain untested.`
  }
  return `Status: ${bundle.status}. ${passes?.toLocaleString()} of ${total?.toLocaleString()} evaluated.`
}

// ─── Run summary + strategy explanation ─────────────────────────────────────
function RunSummary({ detail, previousRun, onJumpToPrevious }: {
  detail: BenchRunDetail
  previousRun: BenchIndexEntry | null
  onJumpToPrevious: () => void
}) {
  const { bundle, spec } = detail
  const accent = sleeveAccent(spec.sleeve)
  const evaluatedPct = bundle.search_space_size
    ? Math.min(100, (bundle.evaluated_candidate_count / bundle.search_space_size) * 100)
    : 0
  const [expanded, setExpanded] = useState(true)  // default expanded per Jacob's feedback

  const { roleLabel, roleDescription } = deriveBenchRole(bundle.bench_id, spec.hypothesis ?? undefined)
  const resultStory = deriveResultStory(bundle, spec)

  return (
    <div
      className="rounded-xl px-5 py-4"
      style={{
        background: `radial-gradient(circle at 12% 10%, ${accent}18, transparent 45%), var(--cb-surface-0)`,
        border: `1px solid ${accent}33`,
        boxShadow: "inset 0 1px 0 rgba(180, 195, 235, 0.035), 0 4px 20px rgba(5, 8, 26, 0.45)",
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: accent, boxShadow: `0 0 8px ${accent}80` }} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: accent }}>
              {spec.sleeve ?? "—"} · {roleLabel}
            </span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 500, color: "var(--cb-text-primary)", letterSpacing: "-0.01em" }}>
            {spec.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--cb-text-tertiary)", marginTop: 2 }}>
            {bundle.run_id} · generated {timeAgo(bundle.generated_at)}
            {spec.dataset?.start_date && spec.dataset?.end_date && (
              <span> · {spec.dataset.start_date} → {spec.dataset.end_date}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full px-2.5 py-1"
            style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
              background: `${statusColor(bundle.status)}1f`, color: statusColor(bundle.status),
              border: `1px solid ${statusColor(bundle.status)}40`,
            }}
          >
            {bundle.status}
          </span>
          {bundle.status === "PARTIAL" && <InfoPop text={GLOSSARY.partial} />}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mt-2">
        <SummaryMetric
          label="Evaluated"
          value={`${fmtCount(bundle.evaluated_candidate_count)} / ${fmtCount(bundle.search_space_size)}`}
          sub={`${evaluatedPct.toFixed(1)}% of space`}
        />
        <SummaryMetric
          label="Cap"
          value={bundle.candidate_cap ? fmtCount(bundle.candidate_cap) : "—"}
          sub={bundle.sweep_truncated ? "truncated" : "full"}
          infoText={bundle.sweep_truncated ? GLOSSARY.truncated : undefined}
        />
        <SummaryMetric
          label={bundle.primary_metric ?? "Primary"}
          value={fmtNum(bundle.primary_metric_value)}
          sub={bundle.selected_config_id ? "winner's score" : "no winner yet"}
          infoText={GLOSSARY.primary_metric}
        />
        <SummaryMetric
          label="Winner"
          value={bundle.selected_config_id ? shortHash(bundle.selected_config_id, 12) : "none"}
          sub={bundle.selected_config_id ? "cleared all gates" : "still searching"}
          mono={!!bundle.selected_config_id}
          infoText={bundle.selected_config_id ? GLOSSARY.winner : GLOSSARY.no_winner}
        />
      </div>

      {/* Run-to-run delta strip */}
      {previousRun && (
        <RunDelta current={bundle} previous={previousRun} onJumpToPrevious={onJumpToPrevious} />
      )}

      {/* Role description — what this bench IS */}
      <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--cb-border-dim)", fontSize: 12, color: "var(--cb-text-secondary)", lineHeight: 1.55 }}>
        <span className="cb-label" style={{ marginRight: 8 }}>What this is</span>
        {roleDescription}
      </div>

      {/* Result story — what this bench FOUND, in plain language */}
      <div className="mt-3 px-4 py-3 rounded-lg" style={{ background: bundle.selected_config_id ? "rgba(16, 185, 129, 0.06)" : "rgba(212, 194, 138, 0.06)", border: `1px solid ${bundle.selected_config_id ? "rgba(16, 185, 129, 0.20)" : "rgba(212, 194, 138, 0.18)"}` }}>
        <div className="cb-label mb-1" style={{ color: bundle.selected_config_id ? "var(--cb-green)" : "var(--cb-amber)" }}>
          Result
        </div>
        <div style={{ fontSize: 12, color: "var(--cb-text-primary)", lineHeight: 1.55 }}>
          {resultStory}
        </div>
      </div>

      {/* Hypothesis — always visible */}
      {spec.hypothesis && (
        <div className="mt-3" style={{ fontSize: 12, color: "var(--cb-text-secondary)", lineHeight: 1.55 }}>
          <span className="cb-label" style={{ marginRight: 8 }}>Hypothesis</span>
          {spec.hypothesis}
        </div>
      )}

      {/* Expandable: how this bench works */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full mt-3 flex items-center justify-between py-1 text-left"
        style={{ fontSize: 11, color: "var(--cb-text-secondary)" }}
      >
        <span className="cb-label">How this bench works</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && <BenchExplainer spec={spec} />}
    </div>
  )
}

function SummaryMetric({ label, value, sub, mono, infoText }: {
  label: string; value: string; sub?: string; mono?: boolean; infoText?: string
}) {
  return (
    <div>
      <div className="cb-label flex items-center gap-1">
        <span>{label}</span>
        {infoText && <InfoPop text={infoText} />}
      </div>
      <div
        className={mono ? "font-mono" : ""}
        style={{ fontSize: 14, fontWeight: 500, color: "var(--cb-text-primary)", letterSpacing: mono ? 0 : "-0.01em", marginTop: 2 }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)", marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function BenchExplainer({ spec }: { spec: BenchSpec }) {
  return (
    <div className="mt-2 pt-3 space-y-4" style={{ borderTop: "1px solid var(--cb-border-dim)", fontSize: 12, lineHeight: 1.6, color: "var(--cb-text-secondary)" }}>
      {/* Strategy */}
      {spec.strategy && (
        <div>
          <div className="cb-label mb-2">Strategy</div>
          <div style={{ color: "var(--cb-text-primary)" }}>
            {titleizeFamily(spec.strategy.strategy_family)}
            {spec.strategy.strategy_id && <span className="font-mono" style={{ color: "var(--cb-text-tertiary)", marginLeft: 8, fontSize: 10 }}>{spec.strategy.strategy_id}</span>}
          </div>
          {spec.strategy.sweep_dimensions && spec.strategy.sweep_dimensions.length > 0 && (
            <div className="mt-2">
              <div style={{ fontSize: 11, color: "var(--cb-text-tertiary)", marginBottom: 4 }}>
                Sweep explores {spec.strategy.sweep_dimensions.length} parameter dimensions:
              </div>
              <ul className="space-y-1 pl-2">
                {spec.strategy.sweep_dimensions.map(d => (
                  <li key={d.parameter} className="flex items-start gap-2">
                    <span className="font-mono shrink-0" style={{ color: "var(--cb-text-tertiary)", fontSize: 11, minWidth: 140 }}>
                      {d.parameter}
                    </span>
                    <span style={{ fontSize: 11 }}>
                      {d.values.length} values · {d.description ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Dataset / eras */}
      {spec.dataset && (
        <div>
          <div className="cb-label mb-2">Dataset</div>
          <div>
            <span className="font-mono" style={{ color: "var(--cb-text-primary)" }}>{spec.dataset.symbol}</span>
            {" at "}
            <span className="font-mono">{spec.dataset.target_timeframe ?? spec.dataset.source_timeframe}</span>
            {spec.dataset.provider && ` via ${spec.dataset.provider}`}
            {spec.dataset.venue && ` (${spec.dataset.venue})`}
            {spec.dataset.start_date && spec.dataset.end_date && ` · ${spec.dataset.start_date} → ${spec.dataset.end_date}`}
          </div>
          {spec.dataset.eras && spec.dataset.eras.length > 0 && (
            <div className="mt-2">
              <div style={{ fontSize: 11, color: "var(--cb-text-tertiary)", marginBottom: 4 }}>
                {spec.dataset.eras.length} eras — each candidate is evaluated across all of them so one regime can&rsquo;t carry the whole edge:
              </div>
              <ul className="space-y-1 pl-2">
                {spec.dataset.eras.map(e => (
                  <li key={e.era_id} style={{ fontSize: 11 }}>
                    <span style={{ color: "var(--cb-text-primary)" }}>{e.label}</span>
                    <span style={{ color: "var(--cb-text-tertiary)", marginLeft: 6 }}>
                      {e.start_date} → {e.end_date}
                    </span>
                    {e.rationale && <div style={{ color: "var(--cb-text-tertiary)", marginTop: 1, paddingLeft: 0 }}>{e.rationale}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Evaluation gates */}
      {spec.evaluation && (
        <div>
          <div className="cb-label mb-2 flex items-center gap-1">
            <span>Evaluation gates</span>
            <InfoPop text={GLOSSARY.plateau_rule} />
          </div>
          {spec.evaluation.hard_reject_rules && spec.evaluation.hard_reject_rules.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "var(--cb-text-tertiary)", marginBottom: 4 }}>
                Hard-reject rules — any candidate failing these drops out entirely:
              </div>
              <ul className="space-y-1 pl-2">
                {spec.evaluation.hard_reject_rules.map(r => (
                  <li key={r.gate_id} style={{ fontSize: 11 }}>
                    <span className="font-mono" style={{ color: "var(--cb-text-primary)" }}>
                      {r.metric} {r.operator} {r.value}
                    </span>
                    {r.description && <span style={{ color: "var(--cb-text-tertiary)" }}> — {r.description}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {spec.evaluation.plateau_rule?.required && (
            <div className="mt-2" style={{ fontSize: 11 }}>
              <span style={{ color: "var(--cb-text-primary)" }}>Plateau rule:</span>
              <span style={{ color: "var(--cb-text-tertiary)", marginLeft: 4 }}>
                Winner plus at least {spec.evaluation.plateau_rule.minimum_passing_neighbors} neighbors within
                ±{spec.evaluation.plateau_rule.neighborhood_side} param steps must all pass the gates.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Cost model + run config */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {spec.cost_model && (
          <div>
            <div className="cb-label mb-2">Cost model</div>
            <div style={{ fontSize: 11, lineHeight: 1.7 }}>
              {spec.cost_model.fee_bps_round_trip != null && <div>{spec.cost_model.fee_bps_round_trip} bps round-trip fee</div>}
              {spec.cost_model.slippage_bps_one_way != null && <div>{spec.cost_model.slippage_bps_one_way} bps one-way slippage</div>}
              {spec.cost_model.fee_per_trade_usd != null && spec.cost_model.fee_per_trade_usd > 0 && <div>${spec.cost_model.fee_per_trade_usd} per-trade fee</div>}
            </div>
          </div>
        )}
        {spec.run && (
          <div>
            <div className="cb-label mb-2">Run config</div>
            <div style={{ fontSize: 11, lineHeight: 1.7 }}>
              {spec.run.search_mode && <div>{titleizeFamily(spec.run.search_mode)} search</div>}
              {spec.run.capital_base_usd != null && <div>Starting capital ${fmtCount(spec.run.capital_base_usd)}</div>}
              {spec.run.fill_model && <div>Fill model: {titleizeFamily(spec.run.fill_model)}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Leaderboard distribution chart ──────────────────────────────────────────
// Zoomed scatter of top candidates — the chart tells the story of WHERE passing
// configs live relative to the nearest rejects, not a meaningless 2000-dot soup.
function LeaderboardDistribution({ rows, metricName, accent }: {
  rows: LeaderboardRow[]; metricName: string; accent: string
}) {
  const [showAll, setShowAll] = useState(false)

  const allData = useMemo(() => rows
    .filter(r => r.primary_metric_value != null && Number.isFinite(r.primary_metric_value))
    .map(r => ({
      rank: r.rank,
      value: r.primary_metric_value as number,
      passes: r.passes_hard_reject_rules,
      selected: r.selected,
      configId: r.config_id,
    })),
    [rows])

  const passCount = allData.filter(d => d.passes).length
  const rejectCount = allData.length - passCount

  // Default zoom: top 50 candidates (shows the pass/reject boundary clearly)
  const data = showAll ? allData : allData.slice(0, Math.max(50, passCount + 20))

  if (!allData.length) return null

  // Human-readable metric label
  const metricLabel = metricName === "median_era_sharpe" ? "Median Era Sharpe"
    : metricName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="cb-card-t2 px-4 py-3 mb-3">
      {/* Header with legend */}
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="cb-label flex items-center gap-1">
            <span>Candidate quality distribution</span>
            <InfoPop text="Shows the primary metric for each candidate by rank. Zoomed to the top 50 by default so you can see where passing configs cluster relative to rejects. A flat top means many configs converge to similar performance (real plateau). A sharp drop means the edge is fragile." />
          </div>
          <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)", marginTop: 2 }}>
            {passCount} pass{passCount !== 1 ? "" : "es"} · {rejectCount} reject{rejectCount !== 1 ? "s" : ""} · showing {showAll ? "all" : `top ${data.length}`}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-3" style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>
            {passCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: accent }} />
                Passes gates ({passCount})
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgba(224, 82, 82, 0.55)" }} />
              Rejected
            </span>
          </div>
          <button
            onClick={() => setShowAll(v => !v)}
            className="text-[10px] hover:opacity-80 transition-opacity"
            style={{ color: "var(--cb-text-secondary)" }}
          >
            {showAll ? "Zoom to top 50" : `Show all ${allData.length}`}
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
          <XAxis
            type="number"
            dataKey="rank"
            name="Rank"
            tick={{ fontSize: 10, fill: "#7b7892" }}
            tickLine={false}
            axisLine={{ stroke: "var(--cb-border-dim)" }}
            label={{ value: "Candidate rank", position: "bottom", offset: 12, style: { fontSize: 10, fill: "#5c6281", letterSpacing: "0.04em" } }}
          />
          <YAxis
            type="number"
            dataKey="value"
            name={metricLabel}
            tick={{ fontSize: 10, fill: "#7b7892" }}
            tickLine={false}
            axisLine={false}
            width={52}
            label={{ value: metricLabel, angle: -90, position: "insideLeft", offset: 4, style: { fontSize: 10, fill: "#5c6281", letterSpacing: "0.04em" } }}
          />
          {/* Zero reference line — worst-era Sharpe floor */}
          <ReferenceLine y={0} stroke="rgba(224, 82, 82, 0.3)" strokeDasharray="4 3" />
          <ZAxis dataKey="passes" range={[12, 40]} />
          <RechartsTooltip
            cursor={{ strokeDasharray: "3 3", stroke: "var(--cb-border-std)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              return (
                <div style={{
                  background: "rgba(10, 14, 31, 0.97)",
                  border: "1px solid rgba(110, 135, 210, 0.22)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 11,
                }}>
                  <div style={{ color: "var(--cb-text-tertiary)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                    Rank {p.rank} · {shortHash(p.configId, 10)}
                  </div>
                  <div style={{ color: "var(--cb-text-primary)", fontFamily: "var(--font-mono)", fontSize: 14 }}>{p.value.toFixed(4)}</div>
                  <div style={{ color: p.selected ? "var(--cb-green)" : p.passes ? accent : "var(--cb-red)", fontSize: 10, marginTop: 3, fontWeight: 500 }}>
                    {p.selected ? "WINNER — cleared all gates + plateau" : p.passes ? "PASSES — cleared hard-reject rules" : "REJECTED — failed at least one gate"}
                  </div>
                </div>
              )
            }}
          />
          <Scatter data={data} fill={accent} isAnimationActive={false}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.selected ? "var(--cb-green)" : entry.passes ? accent : "rgba(224, 82, 82, 0.45)"}
                fillOpacity={entry.selected ? 1 : entry.passes ? 0.9 : 0.4}
                r={entry.passes ? 6 : 3}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Leaderboard table ───────────────────────────────────────────────────────
type SortKey = "rank" | "primary_metric_value" | "net_total_compounded_return_pct" | "median_era_sharpe" | "minimum_era_sharpe" | "max_single_era_pnl_share_pct"

function Leaderboard({ rows, primaryMetric, accent }: { rows: LeaderboardRow[]; primaryMetric: string; accent: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [filterPasses, setFilterPasses] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(
    () => filterPasses ? rows.filter(r => r.passes_hard_reject_rules) : rows,
    [rows, filterPasses]
  )

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity
      const bv = b[sortKey] ?? -Infinity
      if (av === bv) return 0
      const cmp = av < bv ? -1 : 1
      return sortDir === "asc" ? cmp : -cmp
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const visible = showAll ? sorted : sorted.slice(0, 25)

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(k); setSortDir(k === "rank" ? "asc" : "desc") }
  }

  return (
    <div>
      <LeaderboardDistribution rows={rows} metricName={primaryMetric} accent={accent} />
      <div className="cb-card-t2 px-0 py-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 flex-wrap gap-2" style={{ borderBottom: "1px solid var(--cb-border-dim)" }}>
          <div className="flex items-center gap-2">
            <span className="cb-label">Leaderboard</span>
            <span style={{ fontSize: 11, color: "var(--cb-text-tertiary)" }}>
              {filtered.length} of {rows.length} candidates
            </span>
          </div>
          <button
            onClick={() => setFilterPasses(v => !v)}
            className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
            style={{
              background: filterPasses ? "rgba(16, 185, 129, 0.16)" : "transparent",
              border: `1px solid ${filterPasses ? "rgba(16, 185, 129, 0.4)" : "var(--cb-border-std)"}`,
              color: filterPasses ? "var(--cb-green)" : "var(--cb-text-secondary)",
            }}
          >
            Pass hard-reject only
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ color: "var(--cb-text-tertiary)" }}>
                <Th onClick={() => toggleSort("rank")} active={sortKey === "rank"} dir={sortDir} align="left">#</Th>
                <Th align="left">Config</Th>
                <Th align="left">Status</Th>
                <Th onClick={() => toggleSort("primary_metric_value")} active={sortKey === "primary_metric_value"} dir={sortDir}>Primary <InfoPop text={GLOSSARY.col_primary} /></Th>
                <Th onClick={() => toggleSort("net_total_compounded_return_pct")} active={sortKey === "net_total_compounded_return_pct"} dir={sortDir}>Net Return <InfoPop text={GLOSSARY.col_net_return} /></Th>
                <Th onClick={() => toggleSort("median_era_sharpe")} active={sortKey === "median_era_sharpe"} dir={sortDir}>Med Era Sharpe <InfoPop text={GLOSSARY.col_med_era} /></Th>
                <Th onClick={() => toggleSort("minimum_era_sharpe")} active={sortKey === "minimum_era_sharpe"} dir={sortDir}>Min Era Sharpe <InfoPop text={GLOSSARY.col_min_era} /></Th>
                <Th onClick={() => toggleSort("max_single_era_pnl_share_pct")} active={sortKey === "max_single_era_pnl_share_pct"} dir={sortDir}>Max Era PnL <InfoPop text={GLOSSARY.col_max_era_pct} /></Th>
                <Th align="right">Trades <InfoPop text={GLOSSARY.col_trades} /></Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => <LeaderboardRow key={r.config_id} row={r} />)}
            </tbody>
          </table>
        </div>
        {filtered.length > 25 && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="w-full py-2 text-[11px] hover:opacity-80 transition-opacity"
            style={{ color: "var(--cb-text-secondary)", borderTop: "1px solid var(--cb-border-dim)" }}
          >
            {showAll ? "Show top 25" : `Show all ${filtered.length}`}
          </button>
        )}
      </div>
    </div>
  )
}

function Th({ children, onClick, active, dir, align = "right" }: {
  children: React.ReactNode; onClick?: () => void; active?: boolean; dir?: "asc" | "desc"; align?: "left" | "right"
}) {
  const interactive = !!onClick
  return (
    <th
      onClick={onClick}
      className={interactive ? "cursor-pointer hover:text-[var(--cb-text-primary)] transition-colors" : ""}
      style={{
        textAlign: align, padding: "8px 10px", fontWeight: 500, letterSpacing: "0.06em",
        textTransform: "uppercase", fontSize: 9, color: active ? "var(--cb-text-primary)" : undefined,
        whiteSpace: "nowrap", borderBottom: "1px solid var(--cb-border-dim)", background: "var(--cb-surface-1)",
      }}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (dir === "asc" ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
      </span>
    </th>
  )
}

function LeaderboardRow({ row }: { row: LeaderboardRow }) {
  const [expanded, setExpanded] = useState(false)
  const passes = row.passes_hard_reject_rules
  const isWinner = row.selected
  const accentBorder = isWinner ? "var(--cb-green)" : passes ? "transparent" : "rgba(224, 82, 82, 0.35)"

  return (
    <>
      <tr
        onClick={() => setExpanded(v => !v)}
        className="cursor-pointer transition-colors hover:bg-white/[0.02]"
        style={{
          borderLeft: `2px solid ${accentBorder}`,
          background: isWinner ? "rgba(16, 185, 129, 0.04)" : undefined,
        }}
      >
        <Td align="left" style={{ fontWeight: isWinner ? 600 : 400, color: isWinner ? "var(--cb-green)" : undefined }}>{row.rank}</Td>
        <Td align="left" mono color={isWinner ? "var(--cb-text-primary)" : undefined}>{shortHash(row.config_id, 10)}</Td>
        <Td align="left">
          {isWinner
            ? <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", color: "var(--cb-green)" }}>WINNER</span>
            : passes
              ? <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", color: "var(--cb-text-tertiary)" }}>PASS</span>
              : <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", color: "var(--cb-red)" }}>REJECT</span>}
        </Td>
        <Td>{fmtNum(row.primary_metric_value)}</Td>
        <Td>{fmtPct(row.net_total_compounded_return_pct)}</Td>
        <Td>{fmtNum(row.median_era_sharpe, 2)}</Td>
        <Td>{fmtNum(row.minimum_era_sharpe, 2)}</Td>
        <Td>{fmtPct(row.max_single_era_pnl_share_pct, 1)}</Td>
        <Td>{fmtCount(row.trade_count)}</Td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: "12px 16px 14px", background: "var(--cb-surface-1)", borderBottom: "1px solid var(--cb-border-dim)" }}>
            <div className="cb-label mb-2">Params</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1.5">
              {Object.entries(row.params).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3" style={{ fontSize: 10 }}>
                  <span style={{ color: "var(--cb-text-tertiary)" }}>{k}</span>
                  <span className="font-mono" style={{ color: "var(--cb-text-primary)" }}>{String(v)}</span>
                </div>
              ))}
            </div>
            {(row.excess_return_vs_benchmark_pct != null || row.sharpe_delta_vs_benchmark != null) && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--cb-border-dim)" }}>
                <div className="cb-label mb-2">vs {row.benchmark_id ?? "benchmark"}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5" style={{ fontSize: 10 }}>
                  <BenchmarkDelta label="Excess return" value={row.excess_return_vs_benchmark_pct} suffix="%" />
                  <BenchmarkDelta label="Sharpe delta" value={row.sharpe_delta_vs_benchmark} digits={2} />
                  <BenchmarkDelta label="Calmar delta" value={row.calmar_delta_vs_benchmark} digits={2} />
                  <BenchmarkDelta label="Drawdown improvement" value={row.drawdown_improvement_vs_benchmark_pct} suffix="%" />
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function Td({ children, align = "right", mono, color, style }: {
  children: React.ReactNode; align?: "left" | "right"; mono?: boolean; color?: string; style?: React.CSSProperties
}) {
  return (
    <td
      className={mono ? "font-mono" : ""}
      style={{
        textAlign: align, padding: "8px 10px", whiteSpace: "nowrap",
        color: color ?? "var(--cb-text-secondary)", borderBottom: "1px solid var(--cb-border-dim)", ...style,
      }}
    >
      {children}
    </td>
  )
}

function BenchmarkDelta({ label, value, suffix = "", digits = 2 }: { label: string; value: number | null | undefined; suffix?: string; digits?: number }) {
  const isPos = value != null && value > 0
  const isNeg = value != null && value < 0
  return (
    <div className="flex justify-between gap-3">
      <span style={{ color: "var(--cb-text-tertiary)" }}>{label}</span>
      <span className="font-mono" style={{ color: isPos ? "var(--cb-green)" : isNeg ? "var(--cb-red)" : "var(--cb-text-tertiary)" }}>
        {value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`}
      </span>
    </div>
  )
}

// ─── Home view ───────────────────────────────────────────────────────────────
function BenchHomeView({ index, onJumpToSleeve }: { index: BenchIndex; onJumpToSleeve: (tab: BenchTab) => void }) {
  const sleeves: BenchTab[] = ["stocks", "options", "crypto"]
  const bySleeve = useMemo(() => {
    const m = new Map<string, BenchIndexEntry[]>()
    for (const r of index.runs) {
      const key = r.sleeve ?? "UNKNOWN"
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(r)
    }
    return m
  }, [index])

  const specsBySleeve = useMemo(() => {
    const m = new Map<string, BenchSpecEntry[]>()
    for (const s of (index.specs ?? [])) {
      const key = s.sleeve ?? "UNKNOWN"
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(s)
    }
    return m
  }, [index])

  const totalRuns = index.runs.length
  const totalBenches = new Set(index.runs.map(r => r.bench_id)).size
  const totalEvaluated = index.runs.reduce((acc, r) => acc + (r.evaluated_candidate_count ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Overview hero */}
      <div className="cb-card-t1 px-5 py-5">
        <div className="cb-label mb-2">The bench</div>
        <div style={{ fontSize: 18, fontWeight: 500, color: "var(--cb-text-primary)", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
          Validate before you trade.
        </div>
        <div className="mt-3" style={{ fontSize: 13, color: "var(--cb-text-secondary)", lineHeight: 1.6 }}>
          Every strategy lives on the bench before it sees real capital. A bench spec declares a dataset (with named eras),
          a strategy family with parameter sweep dimensions, a cost model, and evaluation gates. The runner sweeps the
          parameter grid, scores each candidate across all eras, and only promotes configs that clear the hard-reject rules
          and pass the plateau check. If nothing clears, the bench reports no winner — that&rsquo;s a feature, not a bug.
        </div>

        <div className="grid grid-cols-3 gap-4 mt-5">
          <HomeMetric label="Runs" value={fmtCount(totalRuns)} />
          <HomeMetric label="Benches" value={fmtCount(totalBenches)} />
          <HomeMetric label="Candidates evaluated" value={fmtCount(totalEvaluated)} />
        </div>
      </div>

      {/* Per-sleeve summary cards */}
      <div>
        <div className="cb-label mb-3">By sleeve</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {sleeves.map(tab => {
            const meta = TAB_META[tab]
            const runs = bySleeve.get(meta.sleeveKey!) ?? []
            const specs = specsBySleeve.get(meta.sleeveKey!) ?? []
            const specsWithoutRuns = specs.filter(s => !s.has_runs)
            const benches = new Set(runs.map(r => r.bench_id)).size
            const latest = runs.reduce<BenchIndexEntry | null>((acc, r) => {
              if (!acc) return r
              const tr = r.generated_at ? new Date(r.generated_at).getTime() : 0
              const ta = acc.generated_at ? new Date(acc.generated_at).getTime() : 0
              return tr > ta ? r : acc
            }, null)
            return (
              <button
                key={tab}
                onClick={() => onJumpToSleeve(tab)}
                className="text-left rounded-xl px-4 py-4 transition-all"
                style={{
                  background: `radial-gradient(circle at 12% 10%, ${meta.accent}14, transparent 48%), var(--cb-surface-0)`,
                  border: `1px solid ${meta.accent}33`,
                  boxShadow: "inset 0 1px 0 rgba(180, 195, 235, 0.03), 0 2px 10px rgba(5, 8, 26, 0.4)",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: meta.accent }} />
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--cb-text-primary)" }}>
                    {meta.label}
                  </span>
                </div>
                {runs.length > 0 ? (
                  <>
                    <div className="flex items-baseline gap-4">
                      <div>
                        <div className="cb-number" style={{ fontSize: 20, fontWeight: 300, color: "var(--cb-text-primary)" }}>{benches}</div>
                        <div className="cb-label">benches</div>
                      </div>
                      <div>
                        <div className="cb-number" style={{ fontSize: 20, fontWeight: 300, color: "var(--cb-text-primary)" }}>{runs.length}</div>
                        <div className="cb-label">runs</div>
                      </div>
                    </div>
                    {latest && (
                      <div className="mt-3" style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>
                        Latest · {latest.title} · {timeAgo(latest.generated_at)}
                      </div>
                    )}
                  </>
                ) : specsWithoutRuns.length > 0 ? (
                  <>
                    <div style={{ fontSize: 13, color: "var(--cb-text-primary)" }}>
                      Spec ready · pending first run
                    </div>
                    {specsWithoutRuns.map(s => (
                      <div key={s.bench_id} className="mt-2" style={{ fontSize: 11, color: "var(--cb-text-secondary)", lineHeight: 1.4 }}>
                        <div className="font-mono" style={{ fontSize: 10, color: meta.accent }}>{s.bench_id}</div>
                        {s.hypothesis && (
                          <div className="mt-1" style={{ color: "var(--cb-text-tertiary)", fontSize: 10 }}>
                            {s.hypothesis.length > 120 ? s.hypothesis.slice(0, 120) + "..." : s.hypothesis}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: "var(--cb-text-primary)" }}>No {meta.label.toLowerCase()} benches yet</div>
                    <div className="mt-1" style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>
                      Will appear here when a {meta.label.toLowerCase()} spec is checked in
                    </div>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* What a bench spec looks like */}
      <div className="cb-card-t2 px-5 py-4">
        <div className="cb-label mb-2">What defines a bench spec</div>
        <ul className="space-y-2" style={{ fontSize: 12, color: "var(--cb-text-secondary)", lineHeight: 1.55 }}>
          <SpecDefLine term="Dataset" def="Asset, venue, timeframe, and a named era catalog. Eras aren't time buckets — they're labeled regimes (e.g. 2017 Mania, 2021-22 Bear Reset) so a candidate has to earn its rank across regime shifts." />
          <SpecDefLine term="Strategy" def="A family (e.g. TIME_SERIES_MOMENTUM) with base parameters and sweep dimensions. Each dimension declares the values to explore; the total grid is the search space." />
          <SpecDefLine term="Run config" def="Search mode (bounded / grid / random), fill model, exposure model, capital base, train/test windows." />
          <SpecDefLine term="Cost model" def="Round-trip fees and one-way slippage in basis points, plus per-trade dollar fees. Every candidate pays these." />
          <SpecDefLine term="Evaluation" def="Hard-reject rules (minimum trade count, worst-era Sharpe floor, single-era PnL concentration cap) and the plateau rule. A candidate must clear all of them AND have enough passing neighbors to be promoted." />
          <SpecDefLine term="Baselines" def="Reference curves like BUY_AND_HOLD_BTC and NO_TRADE. Candidate metrics are compared against these — beating buy-and-hold on Sharpe but not net return is a different story from beating it on both." />
        </ul>
      </div>
    </div>
  )
}

function HomeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="cb-number" style={{ fontSize: 22, fontWeight: 300, color: "var(--cb-text-primary)", letterSpacing: "-0.02em" }}>{value}</div>
      <div className="cb-label mt-1">{label}</div>
    </div>
  )
}

function SpecDefLine({ term, def }: { term: string; def: string }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0" style={{ color: "var(--cb-text-primary)", fontWeight: 500, minWidth: 100 }}>{term}</span>
      <span style={{ color: "var(--cb-text-secondary)" }}>{def}</span>
    </li>
  )
}

// ─── Strategy comparison card ────────────────────────────────────────────────
// Surfaces the 5-way comparison (HODL / binary / graduated / tactical / combined)
// that the bench's parameter sweep doesn't capture. This is the portfolio question.
function ComparisonCard({ comparison }: { comparison: SleeveComparison }) {
  const accent = sleeveAccent(comparison.sleeve)
  return (
    <div
      className="rounded-xl px-5 py-5 mb-6"
      style={{
        background: `radial-gradient(circle at 12% 10%, ${accent}18, transparent 45%), var(--cb-surface-0)`,
        border: `1px solid ${accent}44`,
        boxShadow: "inset 0 1px 0 rgba(180, 195, 235, 0.04), 0 4px 20px rgba(5, 8, 26, 0.45)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: accent, boxShadow: `0 0 8px ${accent}80` }} />
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--cb-text-primary)" }}>
          Strategy comparison
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 500, color: "var(--cb-text-primary)", letterSpacing: "-0.01em" }}>
        {comparison.title}
      </div>
      <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)", marginTop: 2 }}>
        {comparison.dataset.symbol} · {comparison.dataset.start_date} → {comparison.dataset.end_date}
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto mt-4">
        <table className="w-full text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ color: "var(--cb-text-tertiary)" }}>
              <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid var(--cb-border-dim)", background: "var(--cb-surface-1)" }}>Strategy</th>
              <th style={{ textAlign: "right", padding: "6px 10px", fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid var(--cb-border-dim)", background: "var(--cb-surface-1)" }}>Net Return</th>
              <th style={{ textAlign: "right", padding: "6px 10px", fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid var(--cb-border-dim)", background: "var(--cb-surface-1)" }}>Sharpe <InfoPop text={GLOSSARY.col_sharpe} /></th>
              <th style={{ textAlign: "right", padding: "6px 10px", fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid var(--cb-border-dim)", background: "var(--cb-surface-1)" }}>Calmar <InfoPop text={GLOSSARY.col_calmar} /></th>
              <th style={{ textAlign: "right", padding: "6px 10px", fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid var(--cb-border-dim)", background: "var(--cb-surface-1)" }}>Max DD <InfoPop text={GLOSSARY.col_max_dd} /></th>
              <th style={{ textAlign: "right", padding: "6px 10px", fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid var(--cb-border-dim)", background: "var(--cb-surface-1)" }}>Exposure <InfoPop text={GLOSSARY.col_exposure} /></th>
            </tr>
          </thead>
          <tbody>
            {comparison.lanes.map(lane => {
              const isBenchmark = lane.role === "benchmark"
              const isGraduated = lane.role === "layer_1_graduated" || lane.role === "combined_graduated"
              const isStandalone = lane.role === "layer_2_standalone"
              return (
                <tr
                  key={lane.lane_id}
                  className="transition-colors"
                  style={{
                    background: isGraduated ? "rgba(16, 185, 129, 0.04)" : undefined,
                    opacity: isStandalone ? 0.6 : 1,
                  }}
                >
                  <td style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--cb-border-dim)", color: isGraduated ? "var(--cb-green)" : isBenchmark ? "var(--cb-text-primary)" : "var(--cb-text-secondary)", fontWeight: isGraduated || isBenchmark ? 500 : 400 }}>
                    {lane.label}
                    {isGraduated && <span style={{ fontSize: 8, marginLeft: 6, color: "var(--cb-green)", fontWeight: 600, letterSpacing: "0.08em" }}>LEAD</span>}
                    {isStandalone && <span style={{ fontSize: 8, marginLeft: 6, color: "var(--cb-text-tertiary)", fontWeight: 500 }}>OVERLAY ONLY</span>}
                  </td>
                  <td style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--cb-border-dim)", color: "var(--cb-text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {lane.net_return_pct != null ? `+${lane.net_return_pct.toLocaleString("en-US", { maximumFractionDigits: 1 })}%` : "—"}
                  </td>
                  <td style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--cb-border-dim)", color: isGraduated ? "var(--cb-green)" : "var(--cb-text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {lane.sharpe != null ? lane.sharpe.toFixed(2) : "—"}
                  </td>
                  <td style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--cb-border-dim)", color: isGraduated ? "var(--cb-green)" : "var(--cb-text-secondary)", fontFamily: "var(--font-mono)", fontWeight: isGraduated ? 600 : 400 }}>
                    {lane.calmar != null ? lane.calmar.toFixed(2) : "—"}
                  </td>
                  <td style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--cb-border-dim)", color: "var(--cb-text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {lane.max_drawdown_pct != null ? `${lane.max_drawdown_pct.toFixed(1)}%` : "—"}
                  </td>
                  <td style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--cb-border-dim)", color: "var(--cb-text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {lane.exposure_pct != null ? `${lane.exposure_pct.toFixed(0)}%` : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--cb-border-dim)", fontSize: 11, color: "var(--cb-text-tertiary)", lineHeight: 1.5 }}>
        Graduated core + tactical overlay is the lead candidate — best Sharpe and Calmar of any lane, with max drawdown reduced from 84% (HODL) to 58%. Tactical is an overlay, not a standalone sleeve.
      </div>
    </div>
  )
}

// ─── Run selector — styled card dropdown ────────────────────────────────────
// Replaces the native <select> with a proper card-based selector that shows
// the current run's info clearly and reads as an interactive element.
function RunSelector({ runs, selected, onSelect, showPartials, onTogglePartials, totalRuns, succeededCount }: {
  runs: BenchIndexEntry[]
  selected: { bench_id: string; run_id: string } | null
  onSelect: (s: { bench_id: string; run_id: string }) => void
  showPartials: boolean
  onTogglePartials: () => void
  totalRuns: number
  succeededCount: number
}) {
  const [open, setOpen] = useState(false)
  const current = selected ? runs.find(r => r.bench_id === selected.bench_id && r.run_id === selected.run_id) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="cb-label">Select run</div>
        {totalRuns !== succeededCount && (
          <button
            onClick={onTogglePartials}
            className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
            style={{
              background: showPartials ? "rgba(212, 194, 138, 0.16)" : "transparent",
              border: `1px solid ${showPartials ? "rgba(212, 194, 138, 0.4)" : "var(--cb-border-std)"}`,
              color: showPartials ? "var(--cb-amber)" : "var(--cb-text-secondary)",
            }}
          >
            {showPartials ? `Showing all ${totalRuns} runs` : `${totalRuns - succeededCount} partial hidden`}
          </button>
        )}
      </div>

      {/* Trigger — shows current selection as a card */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left rounded-xl px-4 py-3 transition-all"
        style={{
          background: "radial-gradient(circle at 12% 15%, rgba(212, 194, 138, 0.10), transparent 55%), var(--cb-surface-0)",
          border: "1px solid var(--cb-border-hi)",
          boxShadow: "inset 0 1px 0 rgba(180, 195, 235, 0.04), 0 2px 12px rgba(5, 8, 26, 0.4)",
        }}
      >
        {current ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--cb-text-primary)" }}>
                {current.title}
              </div>
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "var(--cb-text-tertiary)" }} />
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: statusColor(current.status) }}>
                {current.status}
              </span>
              <span style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>·</span>
              <span style={{ fontSize: 10, color: "var(--cb-text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {deriveBenchRole(current.bench_id, undefined).roleLabel}
              </span>
              <span style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>·</span>
              <span style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>
                {fmtCount(current.evaluated_candidate_count)} / {fmtCount(current.search_space_size)} evaluated
              </span>
              {current.selected_config_id && (
                <>
                  <span style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>·</span>
                  <span className="font-mono" style={{ fontSize: 10, color: "var(--cb-green)" }}>
                    Winner: {shortHash(current.selected_config_id, 10)}
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: "var(--cb-text-secondary)" }}>Select a run…</div>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--cb-surface-0)",
            border: "1px solid var(--cb-border-hi)",
            boxShadow: "0 12px 40px rgba(5, 8, 26, 0.7)",
          }}
        >
          {runs.map(entry => {
            const isSelected = selected?.bench_id === entry.bench_id && selected?.run_id === entry.run_id
            const { roleLabel } = deriveBenchRole(entry.bench_id, undefined)
            return (
              <button
                key={`${entry.bench_id}/${entry.run_id}`}
                onClick={() => { onSelect({ bench_id: entry.bench_id, run_id: entry.run_id }); setOpen(false) }}
                className="w-full text-left px-4 py-3 transition-colors hover:bg-white/[0.03]"
                style={{
                  borderBottom: "1px solid var(--cb-border-dim)",
                  background: isSelected ? "rgba(212, 194, 138, 0.06)" : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div style={{ fontSize: 12, fontWeight: isSelected ? 600 : 400, color: isSelected ? "var(--cb-text-primary)" : "var(--cb-text-secondary)" }}>
                    {entry.title}
                  </div>
                  {isSelected && <span style={{ fontSize: 9, color: "var(--cb-green)" }}>SELECTED</span>}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: statusColor(entry.status) }}>
                    {entry.status}
                  </span>
                  <span style={{ fontSize: 9, color: "var(--cb-text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {roleLabel}
                  </span>
                  <span style={{ fontSize: 9, color: "var(--cb-text-tertiary)" }}>
                    {fmtCount(entry.evaluated_candidate_count)}/{fmtCount(entry.search_space_size)}
                  </span>
                  {entry.selected_config_id && (
                    <span className="font-mono" style={{ fontSize: 9, color: "var(--cb-green)" }}>
                      Winner: {shortHash(entry.selected_config_id, 10)}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Sleeve view (index dropdown + run detail) ──────────────────────────────
function SleeveView({
  tab, runs, specs, comparisons, selected, onSelect,
}: {
  tab: BenchTab
  runs: BenchIndexEntry[]
  specs: BenchSpecEntry[]
  comparisons: SleeveComparison[]
  selected: { bench_id: string; run_id: string } | null
  onSelect: (s: { bench_id: string; run_id: string }) => void
}) {
  const [detail, setDetail] = useState<BenchRunDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const meta = TAB_META[tab]

  // Find the previous run for the selected bench_id (one before by generated_at).
  // Used to render the "vs previous run" delta strip on RunSummary.
  const previousRun = useMemo<BenchIndexEntry | null>(() => {
    if (!selected) return null
    const sameBench = runs
      .filter(r => r.bench_id === selected.bench_id && r.run_id !== selected.run_id)
      .sort((a, b) => {
        const ta = a.generated_at ? new Date(a.generated_at).getTime() : 0
        const tb = b.generated_at ? new Date(b.generated_at).getTime() : 0
        return tb - ta  // newest first
      })
    // Pick the newest run that's older than the currently selected one
    const currentEntry = runs.find(r => r.bench_id === selected.bench_id && r.run_id === selected.run_id)
    const currentTime = currentEntry?.generated_at ? new Date(currentEntry.generated_at).getTime() : 0
    return sameBench.find(r => {
      const t = r.generated_at ? new Date(r.generated_at).getTime() : 0
      return t < currentTime
    }) ?? null
  }, [selected, runs])

  useEffect(() => {
    setDetail(null)
    if (!selected) return
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    fetch(`/api/bench/${encodeURIComponent(selected.bench_id)}/${encodeURIComponent(selected.run_id)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(e => { if (!cancelled) setDetailError(e.message) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selected])

  const specsWithoutRuns = specs.filter(s => !s.has_runs)

  // Default filter: show SUCCEEDED runs, fall back to all if none succeeded
  const succeededRuns = runs.filter(r => r.status?.toUpperCase() === "SUCCEEDED" || r.status?.toUpperCase() === "COMPLETED")
  const [showPartials, setShowPartials] = useState(succeededRuns.length === 0)
  const visibleRuns = showPartials ? runs : (succeededRuns.length > 0 ? succeededRuns : runs)

  if (!runs.length) {
    return (
      <div className="space-y-4">
        {comparisons.length > 0 && comparisons.map((c, i) => <ComparisonCard key={i} comparison={c} />)}
        {specsWithoutRuns.length > 0 ? (
          specsWithoutRuns.map(s => (
            <div
              key={s.bench_id}
              className="rounded-xl px-5 py-5"
              style={{
                background: `radial-gradient(circle at 12% 10%, ${meta.accent}18, transparent 45%), var(--cb-surface-0)`,
                border: `1px solid ${meta.accent}33`,
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: meta.accent }} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--cb-text-primary)" }}>
                  Spec ready · pending first run
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--cb-text-primary)", letterSpacing: "-0.01em" }}>
                {s.title}
              </div>
              <div className="font-mono mt-1" style={{ fontSize: 10, color: meta.accent }}>
                {s.bench_id}
              </div>
              {s.hypothesis && (
                <div className="mt-3" style={{ fontSize: 12, color: "var(--cb-text-secondary)", lineHeight: 1.55 }}>
                  <span className="cb-label" style={{ marginRight: 8 }}>Hypothesis</span>
                  {s.hypothesis}
                </div>
              )}
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--cb-border-dim)", fontSize: 11, color: "var(--cb-text-tertiary)", lineHeight: 1.5 }}>
                This spec is checked in and ready to run. When Codex executes it,
                results will appear here automatically with the same leaderboard and
                distribution views as the crypto bench runs.
              </div>
            </div>
          ))
        ) : (
          <div className="cb-card-t2 cb-tone-medium px-6 py-12 text-center">
            <div style={{ fontSize: 14, color: "var(--cb-text-primary)", marginBottom: 8 }}>No {meta.label.toLowerCase()} benches yet</div>
            <div style={{ fontSize: 12, color: "var(--cb-text-secondary)", lineHeight: 1.5 }}>
              This sleeve will populate as soon as a {meta.label.toLowerCase()} bench spec is checked in and runs.
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Strategy comparison — the portfolio question (if available) */}
      {comparisons.length > 0 && comparisons.map((c, i) => <ComparisonCard key={i} comparison={c} />)}

      {/* Run selector — custom card dropdown */}
      <RunSelector
        runs={visibleRuns}
        selected={selected}
        onSelect={onSelect}
        showPartials={showPartials}
        onTogglePartials={() => setShowPartials(v => !v)}
        totalRuns={runs.length}
        succeededCount={succeededRuns.length}
      />

      {/* Run detail */}
      {detailLoading && !detail && (
        <div className="cb-card-t2 px-6 py-12 text-center" style={{ color: "var(--cb-text-tertiary)", fontSize: 12 }}>
          Loading run…
        </div>
      )}
      {detailError && (
        <div className="cb-card-t2 cb-tone-bad px-6 py-8" style={{ color: "var(--cb-text-secondary)", fontSize: 12 }}>
          Couldn&rsquo;t load this run: {detailError}
        </div>
      )}
      {detail && (
        <>
          <RunSummary
            detail={detail}
            previousRun={previousRun}
            onJumpToPrevious={() => previousRun && onSelect({ bench_id: previousRun.bench_id, run_id: previousRun.run_id })}
          />
          {detail.leaderboard && detail.leaderboard.length > 0 && (
            <Leaderboard rows={detail.leaderboard} primaryMetric={detail.bundle.primary_metric ?? "primary"} accent={meta.accent} />
          )}
        </>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function BenchDashboard({ initialIndex }: { initialIndex: BenchIndex | null }) {
  const [index, setIndex] = useState<BenchIndex | null>(initialIndex)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<BenchTab>("home")

  // Per-tab selection so switching tabs preserves your pick
  const [selectedBySleeve, setSelectedBySleeve] = useState<Record<string, { bench_id: string; run_id: string } | null>>({})

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/bench/index", { cache: "no-store" })
      if (res.ok) setIndex(await res.json())
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Sorted newest-first runs, per-sleeve filter
  const runsByTab = useMemo(() => {
    if (!index?.runs) return {} as Record<BenchTab, BenchIndexEntry[]>
    const sorted = [...index.runs].sort((a, b) => {
      const ta = a.generated_at ? new Date(a.generated_at).getTime() : 0
      const tb = b.generated_at ? new Date(b.generated_at).getTime() : 0
      return tb - ta
    })
    return {
      home:    sorted,
      stocks:  sorted.filter(r => r.sleeve?.toUpperCase() === "STOCKS"),
      options: sorted.filter(r => r.sleeve?.toUpperCase() === "OPTIONS"),
      crypto:  sorted.filter(r => r.sleeve?.toUpperCase() === "CRYPTO"),
    } as Record<BenchTab, BenchIndexEntry[]>
  }, [index])

  // Auto-select newest run for a sleeve tab when entering it for the first time
  useEffect(() => {
    if (activeTab === "home") return
    if (selectedBySleeve[activeTab]) return
    const list = runsByTab[activeTab] ?? []
    if (list.length) {
      setSelectedBySleeve(prev => ({
        ...prev,
        [activeTab]: { bench_id: list[0].bench_id, run_id: list[0].run_id },
      }))
    }
  }, [activeTab, runsByTab, selectedBySleeve])

  // Empty state
  if (!index || !index.runs?.length) {
    return (
      <div className="min-h-screen text-[var(--cb-text-primary)] font-sans pb-16 sm:pb-0">
        <Nav active="bench" />
        <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
          <div className="cb-card-t2 cb-tone-medium px-6 py-12 text-center">
            <div style={{ fontSize: 14, color: "var(--cb-text-primary)", marginBottom: 8 }}>No bench runs yet</div>
            <div style={{ fontSize: 12, color: "var(--cb-text-secondary)", lineHeight: 1.5 }}>
              Run <span className="font-mono">scripts/pull-bench-data.py</span> locally to ingest from trading-bot,
              or wait for Codex&rsquo;s push pipeline to publish into <span className="font-mono">data/bench/</span>.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[var(--cb-text-primary)] font-sans pb-16 sm:pb-0">
      <Nav active="bench" />

      {/* Sticky command strip */}
      <div
        className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 backdrop-blur-md sticky top-0 z-30"
        style={{ borderBottom: "1px solid rgba(90, 110, 180, 0.14)", background: "rgba(5, 8, 26, 0.92)" }}
      >
        <div className="min-w-0">
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "var(--cb-text-primary)" }}>Bench</div>
          <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>
            {index.runs.length} run{index.runs.length !== 1 ? "s" : ""} · {new Set(index.runs.map(r => r.bench_id)).size} bench{index.runs.length !== 1 ? "es" : ""}
          </div>
        </div>
        <button onClick={refresh} disabled={refreshing} className="flex items-center gap-1.5 text-[10px] hover:opacity-80 transition-opacity" style={{ color: "var(--cb-text-tertiary)" }}>
          <span className="hidden sm:inline">{index.source === "local_dev_pull" ? "local dev pull" : index.source} · {timeAgo(index.generated_at)}</span>
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Sticky tabs */}
      <div className="sticky z-[29] backdrop-blur-md" style={{ top: 48, background: "rgba(5, 8, 26, 0.92)" }}>
        <div className="px-4 sm:px-6 max-w-7xl mx-auto">
          <BenchTabs active={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
        {activeTab === "home" && (
          <BenchHomeView index={index} onJumpToSleeve={setActiveTab} />
        )}
        {activeTab !== "home" && (
          <SleeveView
            tab={activeTab}
            runs={runsByTab[activeTab] ?? []}
            specs={(index?.specs ?? []).filter(s => s.sleeve?.toUpperCase() === TAB_META[activeTab].sleeveKey)}
            comparisons={(index?.comparisons ?? []).filter((c: SleeveComparison) => c.sleeve?.toUpperCase() === TAB_META[activeTab].sleeveKey)}
            selected={selectedBySleeve[activeTab] ?? null}
            onSelect={s => setSelectedBySleeve(prev => ({ ...prev, [activeTab]: s }))}
          />
        )}
      </div>
    </div>
  )
}
