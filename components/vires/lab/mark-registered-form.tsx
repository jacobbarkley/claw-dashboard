"use client"

// Admin affordance for the redesigned Idea Detail Details disclosure. Lets
// the operator manually mark an APPROVED spec's implementation as finished
// when scaffolding happened out-of-band (Codex implemented directly without
// going through the queue worker, or operator hand-wired the strategy).
//
// Calls POST /api/research/specs/{spec_id}/implementation with
// { action: "finish", outcome: "COMPLETED", registered_strategy_id,
//   preset_id, implementation_commit? }. On success, idea.code_pending
// clears and Bench Job's SUBMIT A CAMPAIGN re-enables.
//
// Renders nothing if no active spec or spec is in a state where this
// affordance doesn't apply (DRAFTING, REGISTERED). Always last-resort
// admin tool — primary path is the queue lifecycle in BuildStepBody.

import { useRouter } from "next/navigation"
import { useState } from "react"

import type { StrategySpecV1 } from "@/lib/research-lab-contracts"

interface Props {
  activeSpec: StrategySpecV1 | null
}

export function MarkRegisteredForm({ activeSpec }: Props) {
  const router = useRouter()
  const [strategyId, setStrategyId] = useState("")
  const [presetId, setPresetId] = useState("")
  const [commit, setCommit] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!activeSpec) return null
  if (activeSpec.state === "DRAFTING" || activeSpec.state === "REGISTERED") return null

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!strategyId.trim() || !presetId.trim()) {
      setError("registered_strategy_id and preset_id are both required.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/research/specs/${encodeURIComponent(activeSpec.spec_id)}/implementation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "finish",
            outcome: "COMPLETED",
            registered_strategy_id: strategyId.trim(),
            preset_id: presetId.trim(),
            ...(commit.trim() ? { implementation_commit: commit.trim() } : {}),
          }),
        },
      )
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(payload.error ?? `Mark registered failed (${res.status})`)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mark registered failed")
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div
        className="t-read"
        style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}
      >
        Manual finish for when implementation happened out-of-band.
        Bypasses the queue lifecycle. Sets <span className="t-mono">strategy_id</span>{" "}
        on the idea and clears <span className="t-mono">code_pending</span>.
      </div>
      <Input
        label="registered_strategy_id"
        value={strategyId}
        onChange={setStrategyId}
        placeholder="e.g. regime_aware_momentum"
      />
      <Input
        label="preset_id"
        value={presetId}
        onChange={setPresetId}
        placeholder="e.g. stop_5_target_15"
      />
      <Input
        label="implementation_commit (optional)"
        value={commit}
        onChange={setCommit}
        placeholder="git sha"
      />
      <button
        type="submit"
        disabled={submitting}
        className="t-eyebrow"
        style={{
          alignSelf: "flex-start",
          cursor: submitting ? "default" : "pointer",
          fontSize: 10,
          letterSpacing: "0.14em",
          fontFamily: "var(--ff-mono)",
          textTransform: "uppercase",
          padding: "7px 14px",
          borderRadius: 3,
          border: "1px solid var(--vr-line-hi)",
          background: "transparent",
          color: "var(--vr-cream-mute)",
          opacity: submitting ? 0.5 : 1,
        }}
      >
        {submitting ? "MARKING…" : "MARK REGISTERED"}
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
    </form>
  )
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        className="t-eyebrow"
        style={{ fontSize: 8.5, letterSpacing: "0.14em", color: "var(--vr-cream-mute)" }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="t-mono"
        style={{
          fontSize: 11,
          color: "var(--vr-cream)",
          background: "var(--vr-ink)",
          border: "1px solid var(--vr-line)",
          borderRadius: 2,
          padding: "6px 8px",
          outline: "none",
        }}
      />
    </label>
  )
}
