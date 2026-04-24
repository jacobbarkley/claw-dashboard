"use client"

// Candidate scorecard — renders candidate.v1.readiness as a 9-gate surface
// and provides a Promote button that files a governed nomination request.
//
// Adapter-status chip surfaces WIRED / CODE_COMPLETE_UNWIRED / NOT_IMPLEMENTED
// so the user can tell at a glance whether the sleeve's promotion gates are
// actually scoring or showing honest empty state. Phase 1a stocks adapter
// is WIRED; crypto ships later; options not yet.

import { useState } from "react"

import type {
  AdapterStatus,
  CandidateV1,
  ReadinessGateStatus,
  ReadinessOverallStatus,
} from "@/lib/research-lab-contracts"

const GATE_META: Record<ReadinessGateStatus, { label: string; color: string; glyph: string }> = {
  PASS:         { label: "Pass",         color: "var(--vr-up)",         glyph: "●" },
  FAIL:         { label: "Fail",         color: "var(--vr-down)",       glyph: "✗" },
  PENDING:      { label: "Pending",      color: "var(--vr-cream-mute)", glyph: "○" },
  INCONCLUSIVE: { label: "Inconclusive", color: "var(--vr-gold)",       glyph: "◐" },
  BLOCKED:      { label: "Blocked",      color: "var(--vr-down)",       glyph: "✗" },
}

const OVERALL_META: Record<ReadinessOverallStatus, { label: string; color: string }> = {
  READY_TO_NOMINATE: { label: "Ready to nominate", color: "var(--vr-up)" },
  MONITORED:         { label: "Monitored",         color: "var(--vr-gold)" },
  BLOCKED:           { label: "Blocked",           color: "var(--vr-down)" },
  EMPTY_STATE:       { label: "Empty state",       color: "var(--vr-cream-mute)" },
}

const ADAPTER_META: Record<AdapterStatus, { label: string; color: string; note: string }> = {
  WIRED: {
    label: "adapter · wired",
    color: "var(--vr-up)",
    note: "Producer path populates this scorecard with real gate data.",
  },
  CODE_COMPLETE_UNWIRED: {
    label: "adapter · code complete, unwired",
    color: "var(--vr-gold)",
    note: "The readiness checker exists but the producer doesn't call it yet. Promotion requires manual review for this sleeve.",
  },
  NOT_IMPLEMENTED: {
    label: "adapter · not implemented",
    color: "var(--vr-cream-mute)",
    note: "No readiness checker for this sleeve yet. Promotion requires manual review.",
  },
}

function fmtValue(gate: { value?: number | null }): string {
  if (gate.value == null || !Number.isFinite(gate.value)) return "—"
  return gate.value.toFixed(2)
}

function fmtThreshold(gate: { threshold?: number | null }): string {
  if (gate.threshold == null || !Number.isFinite(gate.threshold)) return ""
  return `≥ ${gate.threshold.toFixed(2)}`
}

