"use client"

// Strategy Passport — drill-in view opened from the Bench Promoted row.
// Renders the passport payload Codex's lib/vires-bench.ts emits
// (buildStockPassport / buildCryptoManagedPassport / etc.) into a full
// editorial detail page: identity + verdict + era robustness + promotion
// gates + assumptions + lifecycle timeline.

import Link from "next/link"
import { InfoPop, SectionHeader, SleeveChip, StatusPill, fmtPct, toneColor, toneOf, type Sleeve } from "./shared"
import { ParameterHeatmap, type PlateauPayload } from "./plateau-view"

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Matches the shape lib/vires-bench.ts returns for a passport entry.

interface PassportEra {
  label?: string | null
  sharpe?: number | null
  ret?: number | null
  pass?: boolean | null
  verdict?: string | null            // "PASS" | "FAIL" | "INCONCLUSIVE" | null
  verdict_reason?: string | null     // e.g. "INSUFFICIENT_TRADE_COUNT"
  total_trades?: number | null       // for the inconclusive tooltip
  evaluated_trading_days?: number | null
}

interface PassportGate {
  label?: string | null
  status?: string | null
  detail?: string | null
}

interface PassportLifecycleEvent {
  stage?: string | null
  at?: string | null
  actor?: string | null
  title?: string | null
  detail?: string | null
  status?: string | null
  artifact?: { label?: string | null; kind?: string | null } | null
}

interface PassportManifest {
  provenance?: string | null
  ref?: string | null
  stage?: string | null
  eligibility?: string | null
  paperDays?: number | null
  paperTarget?: number | null
  runtimeContract?: string | null
  cadence?: string | null
  broker?: { broker_adapter?: string; broker_environment?: string } | null
}

interface PassportPromotionEvent {
  event_id?: string | null
  event_type?: string | null
  at?: string | null
  actor?: string | null
  campaign_id?: string | null
  candidate_id?: string | null
  passport_role_id?: string | null
  target_action?: string | null
  supersedes_record_id?: string | null
  notes?: string | null
}

interface PassportPaperMonitoring {
  schema_version?: string | null
  status?: string | null
  window?: {
    start?: string | null
    target_days?: number | null
    elapsed_days?: number | null
    remaining_days?: number | null
  } | null
  tracking?: {
    source_kind?: string | null
    source_detail?: string | null
    actual_return_pct?: number | null
    expected_return_pct?: number | null
    tracking_deviation_pct?: number | null
    threshold_pct?: number | null
    window_days?: number | null
  } | null
  recommendation?: {
    status?: string | null
    raised_at?: string | null
    reason?: string | null
  } | null
}

interface PassportTradeHistoryRow {
  date?: string | null
  event_id?: string | null
  event_type?: string | null
  symbol?: string | null
  side?: string | null
  weight_after?: number | null
  price?: number | null
  notional?: number | null
  pnl_realized?: number | null
}

interface PassportTradeHistory {
  schema_version?: string | null
  weight_basis?: string | null
  cash_model?: string | null
  rows?: PassportTradeHistoryRow[]
}

export interface Passport {
  id: string
  bench_id?: string | null
  run_id?: string | null
  source_type?: string | null
  name?: string | null
  variant?: string | null
  sleeve?: string | null
  benchmark?: string | null
  summary?: string | null
  manifest?: PassportManifest | null
  metrics?: {
    totalReturn?: number | null
    benchReturn?: number | null
    excess?: number | null
    sharpe?: number | null
    benchSharpe?: number | null
    sharpeDelta?: number | null
    calmar?: number | null
    benchCalmar?: number | null
    calmarDelta?: number | null
    maxDD?: number | null
    benchMaxDD?: number | null
    ddDelta?: number | null
    trades?: number | null
    days?: number | null
    profitFactor?: number | null
    winRate?: number | null
  } | null
  eras?: PassportEra[]
  minEraSharpe?: number | null
  assumptions?: {
    commissionBps?: number | null
    slippageBps?: number | null
    fillModel?: string | null
    capitalBase?: number | null
    provider?: string | null
    venue?: string | null
    timeframe?: string | null
  } | null
  gates?: PassportGate[]
  lifecycle?: { events?: PassportLifecycleEvent[] } | null
  origin?: {
    campaign_id?: string | null
    candidate_id?: string | null
    run_id?: string | null
    passport_role_id?: string | null
    supersedes_record_id?: string | null
  } | null
  passport_role_id?: string | null
  supersedes_record_id?: string | null
  paper_monitoring?: PassportPaperMonitoring | null
  promotion_events?: PassportPromotionEvent[] | null
  trade_history?: PassportTradeHistory | null
  plateau_primer?: PlateauPayload | null
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SLEEVE_LC: Record<string, Sleeve> = {
  STOCKS: "stocks",
  OPTIONS: "options",
  CRYPTO: "crypto",
}

function gateTone(status: string | null | undefined): "up" | "down" | "gold" | "warn" | "neutral" {
  const s = (status ?? "").toUpperCase()
  if (s === "PASS") return "up"
  if (s === "FAIL") return "down"
  if (s === "PENDING" || s === "WARN" || s === "BLOCKED") return "warn"
  return "neutral"
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  return v != null && Number.isFinite(v) ? v.toFixed(digits) : "—"
}

function fmtPctSigned(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return iso.slice(0, 10)
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v)
}

