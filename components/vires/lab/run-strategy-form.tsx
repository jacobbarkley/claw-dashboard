"use client"

// Direct campaign launcher for already-registered strategies.
//
// Operator picks a registered strategy_id, then a preset (auto when one),
// then dials a bounded param sweep — same pattern as the idea-based
// LabSubmitForm at /new-campaign/[idea]. On submit:
//   1. Auto-create a thin "system idea" via POST /api/research/ideas
//      (status=READY, source=MANUAL, strategy_ref.kind=REGISTERED)
//   2. Submit the campaign request via POST /api/research/requests with
//      the new idea_id
//   3. Navigate to the materialized job page
//
// This preserves the "run an existing strategy as-is" path outside the
// idea-authoring flow, so when the strategy-reference UI rollout
// (queue item #4) removes that capability from the new-idea form,
// operators have a clear home for it.

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import type {
  JobPendingV1,
  PresetParamSchemaEntry,
  PresetV1,
  ResearchSleeve,
} from "@/lib/research-lab-contracts"

interface StrategyOption {
  strategy_id: string
  strategy_family: string
  sleeve: ResearchSleeve
  preset_count: number
}

type ParamSelection = Record<string, unknown[]>

type SubmitResponse = {
  ok: boolean
  mode?: "github" | "local"
  file?: string
  commit_sha?: string | null
  job_pending?: JobPendingV1
  error?: string
}

// ─── Param helpers — mirror submit-form.tsx ─────────────────────────────

