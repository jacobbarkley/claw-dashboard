"use client"

// Per-sleeve views (Stocks / Options / Crypto) for the Vires Trading section.
// Each sleeve renders the same skeleton:
//   SleeveSummary  →  ActiveStrategy  →  OpenPositions  →  <sleeve detail>  →  AllocationHistory
// where <sleeve detail> is Strategy Universe (stocks/options) or
// CryptoTrackedAssets (crypto). Per Jacob's 2026-04-20 walkthrough:
// crypto's earlier sibling cards (TSMOM, ExposureLadder, Architecture)
// folded into ActiveStrategy's expanded body so strategy-specific state
// stays attached to the strategy.

import { useState } from "react"
import { Delta, StatusPill, fmtCurrency, fmtPct, toneColor, toneOf, type Sleeve } from "./shared"
import type { ViresTradingData } from "./trading-home"
import { useSharedTimeframe, TimeframeDropdown, TIMEFRAMES } from "./timeframe-context"
import { ActiveStrategy, type ActiveStrategyOperator } from "./active-strategy"
import { AllocationHistory, type AllocationHistoryOperator } from "./allocation-history"

interface ViresPosition {
  symbol: string
  qty: number
  entry_price: number
  current_price: number
  market_value: number
  unrealized_pnl: number
  unrealized_pct: number | null
  change_today_pct: number
  asset_type?: string
}

interface ViresStrategyUniverse {
  symbols: Array<{
    symbol: string
    current_price: number | null
    change_pct: number | null
    in_position: boolean
    position_qty: number
    strategy_member?: boolean
    return_20d_pct?: number | null  // Codex primer ask — optional until shipped
  }>
}

interface StrategyRules {
  stop_loss_pct: number | null
  target_pct: number | null
}

interface CryptoSignalTSMOM {
  status?: string | null
  promoted?: boolean | null
  bar?: string | null
  cadence?: string | null
  direction?: string | null
  last_cross_at?: string | null
  signal_strength_pct?: number | null
  signal_strength_label?: string | null
  note?: string | null
}

interface CryptoManagedExposureSignal {
  status?: string | null
  title?: string | null
  current_state?: string | null
  current_exposure_pct?: number | null
  target_notional_usd?: number | null
  action?: string | null
  last_report_status?: string | null
  overlay_status?: string | null
  note?: string | null
  performance_summary?: {
    total_return_pct?: number | null
    max_drawdown_pct?: number | null
    calmar_ratio?: number | null
    excess_return_pct?: number | null
  } | null
  ladder?: Array<{
    state?: string | null
    label?: string | null
    exposure_pct?: number | null
    note?: string | null
    active?: boolean | null
  }>
}

interface CryptoTrackedAssetSignal {
  symbol?: string | null
  lane?: string | null
  tier_label?: string | null
  target_exposure_pct?: number | null
  state?: string | null
  status?: string | null
}

interface CryptoSignalsBlock {
  tsmom?: CryptoSignalTSMOM | null
  managed_exposure?: CryptoManagedExposureSignal | null
  tracked_assets?: CryptoTrackedAssetSignal[]
}

interface ViresRegime {
  vix_level?: number | null
  vix_regime?: string | null
  hmm_regime?: string | null
  populated?: boolean | null
}

interface CryptoSignalsOperator {
  crypto_signals?: CryptoSignalsBlock | null
  regime?: ViresRegime | null
}

interface SleeveEquityHistoryPoint {
  date: string
  market_value: number
}

interface SleeveEquityHistoryPayload {
  status?: "available" | "unavailable" | string | null
  source?: string | null
  sleeveLabel?: string | null
  benchmark_symbol?: string | null
  reason?: string | null
  series?: SleeveEquityHistoryPoint[] | null
}

type ViresTradingDataWithSleeveHistory = ViresTradingData & {
  sleeve_equity_history?: Record<string, SleeveEquityHistoryPayload | null | undefined>
}

// ─── Sleeve hero ────────────────────────────────────────────────────────────

