"use client"

// Operator-authored strategy spec form. Renders inside the idea
// detail page when the idea is at the spec-drafted step. Same form
// is used whether the spec was Talon-drafted (AI_DRAFTED) or
// operator-drafted (OPERATOR_DRAFTED) — the only difference is a
// banner above the form.
//
// Phase D-prep mounts this against mock data on the spec preview
// route. Phase D-implementation will swap the in-memory state for
// real persistence to /api/research/specs/[id] (Codex's Phase E).

import { useState } from "react"

import type {
  SpecAuthoringMode,
  StrategySpecState,
} from "@/lib/research-lab-contracts"

export type { SpecAuthoringMode, StrategySpecState }

export interface SpecFormValues {
  authoring_mode: SpecAuthoringMode
  spec_state: StrategySpecState

  // Group A — Core
  signal_logic: string
  entry_rules: string
  exit_rules: string
  risk_model: string

  // Group B — Universe & data
  universe: string
  required_data: string[]
  required_data_other: string
  benchmark: string
  benchmark_custom: string

  // Group C — Acceptance criteria
  min_sharpe: string
  max_drawdown: string
  min_hit_rate: string
  acceptance_other: string

  // Group D — Advanced
  candidate_strategy_family: string
  sweep_params: string
  implementation_notes: string
}

const DATA_CHIPS = [
  "Price OHLCV",
  "Fundamentals",
  "Options chain",
  "Implied vol surface",
  "Sentiment",
  "Attention proxies",
  "Macro",
  "Crypto on-chain",
]

const BENCHMARKS: { value: string; label: string }[] = [
  { value: "SPY", label: "SPY" },
  { value: "BTC", label: "BTC" },
  { value: "sleeve-default", label: "Sleeve default" },
  { value: "custom", label: "Custom..." },
]

export const EMPTY_SPEC: SpecFormValues = {
  authoring_mode: "OPERATOR_DRAFTED",
  spec_state: "DRAFTING",
  signal_logic: "",
  entry_rules: "",
  exit_rules: "",
  risk_model: "",
  universe: "",
  required_data: [],
  required_data_other: "",
  benchmark: "SPY",
  benchmark_custom: "",
  min_sharpe: "1.0",
  max_drawdown: "20",
  min_hit_rate: "45",
  acceptance_other: "",
  candidate_strategy_family: "",
  sweep_params: "",
  implementation_notes: "",
}

interface Props {
  ideaTitle: string
  ideaThesis: string
  ideaSleeve: string
  initialValues?: Partial<SpecFormValues>
  onSaveDraft?: (values: SpecFormValues) => void
  onSubmitForApproval?: (values: SpecFormValues) => void
  onCancel?: () => void
}

