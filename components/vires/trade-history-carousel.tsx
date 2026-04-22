"use client"

// Trade history — swipeable carousel between two derived views of the
// per-passport raw trade ledger. Implementation of Passport v2 §7 /
// §6-adjacent (carousel wrapper around the trade_history ledger).
//
//   Slide 1 · Allocation stream — stacked area chart of per-symbol weight
//             across the evaluation window. Answers "what did this
//             strategy HOLD over time?"
//   Slide 2 · Symbol contribution — horizontal bars sorted by realized
//             P&L. Answers "who made the money?"
//
// Both views derive from the same raw rows. One data source, multiple
// views — matches Codex's §7 "one ledger feeding multiple views" shape.
// When a third view gets added later (drawdown by position, holding
// period, etc.) it's a frontend-only iteration with no contract change.

import { useEffect, useMemo, useRef, useState } from "react"
import type { PassportTradeHistory, PassportTradeHistoryRow } from "./passport-view"

// ─── Aggregators ───────────────────────────────────────────────────────────

interface AllocationSnapshot {
  date: string
  holdings: Record<string, number>  // symbol → weight (0..1)
  cashWeight: number                // 1 - sum(holdings)
  symbolsInPlay: string[]           // symbols with non-zero weight at this date
}

interface AllocationStream {
  snapshots: AllocationSnapshot[]
  allSymbols: string[]              // ordered union of every symbol that ever held weight
}

// Fold the raw ledger into a time series of portfolio snapshots. `weight_after`
// is the post-event portfolio weight of the traded symbol; other symbols carry
// forward from the previous snapshot. A SELL whose weight_after is 0 removes
// the symbol. Cash is implicit: 1 - sum(held-symbol-weights). Snapshot is
// emitted for every distinct date with at least one trade.
function buildAllocationStream(rows: PassportTradeHistoryRow[]): AllocationStream {
  const validRows = rows
    .filter(r => r.date && r.symbol && r.weight_after != null)
    .slice()
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0))

  const snapshots: AllocationSnapshot[] = []
  const holdings: Record<string, number> = {}
  const seen = new Set<string>()
  let currentDate: string | null = null

  for (const row of validRows) {
    const { date, symbol, weight_after } = row
    if (!date || !symbol) continue
    const nextWeight = weight_after ?? 0

    if (currentDate !== null && date !== currentDate) {
      // Emit a snapshot for the just-closed date before moving on.
      snapshots.push(snapshot(currentDate, holdings))
    }
    currentDate = date

    if (nextWeight <= 1e-6) delete holdings[symbol]
    else holdings[symbol] = nextWeight
    seen.add(symbol)
  }

  if (currentDate !== null) {
    snapshots.push(snapshot(currentDate, holdings))
  }

  const allSymbols = Array.from(seen)
  return { snapshots, allSymbols }
}

function snapshot(date: string, holdings: Record<string, number>): AllocationSnapshot {
  const clone = { ...holdings }
  const symbolsInPlay = Object.keys(clone).filter(s => clone[s] > 1e-6)
  const cashWeight = Math.max(0, 1 - symbolsInPlay.reduce((s, sym) => s + clone[sym], 0))
  return { date, holdings: clone, cashWeight, symbolsInPlay }
}

interface SymbolContribution {
  symbol: string
  realizedPnl: number     // sum of pnl_realized across rows for this symbol
  tradeCount: number      // total rows that touched this symbol
  exitCount: number       // rows with non-null pnl_realized (realized exits)
}

// Sum realized P&L per symbol. Sort descending by P&L so the "who made the
// money" story reads left-to-right without the caller having to re-sort.
function buildSymbolContribution(rows: PassportTradeHistoryRow[]): SymbolContribution[] {
  const by = new Map<string, SymbolContribution>()
  for (const row of rows) {
    if (!row.symbol) continue
    const entry = by.get(row.symbol) ?? {
      symbol: row.symbol,
      realizedPnl: 0,
      tradeCount: 0,
      exitCount: 0,
    }
    entry.tradeCount += 1
    if (row.pnl_realized != null && Number.isFinite(row.pnl_realized)) {
      entry.realizedPnl += row.pnl_realized
      entry.exitCount += 1
    }
    by.set(row.symbol, entry)
  }
  return Array.from(by.values()).sort((a, b) => b.realizedPnl - a.realizedPnl)
}

// ─── Deterministic palette ─────────────────────────────────────────────────
// Hash the symbol into a fixed palette so NVDA always gets the same color
// across reloads and across views (stream + contribution use the same color
// map — a bar for NVDA in contribution reads as the same NVDA band in the
// stream, without the user having to consult a legend).

const PALETTE = [
  "#c8a968", // gold
  "#8faac6", // slate
  "#a692d4", // violet
  "#7fc29b", // sage
  "#d4a85c", // amber
  "#b8ad95", // dim cream
  "#d97a6b", // rust
  "#8ab4d4", // sky
  "#c7b58f", // champagne
  "#9fbfa8", // muted green
]

