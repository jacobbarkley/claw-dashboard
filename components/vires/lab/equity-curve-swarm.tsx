"use client"

// <TradeAtlas /> — strategy + benchmark headline curves with a swarm of
// per-trade lines underneath, plus a draggable date-range brush for
// zoom. Built against the v1 mock contract from
//   _design_handoff/CODEX_PRIMER_2026-04-28_lab_equity_swarm_contract.md
//
// The exported name <EquityCurveSwarm /> is preserved for any callers
// that imported the earlier scaffold; new code should import TradeAtlas.
//
// Library-agnostic prop API: when we eventually swap Recharts for Visx
// (or ECharts at higher line counts), only the internals of this file
// change.

import { useMemo, useState } from "react"
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, Brush,
  ResponsiveContainer, ReferenceLine,
} from "recharts"
import type { EquitySwarmV1, EquitySwarmTrade } from "@/lib/research-lab-contracts"

type ScaleMode = "usd" | "pct"
type SortMode  = "recent" | "biggest_winners" | "biggest_losers"

interface Props {
  data: EquitySwarmV1
  initialScale?: ScaleMode
  onTradeSelect?: (trade: EquitySwarmTrade) => void
}

// ─── Palette ──────────────────────────────────────────────────────────────
//
// Trade swarm uses 5-shade ramps per side so adjacent lines are
// distinguishable as individual trades while still reading binary as
// winner vs loser at a glance. Indexed by trade order.

const WINNER_SHADES = ["#7cb98f", "#a8d4b5", "#5e9a72", "#94c8a3", "#6dab80"]
const LOSER_SHADES  = ["#c97a7a", "#d8a3a3", "#a8584f", "#bf8f8f", "#b66666"]
const OPEN_SHADE    = "var(--vr-gold)"

// ─── Formatting ───────────────────────────────────────────────────────────