export function StrategySpecForm({
  ideaTitle,
  ideaThesis,
  ideaSleeve,
  initialValues,
  onSaveDraft,
  onSubmitForApproval,
  onCancel,
}: Props) {
  const [values, setValues] = useState<SpecFormValues>({
    ...EMPTY_SPEC,
    ...initialValues,
  })
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const update = <K extends keyof SpecFormValues>(key: K, value: SpecFormValues[K]) => {
    setValues(prev => ({ ...prev, [key]: value }))
  }

  const toggleDataChip = (chip: string) => {
    setValues(prev => ({
      ...prev,
      required_data: prev.required_data.includes(chip)
        ? prev.required_data.filter(c => c !== chip)
        : [...prev.required_data, chip],
    }))
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Linked idea header */}
      <div
        className="vr-card"
        style={{
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
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
            {ideaTitle}
          </div>
          <span
            className="t-eyebrow"
            style={{
              fontSize: 9,
              color: "var(--vr-cream-mute)",
              letterSpacing: "0.14em",
            }}
          >
            {ideaSleeve}
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--vr-cream-dim)",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {ideaThesis}
        </div>
      </div>

      {/* Authoring mode + spec state */}
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span
          className="t-eyebrow"
          style={{
            fontSize: 9,
            color: "var(--vr-cream-mute)",
            letterSpacing: "0.14em",
          }}
        >
          Authoring mode
        </span>
        <ChipToggle
          label="Operator-drafted"
          active={values.authoring_mode === "OPERATOR_DRAFTED"}
          onClick={() => update("authoring_mode", "OPERATOR_DRAFTED")}
        />
        <ChipToggle
          label="Talon-drafted"
          active={values.authoring_mode === "AI_DRAFTED"}
          onClick={() => update("authoring_mode", "AI_DRAFTED")}
        />
        <span style={statePillStyle}>{values.spec_state}</span>
      </div>

      {values.authoring_mode === "AI_DRAFTED" && (
        <div
          style={{
            padding: "10px 12px",
            background: "rgba(200,169,104,0.06)",
            border: "1px solid var(--vr-gold-line)",
            borderLeft: "2px solid var(--vr-gold)",
            borderRadius: 3,
            fontSize: 11.5,
            color: "var(--vr-cream-dim)",
            lineHeight: 1.55,
          }}
        >
          <span
            style={{
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              color: "var(--vr-gold)",
            }}
          >
            Talon drafted this.
          </span>{" "}
          Review, refine where it&apos;s thin, and submit when it reads like a
          real strategy.
        </div>
      )}

      {/* Group A — Core */}
      <SectionCard title="Core" subtitle="The strategy in plain language.">
        <FormRow label="Edge / signal logic">
          <textarea
            value={values.signal_logic}
            onChange={e => update("signal_logic", e.target.value)}
            placeholder="What's the edge in one paragraph?"
            rows={4}
            style={textareaStyle}
            maxLength={2000}
          />
        </FormRow>
        <FormRow label="Entry rules">
          <textarea
            value={values.entry_rules}
            onChange={e => update("entry_rules", e.target.value)}
            placeholder="When does the strategy enter? Conditions, data, timing."
            rows={3}
            style={textareaStyle}
            maxLength={1500}
          />
        </FormRow>
        <FormRow label="Exit rules">
          <textarea
            value={values.exit_rules}
            onChange={e => update("exit_rules", e.target.value)}
            placeholder="When does it exit? Stop loss, target, time decay, regime flip."
            rows={3}
            style={textareaStyle}
            maxLength={1500}
          />
        </FormRow>
        <FormRow label="Risk model">
          <textarea
            value={values.risk_model}
            onChange={e => update("risk_model", e.target.value)}
            placeholder="How is each trade sized? Position sizing, max exposure, hedges."
            rows={3}
            style={textareaStyle}
            maxLength={1500}
          />
        </FormRow>
      </SectionCard>

      {/* Group B — Universe & data */}
      <SectionCard
        title="Universe & data"
        subtitle="What it trades and what it needs to know."
      >
        <FormRow label="Universe">
          <textarea
            value={values.universe}
            onChange={e => update("universe", e.target.value)}
            placeholder="Tickers, sectors, filters. Wide ('all SPY constituents > $1B') or narrow ('BTC, ETH only')."
            rows={3}
            style={textareaStyle}
            maxLength={1500}
          />
        </FormRow>
        <FormRow label="Required data">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {DATA_CHIPS.map(chip => (
              <ChipToggle
                key={chip}
                label={chip}
                active={values.required_data.includes(chip)}
                onClick={() => toggleDataChip(chip)}
              />
            ))}
          </div>
          <input
            type="text"
            value={values.required_data_other}
            onChange={e => update("required_data_other", e.target.value)}
            placeholder="Anything else? Comma-separated."
            style={{ ...inputStyle, marginTop: 8 }}
          />
        </FormRow>
        <FormRow label="Benchmark">
          <select
            value={values.benchmark}
            onChange={e => update("benchmark", e.target.value)}
            style={inputStyle}
          >
            {BENCHMARKS.map(b => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          {values.benchmark === "custom" && (
            <input
              type="text"
              value={values.benchmark_custom}
              onChange={e => update("benchmark_custom", e.target.value)}
              placeholder="Custom benchmark — ticker, index, or formula"
              style={{ ...inputStyle, marginTop: 8 }}
            />
          )}
        </FormRow>
      </SectionCard>

      {/* Group C — Acceptance criteria */}
      <SectionCard
        title="Acceptance criteria"
        subtitle="What does &lsquo;this passes&rsquo; look like?"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          <FormRow label="Min Sharpe">
            <input
              type="number"
              step="0.1"
              min="0"
              value={values.min_sharpe}
              onChange={e => update("min_sharpe", e.target.value)}
              style={inputStyle}
            />
          </FormRow>
          <FormRow label="Max DD %">
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={values.max_drawdown}
              onChange={e => update("max_drawdown", e.target.value)}
              style={inputStyle}
            />
          </FormRow>
          <FormRow label="Min hit rate %">
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={values.min_hit_rate}
              onChange={e => update("min_hit_rate", e.target.value)}
              style={inputStyle}
            />
          </FormRow>
        </div>
        <FormRow label="Other criteria">
          <textarea
            value={values.acceptance_other}
            onChange={e => update("acceptance_other", e.target.value)}
            placeholder="Anything else that has to be true before this ships."
            rows={2}
            style={textareaStyle}
            maxLength={1000}
          />
        </FormRow>
      </SectionCard>

      {/* Group D — Advanced */}
      <div className="vr-card" style={{ padding: "12px 14px" }}>
        <button
          type="button"
          onClick={() => setAdvancedOpen(o => !o)}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--vr-cream)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--ff-mono)",
              fontSize: 10,
              fontStyle: "normal",
              color: "var(--vr-cream-mute)",
              width: 10,
              display: "inline-block",
            }}
          >
            {advancedOpen ? "▾" : "▸"}
          </span>
          Advanced — implementation hints
        </button>
        {advancedOpen && (
          <div style={{ marginTop: 14 }}>
            <FormRow label="Candidate strategy family">
              <input
                type="text"
                value={values.candidate_strategy_family}
                onChange={e => update("candidate_strategy_family", e.target.value)}
                placeholder="Suggest a name. Codex may rename to fit the registry."
                style={inputStyle}
              />
            </FormRow>
            <FormRow label="Sweep parameters">
              <textarea
                value={values.sweep_params}
                onChange={e => update("sweep_params", e.target.value)}
                placeholder="Which knobs should Codex expose? List with rough ranges."
                rows={3}
                style={textareaStyle}
                maxLength={1500}
              />
            </FormRow>
            <FormRow label="Implementation notes">
              <textarea
                value={values.implementation_notes}
                onChange={e => update("implementation_notes", e.target.value)}
                placeholder="Edge cases, data quirks, references."
                rows={4}
                style={textareaStyle}
                maxLength={2000}
              />
            </FormRow>
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <button type="button" onClick={onCancel} style={secondaryButton}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSaveDraft?.(values)}
          style={secondaryButton}
        >
          Save draft
        </button>
        <button
          type="button"
          onClick={() => onSubmitForApproval?.(values)}
          style={primaryButton}
        >
          Submit for approval
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="vr-card" style={{ padding: "16px 16px 18px" }}>
      <div
        style={{
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          fontSize: 16,
          color: "var(--vr-cream)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--vr-cream-mute)",
          fontStyle: "italic",
          fontFamily: "var(--ff-serif)",
          marginTop: 2,
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        {subtitle}
      </div>
      {children}
    </div>
  )
}

function FormRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        className="t-eyebrow"
        style={{
          fontSize: 9,
          color: "var(--vr-cream-mute)",
          marginBottom: 6,
          letterSpacing: "0.14em",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function ChipToggle({
  active,
  onClick,
  label,
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
        padding: "6px 10px",
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

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  fontFamily: "inherit",
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

const statePillStyle: React.CSSProperties = {
  marginLeft: "auto",
  padding: "3px 8px",
  fontSize: 9,
  fontFamily: "var(--ff-mono)",
  letterSpacing: "0.08em",
  borderRadius: 2,
  border: "1px solid var(--vr-line)",
  color: "var(--vr-cream-mute)",
}
