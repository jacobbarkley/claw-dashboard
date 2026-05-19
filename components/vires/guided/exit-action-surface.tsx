"use client"

import { useState, type CSSProperties } from "react"
import { GuidedHeroCard, SectionLabel } from "./shared"
import type { EnrollmentStatus } from "./types"

// S9.x — exit-action surface (VIR-10).
//
// Three commands per the GUIDED-T1-EXIT-ACTION-SURFACE row:
//   - pause_enrollment       (reversible — paired with resume_enrollment)
//   - stop_hold_to_close     (irreversible — no new entries, existing exits ride)
//   - stop_liquidate         (irreversible — sell everything now, taxable events)
//
// Renders contextually based on the current enrollment status. ACTIVE shows
// all three. PAUSED shows Resume + the two stops. STOP_HOLD_TO_CLOSE shows
// a "force liquidate now" escalation. STOP_LIQUIDATE / ENDED show progress
// or terminal state only. Single confirmation per card (no double-modal —
// the button label carries the stake).

type ExitCommandKey =
  | "pause_enrollment"
  | "resume_enrollment"
  | "stop_hold_to_close"
  | "stop_liquidate"

type SubmitState =
  | { stage: "idle" }
  | { stage: "submitting"; key: ExitCommandKey }
  | { stage: "submitted"; key: ExitCommandKey; warning: string | null }
  | { stage: "error"; key: ExitCommandKey; reason: string }

const ROUTE_BY_COMMAND: Record<ExitCommandKey, string> = {
  pause_enrollment: "/api/guided/pause-enrollment",
  resume_enrollment: "/api/guided/resume-enrollment",
  stop_hold_to_close: "/api/guided/stop-hold-to-close",
  stop_liquidate: "/api/guided/stop-liquidate",
}

