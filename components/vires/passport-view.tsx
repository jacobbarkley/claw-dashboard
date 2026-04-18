"use client"

// Strategy Passport — drill-in view opened from the Bench Promoted row.
// Renders the passport payload Codex's lib/vires-bench.ts emits
// (buildStockPassport / buildCryptoManagedPassport / etc.) into a full
// editorial detail page: identity + verdict + era robustness + promotion
// gates + assumptions + lifecycle timeline.

import Link from "next/link"
import { InfoPop, SectionHeader, SleeveChip, StatusPill, fmtPct, toneColor, toneOf, type Sleeve } from "./shared"

// ─── Types ─────────────────────────────────────────────────────────────────
// Matches the shape lib/vires-bench.ts returns for a passport entry.

interface PassportEra {
  label?: string | null
  sharpe?: number | null
  ret?: number | null
  pass?: boolean | null
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
  shadowDays?: number | null
  shadowTarget?: number | null
  runtimeContract?: string | null
  cadence?: string | null
  broker?: { broker_adapter?: string; broker_environment?: string } | null
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
}

// ─── Helpers ───────────────────────────────────────────────────────────────

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

// ─── Verdict strip ─────────────────────────────────────────────────────────

function VerdictStrip({ passport }: { passport: Passport }) {
  const m = passport.manifest
  const stage = (m?.stage ?? "").toUpperCase()
  const eligibility = (m?.eligibility ?? "").toUpperCase()
  const provenance = (m?.provenance ?? "").toUpperCase()

  const { eyebrow, line, accent } = (() => {
    if (stage === "PROMOTED") {
      return {
        eyebrow: "Verdict",
        line: eligibility === "LIVE" ? "Promoted · Earning live capital" : "Promoted · Paper shadow window",
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
            {eligibility === "LIVE" && <span style={{ color: "var(--vr-up)" }}>● LIVE</span>}
            {eligibility === "PAPER_SHADOW" && (
              <span style={{ color: "var(--vr-gold)" }}>
                ◐ PAPER
                {m?.shadowDays != null && m?.shadowTarget != null && ` · day ${m.shadowDays}/${m.shadowTarget}`}
              </span>
            )}
            {(eligibility === "BENCH_ONLY" || !eligibility) && (
              <span style={{ color: "var(--vr-cream-mute)" }}>○ BENCH ONLY</span>
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
            {provenanceWarn && "⚠ "}
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

// ─── Era robustness graph ──────────────────────────────────────────────────

function EraStripe({ eras, minEraSharpe }: { eras: PassportEra[]; minEraSharpe: number | null | undefined }) {
  if (!eras.length) return null
  const maxSharpe = Math.max(1, ...eras.map(e => e.sharpe ?? 0))
  const floor = minEraSharpe ?? 0
  const passing = eras.filter(e => e.sharpe != null && e.sharpe >= floor).length

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
          {passing}/{eras.length} above floor
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
          const sharpe = e.sharpe ?? 0
          const h = Math.max(3, (sharpe / maxSharpe) * 84)
          const tone = e.pass ? "var(--vr-gold)" : "var(--vr-down)"
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: "100%",
                  height: h,
                  background: tone,
                  opacity: e.pass ? 0.85 : 0.55,
                  borderRadius: 1,
                }}
              />
            </div>
          )
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${eras.length}, 1fr)`, gap: 6, marginTop: 10 }}>
        {eras.map((e, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div className="t-num" style={{ fontSize: 11, color: "var(--vr-cream)", fontWeight: 500 }}>
              {fmtNum(e.sharpe, 2)}
            </div>
            <div className="t-label" style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginTop: 2 }}>
              {e.label ?? `era ${i + 1}`}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Gates list ────────────────────────────────────────────────────────────

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

// ─── Assumptions ───────────────────────────────────────────────────────────

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

// ─── Lifecycle timeline ────────────────────────────────────────────────────

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

// ─── Page ──────────────────────────────────────────────────────────────────

export function ViresPassportView({ passport }: { passport: Passport | null }) {
  if (!passport) {
    return (
      <div className="vr-screen vires-screen-pad" style={{ maxWidth: 860, margin: "0 auto" }}>
        <Link href="/vires/bench" className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)", textDecoration: "none" }}>
          ← Back to Bench
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
        ← Back to Bench
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

      {/* Assumptions */}
      <AssumptionsCard assumptions={passport.assumptions} />

      {/* Lifecycle */}
      <LifecycleTimeline lifecycle={passport.lifecycle} />

      {/* Suppress unused-import warning until fmtPct is used downstream. */}
      {(false as boolean) && <span>{fmtPct(0)}</span>}
    </div>
  )
}
