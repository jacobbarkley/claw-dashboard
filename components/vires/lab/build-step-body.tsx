"use client"

// Build step body for the redesigned Idea Detail timeline. Renders one of:
//
//   - "Draft a spec first" informational copy if no active spec exists
//   - "Spec still drafting" informational copy if spec is DRAFTING
//   - "Request implementation" primary CTA if spec is AWAITING_APPROVAL and
//     no queue entry exists yet (POST /api/research/specs/{spec_id}/approve)
//   - Queue state pill (QUEUED / CLAIMED / IMPLEMENTING / FAILED / COMPLETED /
//     CANCELLED) once an implementation queue entry exists
//   - Done copy when the strategy is REGISTERED
//
// Mirrors the spec lifecycle: DRAFTING → AWAITING_APPROVAL → APPROVED →
// IMPLEMENTING → REGISTERED. The approve POST transitions
// AWAITING_APPROVAL → APPROVED in one server-side commit and creates the
// queue entry, so the operator only needs one button to start the
// implementation handoff.

import { useRouter } from "next/navigation"
import { useState } from "react"

import type {
  IdeaArtifact,
  SpecImplementationQueueState,
  SpecImplementationQueueV1,
  StrategySpecV1,
} from "@/lib/research-lab-contracts"

const QUEUE_STATE_COLOR: Record<SpecImplementationQueueState, string> = {
  QUEUED:       "var(--vr-cream-mute)",
  CLAIMED:      "var(--vr-gold)",
  IMPLEMENTING: "var(--vr-gold)",
  COMPLETED:    "var(--vr-up)",
  FAILED:       "var(--vr-down)",
  CANCELLED:    "var(--vr-cream-faint)",
}

interface Props {
  idea: IdeaArtifact
  activeSpec: StrategySpecV1 | null
  activeQueueEntry: SpecImplementationQueueV1 | null
}

export function BuildStepBody({ idea, activeSpec, activeQueueEntry }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // No spec yet — operator needs to draft one first.
  if (!activeSpec) {
    return (
      <InfoCopy>
        Draft a spec on the Spec step before requesting implementation.
        Talon can author a first pass from the thesis.
      </InfoCopy>
    )
  }

  // Spec is still being drafted — finalize it on the Spec builder.
  if (activeSpec.state === "DRAFTING") {
    return (
      <InfoCopy>
        Spec is still drafting. Save and submit it for approval from the
        Spec builder to enable implementation here.
      </InfoCopy>
    )
  }

  // Spec is registered — implementation done. Bench Job will have re-enabled
  // submit by now. This branch is for completeness.
  if (activeSpec.state === "REGISTERED") {
    return (
      <InfoCopy>
        Strategy implemented and registered as{" "}
        <span className="t-mono">{idea.strategy_id}</span>. Submit a campaign
        run from the Bench Job step.
      </InfoCopy>
    )
  }

  // Queue entry exists — show its state.
  if (activeQueueEntry) {
    return <QueueState entry={activeQueueEntry} />
  }

  // Spec is AWAITING_APPROVAL with no queue entry — operator can request.
  if (activeSpec.state === "AWAITING_APPROVAL") {
    const onRequest = async () => {
      if (submitting) return
      setSubmitting(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/research/specs/${encodeURIComponent(activeSpec.spec_id)}/approve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actor: idea.created_by ?? "jacob" }),
          },
        )
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        if (!res.ok) {
          throw new Error(payload.error ?? `Request failed (${res.status})`)
        }
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed")
        setSubmitting(false)
      }
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          className="t-read"
          style={{ fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}
        >
          Approve the spec and queue it for implementation. Codex picks up the
          approved spec, scaffolds the strategy module, registers it under a
          real <span className="t-mono">strategy_id</span>, and adds tests.
        </div>
        <button
          type="button"
          onClick={onRequest}
          disabled={submitting}
          className="t-eyebrow"
          style={{
            alignSelf: "flex-start",
            cursor: submitting ? "default" : "pointer",
            fontSize: 10,
            letterSpacing: "0.16em",
            fontFamily: "var(--ff-mono)",
            textTransform: "uppercase",
            padding: "8px 16px",
            borderRadius: 3,
            border: "1px solid var(--vr-gold)",
            background: submitting ? "transparent" : "var(--vr-gold)",
            color: submitting ? "var(--vr-gold)" : "var(--vr-ink)",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "REQUESTING…" : "REQUEST IMPLEMENTATION ›"}
        </button>
        {error && (
          <div
            className="t-read"
            style={{
              fontSize: 11,
              color: "var(--vr-down)",
              lineHeight: 1.5,
              padding: "6px 10px",
              border: "1px solid rgba(220, 95, 95, 0.4)",
              borderRadius: 3,
            }}
          >
            {error}
          </div>
        )}
      </div>
    )
  }

  // Spec is APPROVED but no queue entry — unusual state (queue entry should
  // be created by the approve endpoint atomically). Show informational copy.
  return (
    <InfoCopy>
      Spec approved. Implementation queue entry not yet visible — refresh in
      a moment, or contact Codex if this persists.
    </InfoCopy>
  )
}

function InfoCopy({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="t-read"
      style={{ fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}
    >
      {children}
    </div>
  )
}

function QueueState({ entry }: { entry: SpecImplementationQueueV1 }) {
  const color = QUEUE_STATE_COLOR[entry.state]
  const meta = describeQueueState(entry)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span
          className="t-eyebrow"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color,
            border: `1px solid ${color}`,
            padding: "2px 7px",
            borderRadius: 2,
          }}
        >
          {entry.state}
        </span>
        {entry.attempts > 0 && (
          <span
            className="t-mono"
            style={{ fontSize: 10, color: "var(--vr-cream-faint)" }}
          >
            attempt {entry.attempts}
          </span>
        )}
      </div>
      {meta && (
        <div
          className="t-read"
          style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}
        >
          {meta}
        </div>
      )}
      {entry.last_error && (
        <div
          className="t-read"
          style={{
            fontSize: 11,
            color: "var(--vr-down)",
            lineHeight: 1.5,
            padding: "6px 10px",
            border: "1px solid rgba(220, 95, 95, 0.4)",
            borderRadius: 3,
          }}
        >
          {entry.last_error}
        </div>
      )}
    </div>
  )
}

function describeQueueState(entry: SpecImplementationQueueV1): string | null {
  switch (entry.state) {
    case "QUEUED":
      return "Queued for implementation. Codex (or a worker) will claim it."
    case "CLAIMED":
      return entry.claimed_by
        ? `Claimed by ${entry.claimed_by}.`
        : "Claimed for implementation."
    case "IMPLEMENTING":
      return "Codex is scaffolding the strategy module and registering it."
    case "COMPLETED":
      return entry.registered_strategy_id
        ? `Registered as ${entry.registered_strategy_id}.`
        : "Implementation complete."
    case "FAILED":
      return "Implementation failed. See error below."
    case "CANCELLED":
      return entry.cancel_reason
        ? `Cancelled: ${entry.cancel_reason}`
        : "Cancelled."
    default:
      return null
  }
}
