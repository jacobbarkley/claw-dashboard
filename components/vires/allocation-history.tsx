"use client"

// Allocation History card — sleeve-level history of what the portfolio
// actually held, day by day. Persists across strategy rotations: the
// history is tied to the sleeve, not the strategy that produced it.
//
// Renders three blocks in sequence (when data is available):
//   1. Header — sleeve label + LIVE/BENCH provenance pill
//   2. Currently panel — live snapshot stacked bar + legend
//   3. Order blotter — recent buy/sell fills tied to the regime transitions
//
// When `operator.allocation_history[sleeve]` is missing or status !==
// "available", renders the AllocationPlaceholder per the design's spec:
// a dashed-frame mock chart with copy explaining what will appear once
// data arrives. v1 production state — Codex hasn't wired
// `operator.allocation_history.*` or `operator.order_blotter.*` into
// the operator feed yet, so the placeholder is the live path on every
// sleeve. Once those fields land, the populated path takes over with no
// frontend change.

import { useState } from "react"
import type { Sleeve } from "./shared"

interface AllocationSymbol {
  sym: string
  color?: string | null
  label?: string | null
}

interface AllocationRegimeBand {
  from?: string | null
  to?: string | null
  label?: string | null
  tone?: string | null
}

interface AllocationSeriesPoint {
  date: string
  weights: Record<string, number>
  cash?: number | null
  total?: number | null
}

interface AllocationHistorySleeve {
  status?: "available" | "unavailable" | string | null
  source?: "trade_log" | "ladder_log" | string | null
  sleeveLabel?: string | null
  reason?: string | null
  symbols?: AllocationSymbol[] | null
  regimes?: AllocationRegimeBand[] | null
  regimeTones?: Record<string, { label?: string | null; tone?: string | null }> | null
  series?: AllocationSeriesPoint[] | null
}

interface OrderFill {
  date: string
  side: "BUY" | "SELL"
  sym: string
  qty: number
  price: number
  usd?: number | null
  note?: string | null
}

export interface AllocationHistoryOperator {
  allocation_history?: Record<string, AllocationHistorySleeve | null | undefined> | null
  order_blotter?: Record<string, OrderFill[] | null | undefined> | null
}

const SLEEVE_LABELS: Record<Sleeve, string> = {
  stocks: "Stocks sleeve",
  options: "Options sleeve",
  crypto: "Crypto sleeve",
}

// Per-symbol color fallback palette. The feed sometimes ships `color: null`
// for every symbol, which would collapse the Currently bar to a single hue.
// These defaults guarantee distinct, semantic colors even when the feed is
// color-silent. The specific hex values mirror the design's data.js so known
// symbols keep their established identity across the app.
const CASH_COLOR = "#5f6a7a" // slate — also used for SGOV (T-bill cash-equiv)
const KNOWN_SYMBOL_COLORS: Record<string, string> = {
  // Stocks (from design's data.js)
  NVDA: "#c8a968", // gold
  META: "#8fb4cf", // cool blue
  AVGO: "#a89cc8", // muted violet
  AAPL: "#9ec4a0", // sage
  COST: "#d9b48c", // peach
  LLY:  "#c89090", // rose
  SGOV: CASH_COLOR,
  // Crypto
  BTCUSD: "#c8a968", // gold (crypto sleeve accent)
  ETHUSD: "#8fa6d4", // slate-blue
  SOLUSD: "#b69ad4", // violet
}
// Fallback deterministic palette for symbols not in the known list. Each hue
// is visually distinct from the known list and from its neighbors here.
const FALLBACK_PALETTE = [
  "#8fc9c0", // teal
  "#d9a38c", // coral
  "#b4a4d9", // heather
  "#c2d48c", // lime
  "#d98cb4", // pink
  "#8cb4d9", // azure
  "#d4c28c", // sand
  "#9ccfb4", // mint
]
function symbolHash(sym: string): number {
  let h = 0
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) >>> 0
  return h
}
function fallbackColorFor(sym: string): string {
  return FALLBACK_PALETTE[symbolHash(sym) % FALLBACK_PALETTE.length]
}

// ─── Header ─────────────────────────────────────────────────────────────────

