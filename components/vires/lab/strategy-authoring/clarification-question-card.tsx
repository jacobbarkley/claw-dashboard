"use client"

// ClarificationQuestionCard — single question surface for the pre-draft
// clarification step. Renders the right input shape per answer_kind and
// surfaces three possible operator actions:
//   - Answer the question
//   - Accept Talon's proposed default (only if proposed_default is present)
//   - Mark as unknown (only if allow_unknown is true)
//
// State is owned by the parent (clarification-client). This card is
// presentation + input wiring only.

import type {
  ClarificationAnswerAction,
  ClarificationAnswerKind,
  ClarificationOption,
  ClarificationQuestion,
  ClarificationSeverity,
} from "@/lib/research-lab-strategy-authoring-clarification"

// Local UI status — extends Codex's three-action contract with an
// UNANSWERED state so the card can render before the operator picks
// any action.
export type QuestionAnswerUiStatus = ClarificationAnswerAction | "UNANSWERED"

const SEVERITY_COLOR: Record<ClarificationSeverity, string> = {
  HIGH: "var(--vr-down)",
  MEDIUM: "var(--vr-gold)",
  LOW: "var(--vr-cream-mute)",
}

const SEVERITY_LABEL: Record<ClarificationSeverity, string> = {
  HIGH: "HIGH IMPACT",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
}

export interface QuestionAnswerState {
  status: QuestionAnswerUiStatus
  value?: unknown
}

interface ClarificationQuestionCardProps {
  question: ClarificationQuestion
  answer: QuestionAnswerState
  onChange: (next: QuestionAnswerState) => void
}

export function ClarificationQuestionCard({
  question,
  answer,
  onChange,
}: ClarificationQuestionCardProps) {
  const severityColor = SEVERITY_COLOR[question.severity]
  const isResolved = answer.status !== "UNANSWERED"
  const isBlocking = question.blocking_policy === "BLOCKS_SYNTHESIS"
  return (
    <div
      className="vr-card"
      style={{
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        borderLeft: `2px solid ${severityColor}`,
        background: isResolved ? "transparent" : "rgba(200,169,104,0.03)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          className="t-eyebrow"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            color: severityColor,
            border: `1px solid ${severityColor}`,
            padding: "1px 6px",
            borderRadius: 2,
            fontFamily: "var(--ff-mono)",
          }}
        >
          {SEVERITY_LABEL[question.severity]}
        </span>
        {isBlocking && (
          <span
            className="t-eyebrow"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              color: "var(--vr-down)",
              fontFamily: "var(--ff-mono)",
            }}
          >
            · BLOCKS SYNTHESIS
          </span>
        )}
        <span
          className="t-mono"
          style={{
            fontSize: 9.5,
            color: "var(--vr-cream-faint)",
            marginLeft: "auto",
          }}
        >
          {question.section_key} · {question.field_path}
        </span>
      </div>

      <div
        className="t-read"
        style={{
          fontSize: 14,
          color: "var(--vr-cream)",
          fontFamily: "var(--ff-serif)",
          lineHeight: 1.4,
        }}
      >
        {question.question}
      </div>

      <div
        className="t-read"
        style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
      >
        <span style={{ color: "var(--vr-cream-mute)" }}>Why it matters · </span>
        {question.why_it_matters}
      </div>

      <AnswerInput
        question={question}
        answer={answer}
        onAnswer={value => onChange({ status: "ANSWER", value })}
      />

      <ActionRow
        question={question}
        answer={answer}
        onAcceptDefault={() =>
          onChange({
            status: "ACCEPT_DEFAULT",
            value: question.proposed_default?.value,
          })
        }
        onMarkUnknown={() => onChange({ status: "MARK_UNKNOWN" })}
        onClear={() => onChange({ status: "UNANSWERED" })}
      />

      {isResolved && (
        <div
          style={{
            paddingTop: 8,
            borderTop: "1px solid var(--vr-line)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <ResolvedSummary answer={answer} question={question} />
        </div>
      )}
    </div>
  )
}

function AnswerInput({
  question,
  answer,
  onAnswer,
}: {
  question: ClarificationQuestion
  answer: QuestionAnswerState
  onAnswer: (value: unknown) => void
}) {
  const value = answer.status === "ANSWER" ? answer.value : undefined
  return renderForKind(question.answer_kind, question.options, value, onAnswer)
}

