"use client"

// Preview for the Strategy Authoring clarification screen. Uses the
// frontend-side mock until Codex's /clarify endpoint lands. Not linked
// from nav — operators / dev navigate directly.
//
// Flow shown:
//   - All 6 representative questions across HIGH / MEDIUM / LOW severities
//   - Every answer_kind covered (FREE_TEXT, NUMBER, BOOLEAN, RANGE,
//     SINGLE_CHOICE, MULTI_CHOICE)
//   - One question per blocking_policy (BLOCKS_SYNTHESIS,
//     CAN_USE_DEFAULT, CAN_PROCEED_UNKNOWN)
//
// Submit shows an alert with the answer payload that would round-trip
// to /clarify on the second leg, then to /packets for synthesis.

import { ClarificationClient } from "@/components/vires/lab/strategy-authoring/clarification-client"
import { mockClarifyResponse } from "@/lib/research-lab-strategy-authoring-clarification"

export default function PreviewClarificationPage() {
  const mock = mockClarifyResponse()
  return (
    <>
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "20px 20px 0",
        }}
      >
        <div
          className="vr-card"
          style={{
            padding: "10px 14px",
            border: "1px dashed var(--vr-line-hi)",
            background: "transparent",
          }}
        >
          <span
            className="t-eyebrow"
            style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--vr-cream-mute)" }}
          >
            ⓘ PREVIEW · MOCK CLARIFICATION RESPONSE · NO BACKEND CALLS
          </span>
        </div>
      </div>
      <ClarificationClient
        request={mock.clarification_request}
        contextSummary={mock.context_packet.missing_context_candidates}
        ideaTitle="test x I I (mock)"
        onSubmitAnswers={async answers => {
          alert(
            `Would round-trip to /clarify with ${answers.length} answer(s):\n\n${JSON.stringify(answers, null, 2)}`,
          )
        }}
      />
    </>
  )
}
