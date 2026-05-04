"use client"

// ClarificationClient — screen between the questionnaire form and the
// packet detail. Displays Talon's clarification questions, captures
// operator answers (or default-acceptance / unknown), and gates the
// "Synthesize packet" action behind any BLOCKS_SYNTHESIS questions
// that haven't been resolved.
//
// The submission path is:
//   form → POST /clarify (no answers) → if NEEDS_CLARIFICATION:
//   render this screen → POST /clarify (with answers) → if READY_FOR_SYNTHESIS:
//   POST /packets → packet detail.
//
// This component is the middle leg. Codex owns the endpoint; the
// `onSubmitAnswers` callback is what Codex's client-side wiring will
// invoke to round-trip back to /clarify, then to /packets.

import { useMemo, useState } from "react"

import {
  ClarificationQuestionCard,
  type QuestionAnswerState,
} from "./clarification-question-card"

import type {
  ClarificationAnswer,
  ClarificationQuestion,
  ClarificationRequest,
} from "@/lib/research-lab-strategy-authoring-clarification"

interface ClarificationClientProps {
  request: ClarificationRequest
  contextSummary: string[]
  ideaTitle: string
  // Called when the operator clicks "Continue to synthesis". The parent
  // is responsible for: (a) re-calling /clarify with the answers to
  // confirm READY_FOR_SYNTHESIS, then (b) calling /packets to actually
  // synthesize. Returns when the round-trip resolves; if rejected, the
  // error string is rendered inline.
  onSubmitAnswers: (answers: ClarificationAnswer[]) => Promise<void>
}

