"use client"

// Vires Bench — research surface ported from the design handoff
// (vires-bench.jsx). Wired to the existing bench data flow:
//   - data/bench/index.json → run list, specs, comparisons, manifests
//   - operator.strategy_bank.active → featured promoted strategy with metrics
// No new API contracts. The Codex backend primer (saved separately) covers
// the deeper wiring (leaderboards, era robustness matrix, etc.) that future
// commits will plug into the existing slots here.

import Link from "next/link"
import { useEffect, useState } from "react"
import { AnimatedNumber, InfoPop, SectionHeader, SleeveChip, StatusPill, fmtPct, type Sleeve } from "./shared"
import { SLEEVE_FILTERS, SleeveFilterBar, type SleeveFilter } from "./campaigns-shared"
import { LabPortalVault } from "./lab/lab-portal-vault"

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

interface PassportSummary {
  id: string
  sleeve?: string | null
}

interface BenchData {
  runs?: BenchRun[]
  manifests?: ManifestSummary[]
  passports?: PassportSummary[]
}

interface ActiveStrategy {
  display_name?: string
  variant_id?: string
  symbols?: string[]
  sleeve?: Sleeve
  performance?: {
    totalReturn?: number
    excess?: number
    sharpe?: number
    calmar?: number
    maxDD?: number
    winRate?: number
  }
}

interface PromotedManifest {
  manifest_id?: string
  sleeve?: string | null
  title?: string | null
  deployment_config_id?: string | null
  generated_at?: string | null
  performance_summary?: {
    total_return_pct?: number | null
    excess_return_pct?: number | null
    sharpe_ratio?: number | null
    calmar_ratio?: number | null
    max_drawdown_pct?: number | null
    win_rate_pct?: number | null
  } | null
}

interface OperatorBundle {
  strategy_bank?: {
    active?: ActiveStrategy | null
    promoted?: PromotedManifest[] | null
  } | null
}

// ─── Bench hero — headline + 4-stat strip ──────────────────────────────────
// Home = production-only. Research lives on the Campaigns tab. The 4 stats
// are a production snapshot: what's live, what's on paper, what's been
// promoted, and how many campaigns are in play behind the scenes.

