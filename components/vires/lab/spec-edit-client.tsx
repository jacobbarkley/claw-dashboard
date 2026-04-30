"use client"

// Live wrapper for StrategySpecForm. Loads the spec into the form, sends
// PATCH /api/research/specs/[id] for save-draft, and PATCH with
// state=AWAITING_APPROVAL for submit-for-approval. Cancel returns to the
// idea page. Re-spec aware: writes whichever spec_id was passed, regardless
// of which pointer (active vs pending) it sits on.

import { useRouter } from "next/navigation"
import { useState } from "react"

import type { ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"

import { specToFormValues, formValuesToPatch } from "./spec-form-mapping"
import { StrategySpecForm, type SpecFormValues } from "./strategy-spec-form"

interface IdeaHeader {
  idea_id: string
  title: string
  thesis: string
  sleeve: string
}

interface Props {
  idea: IdeaHeader
  spec: StrategySpecV1
  scope: ScopeTriple
  ideaHref: string
}

export function SpecEditClient({ idea, spec, scope, ideaHref }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const initialValues = specToFormValues(spec)

  const isReadOnly =
    spec.state !== "DRAFTING" && spec.state !== "AWAITING_APPROVAL"

  const submit = async (values: SpecFormValues, nextState: "DRAFTING" | "AWAITING_APPROVAL") => {
    if (isReadOnly) return
    setError(null)
    setNotice(null)
    setBusy(nextState === "DRAFTING" ? "draft" : "submit")
    try {
      if (nextState === "AWAITING_APPROVAL") {
        const validation = validateForSubmit(values)
        if (validation) {
          setError(validation)
          return
        }
      }
      const patch = formValuesToPatch(values, spec)
      const res = await fetch(
        `/api/research/specs/${encodeURIComponent(spec.spec_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, state: nextState, ...patch }),
        },
      )
      const payload = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(payload.error ?? `Save failed (${res.status})`)
      if (nextState === "AWAITING_APPROVAL") {
        router.push(ideaHref)
        router.refresh()
      } else {
        setNotice("Draft saved.")
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save spec")
    } finally {
      setBusy(null)
    }
  }

  if (isReadOnly) {
    return (
      <div className="vr-card" style={readOnlyPanel}>
        <div style={{ fontFamily: "var(--ff-serif)", fontStyle: "italic", fontSize: 16, color: "var(--vr-cream)" }}>
          This spec is no longer editable
        </div>
        <div style={{ fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}>
          State is <span className="t-mono">{spec.state}</span>. Edits are only
          allowed on DRAFTING or AWAITING_APPROVAL specs. Re-spec the idea to
          author a new draft.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StrategySpecForm
        ideaTitle={idea.title}
        ideaThesis={idea.thesis}
        ideaSleeve={idea.sleeve}
        initialValues={initialValues}
        onCancel={() => router.push(ideaHref)}
        onSaveDraft={values => submit(values, "DRAFTING")}
        onSubmitForApproval={values => submit(values, "AWAITING_APPROVAL")}
      />
      {busy && (
        <div style={notePanel("var(--vr-cream-mute)")}>
          {busy === "draft" ? "Saving draft…" : "Submitting for approval…"}
        </div>
      )}
      {notice && !busy && <div style={notePanel("var(--vr-up)")}>{notice}</div>}
      {error && <div style={errorPanel}>{error}</div>}
    </div>
  )
}

function validateForSubmit(values: SpecFormValues): string | null {
  const required: Array<[keyof SpecFormValues, string]> = [
    ["signal_logic", "Edge / signal logic"],
    ["entry_rules", "Entry rules"],
    ["exit_rules", "Exit rules"],
    ["risk_model", "Risk model"],
    ["universe", "Universe"],
  ]
  for (const [key, label] of required) {
    const value = values[key]
    if (typeof value === "string" && !value.trim()) {
      return `${label} is required to submit for approval.`
    }
  }
  if (values.required_data.length === 0 && !values.required_data_other.trim()) {
    return "Required data must include at least one selection."
  }
  if (values.benchmark === "custom" && !values.benchmark_custom.trim()) {
    return "Custom benchmark text is required."
  }
  return null
}

const readOnlyPanel: React.CSSProperties = {
  padding: "16px 16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
}

const errorPanel: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid var(--vr-down)",
  borderRadius: 3,
  background: "rgba(220,90,90,0.08)",
  color: "var(--vr-cream)",
  fontSize: 11.5,
}

function notePanel(color: string): React.CSSProperties {
  return {
    padding: "8px 10px",
    border: `1px solid ${color}`,
    borderRadius: 3,
    background: "var(--vr-ink)",
    color,
    fontSize: 11.5,
    fontFamily: "var(--ff-mono)",
  }
}
