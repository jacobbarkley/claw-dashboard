"use client"

// Vires Capital — trading home view (preview).
// Ported from _design_handoff/vires_capital/files/vires-trading.jsx with:
//   - JSX → TSX, types pulled from the operator feed shape
//   - Sleeve sub-screens deferred to a follow-up commit (this file is the
//     home composition only)
//   - Talon click stubbed to a no-op until the chat integration lands here
//
// Wired to data/operator-feed.json via the loader in app/vires/page.tsx,
// the same source the existing /trading page reads from. No data forking.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import {
  Delta,
  EquityDisplay,
  OrbitRing,
  Starfield,
  fmtCurrency,
  fmtPct,
  toneColor,
  toneOf,
} from "./shared"
import { ElevatedStrategies, MarketRegime, DeskStatus } from "./home-extras"
import { useViresTalon } from "./talon"
import { useSharedTimeframe, TimeframeDropdown, TIMEFRAMES as SHARED_TIMEFRAMES, type Timeframe } from "./timeframe-context"
import { useChartScrubber } from "./use-chart-scrubber"

// ─── Types matching the operator feed subset this page consumes ────────────
// Keep narrow on purpose so a downstream feed change only breaks the screens
// that read the affected field.
export interface ViresTradingData {
  account: {
    equity: number
    cash: number
    equity_deployed: number | null
    crypto_deployed: number | null
    options_deployed: number | null
    today_pnl_pct: number | null
    total_pnl_pct: number | null
    base_value: number | null
  }
  positions: Array<{
    symbol: string
    market_value: number
    change_today_pct: number
    asset_type?: string
  }>
  equity_curve: Array<{ date: string; equity: number }>
}