function BenchHero({
  liveCount,
  paperCount,
  promotedCount,
  campaignCount,
  labRedesign = false,
}: {
  liveCount: number
  paperCount: number
  promotedCount: number
  campaignCount: number
  labRedesign?: boolean
}) {
  const stats = [
    { label: "Live",      value: liveCount },
    { label: "Paper",     value: paperCount },
    { label: "Promoted",  value: promotedCount },
    { label: "Campaigns", value: campaignCount },
  ]
  return (
    <div className="vr-card-hero" style={{ padding: 22 }}>
      <div className="t-eyebrow" style={{ marginBottom: 10 }}>Bench · Home</div>
      <div className="t-h2" style={{ lineHeight: 1.25, maxWidth: 340, marginBottom: 14 }}>
        What is <span className="t-accent">in production</span> right now.
      </div>
      <div className="t-read" style={{ fontSize: 12, maxWidth: 340 }}>
        {labRedesign
          ? "Home shows what is in production right now. Open the Lab vault for ideas and authoring; Campaigns tracks contenders."
          : "Home shows what is in production right now. Research lives under Campaigns."}
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

function FeaturedStrategy({ strategy, passportHref }: { strategy: ActiveStrategy | null; passportHref?: string | null }) {
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
        <SleeveChip sleeve={strategy.sleeve ?? "stocks"} />
        {passportHref && (
          <Link
            href={passportHref}
            aria-label="Open Strategy Passport"
            className="t-eyebrow"
            style={{
              fontSize: 10,
              color: "var(--vr-gold)",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              textDecoration: "none",
              marginLeft: "auto",
              padding: "8px 12px",
              border: "1px solid var(--vr-gold-line)",
              borderRadius: 3,
              background: "var(--vr-gold-soft)",
              touchAction: "manipulation",
              minHeight: 32,
            }}
          >
            Passport
            <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
              <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </Link>
        )}
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

function PromotedEmptyRow({ sleeve, copy }: { sleeve: Sleeve; copy: string }) {
  return (
    <div
      className="vr-card"
      style={{
        padding: 16,
        borderColor: "var(--vr-line)",
        background: "var(--vr-ink)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <SleeveChip sleeve={sleeve} />
      </div>
      <div className="t-label" style={{ fontSize: 12, color: "var(--vr-cream-dim)" }}>
        {copy}
      </div>
    </div>
  )
}


// ─── Page ───────────────────────────────────────────────────────────────────

export function ViresBenchView({
  benchData: initialBench,
  operator: initialOperator,
  campaignCount = 0,
  labRedesign = false,
}: {
  benchData: BenchData | null
  operator: OperatorBundle | null
  campaignCount?: number
  labRedesign?: boolean
}) {
  const [liveBenchData, setLiveBenchData] = useState<BenchData | null>(initialBench)
  const [liveOperator, setLiveOperator] = useState<OperatorBundle | null>(initialOperator)
  // Sleeve filter for the In-production list. Mirrors the campaigns-index
  // filter pattern; persisted separately so the two surfaces don't fight.
  const [sleeveFilter, setSleeveFilter] = useState<SleeveFilter>("ALL")
  const [filterHydrated, setFilterHydrated] = useState(false)

  useEffect(() => {
    try {
      const v = typeof window !== "undefined" ? window.localStorage.getItem("vr-bench-sleeve") : null
      if (v && (SLEEVE_FILTERS.map(f => f.k) as string[]).includes(v)) {
        setSleeveFilter(v as SleeveFilter)
      }
    } catch {
      // localStorage unavailable (SSR, private mode, etc.) — stick with ALL.
    }
    setFilterHydrated(true)
  }, [])

  useEffect(() => {
    if (!filterHydrated) return
    try {
      window.localStorage.setItem("vr-bench-sleeve", sleeveFilter)
    } catch {
      // noop
    }
  }, [sleeveFilter, filterHydrated])

  // Keep local state in sync with server-rendered initial props.
  useEffect(() => {
    setLiveBenchData(initialBench)
  }, [initialBench])

  useEffect(() => {
    setLiveOperator(initialOperator)
  }, [initialOperator])

  // Poll the lightweight Bench-home snapshot + /api/trading every 90s and on
  // focus so promoted cards and counts update without blocking navigation.
  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const [benchRes, tradingRes] = await Promise.all([
          fetch("/api/bench/home", { cache: "no-store" }),
          fetch("/api/trading", { cache: "no-store" }),
        ])

        if (benchRes.ok) {
          const nextBench = await benchRes.json()
          if (!cancelled) setLiveBenchData(nextBench)
        }

        if (tradingRes.ok) {
          const nextTrading = await tradingRes.json()
          if (!cancelled) setLiveOperator(nextTrading?.operator ?? null)
        }
      } catch {
        // Keep the initial server payload if the refresh path fails.
      }
    }

    void refresh()
    const interval = window.setInterval(refresh, 90_000)
    window.addEventListener("focus", refresh)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("focus", refresh)
    }
  }, [])

  const currentBenchData = liveBenchData ?? initialBench

  const promotedBySleeve = mapAllPromotedBySleeve(liveOperator)
  const promotedCount = promotedBySleeve.stocks.length + promotedBySleeve.options.length + promotedBySleeve.crypto.length

  // Production counts by eligibility. Prefer live manifest data when present;
  // passports expose `manifest.eligibility` from the lib/vires-bench.ts reader.
  const passports = currentBenchData?.passports ?? []
  const liveCount  = passports.filter(p => {
    const e = (p as unknown as { manifest?: { eligibility?: string | null } })?.manifest?.eligibility?.toUpperCase?.()
    return e === "LIVE"
  }).length
  const paperCount = passports.filter(p => {
    const e = (p as unknown as { manifest?: { eligibility?: string | null } })?.manifest?.eligibility?.toUpperCase?.()
    return e === "PAPER"
  }).length

  // No-runs empty state — fall through and render the production blocks, which
  // each have their own per-sleeve empty copy. The old "no bench runs" wall
  // only made sense while Home was the research surface; post-v3 it's not.

  // Resolve a passport link per sleeve. Today the bench data ships passports
  // tagged by sleeve, so we link the first card per sleeve to that sleeve's
  // first matching passport. Future: match by manifest_id once passports
  // expose it.
  const passportBySleeve: Record<Sleeve, string | null> = { stocks: null, options: null, crypto: null }
  for (const p of currentBenchData?.passports ?? []) {
    const sleeveToken = (p.sleeve ?? "").toLowerCase()
    if (sleeveToken === "stocks" && !passportBySleeve.stocks) passportBySleeve.stocks = `/vires/bench/passport/${encodeURIComponent(p.id)}`
    else if (sleeveToken === "crypto" && !passportBySleeve.crypto) passportBySleeve.crypto = `/vires/bench/passport/${encodeURIComponent(p.id)}`
    else if (sleeveToken === "options" && !passportBySleeve.options) passportBySleeve.options = `/vires/bench/passport/${encodeURIComponent(p.id)}`
  }

  const SLEEVE_GROUP: Array<{ sleeve: Sleeve; label: string; emptyCopy: string }> = [
    { sleeve: "stocks",  label: "Stocks",  emptyCopy: "No stocks strategy in production yet." },
    { sleeve: "options", label: "Options", emptyCopy: "No options strategy in production yet." },
    { sleeve: "crypto",  label: "Crypto",  emptyCopy: "No crypto strategy in production yet." },
  ]

  const filterCounts: Record<string, number> & { ALL: number } = {
    ALL: promotedCount,
    STOCKS: promotedBySleeve.stocks.length,
    OPTIONS: promotedBySleeve.options.length,
    CRYPTO: promotedBySleeve.crypto.length,
  }

  const visibleGroup =
    sleeveFilter === "ALL"
      ? SLEEVE_GROUP
      : SLEEVE_GROUP.filter(g => g.sleeve.toUpperCase() === sleeveFilter)

  return (
    <div className="vr-screen vires-screen-pad" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <BenchHero
        liveCount={liveCount}
        paperCount={paperCount}
        promotedCount={promotedCount}
        campaignCount={campaignCount}
        labRedesign={labRedesign}
      />

      {labRedesign && <LabPortalVault />}

      <SectionHeader
        eyebrow="Promoted"
        title="In production"
        right={<span className="t-label" style={{ fontSize: 10 }}>{promotedCount} promoted</span>}
      />
      <SleeveFilterBar
        value={sleeveFilter}
        onChange={setSleeveFilter}
        counts={filterCounts}
        ariaLabel="Promoted sleeve filter"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {visibleGroup.map(({ sleeve, label, emptyCopy }) => {
          const entries = promotedBySleeve[sleeve]
          const passportHref = passportBySleeve[sleeve]
          return (
            <div key={sleeve} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="t-eyebrow" style={{ fontSize: 10, color: "var(--vr-cream-mute)", letterSpacing: "0.18em" }}>
                {label}
              </div>
              {entries.length > 0
                ? entries.map((s, i) => (
                    <FeaturedStrategy
                      key={s.display_name ?? `${sleeve}-${i}`}
                      strategy={s}
                      passportHref={i === 0 ? passportHref : null}
                    />
                  ))
                : <PromotedEmptyRow sleeve={sleeve} copy={emptyCopy} />}
            </div>
          )
        })}
      </div>

      {/* Research-pressure pointer row — zero-overlap invariant sends operators
          to Campaigns for anything research-facing. */}
      <Link
        href="/vires/bench/campaigns"
        className="vr-card"
        style={{
          padding: "14px 16px",
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "rgba(241,236,224,0.015)",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <div>
          <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 4 }}>
            Research pressure
          </div>
          <div className="t-h4" style={{ fontSize: 14, color: "var(--vr-cream)" }}>
            {campaignCount === 0
              ? "No campaigns yet — research lands here as theses mature"
              : `${campaignCount} active ${campaignCount === 1 ? "campaign" : "campaigns"} competing for promotion`}
          </div>
        </div>
        <span
          className="t-eyebrow"
          style={{ fontSize: 10, color: "var(--vr-gold)", display: "inline-flex", gap: 6, alignItems: "center" }}
        >
          Open Campaigns
          <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
            <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </span>
      </Link>

      {/* Research Lab lives on the top nav now, not on bench home. */}

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
  const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)
  return {
    display_name: typeof r.display_name === "string" ? r.display_name : undefined,
    variant_id: typeof r.variant_id === "string" ? r.variant_id : undefined,
    sleeve: "stocks",
    symbols: Array.isArray(r.symbols) ? (r.symbols as string[]) : undefined,
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

function mapPromotedManifest(manifest: PromotedManifest | null | undefined): ActiveStrategy | null {
  if (!manifest) return null
  const perf = manifest.performance_summary ?? {}
  const sleeveToken = typeof manifest.sleeve === "string" ? manifest.sleeve.toUpperCase() : null
  const sleeve: Sleeve =
    sleeveToken === "CRYPTO" ? "crypto" :
    sleeveToken === "OPTIONS" ? "options" :
    "stocks"
  return {
    display_name: manifest.title ?? undefined,
    variant_id: manifest.deployment_config_id ?? undefined,
    sleeve,
    performance: {
      totalReturn: typeof perf.total_return_pct === "number" ? perf.total_return_pct : undefined,
      excess: typeof perf.excess_return_pct === "number" ? perf.excess_return_pct : undefined,
      sharpe: typeof perf.sharpe_ratio === "number" ? perf.sharpe_ratio : undefined,
      calmar: typeof perf.calmar_ratio === "number" ? perf.calmar_ratio : undefined,
      maxDD: typeof perf.max_drawdown_pct === "number" ? perf.max_drawdown_pct : undefined,
      winRate: typeof perf.win_rate_pct === "number" ? perf.win_rate_pct : undefined,
    },
  }
}

function mapFeaturedStrategy(operator: OperatorBundle | null): ActiveStrategy | null {
  const active = mapActiveStrategy(operator?.strategy_bank?.active ?? null)
  if (active) return active
  return mapPromotedManifest(operator?.strategy_bank?.promoted?.[0] ?? null)
}

// Group every promoted strategy by sleeve. Stocks prefers the selected
// `active` (richer per-variant metrics); falls back to STOCKS-tagged
// entries in `promoted[]` only if active is absent. Crypto + Options
// pull straight from `promoted[]`.
function mapAllPromotedBySleeve(operator: OperatorBundle | null): Record<Sleeve, ActiveStrategy[]> {
  const grouped: Record<Sleeve, ActiveStrategy[]> = { stocks: [], options: [], crypto: [] }

  const active = mapActiveStrategy(operator?.strategy_bank?.active ?? null)
  if (active) grouped.stocks.push(active)

  for (const m of operator?.strategy_bank?.promoted ?? []) {
    const sleeveToken = typeof m.sleeve === "string" ? m.sleeve.toUpperCase() : null
    const mapped = mapPromotedManifest(m)
    if (!mapped) continue
    if (sleeveToken === "CRYPTO") grouped.crypto.push(mapped)
    else if (sleeveToken === "OPTIONS") grouped.options.push(mapped)
    else if (grouped.stocks.length === 0) grouped.stocks.push(mapped)
  }

  return grouped
}