function renderForKind(
  kind: ClarificationAnswerKind,
  options: ClarificationOption[] | undefined,
  value: unknown,
  onAnswer: (next: unknown) => void,
): React.ReactNode {
  if (kind === "FREE_TEXT") {
    return (
      <textarea
        value={typeof value === "string" ? value : ""}
        onChange={e => onAnswer(e.target.value)}
        rows={2}
        style={{ ...inputStyle, fontFamily: "var(--ff-read)", resize: "vertical", minHeight: 56 }}
        placeholder="Type your answer…"
      />
    )
  }
  if (kind === "NUMBER") {
    return (
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={e =>
          onAnswer(e.target.value === "" ? undefined : Number(e.target.value))
        }
        style={inputStyle}
      />
    )
  }
  if (kind === "BOOLEAN") {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        {[true, false].map(v => {
          const selected = value === v
          return (
            <button
              key={String(v)}
              type="button"
              onClick={() => onAnswer(v)}
              style={{
                ...optionButton,
                background: selected ? "var(--vr-gold)" : "transparent",
                color: selected ? "var(--vr-ink)" : "var(--vr-cream)",
                borderColor: selected ? "var(--vr-gold)" : "var(--vr-line)",
              }}
            >
              {v ? "YES" : "NO"}
            </button>
          )
        })}
      </div>
    )
  }
  if (kind === "RANGE") {
    const range = (typeof value === "object" && value !== null
      ? (value as { start?: unknown; end?: unknown })
      : {}) as { start?: string; end?: string }
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="date"
          value={range.start ?? ""}
          onChange={e => onAnswer({ start: e.target.value, end: range.end ?? "" })}
          style={inputStyle}
        />
        <span style={{ color: "var(--vr-cream-faint)", fontSize: 11 }}>to</span>
        <input
          type="date"
          value={range.end ?? ""}
          onChange={e => onAnswer({ start: range.start ?? "", end: e.target.value })}
          style={inputStyle}
        />
      </div>
    )
  }
  if (kind === "SINGLE_CHOICE") {
    if (!options || options.length === 0) return <em>No options provided.</em>
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((opt, i) => {
          const selected = JSON.stringify(value) === JSON.stringify(opt.value)
          return (
            <button
              key={i}
              type="button"
              onClick={() => onAnswer(opt.value)}
              style={{
                ...optionRow,
                background: selected ? "rgba(200,169,104,0.10)" : "transparent",
                borderColor: selected ? "var(--vr-gold)" : "var(--vr-line)",
              }}
            >
              <div style={{ fontSize: 12.5, color: "var(--vr-cream)" }}>{opt.label}</div>
              {opt.description && (
                <div style={{ fontSize: 11, color: "var(--vr-cream-dim)", marginTop: 2 }}>
                  {opt.description}
                </div>
              )}
            </button>
          )
        })}
      </div>
    )
  }
  if (kind === "MULTI_CHOICE") {
    if (!options || options.length === 0) return <em>No options provided.</em>
    const selectedSet = new Set(
      Array.isArray(value) ? (value as unknown[]).map(v => JSON.stringify(v)) : [],
    )
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((opt, i) => {
          const isOn = selectedSet.has(JSON.stringify(opt.value))
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                const next = new Set(selectedSet)
                const k = JSON.stringify(opt.value)
                if (isOn) next.delete(k)
                else next.add(k)
                onAnswer(
                  Array.from(next).map(s => JSON.parse(s)),
                )
              }}
              style={{
                ...optionRow,
                background: isOn ? "rgba(200,169,104,0.10)" : "transparent",
                borderColor: isOn ? "var(--vr-gold)" : "var(--vr-line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    border: `1px solid ${isOn ? "var(--vr-gold)" : "var(--vr-line)"}`,
                    background: isOn ? "var(--vr-gold)" : "transparent",
                    display: "inline-block",
                  }}
                />
                <span style={{ fontSize: 12.5, color: "var(--vr-cream)" }}>{opt.label}</span>
              </div>
              {opt.description && (
                <div style={{ fontSize: 11, color: "var(--vr-cream-dim)", marginTop: 4, paddingLeft: 20 }}>
                  {opt.description}
                </div>
              )}
            </button>
          )
        })}
      </div>
    )
  }
  return <em>Unsupported answer_kind: {kind}</em>
}