function AllocationHeader({
  mode,
  source,
  sleeveLabel,
}: {
  mode: "live" | "bench"
  source?: string | null
  sleeveLabel: string
}) {
  const sourceLabel =
    source === "trade_log" ? "TRADE LOG" :
    source === "ladder_log" ? "LADDER LOG" :
    "FEED"
  const pillCopy = mode === "bench" ? "BENCH CANDIDATE" : `LIVE · ${sourceLabel}`
  return (
    <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--vr-line)" }}>
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: 6,
      }}>
        <div className="t-eyebrow">Allocation History</div>
        <span style={{
          fontFamily: "var(--ff-mono)",
          fontSize: 8.5,
          letterSpacing: "0.22em",
          color: mode === "bench" ? "var(--vr-gold)" : "var(--vr-cream-mute)",
          textTransform: "uppercase",
          padding: "2px 6px",
          border: `1px solid ${mode === "bench" ? "rgba(200, 169, 104, 0.35)" : "var(--vr-line)"}`,
          borderRadius: 2,
        }}>
          {pillCopy}
        </span>
      </div>
      <div className="t-h4" style={{ color: "var(--vr-cream)", marginBottom: 1 }}>
        {sleeveLabel}
      </div>
      <div className="t-label" style={{ fontSize: 10.5, color: "var(--vr-cream-mute)", letterSpacing: 0 }}>
        What the sleeve has held, day by day — across every strategy.
      </div>
    </div>
  )
}

// ─── Reserves (sleeve-level cash equivalents) ──────────────────────────────
// On the stocks sleeve, SGOV is bank — held as a cash park, not a strategy
// position. We merge its weight into the CASH bucket on the Currently bar
// and drop reserve fills from the blotter so the sleeve view reads as
// strategy activity, not treasury management.
// TODO(multi-tenant): make this per-user config when scope-aware.
const RESERVE_SYMBOLS_BY_SLEEVE: Record<Sleeve, Set<string>> = {
  stocks: new Set(["SGOV"]),
  options: new Set(),
  crypto: new Set(),
}

// ─── Currently panel ────────────────────────────────────────────────────────

