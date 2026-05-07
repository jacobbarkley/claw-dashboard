"use client"

import type { GuidedEnrollmentView } from "./types"
import { FieldEyebrow, GuidedHeroCard, formatUsd } from "./shared"

// S9 — guided_enrollment.status = ACTIVE paper-running view.
// Hard rule: enrollment ACTIVE ≠ library_entry ACTIVE.
// Library entry is CANDIDATE, banner says so. Hero copy says "PAPER · RUNNING"
// and explicitly disclaims "Not validated. Not approved for live capital."

export function ActiveEnrollmentSurface({ view }: { view: GuidedEnrollmentView }) {
  if (!view.enrollment) {
    return <p>No enrollment in this projection.</p>
  }

  const realized = view.cumulative_paper_pnl_realized ?? 0
  const unrealized = view.cumulative_paper_pnl_unrealized ?? 0
  const periodLabel = `paper · ${view.paper_observation_days_count}d`

  return (
    <GuidedHeroCard accent="var(--vr-sleeve-stocks, #c8a968)">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <h1
          style={{
            fontSize: 24,
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            color: "var(--vr-cream, #f1ece0)",
            fontWeight: 400,
            margin: 0,
          }}
        >
          {view.library_entry.friendly_name}
        </h1>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--vr-gold, #c8a968)",
          }}
        >
          {view.library_entry.mandate_subtitle}
        </span>
      </div>

      {/* The hard CR1 surface — "ACTIVE" is paper-running, not validated */}
      <div
        style={{
          padding: 14,
          border: "1px solid var(--vr-gold, #c8a968)33",
          background: "rgba(200,169,104,0.05)",
          borderRadius: 3,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--vr-gold, #c8a968)",
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Paper · running
        </div>
        <div style={{ fontSize: 11, color: "var(--vr-cream-mute, #8c8579)", lineHeight: 1.55 }}>
          Not validated. Not approved for live capital. The library entry is{" "}
          <strong style={{ color: "var(--vr-gold, #c8a968)" }}>{view.library_entry.status}</strong>; this is an
          internal-preview paper enrollment.
        </div>
      </div>

      {/* Total + period delta + realized/unrealized */}
      <div
        className="t-display t-num"
        style={{
          fontSize: 36,
          fontFamily: "var(--ff-mono)",
          color: "var(--vr-cream, #f1ece0)",
          marginBottom: 6,
        }}
      >
        {view.current_value_usd != null ? formatUsd(view.current_value_usd) : "—"}
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap", marginBottom: 18 }}>
        <PeriodDelta label="Realized" value={realized} />
        <span style={{ color: "var(--vr-cream-faint, #4a4358)" }}>·</span>
        <PeriodDelta label="Unrealized" value={unrealized} />
        <span style={{ color: "var(--vr-cream-faint, #4a4358)" }}>·</span>
        <span style={{ fontSize: 11, color: "var(--vr-cream-mute, #8c8579)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
          {periodLabel}
        </span>
      </div>

      <FieldEyebrow>Holding</FieldEyebrow>
      <div style={{ marginBottom: 16 }}>
        {view.holdings
          .filter(h => h.symbol !== "SGOV")
          .map(h => (
            <HoldingRow key={h.symbol} symbol={h.symbol} qty={h.quantity} mv={h.market_value_usd} unrealized={h.unrealized_pnl_usd} />
          ))}
      </div>

      <FieldEyebrow>Cash reserve</FieldEyebrow>
      <div style={{ marginBottom: 18 }}>
        {view.holdings
          .filter(h => h.symbol === "SGOV")
          .map(h => (
            <HoldingRow key={h.symbol} symbol={h.symbol} qty={h.quantity} mv={h.market_value_usd} unrealized={null} />
          ))}
      </div>

      <div
        style={{
          paddingTop: 14,
          borderTop: "1px solid var(--vr-line, #2a2438)",
          fontSize: 11,
          color: "var(--vr-cream-mute, #8c8579)",
          fontFamily: "var(--ff-mono)",
          lineHeight: 1.6,
        }}
      >
        <div>enrollment.status · {view.enrollment.status}</div>
        <div>backing_strategy_state · {view.enrollment.backing_strategy_state}</div>
        <div>library_entry.status · {view.library_entry.status}</div>
        <div>disclosure_state · {view.disclosure_state}</div>
        <div>paper_observation · {view.paper_observation_days_count} days</div>
      </div>
    </GuidedHeroCard>
  )
}

function PeriodDelta({ label, value }: { label: string; value: number }) {
  const tone = value > 0 ? "var(--vr-good, #9ec4a0)" : value < 0 ? "var(--vr-bad, #c89090)" : "var(--vr-cream-mute, #8c8579)"
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
      <span style={{ fontSize: 12, color: tone, fontFamily: "var(--ff-mono)" }}>{formatUsd(value, { sign: true })}</span>
      <span style={{ fontSize: 10, color: "var(--vr-cream-mute, #8c8579)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
        {label}
      </span>
    </span>
  )
}

function HoldingRow({
  symbol,
  qty,
  mv,
  unrealized,
}: {
  symbol: string
  qty: number
  mv: number
  unrealized: number | null
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid var(--vr-line, #2a2438)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--vr-cream, #f1ece0)", fontWeight: 500 }}>
        {symbol} <span style={{ color: "var(--vr-cream-mute, #8c8579)", marginLeft: 8 }}>{qty} shares</span>
      </span>
      <span style={{ display: "flex", gap: 12, fontFamily: "var(--ff-mono)" }}>
        <span style={{ color: "var(--vr-cream-dim, #c4bdac)" }}>{formatUsd(mv)}</span>
        {unrealized != null ? (
          <span
            style={{
              color:
                unrealized > 0
                  ? "var(--vr-good, #9ec4a0)"
                  : unrealized < 0
                    ? "var(--vr-bad, #c89090)"
                    : "var(--vr-cream-mute, #8c8579)",
              minWidth: 50,
              textAlign: "right",
            }}
          >
            {formatUsd(unrealized, { sign: true })}
          </span>
        ) : null}
      </span>
    </div>
  )
}