function formatOptionLabel(entry: PresetParamSchemaEntry, value: unknown): string {
  if (entry.type === "enum_int") {
    return typeof value === "number" ? `${Math.round(value)}` : String(value)
  }
  if (entry.type === "enum_decimal") {
    if (typeof value !== "number") return String(value)
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

// ─── UI primitives ──────────────────────────────────────────────────────

function ChipToggle({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="t-eyebrow"
      style={{
        padding: "6px 12px",
        fontSize: 11,
        letterSpacing: "0.1em",
        borderRadius: 3,
        border: `1px solid ${active ? "var(--vr-gold)" : "var(--vr-line)"}`,
        background: active ? "rgba(200,169,104,0.12)" : "transparent",
        color: active ? "var(--vr-gold)" : disabled ? "var(--vr-cream-faint)" : "var(--vr-cream-mute)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  )
}

// ─── Form ───────────────────────────────────────────────────────────────

export function RunStrategyForm({
  strategies,
  presets,
}: {
  strategies: StrategyOption[]
  presets: PresetV1[]
}) {
  const router = useRouter()

  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null)
  const [presetIdx, setPresetIdx] = useState(0)
  const [selection, setSelection] = useState<ParamSelection>({})
  const [notes, setNotes] = useState("")
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "ok" | "error">("idle")
  const [response, setResponse] = useState<SubmitResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const presetsForStrategy = useMemo(
    () => (selectedStrategyId ? presets.filter(p => p.strategy_id === selectedStrategyId) : []),
    [selectedStrategyId, presets],
  )
  const preset = presetsForStrategy[presetIdx] ?? null

  const sweepSize = useMemo(() => sweepSizeOf(selection), [selection])
  const maxSweep = preset?.bounds.max_sweep_size ?? 0
  const overBounds = preset != null && sweepSize > maxSweep
  const canSubmit =
    preset != null &&
    !overBounds &&
    sweepSize > 0 &&
    submitState !== "submitting"

  const onPickStrategy = (strategyId: string) => {
    setSelectedStrategyId(strategyId)
    setPresetIdx(0)
    const firstPreset = presets.find(p => p.strategy_id === strategyId)
    setSelection(firstPreset ? defaultSelection(firstPreset.param_schema) : {})
    setSubmitState("idle")
    setErrorMessage(null)
    setResponse(null)
  }

  const onPickPreset = (next: number) => {
    setPresetIdx(next)
    const nextPreset = presetsForStrategy[next]
    setSelection(nextPreset ? defaultSelection(nextPreset.param_schema) : {})
    setSubmitState("idle")
    setErrorMessage(null)
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
    if (!canSubmit || !preset || !selectedStrategyId) return
    setSubmitState("submitting")
    setErrorMessage(null)
    setResponse(null)

    const ideaTitle = preset.display_name
    const ideaThesis = `Direct run of registered strategy ${selectedStrategyId}. Launched outside the idea/spec authoring path; no thesis attached.`

    try {
      // Step 1: auto-create a thin system idea so /requests has an idea_id
      // to reference. The trading-bot side expects every campaign request
      // to point at an idea — we satisfy that contract without touching it.
      const ideaRes = await fetch("/api/research/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ideaTitle,
          thesis: ideaThesis,
          sleeve: preset.sleeve,
          strategy_id: selectedStrategyId,
          strategy_family: preset.strategy_family,
          source: "MANUAL",
          status: "READY",
          tags: ["direct-run"],
        }),
      })
      const ideaPayload = (await ideaRes.json()) as { ok?: boolean; idea?: { idea_id: string }; error?: string }
      if (!ideaRes.ok || !ideaPayload.ok || !ideaPayload.idea) {
        setSubmitState("error")
        setErrorMessage(ideaPayload.error ?? `Failed to create idea (HTTP ${ideaRes.status})`)
        return
      }
      const ideaId = ideaPayload.idea.idea_id

      // Step 2: submit the campaign request against the new idea.
      const reqRes = await fetch("/api/research/requests", {
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
      const reqPayload = (await reqRes.json()) as SubmitResponse
      if (!reqRes.ok || !reqPayload.ok) {
        setSubmitState("error")
        setResponse(reqPayload)
        const detail = reqPayload.error ?? `HTTP ${reqRes.status}`
        setErrorMessage(
          `Idea created (${ideaId}), but campaign request failed (${detail}). The orphan idea can be deleted from the ideas list.`,
        )
        return
      }
      setSubmitState("ok")
      setResponse(reqPayload)
    } catch (err) {
      setSubmitState("error")
      setErrorMessage(err instanceof Error ? err.message : "Network error")
    }
  }

  // Success state — same shape as LabSubmitForm.
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
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--vr-cream)", marginBottom: 10 }}>
            {p.summary}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              rowGap: 4,
              columnGap: 10,
              fontSize: 11,
              fontFamily: "var(--ff-mono)",
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
                setSelectedStrategyId(null)
                setSelection({})
                setNotes("")
                setSubmitState("idle")
                setResponse(null)
                setErrorMessage(null)
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
              Run another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: "20px 18px", maxWidth: 640, margin: "0 auto" }}>
      {/* Step 1 — pick a registered strategy */}
      <div className="vr-card" style={{ padding: "18px 18px 20px", marginBottom: 14 }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 9, color: "var(--vr-gold)", marginBottom: 8, letterSpacing: "0.14em" }}
        >
          Strategy
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {strategies.map(s => {
            const active = selectedStrategyId === s.strategy_id
            return (
              <button
                key={s.strategy_id}
                type="button"
                onClick={() => onPickStrategy(s.strategy_id)}
                style={{
                  display: "block",
                  textAlign: "left",
                  padding: "12px 14px",
                  background: active ? "rgba(200,169,104,0.08)" : "transparent",
                  border: `1px solid ${active ? "var(--vr-gold)" : "var(--vr-line)"}`,
                  borderRadius: 3,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "var(--vr-cream)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 4,
                  }}
                >
                  <span
                    className="t-h4"
                    style={{
                      fontSize: 13.5,
                      color: active ? "var(--vr-gold)" : "var(--vr-cream)",
                      fontFamily: "var(--ff-serif)",
                      fontWeight: 500,
                    }}
                  >
                    {s.strategy_family}
                  </span>
                  <span
                    className="t-eyebrow"
                    style={{
                      fontSize: 9,
                      color: "var(--vr-cream-mute)",
                      letterSpacing: "0.14em",
                      flexShrink: 0,
                    }}
                  >
                    {s.sleeve}
                  </span>
                </div>
                <div
                  className="t-mono"
                  style={{
                    fontSize: 10.5,
                    color: "var(--vr-cream-faint)",
                    letterSpacing: "0.05em",
                  }}
                >
                  {s.strategy_id}
                  {" · "}
                  {s.preset_count} preset{s.preset_count === 1 ? "" : "s"}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Step 2 — preset + param sweep, only after a strategy is picked */}
      {preset && (
        <div className="vr-card" style={{ padding: "18px 18px 20px" }}>
          <div style={{ marginBottom: 16 }}>
            <div
              className="t-eyebrow"
              style={{ fontSize: 9, color: "var(--vr-gold)", marginBottom: 5, letterSpacing: "0.14em" }}
            >
              Preset
            </div>
            {presetsForStrategy.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {presetsForStrategy.map((p, i) => (
                  <ChipToggle
                    key={p.preset_id}
                    label={p.display_name.replace(/^[A-Za-z]+\s+·\s+/, "")}
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
                  <div style={{ fontSize: 11, color: "var(--vr-cream-faint)" }}>
                    {entry.type} param shape isn&apos;t supported in this form yet — preset default applies.
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

          <div
            style={{
              padding: "8px 10px",
              marginBottom: 14,
              border: `1px solid ${overBounds ? "var(--vr-down)" : "var(--vr-line)"}`,
              borderRadius: 3,
              fontSize: 11,
              color: overBounds ? "var(--vr-down)" : "var(--vr-cream-mute)",
              fontFamily: "var(--ff-mono)",
            }}
          >
            sweep_size = {sweepSize} variant{sweepSize === 1 ? "" : "s"}
            {overBounds
              ? ` · exceeds preset bound (max ${maxSweep})`
              : ` · within bound ≤ ${maxSweep}`}
          </div>

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
              placeholder="Why this run? Any context to attach to the campaign…"
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
            {submitState === "submitting" ? "Submitting…" : "Submit run"}
          </button>

          {submitState === "error" && errorMessage ? (
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
              {errorMessage}
            </div>
          ) : null}
        </div>
      )}
    </form>
  )
}