// ─── Celestial ──────────────────────────────────────────────────────────────
// Sun by day, moon by night. Click opens Talon. Mouse parallax over hero.
function Celestial({
  parallax = { x: 0, y: 0 },
  onOpenTalon,
}: {
  parallax?: { x: number; y: number }
  onOpenTalon?: () => void
}) {
  const [hover, setHover] = useState(false)
  const hour = new Date().getHours()
  const isDay = hour >= 6 && hour < 18
  const size = 58
  const tx = parallax.x * 6
  const ty = parallax.y * 4

  const wrapperStyle: CSSProperties = {
    position: "absolute",
    top: 16,
    right: 18,
    width: size,
    height: size,
    pointerEvents: onOpenTalon ? "auto" : "none",
    cursor: onOpenTalon ? "pointer" : "default",
    zIndex: 3,
    transform: `translate3d(${tx}px, ${ty}px, 0) scale(${hover ? 1.06 : 1})`,
    transition: "transform 0.25s cubic-bezier(0.2,0.8,0.2,1)",
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (!onOpenTalon) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onOpenTalon()
    }
  }

  const Halo = () => (
    <div
      style={{
        position: "absolute",
        inset: -14,
        borderRadius: "50%",
        pointerEvents: "none",
        opacity: hover ? 1 : 0,
        transition: "opacity 0.22s ease-out",
        background: isDay
          ? "radial-gradient(circle, rgba(244,213,138,0.28) 0%, rgba(244,213,138,0.10) 45%, transparent 70%)"
          : "radial-gradient(circle, rgba(232,228,216,0.22) 0%, rgba(232,228,216,0.06) 45%, transparent 70%)",
        animation: hover ? "vr-halo-pulse 1.6s ease-in-out infinite" : "none",
      }}
    />
  )

  return (
    <div
      style={wrapperStyle}
      onClick={onOpenTalon}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role={onOpenTalon ? "button" : undefined}
      tabIndex={onOpenTalon ? 0 : undefined}
      aria-label={onOpenTalon ? "Open Talon assistant" : undefined}
      onKeyDown={handleKey}
    >
      <Halo />
      {isDay ? (
        <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: "visible", display: "block" }}>
          <defs>
            <radialGradient id="vrSunCore" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#fff4d4" stopOpacity="1" />
              <stop offset="35%"  stopColor="#f4d58a" stopOpacity="1" />
              <stop offset="70%"  stopColor="#c8a968" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#8e763f" stopOpacity="0.85" />
            </radialGradient>
            <radialGradient id="vrSunCorona" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#f4d58a" stopOpacity="0.45" />
              <stop offset="55%"  stopColor="#c8a968" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#c8a968" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="vrSunOuter" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#c8a968" stopOpacity="0.10" />
              <stop offset="60%"  stopColor="#c8a968" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#c8a968" stopOpacity="0" />
            </radialGradient>
            <filter id="vrSunBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.4" />
            </filter>
          </defs>
          <circle cx="32" cy="32" r="30" fill="url(#vrSunOuter)" />
          <circle cx="32" cy="32" r="20" fill="url(#vrSunCorona)">
            <animate attributeName="r" values="19;21;19" dur="5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.85;1;0.85" dur="5s" repeatCount="indefinite" />
          </circle>
          <circle cx="32" cy="32" r="11" fill="url(#vrSunCore)" filter="url(#vrSunBlur)" />
          <circle cx="29" cy="29" r="2.5" fill="#fffaec" opacity="0.75" />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: "visible", display: "block" }}>
          <defs>
            <radialGradient id="vrMoonGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#e8e4d8" stopOpacity="0.20" />
              <stop offset="60%"  stopColor="#c9c3b3" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#c9c3b3" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="vrMoonBody" cx="38%" cy="35%" r="70%">
              <stop offset="0%"   stopColor="#f5f0e2" />
              <stop offset="55%"  stopColor="#d8d2bf" />
              <stop offset="100%" stopColor="#8a8575" />
            </radialGradient>
            <radialGradient id="vrMoonShadow" cx="72%" cy="55%" r="60%">
              <stop offset="0%"   stopColor="#000" stopOpacity="0" />
              <stop offset="70%"  stopColor="#000" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.52" />
            </radialGradient>
            <filter id="vrMoonCraterBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.3" />
            </filter>
          </defs>
          <circle cx="32" cy="32" r="30" fill="url(#vrMoonGlow)" />
          <circle cx="32" cy="32" r="14" fill="url(#vrMoonBody)" />
          <circle cx="32" cy="32" r="14" fill="url(#vrMoonShadow)" />
          <g filter="url(#vrMoonCraterBlur)" opacity="0.45">
            <circle cx="28" cy="29" r="2.2" fill="#8a8575" />
            <circle cx="34" cy="26" r="1.2" fill="#8a8575" />
            <circle cx="30" cy="35" r="1.6" fill="#8a8575" />
            <circle cx="36" cy="33" r="0.9" fill="#8a8575" />
            <circle cx="26" cy="33" r="0.7" fill="#8a8575" />
          </g>
          <circle cx="27" cy="27" r="1.8" fill="#fffaec" opacity="0.55" />
        </svg>
      )}
    </div>
  )
}

