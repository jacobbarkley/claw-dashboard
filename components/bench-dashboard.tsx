"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Nav } from "@/components/nav"
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
// Mirrors what scripts/pull-bench-data.py writes into data/bench/index.json.
// When Codex's push pipeline takes over, the schema stays the same.

interface BenchIndexEntry {
  bench_id: string
  run_id: string
  title: string
  sleeve: string | null
  engine: string | null
  promotion_target: string | null
  status: string | null               // PARTIAL | SUCCEEDED | FAILED | ...
  selected_config_id: string | null   // null means no winner yet (PARTIAL) or runner broke
  evaluated_candidate_count: number | null
  search_space_size: number | null
  candidate_cap: number | null
  sweep_truncated: boolean | null
  primary_metric: string | null
  primary_metric_value: number | null
  generated_at: string | null
}

interface BenchIndex {
  generated_at: string
  source: string
  runs: BenchIndexEntry[]
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
  // Benchmark-relative fields — spec'd, often null in current artifacts
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
  sleeve?: string                        // CRYPTO | STOCKS | OPTIONS | ...
  engine?: string                        // CRYPTO_RESEARCH_SWEEP | ...
  promotion_target?: string
  dataset?: Record<string, unknown>
  strategy?: Record<string, unknown>
  run?: Record<string, unknown>
  cost_model?: Record<string, unknown>
  evaluation?: Record<string, unknown>
  notes?: string
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
  baseline_ids?: string[]
  era_ids?: string[]
}

interface BenchRunDetail {
  bundle: BenchRunBundle
  spec: BenchSpec
  leaderboard: LeaderboardRow[]
}

// Sleeve accent palette — keep in sync with --cb-sleeve-* tokens in globals.css
const SLEEVE_ACCENT: Record<string, string> = {
  CRYPTO:      "#8b5cf6",
  STOCKS:      "#10b981",
  OPTIONS:     "#d4c28a",
  PREDICTIONS: "#38bdf8",
}

const STATUS_TONE: Record<string, "good" | "medium" | "bad"> = {
  SUCCEEDED:    "good",
  COMPLETED:    "good",
  PARTIAL:      "medium",   // Codex: PARTIAL is bounded, NOT failure
  IN_PROGRESS:  "medium",
  RUNNING:      "medium",
  FAILED:       "bad",
  ERRORED:      "bad",
}

function statusColor(status: string | null): string {
  if (!status) return "var(--cb-text-tertiary)"
  const tone = STATUS_TONE[status.toUpperCase()] ?? "medium"
  return tone === "good" ? "var(--cb-green)" : tone === "bad" ? "var(--cb-red)" : "var(--cb-amber)"
}

function sleeveAccent(sleeve: string | null | undefined): string {
  if (!sleeve) return "#9ba0bc"
  return SLEEVE_ACCENT[sleeve.toUpperCase()] ?? "#9ba0bc"
}