// â”€â”€â”€ Verdict strip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function VerdictStrip({ passport }: { passport: Passport }) {
  const m = passport.manifest
  const stage = (m?.stage ?? "").toUpperCase()
  const eligibility = (m?.eligibility ?? "").toUpperCase()
  const provenance = (m?.provenance ?? "").toUpperCase()

  const { eyebrow, line, accent } = (() => {
    if (stage === "PROMOTED") {
      return {
        eyebrow: "Verdict",
        line: eligibility === "LIVE" ? "Promoted · Earning live capital" : "Promoted · Paper window",
        accent: "var(--vr-gold)",
      }
    }
    if (stage === "BENCHED" || stage === "BENCH_ONLY") {
      return { eyebrow: "Verdict", line: "Benched · Awaiting promotion", accent: "var(--vr-cream-dim)" }
    }
    if (stage === "FALLBACK") {
      return { eyebrow: "Verdict", line: "Running on fallback manifest", accent: "var(--vr-gold)" }
    }
    return { eyebrow: "Verdict", line: passport.summary ?? "Research in progress", accent: "var(--vr-cream-dim)" }
  })()

  const provenanceWarn = !!provenance && provenance !== "CHECKED_IN"

  return (
    <div className="vr-card" style={{ borderLeft: `2px solid ${accent}` }}>
      <div style={{ padding: "16px 18px" }}>
        <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 8, color: accent }}>{eyebrow}</div>
        <div className="t-h3" style={{ fontSize: 20, fontStyle: "italic", lineHeight: 1.25 }}>{line}</div>
      </div>
      <div style={{ borderTop: "1px solid var(--vr-line)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <div style={{ padding: "12px 18px", borderRight: "1px solid var(--vr-line)" }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 5 }}>Eligibility</div>
          <div className="t-label" style={{ fontSize: 11, color: "var(--vr-cream)", letterSpacing: "0.04em" }}>
            {eligibility === "LIVE" && <span style={{ color: "var(--vr-up)" }}>â— LIVE</span>}
            {eligibility === "PAPER" && (
              <span style={{ color: "var(--vr-gold)" }}>
                â— PAPER
                {m?.paperDays != null && m?.paperTarget != null && ` · day ${m.paperDays}/${m.paperTarget}`}
              </span>
            )}
            {(eligibility === "BENCH_ONLY" || !eligibility) && (
              <span style={{ color: "var(--vr-cream-mute)" }}>â—‹ BENCH ONLY</span>
            )}
          </div>
        </div>
        <div style={{ padding: "12px 18px" }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 5 }}>Manifest</div>
          <div
            className="t-ticker"
            style={{
              fontSize: 10,
              color: provenanceWarn ? "var(--vr-gold)" : "var(--vr-cream-dim)",
              letterSpacing: "0.06em",
              textTransform: "none",
            }}
          >
            {provenanceWarn && "âš  "}
            {(m?.provenance ?? "no manifest").toLowerCase().replace(/_/g, " ")}
          </div>
        </div>
      </div>
      {provenanceWarn && (
        <div style={{ borderTop: "1px solid var(--vr-line)", padding: "10px 18px", background: "rgba(200,169,104,0.04)" }}>
          <div className="t-read" style={{ fontSize: 11, color: "var(--vr-cream-mute)", lineHeight: 1.5 }}>
            Running against a fallback manifest, not a checked-in promotion. Evidence below reflects the fallback config.
          </div>
        </div>
      )}
    </div>
  )
}