export function ClarificationClient({
  request,
  contextSummary,
  ideaTitle,
  onSubmitAnswers,
}: ClarificationClientProps) {
  const [answers, setAnswers] = useState<Record<string, QuestionAnswerState>>(() => {
    const seed: Record<string, QuestionAnswerState> = {}
    for (const q of request.questions) seed[q.id] = { status: "UNANSWERED" }
    return seed
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buckets = useMemo(() => bucketBySeverity(request.questions), [request.questions])
  const blocked = useMemo(() => {
    return request.questions.filter(
      q => q.blocking_policy === "BLOCKS_SYNTHESIS" && answers[q.id]?.status === "UNANSWERED",
    )
  }, [request.questions, answers])

  const totalResolved = Object.values(answers).filter(a => a.status !== "UNANSWERED").length
  const total = request.questions.length

  const submit = async () => {
    if (busy || blocked.length > 0) return
    setBusy(true)
    setError(null)
    try {
      const payload: ClarificationAnswer[] = request.questions
        .map<ClarificationAnswer | null>(q => {
          const a = answers[q.id]
          if (!a || a.status === "UNANSWERED") return null
          return {
            question_id: q.id,
            action: a.status,
            value: a.value,
          }
        })
        .filter((x): x is ClarificationAnswer => x !== null)
      await onSubmitAnswers(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clarification submission failed")
      setBusy(false)
    }
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 20px 120px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <Header
        ideaTitle={ideaTitle}
        totalResolved={totalResolved}
        total={total}
        blockedCount={blocked.length}
      />

      <ContextSummary context={contextSummary} missing={request.missing_context_summary} />

      {error && (
        <div
          className="t-read"
          style={{
            fontSize: 12,
            color: "var(--vr-down)",
            border: "1px solid rgba(220,95,95,0.45)",
            borderRadius: 3,
            padding: "8px 12px",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}

      {(["HIGH", "MEDIUM", "LOW"] as const).map(severity => {
        const list = buckets[severity]
        if (list.length === 0) return null
        return (
          <Section key={severity} title={`${severity} priority`} count={list.length}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {list.map(q => (
                <ClarificationQuestionCard
                  key={q.id}
                  question={q}
                  answer={answers[q.id] ?? { status: "UNANSWERED" }}
                  onChange={next => setAnswers(prev => ({ ...prev, [q.id]: next }))}
                />
              ))}
            </div>
          </Section>
        )
      })}

      <Footer
        busy={busy}
        blockedCount={blocked.length}
        totalResolved={totalResolved}
        total={total}
        onSubmit={submit}
      />
    </main>
  )
}

function bucketBySeverity(
  questions: ClarificationQuestion[],
): Record<"HIGH" | "MEDIUM" | "LOW", ClarificationQuestion[]> {
  const out: Record<"HIGH" | "MEDIUM" | "LOW", ClarificationQuestion[]> = {
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  }
  for (const q of questions) out[q.severity].push(q)
  return out
}

function Header({
  ideaTitle,
  totalResolved,
  total,
  blockedCount,
}: {
  ideaTitle: string
  totalResolved: number
  total: number
  blockedCount: number
}) {
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span
        className="t-eyebrow"
        style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--vr-cream-mute)" }}
      >
        TALON CLARIFICATION
      </span>
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--ff-serif)",
          fontSize: 26,
          color: "var(--vr-cream)",
          lineHeight: 1.2,
        }}
      >
        Before Talon drafts: a few questions
      </h1>
      <p
        className="t-read"
        style={{ margin: 0, fontSize: 13, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
      >
        Talon found gaps in the questionnaire that would force it to guess. Answer the ones
        you have an opinion on, accept its proposed default for the rest, or mark unknown.
        Synthesis won&apos;t run until every <strong>blocks-synthesis</strong> item is resolved.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span
          className="t-mono"
          style={{ fontSize: 11, color: "var(--vr-cream-mute)" }}
        >
          {totalResolved} / {total} resolved
        </span>
        {blockedCount > 0 && (
          <span
            className="t-eyebrow"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              color: "var(--vr-down)",
              border: "1px solid var(--vr-down)",
              padding: "1px 6px",
              borderRadius: 2,
              fontFamily: "var(--ff-mono)",
            }}
          >
            {blockedCount} BLOCKING SYNTHESIS
          </span>
        )}
        <span
          className="t-mono"
          style={{ fontSize: 10.5, color: "var(--vr-cream-faint)" }}
        >
          · idea: {ideaTitle}
        </span>
      </div>
    </header>
  )
}

function ContextSummary({
  context,
  missing,
}: {
  context: string[]
  missing: string[]
}) {
  if (context.length === 0 && missing.length === 0) return null
  return (
    <details
      className="vr-card"
      style={{
        padding: "10px 14px",
        border: "1px dashed var(--vr-line-hi)",
        background: "transparent",
      }}
    >
      <summary
        className="t-eyebrow"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.18em",
          color: "var(--vr-cream-mute)",
          cursor: "pointer",
        }}
      >
        ⓘ TALON CONTEXT · {context.length} INPUTS, {missing.length} GAPS
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
        {context.length > 0 && (
          <div>
            <span
              className="t-eyebrow"
              style={{ fontSize: 9, letterSpacing: "0.14em", color: "var(--vr-cream-faint)" }}
            >
              INPUTS USED
            </span>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {context.map((item, i) => (
                <li
                  key={i}
                  className="t-read"
                  style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.4 }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {missing.length > 0 && (
          <div>
            <span
              className="t-eyebrow"
              style={{ fontSize: 9, letterSpacing: "0.14em", color: "var(--vr-gold)" }}
            >
              GAPS DRIVING QUESTIONS
            </span>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {missing.map((item, i) => (
                <li
                  key={i}
                  className="t-read"
                  style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.4 }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          className="t-eyebrow"
          style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--vr-gold)" }}
        >
          {title}
        </span>
        <span
          className="t-mono"
          style={{ fontSize: 10.5, color: "var(--vr-cream-faint)" }}
        >
          {count}
        </span>
      </div>
      {children}
    </section>
  )
}

function Footer({
  busy,
  blockedCount,
  totalResolved,
  total,
  onSubmit,
}: {
  busy: boolean
  blockedCount: number
  totalResolved: number
  total: number
  onSubmit: () => void
}) {
  const ready = blockedCount === 0
  return (
    <footer
      style={{
        position: "sticky",
        bottom: 0,
        background: "var(--vr-ink)",
        borderTop: "1px solid var(--vr-line)",
        padding: "12px 0 0",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span
        className="t-read"
        style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.5, flex: 1, minWidth: 200 }}
      >
        {ready
          ? `All blocking questions resolved. ${totalResolved} of ${total} answered. Continue to let Talon synthesize the packet.`
          : `${blockedCount} blocking question${blockedCount > 1 ? "s" : ""} still need an answer or accepted default before synthesis can run.`}
      </span>
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !ready}
        style={{
          ...primaryButton,
          background: busy || !ready ? "transparent" : "var(--vr-gold)",
          color: busy || !ready ? "var(--vr-gold)" : "var(--vr-ink)",
          borderColor: "var(--vr-gold)",
          opacity: !ready ? 0.45 : 1,
        }}
      >
        {busy ? "Talon synthesizing…" : "Continue to synthesis →"}
      </button>
    </footer>
  )
}

const primaryButton: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.16em",
  fontFamily: "var(--ff-mono)",
  textTransform: "uppercase",
  padding: "9px 18px",
  borderRadius: 3,
  border: "1px solid",
  cursor: "pointer",
}