export function CandidateScorecard({ candidate }: { candidate: CandidateV1 }) {
  const [promoteState, setPromoteState] = useState<"idle" | "submitting" | "ok" | "error">("idle")
  const [promoteDetail, setPromoteDetail] = useState<string | null>(null)

  const readiness = candidate.readiness
  const overall = OVERALL_META[readiness.overall_status]
  const adapter = ADAPTER_META[candidate.adapter_status]
  const canPromote =
    readiness.overall_status === "READY_TO_NOMINATE" &&
    candidate.adapter_status === "WIRED" &&
    promoteState !== "submitting" &&
    promoteState !== "ok"

  const handlePromote = async () => {
    if (!canPromote) return
    setPromoteState("submitting")
    setPromoteDetail(null)
    try {
      const res = await fetch("/api/research/nominations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidate.candidate_id,
          result_id: candidate.result_id,
          idea_id: candidate.idea_id,
          user_id: candidate.user_id,
          account_id: candidate.account_id,
          strategy_group_id: candidate.strategy_group_id,
          sleeve: candidate.sleeve,
          strategy_id: candidate.strategy_id,
          actor: "jacob",
          submitted_by: "USER_ONDEMAND",
        }),
      })
      const payload = (await res.json()) as { ok?: boolean; error?: string; commit_sha?: string | null; mode?: string }
      if (!res.ok || !payload.ok) {
        setPromoteState("error")
        setPromoteDetail(payload.error ?? `HTTP ${res.status}`)
        return
      }
      setPromoteState("ok")
      setPromoteDetail(
        payload.mode === "github"
          ? `Nomination committed (${(payload.commit_sha ?? "").slice(0, 8)}). The worker's nomination adapter will process it on the next sync.`
          : `Nomination recorded locally. The worker's nomination adapter will process it on the next sync.`,
      )
    } catch (err) {
      setPromoteState("error")
      setPromoteDetail(err instanceof Error ? err.message : "Network error")
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
      {/* Header */}
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
          <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-gold)", letterSpacing: "0.14em" }}>
            Candidate · promotion readiness
          </div>
          <div
            className="t-mono"
            style={{ marginTop: 3, fontSize: 10.5, color: "var(--vr-cream-mute)" }}
          >
            {candidate.candidate_id} · {candidate.sleeve} · strategy_id={candidate.strategy_id}
          </div>
        </div>
        <span
          className="t-eyebrow"
          style={{
            padding: "3px 8px",
            fontSize: 9,
            letterSpacing: "0.14em",
            borderRadius: 2,
            border: `1px solid ${overall.color}`,
            color: overall.color,
          }}
        >
          {overall.label}
        </span>
      </div>

      {/* Adapter status + evaluated_at */}
      <div
        style={{
          padding: "10px 16px 0",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          className="t-eyebrow"
          style={{
            padding: "2px 7px",
            fontSize: 9,
            letterSpacing: "0.14em",
            borderRadius: 2,
            border: `1px solid ${adapter.color}`,
            color: adapter.color,
          }}
        >
          {adapter.label}
        </span>
        <span
          className="t-mono"
          style={{ fontSize: 10.5, color: "var(--vr-cream-mute)" }}
        >
          evaluated {candidate.evaluated_at}
        </span>
      </div>
      <div
        style={{
          padding: "6px 16px 0",
          fontSize: 11.5,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream-dim)",
          lineHeight: 1.55,
        }}
      >
        {adapter.note}
      </div>

      {/* Gates */}
      <div style={{ padding: "12px 0 4px" }}>
        {readiness.gates.length === 0 ? (
          <div
            style={{
              padding: "12px 16px",
              fontSize: 12,
              color: "var(--vr-cream-mute)",
              fontStyle: "italic",
              fontFamily: "var(--ff-serif)",
            }}
          >
            No gate data in this projection. Empty-state renders when the adapter
            returns an untagged readiness block.
          </div>
        ) : (
          readiness.gates.map((g, idx) => {
            const meta = GATE_META[g.status] ?? GATE_META.PENDING
            const lastRow = idx === readiness.gates.length - 1
            return (
              <div
                key={g.gate_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "18px 1fr auto auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 16px",
                  borderBottom: lastRow ? "none" : "1px solid var(--vr-line)",
                }}
              >
                <span aria-hidden style={{ color: meta.color, fontSize: 12, textAlign: "center", lineHeight: 1 }}>
                  {meta.glyph}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    className="t-label"
                    style={{
                      fontSize: 12,
                      color: "var(--vr-cream)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {g.label}
                  </div>
                  {g.summary || g.detail ? (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 10.5,
                        color: "var(--vr-cream-mute)",
                        lineHeight: 1.5,
                      }}
                    >
                      {g.summary ?? g.detail}
                    </div>
                  ) : null}
                </div>
                <div
                  className="t-num"
                  style={{
                    fontSize: 11,
                    fontVariantNumeric: "tabular-nums",
                    color: meta.color,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {fmtValue(g)}
                </div>
                <div
                  className="t-label"
                  style={{
                    fontSize: 10,
                    color: "var(--vr-cream-faint)",
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 45,
                    textAlign: "right",
                  }}
                >
                  {fmtThreshold(g)}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Blockers */}
      {readiness.blockers && readiness.blockers.length > 0 && (
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--vr-line)",
            fontSize: 11.5,
            color: "var(--vr-down)",
            lineHeight: 1.55,
          }}
        >
          <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-down)", marginBottom: 4 }}>
            Blockers
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {readiness.blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Promote action */}
      <div
        style={{
          padding: "12px 16px 14px",
          borderTop: "1px solid var(--vr-line)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {candidate.promotion_event_id ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--vr-up)",
              lineHeight: 1.55,
            }}
          >
            Promoted · event{" "}
            <span className="t-mono" style={{ color: "var(--vr-cream)" }}>
              {candidate.promotion_event_id}
            </span>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handlePromote}
              disabled={!canPromote}
              className="t-eyebrow"
              style={{
                padding: "9px 14px",
                fontSize: 11,
                letterSpacing: "0.14em",
                borderRadius: 3,
                border: `1px solid ${canPromote ? "var(--vr-gold)" : "var(--vr-line)"}`,
                background: canPromote ? "rgba(200,169,104,0.12)" : "transparent",
                color: canPromote ? "var(--vr-gold)" : "var(--vr-cream-faint)",
                cursor: canPromote ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              {promoteState === "submitting"
                ? "Submitting nomination…"
                : promoteState === "ok"
                  ? "Nomination recorded"
                  : canPromote
                    ? "Promote · file nomination"
                    : "Promote disabled"}
            </button>
            {!canPromote && promoteState === "idle" && (
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--vr-cream-mute)",
                  fontStyle: "italic",
                  fontFamily: "var(--ff-serif)",
                  lineHeight: 1.55,
                }}
              >
                {readiness.overall_status !== "READY_TO_NOMINATE"
                  ? "Promote lights up only when overall status is READY_TO_NOMINATE."
                  : candidate.adapter_status !== "WIRED"
                    ? "Promote lights up only when the sleeve's readiness adapter is WIRED."
                    : "Unavailable."}
              </div>
            )}
            <div
              style={{
                fontSize: 10.5,
                color: "var(--vr-cream-mute)",
                fontStyle: "italic",
                fontFamily: "var(--ff-serif)",
                lineHeight: 1.55,
              }}
            >
              Promote files a governed nomination.v1 request. The worker's
              nomination adapter picks it up on the next sync and materializes
              the strategy-bank record + promotion event. The adapter is the
              only path from the research lab into the bank.
            </div>
          </>
        )}
        {promoteDetail && (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 3,
              border: `1px solid ${promoteState === "error" ? "var(--vr-down)" : "var(--vr-up)"}`,
              fontSize: 11,
              color: promoteState === "error" ? "var(--vr-down)" : "var(--vr-up)",
              lineHeight: 1.55,
            }}
          >
            {promoteDetail}
          </div>
        )}
      </div>
    </div>
  )
}
