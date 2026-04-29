"use client"

// Seven-step idea thread stepper. Renders a compact horizontal pill
// row at the top of the idea detail page (or the Phase D preview
// route) showing where the idea is in its lifecycle. Each pill reads
// like a sentence: "Describe", "Awaiting spec", "Spec in review", etc.
//
// Designed to be reusable: pass `currentStep` plus an optional
// `onStepClick` for the preview / scrubber, or pass nothing for the
// live read-only render.
//
// Phase D-implementation will compute `currentStep` from the idea's
// strategy_ref + spec state + campaign state. Phase D-prep just
// renders against a hand-driven scrubber.

export type ThreadStep =
  | "describe"
  | "awaiting-spec"
  | "spec-drafted"
  | "awaiting-impl"
  | "ready-to-run"
  | "campaign"
  | "ready-to-nominate"

interface StepDef {
  id: ThreadStep
  label: string
}

export const THREAD_STEPS: StepDef[] = [
  { id: "describe",          label: "Describe" },
  { id: "awaiting-spec",     label: "Awaiting spec" },
  { id: "spec-drafted",      label: "Spec in review" },
  { id: "awaiting-impl",     label: "Awaiting implementation" },
  { id: "ready-to-run",      label: "Ready to run" },
  { id: "campaign",          label: "Campaign" },
  { id: "ready-to-nominate", label: "Ready to nominate" },
]

interface Props {
  currentStep: ThreadStep
  onStepClick?: (step: ThreadStep) => void
}

export function IdeaThreadStepper({ currentStep, onStepClick }: Props) {
  const currentIdx = THREAD_STEPS.findIndex(s => s.id === currentStep)
  const clickable = !!onStepClick

  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        flexWrap: "wrap",
        alignItems: "stretch",
        rowGap: 6,
      }}
    >
      {THREAD_STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx
        const stateStyle = isCurrent
          ? CURRENT_STYLE
          : isCompleted
            ? COMPLETED_STYLE
            : UPCOMING_STYLE
        return (
          <div key={step.id} style={{ display: "flex", alignItems: "center" }}>
            <button
              type="button"
              onClick={clickable ? () => onStepClick?.(step.id) : undefined}
              disabled={!clickable}
              style={{
                ...BASE_CHIP,
                ...stateStyle,
                cursor: clickable ? "pointer" : "default",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={INDEX_PILL}>{idx + 1}</span>
                <span>{step.label}</span>
              </span>
            </button>
            {idx < THREAD_STEPS.length - 1 && <Connector active={idx < currentIdx} />}
          </div>
        )
      })}
    </div>
  )
}

function Connector({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 14,
        height: 1,
        background: active ? "var(--vr-gold-line)" : "var(--vr-line)",
        margin: "0 2px",
        alignSelf: "center",
      }}
    />
  )
}

const BASE_CHIP: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 11,
  fontFamily: "var(--ff-serif)",
  fontStyle: "italic",
  borderRadius: 3,
  border: "1px solid",
  background: "transparent",
  whiteSpace: "nowrap",
}

const INDEX_PILL: React.CSSProperties = {
  fontSize: 9,
  fontFamily: "var(--ff-mono)",
  fontStyle: "normal",
  letterSpacing: "0.06em",
  opacity: 0.75,
}

const CURRENT_STYLE: React.CSSProperties = {
  borderColor: "var(--vr-gold)",
  background: "var(--vr-gold-soft)",
  color: "var(--vr-gold)",
}

const COMPLETED_STYLE: React.CSSProperties = {
  borderColor: "var(--vr-line-hi)",
  color: "var(--vr-cream-mute)",
}

const UPCOMING_STYLE: React.CSSProperties = {
  borderColor: "var(--vr-line)",
  color: "var(--vr-cream-faint)",
}
