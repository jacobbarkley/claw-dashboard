"use client"

// Vires Capital — shared primitives, ported from the design handoff
// (_design_handoff/vires_capital/files/vires-shared.jsx). Same component
// surface, but typed and refactored for Next.js patterns: no window globals,
// no ReactDOM.createPortal targeting #app-frame, no React UMD assumptions.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

// ─── Formatting helpers ──────────────────────────────────────────────────────

export const fmtCurrency = (
  n: number,
  opts: { sign?: boolean; compact?: boolean; digits?: number } = {},
): string => {
  const { sign = false, compact = false, digits = 2 } = opts
  const abs = Math.abs(n)
  const signChar = n > 0 ? (sign ? "+" : "") : n < 0 ? "−" : ""
  let body: string
  if (compact && abs >= 1000) {
    if (abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(2)}M`
    else body = `${(abs / 1000).toFixed(1)}K`
  } else {
    body = abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
  }
  return `${signChar}$${body}`
}

export const fmtPct = (n: number, opts: { sign?: boolean; digits?: number } = {}): string => {
  const { sign = false, digits = 2 } = opts
  const signChar = n > 0 ? (sign ? "+" : "") : n < 0 ? "−" : ""
  return `${signChar}${Math.abs(n).toFixed(digits)}%`
}

export const fmtNum = (n: number, digits = 2): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })

export type Tone = "up" | "down" | "flat"
export const toneOf = (n: number | null | undefined): Tone =>
  n == null ? "flat" : n > 0 ? "up" : n < 0 ? "down" : "flat"
export const toneColor = (t: Tone): string =>
  t === "up" ? "var(--vr-up)" : t === "down" ? "var(--vr-down)" : "var(--vr-cream-mute)"

// ─── AnimatedNumber ──────────────────────────────────────────────────────────
// Tweens between previous and next values over `duration` ms. The handoff
// version used cubic ease-out; preserved here.

export function AnimatedNumber({
  value,
  format = (v: number) => fmtNum(v),
  duration = 700,
}: {
  value: number
  format?: (v: number) => string
  duration?: number
}) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const start = prev.current
    const end = value
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const e = 1 - Math.pow(1 - p, 3)
      setDisplay(start + (end - start) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
      else prev.current = end
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <span className="t-num">{format(display)}</span>
}

// ─── EquityDisplay ───────────────────────────────────────────────────────────
// Financial-statement equity styling: small superscript dollar sign + comma
// separated whole + dim cents. Tweens through value changes.

export function EquityDisplay({ value, size = 44 }: { value: number; size?: number }) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const start = prev.current
    const end = value
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 700)
      const e = 1 - Math.pow(1 - p, 3)
      setDisplay(start + (end - start) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
      else prev.current = end
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  const abs = Math.abs(display)
  const whole = Math.floor(abs)
  const cents = Math.round((abs - whole) * 100).toString().padStart(2, "0")
  return (
    <span className="t-equity" style={{ fontSize: size }}>
      <span className="dollar">$</span>
      <span className="whole">{whole.toLocaleString("en-US")}</span>
      <span className="sep">.</span>
      <span className="cents">{cents}</span>
    </span>
  )
}

// ─── OrbitRing — decorative, hero-only ───────────────────────────────────────

export function OrbitRing({ size = 260, offsetX = -40, offsetY = -40 }: {
  size?: number
  offsetX?: number
  offsetY?: number
}) {
  return (
    <div
      className="orbit-ring"
      style={{ width: size, height: size, top: offsetY, right: offsetX }}
    >
      <div className="orbit-spin" style={{ width: "100%", height: "100%", position: "relative" }}>
        <div className="orbit-node" />
      </div>
    </div>
  )
}

// ─── Starfield ──────────────────────────────────────────────────────────────
// Drifting particles behind the hero. The handoff renders this via a portal
// into #app-frame; in our Next.js layout we render it as a normal child of
// the hero (absolute-positioned to fill the parent), which avoids the portal
// dependency and keeps the starfield contained to its surface.

export function Starfield({ count = 40, seed = 1 }: { count?: number; seed?: number }) {
  const stars = useMemo(() => {
    let s = seed
    const rand = () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }
    return Array.from({ length: count }, () => ({
      left: `${rand() * 100}%`,
      top: `${rand() * 100}%`,
      size: rand() > 0.9 ? 1.8 : rand() > 0.5 ? 1.1 : 0.7,
      driftX: (rand() - 0.5) * 14,
      driftY: (rand() - 0.5) * 14,
      driftDur: 90 + rand() * 80,
      twinkleDur: 3 + rand() * 5,
      twinkleDelay: rand() * 8,
      min: 0.06 + rand() * 0.12,
      max: 0.3 + rand() * 0.4,
      hue: rand() > 0.85 ? "gold" : "cream",
    }))
  }, [count, seed])

  return (
    <div className="orbit-field">
      <div className="orbit-nebula" />
      {stars.map((star, i) => (
        <span
          key={i}
          className={`star star-${star.hue}`}
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            ["--dx" as string]: `${star.driftX}px`,
            ["--dy" as string]: `${star.driftY}px`,
            ["--drift-dur" as string]: `${star.driftDur}s`,
            ["--twinkle-dur" as string]: `${star.twinkleDur}s`,
            ["--twinkle-delay" as string]: `${star.twinkleDelay}s`,
            ["--twinkle-min" as string]: star.min,
            ["--twinkle-max" as string]: star.max,
          } as CSSProperties}
        />
      ))}
    </div>
  )
}

// ─── ViresMark — wordmark ────────────────────────────────────────────────────

export function ViresMark({ size = 20 }: { size?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      <svg width={size * 0.9} height={size * 0.9} viewBox="0 0 24 24">
        <path d="M3 4 L12 21 L21 4" stroke="var(--vr-gold)" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="21" r="1.1" fill="var(--vr-gold)" />
      </svg>
      <span className="t-display" style={{ fontSize: size }}>
        Vires<span className="t-accent"> Capital</span>
      </span>
    </div>
  )
}

// ─── Delta — colored up/down inline indicator ────────────────────────────────

export function Delta({
  value,
  format = (v: number) => fmtPct(v),
  size = "var(--fs-body)",
}: {
  value: number
  format?: (v: number) => string
  size?: string | number
}) {
  const t = toneOf(value)
  const c = toneColor(t)
  return (
    <span
      className="t-num"
      style={{ color: c, fontSize: size, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      {t === "up" ? "▲" : t === "down" ? "▼" : "■"} {format(value)}
    </span>
  )
}

// ─── StatusPill — eyebrow-typography pill with optional pulse dot ────────────

export type PillTone = "up" | "down" | "gold" | "warn" | "neutral"

export function StatusPill({
  tone = "neutral",
  pulse = false,
  children,
}: {
  tone?: PillTone
  pulse?: boolean
  children: React.ReactNode
}) {
  const map: Record<PillTone, { c: string; bg: string }> = {
    up:      { c: "var(--vr-up)",         bg: "var(--vr-up-soft)" },
    down:    { c: "var(--vr-down)",       bg: "var(--vr-down-soft)" },
    gold:    { c: "var(--vr-gold)",       bg: "var(--vr-gold-soft)" },
    warn:    { c: "var(--vr-gold)",       bg: "var(--vr-gold-soft)" },
    neutral: { c: "var(--vr-cream-dim)",  bg: "rgba(241,236,224,0.04)" },
  }
  const s = map[tone]
  return (
    <span
      className="t-eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px 2px",
        background: s.bg,
        color: s.c,
        borderRadius: 2,
        border: `1px solid ${s.c}22`,
      }}
    >
      {pulse && <span className="vr-pulse-dot" style={{ background: s.c }} />}
      {children}
    </span>
  )
}

// ─── SectionHeader ──────────────────────────────────────────────────────────

export function SectionHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string
  title?: string
  right?: React.ReactNode
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 }}>
      <div>
        {eyebrow && <div className="t-eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        {title && <div className="t-h3">{title}</div>}
      </div>
      {right}
    </div>
  )
}

// ─── SleeveChip ─────────────────────────────────────────────────────────────

export type Sleeve = "stocks" | "options" | "crypto"
const SLEEVE_MAP: Record<Sleeve, { color: string; label: string }> = {
  stocks:  { color: "var(--vr-sleeve-stocks)",  label: "Stocks" },
  options: { color: "var(--vr-sleeve-options)", label: "Options" },
  crypto:  { color: "var(--vr-sleeve-crypto)",  label: "Crypto" },
}

export function SleeveChip({ sleeve, label }: { sleeve: Sleeve; label?: string }) {
  const s = SLEEVE_MAP[sleeve]
  const display = label ?? s.label
  return (
    <span
      className="t-eyebrow"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, color: s.color }}
    >
      <span style={{ width: 4, height: 4, borderRadius: 0, background: s.color }} />
      {display}
    </span>
  )
}

export const sleeveColor = (sleeve: Sleeve): string => SLEEVE_MAP[sleeve].color
