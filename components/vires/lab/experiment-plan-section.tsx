"use client"

// §Experiment Plan section of the spec edit form.
//
// Renders editable controls for benchmark.comparison_mode, windows, eras
// mode + selection, evidence thresholds, decisive verdict rules, and known
// limitations. runnable_eras + data_requirements are read-only display
// — operator influences them by editing the strategy side (spec.benchmark,
// spec.required_data) and Talon/catalog populating the rest.
//
// Validity is computed elsewhere; this component renders inline error
// chips next to fields whose field_id appears in validity_reasons. The
// computed plan flows back to the parent on every change.

import { useMemo } from "react"

import type {
  BenchmarkComparisonMode,
  ExperimentEraMode,
  ExperimentPlanDataRequirement,
  ExperimentPlanV1,
  ExperimentPlanValidityIssue,
  RunnableEraRef,
} from "@/lib/research-lab-contracts"

interface Props {
  plan: ExperimentPlanV1 | null
  onChange: (plan: ExperimentPlanV1) => void
  /** Pulled from validateExperimentPlan(plan); rendered as inline issues. */
  issues: ExperimentPlanValidityIssue[]
  disabled?: boolean
}

const COMPARISON_MODES: { value: BenchmarkComparisonMode; label: string; hint: string }[] = [
  { value: "absolute", label: "Absolute", hint: "compare full-window total returns" },
  {
    value: "deployment_matched",
    label: "Deployment-matched",
    hint: "benchmark only across days the strategy was deployed",
  },
  { value: "both", label: "Both", hint: "show both views; default" },
]

const ERA_MODES: { value: ExperimentEraMode; label: string; hint: string }[] = [
  { value: "single", label: "Single window", hint: "evaluate against the requested window only" },
  {
    value: "multi",
    label: "Multi-era",
    hint: "evaluate across multiple regimes; pick eras below",
  },
]

