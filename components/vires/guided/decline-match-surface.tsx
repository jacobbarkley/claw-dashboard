"use client"

import { useState, type CSSProperties } from "react"
import { GuidedHeroCard, SectionLabel } from "./shared"
import { DECLINE_QUESTIONS, type DeclineQuestion } from "./decline-questions"
import type { DeclineForwardPath } from "@/lib/guided-decline.schemas"

// S3 Decline surface (VIR-9).
//
// Replaces the bare "Decline" navigation that previously just bounced back
// to the questionnaire. Captures generic structured reasons (5 chips + open
// trailer), an optional notify-me opt-in, and routes through one of three
// forward-path commands: re-do questionnaire / look at alternatives /
// save for now. The "Look at alternatives" button is disabled in
// single-CANDIDATE library state — VIR-9 Q4 answer.
//
// Questions are generic, not Steady-Tide-specific. Strategy-derived decline
// questions are a follow-up once we have ≥2 admitted strategies (VIR-9
// Q2 answer).

type SubmitState =
  | { stage: "idle" }
  | { stage: "submitting"; path: DeclineForwardPath }
  | { stage: "submitted"; path: DeclineForwardPath; warning: string | null }
  | { stage: "error"; reason: string; path: DeclineForwardPath }

export function DeclineMatchSurface({
  proposalId,
  hasAlternatives,
  onCancel,
}: {
  proposalId: string
  hasAlternatives: boolean
  onCancel: () => void
}) {
  const [responses, setResponses] = useState<Record<string, string | undefined>>({})
  const [openEndedNote, setOpenEndedNote] = useState("")
  const [optIn, setOptIn] = useState(false)
  const [submit, setSubmit] = useState<SubmitState>({ stage: "idle" })

  const bank = DECLINE_QUESTIONS
  const trailer = bank.open_ended_question

  function selectAnswer(question: DeclineQuestion, optionId: string) {
    setResponses(prev => ({
      ...prev,
      [question.key]: prev[question.key] === optionId ? undefined : optionId,
    }))
  }

  async function submitDecline(forwardPath: DeclineForwardPath) {
    if (forwardPath === "request_rematch_now" && !hasAlternatives) return
    setSubmit({ stage: "submitting", path: forwardPath })
    try {
      const body = {
        proposal_id: proposalId,
        responses: Object.entries(responses)
          .filter(([, v]) => typeof v === "string" && v.length > 0)
          .map(([question_key, answer_option_id]) => ({
            question_key,
            answer_option_id: answer_option_id as string,
          })),
        open_ended_note: openEndedNote.trim().length > 0 ? openEndedNote.trim() : null,
        forward_path: forwardPath,
        opt_in_notify_when_library_grows: optIn,
      }
      const res = await fetch("/api/guided/decline-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as {
        ok?: boolean
        next_path?: string
        error?: string
        warning?: string
        forward_path?: DeclineForwardPath
      }
      if (res.status === 503) {
        // Command service not yet wired in this env. Surface honestly,
        // then navigate so the user isn't trapped.
        setSubmit({
          stage: "submitted",
          path: forwardPath,
          warning: "Decline recorded locally; backend not yet live in this environment.",
        })
        if (json.next_path) {
          window.setTimeout(() => navigate(json.next_path as string), 600)
        }
        return
      }
      if (!res.ok || !json.ok) {
        setSubmit({
          stage: "error",
          reason: json.error ?? `HTTP ${res.status}`,
          path: forwardPath,
        })
        return
      }
      setSubmit({
        stage: "submitted",
        path: forwardPath,
        warning: json.warning ?? null,
      })
      if (json.next_path) navigate(json.next_path)
    } catch (err) {
      setSubmit({
        stage: "error",
        reason: (err as Error).message ?? "network_error",
        path: forwardPath,
      })
    }
  }

  const isSubmitting = submit.stage === "submitting"
  const submitted = submit.stage === "submitted"

  return (
    <GuidedHeroCard>
      <button type="button" onClick={onCancel} style={backLink} disabled={isSubmitting || submitted}>
        ← Back to match
      </button>

      <h1 style={heading}>{bank.title}</h1>
      <p style={subtitle}>{bank.subtitle}</p>

      {bank.questions.map(question => (
        <div key={question.key} style={{ marginBottom: 18 }}>
          <SectionLabel>{question.text}</SectionLabel>
          <div style={chipRow}>
            {question.answer_options.map(opt => {
              const selected = responses[question.key] === opt.option_id
              return (
                <button
                  key={opt.option_id}
                  type="button"
                  onClick={() => selectAnswer(question, opt.option_id)}
                  disabled={isSubmitting || submitted}
                  style={selected ? chipSelected : chipBase}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div style={{ marginBottom: 18 }}>
        <SectionLabel>{trailer.text}</SectionLabel>
        <textarea
          value={openEndedNote}
          onChange={e => setOpenEndedNote(e.target.value.slice(0, trailer.max_length))}
          placeholder={trailer.placeholder}
          disabled={isSubmitting || submitted}
          rows={3}
          style={textarea}
        />
        <div style={charCount}>
          {openEndedNote.length}/{trailer.max_length}
        </div>
      </div>

      <label style={optInLabel}>
        <input
          type="checkbox"
          checked={optIn}
          onChange={e => setOptIn(e.target.checked)}
          disabled={isSubmitting || submitted}
          style={{ marginRight: 8 }}
        />
        Notify me when a new strategy is added that might fit better.
      </label>

      <div style={buttonRow}>
        <button
          type="button"
          onClick={() => submitDecline("request_re_questionnaire")}
          disabled={isSubmitting || submitted}
          style={btnSecondary}
        >
          {submitState(submit, "request_re_questionnaire", "Re-do the questionnaire")}
        </button>
        <button
          type="button"
          onClick={() => submitDecline("request_rematch_now")}
          disabled={isSubmitting || submitted || !hasAlternatives}
          style={hasAlternatives ? btnPrimary : btnPrimaryDisabled}
          title={hasAlternatives ? undefined : "No other strategy is ready yet."}
        >
          {submitState(submit, "request_rematch_now", "Look at alternatives")}
        </button>
        <button
          type="button"
          onClick={() => submitDecline("maybe_later")}
          disabled={isSubmitting || submitted}
          style={btnSecondary}
        >
          {submitState(submit, "maybe_later", "Just save for now")}
        </button>
      </div>

      {!hasAlternatives ? (
        <div style={hintRow}>
          No other strategy is ready yet — the alternatives view will open up as the library grows.
        </div>
      ) : null}

      {submit.stage === "error" ? (
        <div style={errorRow}>
          Something went wrong saving your decline ({submit.reason}). Your answers are still on this
          page — you can try again.
        </div>
      ) : null}

      {submit.stage === "submitted" && submit.warning ? (
        <div style={warningRow}>{submit.warning}</div>
      ) : null}
    </GuidedHeroCard>
  )
}

function submitState(state: SubmitState, path: DeclineForwardPath, idleLabel: string): string {
  if (state.stage === "submitting" && state.path === path) return "Saving…"
  if (state.stage === "submitted" && state.path === path) return "Saved"
  return idleLabel
}

function navigate(path: string) {
  if (typeof window === "undefined") return
  window.location.assign(path)
}

// ─── Styles ────────────────────────────────────────────────────────────────

const backLink: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--vr-cream-mute, #8c8579)",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  cursor: "pointer",
  padding: 0,
  marginBottom: 14,
}

const heading: CSSProperties = {
  fontSize: 24,
  fontFamily: "var(--ff-serif)",
  fontStyle: "italic",
  color: "var(--vr-cream, #f1ece0)",
  fontWeight: 400,
  marginTop: 0,
  marginBottom: 6,
  lineHeight: 1.2,
}

const subtitle: CSSProperties = {
  fontSize: 12,
  color: "var(--vr-cream-mute, #8c8579)",
  lineHeight: 1.55,
  marginTop: 0,
  marginBottom: 22,
}

const chipRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 8,
}

const chipBase: CSSProperties = {
  padding: "8px 12px",
  border: "1px solid var(--vr-line, #2a2438)",
  background: "transparent",
  color: "var(--vr-cream-dim, #c4bdac)",
  fontSize: 12,
  borderRadius: 2,
  cursor: "pointer",
  letterSpacing: "0.02em",
}

const chipSelected: CSSProperties = {
  ...chipBase,
  border: "1px solid var(--vr-gold, #c8a968)",
  background: "rgba(200,169,104,0.10)",
  color: "var(--vr-cream, #f1ece0)",
}

const textarea: CSSProperties = {
  width: "100%",
  background: "rgba(241,236,224,0.02)",
  border: "1px solid var(--vr-line, #2a2438)",
  color: "var(--vr-cream, #f1ece0)",
  fontFamily: "inherit",
  fontSize: 13,
  lineHeight: 1.5,
  padding: 10,
  borderRadius: 2,
  resize: "vertical",
  marginTop: 8,
  boxSizing: "border-box",
}

const charCount: CSSProperties = {
  fontSize: 10,
  color: "var(--vr-cream-mute, #8c8579)",
  textAlign: "right",
  letterSpacing: "0.06em",
  marginTop: 4,
}

const optInLabel: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 4,
  fontSize: 12,
  color: "var(--vr-cream-dim, #c4bdac)",
  lineHeight: 1.5,
  cursor: "pointer",
  marginBottom: 22,
}

const buttonRow: CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "space-between",
  flexWrap: "wrap",
}

const btnPrimary: CSSProperties = {
  padding: "10px 18px",
  background: "var(--vr-gold, #c8a968)",
  border: "1px solid var(--vr-gold, #c8a968)",
  color: "var(--vr-bg, #0c0a17)",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: 2,
}

const btnPrimaryDisabled: CSSProperties = {
  ...btnPrimary,
  background: "transparent",
  color: "var(--vr-cream-mute, #8c8579)",
  border: "1px dashed var(--vr-line, #2a2438)",
  cursor: "not-allowed",
}

const btnSecondary: CSSProperties = {
  padding: "10px 14px",
  background: "transparent",
  border: "1px solid var(--vr-line, #2a2438)",
  color: "var(--vr-cream-dim, #c4bdac)",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  cursor: "pointer",
  borderRadius: 2,
}

const hintRow: CSSProperties = {
  fontSize: 11,
  color: "var(--vr-cream-mute, #8c8579)",
  marginTop: 10,
  lineHeight: 1.5,
}

const errorRow: CSSProperties = {
  marginTop: 14,
  padding: 10,
  border: "1px solid #c8686855",
  background: "rgba(200,104,104,0.06)",
  color: "#e6a8a8",
  fontSize: 12,
  borderRadius: 2,
  lineHeight: 1.5,
}

const warningRow: CSSProperties = {
  marginTop: 14,
  padding: 10,
  border: "1px dashed var(--vr-gold, #c8a968)55",
  background: "rgba(200,169,104,0.05)",
  color: "var(--vr-cream-dim, #c4bdac)",
  fontSize: 12,
  borderRadius: 2,
  lineHeight: 1.5,
}