function SleeveSummary({ sleeve, positions, equityCurve, sleeveHistory }: {
  sleeve: Sleeve
  positions: ViresPosition[]
  equityCurve?: Array<{ date: string; equity: number }>
  sleeveHistory?: SleeveEquityHistoryPayload | null
}) {
  const cfg = {
    stocks:  { c: "var(--vr-sleeve-stocks)",  title: "Stocks",  copy: "Equity sleeve · regime-aware momentum" },
    options: { c: "var(--vr-sleeve-options)", title: "Options", copy: "Premium sleeve · awaiting promotion" },
    crypto:  { c: "var(--vr-sleeve-crypto)",  title: "Crypto",  copy: "Digital asset sleeve · two-layer" },
  }[sleeve]

  const total = positions.reduce((s, p) => s + (p.market_value ?? 0), 0)
  // Today's $ change: per-position market_value × pct/(100+pct) so the sleeve
  // total reads cleanly even when sizes vary across symbols.
  const todayUsd = positions.reduce((s, p) => {
    const pct = p.change_today_pct ?? 0
    if (!pct) return s
    return s + (p.market_value ?? 0) * (pct / (100 + pct))
  }, 0)
  const todayPct = total > 0 ? (todayUsd / (total - todayUsd)) * 100 : null
  const upnl = positions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0)

  return (
    <div className="vr-card-hero" style={{ padding: 22, borderColor: `${cfg.c}33` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 5, height: 5, background: cfg.c, display: "inline-block" }} />
        <span className="t-eyebrow" style={{ color: cfg.c }}>{cfg.title}</span>
      </div>
      <div className="t-display t-num" style={{ fontSize: 36 }}>
        {total === 0 ? "—" : fmtCurrency(total)}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        {total > 0 ? (
          <>
            {todayPct != null && <Delta value={todayPct} size="12px" />}
            <span className="t-label" style={{ fontSize: 11 }}>today</span>
            <span style={{ color: "var(--vr-cream-faint)" }}>·</span>
            <span className="t-num" style={{ fontSize: 12, color: toneColor(toneOf(upnl)) }}>
              {fmtCurrency(upnl, { sign: true })}
            </span>
            <span className="t-label" style={{ fontSize: 11 }}>unrealized</span>
          </>
        ) : (
          <span className="t-label">{cfg.copy}</span>
        )}
      </div>
      <SleeveSparkline
        sleeve={sleeve}
        currentValue={total}
        color={cfg.c}
        equityCurve={equityCurve ?? []}
        sleeveHistory={sleeveHistory ?? null}
      />
    </div>
  )
}

// ─── Sleeve sparkline ──────────────────────────────────────────────────────
// Mini cumulative curve rendered inside the SleeveSummary hero. Reads real
// `sleeve_equity_history` marks from the feed (daily granularity from the
// position_book snapshots Codex ships) and anchors the latest point to the
// live sleeve hero value. When history is absent, the card renders an
// honest placeholder instead of synthesizing a curve.
//
// Visual density (Jacob's 2026-04-20 feedback): the feed ships daily marks
// but the sparkline used to render denser / hourly-looking movement. We
// densify by interpolating N sub-points BETWEEN real daily anchors, with
// tiny damped seeded noise. The daily anchors themselves stay exactly on
// the real values (no synthesis of the datapoints operators see in the
// hero or in Allocation History) — the noise lives only in the visual
// path between anchors and fades to zero at each anchor. Deterministic
// per-sleeve so the same data always renders identically.
//
// Two interactive controls:
//   - Timeframe pills (1D / 1W / 1M / 3M / 1Y / ALL) — shared across every
//     chart on /vires via useSharedTimeframe; pick on any card, all chart
//     windows agree.
//   - RET / MV toggle — local per-card. RET shows cumulative return % from
//     the window start (zero line drawn); MV shows dollar market value.

const SLEEVE_DENSIFY_SEED: Record<Sleeve, number> = {
  stocks:  7919,
  options: 3407,
  crypto:  4421,
}

// Target total visual points for the sparkline. ~200 renders densely on the
// 520×58 sparkline without chewing unnecessary CPU on the path.
const SPARKLINE_DENSITY_TARGET = 200