export function ExperimentPlanSection({ plan, onChange, issues, disabled }: Props) {
  const issuesByField = useMemo(() => {
    const map = new Map<string, ExperimentPlanValidityIssue[]>()
    for (const issue of issues) {
      const list = map.get(issue.field_id) ?? []
      list.push(issue)
      map.set(issue.field_id, list)
    }
    return map
  }, [issues])

  if (!plan) {
    return (
      <div style={emptyState}>
        <div style={{ fontFamily: "var(--ff-serif)", fontStyle: "italic", fontSize: 16 }}>
          No experiment plan yet
        </div>
        <div style={hintLine}>
          This spec was authored before experiment plans existed, or the operator-draft
          path hasn&apos;t been wired to seed one. Ask Talon to revise this spec — Talon
          will draft a plan alongside the changes. Until a valid plan exists, submit-for-
          approval is blocked.
        </div>
      </div>
    )
  }

  const update = (next: Partial<ExperimentPlanV1>) => {
    onChange({ ...plan, ...next })
  }

  const updateBenchmark = (mode: BenchmarkComparisonMode) => {
    update({ benchmark: { ...plan.benchmark, comparison_mode: mode } })
  }

  const updateWindow = (key: "requested_start" | "requested_end" | "fresh_data_required_from", value: string) => {
    if (key === "fresh_data_required_from") {
      update({ windows: { ...plan.windows, fresh_data_required_from: value || null } })
    } else {
      update({ windows: { ...plan.windows, [key]: value } })
    }
  }

  const updateEraMode = (mode: ExperimentEraMode) => {
    update({ eras: { ...plan.eras, mode } })
  }

  const toggleEra = (eraId: string) => {
    const selected = new Set(plan.eras.required_era_ids)
    if (selected.has(eraId)) selected.delete(eraId)
    else selected.add(eraId)
    update({ eras: { ...plan.eras, required_era_ids: Array.from(selected) } })
  }

  const updateThreshold = (
    key: "minimum_trade_count" | "minimum_evaluated_trading_days",
    raw: string,
  ) => {
    const parsed = Number(raw)
    update({
      evidence_thresholds: {
        ...plan.evidence_thresholds,
        [key]: Number.isFinite(parsed) ? parsed : 0,
      },
    })
  }

  const updateVerdict = (key: "pass" | "inconclusive" | "fail", value: string) => {
    update({
      decisive_verdict_rules: { ...plan.decisive_verdict_rules, [key]: value },
    })
  }

  const updateKnownLimitations = (value: string) => {
    const lines = value
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
    update({ known_limitations: lines })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Field
        label="Benchmark · comparison mode"
        hint="how the strategy is compared to the benchmark"
        issues={issuesByField.get("benchmark.comparison_mode")}
      >
        <SelectGroup
          options={COMPARISON_MODES.map(m => ({ value: m.value, label: m.label, hint: m.hint }))}
          value={plan.benchmark.comparison_mode}
          onChange={v => updateBenchmark(v as BenchmarkComparisonMode)}
          disabled={disabled}
        />
        <ReadOnlyHint label="symbol">
          {plan.benchmark.symbol || "(set via Strategy → Benchmark above)"}
        </ReadOnlyHint>
      </Field>

      <Field
        label="Windows"
        hint="config window the campaign evaluates across; fresh-data cut-off if relevant"
      >
        <div style={fieldRow}>
          <DateInput
            label="requested start"
            value={plan.windows.requested_start}
            onChange={v => updateWindow("requested_start", v)}
            disabled={disabled}
            issues={issuesByField.get("windows.requested_start")}
          />
          <DateInput
            label="requested end"
            value={plan.windows.requested_end}
            onChange={v => updateWindow("requested_end", v)}
            disabled={disabled}
            issues={issuesByField.get("windows.requested_end")}
          />
          <DateInput
            label="fresh data from (optional)"
            value={plan.windows.fresh_data_required_from ?? ""}
            onChange={v => updateWindow("fresh_data_required_from", v)}
            disabled={disabled}
            issues={issuesByField.get("windows.fresh_data_required_from")}
          />
        </div>
      </Field>

      <Field label="Eras" hint="single window or multi-era evaluation">
        <SelectGroup
          options={ERA_MODES.map(m => ({ value: m.value, label: m.label, hint: m.hint }))}
          value={plan.eras.mode}
          onChange={v => updateEraMode(v as ExperimentEraMode)}
          disabled={disabled}
        />
        {plan.eras.mode === "multi" && (
          <EraPicker
            runnableEras={plan.runnable_eras}
            selectedIds={plan.eras.required_era_ids}
            onToggle={toggleEra}
            disabled={disabled}
            issues={issuesByField.get("eras.required_era_ids")}
          />
        )}
      </Field>

      <Field
        label="Evidence thresholds"
        hint="minimum signal needed before a verdict is considered decisive"
      >
        <div style={fieldRow}>
          <NumberInput
            label="min trade count"
            value={plan.evidence_thresholds.minimum_trade_count}
            onChange={v => updateThreshold("minimum_trade_count", v)}
            disabled={disabled}
            issues={issuesByField.get("evidence_thresholds.minimum_trade_count")}
          />
          <NumberInput
            label="min evaluated trading days"
            value={plan.evidence_thresholds.minimum_evaluated_trading_days}
            onChange={v => updateThreshold("minimum_evaluated_trading_days", v)}
            disabled={disabled}
            issues={issuesByField.get("evidence_thresholds.minimum_evaluated_trading_days")}
          />
        </div>
      </Field>

      <Field
        label="Decisive verdict rules"
        hint="what each verdict actually means for this strategy"
      >
        <TextareaInput
          label="pass — what proves the edge"
          value={plan.decisive_verdict_rules.pass}
          onChange={v => updateVerdict("pass", v)}
          disabled={disabled}
          issues={issuesByField.get("decisive_verdict_rules.pass")}
        />
        <TextareaInput
          label="inconclusive — what defers judgement"
          value={plan.decisive_verdict_rules.inconclusive}
          onChange={v => updateVerdict("inconclusive", v)}
          disabled={disabled}
          issues={issuesByField.get("decisive_verdict_rules.inconclusive")}
        />
        <TextareaInput
          label="fail — what kills the strategy"
          value={plan.decisive_verdict_rules.fail}
          onChange={v => updateVerdict("fail", v)}
          disabled={disabled}
          issues={issuesByField.get("decisive_verdict_rules.fail")}
        />
      </Field>

      <Field
        label="Data requirements"
        hint="derived from Strategy → Required data + the capability catalog"
      >
        <DataRequirementsTable requirements={plan.data_requirements} issuesByField={issuesByField} />
      </Field>

      <Field
        label="Known limitations"
        hint="what an honest reader should know up front; one per line"
      >
        <textarea
          value={plan.known_limitations.join("\n")}
          onChange={e => updateKnownLimitations(e.target.value)}
          disabled={disabled}
          rows={3}
          style={textareaStyle}
          placeholder="e.g. Ape Wisdom v1 uses seeded attention only; not a full historical replay."
        />
      </Field>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────

function Field({
  label,
  hint,
  issues,
  children,
}: {
  label: string
  hint?: string
  issues?: ExperimentPlanValidityIssue[]
  children: React.ReactNode
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          className="t-eyebrow"
          style={{ fontSize: 9, color: "var(--vr-gold)", letterSpacing: "0.14em" }}
        >
          {label}
        </span>
        {hint && (
          <span
            style={{
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              fontSize: 12,
              color: "var(--vr-cream-mute)",
            }}
          >
            {hint}
          </span>
        )}
      </div>
      {children}
      {issues && issues.length > 0 && <IssueList issues={issues} />}
    </div>
  )
}

function IssueList({ issues }: { issues: ExperimentPlanValidityIssue[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {issues.map((issue, idx) => (
        <span
          key={`${issue.field_id}-${idx}`}
          style={{
            fontSize: 11,
            color: issue.severity === "error" ? "var(--vr-down)" : "var(--vr-gold)",
            fontFamily: "var(--ff-mono)",
          }}
        >
          {issue.severity === "error" ? "✗" : "◐"} {issue.message}
        </span>
      ))}
    </div>
  )
}

function SelectGroup({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: string; label: string; hint: string }[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            style={{
              padding: "8px 12px",
              borderRadius: 3,
              border: `1px solid ${active ? "var(--vr-gold)" : "var(--vr-line)"}`,
              background: active ? "var(--vr-gold-soft)" : "var(--vr-ink)",
              color: active ? "var(--vr-gold)" : "var(--vr-cream-mute)",
              fontFamily: "var(--ff-mono)",
              fontSize: 11,
              letterSpacing: "0.04em",
              cursor: disabled ? "not-allowed" : "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2,
              minWidth: 140,
              textAlign: "left",
            }}
          >
            <span style={{ fontWeight: 500 }}>{opt.label}</span>
            <span style={{ fontSize: 9.5, opacity: 0.85, fontStyle: "italic", fontFamily: "var(--ff-serif)" }}>
              {opt.hint}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function DateInput({
  label,
  value,
  onChange,
  disabled,
  issues,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  issues?: ExperimentPlanValidityIssue[]
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
      <span
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-cream-mute)", letterSpacing: "0.12em" }}
      >
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={inputStyle}
      />
      {issues && issues.length > 0 && <IssueList issues={issues} />}
    </div>
  )
}

function NumberInput({
  label,
  value,
  onChange,
  disabled,
  issues,
}: {
  label: string
  value: number
  onChange: (v: string) => void
  disabled?: boolean
  issues?: ExperimentPlanValidityIssue[]
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
      <span
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-cream-mute)", letterSpacing: "0.12em" }}
      >
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        min={0}
        step={1}
        style={inputStyle}
      />
      {issues && issues.length > 0 && <IssueList issues={issues} />}
    </div>
  )
}

function TextareaInput({
  label,
  value,
  onChange,
  disabled,
  issues,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  issues?: ExperimentPlanValidityIssue[]
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-cream-mute)", letterSpacing: "0.12em" }}
      >
        {label}
      </span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        rows={2}
        style={textareaStyle}
      />
      {issues && issues.length > 0 && <IssueList issues={issues} />}
    </div>
  )
}

function EraPicker({
  runnableEras,
  selectedIds,
  onToggle,
  disabled,
  issues,
}: {
  runnableEras: RunnableEraRef[]
  selectedIds: string[]
  onToggle: (eraId: string) => void
  disabled?: boolean
  issues?: ExperimentPlanValidityIssue[]
}) {
  if (runnableEras.length === 0) {
    return (
      <div style={hintLine}>
        No runnable eras catalogued for this idea yet. Multi-era selection requires the
        producer to enumerate eras Talon can pick from.
      </div>
    )
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {runnableEras.map(era => {
        const checked = selectedIds.includes(era.era_id)
        const statusColor =
          era.status === "AVAILABLE"
            ? "var(--vr-up)"
            : era.status === "INCOMPLETE_DATA"
              ? "var(--vr-gold)"
              : "var(--vr-down)"
        return (
          <label
            key={era.era_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              border: "1px solid var(--vr-line)",
              borderRadius: 3,
              background: checked ? "var(--vr-gold-soft)" : "var(--vr-ink)",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(era.era_id)}
              disabled={disabled || era.status === "UNAVAILABLE"}
            />
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 2 }}>
              <span style={{ fontSize: 12, color: "var(--vr-cream)", fontFamily: "var(--ff-serif)" }}>
                {era.label}
              </span>
              <span className="t-mono" style={{ fontSize: 10, color: "var(--vr-cream-mute)" }}>
                {era.date_range.start} → {era.date_range.end}
              </span>
            </div>
            <span
              className="t-eyebrow"
              style={{
                padding: "2px 7px",
                fontSize: 8.5,
                letterSpacing: "0.1em",
                borderRadius: 2,
                border: `1px solid ${statusColor}`,
                color: statusColor,
                whiteSpace: "nowrap",
              }}
            >
              {era.status}
            </span>
          </label>
        )
      })}
      {issues && issues.length > 0 && <IssueList issues={issues} />}
    </div>
  )
}

