"use client"

import { useState } from "react"
import type { GuidedEnrollment } from "./types"
import { FieldEyebrow, GuidedHeroCard } from "./shared"

// S5–S8 — Broker connect → pending check → 3 outcome states.
// Mocked-only: a state-switcher at the top lets reviewers walk every
// outcome without driving real broker requests.

type Surface = "connect" | "pending" | "retryable" | "action_required" | "ineligible"

export function BrokerFlowSurface({
  pending,
  retryable,
  actionRequired,
  ineligible,
}: {
  pending: GuidedEnrollment
  retryable: GuidedEnrollment
  actionRequired: GuidedEnrollment
  ineligible: GuidedEnrollment
}) {
  const [surface, setSurface] = useState<Surface>("connect")

  return (
    <>
      <SurfacePicker value={surface} onChange={setSurface} />
      {surface === "connect" ? <Connect onConnect={() => setSurface("pending")} /> : null}
      {surface === "pending" ? <Pending enrollment={pending} /> : null}
      {surface === "retryable" ? <Retryable enrollment={retryable} /> : null}
      {surface === "action_required" ? <ActionRequired enrollment={actionRequired} /> : null}
      {surface === "ineligible" ? <Ineligible enrollment={ineligible} /> : null}
    </>
  )
}

function SurfacePicker({ value, onChange }: { value: Surface; onChange: (s: Surface) => void }) {
  const options: Array<{ key: Surface; label: string }> = [
    { key: "connect", label: "Connect" },
    { key: "pending", label: "Pending" },
    { key: "retryable", label: "Retryable" },
    { key: "action_required", label: "Action req'd" },
    { key: "ineligible", label: "Ineligible" },
  ]
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        marginBottom: 14,
        padding: 4,
        background: "rgba(241,236,224,0.03)",
        border: "1px solid var(--vr-line, #2a2438)",
        borderRadius: 3,
      }}
    >
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          style={{
            padding: "6px 10px",
            background: value === o.key ? "rgba(200,169,104,0.16)" : "transparent",
            border: `1px solid ${value === o.key ? "var(--vr-gold, #c8a968)" : "transparent"}`,
            color: value === o.key ? "var(--vr-gold, #c8a968)" : "var(--vr-cream-mute, #8c8579)",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: "pointer",
            borderRadius: 2,
            whiteSpace: "nowrap",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Connect({ onConnect }: { onConnect: () => void }) {
  return (
    <GuidedHeroCard>
      <h1
        style={{
          fontSize: 22,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream, #f1ece0)",
          fontWeight: 400,
          marginTop: 0,
          marginBottom: 6,
        }}
      >
        Steady Tide is ready
      </h1>
      <p style={{ fontSize: 13, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.55, marginBottom: 18 }}>
        Connect a paper broker account to start.
      </p>

      <div
        style={{
          padding: 16,
          border: "1px solid var(--vr-line, #2a2438)",
          borderRadius: 3,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--vr-gold, #c8a968)",
                fontWeight: 600,
              }}
            >
              Alpaca · Paper account
            </div>
            <div style={{ fontSize: 11, color: "var(--vr-cream-mute, #8c8579)", marginTop: 4 }}>
              Connect via OAuth (recommended)
            </div>
          </div>
          <button type="button" onClick={onConnect} style={btnPrimary}>
            Connect
          </button>
        </div>
      </div>

      <p style={{ fontSize: 11, color: "var(--vr-cream-mute, #8c8579)", lineHeight: 1.55, marginBottom: 12 }}>
        Other brokers coming. For now, Alpaca paper is the only supported broker for this strategy.
      </p>

      <FieldEyebrow>Why we connect</FieldEyebrow>
      <ul
        style={{ paddingLeft: 20, color: "var(--vr-cream-dim, #c4bdac)", fontSize: 12, lineHeight: 1.7, margin: 0 }}
      >
        <li>To run trades on your paper account</li>
        <li>To read positions and balances</li>
        <li>To verify account compatibility</li>
      </ul>
    </GuidedHeroCard>
  )
}

function Pending({ enrollment }: { enrollment: GuidedEnrollment }) {
  return (
    <GuidedHeroCard>
      <FieldEyebrow>Snapshot · pending broker check</FieldEyebrow>
      <h1
        style={{
          fontSize: 22,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream, #f1ece0)",
          fontWeight: 400,
          marginTop: 6,
          marginBottom: 8,
        }}
      >
        Broker capability check
      </h1>
      <p style={{ fontSize: 11, color: "var(--vr-cream-mute, #8c8579)", lineHeight: 1.55, marginTop: 0, marginBottom: 16 }}>
        Preview shows the <code style={{ fontFamily: "var(--ff-mono)" }}>CHECKING</code> snapshot only. In production this resolves to one of <code>VERIFIED</code> · <code>BROKER_RETRYABLE</code> · <code>BROKER_ACTION_REQUIRED</code> · <code>BROKER_INELIGIBLE</code> within seconds. Use the picker above to view those outcomes.
      </p>

      <div
        style={{
          padding: 14,
          border: "1px solid var(--vr-line, #2a2438)",
          background: "rgba(241,236,224,0.02)",
          borderRadius: 3,
          marginBottom: 18,
          fontSize: 11,
          color: "var(--vr-cream-mute, #8c8579)",
          fontFamily: "var(--ff-mono)",
          lineHeight: 1.6,
        }}
      >
        <div>enrollment.status · {enrollment.status}</div>
        <div>broker_capabilities.status · {enrollment.broker_capabilities.status}</div>
        <div>broker_adapter · {enrollment.broker_capabilities.broker_adapter ?? "—"}</div>
        <div>environment · {enrollment.broker_capabilities.environment}</div>
      </div>

      <div
        style={{
          padding: "10px 12px",
          background: "rgba(241,236,224,0.02)",
          borderLeft: "2px solid var(--vr-line, #2a2438)",
          fontSize: 11,
          color: "var(--vr-cream-mute, #8c8579)",
          lineHeight: 1.5,
          marginBottom: 16,
        }}
      >
        Not enrolled yet. Paper trading begins only after this check passes.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <a href="/vires/guided/preview/active" style={btnPrimary}>
          Simulate VERIFIED → ACTIVE
        </a>
      </div>
      <div style={{ marginTop: 10, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vr-cream-mute, #8c8579)" }}>
        Preview only · use the picker above to view the failure variants
      </div>
    </GuidedHeroCard>
  )
}

function FailureFrame({
  enrollment,
  title,
  body,
  actions,
}: {
  enrollment: GuidedEnrollment
  title: string
  body: string
  actions: React.ReactNode
}) {
  const broker = enrollment.broker_capabilities
  return (
    <GuidedHeroCard>
      <FieldEyebrow>{enrollment.status.replace(/_/g, " ").toLowerCase()}</FieldEyebrow>
      <h1
        style={{
          fontSize: 22,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream, #f1ece0)",
          fontWeight: 400,
          marginTop: 6,
          marginBottom: 12,
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: 13, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.6, marginBottom: 16 }}>{body}</p>

      <div
        style={{
          padding: 12,
          border: "1px solid var(--vr-line, #2a2438)",
          borderRadius: 3,
          background: "rgba(241,236,224,0.02)",
          marginBottom: 16,
          fontSize: 11,
          color: "var(--vr-cream-mute, #8c8579)",
          lineHeight: 1.6,
          fontFamily: "var(--ff-mono)",
        }}
      >
        <div>reason_code: {broker.failure_reason_code ?? "—"}</div>
        <div>state: {broker.failure_state ?? "—"}</div>
        {broker.failure_reason ? <div style={{ marginTop: 6 }}>note: {broker.failure_reason}</div> : null}
      </div>

      {broker.remediation_steps.length > 0 ? (
        <div
          style={{
            padding: 14,
            border: "1px solid var(--vr-gold, #c8a968)33",
            background: "rgba(200,169,104,0.04)",
            borderRadius: 3,
            marginBottom: 16,
          }}
        >
          <FieldEyebrow>How to fix it</FieldEyebrow>
          <ol style={{ paddingLeft: 20, color: "var(--vr-cream-dim, #c4bdac)", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
            {broker.remediation_steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>{actions}</div>
    </GuidedHeroCard>
  )
}

function Retryable({ enrollment }: { enrollment: GuidedEnrollment }) {
  return (
    <FailureFrame
      enrollment={enrollment}
      title="Connection issue"
      body="We couldn't reach Alpaca right now. This is usually temporary."
      actions={
        <>
          <a href="/vires/guided/preview" style={btnSecondary}>
            Cancel
          </a>
          <a href="/vires/guided/preview/active" style={btnPrimary}>
            Try again
          </a>
        </>
      }
    />
  )
}

function ActionRequired({ enrollment }: { enrollment: GuidedEnrollment }) {
  const ext = enrollment.broker_capabilities.external_link
  return (
    <FailureFrame
      enrollment={enrollment}
      title="Your account needs you"
      body={enrollment.broker_capabilities.failure_human_label ?? "One thing to fix on your broker account."}
      actions={
        <>
          {ext ? (
            <a href={ext} target="_blank" rel="noopener noreferrer" style={btnSecondary}>
              Open Alpaca
            </a>
          ) : (
            <span />
          )}
          <a href="/vires/guided/preview/active" style={btnPrimary}>
            I&apos;ve fixed it
          </a>
        </>
      }
    />
  )
}

function Ineligible({ enrollment }: { enrollment: GuidedEnrollment }) {
  return (
    <FailureFrame
      enrollment={enrollment}
      title="Not the right fit"
      body={`${enrollment.broker_capabilities.failure_human_label ?? "Account and strategy aren't compatible."} This isn't a problem with the strategy or your account — they just aren't compatible.`}
      actions={
        <>
          <span />
          <a href="/vires/guided/preview/questionnaire" style={btnPrimary}>
            Find a different match
          </a>
        </>
      }
    />
  )
}

const btnPrimary = {
  padding: "10px 16px",
  background: "var(--vr-gold, #c8a968)",
  border: "1px solid var(--vr-gold, #c8a968)",
  color: "var(--vr-bg, #0c0a17)",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: 2,
  textDecoration: "none",
  display: "inline-block",
} as const

const btnSecondary = {
  padding: "10px 14px",
  background: "transparent",
  border: "1px solid var(--vr-line, #2a2438)",
  color: "var(--vr-cream-dim, #c4bdac)",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  cursor: "pointer",
  borderRadius: 2,
  textDecoration: "none",
  display: "inline-block",
} as const
