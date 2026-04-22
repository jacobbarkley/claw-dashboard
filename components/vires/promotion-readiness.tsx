"use client"

// Promotion Readiness scorecard — Passport v2 §4.
// Replaces the standalone "Promotion target" callout on campaign detail.
// Shows per-gate PASS / FAIL / PENDING / INCONCLUSIVE with InfoPops,
// overall status chip, blockers, and an action shell for "Nominate for
// promotion" that lights only when overall_status is READY_TO_NOMINATE.
//
// Per spec §11: display-only first. The promote-confirm flow wires in v2.

import { useState } from "react"

import type {
  CampaignManifest,
  GateStatus,
  OverallReadinessStatus,
  ReadinessGate,
} from "@/lib/vires-campaigns"
import { InfoPop } from "./shared"
import { relTime } from "./campaigns-shared"

// ─── Status visuals ────────────────────────────────────────────────────────

const GATE_STATUS_META: Record<GateStatus, { label: string; color: string; glyph: string }> = {
  PASS:          { label: "Pass",         color: "var(--vr-up)",          glyph: "●" },
  FAIL:          { label: "Fail",         color: "var(--vr-down)",        glyph: "✗" },
  PENDING:       { label: "Pending",      color: "var(--vr-cream-mute)",  glyph: "○" },
  INCONCLUSIVE:  { label: "Inconclusive", color: "var(--vr-gold)",        glyph: "◐" },
}

const OVERALL_STATUS_META: Record<OverallReadinessStatus, { label: string; color: string }> = {
  READY_TO_NOMINATE: { label: "Ready to nominate", color: "var(--vr-up)" },
  BLOCKED:           { label: "Blocked",           color: "var(--vr-down)" },
  PARTIAL:           { label: "Partial",           color: "var(--vr-gold)" },
}

// Gate id → glossary term. Scoped to stocks gates per spec §4.1; crypto
// gate adapter ships later and we'll extend this map then.
const GATE_INFO_TERM: Record<string, string> = {
  TRADE_COUNT:       "Gate_TRADE_COUNT",
  PROFIT_FACTOR:     "Gate_PROFIT_FACTOR",
  EXPECTANCY:        "Gate_EXPECTANCY",
  PROFITABLE_FOLDS:  "Gate_PROFITABLE_FOLDS",
  DRAWDOWN:          "Gate_DRAWDOWN",
  BENCHMARK:         "Gate_BENCHMARK",
  EXPECTANCY_DECAY:  "Gate_EXPECTANCY_DECAY",
  HOLDBACK:          "Gate_HOLDBACK",
  ERA_ROBUSTNESS:    "Gate_ERA_ROBUSTNESS",
}

// ─── Value + threshold formatting ──────────────────────────────────────────
// Each gate has distinct units and a distinct threshold direction. DRAWDOWN
// is a ceiling (value must be ≤ threshold); the rest are floors (value ≥
// threshold); ERA_ROBUSTNESS uses "X of Y" instead of a comparison.
// Defined per-gate rather than by heuristic so the real producer's shape
// (e.g. drawdown as a positive magnitude, expectancy as raw dollars)
// renders without accidental sign prefixes or reversed directions.

type GateFormatter = {
  valueFmt: (v: number) => string
  thresholdFmt: (t: number) => string
}

const DEFAULT_FMT: GateFormatter = {
  valueFmt: v => v.toFixed(2),
  thresholdFmt: t => `≥ ${t.toFixed(2)}`,
}

