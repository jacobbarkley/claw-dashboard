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

// Sleeve-keyed gate shapes for the null-readiness empty state.
//
// Every campaign renders the same section layout regardless of whether
// the producer has scored gates yet — the placeholder mirrors the real
// gate set when one is known. Source of truth for actual scoring is
// always the producer; these lists are UI scaffolding only.
//
// Stocks adapter is WIRED in Phase 1a, so the 9-gate shape is real and
// stable. Crypto + options adapters ship with Phase 1b — until then we
// don't fake a gate set we don't know yet. Their empty state collapses
// to a single honest "adapter pending" row instead of inventing gates.
type GateShapeEntry = { gate_id: string; label: string }

const STOCKS_GATE_SHAPE: GateShapeEntry[] = [
  { gate_id: "TRADE_COUNT",        label: "Minimum trade count" },
  { gate_id: "PROFIT_FACTOR",      label: "Profit factor" },
  { gate_id: "EXPECTANCY",         label: "Expectancy per trade" },
  { gate_id: "PROFITABLE_FOLDS",   label: "Profitable folds" },
  { gate_id: "DRAWDOWN",           label: "Max drawdown bound" },
  { gate_id: "BENCHMARK",          label: "Beats benchmark" },
  { gate_id: "EXPECTANCY_DECAY",   label: "Expectancy decay" },
  { gate_id: "HOLDBACK",           label: "Held-out window" },
  { gate_id: "ERA_ROBUSTNESS",     label: "Era sweep" },
]

const GATE_SHAPE_BY_SLEEVE: Record<string, GateShapeEntry[]> = {
  STOCKS: STOCKS_GATE_SHAPE,
}

