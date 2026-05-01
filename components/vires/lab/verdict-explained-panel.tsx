// Server-rendered verdict summary. Promotes "why this is BLOCKED /
// MONITORED / etc." from buried-in-scorecard to first-class. The full
// scorecard with all 9 gates lives in the Details disclosure below.

import type { CandidateV1 } from "@/lib/research-lab-contracts"

const OVERALL_LABEL: Record<string, string> = {
  READY_TO_NOMINATE: "Ready to nominate",
  MONITORED: "Monitored",
  BLOCKED: "Verdict — blocked",
  EMPTY_STATE: "Awaiting evidence",
}

const OVERALL_COLOR: Record<string, string> = {
  READY_TO_NOMINATE: "var(--vr-up)",
  MONITORED: "var(--vr-gold)",
  BLOCKED: "var(--vr-down)",
  EMPTY_STATE: "var(--vr-cream-mute)",
}

const OVERALL_PLAIN: Record<string, string> = {
  READY_TO_NOMINATE:
    "All readiness gates passed. You can promote this strategy to the strategy bank.",
  MONITORED:
    "Some gates are still open. The strategy is interesting but doesn't yet meet the bar.",
  BLOCKED:
    "At least one gate failed. This run can validate plumbing, not strategy merit, until those gates pass.",
  EMPTY_STATE:
    "No readiness data yet. The producer hasn't scored this candidate.",
}

interface VerdictExplainedPanelProps {
  candidate: CandidateV1 | null
}

export function VerdictExplainedPanel({ candidate }: VerdictExplainedPanelProps) {
  if (!candidate) return null

  const overall = candidate.readiness.overall_status
  const label = OVERALL_LABEL[overall] ?? overall
  const color = OVERALL_COLOR[overall] ?? "var(--vr-cream-mute)"
  const plain = OVERALL_PLAIN[overall] ?? null

  const failingGates = (candidate.readiness.gates ?? []).filter(
    g => g.status === "FAIL" || g.status === "BLOCKED",
  )
  const inconclusiveGates = (candidate.readiness.gates ?? []).filter(
    g => g.status === "INCONCLUSIVE",
  )

  return (
    <section
      className="vr-card"
      style={{
        padding: "16px 18px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderLeft: `2px solid ${color}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontSize: 17,
            color: "var(--vr-cream)",
          }}
        >
          {label}
        </div>
      </div>

      {plain && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--vr-cream-dim)",
            lineHeight: 1.55,
          }}
        >
          {plain}
        </div>
      )}

      {failingGates.length > 0 && (
        <GateList
          eyebrow="Why"
          gates={failingGates}
          accent="var(--vr-down)"
        />
      )}

      {failingGates.length === 0 && inconclusiveGates.length > 0 && (
        <GateList
          eyebrow="Open gates"
          gates={inconclusiveGates}
          accent="var(--vr-gold)"
        />
      )}
    </section>
  )
}

function GateList({
  eyebrow,
  gates,
  accent,
}: {
  eyebrow: string
  gates: Array<{
    gate_id: string
    label: string
    summary?: string | null
    value?: number | null
    threshold?: number | null
  }>
  accent: string
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        className="t-eyebrow"
        style={{
          fontSize: 9,
          color: accent,
          letterSpacing: "0.14em",
        }}
      >
        {eyebrow}
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {gates.map(g => (
          <li
            key={g.gate_id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              padding: "8px 10px",
              border: "1px solid var(--vr-line)",
              borderRadius: 3,
              background: "var(--vr-ink)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "var(--vr-cream)",
                  fontFamily: "var(--ff-serif)",
                }}
              >
                {g.label}
              </span>
              {g.value != null && g.threshold != null && (
                <span
                  className="t-mono"
                  style={{
                    fontSize: 11,
                    color: "var(--vr-cream-mute)",
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {g.value.toFixed(2)} of {g.threshold.toFixed(2)}
                </span>
              )}
            </div>
            {g.summary && (
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--vr-cream-faint)",
                  lineHeight: 1.5,
                }}
              >
                {g.summary}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