function symbolColor(symbol: string): string {
  let h = 0
  for (let i = 0; i < symbol.length; i += 1) {
    h = (h * 31 + symbol.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(h) % PALETTE.length]
}

const CASH_COLOR = "var(--vr-cream-faint)"

// ─── Allocation stream chart ───────────────────────────────────────────────

function fmtDateCompact(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

function AllocationStreamChart({ stream }: { stream: AllocationStream }) {
  const { snapshots, allSymbols } = stream
  const W = 600
  const H = 220

  if (snapshots.length < 2) {
    return (
      <div
        className="t-read"
        style={{
          padding: "18px 20px",
          fontStyle: "italic",
          fontFamily: "var(--ff-serif)",
          color: "var(--vr-cream-faint)",
          fontSize: 12,
        }}
      >
        Not enough dated rows to build an allocation stream. One-trade
        strategies render as a single-point view — come back when the
        ledger has more motion.
      </div>
    )
  }

  // Sort symbols by the integral of their weight across the window so large
  // long-term positions stack toward the bottom (visual anchor) and
  // briefly-held positions stack on top.
  const weightSum: Record<string, number> = {}
  for (const snap of snapshots) {
    for (const sym of Object.keys(snap.holdings)) {
      weightSum[sym] = (weightSum[sym] ?? 0) + snap.holdings[sym]
    }
  }
  const stackedSymbols = [...allSymbols].sort((a, b) => (weightSum[b] ?? 0) - (weightSum[a] ?? 0))

  // For each snapshot build a cumulative-y array so we can draw band polygons.
  const xFor = (i: number) => (i / Math.max(1, snapshots.length - 1)) * W
  const yFor = (w: number) => H - w * H

  type Band = { symbol: string; color: string; upper: number[]; lower: number[] }
  const bands: Band[] = []
  const cumulative = new Array(snapshots.length).fill(0) as number[]

  // Cash first (bottom of the stack) so user-held symbols float above.
  const cashUpper: number[] = snapshots.map((s, i) => (cumulative[i] += s.cashWeight))
  // Use fresh arrays so layering is clean.
  const cashLower: number[] = snapshots.map(() => 0)
  bands.push({
    symbol: "__CASH__",
    color: CASH_COLOR,
    upper: cashUpper,
    lower: cashLower,
  })

  for (const symbol of stackedSymbols) {
    const lower = cumulative.slice()
    const upper = snapshots.map((snap, i) => (cumulative[i] += snap.holdings[symbol] ?? 0))
    bands.push({
      symbol,
      color: symbolColor(symbol),
      upper: upper.slice(),
      lower,
    })
  }

  // Build a closed path per band by walking upper forward + lower back.
  const pathFor = (band: Band) => {
    const forward = band.upper
      .map((w, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(2)},${yFor(w).toFixed(2)}`)
      .join(" ")
    const reverse = band.lower
      .map((w, i) => `L${xFor(i).toFixed(2)},${yFor(w).toFixed(2)}`)
      .reverse()
      .join(" ")
    return `${forward} ${reverse} Z`
  }

  return (
    <div style={{ padding: "8px 14px 14px" }}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ display: "block", overflow: "visible" }}
      >
        {bands.map(band => (
          <path
            key={band.symbol}
            d={pathFor(band)}
            fill={band.color}
            opacity={band.symbol === "__CASH__" ? 0.18 : 0.65}
            stroke={band.symbol === "__CASH__" ? "none" : band.color}
            strokeOpacity={0.9}
            strokeWidth={band.symbol === "__CASH__" ? 0 : 0.4}
          />
        ))}
      </svg>

      {/* Axis labels */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--ff-mono)",
          fontSize: 9,
          color: "var(--vr-cream-faint)",
          marginTop: 6,
        }}
      >
        <span>{fmtDateCompact(snapshots[0].date)}</span>
        <span>{fmtDateCompact(snapshots[snapshots.length - 1].date)}</span>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 12,
          fontFamily: "var(--ff-sans)",
          fontSize: 10,
        }}
      >
        <LegendDot color={CASH_COLOR} label="Cash" muted />
        {stackedSymbols.map(sym => (
          <LegendDot key={sym} color={symbolColor(sym)} label={sym} />
        ))}
      </div>
    </div>
  )
}

function LegendDot({ color, label, muted }: { color: string; label: string; muted?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        color: muted ? "var(--vr-cream-mute)" : "var(--vr-cream-dim)",
        fontFamily: "var(--ff-mono)",
        letterSpacing: "0.04em",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: 2,
          background: color,
          opacity: muted ? 0.6 : 0.85,
        }}
      />
      {label}
    </span>
  )
}

// ─── Symbol contribution bars ──────────────────────────────────────────────

function fmtUsd(v: number): string {
  const sign = v >= 0 ? "+" : "−"
  const abs = Math.abs(v)
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

function SymbolContributionBars({ contributions }: { contributions: SymbolContribution[] }) {
  if (contributions.length === 0) {
    return (
      <div
        className="t-read"
        style={{
          padding: "18px 20px",
          fontStyle: "italic",
          fontFamily: "var(--ff-serif)",
          color: "var(--vr-cream-faint)",
          fontSize: 12,
        }}
      >
        No realized P&L rows on the ledger yet — contribution lights up once
        positions start closing.
      </div>
    )
  }

  const maxAbs = Math.max(...contributions.map(c => Math.abs(c.realizedPnl)), 1)
  const positives = contributions.filter(c => c.realizedPnl >= 0)
  const negatives = contributions.filter(c => c.realizedPnl < 0)

  return (
    <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
      {[...positives, ...negatives].map(c => {
        const pct = (Math.abs(c.realizedPnl) / maxAbs) * 100
        const isPositive = c.realizedPnl >= 0
        return (
          <div
            key={c.symbol}
            style={{
              display: "grid",
              gridTemplateColumns: "58px 1fr 64px",
              alignItems: "center",
              gap: 8,
              padding: "2px 0",
            }}
          >
            <div
              className="t-ticker"
              style={{
                fontSize: 11,
                color: symbolColor(c.symbol),
                textTransform: "none",
                fontFamily: "var(--ff-mono)",
              }}
            >
              {c.symbol}
            </div>
            <div
              style={{
                height: 14,
                position: "relative",
                background: "rgba(241,236,224,0.04)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${pct}%`,
                  background: isPositive ? "var(--vr-up)" : "var(--vr-down)",
                  opacity: 0.72,
                }}
              />
            </div>
            <div
              className="t-num"
              style={{
                fontSize: 11,
                fontFamily: "var(--ff-mono)",
                textAlign: "right",
                color: isPositive ? "var(--vr-up)" : "var(--vr-down)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtUsd(c.realizedPnl)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Carousel wrapper ──────────────────────────────────────────────────────
// CSS scroll-snap container + controlled page dots. The scroll position
// updates the active slide; clicking a dot or a title pill scrolls to that
// slide. touch-action: pan-x inside the carousel so horizontal swipe drives
// the pager; vertical page scroll still works because the outer document
// handles it (we don't capture vertical movement).

const SLIDE_TITLES = ["Allocation stream", "Symbol contribution"] as const

export function TradeHistoryCarousel({ history }: { history: PassportTradeHistory }) {
  const rows = history.rows ?? []
  const stream = useMemo(() => buildAllocationStream(rows), [rows])
  const contributions = useMemo(() => buildSymbolContribution(rows), [rows])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1))
      setActiveIdx(Math.max(0, Math.min(SLIDE_TITLES.length - 1, idx)))
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  const scrollToSlide = (idx: number) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Title pills — tapping either one also acts as a dot. */}
      <div style={{ display: "flex", gap: 8, padding: "0 14px" }}>
        {SLIDE_TITLES.map((title, idx) => {
          const active = idx === activeIdx
          return (
            <button
              key={title}
              type="button"
              onClick={() => scrollToSlide(idx)}
              className="t-eyebrow"
              style={{
                padding: "5px 10px",
                background: active ? "var(--vr-gold)" : "transparent",
                color: active ? "var(--vr-ink)" : "var(--vr-cream-mute)",
                border: "1px solid var(--vr-line)",
                borderColor: active ? "var(--vr-gold)" : "var(--vr-line)",
                borderRadius: 2,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.14em",
                cursor: "pointer",
              }}
            >
              {title}
            </button>
          )
        })}
      </div>

      {/* Scroll-snap slides. */}
      <div
        ref={scrollRef}
        style={{
          display: "flex",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x",
          scrollbarWidth: "none",
        }}
      >
        <div
          style={{
            flex: "0 0 100%",
            scrollSnapAlign: "start",
          }}
        >
          <AllocationStreamChart stream={stream} />
        </div>
        <div
          style={{
            flex: "0 0 100%",
            scrollSnapAlign: "start",
          }}
        >
          <SymbolContributionBars contributions={contributions} />
        </div>
      </div>

      {/* Page dots. */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
        {SLIDE_TITLES.map((title, idx) => (
          <button
            key={title}
            type="button"
            onClick={() => scrollToSlide(idx)}
            aria-label={`Show ${title}`}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              border: "none",
              padding: 0,
              background: idx === activeIdx ? "var(--vr-gold)" : "rgba(241,236,224,0.2)",
              cursor: "pointer",
              transition: "background 150ms ease",
            }}
          />
        ))}
      </div>
    </div>
  )
}