export function ExitActionSurface({
  enrollmentId,
  enrollmentStatus,
  onCancel,
}: {
  enrollmentId: string
  enrollmentStatus: EnrollmentStatus
  onCancel: () => void
}) {
  const [submit, setSubmit] = useState<SubmitState>({ stage: "idle" })

  async function fireCommand(key: ExitCommandKey) {
    setSubmit({ stage: "submitting", key })
    try {
      const res = await fetch(ROUTE_BY_COMMAND[key], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollment_id: enrollmentId }),
      })
      const json = (await res.json()) as { ok?: boolean; next_path?: string; error?: string }
      if (res.status === 503) {
        setSubmit({
          stage: "submitted",
          key,
          warning: "Command recorded locally; the runtime is not yet wired in this environment.",
        })
        if (json.next_path) {
          window.setTimeout(() => navigate(json.next_path as string), 800)
        }
        return
      }
      if (!res.ok || !json.ok) {
        setSubmit({ stage: "error", key, reason: json.error ?? `HTTP ${res.status}` })
        return
      }
      setSubmit({ stage: "submitted", key, warning: null })
      if (json.next_path) navigate(json.next_path)
    } catch (err) {
      setSubmit({ stage: "error", key, reason: (err as Error).message ?? "network_error" })
    }
  }

  const disabled = submit.stage === "submitting" || submit.stage === "submitted"
  const allowedActions = actionsForStatus(enrollmentStatus)
  const isPaused = enrollmentStatus === "PAUSED"
  const isStopHolding = enrollmentStatus === "STOP_HOLD_TO_CLOSE"
  const isLiquidating = enrollmentStatus === "STOP_LIQUIDATE"
  const isEnded = enrollmentStatus === "ENDED"

  return (
    <GuidedHeroCard>
      <button type="button" onClick={onCancel} disabled={disabled} style={backLink}>
        ← Back to enrollment
      </button>

      <h1 style={heading}>Manage this enrollment</h1>
      <p style={subtitle}>
        Pause, stop, or liquidate. The runtime executes — this surface issues the command and shows
        progress.
      </p>

      <StatusBanner status={enrollmentStatus} />

      {/* PAUSE / RESUME */}
      {allowedActions.has("pause_enrollment") || allowedActions.has("resume_enrollment") ? (
        <ExitCard
          tone="neutral"
          title={isPaused ? "Resume" : "Pause"}
          body={
            isPaused
              ? "Re-enable signals. Holdings stay as they are; new entries can fire on the next signal."
              : "Stop accepting new signals. Holdings stay as they are. You can resume any time."
          }
          buttonLabel={
            isPaused
              ? submitLabel(submit, "resume_enrollment", "Resume")
              : submitLabel(submit, "pause_enrollment", "Pause")
          }
          onClick={() => fireCommand(isPaused ? "resume_enrollment" : "pause_enrollment")}
          disabled={disabled}
        />
      ) : null}

      {/* STOP & HOLD */}
      {allowedActions.has("stop_hold_to_close") ? (
        <ExitCard
          tone="warning"
          title="Stop & hold to close"
          body="No new entries. Existing positions exit through normal signals. Sleeve winds down naturally."
          irreversible
          buttonLabel={submitLabel(submit, "stop_hold_to_close", "Stop opening new positions")}
          onClick={() => fireCommand("stop_hold_to_close")}
          disabled={disabled}
        />
      ) : null}

      {/* STOP & LIQUIDATE */}
      {allowedActions.has("stop_liquidate") ? (
        <ExitCard
          tone="danger"
          title="Stop & liquidate now"
          body="Sell every strategy position at market. Triggers taxable events. There is no undo."
          irreversible
          buttonLabel={submitLabel(submit, "stop_liquidate", "Liquidate everything now")}
          onClick={() => fireCommand("stop_liquidate")}
          disabled={disabled}
        />
      ) : null}

      {isStopHolding ? (
        <div style={infoBox}>
          Stop & hold is in progress. Existing positions will exit through normal signals. Use{" "}
          <em>Liquidate everything now</em> above to escalate.
        </div>
      ) : null}
      {isLiquidating ? (
        <div style={infoBox}>
          Liquidation is in progress. Once complete the enrollment moves to <strong>ENDED</strong>.
        </div>
      ) : null}
      {isEnded ? (
        <div style={infoBox}>
          This enrollment has ended. To start a new strategy, go back to the questionnaire.
        </div>
      ) : null}

      {submit.stage === "error" ? (
        <div style={errorBox}>
          Could not execute that command ({submit.reason}). The state on the runtime is unchanged.
        </div>
      ) : null}

      {submit.stage === "submitted" && submit.warning ? (
        <div style={warningBox}>{submit.warning}</div>
      ) : null}
    </GuidedHeroCard>
  )
}

function actionsForStatus(status: EnrollmentStatus): Set<ExitCommandKey> {
  switch (status) {
    case "ACTIVE":
      return new Set<ExitCommandKey>(["pause_enrollment", "stop_hold_to_close", "stop_liquidate"])
    case "PAUSED":
      return new Set<ExitCommandKey>(["resume_enrollment", "stop_hold_to_close", "stop_liquidate"])
    case "STOP_HOLD_TO_CLOSE":
      return new Set<ExitCommandKey>(["stop_liquidate"])
    // All other states (broker variants, ENDED, ACCEPTED_PENDING_BROKER) show no exit affordance
    // for the first slice — broker variants get repair flows separately; ENDED is terminal.
    default:
      return new Set()
  }
}

function StatusBanner({ status }: { status: EnrollmentStatus }) {
  return (
    <div style={statusBanner}>
      <span style={statusLabel}>Current status</span>
      <span style={statusValue}>{status}</span>
    </div>
  )
}

function ExitCard({
  tone,
  title,
  body,
  buttonLabel,
  onClick,
  disabled,
  irreversible,
}: {
  tone: "neutral" | "warning" | "danger"
  title: string
  body: string
  buttonLabel: string
  onClick: () => void
  disabled: boolean
  irreversible?: boolean
}) {
  const palette = TONE_PALETTE[tone]
  return (
    <div
      style={{
        padding: 16,
        border: `1px solid ${palette.border}`,
        background: palette.background,
        borderRadius: 3,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <SectionLabel>{title}</SectionLabel>
        {irreversible ? (
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: palette.accent,
            }}
          >
            Irreversible
          </span>
        ) : null}
      </div>
      <p
        style={{
          fontSize: 13,
          color: "var(--vr-cream-dim, #c4bdac)",
          lineHeight: 1.55,
          marginTop: 6,
          marginBottom: 14,
        }}
      >
        {body}
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={{
          padding: "10px 16px",
          background: palette.buttonBg,
          color: palette.buttonFg,
          border: `1px solid ${palette.buttonBorder}`,
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          borderRadius: 2,
        }}
      >
        {buttonLabel}
      </button>
    </div>
  )
}

