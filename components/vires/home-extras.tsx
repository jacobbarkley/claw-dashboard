"use client"

// Lower-home sections on Vires Trading > Home: Elevated Strategies,
// Market Regime, Desk Status. All three read from the operator feed's
// existing `operator.*` block — no backend work was needed for any of
// these (the earlier primer flagged regime as a Codex ask; turned out
// the feed already carries it under operator.regime).

import { InfoPop, SectionHeader, SleeveChip, StatusPill } from "./shared"

// ─── Types (narrow, pulled from operator feed observation) ──────────────────

interface OperatorBundle {
  checkpoint05?: {
    checkpoint_status?: string
    total_shadow_days?: number
    substantive_shadow_days?: number
  } | null
  plan?: {
    trade_plan_status?: string
    trade_plan_count?: number
    trade_plan_symbols?: string[]
  } | null
  research?: {
    thesis_item_count?: number
    long_bias_count?: number
    top_theses?: Array<{
      symbol?: string
      side_bias?: string
      confidence?: string
      bull_prob?: number
      bear_prob?: number
    }>
  } | null
  regime?: {
    vix_level?: number
    vix_regime?: string
    hmm_regime?: string
    jump_variation_regime?: string
    populated?: boolean
    narrative?: string
  } | null
  strategy_bank?: {
    active?: BankedStrategy | null
    banked_strategies?: BankedStrategy[]
    promoted?: PromotedManifest[]
  } | null
}

interface BankedStrategy {
  record_id?: string
  selected?: boolean
  strategy_family?: string
  display_name?: string
  variant_id?: string
  symbols?: string[]
  promotion_stage?: string
  performance_summary?: {
    total_return_pct?: number
    excess_return_pct?: number
    sharpe_ratio?: number
    calmar_ratio?: number
    max_drawdown_pct?: number
    win_rate_pct?: number
  } | null
  selected_at?: string
  registered_at?: string
}

interface PromotedManifest {
  manifest_id?: string
  title?: string
  sleeve?: string
  strategy_family?: string
  deployment_config_id?: string
  cadence?: string
  source_kind?: string
  generated_at?: string
  performance_summary?: {
    total_return_pct?: number | null
    excess_return_pct?: number | null
    sharpe_ratio?: number | null
    calmar_ratio?: number | null
    max_drawdown_pct?: number | null
    win_rate_pct?: number | null
  } | null
}

// ─── Elevated Strategies ────────────────────────────────────────────────────
// Grouped by sleeve (Stocks / Options / Crypto), each sleeve header followed
// by stacked variant cards. Stocks pulls from `strategy_bank.active` (the
// selected variant has the richest per-variant metrics). Crypto and Options
// pull from `strategy_bank.promoted[]` filtered by sleeve. Per Jacob's
// 2026-04-20 feedback — visible architecture mirrors Bench's Promoted in
// Production card.

interface NormalizedElevated {
  key: string
  title: string
  subtitle?: string
  metrics: Array<{ label: string; value: string; color?: string; term?: string }>
  promotedOn: string | null
}

function normalizeFromActive(a: BankedStrategy): NormalizedElevated {
  const perf = a.performance_summary ?? {}
  return {
    key: a.record_id ?? a.display_name ?? "active",
    title: displayNameFromFamily(a.strategy_family) ?? a.display_name ?? "Active Strategy",
    subtitle: [a.symbols?.slice(0, 6).join(", "), a.variant_id].filter(Boolean).join(" · "),
    metrics: [
      { label: "Calmar", term: "Calmar", value: perf.calmar_ratio != null ? perf.calmar_ratio.toFixed(2) : "—", color: "var(--vr-gold)" },
      { label: "Sharpe", term: "Sharpe", value: perf.sharpe_ratio != null ? perf.sharpe_ratio.toFixed(2) : "—" },
    ],
    promotedOn: a.selected_at?.slice(0, 10) ?? a.registered_at?.slice(0, 10) ?? null,
  }
}

function normalizeFromPromoted(p: PromotedManifest): NormalizedElevated {
  const perf = p.performance_summary ?? {}
  return {
    key: p.manifest_id ?? p.title ?? `${p.sleeve}-${p.strategy_family}`,
    title: p.title ?? p.strategy_family ?? "Promoted sleeve",
    subtitle: [p.deployment_config_id, p.cadence].filter(Boolean).join(" · "),
    metrics: [
      { label: "Calmar",   term: "Calmar",  value: perf.calmar_ratio != null ? perf.calmar_ratio.toFixed(2) : "—", color: "var(--vr-gold)" },
      { label: "vs Bench", term: "VsBench", value: perf.excess_return_pct != null ? `${perf.excess_return_pct >= 0 ? "+" : ""}${perf.excess_return_pct.toFixed(1)}%` : "—" },
    ],
    promotedOn: p.generated_at?.slice(0, 10) ?? "checked-in",
  }
}

