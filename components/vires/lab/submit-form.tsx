"use client"

// Phase 1a submit form — bounded picker over the Phase 1a stocks preset.
//
// The preset options are mirrored locally from
// trading-bot/data/research_lab/presets/stocks.momentum.stop_target.v1.yaml.
// When Codex's pull-research-lab.py mirror script lands, this component
// switches to reading `data/research_lab/presets/stocks.momentum.stop_target.v1.yaml`
// from the dashboard repo. Until then, the preset is literal here — keep
// the options in lockstep with the YAML if the preset updates.

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import type { JobPendingV1 } from "@/lib/research-lab-contracts"

// ─── Phase 1a preset (mirrored from YAML) ───────────────────────────────

const PRESET_ID = "stocks.momentum.stop_target.v1"
const PRESET_DISPLAY = "Stocks · Momentum · Stop/Target sweep"
const PRESET_STRATEGY = "regime_aware_momentum"

const STOP_LOSS_OPTIONS = [4.75, 5.0, 5.25] as const
const TARGET_OPTIONS = [14.0, 15.0, 16.0] as const
const STOP_LOSS_DEFAULT = [5.0]
const TARGET_DEFAULT = [15.0]
const MAX_SWEEP_SIZE = 9 // from preset.bounds.max_sweep_size

// ─── Types ──────────────────────────────────────────────────────────────

type SubmitResponse = {
  ok: boolean
  mode?: "github" | "local"
  file?: string
  commit_sha?: string | null
  request?: Record<string, unknown>
  job_pending?: JobPendingV1
  error?: string
}

// ─── Small UI helpers ───────────────────────────────────────────────────

