"use client"

// Per-sleeve views (Stocks / Options / Crypto) for the Vires Trading section.
// Each sleeve gets a SleeveSummary header + Open Positions list. Stocks adds
// a Qualified Universe panel; Options shows an "awaiting promotion" state;
// Crypto adds the two-layer architecture explainer kept compact and the
// position list. Future BTC TSMOM / exposure ladder cards will plug in once
// Codex ships the crypto signal data in the operator feed.

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

// ─── Sleeve hero ────────────────────────────────────────────────────────────

function SleeveSummary({ sleeve, positions, equityCurve }: {
  sleeve: Sleeve
  positions: ViresPosition[]
  equityCurve?: Array<{ date: string; equity: number }>
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
      />
    </div>
  )
}

// ─── Sleeve sparkline ──────────────────────────────────────────────────────
// Mini cumulative curve rendered inside the SleeveSummary hero. Until Codex
// ships `sleeve_equity_history` (primer ask #8), this is a MODELED curve
// derived deterministically from the account's daily equity_curve with
// per-sleeve seeded noise + amplification. Scales the final point exactly
// to the sleeve's current market value so the chart never contradicts the
// big number above it. Options (or any sleeve with $0 deployed) renders a
// flat dashed "awaiting promotion" line instead of pretending.
//
// Two interactive controls:
//   - Timeframe pills (1D / 1W / 1M / 3M / 1Y / ALL) — shared across every
//     chart on /vires via useSharedTimeframe; pick on any card, all chart
//     windows agree.
//   - RET / MV toggle — local per-card. RET shows cumulative return % from
//     the window start (zero line drawn); MV shows dollar market value.

const SLEEVE_SEED: Record<Sleeve, { seed: number; amp: number }> = {
  stocks:  { seed: 7919, amp: 1.05 },
  options: { seed: 3407, amp: 1.10 },
  crypto:  { seed: 4421, amp: 2.10 },
}

