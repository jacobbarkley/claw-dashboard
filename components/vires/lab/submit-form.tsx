"use client"

// Lab submit form — preset-aware bounded sweep picker.
//
// Page server-loads the idea + presets matching its strategy_id, then
// passes them down here. The form picks the preset (auto when one,
// picker when many) and renders chip toggles dynamically based on the
// preset's param_schema. Bounds come from preset.bounds.max_sweep_size,
// so every preset enforces its own ceiling without dashboard-side hard-
// coding.

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import type {
  JobPendingV1,
  PresetParamSchemaEntry,
  PresetV1,
} from "@/lib/research-lab-contracts"

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

type ParamSelection = Record<string, unknown[]>

// ─── Param formatting ───────────────────────────────────────────────────

function formatOptionLabel(entry: PresetParamSchemaEntry, value: unknown): string {
  if (entry.type === "enum_int") {
    return typeof value === "number" ? `${Math.round(value)}` : String(value)
  }
  if (entry.type === "enum_decimal") {
    if (typeof value !== "number") return String(value)
    // Pick precision based on whether the option needs decimals at all.
    const hasFraction = !Number.isInteger(value)
    return hasFraction ? value.toFixed(2) : value.toFixed(1)
  }
  return String(value)
}

function defaultSelection(schema: Record<string, PresetParamSchemaEntry>): ParamSelection {
  const out: ParamSelection = {}
  for (const [key, entry] of Object.entries(schema)) {
    if (entry.default !== undefined && entry.default !== null) {
      out[key] = [entry.default]
    } else if (entry.options && entry.options.length > 0) {
      out[key] = [entry.options[0]]
    } else {
      out[key] = []
    }
  }
  return out
}

function sweepSizeOf(selection: ParamSelection): number {
  let n = 1
  for (const values of Object.values(selection)) {
    if (values.length === 0) return 0
    n *= values.length
  }
  return n
}

// ─── UI helpers ─────────────────────────────────────────────────────────

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

export function LabSubmitForm({
  ideaId,
  presets,
}: {
  ideaId: string
  presets: PresetV1[]
}) {
  const router = useRouter()

  // Empty-presets case — render an honest empty state, no form.
  if (presets.length === 0) {
    return (
      <div style={{ padding: "20px 18px", maxWidth: 640, margin: "0 auto" }}>
        <div
          className="vr-card"
          style={{
            padding: "16px 18px",
            borderLeft: "2px solid var(--vr-cream-mute)",
            background: "transparent",
          }}
        >
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 5, letterSpacing: "0.14em" }}
          >
            No presets registered
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--vr-cream-dim)" }}>
            No preset is registered for this idea&apos;s strategy yet. Codex authors presets
            on the trading-bot side; once one lands for this strategy_id it&apos;ll be picked
            up automatically.
          </div>
        </div>
      </div>
    )
  }

  const [presetIdx, setPresetIdx] = useState(0)
  const preset = presets[presetIdx]
  const [selection, setSelection] = useState<ParamSelection>(() =>
    defaultSelection(preset.param_schema),
  )
  const [notes, setNotes] = useState("")
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "ok" | "error">("idle")
  const [response, setResponse] = useState<SubmitResponse | null>(null)

  const sweepSize = useMemo(() => sweepSizeOf(selection), [selection])
  const maxSweep = preset.bounds.max_sweep_size
  const overBounds = sweepSize > maxSweep
  const canSubmit =
    !overBounds && sweepSize > 0 && submitState !== "submitting"

  const onPickPreset = (next: number) => {
    setPresetIdx(next)
    setSelection(defaultSelection(presets[next].param_schema))
    setSubmitState("idle")
    setResponse(null)
  }

  const toggleParam = (key: string, value: unknown) => {
    setSelection(prev => {
      const cur = prev[key] ?? []
      const nextValues = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
      return { ...prev, [key]: nextValues }
    })
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
          preset_id: preset.preset_id,
          param_sweep: selection,
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
        {/* Preset summary + picker (when multiple) */}
        <div style={{ marginBottom: 16 }}>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-gold)", marginBottom: 5, letterSpacing: "0.14em" }}
          >
            Preset
          </div>
          {presets.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {presets.map((p, i) => (
                <ChipToggle
                  key={p.preset_id}
                  label={p.display_name}
                  active={i === presetIdx}
                  onClick={() => onPickPreset(i)}
                />
              ))}
            </div>
          )}
          <div className="t-h4" style={{ fontSize: 14, color: "var(--vr-cream)", marginBottom: 2 }}>
            {preset.display_name}
          </div>
          <div
            className="t-mono"
            style={{ fontSize: 10, color: "var(--vr-cream-mute)", letterSpacing: "0.05em" }}
          >
            {preset.strategy_id} · {preset.sleeve} · phase {preset.phase}
          </div>
          {preset.description ? (
            <div
              style={{
                marginTop: 6,
                fontSize: 11.5,
                lineHeight: 1.55,
                color: "var(--vr-cream-dim)",
              }}
            >
              {preset.description}
            </div>
          ) : null}
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

        {/* Dynamic param sweep — one block per param_schema entry */}
        {Object.entries(preset.param_schema).map(([key, entry]) => {
          const opts = entry.options ?? []
          const supported =
            entry.type === "enum_int" ||
            entry.type === "enum_decimal" ||
            entry.type === "enum_string"
          if (!supported) {
            return (
              <div key={key} style={{ marginBottom: 14 }}>
                <div
                  className="t-eyebrow"
                  style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
                >
                  {key}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--vr-cream-faint)",
                    fontStyle: "italic",
                    fontFamily: "var(--ff-serif)",
                  }}
                >
                  {entry.type} param shape isn&apos;t supported in this form yet — preset
                  default applies.
                </div>
              </div>
            )
          }
          const selected = selection[key] ?? []
          return (
            <div key={key} style={{ marginBottom: 14 }}>
              <div
                className="t-eyebrow"
                style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
              >
                {key}
                {entry.units ? ` (${entry.units})` : ""}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {opts.map((v, i) => (
                  <ChipToggle
                    key={`${key}-${i}`}
                    label={formatOptionLabel(entry, v)}
                    active={selected.includes(v)}
                    onClick={() => toggleParam(key, v)}
                  />
                ))}
              </div>
            </div>
          )
        })}

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
          {overBounds
            ? ` · exceeds preset bound (max ${maxSweep})`
            : ` · within bound ≤ ${maxSweep}`}
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