function ChipToggle({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="t-eyebrow"
      style={{
        padding: "6px 12px",
        fontSize: 11,
        letterSpacing: "0.1em",
        borderRadius: 3,
        border: `1px solid ${active ? "var(--vr-gold)" : "var(--vr-line)"}`,
        background: active ? "rgba(200,169,104,0.12)" : "transparent",
        color: active ? "var(--vr-gold)" : "var(--vr-cream-mute)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  )
}

// ─── Form ───────────────────────────────────────────────────────────────

export function LabSubmitForm({ ideaId }: { ideaId: string }) {
  const router = useRouter()
  const [stopLoss, setStopLoss] = useState<number[]>(STOP_LOSS_DEFAULT)
  const [target, setTarget] = useState<number[]>(TARGET_DEFAULT)
  const [notes, setNotes] = useState("")
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "ok" | "error">("idle")
  const [response, setResponse] = useState<SubmitResponse | null>(null)

  const sweepSize = stopLoss.length * target.length
  const overBounds = sweepSize > MAX_SWEEP_SIZE
  const canSubmit =
    !overBounds && stopLoss.length > 0 && target.length > 0 && submitState !== "submitting"

  const toggle = (val: number, list: number[], set: (v: number[]) => void) => {
    set(list.includes(val) ? list.filter(x => x !== val) : [...list, val].sort((a, b) => a - b))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitState("submitting")
    setResponse(null)
    try {
      const res = await fetch("/api/research/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_id: ideaId,
          preset_id: PRESET_ID,
          param_sweep: {
            stop_loss_pct: stopLoss,
            target_pct: target,
          },
          actor: "jacob",
          submitted_by: "USER_ONDEMAND",
          execution_intent: "FULL_CAMPAIGN",
          priority: "NORMAL",
          notes: notes.trim() || null,
        }),
      })
      const payload = (await res.json()) as SubmitResponse
      if (!res.ok || !payload.ok) {
        setSubmitState("error")
        setResponse(payload)
        return
      }
      setSubmitState("ok")
      setResponse(payload)
    } catch (err) {
      setSubmitState("error")
      setResponse({ ok: false, error: err instanceof Error ? err.message : "Network error" })
    }
  }

  if (submitState === "ok" && response?.job_pending) {
    const p = response.job_pending
    return (
      <div style={{ padding: "20px 18px", maxWidth: 640, margin: "0 auto" }}>
        <div
          className="vr-card"
          style={{
            padding: "18px 18px 20px",
            borderLeft: "2px solid var(--vr-up)",
            background: "rgba(241,236,224,0.02)",
          }}
        >
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-up)", marginBottom: 8, letterSpacing: "0.14em" }}
          >
            Submit accepted · job pending enqueue
          </div>
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.6,
              color: "var(--vr-cream)",
              marginBottom: 10,
            }}
          >
            {p.summary}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              rowGap: 4,
              columnGap: 10,
              fontSize: 11,
              fontFamily: "var(--vr-font-mono), monospace",
              color: "var(--vr-cream-dim)",
            }}
          >
            <span>request_id</span>
            <span style={{ color: "var(--vr-cream)" }}>{p.request_id}</span>
            <span>job_id</span>
            <span style={{ color: "var(--vr-cream)" }}>{p.job_id}</span>
            <span>state</span>
            <span style={{ color: "var(--vr-gold)" }}>{p.state}</span>
            {response.commit_sha ? (
              <>
                <span>commit_sha</span>
                <span style={{ color: "var(--vr-cream)" }}>{response.commit_sha.slice(0, 8)}</span>
              </>
            ) : null}
            {response.file ? (
              <>
                <span>file</span>
                <span style={{ color: "var(--vr-cream-mute)", overflowWrap: "anywhere" }}>
                  {response.file}
                </span>
              </>
            ) : null}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <Link
              href={`/vires/bench/lab/jobs/${encodeURIComponent(p.job_id)}`}
              className="t-eyebrow"
              style={{
                padding: "7px 14px",
                fontSize: 10,
                letterSpacing: "0.12em",
                textDecoration: "none",
                borderRadius: 3,
                border: "1px solid var(--vr-gold)",
                color: "var(--vr-gold)",
              }}
            >
              Open job view
            </Link>
            <button
              type="button"
              onClick={() => {
                setSubmitState("idle")
                setResponse(null)
                router.refresh()
              }}
              className="t-eyebrow"
              style={{
                padding: "7px 14px",
                fontSize: 10,
                letterSpacing: "0.12em",
                borderRadius: 3,
                border: "1px solid var(--vr-line)",
                background: "transparent",
                color: "var(--vr-cream-mute)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Submit another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: "20px 18px", maxWidth: 640, margin: "0 auto" }}>
      <div className="vr-card" style={{ padding: "18px 18px 20px" }}>
        {/* Preset summary */}
        <div style={{ marginBottom: 16 }}>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-gold)", marginBottom: 5, letterSpacing: "0.14em" }}
          >
            Preset
          </div>
          <div className="t-h4" style={{ fontSize: 14, color: "var(--vr-cream)", marginBottom: 2 }}>
            {PRESET_DISPLAY}
          </div>
          <div
            className="t-mono"
            style={{ fontSize: 10, color: "var(--vr-cream-mute)", letterSpacing: "0.05em" }}
          >
            {PRESET_STRATEGY}
          </div>
        </div>

        {/* Idea id (read-only) */}
        <div style={{ marginBottom: 16 }}>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 5, letterSpacing: "0.14em" }}
          >
            Idea
          </div>
          <div
            className="t-mono"
            style={{ fontSize: 12, color: "var(--vr-cream)", overflowWrap: "anywhere" }}
          >
            {ideaId}
          </div>
        </div>

        {/* Stop loss sweep */}
        <div style={{ marginBottom: 14 }}>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
          >
            stop_loss_pct
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {STOP_LOSS_OPTIONS.map(v => (
              <ChipToggle
                key={v}
                label={`${v.toFixed(2)}%`}
                active={stopLoss.includes(v)}
                onClick={() => toggle(v, stopLoss, setStopLoss)}
              />
            ))}
          </div>
        </div>

        {/* Target sweep */}
        <div style={{ marginBottom: 14 }}>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
          >
            target_pct
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TARGET_OPTIONS.map(v => (
              <ChipToggle
                key={v}
                label={`${v.toFixed(1)}%`}
                active={target.includes(v)}
                onClick={() => toggle(v, target, setTarget)}
              />
            ))}
          </div>
        </div>

        {/* Sweep size summary */}
        <div
          style={{
            padding: "8px 10px",
            marginBottom: 14,
            border: `1px solid ${overBounds ? "var(--vr-down)" : "var(--vr-line)"}`,
            borderRadius: 3,
            fontSize: 11,
            color: overBounds ? "var(--vr-down)" : "var(--vr-cream-mute)",
            fontFamily: "var(--vr-font-mono), monospace",
          }}
        >
          sweep_size = {sweepSize} variant{sweepSize === 1 ? "" : "s"}
          {overBounds ? ` · exceeds preset bound (max ${MAX_SWEEP_SIZE})` : ` · within bound ≤ ${MAX_SWEEP_SIZE}`}
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 14 }}>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
          >
            Notes (optional)
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Why this sweep? Any thesis note to carry onto the campaign…"
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid var(--vr-line)",
              borderRadius: 3,
              background: "var(--vr-ink)",
              color: "var(--vr-cream)",
              fontFamily: "inherit",
              fontSize: 12,
              resize: "vertical",
            }}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="t-eyebrow"
          style={{
            width: "100%",
            padding: "10px 14px",
            fontSize: 11,
            letterSpacing: "0.14em",
            borderRadius: 3,
            border: `1px solid ${canSubmit ? "var(--vr-gold)" : "var(--vr-line)"}`,
            background: canSubmit ? "rgba(200,169,104,0.12)" : "transparent",
            color: canSubmit ? "var(--vr-gold)" : "var(--vr-cream-faint)",
            cursor: canSubmit ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {submitState === "submitting" ? "Submitting…" : "Submit campaign"}
        </button>

        {submitState === "error" && response?.error ? (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              border: "1px solid var(--vr-down)",
              borderRadius: 3,
              fontSize: 11,
              color: "var(--vr-down)",
              lineHeight: 1.55,
            }}
          >
            {response.error}
          </div>
        ) : null}
      </div>

    </form>
  )
}