function SleeveSparkline({ sleeve, currentValue, color, equityCurve }: {
  sleeve: Sleeve
  currentValue: number
  color: string
  equityCurve: Array<{ date: string; equity: number }>
}) {
  const W = 520
  const H = 58
  const { tf } = useSharedTimeframe()
  const [mode, setMode] = useState<"RET" | "MV">("MV")

  if (currentValue <= 0) {
    // Awaiting-promotion flat line — honest about having no data.
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
          NO DATA · AWAITING PROMOTION
        </div>
      </div>
    )
  }

  if (equityCurve.length < 2) return null

  // Slice the account curve by the shared timeframe. For ALL use the whole
  // series; otherwise take the last N days. We keep at least 2 points so
  // the walk has a span to draw against.
  const tfMeta = TIMEFRAMES.find(t => t.k === tf) ?? TIMEFRAMES[1]
  const window =
    tfMeta.days === Infinity
      ? equityCurve
      : equityCurve.slice(-Math.max(2, Math.min(equityCurve.length, tfMeta.days + 1)))

  // Generate a deterministic noise series from the windowed account curve.
  // Seed incorporates the TF key so changing timeframes reshuffles noise
  // (otherwise every window draws the same wobble at different scales).
  const { seed, amp } = SLEEVE_SEED[sleeve]
  let s = (seed ^ tf.charCodeAt(0) * 131) >>> 0
  const rand = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280 - 0.5
  }

  const accountStart = window[0].equity
  const accountEnd = window[window.length - 1].equity
  const accountReturn = accountEnd / Math.max(accountStart, 1)
  // Sleeve's synthetic return magnifies the account return by amp, then
  // walks with seeded noise around the straight line between start and end.
  const sleeveEndRatio = Math.pow(accountReturn, amp)
  const sleeveStart = currentValue / Math.max(sleeveEndRatio, 0.0001)

  // Densify to ~180 points so the sparkline reads as live as the main
  // equity chart's intraday upsampling — daily anchors alone produce a
  // straight 7-segment line on 1W which feels flat compared to the hero
  // chart. Anchor noise around the straight start→end line so the final
  // point still locks to currentValue.
  const targetPoints = Math.max(window.length, 180)
  const walk: number[] = []
  for (let i = 0; i < targetPoints; i++) {
    const t = i / (targetPoints - 1)
    const target = sleeveStart * (1 + (sleeveEndRatio - 1) * t)
    // Sine envelope mutes noise at both ends so the curve smoothly
    // resolves at the anchor values; mid-window has the most jitter.
    const env = Math.sin(Math.PI * t)
    const noise = rand() * 0.014 * target * env
    walk.push(target + noise)
  }
  // Force last point to match currentValue (no drift).
  walk[walk.length - 1] = currentValue

  // Convert to display series. MV = dollars. RET = cumulative return %
  // from the window start.
  const series =
    mode === "MV"
      ? walk
      : walk.map(v => (v / walk[0] - 1) * 100)

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
  const firstValue = series[0]
  const periodPct = mode === "MV" ? ((lastValue - firstValue) / firstValue) * 100 : lastValue

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

      <div
        className="t-label"
        style={{
          fontSize: 9,
          color: "var(--vr-cream-mute)",
          marginTop: 6,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        Modeled · final point matches current value · real history lands with primer 5
      </div>
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
  if (!universe || universe.symbols.length === 0) return null
  const sorted = [...universe.symbols].sort((a, b) => {
    if (a.in_position !== b.in_position) return a.in_position ? -1 : 1
    return (b.change_pct ?? 0) - (a.change_pct ?? 0)
  })
  const heldCount = sorted.filter(s => s.in_position).length
  const positionBySymbol = new Map(positions.map(p => [p.symbol, p]))

  return (
    <div className="vr-card">
      <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="t-eyebrow">Qualified Universe</div>
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

// ─── Crypto explainer (compact two-layer) ───────────────────────────────────

function CryptoArchitecture({ signals }: { signals?: CryptoManagedExposureSignal | null }) {
  const perf = signals?.performance_summary ?? null
  const totalReturn = perf?.total_return_pct
  const maxDrawdown = perf?.max_drawdown_pct
  const calmar = perf?.calmar_ratio
  const summaryLine =
    totalReturn != null || maxDrawdown != null || calmar != null
      ? [
          totalReturn != null ? `${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(0)}% net` : null,
          maxDrawdown != null ? `max DD ${maxDrawdown.toFixed(0)}%` : null,
          calmar != null ? `Calmar ${calmar.toFixed(2)}` : null,
        ].filter(Boolean).join(" · ")
      : null
  return (
    <div className="vr-card" style={{ padding: 18 }}>
      <div className="t-eyebrow" style={{ marginBottom: 10 }}>Two-layer architecture</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--vr-cream-dim)" }}>
        <div style={{ flex: 1 }}>
          <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-gold)" }}>Core regime</div>
          <div style={{ marginTop: 4 }}>Daily · own BTC?</div>
        </div>
        <span style={{ color: "var(--vr-cream-faint)" }}>→</span>
        <div style={{ flex: 1 }}>
          <div className="t-eyebrow" style={{ fontSize: 9 }}>Tactical overlay</div>
          <div style={{ marginTop: 4 }}>4H · trim or add inside the regime</div>
        </div>
      </div>
      <div className="t-label" style={{ fontSize: 10, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--vr-line)" }}>
        {summaryLine ?? signals?.note ?? "Managed BTC exposure promotes the core sleeve first and leaves tactical as an overlay candidate."}
      </div>
    </div>
  )
}

// ─── BTC 4H TSMOM signal card (scaffolded) ──────────────────────────────────
// Fully laid out per the design handoff. Values default to em-dashes until
// Codex's crypto_signals.tsmom block populates the operator feed (primer
// ask #7).
function CryptoTSMOM({ signals }: { signals?: CryptoSignalTSMOM | null }) {
  const status = signals?.status ?? "AWAITING_FEED"
  const statusLabel =
    status === "RESEARCH_ONLY" ? "BENCH ONLY"
    : status === "PROMOTED" ? "PROMOTED"
    : "AWAITING FEED"
  const signalStrength = signals?.signal_strength_pct
  const signalTone = signalStrength != null && signalStrength >= 60 ? "gold" : "neutral"
  return (
    <div className="vr-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 4 }}>BTC 4H TSMOM</div>
          <div className="t-h3" style={{ fontSize: 16 }}>Time-Series Momentum</div>
        </div>
        <StatusPill tone={signalTone}>{statusLabel}</StatusPill>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, borderTop: "1px solid var(--vr-line)" }}>
        <div style={{ padding: "12px 0 4px", paddingRight: 12 }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Bar</div>
          <div className="t-num" style={{ fontSize: 14, color: signals?.bar ? "var(--vr-cream)" : "var(--vr-cream-mute)" }}>{signals?.bar ?? "—"}</div>
        </div>
        <div style={{ padding: "12px 12px 4px", borderLeft: "1px solid var(--vr-line)" }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Direction</div>
          <div className="t-num" style={{ fontSize: 14, color: signals?.direction ? "var(--vr-cream)" : "var(--vr-cream-mute)" }}>{signals?.direction ?? "—"}</div>
        </div>
        <div style={{ padding: "12px 0 4px 12px", borderLeft: "1px solid var(--vr-line)" }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Last Cross</div>
          <div className="t-num" style={{ fontSize: 11, color: signals?.last_cross_at ? "var(--vr-cream)" : "var(--vr-cream-mute)" }}>
            {signals?.last_cross_at ? signals.last_cross_at.replace("T", " ").slice(0, 16) : "—"}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--vr-line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span className="t-label" style={{ fontSize: 10 }}>Signal Strength</span>
          <span className="t-num" style={{ fontSize: 11, color: signalStrength != null ? "var(--vr-cream)" : "var(--vr-cream-mute)" }}>
            {signalStrength != null ? `${signalStrength.toFixed(0)}%` : (signals?.signal_strength_label ?? "—")}
          </span>
        </div>
        <div style={{ height: 4, background: "rgba(241,236,224,0.05)", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.max(0, Math.min(signalStrength ?? 0, 100))}%`,
              height: "100%",
              background: "var(--vr-gold)",
            }}
          />
        </div>
        {signals?.note && (
          <div className="t-label" style={{ fontSize: 10, marginTop: 8, lineHeight: 1.45 }}>
            {signals.note}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Managed Exposure ladder (scaffolded) ───────────────────────────────────
function CryptoExposure({ signals }: { signals?: CryptoManagedExposureSignal | null }) {
  const tiers = signals?.ladder?.length ? signals.ladder : [
    { label: "Tier 1", exposure_pct: 80, note: "Constructive regime", active: false },
    { label: "Tier 2", exposure_pct: 70, note: "Neutral regime", active: false },
    { label: "Tier 3", exposure_pct: 0, note: "Risk-off", active: false },
  ]
  const ladderTitle = tiers
    .map(t => typeof t.exposure_pct === "number" ? Math.round(t.exposure_pct).toString() : null)
    .filter((value): value is string => value != null)
    .join(" / ")
  return (
    <div className="vr-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 4 }}>Managed Exposure</div>
          <div className="t-h3" style={{ fontSize: 16 }}>
            {signals?.title ?? (ladderTitle ? `Graduated ${ladderTitle} ladder` : "Managed exposure ladder")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Current</div>
          <div className="t-num" style={{ fontSize: 18, color: signals?.current_exposure_pct != null ? "var(--vr-cream)" : "var(--vr-cream-mute)", fontWeight: 500 }}>
            {signals?.current_exposure_pct != null ? `${signals.current_exposure_pct.toFixed(0)}%` : "—"}
          </div>
          <div className="t-label" style={{ fontSize: 10, marginTop: 3 }}>
            {signals?.current_state?.replace(/_/g, " ") ?? "no live state"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tiers.map(t => (
          <div
            key={t.label ?? "tier"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              background: "transparent",
              border: `1px solid ${t.active ? "var(--vr-gold-line)" : "var(--vr-line)"}`,
              borderRadius: 2,
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: t.active ? "var(--vr-gold)" : "var(--vr-cream-faint)",
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span className="t-eyebrow" style={{ fontSize: 10 }}>{t.label}</span>
                <span className="t-label" style={{ fontSize: 10 }}>{t.note}</span>
              </div>
            </div>
            <span className="t-num" style={{ fontSize: 13, color: t.active ? "var(--vr-cream)" : "var(--vr-cream-mute)" }}>{t.exposure_pct ?? "—"}%</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--vr-line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="t-label" style={{ fontSize: 11 }}>Tactical Top-Up</span>
        <StatusPill tone="neutral">{signals?.overlay_status?.replace(/_/g, " ") ?? "AWAITING FEED"}</StatusPill>
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

function TrackedAssetsHeader({ regime }: { regime?: ViresRegime | null }) {
  const showChip = regime != null && regime.populated !== false
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
      padding: "16px 18px 14px",
      borderBottom: "1px solid var(--vr-line)",
    }}>
      <div style={{ minWidth: 0 }}>
        <div className="t-eyebrow">Tracked Assets</div>
        <h3 style={{
          fontFamily: "var(--ff-sans)",
          fontWeight: 500,
          fontSize: 16,
          color: "var(--vr-cream)",
          margin: "4px 0 0",
        }}>
          Market intent · Crypto sleeve
        </h3>
        <div style={{ fontFamily: "var(--ff-sans)", fontSize: 11, color: "var(--vr-cream-mute)", marginTop: 4 }}>
          What the strategy is about to do for the assets we track.
        </div>
      </div>
      {showChip && <RegimeChip regime={regime!} />}
    </div>
  )
}

function RegimeChip({ regime }: { regime: ViresRegime }) {
  const vix = regime.vix_level
  const vixRegime = regime.vix_regime
  const hmm = regime.hmm_regime
  const primaryParts = [
    vix != null ? `VIX ${vix.toFixed(2)}` : null,
    vixRegime ? titleizeEnum(vixRegime) : null,
  ].filter(Boolean) as string[]
  if (primaryParts.length === 0 && !hmm) return null
  const primary = primaryParts.length > 0
    ? primaryParts.join(" · ")
    : (vix != null ? `VIX ${vix.toFixed(2)}` : "VIX —")
  return (
    <div
      title="Broader-market regime context"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 2,
        padding: "6px 10px",
        background: "rgba(241, 236, 224, 0.025)",
        border: "1px solid var(--vr-line)",
        borderRadius: "var(--r-inset)",
        whiteSpace: "nowrap",
      }}
    >
      <div style={{
        fontFamily: "var(--ff-mono)",
        fontWeight: 500,
        fontSize: 10,
        letterSpacing: "0.06em",
        color: "var(--vr-cream)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {primary}
      </div>
      {hmm && (
        <div style={{
          fontFamily: "var(--ff-sans)",
          fontWeight: 400,
          fontSize: 10,
          color: "var(--vr-cream-mute)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          HMM {titleizeEnum(hmm)}
        </div>
      )}
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
  regime,
}: {
  positions: ViresPosition[]
  signals?: CryptoSignalsBlock | null
  regime?: ViresRegime | null
}) {
  const trackedAssets = signals?.tracked_assets ?? []

  // Empty state — covers both `tracked_assets: []` and `crypto_signals` absent.
  // Per DEGRADATION.md, frame stays at normal height, header + regime chip
  // still render (regime is sleeve-scope context, not row-scope).
  if (trackedAssets.length === 0) {
    return (
      <div className="vr-card">
        <TrackedAssetsHeader regime={regime} />
        <div style={{ padding: "28px 18px 32px" }}>
          <div style={{
            fontFamily: "var(--ff-sans)",
            fontWeight: 500,
            fontSize: 14,
            color: "var(--vr-cream)",
            margin: "0 0 6px",
          }}>
            No tracked assets
          </div>
          <p style={{
            fontFamily: "var(--ff-sans)",
            fontWeight: 400,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--vr-cream-mute)",
            margin: 0,
            maxWidth: "55ch",
          }}>
            The crypto sleeve has no active lanes. When a strategy is promoted, its tracked assets will appear here with tier state and next action.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="vr-card">
      <TrackedAssetsHeader regime={regime} />
      <div>
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
  data: ViresTradingData & { strategy_universe?: ViresStrategyUniverse | null }
  rules?: StrategyRules
  operator?: unknown
}) {
  const positions = data.positions.filter(p => (p.asset_type ?? "EQUITY") === "EQUITY") as ViresPosition[]
  const effectiveRules: StrategyRules = rules ?? { stop_loss_pct: null, target_pct: null }
  const op = operator as SleeveOperator | null | undefined
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SleeveSummary sleeve="stocks" positions={positions} equityCurve={data.equity_curve} />
      <ActiveStrategy sleeve="stocks" operator={op} />
      <OpenPositions positions={positions} />
      <StrategyUniverse universe={data.strategy_universe ?? null} positions={positions} rules={effectiveRules} />
      <AllocationHistory sleeve="stocks" operator={op} />
    </div>
  )
}

export function OptionsScreen({ data, operator }: { data: ViresTradingData; operator?: unknown }) {
  const positions = data.positions.filter(p => p.asset_type === "OPTION")
  const op = operator as SleeveOperator | null | undefined
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SleeveSummary sleeve="options" positions={positions as ViresPosition[]} equityCurve={data.equity_curve} />
      <ActiveStrategy sleeve="options" operator={op} />
      <OpenPositions positions={positions as ViresPosition[]} />
      <div className="vr-card" style={{ padding: 18 }}>
        <div className="t-eyebrow" style={{ marginBottom: 6 }}>Bull Put Spreads · Hedges</div>
        <div className="t-h4" style={{ color: "var(--vr-cream-dim)" }}>No strategies deployed</div>
        <div className="t-label" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
          Awaiting BPS variant promotion from the Bench. Target: weekly income with defined risk.
        </div>
      </div>
      <AllocationHistory sleeve="options" operator={op} />
    </div>
  )
}

export function CryptoScreen({ data, operator }: { data: ViresTradingData; operator?: unknown }) {
  const positions = data.positions.filter(p => p.asset_type === "CRYPTO") as ViresPosition[]
  const op = operator as SleeveOperator | null | undefined
  const signals = op?.crypto_signals ?? undefined
  const regime = op?.regime ?? null
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SleeveSummary sleeve="crypto" positions={positions} equityCurve={data.equity_curve} />
      <ActiveStrategy sleeve="crypto" operator={op} />
      <OpenPositions positions={positions} />
      <CryptoTSMOM signals={signals?.tsmom} />
      <CryptoExposure signals={signals?.managed_exposure} />
      <CryptoTrackedAssets positions={positions} signals={signals} regime={regime} />
      <CryptoArchitecture signals={signals?.managed_exposure} />
      <AllocationHistory sleeve="crypto" operator={op} />
    </div>
  )
}