// ─── Hero: Account Equity + allocation bar + celestial + equity curve ───────
function HomeHero({ account, curve, baseValue, onOpenTalon, onNavigateSleeve }: {
  account: ViresTradingData["account"]
  curve: ViresTradingData["equity_curve"]
  baseValue: number | null
  onOpenTalon?: () => void
  onNavigateSleeve?: (sleeve: "stocks" | "crypto" | "options") => void
}) {
  const [px, setPx] = useState({ x: 0, y: 0 })
  const heroRef = useRef<HTMLDivElement>(null)
  const handleMouse = (e: React.MouseEvent) => {
    const r = heroRef.current?.getBoundingClientRect()
    if (!r) return
    setPx({
      x: ((e.clientX - r.left) / r.width - 0.5) * 2,
      y: ((e.clientY - r.top) / r.height - 0.5) * 2,
    })
  }

  const alloc: Array<{
    k: "stocks" | "crypto" | "options" | "cash"
    label: string
    value: number
    color: string
  }> = [
    { k: "stocks",  label: "Stocks",  value: account.equity_deployed ?? 0, color: "var(--vr-sleeve-stocks)" },
    { k: "crypto",  label: "Crypto",  value: account.crypto_deployed ?? 0, color: "var(--vr-sleeve-crypto)" },
    { k: "options", label: "Options", value: account.options_deployed ?? 0, color: "var(--vr-sleeve-options)" },
    { k: "cash",    label: "Cash",    value: account.cash ?? 0,             color: "var(--vr-cream-faint)" },
  ]
  const total = alloc.reduce((s, x) => s + x.value, 0) || 1

  return (
    <div
      ref={heroRef}
      className="vr-card-hero vires-hero-pad vires-hero-home"
      style={{ overflow: "hidden", position: "relative" }}
      onMouseMove={handleMouse}
      onMouseLeave={() => setPx({ x: 0, y: 0 })}
    >
      <Starfield count={14} seed={42} />
      {/* Single orbit ring, positioned closer in — arc sits roughly
          halfway between the Account Equity number and the celestial
          (previously two concentric rings felt busy). */}
      <OrbitRing size={170} offsetX={-40} offsetY={-50} />
      <Celestial parallax={px} onOpenTalon={onOpenTalon} />

      <div className="t-eyebrow" style={{ marginBottom: 10, position: "relative", zIndex: 2 }}>
        Account Equity
      </div>
      <div style={{ position: "relative", zIndex: 2 }}>
        <EquityDisplay value={account.equity} size={42} />
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 14, alignItems: "baseline", position: "relative", zIndex: 2, flexWrap: "wrap" }}>
        {account.today_pnl_pct != null && <Delta value={account.today_pnl_pct} size="13px" />}
        <span className="t-label" style={{ fontSize: 11 }}>today</span>
        <span style={{ color: "var(--vr-cream-faint)" }}>·</span>
        {account.total_pnl_pct != null && (
          <span className="t-num" style={{ color: toneColor(toneOf(account.total_pnl_pct)), fontSize: 12 }}>
            {fmtPct(account.total_pnl_pct, { sign: true })}
          </span>
        )}
        <span className="t-label" style={{ fontSize: 11 }}>since inception</span>
      </div>

      {/* Allocation bar */}
      <div style={{ marginTop: 22, position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", height: 4, borderRadius: 1, overflow: "hidden", background: "rgba(241,236,224,0.04)" }}>
          {alloc.map(x => (
            <div
              key={x.k}
              style={{
                flexBasis: `${(x.value / total) * 100}%`,
                background: x.color,
                transition: "flex-basis 0.8s",
              }}
            />
          ))}
        </div>
        <div className="vires-alloc-grid" style={{ marginTop: 12 }}>
          {alloc.map(x => {
            // Non-cash segments jump to their sleeve sub-tab. Cash stays
            // display-only — it's not a tab.
            const clickable = x.k !== "cash" && !!onNavigateSleeve
            const Inner = (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                  <span style={{ width: 4, height: 4, background: x.color, flexShrink: 0 }} />
                  <span
                    className="t-eyebrow"
                    style={{
                      fontSize: 8.5,
                      letterSpacing: "0.08em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {x.label}
                  </span>
                </div>
                <div
                  className="t-num"
                  style={{
                    fontSize: 12,
                    color: "var(--vr-cream)",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {fmtCurrency(x.value, { compact: true })}
                </div>
                <div className="t-num" style={{ fontSize: 9.5, color: "var(--vr-cream-mute)", marginTop: 1 }}>
                  {((x.value / total) * 100).toFixed(1)}%
                </div>
              </>
            )
            // Cell padding + left-divider come from .vires-alloc-grid > *
            // so media queries can flip it cleanly when the grid collapses
            // to 2-col on mobile. See app/vires.css.
            return clickable ? (
              <button
                key={x.k}
                type="button"
                onClick={() => onNavigateSleeve!(x.k as "stocks" | "crypto" | "options")}
                style={{ cursor: "pointer" }}
                aria-label={`Open ${x.label} sleeve`}
              >
                {Inner}
              </button>
            ) : (
              <div key={x.k}>{Inner}</div>
            )
          })}
        </div>
      </div>

      {/* Equity curve inline — lives inside the hero so the whole surface
          reads as one Account Equity card. Timeframe dropdown + sparkline;
          value is omitted because the account equity number is already at
          the top of this card. */}
      <div
        style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid var(--vr-line)",
          position: "relative",
          zIndex: 2,
        }}
      >
        <EquityChart curve={curve} baseValue={baseValue} compact />
      </div>
    </div>
  )
}

// ─── Sleeve quick-link card ─────────────────────────────────────────────────
function SleeveCard({ sleeve, total, count, todayPct, onOpen }: {
  sleeve: "stocks" | "options" | "crypto"
  total: number
  count: number
  todayPct: number | null
  onOpen?: (sleeve: "stocks" | "options" | "crypto") => void
}) {
  const cfg = {
    stocks:  { c: "var(--vr-sleeve-stocks)",  l: "Stocks"  },
    options: { c: "var(--vr-sleeve-options)", l: "Options" },
    crypto:  { c: "var(--vr-sleeve-crypto)",  l: "Crypto"  },
  }[sleeve]
  const clickable = !!onOpen
  const Tag = clickable ? "button" : "div"
  return (
    <Tag
      className="vr-card"
      type={clickable ? "button" : undefined}
      onClick={clickable ? () => onOpen!(sleeve) : undefined}
      style={{
        padding: 16,
        textAlign: "left",
        border: "1px solid var(--vr-line)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: clickable ? "pointer" : "default",
        background: "transparent",
        color: "inherit",
        font: "inherit",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="t-eyebrow" style={{ color: cfg.c }}>
          <span style={{ display: "inline-block", width: 4, height: 4, background: cfg.c, marginRight: 6, verticalAlign: "middle" }} />
          {cfg.l}
        </span>
        <span style={{ color: "var(--vr-cream-mute)" }}>›</span>
      </div>
      <div className="t-num" style={{ fontSize: 18, color: "var(--vr-cream)", fontWeight: 500, marginTop: 4 }}>
        {total === 0 ? "—" : fmtCurrency(total, { compact: true })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="t-label" style={{ fontSize: 10 }}>
          {count === 0 ? "Dormant" : `${count} open`}
        </span>
        {todayPct !== null && <Delta value={todayPct} size="11px" />}
      </div>
    </Tag>
  )
}

// ─── Equity chart ──────────────────────────────────────────────────────────
// Timeframe selector covers a full spectrum: 1D and 1W are upsampled to
// intraday with deterministic seeded noise so the chart reads "live" on
// short windows. 1M / 3M / 1Y / ALL stay at daily resolution — the real
// data is plenty honest at those scales. Intraday detail is modeled, not
// live-tick (see Codex primer for when real bars land).
//
// TIMEFRAMES are imported from timeframe-context so the shared state +
// sleeve sparklines all agree on the same window definitions.
const TIMEFRAMES = SHARED_TIMEFRAMES

type TfKey = Timeframe

interface CurvePoint {
  date: string
  hour?: string
  equity: number
}

// Deterministic seeded noise used for intraday upsampling. Pure function —
// same seed always produces the same sequence so the chart doesn't flicker
// between renders.
function makeRand(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6D2B79F5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// Insert `steps` intraday points between each pair of consecutive daily
// closes. Anchors on the exact daily closes so the final headline number
// matches the daily series. Adds a mild intraday U-shape + seeded noise for
// realistic jaggedness. Returns a new array with `hour` strings on
// intraday points; daily anchors keep their original shape.
function upsampleIntraday(daily: CurvePoint[], stepsPerDay: number): CurvePoint[] {
  if (!daily || daily.length < 2 || stepsPerDay <= 0) return daily ?? []
  const rand = makeRand(0xC0FFEE)
  const mean = daily.reduce((a, b) => a + b.equity, 0) / daily.length || 100000
  const sigma = mean * (stepsPerDay >= 30 ? 0.0009 : 0.0018)
  const out: CurvePoint[] = []
  for (let i = 0; i < daily.length - 1; i++) {
    const a = daily[i]
    const b = daily[i + 1]
    for (let s = 0; s < stepsPerDay; s++) {
      const t = s / stepsPerDay
      const base = a.equity + (b.equity - a.equity) * t
      const env = Math.sin(Math.PI * t) // 0 at endpoints, 1 mid — mutes noise at closes
      const n1 = (rand() - 0.5) * 2
      const n2 = (rand() - 0.5) * 2
      const noise = (n1 * 0.8 + n2 * 0.4) * sigma * env
      const uShape = Math.sin(Math.PI * 2 * t - 0.3) * sigma * 0.35 * env
      const hrFloat = 9.5 + t * 6.5 // 9:30 → 16:00
      const hour = Math.floor(hrFloat)
      const mins = Math.round((hrFloat - hour) * 60)
      out.push({
        date: a.date,
        hour: `${hour.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`,
        equity: base + noise + uShape,
      })
    }
    out.push({ date: a.date, hour: "16:00", equity: a.equity })
  }
  const last = daily[daily.length - 1]
  out.push({ date: last.date, hour: "16:00", equity: last.equity })
  return out
}

function EquityChart({ curve, baseValue, compact = false }: {
  curve: ViresTradingData["equity_curve"]
  baseValue: number | null
  /** Compact mode: strips the card chrome, eyebrow, and value number —
   *  designed to live inside another card (e.g. the home hero) where the
   *  enclosing surface already shows equity. Delta + timeframe dropdown
   *  + sparkline are preserved. */
  compact?: boolean
}) {
  const { tf } = useSharedTimeframe()

  const tfMeta = TIMEFRAMES.find(t => t.k === tf)!

  const visible: CurvePoint[] = useMemo(() => {
    if (!curve.length) return []
    const daily: CurvePoint[] = curve.map(p => ({ date: p.date, equity: p.equity }))
    // Daily window: ALL = full history, otherwise slice to the window size + 1
    // (need one extra prior-close anchor when we upsample).
    const windowDays = tfMeta.days === Infinity ? daily.length : Math.max(2, Math.min(daily.length, tfMeta.days + 1))
    const windowed = tfMeta.days === Infinity ? daily : daily.slice(-windowDays)

    if (tfMeta.intradaySteps <= 0) return windowed

    // Upsample. For 1D, keep only today's session bars (from the last
    // prior-close anchor forward).
    const upsampled = upsampleIntraday(windowed, tfMeta.intradaySteps)
    if (tf === "1D") {
      const anchorIdx = upsampled.findIndex(p => p.date === windowed[windowed.length - 2]?.date)
      return anchorIdx >= 0 ? upsampled.slice(anchorIdx) : upsampled
    }
    return upsampled
  }, [curve, tf, tfMeta.days, tfMeta.intradaySteps])

  if (!visible.length) {
    if (compact) {
      return (
        <div className="t-label" style={{ fontSize: 11, color: "var(--vr-cream-mute)" }}>
          No equity history yet.
        </div>
      )
    }
    return (
      <div className="vr-card" style={{ padding: 18 }}>
        <div className="t-eyebrow" style={{ marginBottom: 8 }}>Equity Curve</div>
        <div className="t-label" style={{ fontSize: 12 }}>No history available yet.</div>
      </div>
    )
  }

  const vals = visible.map(p => p.equity)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const pad = (max - min) * 0.15 || 100
  const minP = min - pad
  const maxP = max + pad
  const W = 340
  const H = 130
  const range = maxP - minP || 1
  const pts = visible.map((p, i): [number, number] => [
    (i / Math.max(1, visible.length - 1)) * W,
    H - ((p.equity - minP) / range) * H,
  ])
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ")
  const fd = `${d} L${W},${H} L0,${H} Z`
  const baseY = baseValue != null ? H - ((baseValue - minP) / range) * H : null
  const baseInRange = baseY != null && baseY >= 0 && baseY <= H
  const last = visible[visible.length - 1]
  const periodPct = ((last.equity - visible[0].equity) / visible[0].equity) * 100

  const { svgRef, hoverIdx, pointerHandlers, touchActionStyle } = useChartScrubber<SVGSVGElement>({
    length: visible.length,
  })
  const hover = hoverIdx != null && hoverIdx >= 0 && hoverIdx < visible.length ? visible[hoverIdx] : null

  const chartHeader = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: compact ? 10 : 14,
        gap: 10,
      }}
    >
      {compact ? (
        <div>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3, color: "var(--vr-cream-mute)" }}>
            Equity Curve
          </div>
          <div className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-faint)" }}>
            {hover
              ? `${hover.date}${hover.hour ? ` · ${hover.hour}` : ""} · ${fmtCurrency(hover.equity)}`
              : tfMeta.intradaySteps > 0
                ? `${tfMeta.label} · modeled intraday`
                : tfMeta.label}
          </div>
        </div>
      ) : (
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 4 }}>Equity Curve</div>
          <div className="t-num" style={{ fontSize: 16, color: "var(--vr-cream)", fontWeight: 500 }}>
            {fmtCurrency(hover ? hover.equity : last.equity)}
          </div>
          <div className="t-label" style={{ fontSize: 10, marginTop: 3 }}>
            {hover
              ? `${hover.date}${hover.hour ? ` · ${hover.hour}` : ""}`
              : tfMeta.intradaySteps > 0
                ? `${tfMeta.label} · modeled intraday`
                : tfMeta.label}
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <Delta value={periodPct} />
        <TimeframeDropdown />
      </div>
    </div>
  )

  if (compact) {
    // No card chrome — caller provides it (e.g., home hero wraps us).
    return (
      <div style={{ position: "relative", zIndex: 2 }}>
        {chartHeader}
        <div style={{ overflow: "visible" }}>
          <svg
            ref={svgRef}
            width="100%"
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            data-allow-horizontal-scroll
            style={{ display: "block", overflow: "visible", ...touchActionStyle }}
            {...pointerHandlers}
          >
            <defs>
              <linearGradient id="vrEqGradCompact" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--vr-gold)" stopOpacity="0.14" />
                <stop offset="100%" stopColor="var(--vr-gold)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {baseInRange && (
              <>
                <line x1="0" y1={baseY!} x2={W} y2={baseY!} stroke="var(--vr-cream-faint)" strokeDasharray="1 3" strokeWidth="0.8" />
                <text x={W - 4} y={baseY! - 4} fontSize="8" fill="var(--vr-cream-mute)" textAnchor="end" fontFamily="var(--ff-mono)" letterSpacing="0.15em">
                  BASE 100K
                </text>
              </>
            )}
            <path d={fd} fill="url(#vrEqGradCompact)" />
            <path d={d} stroke="var(--vr-gold)" strokeWidth="2.4" fill="none" strokeLinejoin="round" opacity="0.18" />
            <path d={d} stroke="var(--vr-gold)" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
            {hoverIdx != null && hoverIdx >= 0 && hoverIdx < pts.length && (() => {
              const [x, y] = pts[hoverIdx]
              return (
                <g>
                  <line x1={x} y1={0} x2={x} y2={H} stroke="var(--vr-cream-faint)" strokeWidth="0.6" strokeDasharray="1 3" />
                  <circle cx={x} cy={y} r="3.5" fill="var(--vr-ink)" stroke="var(--vr-gold)" strokeWidth="1.3" />
                </g>
              )
            })()}
          </svg>
        </div>
      </div>
    )
  }

  return (
    <div className="vr-card" style={{ padding: 18 }}>
      {chartHeader}
      {/* Negative-margin wrapper so the chart line stretches edge-to-edge
          across the card instead of stopping inside the 18px padding. */}
      <div style={{ margin: "0 -18px -18px", overflow: "hidden", borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }}>
      <svg
        ref={svgRef}
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        data-allow-horizontal-scroll
        style={{ display: "block", overflow: "visible", ...touchActionStyle }}
        {...pointerHandlers}
      >
        <defs>
          <linearGradient id="vrEqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--vr-gold)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--vr-gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {baseInRange && (
          <>
            <line x1="0" y1={baseY!} x2={W} y2={baseY!} stroke="var(--vr-cream-faint)" strokeDasharray="1 3" strokeWidth="0.8" />
            <text x={W - 4} y={baseY! - 4} fontSize="8" fill="var(--vr-cream-mute)" textAnchor="end" fontFamily="var(--ff-mono)" letterSpacing="0.15em">
              BASE 100K
            </text>
          </>
        )}
        <path d={fd} fill="url(#vrEqGrad)" />
        <path d={d} stroke="var(--vr-gold)" strokeWidth="2.4" fill="none" strokeLinejoin="round" opacity="0.18" />
        <path d={d} stroke="var(--vr-gold)" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
        {hoverIdx != null && hoverIdx >= 0 && hoverIdx < pts.length && (() => {
          const [x, y] = pts[hoverIdx]
          return (
            <g>
              <line x1={x} y1={0} x2={x} y2={H} stroke="var(--vr-cream-faint)" strokeWidth="0.6" strokeDasharray="1 3" />
              <circle cx={x} cy={y} r="3.5" fill="var(--vr-ink)" stroke="var(--vr-gold)" strokeWidth="1.3" />
            </g>
          )
        })()}
      </svg>
      </div>
    </div>
  )
}

