"use client"

import { useState } from "react"
import type { Questionnaire } from "./types"
import { FieldEyebrow, GuidedHeroCard } from "./shared"

// S1+S2 — Questionnaire intro and multi-step questions. Mocked-only:
// answers do not persist anywhere, do not produce a real proposal,
// do not leave the browser.

export function QuestionnaireSurface({ questionnaire }: { questionnaire: Questionnaire }) {
  const [step, setStep] = useState<number>(-1) // -1 = intro
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const total = questionnaire.questions.length
  if (step === -1) {
    return <Intro title={questionnaire.title} total={total} onStart={() => setStep(0)} />
  }
  if (step >= total) {
    return <Complete answers={answers} onBack={() => setStep(0)} />
  }

  const q = questionnaire.questions[step]
  const selected = answers[q.key] ?? null

  return (
    <GuidedHeroCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <FieldEyebrow>
          Question {step + 1} of {total}
        </FieldEyebrow>
        <span style={{ fontSize: 10, color: "var(--vr-cream-mute, #8c8579)" }}>
          {questionnaire.questionnaire_id}.{questionnaire.version}
        </span>
      </div>

      <h2
        style={{
          fontSize: 20,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream, #f1ece0)",
          fontWeight: 400,
          marginTop: 0,
          marginBottom: 16,
          lineHeight: 1.35,
        }}
      >
        {q.text}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {q.answer_options.map(opt => {
          const isSelected = selected === opt.option_id
          return (
            <button
              key={opt.option_id}
              type="button"
              onClick={() => setAnswers({ ...answers, [q.key]: opt.option_id })}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                border: `1px solid ${isSelected ? "var(--vr-gold, #c8a968)" : "var(--vr-line, #2a2438)"}`,
                background: isSelected ? "rgba(200,169,104,0.08)" : "rgba(241,236,224,0.02)",
                color: isSelected ? "var(--vr-gold, #c8a968)" : "var(--vr-cream-dim, #c4bdac)",
                borderRadius: 3,
                fontSize: 13,
                cursor: "pointer",
                transition: "background 80ms ease, border-color 80ms ease",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: `1.5px solid ${isSelected ? "var(--vr-gold, #c8a968)" : "var(--vr-cream-mute, #8c8579)"}`,
                  marginRight: 10,
                  verticalAlign: "middle",
                  background: isSelected ? "var(--vr-gold, #c8a968)" : "transparent",
                }}
              />
              {opt.label}
            </button>
          )
        })}
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--vr-cream-mute, #8c8579)",
          padding: "10px 12px",
          background: "rgba(241,236,224,0.02)",
          borderLeft: "2px solid var(--vr-line, #2a2438)",
          marginBottom: 18,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: "var(--vr-cream-dim, #c4bdac)", fontWeight: 600 }}>Why we ask: </strong>
        {q.why_we_ask_text}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button
          type="button"
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
          style={{
            padding: "10px 16px",
            background: "transparent",
            border: "1px solid var(--vr-line, #2a2438)",
            color: step === 0 ? "var(--vr-cream-mute, #8c8579)" : "var(--vr-cream-dim, #c4bdac)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor: step === 0 ? "not-allowed" : "pointer",
            borderRadius: 2,
          }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => setStep(step + 1)}
          disabled={!selected}
          style={{
            padding: "10px 18px",
            background: selected ? "var(--vr-gold, #c8a968)" : "rgba(200,169,104,0.18)",
            border: "1px solid var(--vr-gold, #c8a968)",
            color: selected ? "var(--vr-bg, #0c0a17)" : "var(--vr-cream-mute, #8c8579)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 600,
            cursor: selected ? "pointer" : "not-allowed",
            borderRadius: 2,
          }}
        >
          {step + 1 === total ? "See match →" : "Next →"}
        </button>
      </div>
    </GuidedHeroCard>
  )
}

function Intro({ title, total, onStart }: { title: string; total: number; onStart: () => void }) {
  return (
    <GuidedHeroCard>
      <h1
        style={{
          fontSize: 26,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream, #f1ece0)",
          fontWeight: 400,
          marginTop: 0,
          marginBottom: 12,
          lineHeight: 1.25,
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: 13, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.6, marginBottom: 18 }}>
        A few questions, ~2 minutes. Your answers shape what we suggest. Paper trading only — no real money moves until you say so.
      </p>
      <button
        type="button"
        onClick={onStart}
        style={{
          padding: "12px 20px",
          background: "var(--vr-gold, #c8a968)",
          border: "1px solid var(--vr-gold, #c8a968)",
          color: "var(--vr-bg, #0c0a17)",
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          fontWeight: 600,
          cursor: "pointer",
          borderRadius: 2,
        }}
      >
        Start questionnaire ({total} questions) →
      </button>
      <div
        style={{
          marginTop: 24,
          paddingTop: 18,
          borderTop: "1px solid var(--vr-line, #2a2438)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <FieldEyebrow>How this works</FieldEyebrow>
        <ul style={{ paddingLeft: 20, color: "var(--vr-cream-dim, #c4bdac)", fontSize: 12, lineHeight: 1.7, margin: 0 }}>
          <li>You answer {total} short questions</li>
          <li>We propose a strategy that fits</li>
          <li>You see the worst case before you accept</li>
          <li>Paper trading begins on accept</li>
        </ul>
      </div>
    </GuidedHeroCard>
  )
}

function Complete({ answers, onBack }: { answers: Record<string, string>; onBack: () => void }) {
  return (
    <GuidedHeroCard>
      <FieldEyebrow>Mock complete</FieldEyebrow>
      <h2
        style={{
          fontSize: 20,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream, #f1ece0)",
          fontWeight: 400,
          marginTop: 6,
          marginBottom: 14,
        }}
      >
        Answers captured for the match
      </h2>
      <p style={{ fontSize: 12, color: "var(--vr-cream-mute, #8c8579)", marginBottom: 14, lineHeight: 1.55 }}>
        In production, this would generate a `guided_match_proposal.v1` carrying these answers as a `questionnaire_answers_snapshot`. Mocked preview only — nothing is persisted.
      </p>
      <pre
        style={{
          fontSize: 11,
          fontFamily: "var(--ff-mono)",
          background: "rgba(241,236,224,0.02)",
          color: "var(--vr-cream-dim, #c4bdac)",
          padding: 12,
          borderRadius: 3,
          border: "1px solid var(--vr-line, #2a2438)",
          overflow: "auto",
          marginBottom: 14,
        }}
      >
        {JSON.stringify(answers, null, 2)}
      </pre>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: "10px 16px",
            background: "transparent",
            border: "1px solid var(--vr-line, #2a2438)",
            color: "var(--vr-cream-dim, #c4bdac)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor: "pointer",
            borderRadius: 2,
          }}
        >
          ← Edit answers
        </button>
        <a
          href="/vires/guided/preview/match"
          style={{
            padding: "10px 16px",
            background: "var(--vr-gold, #c8a968)",
            border: "1px solid var(--vr-gold, #c8a968)",
            color: "var(--vr-bg, #0c0a17)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 600,
            textDecoration: "none",
            borderRadius: 2,
            display: "inline-block",
          }}
        >
          See match →
        </a>
      </div>
    </GuidedHeroCard>
  )
}