function DataRequirementsTable({
  requirements,
  issuesByField,
}: {
  requirements: ExperimentPlanDataRequirement[]
  issuesByField: Map<string, ExperimentPlanValidityIssue[]>
}) {
  if (requirements.length === 0) {
    return (
      <div style={hintLine}>
        No required data listed. If this strategy needs more than default OHLCV, add it
        under Strategy → Required data above.
      </div>
    )
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {requirements.map((req, idx) => {
        const statusColor =
          req.status === "AVAILABLE"
            ? "var(--vr-up)"
            : req.status === "PARTIAL"
              ? "var(--vr-gold)"
              : "var(--vr-down)"
        const drift = req.status !== req.status_at_draft
        const issues = issuesByField.get(`data_requirements[${idx}].status`)
        return (
          <div
            key={`${req.capability_id}-${idx}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              border: "1px solid var(--vr-line)",
              borderRadius: 3,
              background: "var(--vr-ink)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 2, minWidth: 200 }}>
              <span className="t-mono" style={{ fontSize: 12, color: "var(--vr-cream)" }}>
                {req.capability_id}
              </span>
              {req.purpose && (
                <span style={{ fontSize: 10.5, color: "var(--vr-cream-faint)", fontStyle: "italic", fontFamily: "var(--ff-serif)" }}>
                  {req.purpose}
                </span>
              )}
              {issues && issues.length > 0 && <IssueList issues={issues} />}
            </div>
            <span
              className="t-eyebrow"
              style={{
                padding: "2px 7px",
                fontSize: 8.5,
                letterSpacing: "0.1em",
                borderRadius: 2,
                border: `1px solid ${statusColor}`,
                color: statusColor,
                whiteSpace: "nowrap",
              }}
            >
              {req.status}
            </span>
            {drift && (
              <span
                className="t-eyebrow"
                style={{
                  padding: "2px 7px",
                  fontSize: 8.5,
                  letterSpacing: "0.1em",
                  borderRadius: 2,
                  border: "1px solid var(--vr-gold-line)",
                  color: "var(--vr-gold)",
                  background: "var(--vr-gold-soft)",
                  whiteSpace: "nowrap",
                }}
              >
                drifted from {req.status_at_draft}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ReadOnlyHint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
      <span
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-cream-mute)", letterSpacing: "0.12em" }}
      >
        {label}
      </span>
      <span className="t-mono" style={{ fontSize: 12, color: "var(--vr-cream-faint)" }}>
        {children}
      </span>
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--vr-line)",
  borderRadius: 3,
  background: "var(--vr-ink)",
  color: "var(--vr-cream)",
  fontFamily: "var(--ff-mono)",
  fontSize: 16,
  letterSpacing: "0.02em",
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: "var(--ff-sans)",
  fontSize: 16,
  lineHeight: 1.5,
  resize: "vertical",
}

const fieldRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
}

const hintLine: React.CSSProperties = {
  fontSize: 11,
  color: "var(--vr-cream-faint)",
  fontStyle: "italic",
  fontFamily: "var(--ff-serif)",
  lineHeight: 1.5,
}

const emptyState: React.CSSProperties = {
  padding: "14px 16px",
  border: "1px dashed var(--vr-line)",
  borderRadius: 3,
  background: "var(--vr-ink)",
  color: "var(--vr-cream-mute)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
}
