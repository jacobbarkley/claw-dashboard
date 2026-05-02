// POST /api/research/specs/draft-jobs/[id]/clarifications
//
// Deterministic clarification-answer channel for Unified Spec Builder jobs.
// Answers update builder_state and, when the state becomes ready, resume the
// background Talon worker. Scope remains server-owned for the single-user v1.

import { after, NextRequest, NextResponse } from "next/server"

import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import {
  answerTalonDraftJobClarifications,
  runTalonDraftJob,
} from "@/lib/research-lab-talon-draft-jobs.server"

import {
  requiredString,
  safePathSegment,
} from "../../../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ClarificationBody {
  answers?: unknown
  actor?: unknown
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let body: ClarificationBody
  try {
    body = (await req.json()) as ClarificationBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  try {
    const { id } = await ctx.params
    const jobId = safePathSegment(requiredString(decodeURIComponent(id), "job_id"), "job_id")
    const answers = normalizeAnswers(body.answers)
    if (!answers.length) {
      return NextResponse.json({ error: "answers must include at least one answer" }, { status: 400 })
    }
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "jacob"
    const job = await answerTalonDraftJobClarifications({
      jobId,
      scope: PHASE_1_DEFAULT_SCOPE,
      answers,
      actor,
    })
    if (job.builder_state?.input_state === "DRAFT_READY_TO_SUBMIT") {
      after(async () => {
        try {
          await runTalonDraftJob(job.job_id, PHASE_1_DEFAULT_SCOPE)
        } catch (error) {
          console.error(`[talon-draft-job] clarification resume failed for ${job.job_id}:`, error)
        }
      })
    }
    return NextResponse.json({ ok: true, job })
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400
    const payload = (error as { payload?: unknown }).payload
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid clarification request",
        ...(payload ? { payload } : {}),
      },
      { status },
    )
  }
}

function normalizeAnswers(input: unknown): Array<{ question_id: string; answer_text: string }> {
  if (!Array.isArray(input)) return []
  return input.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const raw = item as Record<string, unknown>
    const questionId = typeof raw.question_id === "string" ? raw.question_id.trim() : ""
    const answerText = typeof raw.answer_text === "string" ? raw.answer_text.trim() : ""
    return questionId && answerText ? [{ question_id: questionId, answer_text: answerText }] : []
  })
}