const SLEEVE_DISPLAY: Array<{ sleeve: "stocks" | "options" | "crypto"; label: string; emptyCopy: string }> = [
  { sleeve: "stocks",  label: "Stocks",  emptyCopy: "No stocks strategy promoted yet." },
  { sleeve: "options", label: "Options", emptyCopy: "No options strategy promoted yet." },
  { sleeve: "crypto",  label: "Crypto",  emptyCopy: "No crypto strategy promoted yet." },
]

function StrategyRow({ chip, title, subtitle, metrics, promotedOn }: {
  chip: React.ReactNode
  title: string
  subtitle?: string
  metrics: Array<{ label: string; value: string; color?: string; term?: string }>
  promotedOn?: string | null
}) {
  return (
    <div
      className="vr-card"
      style={{
        padding: 16,
        borderColor: "var(--vr-gold-line)",
        background: "var(--vr-ink)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {chip}
      </div>
      <div className="t-h4" style={{ fontSize: 16, marginTop: 4 }}>{title}</div>
      {subtitle && (
        <div className="t-label" style={{ fontSize: 11, marginTop: 3 }}>{subtitle}</div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${metrics.length}, 1fr) auto`,
          marginTop: 14,
          paddingTop: 10,
          borderTop: "1px solid var(--vr-line)",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        {metrics.map(m => (
          <div key={m.label}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3, display: "flex", alignItems: "center" }}>
              {m.label}
              {m.term && <InfoPop term={m.term} size={10} />}
            </div>
            <div className="t-num" style={{ fontSize: 14, color: m.color ?? "var(--vr-cream)", fontWeight: 500 }}>
              {m.value}
            </div>
          </div>
        ))}
        <div style={{ textAlign: "right" }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Promoted</div>
          <div className="t-num" style={{ fontSize: 11, color: "var(--vr-cream-dim)" }}>
            {promotedOn ?? "—"}
          </div>
        </div>
      </div>
    </div>
  )
}

function SleeveEmptyRow({ chip, copy }: { chip: React.ReactNode; copy: string }) {
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
        {chip}
      </div>
      <div className="t-label" style={{ fontSize: 12, color: "var(--vr-cream-dim)" }}>
        {copy}
      </div>
    </div>
  )
}

export function ElevatedStrategies({ operator }: { operator: OperatorBundle | null }) {
  const active = operator?.strategy_bank?.active ?? null
  const promoted = operator?.strategy_bank?.promoted ?? []

  const grouped: Record<"stocks" | "options" | "crypto", NormalizedElevated[]> = {
    stocks: [],
    options: [],
    crypto: [],
  }

  // Stocks: prefer the selected `active` (richer per-variant metrics).
  // Fall back to any STOCKS entries in promoted[] only if active is absent.
  if (active) {
    grouped.stocks.push(normalizeFromActive(active))
  } else {
    promoted
      .filter(p => p.sleeve === "STOCKS")
      .forEach(p => grouped.stocks.push(normalizeFromPromoted(p)))
  }

  // Crypto + Options: every promoted entry tagged for that sleeve.
  promoted.forEach(p => {
    if (p.sleeve === "CRYPTO") grouped.crypto.push(normalizeFromPromoted(p))
    else if (p.sleeve === "OPTIONS") grouped.options.push(normalizeFromPromoted(p))
  })

  const totalCount = grouped.stocks.length + grouped.options.length + grouped.crypto.length

  return (
    <section>
      <SectionHeader
        eyebrow="From the Bench"
        title="Elevated Strategies"
        right={<span className="t-label" style={{ fontSize: 10 }}>{totalCount} promoted</span>}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {SLEEVE_DISPLAY.map(({ sleeve, label, emptyCopy }) => {
          const entries = grouped[sleeve]
          return (
            <div key={sleeve} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="t-eyebrow" style={{ fontSize: 10, color: "var(--vr-cream-mute)", letterSpacing: "0.18em" }}>
                {label}
              </div>
              {entries.length > 0
                ? entries.map(e => (
                    <StrategyRow
                      key={e.key}
                      chip={<SleeveChip sleeve={sleeve} />}
                      title={e.title}
                      subtitle={e.subtitle}
                      metrics={e.metrics}
                      promotedOn={e.promotedOn}
                    />
                  ))
                : <SleeveEmptyRow chip={<SleeveChip sleeve={sleeve} />} copy={emptyCopy} />}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function displayNameFromFamily(family?: string | null): string | null {
  if (!family) return null
  return family
    .split("_")
    .map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "")
    .join("-")
    .replace(/^(\w+)-/, "$1 ")  // first dash → space for natural reading
    .replace("Aware", "Aware")
}

// ─── Market Regime ──────────────────────────────────────────────────────────

function RegimeTile({ label, term, value, sub, first = false }: {
  label: string
  term?: string  // glossary key — when present the tile gets an ⓘ button
  value: string
  sub: string
  first?: boolean
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderLeft: first ? "none" : "1px solid var(--vr-line)",
      }}
    >
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, marginBottom: 6, display: "flex", alignItems: "center" }}
      >
        {label}
        {term && <InfoPop term={term} size={11} />}
      </div>
      <div className="t-h3" style={{ fontSize: 16, textTransform: "capitalize" }}>{value}</div>
      <div className="t-label" style={{ fontSize: 10, marginTop: 3 }}>{sub}</div>
    </div>
  )
}

export function MarketRegime({ operator }: { operator: OperatorBundle | null }) {
  const r = operator?.regime
  if (!r || !r.populated) {
    return (
      <section>
        <SectionHeader eyebrow="Market Regime" title="" />
        <div className="vr-card" style={{ padding: 20 }}>
          <div className="t-label" style={{ fontSize: 12 }}>
            Regime telemetry is not populated yet.
          </div>
        </div>
      </section>
    )
  }

  const items: Array<{ l: string; term: string; v: string; s: string }> = [
    { l: "VIX",  term: "VIX",  v: r.vix_level != null ? r.vix_level.toFixed(2) : "—", s: (r.vix_regime ?? "—").toLowerCase() },
    { l: "HMM",  term: "HMM",  v: (r.hmm_regime ?? "—").toLowerCase(),                s: "regime state" },
    { l: "Jump", term: "Jump", v: (r.jump_variation_regime ?? "—").toLowerCase().replace("jump_", ""), s: "stress" },
  ]

  return (
    <section>
      <div className="vr-card">
        <div style={{ padding: "14px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="t-eyebrow">Market Regime</div>
          <span className="t-label" style={{ fontSize: 10 }}>live</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: "1px solid var(--vr-line)" }}>
          {items.map((it, i) => (
            <RegimeTile key={it.l} label={it.l} term={it.term} value={it.v} sub={it.s} first={i === 0} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Desk Status ────────────────────────────────────────────────────────────

export function DeskStatus({ operator }: { operator: OperatorBundle | null }) {
  if (!operator) {
    return null
  }

  const plan = operator.plan ?? {}
  const research = operator.research ?? {}
  const topThesis = research.top_theses?.[0]

  // Promotion / checkpoint05 row was removed 2026-04-20 — placeholder data
  // (ACCUMULATING tier state) was tied to a discarded approach. The row
  // returns when the campaign UI lands and there's a real promotion-pipeline
  // signal to surface.

  const rows: Array<{
    label: string
    value: string
    detail: string
    pill: { tone: "up" | "down" | "gold" | "warn" | "neutral"; text: string }
  }> = []

  // Plan — trade plan readiness
  if (plan.trade_plan_status) {
    const count = plan.trade_plan_count ?? 0
    const syms = plan.trade_plan_symbols ?? []
    rows.push({
      label: "Plan",
      value: `${count} trade${count === 1 ? "" : "s"} ready`,
      detail: syms.length ? syms.join(", ") : "—",
      pill: {
        tone: plan.trade_plan_status === "READY" ? "up" : plan.trade_plan_status === "BLOCKED" ? "down" : "warn",
        text: plan.trade_plan_status,
      },
    })
  }

  // Research — top thesis confidence
  if (topThesis) {
    const side = (topThesis.side_bias ?? "").toLowerCase()
    const confidenceTone: "up" | "warn" | "neutral" =
      topThesis.confidence === "HIGH" ? "up" : topThesis.confidence === "MEDIUM" ? "warn" : "neutral"
    rows.push({
      label: "Research",
      value: `${topThesis.symbol ?? "—"} · ${side}`,
      detail: `${topThesis.bull_prob ?? "—"}% bull case · ${research.thesis_item_count ?? 0} active thesis`,
      pill: { tone: confidenceTone, text: topThesis.confidence ?? "—" },
    })
  }

  if (rows.length === 0) return null

  return (
    <section>
      <div className="vr-card">
        <div style={{ padding: "14px 16px 10px" }}>
          <div className="t-eyebrow">Desk Status</div>
        </div>
        <div className="vr-divide">
          {rows.map(r => (
            <div
              key={r.label}
              style={{
                padding: "12px 16px",
                display: "grid",
                gridTemplateColumns: "80px 1fr auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <span className="t-eyebrow" style={{ fontSize: 9 }}>{r.label}</span>
              <div>
                <div className="t-h4" style={{ fontSize: 13, color: "var(--vr-cream)" }}>{r.value}</div>
                <div className="t-label" style={{ fontSize: 11, marginTop: 2 }}>{r.detail}</div>
              </div>
              <StatusPill tone={r.pill.tone}>{r.pill.text}</StatusPill>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