function gateShapeForSleeve(sleeve: string | undefined | null): GateShapeEntry[] | null {
  if (!sleeve) return null
  return GATE_SHAPE_BY_SLEEVE[sleeve.toUpperCase()] ?? null
}

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

  // §12 post-apply back-propagation — campaign manifest now carries a
  // real production_links block and promotion_events[] once a nomination
  // applies. Most recent CONFIRMED event is the "promoted" anchor we
  // render in the banner.
  const activeRecordId = campaign.production_links?.active_record_id ?? null
  const confirmedEvents = (campaign.promotion_events ?? []).filter(
    e => e.event_type === "PROMOTION_CONFIRMED",
  )
  const latestConfirmedEvent = confirmedEvents.length
    ? confirmedEvents.reduce((acc, cur) => (cur.at > acc.at ? cur : acc))
    : null
  const isPromoted = !!activeRecordId && !!latestConfirmedEvent

  // Pending / rejected nomination state — a candidate has a nomination on
  // disk that hasn't applied yet (or was rejected by the adapter).
  const pendingNomination = (campaign.candidates ?? []).find(
    c => c.artifact_refs?.nomination_state === "PENDING",
  )
  const rejectedNomination = (campaign.candidates ?? []).find(
    c => c.artifact_refs?.nomination_state === "REJECTED",
  )

  // No-readiness case — render the full scorecard shape with each gate
  // in PENDING. Preserves section layout across every campaign so the
  // template converges even when the producer hasn't scored gates yet.
  // (The old pared-down card made ETF Replacement Momentum and AI Wall
  // Street read as visually divergent when the only real divergence was
  // data maturity.)
  if (!readiness) {
    const statusLabel = campaign.status ?? null
    const sleeveShape = gateShapeForSleeve(campaign.sleeve)
    const placeholderGates: ReadinessGate[] = (sleeveShape ?? []).map(g => ({
      gate_id: g.gate_id,
      label: g.label,
      status: "PENDING",
      source_kind: "VALIDATION_GATE",
      value: null,
      threshold: null,
      summary: null,
    }))
    const sleeveLabel = (campaign.sleeve ?? "").toString().toLowerCase()
    return (
      <div
        className="vr-card"
        style={{
          padding: 0,
          background: "var(--vr-ink)",
        }}
      >
        {/* Header strip — mirrors the scored variant. */}
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
          <span
            className="t-label"
            style={{
              color: "var(--vr-cream-mute)",
              border: "1px solid var(--vr-cream-mute)",
              padding: "3px 8px",
              borderRadius: 2,
              letterSpacing: "0.14em",
              fontSize: 9,
            }}
          >
            Not yet scored
          </span>
        </div>

        {/* Honest empty-state explanation — same slot as the freshness row. */}
        <div
          style={{
            padding: "10px 16px 10px",
          }}
        >
          <span
            className="t-label"
            style={{
              fontSize: 10,
              color: "var(--vr-cream-faint)",
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              lineHeight: 1.55,
            }}
          >
            {sleeveShape
              ? statusLabel
                ? `Gates score once the campaign has converged — currently ${statusLabel}, waiting for sufficient runs.`
                : "Gates score once the campaign has converged. Shape below is the canonical layout; each will fill in as evidence lands."
              : sleeveLabel
                ? `Readiness gates for ${sleeveLabel} sleeve land with the Phase 1b adapter. Until then the producer can't auto-score this campaign — promotion requires manual review.`
                : "Readiness gates land with the sleeve's adapter. Until then promotion requires manual review."}
          </span>
        </div>

        {/* Gate list — only render when we actually know the shape. For
            crypto/options before Phase 1b, skip the row block entirely
            rather than fake gates we don't have ids for. */}
        {sleeveShape && (
          <div>
            {placeholderGates.map((g, idx) => (
              <GateRow key={g.gate_id} gate={g} isLast={idx === placeholderGates.length - 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const readyToNominate = readiness.overall_status === "READY_TO_NOMINATE"
  const blockers = readiness.blockers ?? []
  const candidateId = campaign.promotion_readiness?.origin_candidate_id ?? null
  const canNominate =
    readyToNominate && !!candidateId && requestState !== "success" && !isSubmitting

  const submitNomination = async () => {
    if (!candidateId) {
      setRequestState("error")
      setRequestMessage("Campaign is missing origin_candidate_id — cannot resolve nomination target.")
      return
    }
    setRequestMessage(null)
    setRequestState("idle")
    setIsSubmitting(true)
    try {
      // Research Lab nomination path — the route resolves
      // result_id/idea_id/sleeve/strategy_id from the candidate artifact
      // on disk when not passed explicitly. Worker's nomination adapter
      // picks the request up on next sync and applies it into the bank.
      const response = await fetch("/api/research/nominations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidateId,
          actor: "jacob",
          submitted_by: "USER_ONDEMAND",
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        commit_sha?: string | null
        mode?: string
      }
      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error ?? `Request failed: ${response.status}`)
      }
      setRequestState("success")
      setRequestMessage(
        payload.mode === "github"
          ? `Nomination committed (${(payload.commit_sha ?? "").slice(0, 8)}). Adapter will apply it on the next worker sync.`
          : "Nomination recorded locally. Adapter will apply it on the next worker sync.",
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
        {isPromoted ? (
          <span
            className="t-eyebrow"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 8px 2px",
              color: "var(--vr-gold)",
              border: "1px solid var(--vr-gold-line)",
              background: "var(--vr-gold-soft)",
              borderRadius: 2,
              letterSpacing: "0.14em",
              fontSize: 9,
            }}
          >
            Promoted
          </span>
        ) : (
          <OverallStatusChip status={readiness.overall_status} />
        )}
      </div>

      {/* Promoted banner — durable state from manifest back-propagation.
          Shows the bank record this campaign now owns + when it applied. */}
      {isPromoted && latestConfirmedEvent && activeRecordId && (
        <div
          style={{
            padding: "10px 16px 10px",
            borderBottom: "1px solid var(--vr-line)",
            background: "rgba(200,169,104,0.03)",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-gold)", letterSpacing: "0.14em" }}
          >
            → {activeRecordId}
          </div>
          <div
            className="t-read"
            style={{ fontSize: 11, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
          >
            Promoted {relTime(latestConfirmedEvent.at)}
            {latestConfirmedEvent.passport_role_id ? ` into ${latestConfirmedEvent.passport_role_id}` : ""}
            {latestConfirmedEvent.supersedes_record_id
              ? ` · superseded ${latestConfirmedEvent.supersedes_record_id}`
              : ""}
          </div>
        </div>
      )}

      {/* In-flight nomination — transient PENDING state, adapter hasn't
          applied yet. Kept honest so operators know their click landed. */}
      {!isPromoted && pendingNomination && (
        <div
          style={{
            padding: "10px 16px 10px",
            borderBottom: "1px solid var(--vr-line)",
            background: "rgba(200,169,104,0.03)",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-gold)", letterSpacing: "0.14em" }}
          >
            Nomination pending
          </div>
          <div
            className="t-read"
            style={{ fontSize: 11, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
          >
            {pendingNomination.title} — adapter will apply on the next worker sync.
          </div>
        </div>
      )}

      {/* Rejected nomination — applied with an error. Keeps the failure
          visible rather than silently disappearing the in-flight chip. */}
      {!isPromoted && !pendingNomination && rejectedNomination && (
        <div
          style={{
            padding: "10px 16px 10px",
            borderBottom: "1px solid var(--vr-line)",
            background: "rgba(212,80,80,0.04)",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-down)", letterSpacing: "0.14em" }}
          >
            Nomination rejected
          </div>
          <div
            className="t-read"
            style={{ fontSize: 11, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
          >
            {rejectedNomination.title} — adapter rejected the request. Check the nomination artifact for the reason.
          </div>
        </div>
      )}

      {/* Freshness */}
      <div
        style={{
          padding: "10px 16px 10px",
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

      {/* Nominate action — only renders when the candidate is promotion-
          ready AND the role isn't already filled / in-flight. Blocked and
          pending-gate states are conveyed by the overall-status chip + the
          per-gate glyphs; the durable promoted / pending / rejected banners
          above handle the post-submit states. */}
      {readyToNominate && !isPromoted && !pendingNomination && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--vr-line)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <button
            type="button"
            disabled={!canNominate}
            aria-disabled={!canNominate}
            onClick={() => void submitNomination()}
            title={
              canNominate
                ? "Nominate this candidate into the governed passport workflow"
                : "Nomination already requested"
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "9px 14px",
              border: "1px solid var(--vr-up)",
              background: "rgba(127,194,155,0.08)",
              color: "var(--vr-up)",
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
                : "Nominate for promotion"}
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
      )}
    </div>
  )
}