// Mulberry32 — same deterministic PRNG used by the home EquityChart's
// `upsampleIntraday`. Identical seed → identical sequence, so the sparkline
// path is stable across renders.
function makeSparklineRand(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6D2B79F5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// Mirrors the noise profile of the home EquityChart's `upsampleIntraday`:
// envelope-damped dual-random wiggle (`n1 * 0.8 + n2 * 0.4`) + a mild
// intraday U-shape. Amplitude is scaled to the visible value range of the
// sparkline so the jaggedness reads similarly on a narrow 58-px sparkline
// as it does on the big equity chart. Real anchors stay exactly on their
// real values — noise peaks mid-pair and fades to zero at each anchor.
function densifySeries(anchors: number[], sleeve: Sleeve): number[] {
  if (anchors.length < 2) return anchors
  const pairCount = anchors.length - 1
  const subPerPair = Math.max(0, Math.floor((SPARKLINE_DENSITY_TARGET - anchors.length) / pairCount))
  if (subPerPair === 0) return anchors

  const range = Math.max(...anchors) - Math.min(...anchors)
  const rand = makeSparklineRand(SLEEVE_DENSIFY_SEED[sleeve])

  // Honest render when the sleeve genuinely hasn't moved — densify
  // visually with straight interpolation, no synthesized wiggle.
  const flat = range === 0
  const sigma = flat ? 0 : range * 0.06

  const out: number[] = [anchors[0]]
  for (let i = 0; i < pairCount; i++) {
    const a = anchors[i]
    const b = anchors[i + 1]
    for (let j = 1; j <= subPerPair; j++) {
      const t = j / (subPerPair + 1)
      const base = a + (b - a) * t
      if (flat) {
        out.push(base)
        continue
      }
      const env = Math.sin(Math.PI * t)
      const n1 = (rand() - 0.5) * 2
      const n2 = (rand() - 0.5) * 2
      const noise = (n1 * 0.8 + n2 * 0.4) * sigma * env
      const uShape = Math.sin(Math.PI * 2 * t - 0.3) * sigma * 0.35 * env
      out.push(base + noise + uShape)
    }
    out.push(b)
  }
  return out
}

function SleeveSparkline({ sleeve, currentValue, color, equityCurve, sleeveHistory }: {
  sleeve: Sleeve
  currentValue: number
  color: string
  equityCurve: Array<{ date: string; equity: number }>
  sleeveHistory?: SleeveEquityHistoryPayload | null
}) {
  const W = 520
  const H = 58
  const { tf } = useSharedTimeframe()
  const [mode, setMode] = useState<"RET" | "MV">("MV")
  const tfMeta = TIMEFRAMES.find(t => t.k === tf) ?? TIMEFRAMES[1]
  const rawHistory =
    sleeveHistory?.status === "available" && Array.isArray(sleeveHistory.series)
      ? sleeveHistory.series
          .filter((point): point is SleeveEquityHistoryPoint =>
            !!point && typeof point.date === "string" && typeof point.market_value === "number"
          )
          .map(point => ({ ...point }))
      : []
  const hasRealHistory = rawHistory.length > 0

  if (!hasRealHistory) {
    const copy = currentValue > 0 ? "LIVE VALUE ONLY · HISTORY PENDING" : "NO DATA · AWAITING PROMOTION"
    const midY = H / 2
    return (
      <div style={{ marginTop: 18, position: "relative" }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
          <line x1="0" y1={midY} x2={W} y2={midY} stroke={color} strokeWidth="1" strokeDasharray="2 4" opacity="0.4" />
        </svg>
        <div
          className="t-eyebrow"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: 9,
            color: "var(--vr-cream-mute)",
            background: "var(--vr-ink-raised)",
            padding: "2px 8px",
            borderRadius: 2,
            letterSpacing: "0.16em",
          }}
        >
          {copy}
        </div>
      </div>
    )
  }

  if (hasRealHistory) {
    if (rawHistory[rawHistory.length - 1].market_value !== currentValue) {
      rawHistory[rawHistory.length - 1] = {
        ...rawHistory[rawHistory.length - 1],
        market_value: currentValue,
      }
    }
    if (rawHistory.length === 1) {
      rawHistory.push({ ...rawHistory[0] })
    }
  }

  if (!hasRealHistory && equityCurve.length < 2) return null

  const realWindowBase =
    tfMeta.days === Infinity
      ? rawHistory
      : rawHistory.slice(-Math.max(2, Math.min(rawHistory.length, tfMeta.days + 1)))
  const realWindow =
    mode === "RET"
      ? (() => {
          const firstPositive = realWindowBase.findIndex(point => point.market_value > 0)
          if (firstPositive > 0) return realWindowBase.slice(firstPositive)
          return realWindowBase
        })()
      : realWindowBase
  const normalizedRealWindow =
    realWindow.length === 1
      ? [realWindow[0], realWindow[0]]
      : realWindow

  const realValues = normalizedRealWindow.map(point => point.market_value)
  const firstValue = realValues[0] > 0 ? realValues[0] : realValues.find(value => value > 0) ?? realValues[0]
  const rawSeries =
    mode === "MV"
      ? realValues
      : realValues.map(value => (firstValue > 0 ? (value / firstValue - 1) * 100 : 0))

  // Densify the visual path between real anchors so the sparkline reads as
  // hourly-movement dense instead of a few straight-line segments between
  // daily marks. Anchors stay exactly on their real values — noise lives
  // only between them and fades to zero at each anchor.
  const series = densifySeries(rawSeries, sleeve)

  const min = Math.min(...series)
  const max = Math.max(...series)
  const pad = (max - min) * 0.1 || 1
  const minP = min - pad
  const maxP = max + pad
  const range = maxP - minP || 1

  const pts = series.map((v, i) => {
    const x = (i / Math.max(1, series.length - 1)) * W
    const y = H - ((v - minP) / range) * H
    return [x, y] as const
  })
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ")
  const fd = `${d} L${W},${H} L0,${H} Z`
  const gradId = `vr-sleeve-${sleeve}-grad`

  // Zero line (only for RET when zero is within the visible range).
  const zeroInRange = mode === "RET" && 0 >= minP && 0 <= maxP
  const zeroY = zeroInRange ? H - ((0 - minP) / range) * H : null

  const lastValue = series[series.length - 1]
  const firstPositiveValue = mode === "MV" ? series.find(value => value > 0) ?? series[0] : series[0]
  const periodPct = mode === "MV" && firstPositiveValue > 0
    ? ((lastValue - firstPositiveValue) / firstPositiveValue) * 100
    : lastValue

  return (
    <div style={{ marginTop: 18 }}>
      {/* Controls row: period delta + timeframe pills + RET/MV toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div className="t-num" style={{ fontSize: 11, color: toneColor(toneOf(periodPct)), fontWeight: 500 }}>
          {periodPct >= 0 ? "+" : ""}{periodPct.toFixed(2)}%
          <span
            className="t-label"
            style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginLeft: 5, letterSpacing: "0.12em", textTransform: "uppercase" }}
          >
            {tf} {mode === "RET" ? "return" : "value"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <TimeframeDropdown />
          <RetMvToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      {/* The line + area */}
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {zeroY != null && (
          <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--vr-cream-faint)" strokeWidth="0.6" strokeDasharray="2 3" />
        )}
        <path d={fd} fill={`url(#${gradId})`} />
        <path d={d} stroke={color} strokeWidth="1.1" fill="none" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function RetMvToggle({ mode, onChange }: { mode: "RET" | "MV"; onChange: (m: "RET" | "MV") => void }) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 2,
        gap: 0,
        background: "rgba(241,236,224,0.03)",
        border: "1px solid var(--vr-line)",
        borderRadius: 3,
      }}
    >
      {(["RET", "MV"] as const).map(m => {
        const active = m === mode
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className="t-eyebrow"
            style={{
              padding: "3px 8px",
              border: "none",
              borderRadius: 2,
              cursor: "pointer",
              background: active ? "var(--vr-cream)" : "transparent",
              color: active ? "var(--vr-ink)" : "var(--vr-cream-mute)",
              fontWeight: 600,
              fontSize: 9,
            }}
            aria-label={m === "RET" ? "Show cumulative return" : "Show market value"}
          >
            {m}
          </button>
        )
      })}
    </div>
  )
}

