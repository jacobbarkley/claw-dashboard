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

// ─── Elevated Strategies ────────────────────────────────────────────────────
// Shows the single selected promoted strategy with real metrics, plus honest
// placeholder rows for BTC 4H TSMOM and BTC Managed Exposure. The two crypto
// rows flip to real cards once strategy_bank.promoted carries them (Codex
// primer, ask #6).

function StrategyRow({ chip, eyebrow, title, subtitle, metrics, promotedOn, tone = "gold" }: {
  chip: React.ReactNode
  eyebrow: string
  title: string
  subtitle?: string
  metrics: Array<{ label: string; value: string; color?: string }>
  promotedOn?: string | null
  tone?: "gold" | "neutral"
}) {
  return (
    <div
      className="vr-card"
      style={{
        padding: 16,
        borderColor: tone === "gold" ? "var(--vr-gold-line)" : "var(--vr-line)",
        background: "var(--vr-ink)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {chip}
        <span className="t-eyebrow" style={{ color: tone === "gold" ? "var(--vr-gold)" : "var(--vr-cream-mute)" }}>
          · {eyebrow}
        </span>
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
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>{m.label}</div>
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

export function ElevatedStrategies({ operator }: { operator: OperatorBundle | null }) {
  const active = operator?.strategy_bank?.active ?? null
  const perf = active?.performance_summary ?? {}
  const promotedDate = active?.selected_at ? active.selected_at.slice(0, 10) : null

  return (
    <section>
      <SectionHeader
        eyebrow="From the Bench"
        title="Elevated Strategies"
        right={<span className="t-label" style={{ fontSize: 10 }}>3 tracked</span>}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {active ? (
          <StrategyRow
            chip={<SleeveChip sleeve="stocks" />}
            eyebrow="ELEVATED"
            title={displayNameFromFamily(active.strategy_family) ?? active.display_name ?? "Active Strategy"}
            subtitle={`${active.symbols?.slice(0, 6).join(", ") ?? ""} · ${active.variant_id ?? ""}`}
            metrics={[
              { label: "Calmar",  value: perf.calmar_ratio != null ? perf.calmar_ratio.toFixed(2) : "—", color: "var(--vr-gold)" },
              { label: "Sharpe",  value: perf.sharpe_ratio != null ? perf.sharpe_ratio.toFixed(2) : "—" },
            ]}
            promotedOn={promotedDate}
            tone="gold"
          />
        ) : (
          <StrategyRow
            chip={<SleeveChip sleeve="stocks" />}
            eyebrow="awaiting promotion"
            title="Stock strategy not yet promoted"
            metrics={[{ label: "Status", value: "—" }]}
            tone="neutral"
          />
        )}

        <StrategyRow
          chip={<SleeveChip sleeve="crypto" />}
          eyebrow="bench research · awaiting promotion"
          title="BTC 4H TSMOM"
          subtitle="4-hour time-series momentum · trend filter"
          metrics={[
            { label: "Med Era Sharpe", value: "—" },
            { label: "Plateau",        value: "pending" },
          ]}
          tone="neutral"
        />

        <StrategyRow
          chip={<SleeveChip sleeve="crypto" />}
          eyebrow="bench research · awaiting promotion"
          title="BTC Managed Exposure"
          subtitle="Graduated 80 / 70 / 0 ladder + tactical top-up"
          metrics={[
            { label: "Calmar",  value: "—" },
            { label: "vs HODL", value: "—" },
          ]}
          tone="neutral"
        />
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

  const cp = operator.checkpoint05 ?? {}
  const plan = operator.plan ?? {}
  const research = operator.research ?? {}
  const topThesis = research.top_theses?.[0]

  const rows: Array<{
    label: string
    value: string
    detail: string
    pill: { tone: "up" | "down" | "gold" | "warn" | "neutral"; text: string }
  }> = []

  // Promotion — checkpoint05 accumulation
  if (cp.checkpoint_status) {
    const subs = cp.substantive_shadow_days ?? 0
    const total = cp.total_shadow_days ?? 0
    rows.push({
      label: "Promotion",
      value: `${subs} of 10 days`,
      detail: `${total} shadow days observed`,
      pill: {
        tone: cp.checkpoint_status === "ACCUMULATING" ? "warn" : cp.checkpoint_status === "SATISFIED" ? "up" : "neutral",
        text: cp.checkpoint_status,
      },
    })
  }

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