function submitLabel(state: SubmitState, key: ExitCommandKey, idleLabel: string): string {
  if (state.stage === "submitting" && state.key === key) return "Sending…"
  if (state.stage === "submitted" && state.key === key) return "Sent"
  return idleLabel
}

function navigate(path: string) {
  if (typeof window === "undefined") return
  window.location.assign(path)
}

// ─── Styles ────────────────────────────────────────────────────────────────

const TONE_PALETTE = {
  neutral: {
    border: "var(--vr-line, #2a2438)",
    background: "rgba(241,236,224,0.02)",
    accent: "var(--vr-cream-mute, #8c8579)",
    buttonBg: "transparent",
    buttonFg: "var(--vr-cream, #f1ece0)",
    buttonBorder: "var(--vr-cream-mute, #8c8579)",
  },
  warning: {
    border: "rgba(200,169,104,0.40)",
    background: "rgba(200,169,104,0.04)",
    accent: "var(--vr-gold, #c8a968)",
    buttonBg: "transparent",
    buttonFg: "var(--vr-gold, #c8a968)",
    buttonBorder: "var(--vr-gold, #c8a968)",
  },
  danger: {
    border: "#c8686855",
    background: "rgba(200,104,104,0.05)",
    accent: "#e6a8a8",
    buttonBg: "rgba(200,104,104,0.10)",
    buttonFg: "#f1d2d2",
    buttonBorder: "#c86868",
  },
} as const

const backLink: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--vr-cream-mute, #8c8579)",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  cursor: "pointer",
  padding: 0,
  marginBottom: 14,
}

const heading: CSSProperties = {
  fontSize: 24,
  fontFamily: "var(--ff-serif)",
  fontStyle: "italic",
  color: "var(--vr-cream, #f1ece0)",
  fontWeight: 400,
  marginTop: 0,
  marginBottom: 6,
  lineHeight: 1.2,
}

const subtitle: CSSProperties = {
  fontSize: 12,
  color: "var(--vr-cream-mute, #8c8579)",
  lineHeight: 1.55,
  marginTop: 0,
  marginBottom: 22,
}

const statusBanner: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  padding: "10px 12px",
  border: "1px dashed var(--vr-line, #2a2438)",
  background: "rgba(241,236,224,0.02)",
  borderRadius: 2,
  marginBottom: 18,
}

const statusLabel: CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--vr-cream-mute, #8c8579)",
}

const statusValue: CSSProperties = {
  fontSize: 12,
  fontFamily: "var(--ff-mono)",
  color: "var(--vr-cream, #f1ece0)",
}

const infoBox: CSSProperties = {
  marginTop: 12,
  padding: 12,
  border: "1px solid var(--vr-line, #2a2438)",
  background: "rgba(241,236,224,0.02)",
  borderRadius: 2,
  fontSize: 12,
  color: "var(--vr-cream-dim, #c4bdac)",
  lineHeight: 1.55,
}

const errorBox: CSSProperties = {
  marginTop: 14,
  padding: 10,
  border: "1px solid #c8686855",
  background: "rgba(200,104,104,0.06)",
  color: "#e6a8a8",
  fontSize: 12,
  borderRadius: 2,
  lineHeight: 1.5,
}

const warningBox: CSSProperties = {
  marginTop: 14,
  padding: 10,
  border: "1px dashed var(--vr-gold, #c8a968)55",
  background: "rgba(200,169,104,0.05)",
  color: "var(--vr-cream-dim, #c4bdac)",
  fontSize: 12,
  borderRadius: 2,
  lineHeight: 1.5,
}