function shortHash(s: string | null | undefined, len = 8): string {
  if (!s) return "—"
  return s.length <= len ? s : s.slice(0, len)
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v >= 0 ? "" : ""}${v.toFixed(digits)}%`
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

// ─── Bench index card ────────────────────────────────────────────────────────
function BenchIndexCard({
  entry,
  active,
  onClick,
}: {
  entry: BenchIndexEntry
  active: boolean
  onClick: () => void
}) {
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
          <span
            className="inline-block rounded-full shrink-0"
            style={{
              width: 7,
              height: 7,
              background: accent,
              boxShadow: active ? `0 0 8px ${accent}80` : "none",
              opacity: active ? 1 : 0.65,
            }}
          />
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: active ? "var(--cb-text-primary)" : "var(--cb-text-secondary)",
          }}>
            {entry.sleeve ?? "—"}
          </span>
        </div>
        <span style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: statusCol,
        }}>
          {entry.status ?? "—"}
        </span>
      </div>

      <div style={{
        fontSize: 13,
        fontWeight: 500,
        color: active ? "var(--cb-text-primary)" : "var(--cb-text-secondary)",
        lineHeight: 1.3,
        marginBottom: 4,
      }}>
        {entry.title}
      </div>

      <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)", marginBottom: 8 }}>
        {entry.run_id}  ·  {timeAgo(entry.generated_at)}
      </div>

      {/* Evaluated / search space progress */}
      {evaluatedPct != null && (
        <div className="space-y-1">
          <div className="flex justify-between" style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>
            <span>{fmtCount(entry.evaluated_candidate_count)} / {fmtCount(entry.search_space_size)} evaluated</span>
            <span>{evaluatedPct.toFixed(1)}%</span>
          </div>
          <div className="relative h-1 rounded-full overflow-hidden" style={{ background: "var(--cb-surface-2)" }}>
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all"
              style={{ width: `${evaluatedPct}%`, background: accent, opacity: 0.75 }}
            />
          </div>
        </div>
      )}

      {/* Headline — winner or no winner */}
      <div className="flex items-center justify-between mt-3" style={{ fontSize: 11 }}>
        {entry.selected_config_id ? (
          <>
            <span style={{ color: "var(--cb-text-tertiary)" }}>Winner</span>
            <span className="font-mono" style={{ color: "var(--cb-green)" }}>{shortHash(entry.selected_config_id, 10)}</span>
          </>
        ) : (
          <>
            <span style={{ color: "var(--cb-text-tertiary)" }}>Winner</span>
            <span style={{ color: "var(--cb-amber)" }}>none yet</span>
          </>
        )}
      </div>
    </button>
  )
}

// ─── Run summary strip ───────────────────────────────────────────────────────
function RunSummary({ detail }: { detail: BenchRunDetail }) {
  const { bundle, spec } = detail
  const accent = sleeveAccent(spec.sleeve)
  const evaluatedPct = bundle.search_space_size
    ? Math.min(100, (bundle.evaluated_candidate_count / bundle.search_space_size) * 100)
    : 0

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
            <span
              className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: accent, boxShadow: `0 0 8px ${accent}80` }}
            />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--cb-text-primary)" }}>
              {spec.sleeve ?? "—"} · {spec.engine ?? "—"}
            </span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 500, color: "var(--cb-text-primary)", letterSpacing: "-0.01em" }}>
            {spec.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--cb-text-tertiary)", marginTop: 2 }}>
            {bundle.run_id} · generated {timeAgo(bundle.generated_at)}
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-1"
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            background: `${statusColor(bundle.status)}1f`,
            color: statusColor(bundle.status),
            border: `1px solid ${statusColor(bundle.status)}40`,
          }}
        >
          {bundle.status}
        </span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mt-2">
        <SummaryMetric label="Evaluated" value={`${fmtCount(bundle.evaluated_candidate_count)} / ${fmtCount(bundle.search_space_size)}`} sub={`${evaluatedPct.toFixed(1)}%`} />
        <SummaryMetric label="Cap" value={bundle.candidate_cap ? fmtCount(bundle.candidate_cap) : "—"} sub={bundle.sweep_truncated ? "truncated" : "full"} />
        <SummaryMetric label={`${bundle.primary_metric ?? "Primary"}`} value={fmtNum(bundle.primary_metric_value)} sub={bundle.selected_config_id ? "winner" : "no winner yet"} />
        <SummaryMetric label="Selected" value={bundle.selected_config_id ? shortHash(bundle.selected_config_id, 12) : "none"} sub={bundle.selected_config_id ? "passed all gates" : "still searching"} mono />
      </div>

      {/* Hypothesis */}
      {spec.hypothesis && (
        <div
          className="mt-4 pt-3"
          style={{ borderTop: "1px solid var(--cb-border-dim)", fontSize: 12, color: "var(--cb-text-secondary)", lineHeight: 1.55 }}
        >
          <span className="cb-label" style={{ marginRight: 8 }}>Hypothesis</span>
          {spec.hypothesis}
        </div>
      )}
    </div>
  )
}

function SummaryMetric({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div>
      <div className="cb-label">{label}</div>
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

// ─── Leaderboard table ───────────────────────────────────────────────────────
type SortKey = "rank" | "primary_metric_value" | "net_total_compounded_return_pct" | "median_era_sharpe" | "minimum_era_sharpe" | "max_single_era_pnl_share_pct"

function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [filterPasses, setFilterPasses] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() => {
    return filterPasses ? rows.filter(r => r.passes_hard_reject_rules) : rows
  }, [rows, filterPasses])

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
    if (sortKey === k) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(k)
      setSortDir(k === "rank" ? "asc" : "desc")
    }
  }

  return (
    <div className="cb-card-t2 px-0 py-0 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--cb-border-dim)" }}>
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ color: "var(--cb-text-tertiary)" }}>
              <Th onClick={() => toggleSort("rank")} active={sortKey === "rank"} dir={sortDir} align="left">#</Th>
              <Th align="left">Config</Th>
              <Th align="left">Status</Th>
              <Th onClick={() => toggleSort("primary_metric_value")} active={sortKey === "primary_metric_value"} dir={sortDir}>Primary</Th>
              <Th onClick={() => toggleSort("net_total_compounded_return_pct")} active={sortKey === "net_total_compounded_return_pct"} dir={sortDir}>Net Return</Th>
              <Th onClick={() => toggleSort("median_era_sharpe")} active={sortKey === "median_era_sharpe"} dir={sortDir}>Med Era Sharpe</Th>
              <Th onClick={() => toggleSort("minimum_era_sharpe")} active={sortKey === "minimum_era_sharpe"} dir={sortDir}>Min Era Sharpe</Th>
              <Th onClick={() => toggleSort("max_single_era_pnl_share_pct")} active={sortKey === "max_single_era_pnl_share_pct"} dir={sortDir}>Max Era %</Th>
              <Th align="right">Trades</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <LeaderboardRow key={r.config_id} row={r} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Show more */}
      {filtered.length > 25 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full py-2 text-[11px] hover:opacity-80 transition-opacity"
          style={{
            color: "var(--cb-text-secondary)",
            borderTop: "1px solid var(--cb-border-dim)",
          }}
        >
          {showAll ? "Show top 25" : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  )
}

function Th({ children, onClick, active, dir, align = "right" }: {
  children: React.ReactNode
  onClick?: () => void
  active?: boolean
  dir?: "asc" | "desc"
  align?: "left" | "right"
}) {
  const interactive = !!onClick
  return (
    <th
      onClick={onClick}
      className={interactive ? "cursor-pointer hover:text-[var(--cb-text-primary)] transition-colors" : ""}
      style={{
        textAlign: align,
        padding: "8px 10px",
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontSize: 9,
        color: active ? "var(--cb-text-primary)" : undefined,
        whiteSpace: "nowrap",
        borderBottom: "1px solid var(--cb-border-dim)",
        background: "var(--cb-surface-1)",
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
        <Td align="left" style={{ fontWeight: isWinner ? 600 : 400, color: isWinner ? "var(--cb-green)" : undefined }}>
          {row.rank}
        </Td>
        <Td align="left" mono color={isWinner ? "var(--cb-text-primary)" : undefined}>
          {shortHash(row.config_id, 10)}
        </Td>
        <Td align="left">
          {isWinner && (
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", color: "var(--cb-green)" }}>WINNER</span>
          )}
          {!isWinner && passes && (
            <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", color: "var(--cb-text-tertiary)" }}>PASS</span>
          )}
          {!passes && (
            <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", color: "var(--cb-red)" }}>REJECT</span>
          )}
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
            {/* Benchmark-relative row, shown only if any value is populated */}
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
  children: React.ReactNode
  align?: "left" | "right"
  mono?: boolean
  color?: string
  style?: React.CSSProperties
}) {
  return (
    <td
      className={mono ? "font-mono" : ""}
      style={{
        textAlign: align,
        padding: "8px 10px",
        whiteSpace: "nowrap",
        color: color ?? "var(--cb-text-secondary)",
        borderBottom: "1px solid var(--cb-border-dim)",
        ...style,
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
      <span
        className="font-mono"
        style={{
          color: isPos ? "var(--cb-green)" : isNeg ? "var(--cb-red)" : "var(--cb-text-tertiary)",
        }}
      >
        {value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`}
      </span>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function BenchDashboard({ initialIndex }: { initialIndex: BenchIndex | null }) {
  const [index, setIndex] = useState<BenchIndex | null>(initialIndex)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<{ bench_id: string; run_id: string } | null>(null)
  const [detail, setDetail] = useState<BenchRunDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  // Default-select the most recent run on first load
  useEffect(() => {
    if (selected || !index?.runs?.length) return
    const sorted = [...index.runs].sort((a, b) => {
      const ta = a.generated_at ? new Date(a.generated_at).getTime() : 0
      const tb = b.generated_at ? new Date(b.generated_at).getTime() : 0
      return tb - ta
    })
    setSelected({ bench_id: sorted[0].bench_id, run_id: sorted[0].run_id })
  }, [index, selected])

  // Fetch detail when selection changes
  useEffect(() => {
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

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/bench/index", { cache: "no-store" })
      if (res.ok) setIndex(await res.json())
    } finally {
      setRefreshing(false)
    }
  }, [])

  const sortedRuns = useMemo(() => {
    if (!index?.runs) return []
    return [...index.runs].sort((a, b) => {
      const ta = a.generated_at ? new Date(a.generated_at).getTime() : 0
      const tb = b.generated_at ? new Date(b.generated_at).getTime() : 0
      return tb - ta
    })
  }, [index])

  // Empty / waiting state
  if (!index || !index.runs?.length) {
    return (
      <div className="min-h-screen text-[var(--cb-text-primary)] font-sans pb-16 sm:pb-0">
        <Nav active="bench" />
        <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
          <div className="cb-card-t2 cb-tone-medium px-6 py-12 text-center">
            <div style={{ fontSize: 14, color: "var(--cb-text-primary)", marginBottom: 8 }}>No bench runs yet</div>
            <div style={{ fontSize: 12, color: "var(--cb-text-secondary)", lineHeight: 1.5 }}>
              Run <span className="font-mono">scripts/pull-bench-data.py</span> locally to ingest from
              trading-bot, or wait for Codex&rsquo;s push pipeline to publish into
              <span className="font-mono"> data/bench/</span>.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[var(--cb-text-primary)] font-sans pb-16 sm:pb-0">
      <Nav active="bench" />

      {/* Sticky header strip — bench-page command bar */}
      <div
        className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 backdrop-blur-md sticky top-0 z-30"
        style={{
          borderBottom: "1px solid rgba(90, 110, 180, 0.14)",
          background: "rgba(5, 8, 26, 0.92)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "var(--cb-text-primary)" }}>
              Bench
            </div>
            <div style={{ fontSize: 10, color: "var(--cb-text-tertiary)" }}>
              {index.runs.length} run{index.runs.length !== 1 ? "s" : ""} · {Object.keys(index.runs.reduce((acc, r) => ({ ...acc, [r.bench_id]: 1 }), {})).length} bench{index.runs.length !== 1 ? "es" : ""}
            </div>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[10px] hover:opacity-80 transition-opacity"
          style={{ color: "var(--cb-text-tertiary)" }}
        >
          <span className="hidden sm:inline">{index.source === "local_dev_pull" ? "local dev pull" : index.source} · {timeAgo(index.generated_at)}</span>
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Index rail */}
          <aside className="space-y-2 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:pr-1">
            <div className="cb-label mb-2">Runs</div>
            {sortedRuns.map(entry => (
              <BenchIndexCard
                key={`${entry.bench_id}/${entry.run_id}`}
                entry={entry}
                active={selected?.bench_id === entry.bench_id && selected?.run_id === entry.run_id}
                onClick={() => setSelected({ bench_id: entry.bench_id, run_id: entry.run_id })}
              />
            ))}
          </aside>

          {/* Detail */}
          <main className="space-y-6 min-w-0">
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
                <RunSummary detail={detail} />
                <Leaderboard rows={detail.leaderboard} />
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