// â”€â”€â”€ Era robustness graph â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function EraStripe({ eras, minEraSharpe }: { eras: PassportEra[]; minEraSharpe: number | null | undefined }) {
  if (!eras.length) return null
  const populated = eras.filter(e => e.sharpe != null)
  const allPending = populated.length === 0

  // Honest empty state when Codex's per-era sharpe values aren't yet
  // populated on the passport — labels exist but values are null. Render
  // the same dotted-line baseline + label row so the section's visual
  // weight is preserved without faking any per-era performance.
  if (allPending) {
    return (
      <section className="vr-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div>
            <div className="t-eyebrow">Era robustness</div>
            <div className="t-label" style={{ fontSize: 12, marginTop: 4, color: "var(--vr-cream)" }}>
              Sharpe by regime window
            </div>
          </div>
          <div className="t-label" style={{ fontSize: 10, color: "var(--vr-gold)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Awaiting era data
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${eras.length}, 1fr)`,
            gap: 6,
            alignItems: "end",
            height: 88,
            marginTop: 14,
          }}
        >
          {eras.map((_, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: "100%",
                  height: 2,
                  background: "var(--vr-cream-faint)",
                  opacity: 0.5,
                  alignSelf: "center",
                  marginTop: "auto",
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${eras.length}, 1fr)`, gap: 6, marginTop: 10 }}>
          {eras.map((e, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div className="t-num" style={{ fontSize: 11, color: "var(--vr-cream-mute)" }}>—</div>
              <div className="t-label" style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginTop: 2 }}>
                {e.label ?? `era ${i + 1}`}
              </div>
            </div>
          ))}
        </div>
        <div className="t-label" style={{ fontSize: 10, marginTop: 12, color: "var(--vr-cream-mute)", lineHeight: 1.5 }}>
          The bench publishes the regime windows for this strategy, but the
          per-era Sharpe values are not yet on the published passport. Lights
          up the moment the campaign report carries era_results.
        </div>
      </section>
    )
  }

  const maxSharpe = Math.max(1, ...populated.map(e => e.sharpe ?? 0))
  const floor = minEraSharpe ?? 0
  const passing = populated.filter(e => (e.sharpe ?? -Infinity) >= floor).length

  return (
    <section className="vr-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div>
          <div className="t-eyebrow">Era robustness</div>
          <div className="t-label" style={{ fontSize: 12, marginTop: 4, color: "var(--vr-cream)" }}>
            Sharpe by regime window
          </div>
        </div>
        <div className="t-label" style={{ fontSize: 11, color: "var(--vr-cream-mute)" }}>
          {passing}/{populated.length} above floor
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${eras.length}, 1fr)`,
          gap: 6,
          alignItems: "end",
          height: 88,
          position: "relative",
          marginTop: 14,
        }}
      >
        {eras.map((e, i) => {
          if (e.sharpe == null) {
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                <div style={{ width: "100%", height: 2, background: "var(--vr-cream-faint)", opacity: 0.5 }} />
              </div>
            )
          }
          const h = Math.max(3, (e.sharpe / maxSharpe) * 84)
          const tone = e.pass ? "var(--vr-gold)" : "var(--vr-down)"
          // INCONCLUSIVE eras (small sample size, etc.) keep their bar +
          // value but render with reduced opacity + diagonal stripe so the
          // operator can see the value without reading it as full
          // confidence. Per Jacob's 2026-04-21 product call: data stays
          // visible, confidence stays honest.
          const inconclusive = e.verdict === "INCONCLUSIVE"
          const reasonHuman = humanizeVerdictReason(e.verdict_reason)
          const tooltip = inconclusive
            ? [
                `Inconclusive era (${reasonHuman ?? "low confidence"})`,
                e.total_trades != null ? `${e.total_trades} trade${e.total_trades === 1 ? "" : "s"}` : null,
                e.evaluated_trading_days != null ? `${e.evaluated_trading_days} day${e.evaluated_trading_days === 1 ? "" : "s"}` : null,
              ].filter(Boolean).join(" · ")
            : undefined
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={tooltip}>
              <div
                style={{
                  width: "100%",
                  height: h,
                  background: tone,
                  opacity: inconclusive ? 0.35 : (e.pass ? 0.85 : 0.55),
                  borderRadius: 1,
                  // Diagonal-stripe overlay for inconclusive eras — reads
                  // as "data is here but treat with caution."
                  backgroundImage: inconclusive
                    ? `repeating-linear-gradient(45deg, transparent 0 4px, rgba(0,0,0,0.18) 4px 5px)`
                    : undefined,
                }}
              />
            </div>
          )
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${eras.length}, 1fr)`, gap: 6, marginTop: 10 }}>
        {eras.map((e, i) => {
          const inconclusive = e.verdict === "INCONCLUSIVE"
          return (
            <div key={i} style={{ textAlign: "center" }}>
              <div className="t-num" style={{
                fontSize: 11,
                color: e.sharpe != null
                  ? (inconclusive ? "var(--vr-cream-dim)" : "var(--vr-cream)")
                  : "var(--vr-cream-mute)",
                fontWeight: 500,
              }}>
                {fmtNum(e.sharpe, 2)}
              </div>
              {inconclusive && (
                <div style={{
                  fontFamily: "var(--ff-sans)",
                  fontSize: 8,
                  color: "var(--vr-cream-faint)",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  marginTop: 2,
                }}>
                  Inconclusive
                </div>
              )}
              <div className="t-label" style={{
                fontSize: 9,
                color: "var(--vr-cream-mute)",
                marginTop: inconclusive ? 1 : 2,
              }}>
                {e.label ?? `era ${i + 1}`}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function humanizeVerdictReason(reason: string | null | undefined): string | null {
  if (!reason) return null
  // "INSUFFICIENT_TRADE_COUNT" â†’ "Insufficient trade count"
  return reason
    .toLowerCase()
    .split("_")
    .map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1) : "")
    .join(" ")
}

// â”€â”€â”€ Gates list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function GatesList({ gates }: { gates: PassportGate[] }) {
  if (!gates.length) return null
  return (
    <section>
      <SectionHeader eyebrow="Governance" title="Promotion gates" />
      <div className="vr-card">
        <div className="vr-divide">
          {gates.map((g, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "8px 1fr auto",
                gap: 12,
                alignItems: "start",
                padding: "12px 16px",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: toneColor(gateTone(g.status) === "up" ? "up" : gateTone(g.status) === "down" ? "down" : "flat"),
                  marginTop: 6,
                }}
              />
              <div>
                <div className="t-label" style={{ fontSize: 12, color: "var(--vr-cream)", marginBottom: 3 }}>
                  {g.label ?? "gate"}
                </div>
                {g.detail && (
                  <div className="t-read" style={{ fontSize: 11, color: "var(--vr-cream-mute)", lineHeight: 1.45 }}>
                    {g.detail}
                  </div>
                )}
              </div>
              <StatusPill tone={gateTone(g.status)}>{g.status ?? "—"}</StatusPill>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// â”€â”€â”€ Parameter stability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Per-passport plateau: does THIS config live on a broad plateau, or is it
// a lucky peak with brittle neighbors? Rendered when the passport was born
// of a parameter sweep (i.e. plateau_primer is non-null). For frozen
// references and comparison-lane sleeves we show an honest empty state
// instead — plateaus only mean something if a neighborhood was searched.

function ParameterStabilityCard({ plateau }: { plateau: PlateauPayload | null | undefined }) {
  const winnerSharpe = plateau?.stats?.winnerSharpe ?? null
  const plateauCount = plateau?.stats?.plateauCount ?? null
  const totalEval = plateau?.stats?.totalEval ?? null
  const hasLucky = !!plateau?.lucky
  return (
    <section>
      <SectionHeader
        eyebrow="Parameter stability"
        title="Plateau or lucky peak?"
        right={
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <InfoPop term="Plateau" size={12} />
          </span>
        }
      />
      {plateau ? (
        <>
          {/* Summary strip — "is this a plateau or peak?" at a glance. */}
          <div
            className="vr-card"
            style={{
              padding: "14px 16px 12px",
              marginBottom: 10,
              borderLeft: `2px solid ${hasLucky ? "var(--vr-down)" : "var(--vr-gold)"}`,
            }}
          >
            <div
              className="t-h3"
              style={{ fontSize: 16, fontStyle: "italic", lineHeight: 1.35 }}
            >
              {hasLucky
                ? "A brighter neighbor is isolated — watch for overfit."
                : "The winner sits inside a stable neighborhood."}
            </div>
            <div
              className="t-label"
              style={{ fontSize: 11, color: "var(--vr-cream-dim)", marginTop: 6, lineHeight: 1.55 }}
            >
              {plateauCount != null && totalEval != null && (
                <>
                  {plateauCount} of {totalEval} non-rejected cells cleared the plateau check
                  {winnerSharpe != null ? ` around a winner Sharpe of ${winnerSharpe.toFixed(2)}` : ""}.
                </>
              )}
            </div>
          </div>
          <ParameterHeatmap data={plateau} />
        </>
      ) : (
        <div className="vr-card" style={{ padding: "18px 18px 20px" }}>
          <div
            className="t-read"
            style={{
              fontSize: 13,
              fontStyle: "italic",
              fontFamily: "var(--ff-serif)",
              color: "var(--vr-cream-dim)",
              lineHeight: 1.55,
            }}
          >
            No parameter sweep backs this passport — it is a frozen reference or a
            comparison-lane sleeve, not a neighborhood winner. Plateau checks
            light up once a candidate is selected from a real parameter grid.
          </div>
        </div>
      )}
    </section>
  )
}

// â”€â”€â”€ Assumptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AssumptionsCard({ assumptions }: { assumptions: Passport["assumptions"] }) {
  const a = assumptions ?? {}
  const rows: Array<{ label: string; value: string }> = [
    { label: "Commission", value: a.commissionBps != null ? `${a.commissionBps.toFixed(1)} bps round trip` : "—" },
    { label: "Slippage", value: a.slippageBps != null ? `${a.slippageBps.toFixed(1)} bps one way` : "—" },
    { label: "Fill model", value: a.fillModel ?? "—" },
    { label: "Capital base", value: a.capitalBase != null ? `$${a.capitalBase.toLocaleString("en-US")}` : "—" },
    { label: "Data provider", value: a.provider ?? "—" },
    { label: "Venue", value: a.venue ?? "—" },
    { label: "Timeframe", value: a.timeframe ?? "—" },
  ]
  return (
    <section>
      <SectionHeader eyebrow="Assumptions" title="Cost + fill model" />
      <div className="vr-card">
        <div className="vr-divide">
          {rows.map(r => (
            <div
              key={r.label}
              style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12, padding: "10px 16px" }}
            >
              <div className="t-eyebrow" style={{ fontSize: 9 }}>{r.label}</div>
              <div className="t-label" style={{ fontSize: 12, color: "var(--vr-cream)", textAlign: "right" }}>{r.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PaperMonitoringCard({ monitoring }: { monitoring: Passport["paper_monitoring"] }) {
  if (!monitoring) return null

  const status = (monitoring.status ?? "").toUpperCase()
  const tone =
    status === "COMPLETED" ? "var(--vr-up)"
    : status === "DEMOTION_RECOMMENDED" ? "var(--vr-down)"
    : status === "AT_RISK" ? "var(--vr-gold)"
    : "var(--vr-cream)"

  const rows: Array<{ label: string; value: string }> = [
    { label: "Window start", value: fmtDate(monitoring.window?.start) },
    {
      label: "Elapsed",
      value:
        monitoring.window?.elapsed_days != null && monitoring.window?.target_days != null
          ? `${monitoring.window.elapsed_days}/${monitoring.window.target_days} days`
          : "-",
    },
    {
      label: "Remaining",
      value: monitoring.window?.remaining_days != null ? `${monitoring.window.remaining_days} days` : "-",
    },
    {
      label: "Actual return",
      value: fmtPctSigned(monitoring.tracking?.actual_return_pct, 2),
    },
    {
      label: "Modeled return",
      value: fmtPctSigned(monitoring.tracking?.expected_return_pct, 2),
    },
    {
      label: "Tracking deviation",
      value: fmtPctSigned(monitoring.tracking?.tracking_deviation_pct, 2),
    },
    {
      label: "Demotion threshold",
      value:
        monitoring.tracking?.threshold_pct != null && monitoring.tracking?.window_days != null
          ? `${monitoring.tracking.threshold_pct.toFixed(2)}% over ${monitoring.tracking.window_days} days`
          : "-",
    },
    {
      label: "Monitoring source",
      value: monitoring.tracking?.source_detail ?? monitoring.tracking?.source_kind ?? "-",
    },
  ]

  return (
    <section>
      <SectionHeader eyebrow="Monitoring" title="Paper confirmation window" />
      <div className="vr-card">
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--vr-line)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="t-eyebrow" style={{ fontSize: 9, color: tone }}>
            {status || "ACTIVE"}
          </div>
          {monitoring.recommendation?.reason && (
            <div className="t-read" style={{ fontSize: 11, color: "var(--vr-cream-dim)", lineHeight: 1.45 }}>
              {monitoring.recommendation.reason}
            </div>
          )}
        </div>
        <div className="vr-divide">
          {rows.map(row => (
            <div key={row.label} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, padding: "10px 16px" }}>
              <div className="t-eyebrow" style={{ fontSize: 9 }}>{row.label}</div>
              <div className="t-label" style={{ fontSize: 12, color: "var(--vr-cream)", textAlign: "right" }}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TradeHistoryCard({ tradeHistory }: { tradeHistory: Passport["trade_history"] }) {
  const rows = tradeHistory?.rows ?? []
  if (!rows.length) return null

  const symbolCount = new Set(rows.map(row => row.symbol).filter(Boolean)).size

  return (
    <section>
      <SectionHeader eyebrow="Trade history" title="Raw ledger preview" />
      <div className="vr-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--vr-line)", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div className="t-label" style={{ fontSize: 11, color: "var(--vr-cream)" }}>
            {rows.length} rows · {symbolCount} symbols
          </div>
          <div className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)" }}>
            {tradeHistory?.cash_model?.toLowerCase().replace(/_/g, " ") ?? "residual cash"}
          </div>
          <div className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)" }}>
            {tradeHistory?.weight_basis?.toLowerCase().replace(/_/g, " ") ?? "post event total portfolio"}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr>
                {["Date", "Symbol", "Side", "Weight after", "Price", "Notional", "Realized P&L"].map(label => (
                  <th
                    key={label}
                    className="t-eyebrow"
                    style={{
                      fontSize: 9,
                      textAlign: "left",
                      padding: "10px 16px",
                      borderBottom: "1px solid var(--vr-line)",
                      color: "var(--vr-cream-faint)",
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 18).map((row, index) => (
                <tr key={`${row.event_id ?? "row"}-${index}`}>
                  <td className="t-label" style={{ fontSize: 12, color: "var(--vr-cream)", padding: "10px 16px", borderBottom: "1px solid var(--vr-line)" }}>
                    {fmtDate(row.date)}
                  </td>
                  <td className="t-label" style={{ fontSize: 12, color: "var(--vr-cream)", padding: "10px 16px", borderBottom: "1px solid var(--vr-line)" }}>
                    {row.symbol ?? "—"}
                  </td>
                  <td className="t-label" style={{ fontSize: 11, color: row.side === "BUY" ? "var(--vr-up)" : "var(--vr-down)", padding: "10px 16px", borderBottom: "1px solid var(--vr-line)" }}>
                    {row.side ?? "—"}
                  </td>
                  <td className="t-num" style={{ fontSize: 12, color: "var(--vr-cream)", padding: "10px 16px", borderBottom: "1px solid var(--vr-line)" }}>
                    {row.weight_after != null ? `${(row.weight_after * 100).toFixed(2)}%` : "—"}
                  </td>
                  <td className="t-num" style={{ fontSize: 12, color: "var(--vr-cream)", padding: "10px 16px", borderBottom: "1px solid var(--vr-line)" }}>
                    {row.price != null ? `$${row.price.toFixed(2)}` : "—"}
                  </td>
                  <td className="t-num" style={{ fontSize: 12, color: "var(--vr-cream)", padding: "10px 16px", borderBottom: "1px solid var(--vr-line)" }}>
                    {fmtUsd(row.notional)}
                  </td>
                  <td className="t-num" style={{ fontSize: 12, color: (row.pnl_realized ?? 0) >= 0 ? "var(--vr-up)" : "var(--vr-down)", padding: "10px 16px", borderBottom: "1px solid var(--vr-line)" }}>
                    {row.pnl_realized != null ? fmtUsd(row.pnl_realized) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 18 && (
          <div className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)", padding: "10px 16px" }}>
            Showing the first 18 ledger rows. This raw stream is the source for the fuller allocation and contribution views.
          </div>
        )}
      </div>
    </section>
  )
}

// â”€â”€â”€ Lifecycle timeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STAGE_ORDER = ["IDEATED", "SPEC", "BENCHED", "CONFIRMED", "PROMOTED", "PAPER", "LIVE_ELIGIBLE", "LIVE"]

function LifecycleTimeline({ lifecycle }: { lifecycle: Passport["lifecycle"] }) {
  const events = lifecycle?.events ?? []
  if (!events.length) return null
  const sorted = [...events].sort((a, b) => {
    const ia = STAGE_ORDER.indexOf((a.stage ?? "").toUpperCase())
    const ib = STAGE_ORDER.indexOf((b.stage ?? "").toUpperCase())
    return ia - ib
  })
  return (
    <section>
      <SectionHeader eyebrow="Lifecycle" title="Stage timeline" />
      <div className="vr-card" style={{ padding: "8px 0" }}>
        <div className="vr-divide">
          {sorted.map((ev, i) => {
            const status = (ev.status ?? "").toUpperCase()
            const color =
              status === "ACTIVE" ? "var(--vr-gold)"
              : status === "DONE" ? "var(--vr-up)"
              : status === "BLOCKED" ? "var(--vr-down)"
              : "var(--vr-cream-faint)"
            return (
              <div key={i} style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <div className="t-eyebrow" style={{ fontSize: 9, color, letterSpacing: "0.12em" }}>
                    {ev.stage ?? "stage"}
                  </div>
                  <div className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)", marginLeft: "auto" }}>
                    {fmtDate(ev.at)}
                  </div>
                </div>
                {ev.title && (
                  <div className="t-label" style={{ fontSize: 12, color: "var(--vr-cream)", marginTop: 6, marginLeft: 17 }}>
                    {ev.title}
                  </div>
                )}
                {ev.detail && (
                  <div className="t-read" style={{ fontSize: 11, color: "var(--vr-cream-mute)", marginTop: 4, marginLeft: 17, lineHeight: 1.45 }}>
                    {ev.detail}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function ViresPassportView({ passport }: { passport: Passport | null }) {
  if (!passport) {
    return (
      <div className="vr-screen vires-screen-pad" style={{ maxWidth: 860, margin: "0 auto" }}>
        <Link href="/vires/bench" className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)", textDecoration: "none" }}>
          â† Back to Bench
        </Link>
        <div className="vr-card" style={{ padding: 24, marginTop: 14 }}>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>Passport not found</div>
          <div className="t-label">
            This strategy has no published passport yet. Check the Bench list for active runs.
          </div>
        </div>
      </div>
    )
  }

  const sleeve = SLEEVE_LC[(passport.sleeve ?? "STOCKS").toUpperCase()] ?? "stocks"
  const m = passport.metrics ?? {}

  const metricCards: Array<{
    label: string
    term?: string
    value: string
    sub?: string
    color?: string
  }> = [
    {
      label: "Total Return",
      term: "TotalReturn",
      value: m.totalReturn != null ? `${m.totalReturn.toFixed(1)}%` : "—",
      sub: m.benchReturn != null ? `bench ${m.benchReturn.toFixed(1)}%` : undefined,
      color: "var(--vr-up)",
    },
    {
      label: "vs Bench",
      term: "VsBench",
      value: m.excess != null ? fmtPctSigned(m.excess, 1) : "—",
      color: m.excess != null && m.excess >= 0 ? "var(--vr-up)" : "var(--vr-down)",
    },
    {
      label: "Sharpe",
      term: "Sharpe",
      value: fmtNum(m.sharpe, 2),
      sub: m.benchSharpe != null ? `bench ${m.benchSharpe.toFixed(2)}` : undefined,
    },
    {
      label: "Calmar",
      term: "Calmar",
      value: fmtNum(m.calmar, 2),
      sub: m.benchCalmar != null ? `bench ${m.benchCalmar.toFixed(2)}` : undefined,
      color: "var(--vr-gold)",
    },
    {
      label: "Max DD",
      term: "MaxDD",
      value: m.maxDD != null ? `${m.maxDD.toFixed(2)}%` : "—",
      sub: m.benchMaxDD != null ? `bench ${m.benchMaxDD.toFixed(2)}%` : undefined,
      color: "var(--vr-down)",
    },
    {
      label: "Win Rate",
      term: "WinRate",
      value: m.winRate != null ? `${m.winRate.toFixed(1)}%` : "—",
    },
    {
      label: "Profit Factor",
      term: "ProfitFactor",
      value: fmtNum(m.profitFactor, 2),
    },
    {
      label: "Trades",
      value: m.trades != null ? m.trades.toLocaleString("en-US") : "—",
      sub: m.days != null ? `${m.days} days` : undefined,
    },
  ]

  return (
    <div
      className="vr-screen vires-screen-pad"
      style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}
    >
      <Link
        href="/vires/bench"
        className="t-eyebrow"
        style={{
          fontSize: 9,
          color: "var(--vr-cream-mute)",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
        }}
      >
        â† Back to Bench
      </Link>

      {/* Identity */}
      <div style={{ padding: "4px 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <SleeveChip sleeve={sleeve} />
          <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-faint)" }}>
            · Strategy Passport
          </span>
        </div>
        <div className="t-h1" style={{ fontSize: 30, lineHeight: 1.1, letterSpacing: "-0.01em" }}>
          {passport.name ?? "Strategy"}
        </div>
        {passport.variant && (
          <div className="t-label" style={{ fontSize: 12, color: "var(--vr-cream-mute)", marginTop: 6, letterSpacing: "0.06em" }}>
            {passport.variant}
          </div>
        )}
        {passport.summary && (
          <div className="t-read" style={{ fontSize: 13, color: "var(--vr-cream-dim)", marginTop: 10, lineHeight: 1.55 }}>
            {passport.summary}
          </div>
        )}
        <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
          <div>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Benchmark</div>
            <div className="t-ticker" style={{ fontSize: 12, color: "var(--vr-cream)", textTransform: "none" }}>
              {passport.benchmark ?? "—"}
            </div>
          </div>
          <div style={{ borderLeft: "1px solid var(--vr-line)", paddingLeft: 16 }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Window</div>
            <div className="t-num" style={{ fontSize: 12, color: "var(--vr-cream)" }}>
              {m.days != null ? `${m.days} days` : "—"}
            </div>
          </div>
          <div style={{ borderLeft: "1px solid var(--vr-line)", paddingLeft: 16 }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Trades</div>
            <div className="t-num" style={{ fontSize: 12, color: "var(--vr-cream)" }}>
              {m.trades != null ? m.trades.toLocaleString("en-US") : "—"}
            </div>
          </div>
          {passport.manifest?.cadence && (
            <div style={{ borderLeft: "1px solid var(--vr-line)", paddingLeft: 16 }}>
              <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Cadence</div>
              <div className="t-num" style={{ fontSize: 12, color: "var(--vr-cream)" }}>
                {passport.manifest.cadence.toLowerCase()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Verdict */}
      <VerdictStrip passport={passport} />

      {/* Metrics grid */}
      <section>
        <SectionHeader eyebrow="Evidence" title="Risk-adjusted performance" />
        <div className="vr-card">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 0,
            }}
          >
            {metricCards.map((card, i) => (
              <div
                key={card.label}
                style={{
                  padding: "14px 16px",
                  borderLeft: i % 4 === 0 ? "none" : "1px solid var(--vr-line)",
                  borderTop: i >= 4 ? "1px solid var(--vr-line)" : "none",
                }}
              >
                <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 6, display: "flex", alignItems: "center" }}>
                  {card.label}
                  {card.term && <InfoPop term={card.term} size={10} />}
                </div>
                <div
                  className="t-num"
                  style={{ fontSize: 18, color: card.color ?? "var(--vr-cream)", fontWeight: 500, lineHeight: 1 }}
                >
                  {card.value}
                </div>
                {card.sub && (
                  <div className="t-num" style={{ fontSize: 10, color: "var(--vr-cream-mute)", marginTop: 6 }}>
                    {card.sub}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Era robustness */}
      <EraStripe eras={passport.eras ?? []} minEraSharpe={passport.minEraSharpe} />

      {/* Gates */}
      <GatesList gates={passport.gates ?? []} />

      {/* Parameter stability — plateau heatmap when sweep data exists,
          honest empty state when the passport is a frozen reference. */}
      <ParameterStabilityCard plateau={passport.plateau_primer} />

      {/* Assumptions */}
      <AssumptionsCard assumptions={passport.assumptions} />

      {/* Paper monitoring */}
      <PaperMonitoringCard monitoring={passport.paper_monitoring} />

      {/* Raw trade ledger */}
      <TradeHistoryCard tradeHistory={passport.trade_history} />

      {/* Lifecycle */}
      <LifecycleTimeline lifecycle={passport.lifecycle} />

      {/* Suppress unused-import warning until fmtPct is used downstream. */}
      {(false as boolean) && <span>{fmtPct(0)}</span>}
    </div>
  )
}
