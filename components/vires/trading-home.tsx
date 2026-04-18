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
  AnimatedNumber,
  Delta,
  EquityDisplay,
  OrbitRing,
  Starfield,
  ViresMark,
  fmtCurrency,
  fmtPct,
  toneColor,
  toneOf,
} from "./shared"

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

// ─── Command strip ──────────────────────────────────────────────────────────
function CommandStrip({ mode = "PAPER" }: { mode?: "PAPER" | "LIVE" }) {
  const isPaper = mode === "PAPER"
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        borderBottom: "1px solid var(--vr-line)",
        background: "rgba(10, 11, 20, 0.75)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      <ViresMark size={16} />
      <span
        className="t-eyebrow"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          color: isPaper ? "var(--vr-gold)" : "var(--vr-up)",
        }}
      >
        <span className="vr-pulse-dot" style={{ background: isPaper ? "var(--vr-gold)" : "var(--vr-up)" }} />
        {mode}
      </span>
    </div>
  )
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

// ─── Hero: Account Equity + allocation bar + celestial ─────────────────────
function HomeHero({ account, onOpenTalon }: {
  account: ViresTradingData["account"]
  onOpenTalon?: () => void
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

  const alloc = [
    { k: "stocks",  label: "Stocks",  value: account.equity_deployed ?? 0, color: "var(--vr-sleeve-stocks)" },
    { k: "crypto",  label: "Crypto",  value: account.crypto_deployed ?? 0, color: "var(--vr-sleeve-crypto)" },
    { k: "options", label: "Options", value: account.options_deployed ?? 0, color: "var(--vr-sleeve-options)" },
    { k: "cash",    label: "Cash",    value: account.cash ?? 0,             color: "var(--vr-cream-faint)" },
  ]
  const total = alloc.reduce((s, x) => s + x.value, 0) || 1

  return (
    <div
      ref={heroRef}
      className="vr-card-hero"
      style={{ padding: "24px 22px 20px", overflow: "hidden", position: "relative" }}
      onMouseMove={handleMouse}
      onMouseLeave={() => setPx({ x: 0, y: 0 })}
    >
      <Starfield count={28} seed={42} />
      <OrbitRing size={220} offsetX={-90} offsetY={-100} />
      <OrbitRing size={340} offsetX={-180} offsetY={-180} />
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginTop: 14 }}>
          {alloc.map((x, i) => (
            <div
              key={x.k}
              style={{
                padding: i > 0 ? "0 0 0 12px" : "0 12px 0 0",
                borderLeft: i > 0 ? "1px solid var(--vr-line)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <span style={{ width: 4, height: 4, background: x.color }} />
                <span className="t-eyebrow" style={{ fontSize: 9 }}>{x.label}</span>
              </div>
              <div className="t-num" style={{ fontSize: 13, color: "var(--vr-cream)", fontWeight: 500 }}>
                {fmtCurrency(x.value, { compact: true })}
              </div>
              <div className="t-num" style={{ fontSize: 10, color: "var(--vr-cream-mute)", marginTop: 2 }}>
                {((x.value / total) * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Sleeve quick-link card ─────────────────────────────────────────────────
function SleeveCard({ sleeve, total, count, todayPct }: {
  sleeve: "stocks" | "options" | "crypto"
  total: number
  count: number
  todayPct: number | null
}) {
  const cfg = {
    stocks:  { c: "var(--vr-sleeve-stocks)",  l: "Stocks"  },
    options: { c: "var(--vr-sleeve-options)", l: "Options" },
    crypto:  { c: "var(--vr-sleeve-crypto)",  l: "Crypto"  },
  }[sleeve]
  return (
    <div
      className="vr-card"
      style={{
        padding: 16,
        textAlign: "left",
        border: "1px solid var(--vr-line)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
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
    </div>
  )
}

// ─── Equity chart ──────────────────────────────────────────────────────────
const TIMEFRAMES = [
  { k: "1M",  label: "1M",  days: 30 },
  { k: "3M",  label: "3M",  days: 90 },
  { k: "1Y",  label: "1Y",  days: 365 },
  { k: "ALL", label: "ALL", days: Infinity },
] as const

type TfKey = (typeof TIMEFRAMES)[number]["k"]

function EquityChart({ curve, baseValue }: {
  curve: ViresTradingData["equity_curve"]
  baseValue: number | null
}) {
  const [tf, setTf] = useState<TfKey>("ALL")
  const [tfMenu, setTfMenu] = useState(false)
  const [hover, setHover] = useState<{ date: string; equity: number } | null>(null)

  const tfMeta = TIMEFRAMES.find(t => t.k === tf)!
  const visible = useMemo(() => {
    if (!curve.length) return curve
    if (tfMeta.days === Infinity) return curve
    return curve.slice(-Math.max(2, tfMeta.days))
  }, [curve, tfMeta.days])

  if (!visible.length) {
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

  return (
    <div className="vr-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 4 }}>Equity Curve</div>
          <div className="t-num" style={{ fontSize: 16, color: "var(--vr-cream)", fontWeight: 500 }}>
            {fmtCurrency(hover ? hover.equity : last.equity)}
          </div>
          <div className="t-label" style={{ fontSize: 10, marginTop: 3 }}>
            {hover ? hover.date : tfMeta.label}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <Delta value={periodPct} />
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setTfMenu(v => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                background: "rgba(241,236,224,0.04)",
                border: "1px solid var(--vr-line)",
                color: "var(--vr-cream-dim)",
                fontFamily: "var(--ff-sans)",
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor: "pointer",
                borderRadius: 2,
              }}
            >
              {tfMeta.label} <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>
            </button>
            {tfMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  background: "var(--vr-ink-raised)",
                  border: "1px solid var(--vr-line-hi)",
                  borderRadius: 3,
                  padding: 4,
                  zIndex: 50,
                  boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
                  minWidth: 70,
                }}
              >
                {TIMEFRAMES.map(t => (
                  <button
                    key={t.k}
                    type="button"
                    onClick={() => { setTf(t.k); setTfMenu(false); setHover(null) }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "right",
                      padding: "6px 10px",
                      background: t.k === tf ? "rgba(200,169,104,0.08)" : "transparent",
                      border: "none",
                      color: t.k === tf ? "var(--vr-gold)" : "var(--vr-cream-dim)",
                      fontFamily: "var(--ff-sans)",
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      borderRadius: 2,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ overflow: "visible" }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * W
          const i = Math.max(0, Math.min(visible.length - 1, Math.round((x / W) * (visible.length - 1))))
          setHover(visible[i])
        }}
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
        {hover && (() => {
          const i = visible.indexOf(hover)
          if (i < 0) return null
          const [x, y] = pts[i]
          return (
            <g>
              <line x1={x} y1={0} x2={x} y2={H} stroke="var(--vr-cream-faint)" strokeWidth="0.6" strokeDasharray="1 3" />
              <circle cx={x} cy={y} r="3.5" fill="var(--vr-ink)" stroke="var(--vr-gold)" strokeWidth="1.3" />
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

// ─── Page composition ──────────────────────────────────────────────────────
export function ViresTradingHome({ data }: { data: ViresTradingData | null }) {
  // Fall back to a minimal empty-state when no feed exists, e.g. on a fresh
  // Vercel deploy before the data file is committed.
  if (!data) {
    return (
      <div style={{ padding: 32 }}>
        <CommandStrip />
        <div className="vr-card" style={{ marginTop: 24, padding: 32 }}>
          <div className="t-eyebrow" style={{ marginBottom: 8 }}>No data</div>
          <div className="t-label">
            data/operator-feed.json was not found.{" "}
            Run scripts/prepare-production-operator-feed.sh to generate it.
          </div>
        </div>
      </div>
    )
  }

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
      <CommandStrip mode="PAPER" />
      <div
        className="vr-screen"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <HomeHero
          account={data.account}
          onOpenTalon={() => {
            // Talon stub. Full chat panel ports in a follow-up commit.
            if (typeof window !== "undefined") {
              window.alert("Talon: chat panel ports next. Click registered.")
            }
          }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <SleeveCard
            sleeve="stocks"
            total={stockPositions.reduce((s, p) => s + (p.market_value ?? 0), 0)}
            count={stockPositions.length}
            todayPct={pctMove(stockPositions)}
          />
          <SleeveCard
            sleeve="options"
            total={optionPositions.reduce((s, p) => s + (p.market_value ?? 0), 0)}
            count={optionPositions.length}
            todayPct={pctMove(optionPositions)}
          />
          <SleeveCard
            sleeve="crypto"
            total={cryptoPositions.reduce((s, p) => s + (p.market_value ?? 0), 0)}
            count={cryptoPositions.length}
            todayPct={pctMove(cryptoPositions)}
          />
        </div>

        <EquityChart curve={data.equity_curve} baseValue={data.account.base_value} />
      </div>
    </>
  )
}
