// Trade atlas section — server component outer shell.
//
// RFC stub: renders the honest empty state until Codex ships result_trades.v1.
// Feature flag: VIRES_LAB_TRADE_ATLAS=1
//
// Architecture: server component (flag check + I/O) wraps a future
// TradeAtlasTableClient ("use client") for sort/filter/expand interactivity.
// See _design_handoff/_reference/lab/TRADE_ATLAS_DESIGN_2026-05-07.md §8.

import { tradeAtlasEnabled } from "@/lib/feature-flags.server"
import { loadResultTrades } from "@/lib/research-lab-trades.server"
import type { ResultTradesV1 } from "@/lib/research-lab-trades.server"

// ─── helpers ─────────────────────────────────────────────────────────────────

function humanizeDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

function fmtPct(value: number): string {
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div
      className="vr-card"
      style={{ padding: "10px 14px", flex: "1 1 110px" }}
    >
      <div
        className="t-eyebrow"
        style={{
          fontSize: 9,
          color: "var(--vr-cream-mute)",
          letterSpacing: "0.14em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="t-mono"
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: color ?? "var(--vr-cream)",
        }}
      >
        {value}
      </div>
    </div>
  )
}

function TradeAtlasEmpty() {
  return (
    <div
      className="vr-card"
      style={{
        padding: "20px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        borderLeft: "2px solid var(--vr-line-hi)",
      }}
    >
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-gold)", letterSpacing: "0.14em" }}
      >
        TRADE ATLAS
      </div>
      <div
        className="t-h4"
        style={{ fontSize: 14, color: "var(--vr-cream)", fontWeight: 500, margin: 0 }}
      >
        No trades yet
      </div>
      <div
        className="t-body"
        style={{ fontSize: 12, color: "var(--vr-cream-mute)", lineHeight: 1.5 }}
      >
        Trade-level data will appear here after the first completed run. Awaiting
        producer artifact.
      </div>
    </div>
  )
}

function TradeAtlasError({ message }: { message: string }) {
  return (
    <div
      className="vr-card"
      style={{
        padding: "20px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        borderLeft: "2px solid var(--vr-down)",
      }}
    >
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-gold)", letterSpacing: "0.14em" }}
      >
        TRADE ATLAS
      </div>
      <div
        className="t-h4"
        style={{ fontSize: 14, color: "var(--vr-cream)", fontWeight: 500, margin: 0 }}
      >
        Trade log could not be read
      </div>
      <div
        className="t-body"
        style={{ fontSize: 12, color: "var(--vr-cream-mute)", lineHeight: 1.5 }}
      >
        The artifact was found but could not be parsed. Check the server log for
        details.
      </div>
      <details style={{ marginTop: 6 }}>
        <summary
          className="t-eyebrow"
          style={{
            fontSize: 9,
            color: "var(--vr-cream-mute)",
            cursor: "pointer",
            letterSpacing: "0.10em",
          }}
        >
          Technical detail
        </summary>
        <pre
          className="t-mono"
          style={{
            marginTop: 6,
            fontSize: 10,
            color: "var(--vr-cream-mute)",
            background: "var(--vr-ink-sunken)",
            padding: "8px 10px",
            borderRadius: 4,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {message}
        </pre>
      </details>
    </div>
  )
}

// Stub body: renders summary tiles + placeholder where the interactive table
// will live once TradeAtlasTableClient ships (after Codex signs off on the schema).
function TradeAtlasBody({ data }: { data: ResultTradesV1 }) {
  const { summary } = data
  const winRate =
    summary.total_trades > 0
      ? Math.round((summary.winners / summary.total_trades) * 100)
      : 0

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-gold)", letterSpacing: "0.14em" }}
      >
        TRADE ATLAS
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <SummaryTile label="Trades" value={String(summary.total_trades)} />
        <SummaryTile label="Win Rate" value={`${winRate}%`} />
        <SummaryTile
          label="Avg P&L"
          value={fmtPct(summary.pnl_distribution.p50)}
          color={
            summary.pnl_distribution.p50 >= 0 ? "var(--vr-up)" : "var(--vr-down)"
          }
        />
        <SummaryTile
          label="Avg Hold"
          value={humanizeDuration(summary.avg_holding_period)}
        />
        <SummaryTile
          label="Max Win"
          value={fmtPct(summary.pnl_distribution.max)}
          color="var(--vr-up)"
        />
        <SummaryTile
          label="Max Loss"
          value={fmtPct(summary.pnl_distribution.min)}
          color="var(--vr-down)"
        />
      </div>

      {/* Placeholder for TradeAtlasTableClient — ships after schema sign-off. */}
      <div
        className="vr-card"
        style={{ padding: "16px 14px" }}
      >
        <span
          className="t-mono"
          style={{ fontSize: 11, color: "var(--vr-cream-mute)" }}
        >
          {summary.total_trades} trades — interactive table renders when
          TradeAtlasTableClient ships
        </span>
      </div>
    </div>
  )
}

// ─── section root (server async component) ───────────────────────────────────

export async function TradeAtlasSection({ result_id }: { result_id: string }) {
  if (!tradeAtlasEnabled()) return null

  const loaded = await loadResultTrades(result_id)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {loaded.state === "empty" && <TradeAtlasEmpty />}
      {loaded.state === "error" && <TradeAtlasError message={loaded.message} />}
      {loaded.state === "ok" && <TradeAtlasBody data={loaded.data} />}
    </div>
  )
}
