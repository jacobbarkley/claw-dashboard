"use client"

// Vires Capital — shared primitives, ported from the design handoff
// (_design_handoff/vires_capital/files/vires-shared.jsx). Same component
// surface, but typed and refactored for Next.js patterns: no window globals,
// no ReactDOM.createPortal targeting #app-frame, no React UMD assumptions.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

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

// ─── Glossary + InfoPop ─────────────────────────────────────────────────────
// Inline "i" button that opens a definition modal. Good for jargon that
// doesn't fit in a card subtitle but should be one tap away. Ported from
// the design handoff's vires-shared.jsx.

export interface GlossaryEntry {
  title: string
  full: string
  body: string
}

export const VIRES_GLOSSARY: Record<string, GlossaryEntry> = {
  VIX: {
    title: "VIX",
    full: "Cboe Volatility Index",
    body: "Market\u2019s 30-day forward expectation of S&P 500 volatility, derived from option prices. Often called the \u201Cfear gauge.\u201D Below 15 is calm; 15\u201325 is normal; 25\u201335 is elevated; above 35 is stressed.",
  },
  HMM: {
    title: "HMM",
    full: "Hidden Markov Model",
    body: "A statistical model that infers the current \u201Cregime\u201D of the market (e.g. trend, mean-reverting, chaotic) from observable price / volume signals. We use it to gate which strategies are allowed to trade.",
  },
  Jump: {
    title: "Jump Variation",
    full: "Realized Jump Stress",
    body: "A measure of how much of recent price action came from sudden discontinuous moves (gaps, news shocks) versus smooth diffusion. High jump stress means the market is being driven by surprise events, not orderly flow.",
  },
  Sharpe: {
    title: "Sharpe Ratio",
    full: "Risk-Adjusted Return",
    body: "Return per unit of volatility. Above 1.0 is strong; above 2.0 is excellent. Tells you whether returns came from skill or just from taking more risk.",
  },
  Sortino: {
    title: "Sortino Ratio",
    full: "Downside-Adjusted Return",
    body: "Like Sharpe, but only penalizes downside volatility. Rewards strategies that have big up days but controlled losses.",
  },
  Calmar: {
    title: "Calmar Ratio",
    full: "Return \u00F7 Max Drawdown",
    body: "Annualized return divided by worst peak-to-trough loss. Answers: \u201Cwas the ride worth the dip?\u201D Our primary success metric for crypto.",
  },
  MaxDD: {
    title: "Max Drawdown",
    full: "Worst Peak-to-Trough Loss",
    body: "The largest percentage decline from a portfolio peak before recovering. Lower is better \u2014 measures the worst pain you would have endured holding the strategy.",
  },
  ProfitFactor: {
    title: "Profit Factor",
    full: "Gross Profit \u00F7 Gross Loss",
    body: "Total winning P&L divided by total losing P&L. Above 1.5 is healthy; above 2.0 is excellent. A direct measure of how much winners outweigh losers.",
  },
  WinRate: {
    title: "Win Rate",
    full: "Percentage of Profitable Trades",
    body: "Share of trades that closed positive. High win rate doesn\u2019t guarantee profitability \u2014 combine with average win / loss size for the full picture.",
  },
  Plateau: {
    title: "Parameter Plateau",
    full: "Local Stability Check",
    body: "Backtests rank candidates by score \u2014 but the highest score is often a lucky peak that collapses under small parameter shifts. A plateau is a region where many nearby configurations all do well. The bench\u2019s plateau gate separates real edge from lucky parameter alignment.",
  },
  MedEraSharpe: {
    title: "Med Era Sharpe",
    full: "Median Sharpe Across Eras",
    body: "Median of the per-era Sharpe ratios across the bench\u2019s catalog of regime windows (e.g. 2017 Mania, 2021\u201322 Bear Reset). A high single-era Sharpe doesn\u2019t survive regime change; the median forces the candidate to earn its rank across every era, not just one favorable slice.",
  },
  TotalReturn: {
    title: "Total Return",
    full: "Net Compounded Return",
    body: "Full-period net return after modeled fees and slippage. A headline number \u2014 loud but not risk-aware. Always read alongside max drawdown and Sharpe to avoid confusing \u201Cbig number\u201D with \u201Cgood strategy.\u201D",
  },
  VsBench: {
    title: "vs Benchmark",
    full: "Excess Return Over Benchmark",
    body: "Strategy return minus the benchmark\u2019s return over the same window. For stocks, the benchmark is usually SPY; for crypto, buy-and-hold BTC. A positive number alone is not enough \u2014 the excess has to come with comparable or lower risk.",
  },
  VsHODL: {
    title: "vs HODL",
    full: "Excess Return Over Buy-and-Hold",
    body: "Strategy return minus the naive buy-and-hold return. For crypto specifically, beating HODL on raw return is not the goal \u2014 risk-adjusted participation is. A Calmar improvement with modest or even negative excess can still be the right trade.",
  },
  LeaderStability: {
    title: "Leader Stability",
    full: "Sessions the Current Leader Has Held",
    body: "Number of consecutive research sessions the current leader candidate has held its position before being unseated. High values mean stable conviction; low values mean the campaign is still churning through candidates.",
  },
  LastRun: {
    title: "Last Run",
    full: "Freshness of the Latest Bench Run",
    body: "When the most recent bench run landed on this campaign. A stale last-run signal means the thesis isn\u2019t being actively stress-tested right now and the numbers you\u2019re seeing may be dated.",
  },
  ParamSweep: {
    title: "Param Sweep",
    full: "Last Parameter Search Across Variants",
    body: "When the last parameter search ran across this campaign\u2019s variants. Different from \u201Clast run\u201D because not every run is a sweep \u2014 a sweep tests many configurations together, a run is one configuration on fresh data.",
  },
  CandidatesCount: {
    title: "Candidates",
    full: "Strategy Variants Under This Thesis",
    body: "Number of strategy variants checked into this campaign. Variants compete under the same thesis \u2014 different implementations of the same research question, grouped into families.",
  },
  RunnerUpGap: {
    title: "Runner-up Gap",
    full: "Distance Between the Leader and the Next-Best Candidate",
    body: "How far the second-best candidate trails the leader on the load-bearing metrics (return, Sharpe, drawdown). \u201CNot quantified\u201D is a legitimate state \u2014 it means the candidates haven\u2019t had enough fresh runs on matching windows for an honest delta to be computed yet.",
  },
  // ─ Promotion readiness gates (Passport v2 §4.1) ─
  PromotionReadiness: {
    title: "Promotion Readiness",
    full: "Live Scorecard of the Promotion Gates",
    body: "Every gate the bench runs against a challenger. When all gates pass, the operator can nominate the candidate for promotion into the production ledger. The scorecard updates on every new run; \u201Cnominate\u201D is a one-tap action, but the operator always confirms \u2014 promotion never auto-fires.",
  },
  Gate_TRADE_COUNT: {
    title: "Trade Count",
    full: "Number of Trades in the Evaluation Window",
    body: "Too-few-trades is a statistical red flag \u2014 the sample is too small to trust the returns. This gate sets a floor (e.g. 50 trades) below which we refuse to claim the strategy has proven itself.",
  },
  Gate_PROFIT_FACTOR: {
    title: "Profit Factor",
    full: "Gross Profit \u00F7 Gross Loss",
    body: "Total winning P&L divided by total losing P&L. Above 1.5 is healthy; above 2.0 is strong. Direct measure of how much winners outweigh losers in dollar terms.",
  },
  Gate_EXPECTANCY: {
    title: "Expectancy",
    full: "Average P&L per Trade",
    body: "Mean dollar P&L per trade after fees. Positive expectancy is the minimum bar; the threshold here asks for positive-enough to justify turnover costs and slippage in live execution.",
  },
  Gate_PROFITABLE_FOLDS: {
    title: "Profitable Folds",
    full: "Share of Era-Folds with Positive Net P&L",
    body: "Across the bench\u2019s cross-validation folds, how many finished in the green. A strategy that only makes money in one fold is leaning on a lucky slice; we want breadth of wins, not a single outlier window.",
  },
  Gate_DRAWDOWN: {
    title: "Drawdown Gate",
    full: "Max Drawdown Within Bound",
    body: "Largest peak-to-trough loss across the evaluation window, bounded below a ceiling (e.g. \u221215%). Anything that looks great in aggregate but had an unsurvivable dip along the way fails this gate \u2014 the ride has to be tolerable, not just the destination.",
  },
  Gate_BENCHMARK: {
    title: "Benchmark Gate",
    full: "Excess Return vs. Benchmark",
    body: "Strategy return minus the benchmark\u2019s return on the same window. Positive excess is necessary but not sufficient \u2014 the other gates (drawdown, era robustness) make sure the excess didn\u2019t come from riding more risk.",
  },
  Gate_EXPECTANCY_DECAY: {
    title: "Expectancy Decay",
    full: "Forward-Period Expectancy vs. Training Expectancy",
    body: "How much the per-trade expectancy deteriorates between the training window and the forward-test window. Strong decay is overfitting\u2019s signature: the strategy learned a historical quirk that didn\u2019t generalize.",
  },
  Gate_HOLDBACK: {
    title: "Holdback Window",
    full: "Out-of-Sample Result on the Held-Back Segment",
    body: "A deliberately excluded segment of history that the optimizer never saw. Positive performance here is the honest test \u2014 the strategy is making money on data it wasn\u2019t fit to.",
  },
  Gate_ERA_ROBUSTNESS: {
    title: "Era Robustness",
    full: "Per-Era Pass Count Across the Bench Era Matrix",
    body: "Sharpe and returns are re-measured across each named historical era (e.g. 2023 H1, 2024 H2). This gate demands the strategy pass in every era, not just the favorable ones \u2014 if it survives every regime on the bench, it has a shot at surviving the next one.",
  },
  // ─ Promotion lifecycle events (Passport v2 §6) ─
  Event_PROMOTION_NOMINATED: {
    title: "Promotion Nominated",
    full: "Auto-nomination after Gates Passed",
    body: "Backend raised this event when the campaign\u2019s readiness scorecard flipped to READY_TO_NOMINATE. The operator still has to confirm \u2014 nomination is the bell, not the promotion.",
  },
  Event_PROMOTION_CONFIRMED: {
    title: "Promotion Confirmed",
    full: "Operator Graduated the Candidate into Production",
    body: "The operator confirmed the nomination and the strategy bank committed or updated the passport record in the slot. The record enters the CONFIRMING stage \u2014 in production ledger, still in monitoring.",
  },
  Event_PASSPORT_SUPERSEDED: {
    title: "Passport Superseded",
    full: "An Older Record Was Archived in the Same Slot",
    body: "A new promotion replaced the prior record at this passport role. The old record is archived (not deleted) for audit. Slot-based replacement means \u201Csame role, new record\u201D \u2014 never destructive overwrite.",
  },
  Event_CAMPAIGN_MONITORED: {
    title: "Campaign Monitored",
    full: "Campaign Moved Into Monitored State Post-Promotion",
    body: "After a confirmed promotion, the originating campaign stays open in a monitored state. It can be reopened if the promoted candidate later fails on paper \u2014 campaigns are durable research memory.",
  },
  Event_CAMPAIGN_REOPENED: {
    title: "Campaign Reopened",
    full: "Monitored Campaign Returned to Active Research",
    body: "A demotion on the promoted passport kicked the campaign back into active research. Same campaign_id, history appended, baseline reverted. No fresh campaign created.",
  },
  Event_DEMOTION_RECOMMENDED: {
    title: "Demotion Recommended",
    full: "Paper Monitoring Tripped a Threshold",
    body: "Backend surfaced that the promoted record should be demoted based on paper monitoring thresholds. This is a recommendation; the operator confirms to actually demote.",
  },
  Event_DEMOTION_CONFIRMED: {
    title: "Demotion Confirmed",
    full: "Operator Removed the Record from Production",
    body: "The operator confirmed the demotion. The passport record transitions to DEMOTED (alive as research input, not active in production). The originating campaign reopens.",
  },
}