const GATE_FMT: Record<string, GateFormatter> = {
  TRADE_COUNT: {
    valueFmt: v => `${Math.round(v)}`,
    thresholdFmt: t => `≥ ${Math.round(t)}`,
  },
  PROFIT_FACTOR: {
    valueFmt: v => v.toFixed(2),
    thresholdFmt: t => `≥ ${t.toFixed(2)}`,
  },
  EXPECTANCY: {
    // Raw per-trade dollars on the modeled capital base.
    valueFmt: v => `$${v.toFixed(2)}`,
    thresholdFmt: t => `≥ $${t.toFixed(2)}`,
  },
  PROFITABLE_FOLDS: {
    // Percentage of folds that closed green. Always non-negative; no sign prefix.
    valueFmt: v => `${v.toFixed(2)}%`,
    thresholdFmt: t => `≥ ${t.toFixed(0)}%`,
  },
  DRAWDOWN: {
    // Producer emits a positive magnitude; display as magnitude (no sign).
    // This is a ceiling — value must be LESS than the threshold.
    valueFmt: v => `${Math.abs(v).toFixed(2)}%`,
    thresholdFmt: t => `≤ ${Math.abs(t).toFixed(0)}%`,
  },
  BENCHMARK: {
    // Signed excess vs benchmark. Sign matters — show +/− prefix.
    valueFmt: v => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`,
    thresholdFmt: t => `≥ ${t.toFixed(2)}%`,
  },
  EXPECTANCY_DECAY: {
    valueFmt: v => v.toFixed(2),
    thresholdFmt: t => `≥ ${t.toFixed(2)}`,
  },
  HOLDBACK: {
    valueFmt: v => v.toFixed(3),
    thresholdFmt: t => `≥ ${t.toFixed(2)}`,
  },
  ERA_ROBUSTNESS: {
    // "Passes X of Y" phrasing — no ≥/≤, just the pass count.
    valueFmt: v => `${Math.round(v)}`,
    thresholdFmt: t => `of ${Math.round(t)}`,
  },
}

function formatValue(gate: ReadinessGate): string {
  if (gate.value == null) return "—"
  const fmt = GATE_FMT[gate.gate_id] ?? DEFAULT_FMT
  return fmt.valueFmt(gate.value)
}

function formatThreshold(gate: ReadinessGate): string | null {
  if (gate.threshold == null) return null
  const fmt = GATE_FMT[gate.gate_id] ?? DEFAULT_FMT
  return fmt.thresholdFmt(gate.threshold)
}

// ─── Status chip ───────────────────────────────────────────────────────────

function OverallStatusChip({ status }: { status: OverallReadinessStatus }) {
  const meta = OVERALL_STATUS_META[status]
  return (
    <span
      className="t-eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px 2px",
        color: meta.color,
        border: `1px solid ${meta.color}55`,
        background: `${meta.color}11`,
        borderRadius: 2,
        letterSpacing: "0.14em",
        fontSize: 9,
      }}
    >
      {meta.label}
    </span>
  )
}

// ─── Gate row ──────────────────────────────────────────────────────────────

function GateRow({ gate, isLast }: { gate: ReadinessGate; isLast: boolean }) {
  const statusMeta = GATE_STATUS_META[gate.status]
  const infoTerm = GATE_INFO_TERM[gate.gate_id] ?? undefined
  const valueStr = formatValue(gate)
  const thresholdStr = formatThreshold(gate)

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "18px 1fr auto auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 14px",
        borderBottom: isLast ? "none" : "1px solid var(--vr-line)",
      }}
    >
      {/* Status glyph */}
      <span
        aria-hidden
        style={{
          color: statusMeta.color,
          fontSize: 12,
          lineHeight: 1,
          textAlign: "center",
        }}
      >
        {statusMeta.glyph}
      </span>

      {/* Label + info button */}
      <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
        <span
          className="t-label"
          style={{
            fontSize: 12,
            color: "var(--vr-cream)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {gate.label}
        </span>
        {infoTerm && <InfoPop term={infoTerm} size={11} />}
      </div>

      {/* Value */}
      <div
        className="t-num"
        style={{
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          color: statusMeta.color,
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        {valueStr}
      </div>

      {/* Threshold (muted, right-aligned) */}
      <div
        className="t-label"
        style={{
          fontSize: 10,
          color: "var(--vr-cream-faint)",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
          minWidth: 50,
          textAlign: "right",
        }}
      >
        {thresholdStr ?? ""}
      </div>
    </div>
  )
}

// ─── Main card ─────────────────────────────────────────────────────────────

export function PromotionReadinessCard({ campaign }: { campaign: CampaignManifest }) {
  const readiness = campaign.promotion_readiness?.readiness ?? null
  const promotionTarget = campaign.promotion_target ?? null
  const [requestState, setRequestState] = useState<"idle" | "success" | "error">("idle")
  const [requestMessage, setRequestMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Degraded case — no readiness data yet but promotion_target present.
  // Render a pared-down version that still carries the editorial narrative.
  if (!readiness) {
    if (!promotionTarget) return null
    return (
      <div
        style={{
          padding: "14px 16px",
          border: "1px solid var(--vr-gold-line, rgba(200,169,104,0.4))",
          borderRadius: 4,
          background: "var(--vr-gold-soft, rgba(200,169,104,0.06))",
        }}
      >
        <div className="t-eyebrow" style={{ color: "var(--vr-gold)", marginBottom: 6 }}>
          Promotion target
        </div>
        <div
          className="t-read"
          style={{
            fontSize: 13,
            fontFamily: "var(--ff-serif)",
            color: "var(--vr-cream)",
            lineHeight: 1.55,
          }}
        >
          {promotionTarget}
        </div>
        <div
          className="t-label"
          style={{
            fontSize: 10,
            color: "var(--vr-cream-faint)",
            marginTop: 8,
            fontStyle: "italic",
            fontFamily: "var(--ff-serif)",
          }}
        >
          Readiness scorecard lands once a candidate is under review.
        </div>
      </div>
    )
  }

  const readyToNominate = readiness.overall_status === "READY_TO_NOMINATE"
  const blockers = readiness.blockers ?? []
  const canNominate = readyToNominate && requestState !== "success" && !isSubmitting

  const submitNomination = async () => {
    setRequestMessage(null)
    setRequestState("idle")
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/passport/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CONFIRM_PROMOTION",
          actor: "operator",
          campaign_id: campaign.campaign_id,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to record the promotion request.")
      }
      setRequestState("success")
      setRequestMessage(
        payload?.mode === "direct"
          ? "Promotion confirmed in the local strategy bank."
          : payload?.mode === "github"
            ? "Nomination request recorded for the live workflow."
            : "Nomination request recorded locally for the next backend sync.",
      )
    } catch (error) {
      setRequestState("error")
      setRequestMessage(error instanceof Error ? error.message : "Unable to record the promotion request.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="vr-card"
      style={{
        padding: 0,
        background: "var(--vr-ink)",
      }}
    >
      {/* Header strip */}
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--vr-line)",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="t-eyebrow" style={{ color: "var(--vr-gold)" }}>
            Promotion readiness
          </span>
          <InfoPop term="PromotionReadiness" size={11} />
        </div>
        <OverallStatusChip status={readiness.overall_status} />
      </div>

      {/* Editorial intro — promotion target. Reframed as "what winning
          looks like" rather than a standalone callout. */}
      {promotionTarget && (
        <div style={{ padding: "10px 16px 6px" }}>
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
            {promotionTarget}
          </div>
        </div>
      )}

      {/* Freshness */}
      <div
        style={{
          padding: "0 16px 10px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          className="t-eyebrow"
          style={{ fontSize: 9, color: "var(--vr-cream-faint)" }}
        >
          Assessed {relTime(readiness.as_of)}
        </span>
      </div>

      {/* Gate rows */}
      <div>
        {readiness.gates.map((g, i) => (
          <GateRow
            key={g.gate_id}
            gate={g}
            isLast={i === readiness.gates.length - 1}
          />
        ))}
      </div>

      {/* Blockers + action shell */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--vr-line)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {blockers.length > 0 && readiness.overall_status !== "READY_TO_NOMINATE" && (
          <div
            className="t-read"
            style={{
              fontSize: 11,
              color: "var(--vr-cream-dim)",
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              lineHeight: 1.5,
            }}
          >
            Blocked by{" "}
            {blockers.map((b, i) => {
              const gate = readiness.gates.find(g => g.gate_id === b)
              const label = gate?.label ?? b.toLowerCase().replace(/_/g, " ")
              return (
                <span key={b}>
                  <span style={{ color: "var(--vr-down)", fontStyle: "normal" }}>
                    {label}
                  </span>
                  {i < blockers.length - 1 ? ", " : ""}
                </span>
              )
            })}
            . Clear these to unlock promotion.
          </div>
        )}

        {/* Nominate button — now wired to the governed passport-workflow
            request path. The route records a promotion request only when the
            scorecard is genuinely promotion-ready. */}
        <button
          type="button"
          disabled={!canNominate}
          aria-disabled={!canNominate}
          onClick={() => void submitNomination()}
          title={
            canNominate
              ? "Nominate this candidate into the governed passport workflow"
              : readyToNominate
                ? "Nomination already requested"
                : "Gates not yet cleared"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "9px 14px",
            border: `1px solid ${
              canNominate || requestState === "success"
                ? "var(--vr-up)"
                : "var(--vr-line-hi, rgba(241,236,224,0.16))"
            }`,
            background: canNominate || requestState === "success" ? "rgba(127,194,155,0.08)" : "transparent",
            color: canNominate || requestState === "success" ? "var(--vr-up)" : "var(--vr-cream-mute)",
            borderRadius: 3,
            fontFamily: "var(--ff-sans)",
            fontWeight: 600,
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor: canNominate ? "pointer" : "default",
            alignSelf: "flex-start",
          }}
        >
          {isSubmitting
            ? "Submitting request"
            : requestState === "success"
              ? "Nomination requested"
              : readyToNominate
                ? "Nominate for promotion"
                : "Awaiting gates"}
          <svg width="10" height="10" viewBox="0 0 8 8" fill="none" aria-hidden>
            <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        {requestMessage && (
          <div
            className="t-read"
            style={{
              fontSize: 11,
              color: requestState === "error" ? "var(--vr-down)" : "var(--vr-cream-dim)",
              lineHeight: 1.45,
            }}
          >
            {requestMessage}
          </div>
        )}
      </div>
    </div>
  )
}
