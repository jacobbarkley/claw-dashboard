"use client"

// Bench Campaigns — Campaign Detail page.
// Ported from design_handoff_vires_capital/files/vires-campaigns.jsx
// (CampaignDetailPage + LeverShell + ChangeLogTimeline + FamilyGroup +
//  CampaignCandidateRow + RunStatsTable) and extended to read the v2
// producer contract (campaign.baseline_performance +
// leader_comparison_to_baseline + campaign_pressure) when Codex emits it.
//
// Graceful fallback: if v2 blocks are null, the leader candidate's v1
// `latest_run.run_stats` drives the Baseline Performance render and the
// Leader-vs-Baseline block is omitted.

import Link from "next/link"
import { useMemo } from "react"
import type {
  BaselinePerformance,
  BaselinePerformanceState,
  Candidate,
  CampaignManifest,
  ChangeLogEvent,
  FamilyGroup as FamilyGroupT,
  LeaderComparisonToBaseline,
  RunStats,
} from "@/lib/vires-campaigns"
import { baselinePerformanceState, getBaseline, getCampaignPressure, getLeaderComparison } from "@/lib/vires-campaigns"
import {
  ActorChip,
  LeaderComparisonChip,
  PressureChip,
  PromotionLineageStrip,
  RoleTag,
  StatusPillCampaign,
  changeMeta,
  relTime,
} from "./campaigns-shared"
import { InfoPop, SleeveChip, type Sleeve } from "./shared"
import { PromotionReadinessCard } from "./promotion-readiness"

// ─── Lever shell — action-shaped button (disabled in v1) ────────────────────
// CRITICAL: element IS <button>, NOT div/span. disabled + aria-disabled true.
// When v2 action wiring lands, swap `disabled` off and add onClick. No
// structural rewrite.
// InfoPop sits as a sibling (absolute-positioned overlay), not a child, so
// we stay HTML-valid — you can't nest interactive elements inside a <button>.

function LeverShell({
  eyebrow,
  value,
  sub,
  actionHint,
  glyph = "↻",
  infoTerm,
}: {
  eyebrow: string
  value: string
  sub?: string | null
  actionHint: string
  glyph?: string
  infoTerm?: string
}) {
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={`${actionHint} — action wires in v2`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          width: "100%",
          // Reserve room on the right for the InfoPop overlay even when
          // infoTerm is absent, so cell widths stay uniform.
          padding: "10px 28px 10px 12px",
          background: "transparent",
          border: "none",
          color: "inherit",
          textAlign: "left",
          cursor: "default",
          fontFamily: "inherit",
        }}
      >
        <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
          {eyebrow}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            marginTop: 3,
          }}
        >
          <span
            className="t-num"
            style={{ fontSize: 14, color: "var(--vr-cream)", fontWeight: 500 }}
          >
            {value}
          </span>
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 12,
              textAlign: "center",
              color: "var(--vr-cream-faint)",
              fontSize: 11,
              lineHeight: 1,
            }}
          >
            {glyph}
          </span>
        </div>
        {sub && (
          <div className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-faint)", marginTop: 2 }}>
            {sub}
          </div>
        )}
      </button>
      {infoTerm && (
        <span
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 1,
            // Letting the InfoPop render its own spacing; this wrapper
            // keeps it visually anchored to the cell corner.
          }}
        >
          <InfoPop term={infoTerm} size={13} />
        </span>
      )}
    </div>
  )
}

// ─── Baseline Performance table ─────────────────────────────────────────────
// Renders either v2 baseline_performance OR v1-fallback leader run_stats.
// "full" = campaign-level (2-row headline grid + era strip).
// "compact" = per-candidate (denser 3x2 grid, no comparison strip).

function formatPct(n: number | null | undefined, signed = false): string {
  if (n == null) return "—"
  const sign = signed ? (n >= 0 ? "+" : "") : ""
  return `${sign}${n.toFixed(2)}%`
}

function formatNum(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—"
  return n.toFixed(digits)
}

function signColor(n: number | null | undefined): string {
  if (n == null) return "var(--vr-cream)"
  return n >= 0 ? "var(--vr-up)" : "var(--vr-down)"
}

function windowLabel(win: BaselinePerformance["evaluation_window"] | RunStats["period"]): string {
  if (!win) return "—"
  const s = new Date(win.start)
  const e = new Date(win.end)
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
  const days = win.trading_days
  return `${fmt(s)} → ${fmt(e)}${days ? ` · ${days}d` : ""}`
}