function fmtUsdDelta(n: number): string {
  const sign = n >= 0 ? "+" : "−"
  const abs = Math.abs(n)
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtPctDelta(n: number): string {
  const sign = n >= 0 ? "+" : "−"
  return `${sign}${Math.abs(n).toFixed(2)}%`
}

function fmtFullUsd(n: number): string {
  const sign = n >= 0 ? "+" : "−"
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

// ─── Data prep ────────────────────────────────────────────────────────────

interface MergedRow {
  date: string
  strategy: number
  benchmark: number | null
  [tradeKey: string]: number | string | null
}

function buildRows(data: EquitySwarmV1, scale: ScaleMode): MergedRow[] {
  const start = data.starting_capital_usd
  const stratByDate = new Map(data.strategy_curve.map(p => [p.date, p]))
  const benchByDate = data.benchmark
    ? new Map(data.benchmark.curve.map(p => [p.date, p]))
    : null
  const tradeMaps = data.trades.map(t => ({
    id: t.trade_id,
    map: new Map(t.mtm_curve.map(p => [p.date, p])),
  }))

  const allDates = data.strategy_curve.map(p => p.date)

  return allDates.map(date => {
    const sp = stratByDate.get(date)
    const bp = benchByDate?.get(date)
    const row: MergedRow = {
      date,
      strategy: sp ? (scale === "usd" ? sp.value_usd - start : sp.value_pct) : 0,
      benchmark: bp ? (scale === "usd" ? bp.value_usd - start : bp.value_pct) : null,
    }
    for (const t of tradeMaps) {
      const p = t.map.get(date)
      if (!p) {
        row[t.id] = null
        continue
      }
      // Plot trade contribution in the same units as the headline.
      // USD: $ delta. PCT: $ delta / starting_capital so trades and
      // headline share dimensions ("% of fund moved").
      row[t.id] = scale === "usd" ? p.value_usd : (p.value_usd / start) * 100
    }
    return row
  })
}

// ─── Trade classification ────────────────────────────────────────────────

function tradeColor(trade: EquitySwarmTrade, idx: number): string {
  if (trade.status === "OPEN") return OPEN_SHADE
  if (trade.pnl_usd > 0) return WINNER_SHADES[idx % WINNER_SHADES.length]
  if (trade.pnl_usd < 0) return LOSER_SHADES[idx % LOSER_SHADES.length]
  return "var(--vr-cream-mute)"
}

function tradeOpacity(trade: EquitySwarmTrade, maxAbs: number): number {
  if (maxAbs <= 0) return 0.30
  const ratio = Math.abs(trade.pnl_usd) / maxAbs
  return 0.18 + 0.40 * ratio
}

// ─── Tooltip ──────────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  dataKey?: string | number
  value?: number | string | null
  color?: string
  name?: string
}

function ChartTooltip({
  active, payload, label, scale, trades,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
  scale: ScaleMode
  trades: EquitySwarmTrade[]
}) {
  if (!active || !payload?.length) return null
  const fmt = scale === "usd" ? fmtUsdDelta : fmtPctDelta

  // Dedupe headline series by dataKey (the strategy <Area> halo and
  // strategy <Line> both send "strategy" payloads). Walk in reverse so
  // the Line wins over the Area — the Line carries the green color.
  const head: TooltipPayloadItem[] = []
  const seen = new Set<string>()
  for (let i = payload.length - 1; i >= 0; i--) {
    const p = payload[i]
    if (p.dataKey !== "strategy" && p.dataKey !== "benchmark") continue
    const key = String(p.dataKey)
    if (seen.has(key)) continue
    seen.add(key)
    head.unshift(p)
  }
  const activeTradeRows = payload
    .filter(p =>
      typeof p.dataKey === "string" &&
      p.dataKey.startsWith("t_") &&
      p.value != null,
    )
    .map(p => {
      const trade = trades.find(t => t.trade_id === p.dataKey)
      return { p, trade }
    })
    .filter(r => r.trade != null)

  return (
    <div
      style={{
        background: "var(--vr-ink-raised)",
        border: "1px solid var(--vr-line-hi)",
        borderRadius: "var(--r-inset)",
        padding: "10px 12px",
        fontSize: 11,
        fontFamily: "var(--ff-mono)",
        color: "var(--vr-cream)",
        maxWidth: 240,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--vr-cream-mute)", marginBottom: 6 }}>
        {shortDate(String(label))}
      </div>
      {head.map(p => (
        <div key={String(p.dataKey)} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: p.color }}>
            {p.dataKey === "strategy" ? "strategy" : "benchmark"}
          </span>
          <span>{typeof p.value === "number" ? fmt(p.value) : "—"}</span>
        </div>
      ))}
      {activeTradeRows.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--vr-line)" }}>
          <div style={{ fontSize: 9, color: "var(--vr-cream-mute)", letterSpacing: "0.12em", marginBottom: 4 }}>
            ACTIVE TRADES
          </div>
          {activeTradeRows.slice(0, 6).map(({ p, trade }) => (
            <div key={String(p.dataKey)} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: p.color }}>{trade!.symbol}</span>
              <span>{typeof p.value === "number" ? fmt(p.value) : "—"}</span>
            </div>
          ))}
          {activeTradeRows.length > 6 && (
            <div style={{ fontSize: 10, color: "var(--vr-cream-mute)", marginTop: 2 }}>
              +{activeTradeRows.length - 6} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────

export function TradeAtlas({ data, initialScale = "usd", onTradeSelect }: Props) {
  const [scale, setScale] = useState<ScaleMode>(initialScale)
  const [sort, setSort]   = useState<SortMode>("biggest_winners")

  const rows = useMemo(() => buildRows(data, scale), [data, scale])
  const maxAbs = useMemo(
    () => data.trades.reduce((m, t) => Math.max(m, Math.abs(t.pnl_usd)), 0),
    [data.trades],
  )

  const sortedTrades = useMemo(() => {
    const arr = [...data.trades]
    switch (sort) {
      case "biggest_winners": return arr.sort((a, b) => b.pnl_usd - a.pnl_usd)
      case "biggest_losers":  return arr.sort((a, b) => a.pnl_usd - b.pnl_usd)
      default:                return arr.sort((a, b) => b.entry_date.localeCompare(a.entry_date))
    }
  }, [data.trades, sort])

  const tradeIndexById = useMemo(() => {
    const m = new Map<string, number>()
    data.trades.forEach((t, i) => m.set(t.trade_id, i))
    return m
  }, [data.trades])

  const headline = useMemo(() => {
    const lastStrat = data.strategy_curve[data.strategy_curve.length - 1]
    const lastBench = data.benchmark?.curve[data.benchmark.curve.length - 1]
    return {
      stratPct: lastStrat?.value_pct ?? 0,
      benchPct: lastBench?.value_pct ?? null,
    }
  }, [data])

  const fmt = scale === "usd" ? fmtUsdDelta : fmtPctDelta
  const haloId = `trade-atlas-strategy-halo-${scale}`

  return (
    <div className="vr-card" style={{ padding: 0, background: "var(--vr-ink)" }}>
      {/* Header strip */}
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--vr-line)",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontFamily: "var(--ff-serif)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--vr-cream)",
                lineHeight: 1.1,
              }}
            >
              Trade Atlas
            </h2>
            <InfoBubble>
              Strategy and benchmark on top. Every individual trade
              rendered as a thinner line underneath, anchored from
              entry to exit. Drag the handles below the chart to zoom
              into any sub-range.
            </InfoBubble>
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 10.5,
              color: "var(--vr-cream-mute)",
              fontFamily: "var(--ff-mono)",
            }}
          >
            {shortDate(data.date_range.start)} → {shortDate(data.date_range.end)} · {data.trades.length} trade{data.trades.length === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <ToggleChip active={scale === "usd"} onClick={() => setScale("usd")}>USD</ToggleChip>
          <ToggleChip active={scale === "pct"} onClick={() => setScale("pct")}>%</ToggleChip>
        </div>
      </div>

      {/* Headline numbers */}
      <div
        style={{
          padding: "14px 16px 6px",
          display: "flex",
          gap: 28,
          flexWrap: "wrap",
        }}
      >
        <HeadlineStat
          label="strategy"
          color="var(--vr-up)"
          primary={fmtPctDelta(headline.stratPct)}
        />
        {data.benchmark && headline.benchPct != null && (
          <>
            <HeadlineStat
              label={`benchmark · ${data.benchmark.symbol}`}
              color="var(--vr-benchmark)"
              primary={fmtPctDelta(headline.benchPct)}
            />
            <HeadlineStat
              label="excess"
              color="var(--vr-gold)"
              primary={fmtPctDelta(headline.stratPct - headline.benchPct)}
            />
          </>
        )}
      </div>

      {/* Chart */}
      <div style={{ padding: "8px 8px 4px" }}>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={haloId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="var(--vr-up)" stopOpacity="0.32" />
                <stop offset="55%"  stopColor="var(--vr-up)" stopOpacity="0.08" />
                <stop offset="100%" stopColor="var(--vr-up)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 10, fill: "#7b7892" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#7b7892" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => fmt(Number(v))}
              width={60}
            />
            <ReferenceLine y={0} stroke="rgba(120, 140, 200, 0.22)" strokeDasharray="3 3" />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
              content={<ChartTooltip scale={scale} trades={data.trades} />}
            />

            {/* Trade swarm — drawn first so headlines render on top */}
            {data.trades.map(trade => {
              const idx = tradeIndexById.get(trade.trade_id) ?? 0
              return (
                <Line
                  key={trade.trade_id}
                  type="monotone"
                  dataKey={trade.trade_id}
                  stroke={tradeColor(trade, idx)}
                  strokeOpacity={tradeOpacity(trade, maxAbs)}
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              )
            })}

            {/* Strategy halo — soft area fill underneath the line */}
            <Area
              type="monotone"
              dataKey="strategy"
              stroke="none"
              fill={`url(#${haloId})`}
              isAnimationActive={false}
            />

            {/* Benchmark — distinct neutral comparison line; skipped when absent */}
            {data.benchmark && (
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke="var(--vr-benchmark)"
                strokeWidth={2.0}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4, fill: "var(--vr-benchmark)", stroke: "var(--vr-ink)", strokeWidth: 1.5 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}

            {/* Strategy — bold on top */}
            <Line
              type="monotone"
              dataKey="strategy"
              stroke="var(--vr-up)"
              strokeWidth={2.6}
              dot={false}
              activeDot={{ r: 5, fill: "var(--vr-up)", stroke: "var(--vr-ink)", strokeWidth: 1.5 }}
              isAnimationActive={false}
            />

            {/* Brush — drag to zoom into a sub-range */}
            <Brush
              dataKey="date"
              height={28}
              travellerWidth={8}
              stroke="var(--vr-gold-line)"
              fill="var(--vr-ink-sunken)"
              tickFormatter={shortDate}
              y={290}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Trade list — primary mobile interaction surface */}
      <div style={{ borderTop: "1px solid var(--vr-line)", padding: "14px 16px 18px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                fontFamily: "var(--ff-serif)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--vr-cream)",
                lineHeight: 1.1,
              }}
            >
              Trades
            </h3>
            <InfoBubble>
              Tap any trade to see its detail. Color denotes outcome —
              greens are winners, reds are losers. Brighter lines are
              the bigger contributors.
            </InfoBubble>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <ToggleChip active={sort === "biggest_winners"} onClick={() => setSort("biggest_winners")}>winners</ToggleChip>
            <ToggleChip active={sort === "biggest_losers"}  onClick={() => setSort("biggest_losers")}>losers</ToggleChip>
            <ToggleChip active={sort === "recent"}          onClick={() => setSort("recent")}>recent</ToggleChip>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {sortedTrades.map(trade => {
            const idx = tradeIndexById.get(trade.trade_id) ?? 0
            return (
              <button
                key={trade.trade_id}
                type="button"
                onClick={() => onTradeSelect?.(trade)}
                className="ta-trade-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(60px, auto) 1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "9px 8px",
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--r-inset)",
                  color: "var(--vr-cream)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 120ms ease",
                }}
              >
                <span style={{ fontFamily: "var(--ff-mono)", fontSize: 12 }}>
                  {trade.symbol}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--vr-cream-mute)" }}>
                  {shortDate(trade.entry_date)}
                  {trade.exit_date ? ` → ${shortDate(trade.exit_date)}` : " → open"}
                </span>
                <span
                  style={{
                    fontFamily: "var(--ff-mono)",
                    fontSize: 12,
                    color: tradeColor(trade, idx),
                    textAlign: "right",
                  }}
                >
                  {fmtFullUsd(trade.pnl_usd)} <span style={{ color: "var(--vr-cream-mute)", fontSize: 10 }}>({fmtPctDelta(trade.pnl_pct)})</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Back-compat alias for any callers that imported the earlier scaffold.
export const EquityCurveSwarm = TradeAtlas

// ─── Helpers ──────────────────────────────────────────────────────────────

function InfoBubble({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        aria-label="More info"
        style={{
          width: 16,
          height: 16,
          padding: 0,
          marginLeft: 6,
          background: "transparent",
          border: "1px solid var(--vr-line-hi)",
          borderRadius: "50%",
          color: "var(--vr-cream-mute)",
          fontSize: 10,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          cursor: "help",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
        }}
      >
        i
      </button>
      {open && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 8,
            padding: "10px 12px",
            background: "var(--vr-ink-raised)",
            border: "1px solid var(--vr-line-hi)",
            borderRadius: "var(--r-inset)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
            fontSize: 11,
            lineHeight: 1.5,
            color: "var(--vr-cream-dim)",
            whiteSpace: "normal",
            width: 240,
            zIndex: 10,
          }}
        >
          {children}
        </div>
      )}
    </span>
  )
}

function ToggleChip({
  active, onClick, children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="t-eyebrow"
      style={{
        padding: "3px 8px",
        fontSize: 9,
        letterSpacing: "0.14em",
        borderRadius: 2,
        border: `1px solid ${active ? "var(--vr-gold)" : "var(--vr-line)"}`,
        color: active ? "var(--vr-gold)" : "var(--vr-cream-mute)",
        background: "transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  )
}

function HeadlineStat({
  label, color, primary,
}: {
  label: string
  color: string
  primary: string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.14em",
          color: "var(--vr-cream-mute)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontFamily: "var(--ff-mono)",
          fontSize: 20,
          color,
        }}
      >
        {primary}
      </div>
    </div>
  )
}