function CurrentlyPanel({ data, sleeve }: { data: AllocationHistorySleeve; sleeve: Sleeve }) {
  const series = data.series ?? []
  const last = series[series.length - 1]
  if (!last) return null
  const reserves = RESERVE_SYMBOLS_BY_SLEEVE[sleeve]

  // Color resolution order:
  //   1. explicit color from the feed (when Codex ships one)
  //   2. known-symbol palette (NVDA gold, META blue, etc.)
  //   3. deterministic hash → fallback palette
  // CASH and SGOV always use the slate cash color so they read as
  // "parked capital" rather than as another position.
  const symbolColors = new Map((data.symbols ?? []).map(s => [s.sym, s.color ?? null]))
  const colorFor = (sym: string): string => {
    if (sym === "CASH" || sym === "SGOV") return CASH_COLOR
    const fromFeed = symbolColors.get(sym)
    if (fromFeed) return fromFeed
    return KNOWN_SYMBOL_COLORS[sym] ?? fallbackColorFor(sym)
  }

  // Merge any reserve symbols (e.g. SGOV on the stocks sleeve) into the CASH
  // bucket so the bar reads as strategy-deployed vs parked, not as a third
  // category competing with real positions.
  const rawWeights = last.weights ?? {}
  let cashTotal = last.cash ?? 0
  const merged: Record<string, number> = {}
  for (const [sym, weight] of Object.entries(rawWeights)) {
    if (reserves.has(sym)) {
      cashTotal += weight
    } else {
      merged[sym] = (merged[sym] ?? 0) + weight
    }
  }
  const entries: Array<[string, number]> = Object.entries(merged)
  if (cashTotal > 0) entries.push(["CASH", cashTotal])
  const visible = entries
    .filter(([, v]) => v >= 1)
    .sort((a, b) => b[1] - a[1])

  const lastBand = (data.regimes ?? []).slice(-1)[0]
  const lastTone = lastBand?.label ? data.regimeTones?.[lastBand.label] ?? null : null

  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--vr-line)" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <div style={{
          fontFamily: "var(--ff-mono)",
          fontSize: 9,
          letterSpacing: "0.22em",
          color: "var(--vr-cream-faint)",
          textTransform: "uppercase",
        }}>
          Currently
        </div>
        {lastTone?.label && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: 1,
              background: "var(--vr-gold)",
              boxShadow: "0 0 6px rgba(200, 169, 104, 0.6)",
            }} />
            <span style={{
              fontFamily: "var(--ff-sans)",
              fontSize: 11,
              color: "var(--vr-cream)",
              letterSpacing: "0.02em",
            }}>
              {lastTone.label}
            </span>
          </div>
        )}
      </div>

      <div style={{
        display: "flex",
        height: 10,
        borderRadius: 2,
        overflow: "hidden",
        marginBottom: 10,
        border: "1px solid var(--vr-line)",
      }}>
        {visible.map(([sym, pct]) => (
          <div
            key={sym}
            title={`${sym} · ${pct.toFixed(1)}%`}
            style={{
              width: `${pct}%`,
              background: colorFor(sym),
              opacity: sym === "CASH" ? 0.35 : 0.88,
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        {visible.map(([sym, pct]) => (
          <div key={sym} style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: 1,
              background: colorFor(sym),
              opacity: sym === "CASH" ? 0.45 : 1,
              transform: "translateY(-1px)",
            }} />
            <span style={{
              fontFamily: "var(--ff-mono)", fontSize: 10, letterSpacing: "0.1em",
              color: "var(--vr-cream)",
            }}>
              {sym === "CASH" ? "Cash" : sym}
            </span>
            <span style={{
              fontFamily: "var(--ff-mono)", fontSize: 10, color: "var(--vr-cream-mute)",
            }}>
              {pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Order blotter ──────────────────────────────────────────────────────────

function fmtBlotterDate(d: string): string {
  try {
    const dt = new Date(`${d}T00:00:00`)
    return dt.toLocaleString("en-US", { month: "short", day: "numeric" }).toUpperCase()
  } catch {
    return d
  }
}

function OrderBlotter({ orders, sleeve }: { orders: OrderFill[]; sleeve: Sleeve }) {
  const [expanded, setExpanded] = useState(false)
  const reserves = RESERVE_SYMBOLS_BY_SLEEVE[sleeve]
  // Reserve fills (cash management on SGOV, etc.) aren't strategy activity —
  // hide them from the sleeve view so the blotter reflects what the strategy
  // actually did.
  const strategyOrders = orders.filter(o => !reserves.has(o.sym))
  if (strategyOrders.length === 0) return null
  const reversed = strategyOrders.slice().reverse()
  const visible = expanded ? reversed : reversed.slice(0, 4)

  return (
    <div style={{ padding: "12px 16px 14px", borderTop: "1px solid var(--vr-line)" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <div className="t-eyebrow">Recent Orders</div>
        <span style={{
          fontFamily: "var(--ff-mono)",
          fontSize: 9,
          color: "var(--vr-cream-faint)",
          letterSpacing: "0.15em",
        }}>
          {strategyOrders.length} FILL{strategyOrders.length === 1 ? "" : "S"}
        </span>
      </div>

      <div>
        {visible.map((o, i) => (
          <div key={`${o.date}-${o.sym}-${i}`} style={{
            display: "grid",
            gridTemplateColumns: "50px 32px 1fr auto",
            alignItems: "baseline",
            gap: 10,
            padding: "7px 0",
            borderTop: i === 0 ? "none" : "1px solid rgba(241, 236, 224, 0.04)",
          }}>
            <div style={{
              fontFamily: "var(--ff-mono)", fontSize: 9.5,
              color: "var(--vr-cream-faint)", letterSpacing: "0.1em",
            }}>
              {fmtBlotterDate(o.date)}
            </div>
            <div style={{
              fontFamily: "var(--ff-mono)", fontSize: 9, letterSpacing: "0.15em",
              color: o.side === "BUY" ? "var(--vr-up)" : "var(--vr-down)",
              fontWeight: 500,
            }}>
              {o.side}
            </div>
            <div>
              <div style={{
                fontFamily: "var(--ff-sans)", fontSize: 12, color: "var(--vr-cream)",
                fontWeight: 500, letterSpacing: "0.02em",
              }}>
                {o.sym === "BTCUSD" ? "BTC" : o.sym}
                <span style={{
                  fontFamily: "var(--ff-mono)", fontSize: 10, color: "var(--vr-cream-mute)",
                  marginLeft: 6, fontWeight: 400,
                }}>
                  {o.sym === "BTCUSD" ? `${o.qty.toFixed(3)} BTC` : `${o.qty} sh`}
                </span>
              </div>
              {o.note && (
                <div style={{
                  fontFamily: "var(--ff-sans)", fontSize: 9.5, color: "var(--vr-cream-faint)",
                  letterSpacing: 0, marginTop: 1,
                }}>
                  {o.note}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontFamily: "var(--ff-mono)", fontSize: 11, color: "var(--vr-cream)",
                letterSpacing: "0.04em",
              }}>
                {o.sym === "BTCUSD" && o.usd != null
                  ? `$${o.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : `$${o.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
              {o.sym === "BTCUSD" && (
                <div style={{
                  fontFamily: "var(--ff-mono)", fontSize: 9, color: "var(--vr-cream-faint)",
                  letterSpacing: "0.05em", marginTop: 1,
                }}>
                  @ ${o.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {strategyOrders.length > 4 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            display: "block", width: "100%", marginTop: 10, padding: "7px 0",
            background: "transparent",
            border: "1px solid var(--vr-line)",
            borderRadius: 2,
            fontFamily: "var(--ff-sans)", fontSize: 9.5, letterSpacing: "0.2em",
            textTransform: "uppercase", color: "var(--vr-cream-mute)",
            cursor: "pointer",
          }}
        >
          {expanded ? "— Show recent only" : `+ ${strategyOrders.length - 4} earlier fills`}
        </button>
      )}
    </div>
  )
}

// ─── Placeholder (live state today — backend fields not yet shipped) ────────

function AllocationPlaceholder({
  sleeveLabel,
  reason,
}: {
  sleeveLabel: string
  reason: string
}) {
  const W = 300, H = 78
  return (
    <div style={{ padding: "18px 16px 20px" }}>
      <div className="t-eyebrow" style={{ marginBottom: 4 }}>Allocation History</div>
      <div className="t-h4" style={{ color: "var(--vr-cream)", marginBottom: 2 }}>
        {sleeveLabel}
      </div>
      <div className="t-label" style={{
        fontSize: 11, color: "var(--vr-cream-mute)",
        marginBottom: 14, lineHeight: 1.55,
      }}>
        No allocation history captured yet.
      </div>
      <div style={{
        border: "1px dashed var(--vr-line)",
        borderRadius: 2,
        padding: "10px 10px 8px",
        marginBottom: 12,
        background: "rgba(241, 236, 224, 0.015)",
      }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          style={{ display: "block" }}
        >
          <path
            d={`M 0 55 L 60 50 L 120 40 L 180 30 L 240 35 L 300 25 L 300 ${H} L 0 ${H} Z`}
            fill="var(--vr-cream)"
            fillOpacity="0.04"
          />
          <path
            d="M 0 55 L 60 50 L 120 40 L 180 30 L 240 35 L 300 25"
            fill="none"
            stroke="var(--vr-cream-faint)"
            strokeWidth="0.6"
            strokeDasharray="2 2"
          />
          <path
            d="M 0 65 L 60 60 L 120 55 L 180 50 L 240 48 L 300 45"
            fill="none"
            stroke="var(--vr-cream-faint)"
            strokeWidth="0.6"
            strokeDasharray="2 2"
          />
          <line x1="0" y1={H - 1} x2={W} y2={H - 1} stroke="var(--vr-line)" strokeWidth="0.5" />
          <text x="4" y={H - 4}
            fontSize="7" fill="var(--vr-cream-faint)"
            fontFamily="var(--ff-mono)" letterSpacing="0.15em">
            TIME →
          </text>
          <text x={W - 30} y="10"
            fontSize="7" fill="var(--vr-cream-faint)"
            fontFamily="var(--ff-mono)" letterSpacing="0.1em">
            %WEIGHT
          </text>
        </svg>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--vr-cream-mute)", lineHeight: 1.6 }}>
        {reason}
      </div>
      <div style={{
        marginTop: 12,
        padding: "8px 10px",
        background: "rgba(95, 106, 122, 0.08)",
        border: "1px solid var(--vr-line)",
        borderRadius: 2,
        fontFamily: "var(--ff-mono)",
        fontSize: 9.5,
        color: "var(--vr-cream-faint)",
        letterSpacing: "0.08em",
        lineHeight: 1.5,
      }}>
        WHEN DATA ARRIVES: current holdings · regime timeline · order blotter.
      </div>
    </div>
  )
}

// ─── Public component ──────────────────────────────────────────────────────

export function AllocationHistory({
  sleeve,
  operator,
  mode = "live",
}: {
  sleeve: Sleeve
  operator?: AllocationHistoryOperator | null
  mode?: "live" | "bench"
}) {
  const data = operator?.allocation_history?.[sleeve] ?? null
  const orders = operator?.order_blotter?.[sleeve] ?? []
  const sleeveLabel = data?.sleeveLabel ?? SLEEVE_LABELS[sleeve]

  if (!data || data.status !== "available" || !data.series || data.series.length === 0) {
    return (
      <div className="vr-card">
        <AllocationPlaceholder
          sleeveLabel={sleeveLabel}
          reason={data?.reason ?? "Allocation history will appear here once the sleeve records daily position snapshots."}
        />
      </div>
    )
  }

  return (
    <div className="vr-card">
      <AllocationHeader mode={mode} source={data.source ?? null} sleeveLabel={sleeveLabel} />
      <CurrentlyPanel data={data} sleeve={sleeve} />
      <OrderBlotter orders={orders ?? []} sleeve={sleeve} />
    </div>
  )
}