function eraStrip(stats: BaselinePerformance | RunStats) {
  if (!stats.eras || !stats.eras.length) return null
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
      {stats.eras.map((era, i) => (
        <span
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 9,
            fontFamily: "var(--ff-mono)",
            color: era.pass ? "var(--vr-cream-dim)" : "var(--vr-down)",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: era.pass ? "var(--vr-up)" : "var(--vr-down)",
              opacity: era.pass ? 0.85 : 1,
            }}
          />
          {era.label}
        </span>
      ))}
      {stats.eras_passed != null && stats.eras_total != null && (
        <span
          className="t-eyebrow"
          style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginLeft: 4 }}
        >
          {stats.eras_passed}/{stats.eras_total} pass
        </span>
      )}
    </div>
  )
}

function PerformanceCell({
  label,
  value,
  valueColor,
  sub,
}: {
  label: string
  value: string
  valueColor?: string
  sub?: string | null
}) {
  return (
    <div style={{ padding: "8px 10px" }}>
      <div className="t-eyebrow" style={{ fontSize: 8.5, marginBottom: 3, color: "var(--vr-cream-mute)" }}>
        {label}
      </div>
      <div
        className="t-num"
        style={{
          fontSize: 14,
          color: valueColor || "var(--vr-cream)",
          fontWeight: 500,
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="t-label" style={{ fontSize: 9, color: "var(--vr-cream-faint)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function BaselinePerformanceBlock({
  state,
  benchmarkSymbol,
  label = "Baseline performance",
  helpCopy,
}: {
  state: BaselinePerformanceState
  benchmarkSymbol: string
  label?: string
  helpCopy?: string
}) {
  // Empty states — honest copy, never invented numbers.
  if (state.kind === "no_run") {
    return (
      <div style={{ padding: "14px 16px", borderTop: "1px solid var(--vr-line)" }}>
        <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4, color: "var(--vr-cream-faint)" }}>
          {label}
        </div>
        <div
          className="t-read"
          style={{
            fontSize: 11,
            fontStyle: "italic",
            fontFamily: "var(--ff-serif)",
            color: "var(--vr-cream-faint)",
            lineHeight: 1.5,
          }}
        >
          No run yet under this manifest.
        </div>
      </div>
    )
  }
  if (state.kind === "not_indexed") {
    return (
      <div style={{ padding: "14px 16px", borderTop: "1px solid var(--vr-line)" }}>
        <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4, color: "var(--vr-cream-faint)" }}>
          {label}
        </div>
        <div
          className="t-read"
          style={{
            fontSize: 11,
            fontStyle: "italic",
            fontFamily: "var(--ff-serif)",
            color: "var(--vr-cream-faint)",
            lineHeight: 1.5,
          }}
        >
          Result bundle exists — stats not yet normalized into the manifest.
        </div>
        {state.resultSummaryPath && (
          <div
            className="t-ticker"
            style={{
              fontSize: 9,
              marginTop: 6,
              color: "var(--vr-cream-faint)",
              textTransform: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {state.resultSummaryPath}
          </div>
        )}
      </div>
    )
  }
  if (state.kind === "none") {
    return null
  }

  const stats = state.data
  const win = stats.evaluation_window
  const windowSpan = win ? windowLabel(win) : windowLabel(stats.period)

  return (
    <div style={{ borderTop: "1px solid var(--vr-line)" }}>
      <div style={{ padding: "12px 16px 10px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 4,
          }}
        >
          <div className="t-eyebrow" style={{ fontSize: 9 }}>
            {label}
          </div>
          <div
            className="t-ticker"
            style={{
              fontSize: 9,
              textTransform: "none",
              color: "var(--vr-cream-faint)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 180,
            }}
          >
            {windowSpan}
          </div>
        </div>
        {helpCopy && (
          <div
            className="t-label"
            style={{
              fontSize: 10,
              color: "var(--vr-cream-faint)",
              marginBottom: 8,
              fontStyle: "italic",
              fontFamily: "var(--ff-serif)",
            }}
          >
            {helpCopy}
          </div>
        )}
        {eraStrip(stats) && <div style={{ marginBottom: 8 }}>{eraStrip(stats)}</div>}
      </div>

      {/* Row 1: total return · excess vs bench · max DD vs bench */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          borderTop: "1px solid var(--vr-line)",
          borderBottom: "1px solid var(--vr-line)",
        }}
      >
        <div style={{ borderRight: "1px solid var(--vr-line)" }}>
          <PerformanceCell
            label="Total return"
            value={formatPct(stats.total_return_pct, true)}
            valueColor={signColor(stats.total_return_pct)}
            sub={
              stats.benchmark_return_pct != null
                ? `vs ${benchmarkSymbol} ${formatPct(stats.benchmark_return_pct, true)}`
                : null
            }
          />
        </div>
        <div style={{ borderRight: "1px solid var(--vr-line)" }}>
          <PerformanceCell
            label={`Excess · vs ${benchmarkSymbol}`}
            value={formatPct(stats.excess_return_pct, true)}
            valueColor={signColor(stats.excess_return_pct)}
          />
        </div>
        <div>
          <PerformanceCell
            label="Max drawdown"
            value={stats.max_drawdown_pct != null ? `${stats.max_drawdown_pct.toFixed(2)}%` : "—"}
            valueColor={stats.max_drawdown_pct != null ? "var(--vr-down)" : "var(--vr-cream)"}
            sub={
              stats.benchmark_max_drawdown_pct != null
                ? `bench ${stats.benchmark_max_drawdown_pct.toFixed(2)}%`
                : null
            }
          />
        </div>
      </div>

      {/* Row 2: sharpe · calmar/sortino · trades/winrate */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div style={{ borderRight: "1px solid var(--vr-line)" }}>
          <PerformanceCell
            label="Sharpe"
            value={formatNum(stats.sharpe)}
            sub={stats.benchmark_sharpe != null ? `bench ${formatNum(stats.benchmark_sharpe)}` : null}
          />
        </div>
        <div style={{ borderRight: "1px solid var(--vr-line)" }}>
          <PerformanceCell
            label="Calmar · Sortino"
            value={stats.calmar != null ? formatNum(stats.calmar) : "—"}
            sub={stats.sortino != null ? `Sortino ${formatNum(stats.sortino)}` : null}
          />
        </div>
        <div>
          <PerformanceCell
            label="Trades · Win"
            value={stats.trades != null ? `${stats.trades}` : "—"}
            sub={
              [
                stats.win_rate_pct != null ? `${formatNum(stats.win_rate_pct, 1)}% win` : null,
                stats.profit_factor != null ? `PF ${formatNum(stats.profit_factor)}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || null
            }
          />
        </div>
      </div>
    </div>
  )
}

// ─── Leader-vs-Baseline block (v2) ──────────────────────────────────────────

function LeaderVsBaselineBlock({
  comp,
}: {
  comp: LeaderComparisonToBaseline
}) {
  const deltas: Array<{ label: string; value: string; color: string; positiveIsGood: boolean; raw: number | null | undefined }> = [
    { label: "Return delta",   value: formatPct(comp.return_delta_pct, true),   color: signColor(comp.return_delta_pct),   positiveIsGood: true, raw: comp.return_delta_pct ?? null },
    { label: "Excess delta",   value: formatPct(comp.excess_delta_pct, true),   color: signColor(comp.excess_delta_pct),   positiveIsGood: true, raw: comp.excess_delta_pct ?? null },
    { label: "Sharpe delta",   value: comp.sharpe_delta != null ? (comp.sharpe_delta >= 0 ? "+" : "") + comp.sharpe_delta.toFixed(2) : "—", color: signColor(comp.sharpe_delta), positiveIsGood: true, raw: comp.sharpe_delta ?? null },
    { label: "DD shallower",   value: formatPct(comp.drawdown_delta_pct, true), color: signColor(comp.drawdown_delta_pct), positiveIsGood: true, raw: comp.drawdown_delta_pct ?? null },
    { label: "Eras passed Δ",  value: comp.eras_pass_delta != null ? (comp.eras_pass_delta >= 0 ? "+" : "") + String(comp.eras_pass_delta) : "—", color: signColor(comp.eras_pass_delta), positiveIsGood: true, raw: comp.eras_pass_delta ?? null },
  ]

  return (
    <div className="vr-card" style={{ padding: 0, background: "var(--vr-ink)" }}>
      <div
        style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid var(--vr-line)",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
            Leader vs baseline
          </div>
          <div className="t-h3" style={{ fontSize: 15, marginTop: 3 }}>
            Is the current leader actually beating it?
          </div>
        </div>
        <LeaderComparisonChip status={comp.status} />
      </div>

      {comp.status === "INSUFFICIENT_EVIDENCE" ? (
        <div style={{ padding: "12px 16px" }}>
          <div
            className="t-read"
            style={{
              fontSize: 12,
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              color: "var(--vr-cream-dim)",
              lineHeight: 1.55,
            }}
          >
            {comp.summary}
          </div>
        </div>
      ) : (
        <>
          {/* Mobile-first layout: 2x2 of returns + risk deltas, then the
              robustness delta (eras passed) on a full-width row below. Five
              cells across fit on desktop but crush on phone; 2+2+1 reads
              cleanly at both widths. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {deltas.slice(0, 4).map((d, i) => (
              <div
                key={d.label}
                style={{
                  borderRight: i % 2 === 0 ? "1px solid var(--vr-line)" : "none",
                  borderBottom: "1px solid var(--vr-line)",
                }}
              >
                <PerformanceCell label={d.label} value={d.value} valueColor={d.color} />
              </div>
            ))}
            {deltas[4] && (
              <div style={{ gridColumn: "1 / -1" }}>
                <PerformanceCell
                  label={deltas[4].label}
                  value={deltas[4].value}
                  valueColor={deltas[4].color}
                />
              </div>
            )}
          </div>
          {comp.summary && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--vr-line)" }}>
              <div
                className="t-read"
                style={{
                  fontSize: 12,
                  fontFamily: "var(--ff-serif)",
                  fontStyle: "italic",
                  color: "var(--vr-cream-dim)",
                  lineHeight: 1.55,
                }}
              >
                {comp.summary}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Change-log timeline (full, vertical rail) ──────────────────────────────

function ChangeLogTimeline({
  events,
  candidatesById,
}: {
  events: ChangeLogEvent[]
  candidatesById: Record<string, Candidate>
}) {
  const sorted = useMemo(
    () => [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    [events],
  )
  if (!sorted.length) return null

  return (
    <div style={{ position: "relative" }}>
      {/* vertical rail */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 6,
          bottom: 6,
          left: 12,
          width: 1,
          background: "var(--vr-line)",
        }}
      />
      {sorted.map((event, idx) => {
        const meta = changeMeta(event.kind)
        const refCandidate =
          event.candidate_id && candidatesById[event.candidate_id]
            ? candidatesById[event.candidate_id]
            : null
        const isLast = idx === sorted.length - 1
        return (
          <div
            key={idx}
            style={{
              position: "relative",
              paddingLeft: 32,
              paddingBottom: isLast ? 0 : 16,
            }}
          >
            {/* rail dot */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 5,
                top: 4,
                width: 15,
                height: 15,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--vr-ink)",
                border: "1px solid var(--vr-line-hi, rgba(241,236,224,0.16))",
                borderRadius: "50%",
                fontSize: 10,
                color: "var(--vr-cream-mute)",
              }}
            >
              {meta.glyph}
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 2,
              }}
            >
              <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
                {meta.label}
              </div>
              <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-faint)" }}>
                {relTime(event.at)}
              </div>
            </div>
            <div
              className="t-h4"
              style={{
                fontSize: 13,
                color: "var(--vr-cream)",
                lineHeight: 1.3,
                fontFamily: "var(--ff-serif)",
                fontWeight: 500,
              }}
            >
              {event.title}
            </div>
            {event.detail && (
              <div
                className="t-read"
                style={{
                  fontSize: 12,
                  color: "var(--vr-cream-dim)",
                  lineHeight: 1.5,
                  marginTop: 4,
                }}
              >
                {event.detail}
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 6,
                flexWrap: "wrap",
              }}
            >
              <ActorChip actor={event.actor} />
              {refCandidate && (
                <span
                  className="t-ticker"
                  style={{
                    fontSize: 9,
                    color: "var(--vr-cream-faint)",
                    textTransform: "none",
                  }}
                >
                  · {refCandidate.title}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Candidate row inside a FamilyGroup ─────────────────────────────────────

function CampaignCandidateRow({
  candidate,
  isLeader,
  isLast,
  benchmarkSymbol,
  passportHref,
}: {
  candidate: Candidate
  isLeader: boolean
  isLast: boolean
  benchmarkSymbol: string
  passportHref?: string
}) {
  const stats =
    candidate.latest_run?.run_stats_status === "INDEXED" ? candidate.latest_run.run_stats ?? null : null
  const tint =
    candidate.role === "PROMOTED_REFERENCE"
      ? "rgba(200,169,104,0.04)"
      : isLeader
        ? "rgba(200,169,104,0.02)"
        : "transparent"
  const clickable = !!passportHref
  const Outer: React.ElementType = clickable ? Link : "div"
  const outerProps: Record<string, unknown> = clickable
    ? { href: passportHref, style: { textDecoration: "none", color: "inherit", display: "block" } }
    : {}

  return (
    <Outer
      {...outerProps}
      style={{
        ...((outerProps.style as object) ?? {}),
        padding: "12px 14px",
        background: tint,
        borderBottom: isLast ? "none" : "1px solid var(--vr-line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="t-h4"
            style={{
              fontSize: 14,
              color: "var(--vr-cream)",
              fontFamily: "var(--ff-serif)",
              fontWeight: 500,
              lineHeight: 1.25,
            }}
          >
            {candidate.title}
          </div>
          <div
            className="t-ticker"
            style={{
              fontSize: 9,
              marginTop: 3,
              color: "var(--vr-cream-faint)",
              textTransform: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {candidate.candidate_id}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <RoleTag role={candidate.role} />
          {clickable && (
            <span
              aria-hidden
              className="t-eyebrow"
              style={{
                fontSize: 9,
                color: "var(--vr-gold)",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
                <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </span>
          )}
        </div>
      </div>

      {candidate === candidate && (candidate.latest_run?.run_id || candidate.latest_run?.summary) && (
        <div
          className="t-eyebrow"
          style={{ fontSize: 9, marginTop: 8, color: "var(--vr-cream-faint)" }}
        >
          {candidate.latest_run?.run_id
            ? (
                <>
                  Run · <span className="t-ticker" style={{ textTransform: "none" }}>{candidate.latest_run.run_id}</span>
                  {candidate.latest_run.completed_at ? ` · ${relTime(candidate.latest_run.completed_at)}` : ""}
                </>
              )
            : "No run yet under this manifest"}
        </div>
      )}

      {candidate.latest_run?.summary && (
        <div
          className="t-read"
          style={{
            fontSize: 12,
            color: "var(--vr-cream-dim)",
            lineHeight: 1.5,
            marginTop: 5,
          }}
        >
          {candidate.latest_run.summary}
        </div>
      )}

      {/* Compact stats grid — only when INDEXED */}
      {stats && (
        <div
          style={{
            marginTop: 9,
            border: "1px solid var(--vr-line)",
            borderRadius: 3,
            background: "rgba(6, 7, 14, 0.35)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              borderBottom: "1px solid var(--vr-line)",
            }}
          >
            <div style={{ borderRight: "1px solid var(--vr-line)" }}>
              <PerformanceCell
                label="Total return"
                value={formatPct(stats.total_return_pct, true)}
                valueColor={signColor(stats.total_return_pct)}
              />
            </div>
            <div style={{ borderRight: "1px solid var(--vr-line)" }}>
              <PerformanceCell
                label={`vs ${benchmarkSymbol}`}
                value={formatPct(stats.excess_return_pct, true)}
                valueColor={signColor(stats.excess_return_pct)}
                sub={
                  stats.benchmark_return_pct != null
                    ? `bench ${formatPct(stats.benchmark_return_pct, true)}`
                    : null
                }
              />
            </div>
            <div>
              <PerformanceCell
                label="Max DD"
                value={
                  stats.max_drawdown_pct != null ? `${stats.max_drawdown_pct.toFixed(2)}%` : "—"
                }
                valueColor="var(--vr-down)"
                sub={
                  stats.benchmark_max_drawdown_pct != null
                    ? `bench ${stats.benchmark_max_drawdown_pct.toFixed(2)}%`
                    : null
                }
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div style={{ borderRight: "1px solid var(--vr-line)" }}>
              <PerformanceCell label="Sharpe" value={formatNum(stats.sharpe)} sub={stats.benchmark_sharpe != null ? `bench ${formatNum(stats.benchmark_sharpe)}` : null} />
            </div>
            <div style={{ borderRight: "1px solid var(--vr-line)" }}>
              <PerformanceCell
                label="Win rate"
                value={stats.win_rate_pct != null ? `${formatNum(stats.win_rate_pct, 1)}%` : "—"}
                sub={stats.profit_factor != null ? `PF ${formatNum(stats.profit_factor)}` : null}
              />
            </div>
            <div>
              <PerformanceCell
                label="Trades"
                value={stats.trades != null ? `${stats.trades}` : "—"}
                sub={stats.period ? windowLabel(stats.period) : null}
              />
            </div>
          </div>
          {eraStrip(stats) && (
            <div style={{ padding: "8px 10px", borderTop: "1px solid var(--vr-line)" }}>
              <div
                className="t-eyebrow"
                style={{ fontSize: 8.5, marginBottom: 4, color: "var(--vr-cream-mute)" }}
              >
                Era sweep
              </div>
              {eraStrip(stats)}
            </div>
          )}
        </div>
      )}

      {/* Pending-normalization hint */}
      {!stats && candidate.latest_run?.run_stats_status === "NOT_INDEXED" && (
        <div
          style={{
            marginTop: 8,
            padding: "7px 10px",
            border: "1px dashed var(--vr-line)",
            borderRadius: 3,
          }}
        >
          <div
            className="t-eyebrow"
            style={{
              fontSize: 9,
              color: "var(--vr-cream-faint)",
              fontStyle: "italic",
              fontFamily: "var(--ff-serif)",
              letterSpacing: 0,
              textTransform: "none",
            }}
          >
            Stats pending normalization
          </div>
        </div>
      )}

      {candidate.notes && candidate.notes.length > 0 && (
        <ul
          style={{
            margin: "8px 0 0",
            padding: "0 0 0 16px",
            color: "var(--vr-cream-dim)",
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          {candidate.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {/* Honest footnote for candidates that don't have a passport yet. */}
      {!clickable && (
        <div
          className="t-label"
          style={{
            fontSize: 10,
            marginTop: 8,
            color: "var(--vr-cream-faint)",
            fontStyle: "italic",
            fontFamily: "var(--ff-serif)",
          }}
        >
          Bench passport lands with promotion-v2.
        </div>
      )}
    </Outer>
  )
}

// ─── Family group ───────────────────────────────────────────────────────────

function FamilyGroupView({
  family,
  candidates,
  leaderId,
  benchmarkSymbol,
  passportByCandidateId,
}: {
  family: FamilyGroupT
  candidates: Candidate[]
  leaderId: string | null
  benchmarkSymbol: string
  passportByCandidateId: Record<string, string>
}) {
  if (!candidates.length) return null
  const ROLE_ORDER: Record<string, number> = { PROMOTED_REFERENCE: 0, LEADER: 1, CHALLENGER: 2 }
  const sorted = [...candidates].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3),
  )
  return (
    <div className="vr-card" style={{ padding: 0, background: "var(--vr-ink)" }}>
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--vr-line)",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          justifyContent: "space-between",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4, color: "var(--vr-cream-mute)" }}>
            Family
          </div>
          <div
            className="t-h3"
            style={{
              fontSize: 16,
              color: "var(--vr-cream)",
              fontFamily: "var(--ff-serif)",
              fontWeight: 500,
              lineHeight: 1.25,
            }}
          >
            {family.title}
          </div>
          {family.summary && (
            <div
              className="t-read"
              style={{ fontSize: 11, color: "var(--vr-cream-dim)", lineHeight: 1.5, marginTop: 4 }}
            >
              {family.summary}
            </div>
          )}
        </div>
        <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-faint)", whiteSpace: "nowrap" }}>
          {sorted.length} {sorted.length === 1 ? "candidate" : "candidates"}
        </div>
      </div>
      {sorted.map((c, i) => {
        const passportId = passportByCandidateId[c.candidate_id]
        return (
          <CampaignCandidateRow
            key={c.candidate_id}
            candidate={c}
            isLeader={c.candidate_id === leaderId}
            isLast={i === sorted.length - 1}
            benchmarkSymbol={benchmarkSymbol}
            passportHref={passportId ? `/vires/bench/passport/${encodeURIComponent(passportId)}` : undefined}
          />
        )
      })}
    </div>
  )
}

// ─── Main detail page ──────────────────────────────────────────────────────

export function ViresCampaignsDetail({
  campaign,
  passportByCandidateId = {},
}: {
  campaign: CampaignManifest
  passportByCandidateId?: Record<string, string>
}) {
  const candidatesById = useMemo(() => {
    const m: Record<string, Candidate> = {}
    for (const c of campaign.candidates) m[c.candidate_id] = c
    return m
  }, [campaign])

  const leaderId = campaign.current_leader_candidate_id
  const leader = leaderId ? candidatesById[leaderId] : undefined
  const runnerUp =
    campaign.recency_signals.runner_up_candidate_id
      ? candidatesById[campaign.recency_signals.runner_up_candidate_id]
      : undefined
  const rs = campaign.recency_signals

  const baseline = getBaseline(campaign)
  const baselineCandidate =
    baseline?.candidate_id != null ? candidatesById[baseline.candidate_id] : undefined
  const featuredCandidate = leader ?? baselineCandidate
  const pressure = getCampaignPressure(campaign)
  const leaderComp = getLeaderComparison(campaign)
  const perfState = baselinePerformanceState(campaign)

  // The "Candidates by family" leaderboard is the challenger story. The
  // baseline candidate (role: PROMOTED_REFERENCE) lives at the top of the
  // page already — as the featured Leader card when no real leader exists,
  // and as the source for the Baseline Performance block. Listing it again
  // under its original family makes it look like a family is competing in
  // the campaign when really it's just the bar everyone's jumping.
  const leaderboardCandidates = campaign.candidates.filter(
    c => c.role !== "PROMOTED_REFERENCE",
  )
  const familiesWithCandidates = campaign.family_groups
    .map(f => ({
      family: f,
      candidates: leaderboardCandidates.filter(c => c.family_id === f.family_id),
    }))
    .filter(g => g.candidates.length > 0)

  const groupedIds = new Set(
    familiesWithCandidates.flatMap(g => g.candidates.map(x => x.candidate_id)),
  )
  const orphans = leaderboardCandidates.filter(x => !groupedIds.has(x.candidate_id))

  const sleeveKey = (campaign.sleeve ?? "").toString().toLowerCase()
  const sleeveIsValid = sleeveKey === "stocks" || sleeveKey === "options" || sleeveKey === "crypto"

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Back nav */}
      <Link
        href="/vires/bench/campaigns"
        className="t-eyebrow"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--vr-cream-mute)",
          alignSelf: "flex-start",
          textDecoration: "none",
        }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M6 1L2 4L6 7" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        Campaigns
      </Link>

      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          {sleeveIsValid && <SleeveChip sleeve={sleeveKey as Sleeve} />}
          <span style={{ color: "var(--vr-cream-faint)" }}>·</span>
          <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
            vs {campaign.benchmark_symbol}
          </span>
          <span style={{ flex: 1 }} />
          <StatusPillCampaign status={campaign.status} />
          {pressure && <PressureChip status={pressure.status} />}
        </div>
        <div className="t-eyebrow" style={{ marginBottom: 4 }}>Campaign</div>
        <div className="t-h2" style={{ lineHeight: 1.2 }}>{campaign.title}</div>
        {pressure?.summary && (
          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              color: "var(--vr-cream-dim)",
              lineHeight: 1.55,
            }}
          >
            {pressure.summary}
            {pressure.as_of && (
              <span
                className="t-eyebrow"
                style={{
                  fontSize: 9,
                  color: "var(--vr-cream-faint)",
                  marginLeft: 8,
                  fontStyle: "normal",
                  fontFamily: "var(--ff-sans)",
                }}
              >
                assessed {relTime(pressure.as_of)}
              </span>
            )}
          </div>
        )}
        <div
          className="t-read"
          style={{
            fontSize: 13,
            marginTop: 10,
            color: "var(--vr-cream-dim)",
            lineHeight: 1.6,
          }}
        >
          {campaign.objective}
        </div>
      </div>

      {/* Promotion readiness — Passport v2 §4. Renders as the live scorecard
          when promotion_readiness.readiness is present; falls back to a
          promotion_target-only callout when the backend hasn't landed yet. */}
      <PromotionReadinessCard campaign={campaign} />

      {/* Leader card — role-tagged, with lever strip, baseline performance */}
      {featuredCandidate && (
        <div
          className="vr-card"
          style={{
            padding: 0,
            background:
              featuredCandidate.role === "PROMOTED_REFERENCE" ? "rgba(200,169,104,0.04)" : "var(--vr-ink)",
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--vr-line)" }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 5, color: "var(--vr-cream-mute)" }}>
              {featuredCandidate.role === "PROMOTED_REFERENCE" ? "Baseline to beat" : "Current leader"}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="t-h3"
                  style={{
                    fontSize: 18,
                    lineHeight: 1.25,
                    fontFamily: "var(--ff-serif)",
                    fontWeight: 500,
                  }}
                >
                  {featuredCandidate.title}
                </div>
                <div
                  className="t-ticker"
                  style={{
                    fontSize: 9,
                    marginTop: 3,
                    color: "var(--vr-cream-faint)",
                    textTransform: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {featuredCandidate.candidate_id}
                </div>
              </div>
              <RoleTag role={featuredCandidate.role} />
            </div>
            {featuredCandidate.latest_run?.summary && (
              <div
                className="t-read"
                style={{
                  fontSize: 12,
                  color: "var(--vr-cream-dim)",
                  lineHeight: 1.55,
                  marginTop: 10,
                }}
              >
                {featuredCandidate.latest_run.summary}
              </div>
            )}
          </div>

          {/* Lever strip: 4 shells */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ borderRight: "1px solid var(--vr-line)", borderBottom: "1px solid var(--vr-line)" }}>
              <LeverShell
                eyebrow="Leader stability"
                value={
                  rs.leader_stability_sessions != null
                    ? `${rs.leader_stability_sessions} ${rs.leader_stability_sessions === 1 ? "session" : "sessions"}`
                    : "—"
                }
                sub={rs.last_leader_change_at ? `changed ${relTime(rs.last_leader_change_at)}` : null}
                actionHint="Force leader re-evaluation"
                infoTerm="LeaderStability"
              />
            </div>
            <div style={{ borderBottom: "1px solid var(--vr-line)" }}>
              <LeverShell
                eyebrow="Param sweep"
                value={rs.last_param_sweep_at ? relTime(rs.last_param_sweep_at) : "—"}
                sub={rs.days_since_param_sweep != null ? `${rs.days_since_param_sweep}d since last sweep` : null}
                actionHint="Run new parameter sweep"
                infoTerm="ParamSweep"
              />
            </div>
            <div style={{ borderRight: "1px solid var(--vr-line)" }}>
              <LeverShell
                eyebrow="Runner-up gap"
                value={rs.runner_up_gap?.value != null ? `${rs.runner_up_gap.value}` : "Not quantified"}
                sub={runnerUp ? `vs ${runnerUp.title}` : null}
                actionHint="Open runner-up passport"
                glyph="→"
                infoTerm="RunnerUpGap"
              />
            </div>
            <div>
              <LeverShell
                eyebrow="Last run"
                value={campaign.last_run_at ? relTime(campaign.last_run_at) : "—"}
                sub={
                  campaign.last_meaningful_change_at
                    ? `last meaningful ${relTime(campaign.last_meaningful_change_at)}`
                    : null
                }
                actionHint="Queue fresh run"
                infoTerm="LastRun"
              />
            </div>
          </div>

          {/* Baseline Performance block (reads v2 if present, falls back to v1 leader run_stats) */}
          <BaselinePerformanceBlock
            state={perfState}
            benchmarkSymbol={campaign.benchmark_symbol}
            label="Baseline performance"
            helpCopy="What this campaign must beat."
          />
        </div>
      )}


      {/* Leader vs baseline — v2 only */}
      {leaderComp && <LeaderVsBaselineBlock comp={leaderComp} />}

      {/* Promotion lineage — who has held this campaign's production slot,
          rendered from production_links.history + promotion_events. Omitted
          entirely when neither has content. */}
      <PromotionLineageStrip
        productionLinks={campaign.production_links}
        promotionEvents={campaign.promotion_events}
      />

      {/* Leaderboard by family */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 4,
        }}
      >
        <div>
          <div className="t-eyebrow" style={{ color: "var(--vr-cream-mute)", marginBottom: 4 }}>
            Leaderboard
          </div>
          <div className="t-h2" style={{ fontSize: 22, lineHeight: 1.2 }}>
            Candidates by family
          </div>
        </div>
        <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-faint)" }}>
          {campaign.candidates.length} total
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {familiesWithCandidates.map(g => (
          <FamilyGroupView
            key={g.family.family_id}
            family={g.family}
            candidates={g.candidates}
            leaderId={leaderId}
            benchmarkSymbol={campaign.benchmark_symbol}
            passportByCandidateId={passportByCandidateId}
          />
        ))}
        {orphans.length > 0 && (
          <FamilyGroupView
            family={{
              family_id: "ORPHAN",
              title: "Other candidates",
              summary: "Candidates whose family is not tracked in this campaign.",
            }}
            candidates={orphans}
            leaderId={leaderId}
            benchmarkSymbol={campaign.benchmark_symbol}
            passportByCandidateId={passportByCandidateId}
          />
        )}
      </div>

      {/* Change-log timeline */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 4,
        }}
      >
        <div>
          <div className="t-eyebrow" style={{ color: "var(--vr-cream-mute)", marginBottom: 4 }}>
            Change log
          </div>
          <div className="t-h2" style={{ fontSize: 22, lineHeight: 1.2 }}>
            What has happened
          </div>
        </div>
        <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-faint)" }}>
          {campaign.change_log.length}{" "}
          {campaign.change_log.length === 1 ? "entry" : "entries"}
        </div>
      </div>
      <div className="vr-card" style={{ padding: "16px 16px 14px", background: "var(--vr-ink)" }}>
        <ChangeLogTimeline events={campaign.change_log} candidatesById={candidatesById} />
      </div>

      {/* Footer meta */}
      <div
        style={{
          padding: "12px 14px",
          borderTop: "1px solid var(--vr-line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-faint)" }}>
          Manifest updated {relTime(campaign.updated_at)}
        </div>
        <ActorChip actor={campaign.updated_by} />
      </div>

      {/* Deferral note */}
      <div
        style={{
          marginTop: 4,
          padding: "10px 14px",
          border: "1px dashed var(--vr-line)",
          borderRadius: 4,
        }}
      >
        <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3, color: "var(--vr-cream-faint)" }}>
          Deferred
        </div>
        <div className="t-read" style={{ fontSize: 11, color: "var(--vr-cream-mute)", lineHeight: 1.5 }}>
          Candidate rows will deep-link into passport pages when the
          passport-manifest wiring completes. Lever actions wire in v2.
        </div>
      </div>
    </div>
  )
}
