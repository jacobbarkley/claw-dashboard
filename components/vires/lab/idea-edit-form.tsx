"use client"

// Edit form for an existing draft idea. Mirrors the create form's
// fields but only the ones backend allows mutating once an idea is
// authored. Status, promotion target, and scope are managed via
// other surfaces.

import { useState } from "react"
import { useRouter } from "next/navigation"

import type { IdeaArtifact, ResearchSleeve } from "@/lib/research-lab-contracts"

import type { StrategyOption } from "./idea-form"

interface Props {
  idea: IdeaArtifact
  strategyOptions: StrategyOption[]
}

interface ParamsSpec {
  data_sources?: string
  signal_filters?: string
  exit_rules?: string
}

function readSpec(params: Record<string, unknown>): ParamsSpec {
  const spec = params.spec
  if (!spec || typeof spec !== "object") return {}
  const s = spec as Record<string, unknown>
  return {
    data_sources:   typeof s.data_sources   === "string" ? s.data_sources   : "",
    signal_filters: typeof s.signal_filters === "string" ? s.signal_filters : "",
    exit_rules:     typeof s.exit_rules     === "string" ? s.exit_rules     : "",
  }
}

export function IdeaEditForm({ idea, strategyOptions }: Props) {
  const router = useRouter()

  const initialSpec = readSpec(idea.params)

  const [title, setTitle]               = useState(idea.title)
  const [thesis, setThesis]             = useState(idea.thesis)
  const [sleeve, setSleeve]             = useState<ResearchSleeve>(idea.sleeve)
  const [codePending, setCodePending]   = useState(idea.code_pending === true)
  const [strategyId, setStrategyId]     = useState(idea.strategy_id || "")
  const [tags, setTags]                 = useState((idea.tags ?? []).join(", "))
  const [dataSources, setDataSources]   = useState(initialSpec.data_sources ?? "")
  const [signalFilters, setSignalFilters] = useState(initialSpec.signal_filters ?? "")
  const [exitRules, setExitRules]       = useState(initialSpec.exit_rules ?? "")

  const [busy, setBusy]                 = useState(false)
  const [saved, setSaved]               = useState(false)
  const [error, setError]               = useState<string | null>(null)

  const strategiesForSleeve = strategyOptions.filter(s => s.sleeve === sleeve)
  const selectedStrategy = strategyOptions.find(s => s.strategy_id === strategyId) ?? null

  const onSleeveChange = (next: ResearchSleeve) => {
    setSleeve(next)
    if (codePending) return
    // If the current strategy isn't valid for the new sleeve, reset to
    // the first one available. Operator can still tweak after.
    const isValid = strategyOptions.some(s => s.sleeve === next && s.strategy_id === strategyId)
    if (!isValid) {
      const first = strategyOptions.find(s => s.sleeve === next)
      setStrategyId(first?.strategy_id ?? "")
    }
  }

  const canSubmit =
    !busy &&
    title.trim().length > 0 &&
    thesis.trim().length > 0 &&
    (codePending || strategyId.length > 0)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const parsedTags = tags
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0)
      const spec: Record<string, string> = {}
      if (dataSources.trim())   spec.data_sources   = dataSources.trim()
      if (signalFilters.trim()) spec.signal_filters = signalFilters.trim()
      if (exitRules.trim())     spec.exit_rules     = exitRules.trim()

      const payload: Record<string, unknown> = {
        title: title.trim(),
        thesis: thesis.trim(),
        sleeve,
        code_pending: codePending,
        // Backend clears strategy_id and strategy_family when code_pending
        // is true; we send them explicitly so a stale family from the
        // previous registered strategy doesn't survive the toggle.
        strategy_id: codePending ? "" : strategyId,
        strategy_family: codePending ? "" : (selectedStrategy?.strategy_family ?? ""),
        tags: parsedTags,
        params: Object.keys(spec).length > 0 ? { spec } : {},
      }

      const res = await fetch(`/api/research/ideas/${encodeURIComponent(idea.idea_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
        setBusy(false)
        return
      }
      setSaved(true)
      setBusy(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
      setBusy(false)
    }
  }

  if (saved) {
    return (
      <div
        className="vr-card"
        style={{
          padding: "20px 18px",
          borderLeft: "2px solid var(--vr-up)",
          background: "var(--vr-up-soft)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontSize: 18,
            color: "var(--vr-cream)",
          }}
        >
          Saved ✓
        </div>
        <div style={{ fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}>
          Changes committed to the repo. The detail page reads from the
          deployed bundle, so the new values appear after Vercel
          redeploys (~2 minutes).
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => router.push(`/vires/bench/lab/ideas/${encodeURIComponent(idea.idea_id)}`)}
            style={primaryButton}
          >
            Back to idea →
          </button>
          <button
            type="button"
            onClick={() => router.push("/vires/bench/lab/ideas")}
            style={secondaryButton}
          >
            All ideas
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="vr-card" style={{ padding: "16px 16px 18px" }}>
        <FormRow label="Title">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={inputStyle}
            maxLength={140}
          />
        </FormRow>

        <FormRow label="Thesis">
          <textarea
            value={thesis}
            onChange={e => setThesis(e.target.value)}
            rows={5}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            maxLength={2000}
          />
        </FormRow>

        <FormRow label="Sleeve">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["STOCKS", "CRYPTO", "OPTIONS"] as ResearchSleeve[]).map(s => (
              <ChipToggle
                key={s}
                label={s.charAt(0) + s.slice(1).toLowerCase()}
                active={sleeve === s}
                onClick={() => onSleeveChange(s)}
              />
            ))}
          </div>
        </FormRow>

        <FormRow label="Strategy mode">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <ChipToggle
              label="Use registered strategy"
              active={!codePending}
              onClick={() => setCodePending(false)}
            />
            <ChipToggle
              label="+ New strategy (code pending)"
              active={codePending}
              onClick={() => setCodePending(true)}
            />
          </div>
        </FormRow>

        {codePending ? (
          <FormRow label="Code-pending capture">
            <div
              style={{
                padding: "10px 12px",
                border: "1px solid var(--vr-gold-line)",
                borderLeft: "2px solid var(--vr-gold)",
                background: "rgba(200,169,104,0.06)",
                borderRadius: 3,
                fontSize: 11.5,
                lineHeight: 1.55,
                color: "var(--vr-cream-dim)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--ff-serif)",
                  fontStyle: "italic",
                  fontSize: 13,
                  color: "var(--vr-gold)",
                  marginBottom: 6,
                }}
              >
                Held until the strategy is written
              </div>
              Saving with code-pending clears <span style={{ fontFamily: "var(--ff-mono)" }}>strategy_id</span>.
              The idea stays in DRAFT until a real strategy module is implemented and registered.
            </div>
          </FormRow>
        ) : (
          <FormRow label="Strategy">
            <select
              value={strategyId}
              onChange={e => setStrategyId(e.target.value)}
              style={inputStyle}
              disabled={strategiesForSleeve.length === 0}
            >
              {strategiesForSleeve.length === 0 && <option value="">None available</option>}
              {strategiesForSleeve.map(s => (
                <option key={s.strategy_id} value={s.strategy_id}>
                  {s.display_name} · {s.strategy_id}
                </option>
              ))}
            </select>
            <div
              style={{
                marginTop: 5,
                fontSize: 10.5,
                color: "var(--vr-cream-faint)",
                fontStyle: "italic",
                fontFamily: "var(--ff-serif)",
                lineHeight: 1.5,
              }}
            >
              If none of these match the thesis, switch to{" "}
              <button
                type="button"
                onClick={() => setCodePending(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "var(--vr-gold)",
                  fontStyle: "italic",
                  fontFamily: "var(--ff-serif)",
                  fontSize: "inherit",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                code pending
              </button>{" "}
              instead of forcing a fit.
            </div>
          </FormRow>
        )}

        <FormRow label="Tags (comma-separated)">
          <input
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="momentum, regime, large-cap"
            style={inputStyle}
          />
        </FormRow>

        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--vr-line)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              fontSize: 14,
              color: "var(--vr-cream)",
              marginBottom: 4,
            }}
          >
            Strategy spec
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--vr-cream-mute)",
              fontStyle: "italic",
              fontFamily: "var(--ff-serif)",
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            Optional. Sketch what's in your head — Talon or Codex turns it into real strategy code later.
          </div>
          <FormRow label="Data sources">
            <textarea
              value={dataSources}
              onChange={e => setDataSources(e.target.value)}
              placeholder="Where do the inputs come from?"
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              maxLength={1500}
            />
          </FormRow>
          <FormRow label="Signal & filters">
            <textarea
              value={signalFilters}
              onChange={e => setSignalFilters(e.target.value)}
              placeholder="How do you pick the trade?"
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              maxLength={1500}
            />
          </FormRow>
          <FormRow label="Exit rules">
            <textarea
              value={exitRules}
              onChange={e => setExitRules(e.target.value)}
              placeholder="When do you sell?"
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              maxLength={1500}
            />
          </FormRow>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 12px",
            border: "1px solid var(--vr-down)",
            background: "var(--vr-down-soft)",
            borderRadius: 3,
            fontSize: 11.5,
            color: "var(--vr-down)",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => router.push(`/vires/bench/lab/ideas/${encodeURIComponent(idea.idea_id)}`)}
          style={secondaryButton}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="submit" style={primaryButton} disabled={!canSubmit}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function ChipToggle({
  active, onClick, label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="t-eyebrow"
      style={{
        padding: "6px 12px",
        fontSize: 10.5,
        letterSpacing: "0.1em",
        borderRadius: 3,
        border: `1px solid ${active ? "var(--vr-gold)" : "var(--vr-line)"}`,
        background: active ? "rgba(200,169,104,0.12)" : "transparent",
        color: active ? "var(--vr-gold)" : "var(--vr-cream-mute)",
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--vr-line)",
  borderRadius: 3,
  background: "var(--vr-ink)",
  color: "var(--vr-cream)",
  fontFamily: "inherit",
  fontSize: 12.5,
}

const primaryButton: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 11.5,
  fontFamily: "var(--ff-mono)",
  background: "var(--vr-gold-soft)",
  border: "1px solid var(--vr-gold-line)",
  color: "var(--vr-gold)",
  borderRadius: 3,
  cursor: "pointer",
}

const secondaryButton: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 11.5,
  fontFamily: "var(--ff-mono)",
  background: "transparent",
  border: "1px solid var(--vr-line)",
  color: "var(--vr-cream-mute)",
  borderRadius: 3,
  cursor: "pointer",
}