export function InfoPop({ term, size = 12 }: { term: string; size?: number }) {
  const [open, setOpen] = useState(false)
  const def = VIRES_GLOSSARY[term]
  if (!def) return null

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        aria-label={`What is ${def.title}?`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: "50%",
          background: "rgba(241, 236, 224, 0.06)",
          border: "1px solid var(--vr-line)",
          color: "var(--vr-cream-mute)",
          fontSize: Math.max(9, size - 4),
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          fontWeight: 500,
          cursor: "pointer",
          padding: 0,
          marginLeft: 5,
          verticalAlign: "middle",
          lineHeight: 1,
        }}
      >
        i
      </button>
      {open && <DefinitionModal def={def} onClose={() => setOpen(false)} />}
    </>
  )
}

function DefinitionModal({ def, onClose }: { def: GlossaryEntry; onClose: () => void }) {
  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Portal into document.body so the fixed overlay escapes any
  // backdrop-filter / transform / filter ancestor that would otherwise
  // pin it to the card it was triggered from. Without this, .vr-card's
  // backdrop-filter constrains the modal to the card and the CLOSE
  // button gets clipped / other cards stack over it.
  if (typeof document === "undefined") return null

  const overlay = (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 14, 0.68)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 1000,
        animation: "vr-def-fade 180ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Definition: ${def.title}`}
        style={{
          width: "100%",
          maxWidth: 340,
          padding: "20px 22px",
          background: "var(--vr-ink-raised)",
          border: "1px solid var(--vr-gold-line)",
          borderRadius: "var(--r-card)",
          boxShadow: "0 30px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(200, 169, 104, 0.08)",
          animation: "vr-def-pop 220ms cubic-bezier(.2, .9, .3, 1.2)",
        }}
      >
        <div className="t-eyebrow" style={{ color: "var(--vr-gold)", marginBottom: 6 }}>
          Definition
        </div>
        <div className="t-h3" style={{ marginBottom: 2 }}>{def.title}</div>
        <div
          className="t-label"
          style={{
            fontSize: 11,
            fontStyle: "italic",
            color: "var(--vr-cream-mute)",
            marginBottom: 12,
          }}
        >
          {def.full}
        </div>
        <div
          className="t-read"
          style={{ fontSize: 13, lineHeight: 1.55, color: "var(--vr-cream-dim)" }}
        >
          {def.body}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 18,
            width: "100%",
            padding: "9px 12px",
            background: "transparent",
            border: "1px solid var(--vr-line-hi)",
            color: "var(--vr-cream)",
            fontFamily: "var(--ff-sans)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: "pointer",
            borderRadius: 2,
          }}
        >
          Close
        </button>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