// ─── Home view composition ──────────────────────────────────────────────────
// Renders the Trading > Home tab: hero + sleeve cards + equity chart. The
// inner Vires nav (Trading/Bench/Plateau) is rendered by app/vires/layout.tsx
// and the sub-nav (Home/Stocks/Options/Crypto) by ViresTradingShell.
export function ViresTradingHome({ data, operator, onNavigateSleeve }: {
  data: ViresTradingData
  operator?: Parameters<typeof ElevatedStrategies>[0]["operator"]
  onNavigateSleeve?: (sleeve: "stocks" | "options" | "crypto") => void
}) {
  const talon = useViresTalon()
  const stockPositions = data.positions.filter(p => (p.asset_type ?? "EQUITY") === "EQUITY")
  const cryptoPositions = data.positions.filter(p => p.asset_type === "CRYPTO")
  const optionPositions = data.positions.filter(p => p.asset_type === "OPTION")

  const pctMove = (positions: typeof data.positions) => {
    const totalMv = positions.reduce((s, p) => s + (p.market_value ?? 0), 0)
    if (totalMv <= 0) return null
    return positions.reduce((s, p) => s + (p.change_today_pct ?? 0) * (p.market_value ?? 0), 0) / totalMv
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <HomeHero
          account={data.account}
          curve={data.equity_curve}
          baseValue={data.account.base_value}
          onNavigateSleeve={onNavigateSleeve}
          onOpenTalon={talon.open}
        />

        <div className="vires-sleeve-card-row">
          <SleeveCard
            sleeve="stocks"
            total={stockPositions.reduce((s, p) => s + (p.market_value ?? 0), 0)}
            count={stockPositions.length}
            todayPct={pctMove(stockPositions)}
            onOpen={onNavigateSleeve}
          />
          <SleeveCard
            sleeve="options"
            total={optionPositions.reduce((s, p) => s + (p.market_value ?? 0), 0)}
            count={optionPositions.length}
            onOpen={onNavigateSleeve}
            todayPct={pctMove(optionPositions)}
          />
          <SleeveCard
            sleeve="crypto"
            total={cryptoPositions.reduce((s, p) => s + (p.market_value ?? 0), 0)}
            count={cryptoPositions.length}
            todayPct={pctMove(cryptoPositions)}
            onOpen={onNavigateSleeve}
          />
        </div>

        {/* Standalone EquityChart has moved inside HomeHero (compact mode).
            Keeping the import alive because sleeve views may still use the
            non-compact variant. */}

        {/* Market Regime sits directly under the hero — regime context
            pairs well with the equity curve reading now living inside it. */}
        <MarketRegime operator={operator ?? null} />

        {/* Lower-home sections. All read from operator.* fields
            already present in the feed — no backend work needed. */}
        <ElevatedStrategies operator={operator ?? null} />
        <DeskStatus operator={operator ?? null} />
      </div>
    </>
  )
}