// ─── Position row ───────────────────────────────────────────────────────────

function PositionRow({ p }: { p: ViresPosition }) {
  const tone = toneOf(p.change_today_pct)
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: 12,
        padding: "14px 16px",
        alignItems: "center",
      }}
    >
      <div>
        <div className="t-ticker" style={{ fontSize: 13 }}>{p.symbol}</div>
        <div className="t-label" style={{ fontSize: 11, marginTop: 2 }}>
          {p.qty.toLocaleString("en-US", { maximumFractionDigits: 8 })} @ {fmtCurrency(p.entry_price)}
        </div>
      </div>
      <div className="t-num" style={{ fontSize: 13, color: "var(--vr-cream)", textAlign: "right" }}>
        {fmtCurrency(p.market_value)}
      </div>
      <div style={{ textAlign: "right", minWidth: 76 }}>
        <div className="t-num" style={{ fontSize: 12, color: toneColor(tone) }}>
          {p.change_today_pct >= 0 ? "+" : ""}{fmtPct(p.change_today_pct)}
        </div>
        <div className="t-num" style={{ fontSize: 10, color: toneColor(toneOf(p.unrealized_pnl)), marginTop: 2 }}>
          {fmtCurrency(p.unrealized_pnl, { sign: true })}
        </div>
      </div>
    </div>
  )
}