function ActionRow({
  question,
  answer,
  onAcceptDefault,
  onMarkUnknown,
  onClear,
}: {
  question: ClarificationQuestion
  answer: QuestionAnswerState
  onAcceptDefault: () => void
  onMarkUnknown: () => void
  onClear: () => void
}) {
  const hasDefault = !!question.proposed_default
  const acceptedDefault = answer.status === "ACCEPT_DEFAULT"
  const markedUnknown = answer.status === "MARK_UNKNOWN"
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {hasDefault && (
        <button
          type="button"
          onClick={onAcceptDefault}
          style={{
            ...secondaryButton,
            background: acceptedDefault ? "rgba(200,169,104,0.10)" : "transparent",
            color: acceptedDefault ? "var(--vr-gold)" : "var(--vr-cream-mute)",
            borderColor: acceptedDefault ? "var(--vr-gold)" : "var(--vr-line-hi)",
          }}
        >
          {acceptedDefault ? "✓ ACCEPTED DEFAULT" : "ACCEPT TALON DEFAULT"}
        </button>
      )}
      {question.allow_unknown && (
        <button
          type="button"
          onClick={onMarkUnknown}
          style={{
            ...secondaryButton,
            background: markedUnknown ? "rgba(200,169,104,0.10)" : "transparent",
            color: markedUnknown ? "var(--vr-gold)" : "var(--vr-cream-mute)",
            borderColor: markedUnknown ? "var(--vr-gold)" : "var(--vr-line-hi)",
          }}
        >
          {markedUnknown ? "✓ MARKED UNKNOWN" : "I DON'T KNOW"}
        </button>
      )}
      {answer.status !== "UNANSWERED" && (
        <button
          type="button"
          onClick={onClear}
          style={{
            ...secondaryButton,
            color: "var(--vr-cream-faint)",
            borderColor: "var(--vr-line)",
            marginLeft: "auto",
          }}
        >
          CLEAR
        </button>
      )}
    </div>
  )
}

function ResolvedSummary({
  answer,
  question,
}: {
  answer: QuestionAnswerState
  question: ClarificationQuestion
}) {
  if (answer.status === "ACCEPT_DEFAULT") {
    return (
      <span
        className="t-read"
        style={{ fontSize: 11, color: "var(--vr-gold)", lineHeight: 1.4 }}
      >
        Default accepted: <strong>{formatValue(question.proposed_default?.value)}</strong>{" "}
        ({question.proposed_default?.provenance_source}). {question.proposed_default?.rationale}
      </span>
    )
  }
  if (answer.status === "MARK_UNKNOWN") {
    return (
      <span
        className="t-read"
        style={{ fontSize: 11, color: "var(--vr-cream-mute)", lineHeight: 1.4, fontStyle: "italic" }}
      >
        Logged as unknown.{" "}
        {question.blocking_policy === "CAN_PROCEED_UNKNOWN"
          ? "Talon will scaffold this section and flag it as TENTATIVE."
          : question.blocking_policy === "CAN_USE_DEFAULT"
            ? "Talon will fall back to the proposed default."
            : "This still blocks synthesis — answer or accept a default to proceed."}
      </span>
    )
  }
  if (answer.status === "ANSWER") {
    return (
      <span
        className="t-read"
        style={{ fontSize: 11, color: "var(--vr-up)", lineHeight: 1.4 }}
      >
        Your answer: <strong>{formatValue(answer.value)}</strong>
      </span>
    )
  }
  return null
}

function formatValue(value: unknown): string {
  if (value == null) return "(none)"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map(formatValue).join(", ")
  if (typeof value === "object") {
    const v = value as Record<string, unknown>
    if ("start" in v && "end" in v) return `${v.start} → ${v.end}`
    return JSON.stringify(value)
  }
  return JSON.stringify(value)
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  color: "var(--vr-cream)",
  background: "var(--vr-ink)",
  border: "1px solid var(--vr-line)",
  borderRadius: 2,
  padding: "6px 8px",
  outline: "none",
  fontFamily: "var(--ff-mono)",
}

const optionRow: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  border: "1px solid",
  borderRadius: 3,
  padding: "8px 10px",
  cursor: "pointer",
  fontFamily: "var(--ff-read)",
}

const optionButton: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.16em",
  fontFamily: "var(--ff-mono)",
  textTransform: "uppercase",
  padding: "7px 16px",
  borderRadius: 3,
  border: "1px solid",
  cursor: "pointer",
}

const secondaryButton: React.CSSProperties = {
  fontSize: 9.5,
  letterSpacing: "0.14em",
  fontFamily: "var(--ff-mono)",
  textTransform: "uppercase",
  padding: "6px 12px",
  borderRadius: 3,
  border: "1px solid",
  cursor: "pointer",
  background: "transparent",
}