// ─── Open Positions card ────────────────────────────────────────────────────

function OpenPositions({ positions }: { positions: ViresPosition[] }) {
  if (positions.length === 0) {
    return (
      <div className="vr-card" style={{ padding: "20px 18px" }}>
        <div className="t-eyebrow" style={{ marginBottom: 6 }}>Open Positions</div>
        <div className="t-h4" style={{ color: "var(--vr-cream-dim)" }}>None</div>
        <div className="t-label" style={{ fontSize: 11, marginTop: 4 }}>
          Sleeve idle pending strategy promotion from Bench.
        </div>
      </div>
    )
  }
  return (
    <div className="vr-card">
      <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="t-eyebrow">Open Positions</div>
        <span className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)" }}>
          {positions.length} active
        </span>
      </div>
      <div className="vr-divide" style={{ borderTop: "1px solid var(--vr-line)" }}>
        {positions.map(p => <PositionRow key={p.symbol} p={p} />)}
      </div>
    </div>
  )
}

// ─── Strategy Universe panel (Stocks) ───────────────────────────────────────

function StrategyUniverse({ universe, positions, rules }: {
  universe: ViresStrategyUniverse | null
  positions: ViresPosition[]
  rules: StrategyRules
}) {
  if (!universe || universe.symbols.length === 0) {
    return (
      <div className="vr-card" style={{ padding: 18 }}>
        <div className="t-eyebrow" style={{ marginBottom: 6 }}>Strategy Universe</div>
        <div className="t-h4" style={{ color: "var(--vr-cream-dim)" }}>No symbols yet</div>
        <div className="t-label" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
          The active strategy&apos;s tracked universe appears here once a strategy is promoted to this sleeve.
        </div>
      </div>
    )
  }
  const sorted = [...universe.symbols].sort((a, b) => {
    if (a.in_position !== b.in_position) return a.in_position ? -1 : 1
    return (b.change_pct ?? 0) - (a.change_pct ?? 0)
  })
  const heldCount = sorted.filter(s => s.in_position).length
  const positionBySymbol = new Map(positions.map(p => [p.symbol, p]))

  return (
    <div className="vr-card">
      <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="t-eyebrow">Strategy Universe</div>
        <span className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)" }}>
          {heldCount} held · {sorted.length} tracked
        </span>
      </div>
      <div className="vr-divide" style={{ borderTop: "1px solid var(--vr-line)" }}>
        {sorted.map(s => {
          const pos = positionBySymbol.get(s.symbol)
          const held = s.in_position && !!pos
          const strategyMember = s.strategy_member !== false
          const managedByStrategy = held && strategyMember
          const tone = toneOf(s.change_pct)
          // For held rows: show stop / target prices derived from entry
          // price and the active strategy's rule set. For non-held rows:
          // show last price + today's change (+ 20d return when Codex
          // ships the field — empty until then).
          const stopPrice = managedByStrategy && rules.stop_loss_pct != null && pos!.entry_price > 0
            ? pos!.entry_price * (1 - rules.stop_loss_pct / 100)
            : null
          const targetPrice = managedByStrategy && rules.target_pct != null && pos!.entry_price > 0
            ? pos!.entry_price * (1 + rules.target_pct / 100)
            : null

          return (
            <div
              key={s.symbol}
              style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span className="t-ticker" style={{ fontSize: 13 }}>{s.symbol}</span>
                  {held ? (
                    <span
                      className="t-eyebrow"
                      style={{
                        fontSize: 9,
                        padding: "2px 6px",
                        background: "var(--vr-up-soft)",
                        color: "var(--vr-up)",
                        border: "1px solid var(--vr-up)22",
                        borderRadius: 2,
                      }}
                    >
                      {managedByStrategy ? "Momentum long" : "Held outside active sleeve"} · {s.position_qty.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                    </span>
                  ) : (
                    <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
                      Universe
                    </span>
                  )}
                </div>
                <div className="t-label" style={{ fontSize: 11, lineHeight: 1.45 }}>
                  {held
                    ? managedByStrategy
                      ? `Entry $${pos!.entry_price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · qty ${s.position_qty}`
                      : "Held in broker account but not part of the active stock sleeve."
                    : s.return_20d_pct != null
                      ? `20-day return ${s.return_20d_pct >= 0 ? "+" : ""}${s.return_20d_pct.toFixed(2)}%`
                      : "Monitored · 20-day return pending feed"}
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 88 }}>
                {held && stopPrice != null && targetPrice != null ? (
                  <>
                    <div className="t-num" style={{ fontSize: 10, color: "var(--vr-down)" }}>
                      SL {fmtCurrency(stopPrice)}
                    </div>
                    <div className="t-num" style={{ fontSize: 10, color: "var(--vr-up)", marginTop: 2 }}>
                      TP {fmtCurrency(targetPrice)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="t-num" style={{ fontSize: 11, color: "var(--vr-cream)" }}>
                      {s.current_price != null ? fmtCurrency(s.current_price) : "—"}
                    </div>
                    <div className="t-num" style={{ fontSize: 10, color: toneColor(tone), marginTop: 2 }}>
                      {s.change_pct != null ? `${s.change_pct >= 0 ? "+" : ""}${fmtPct(s.change_pct)}` : ""}
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tracked Assets · market intent surface ─────────────────────────────────
// Per the 2026-04-19 design handoff package: "what is the strategy about to
// do for the assets we care about." Reads tracked_assets[] for per-row
// identity + lane + tier state, managed_exposure for the lane-level ladder +
// action + notional, tsmom for the (currently research-only) tactical
// overlay, and positions[] for current_price / change_today_pct (positions-
// side fields are read for price ONLY — qty / market_value / unrealized P&L
// stay in the Open Positions card, never here).
//
// Replaces the earlier "CryptoTrackedAssets" scaffold which conflated
// market intent with positions readout — see DIVERGENCE_LOG.md 2026-04-19.

function titleizeEnum(s: string | null | undefined): string {
  if (!s) return ""
  return s.toLowerCase().split(/[_\s]+/).map(w => (w[0] ?? "").toUpperCase() + w.slice(1)).join(" ")
}

const TIER_TONE: Record<string, { color: string; soft: string; label: string }> = {
  RISK_ON:    { color: "var(--vr-up)",   soft: "var(--vr-up-soft)",          label: "Risk On" },
  ACCUMULATE: { color: "var(--vr-warn)", soft: "rgba(201, 169, 106, 0.10)",  label: "Accumulate" },
  RISK_OFF:   { color: "var(--vr-down)", soft: "var(--vr-down-soft)",        label: "Risk Off" },
}

// Header is a single-line eyebrow + count, matching the pattern of
// OPEN POSITIONS and ALLOCATION HISTORY. Per Jacob's 2026-04-20
// feedback — the prior multi-line title/subtitle + VIX/HMM regime
// chip was noisy and duplicative of the Market Regime card on home.
function TrackedAssetsHeader({ count }: { count: number }) {
  return (
    <div style={{
      padding: "14px 16px 10px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
    }}>
      <div className="t-eyebrow">Tracked Assets</div>
      <span className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)" }}>
        {count} tracked
      </span>
    </div>
  )
}


function TrackedAssetRow({
  asset,
  managedExposure,
  position,
  isFirst,
}: {
  asset: CryptoTrackedAssetSignal
  managedExposure?: CryptoManagedExposureSignal | null
  position?: ViresPosition
  isFirst: boolean
}) {
  // Per Jacob's 2026-04-19 feedback: clean watchlist row only —
  // symbol + lane + tier badge + price + change. Ladder, action verb,
  // and tactical overlay live in CryptoExposure / CryptoTSMOM cards;
  // duplicating them here was overkill. See DIVERGENCE_LOG.md.
  const symbol = asset.symbol ?? "—"
  const lane = asset.lane ?? null
  const state = asset.state ?? managedExposure?.current_state ?? null
  const tone = state && TIER_TONE[state] ? TIER_TONE[state] : null
  const stateLabel = tone?.label ?? (state ? titleizeEnum(state) : null)
  const price = position?.current_price ?? null
  const changePct = position?.change_today_pct ?? null

  return (
    <div style={{
      padding: "14px 18px",
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      gap: 16,
      alignItems: "center",
      borderTop: isFirst ? "none" : "1px solid var(--vr-line)",
    }}>
      {/* Identity */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{
          fontFamily: "var(--ff-mono)",
          fontWeight: 500,
          fontSize: 16,
          letterSpacing: "0.04em",
          color: "var(--vr-cream)",
          fontVariantNumeric: "tabular-nums",
        }}>
          {symbol}
        </span>
        {lane && (
          <span style={{
            fontFamily: "var(--ff-sans)",
            fontWeight: 500,
            fontSize: 9,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--vr-sleeve-crypto)",
            padding: "2px 8px",
            border: "1px solid rgba(166, 146, 212, 0.28)",
            borderRadius: 999,
            background: "rgba(166, 146, 212, 0.06)",
          }}>
            {titleizeEnum(lane)}
          </span>
        )}
      </div>

      {/* State badge (lightweight tag, not a duplicate of the ladder) */}
      <div>
        {stateLabel && (
          <span style={{
            fontFamily: "var(--ff-sans)",
            fontWeight: 500,
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            padding: "2px 8px",
            borderRadius: 3,
            border: `1px solid ${tone?.color ?? "var(--vr-line-hi)"}`,
            color: tone?.color ?? "var(--vr-cream)",
            background: tone?.soft ?? "transparent",
          }}>
            {stateLabel}
          </span>
        )}
      </div>

      {/* Price */}
      <div style={{ textAlign: "right" }}>
        <div style={{
          fontFamily: "var(--ff-mono)",
          fontWeight: 500,
          fontSize: 16,
          color: "var(--vr-cream)",
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
        }}>
          {price != null ? fmtCurrency(price) : <span style={{ color: "var(--vr-cream-mute)" }}>—</span>}
        </div>
        {price != null && changePct != null && (
          <div style={{
            fontFamily: "var(--ff-mono)",
            fontWeight: 400,
            fontSize: 11,
            marginTop: 3,
            fontVariantNumeric: "tabular-nums",
            color: changePct > 0 ? "var(--vr-up)" : changePct < 0 ? "var(--vr-down)" : "var(--vr-cream-mute)",
          }}>
            {changePct > 0 ? "+" : changePct < 0 ? "−" : "+"}
            {Math.abs(changePct).toFixed(2)}% today
          </div>
        )}
      </div>
    </div>
  )
}

function CryptoTrackedAssets({
  positions,
  signals,
}: {
  positions: ViresPosition[]
  signals?: CryptoSignalsBlock | null
}) {
  const trackedAssets = signals?.tracked_assets ?? []

  // Empty state — covers both `tracked_assets: []` and `crypto_signals` absent.
  if (trackedAssets.length === 0) {
    return (
      <div className="vr-card">
        <TrackedAssetsHeader count={0} />
        <div style={{ padding: "20px 18px 24px", borderTop: "1px solid var(--vr-line)" }}>
          <div style={{
            fontFamily: "var(--ff-sans)",
            fontWeight: 500,
            fontSize: 13,
            color: "var(--vr-cream-dim)",
            margin: "0 0 4px",
          }}>
            No tracked assets
          </div>
          <p style={{
            fontFamily: "var(--ff-sans)",
            fontWeight: 400,
            fontSize: 11,
            lineHeight: 1.5,
            color: "var(--vr-cream-mute)",
            margin: 0,
            maxWidth: "55ch",
          }}>
            The crypto sleeve has no active lanes. Assets appear here once a strategy is promoted.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="vr-card">
      <TrackedAssetsHeader count={trackedAssets.length} />
      <div style={{ borderTop: "1px solid var(--vr-line)" }}>
        {trackedAssets.map((asset, i) => (
          <TrackedAssetRow
            key={asset.symbol ?? `row-${i}`}
            asset={asset}
            managedExposure={signals?.managed_exposure ?? null}
            position={positions.find(p => p.symbol === asset.symbol)}
            isFirst={i === 0}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Sleeve screens ─────────────────────────────────────────────────────────

type SleeveOperator = ActiveStrategyOperator & AllocationHistoryOperator & CryptoSignalsOperator

export function StocksScreen({ data, rules, operator }: {
  data: ViresTradingDataWithSleeveHistory & { strategy_universe?: ViresStrategyUniverse | null }
  rules?: StrategyRules
  operator?: unknown
}) {
  const positions = data.positions.filter(p => (p.asset_type ?? "EQUITY") === "EQUITY") as ViresPosition[]
  const effectiveRules: StrategyRules = rules ?? { stop_loss_pct: null, target_pct: null }
  const op = operator as SleeveOperator | null | undefined
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SleeveSummary sleeve="stocks" positions={positions} equityCurve={data.equity_curve} sleeveHistory={data.sleeve_equity_history?.stocks ?? null} />
      <ActiveStrategy sleeve="stocks" operator={op} />
      <OpenPositions positions={positions} />
      <StrategyUniverse universe={data.strategy_universe ?? null} positions={positions} rules={effectiveRules} />
      <AllocationHistory sleeve="stocks" operator={op} />
    </div>
  )
}

export function OptionsScreen({ data, operator }: { data: ViresTradingDataWithSleeveHistory; operator?: unknown }) {
  const positions = data.positions.filter(p => p.asset_type === "OPTION") as ViresPosition[]
  const op = operator as SleeveOperator | null | undefined
  const noRules: StrategyRules = { stop_loss_pct: null, target_pct: null }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SleeveSummary sleeve="options" positions={positions} equityCurve={data.equity_curve} sleeveHistory={data.sleeve_equity_history?.options ?? null} />
      <ActiveStrategy sleeve="options" operator={op} />
      <OpenPositions positions={positions} />
      <StrategyUniverse universe={null} positions={positions} rules={noRules} />
      <AllocationHistory sleeve="options" operator={op} />
    </div>
  )
}

export function CryptoScreen({ data, operator }: { data: ViresTradingDataWithSleeveHistory; operator?: unknown }) {
  const positions = data.positions.filter(p => p.asset_type === "CRYPTO") as ViresPosition[]
  const op = operator as SleeveOperator | null | undefined
  const signals = op?.crypto_signals ?? undefined
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SleeveSummary sleeve="crypto" positions={positions} equityCurve={data.equity_curve} sleeveHistory={data.sleeve_equity_history?.crypto ?? null} />
      <ActiveStrategy sleeve="crypto" operator={op} />
      <OpenPositions positions={positions} />
      <CryptoTrackedAssets positions={positions} signals={signals} />
      <AllocationHistory sleeve="crypto" operator={op} />
    </div>
  )
}
