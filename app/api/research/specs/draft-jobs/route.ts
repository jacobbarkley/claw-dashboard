// POST /api/research/specs/draft-jobs
//
// Durable Talon Draft v2 entrypoint. Creates or reuses an active scoped
// talon_draft_job.v1 in Upstash, then schedules the worker with Next/Vercel
// after(). The UI polls /draft-jobs/[job_id].

import { after, NextRequest, NextResponse } from "next/server"

import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import {
  createOrReuseTalonDraftJob,
  runTalonDraftJob,
} from "@/lib/research-lab-talon-draft-jobs.server"

import {
  requiredString,
  safePathSegment,
} from "../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

interface DraftJobStartBody {
  idea_id?: unknown
  scope?: unknown
  intent_message?: unknown
  builder_state?: unknown
}

export async function POST(req: NextRequest) {
  let body: DraftJobStartBody
  try {
    body = (await req.json()) as DraftJobStartBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  try {
    const scope = PHASE_1_DEFAULT_SCOPE
    const ideaId = safePathSegment(requiredString(body.idea_id, "idea_id"), "idea_id")
    const intentMessage =
      typeof body.intent_message === "string" && body.intent_message.trim()
        ? body.intent_message.trim()
        : null

    const { job, reused } = await createOrReuseTalonDraftJob({
      scope,
      ideaId,
      intentMessage,
      builderStateInput: body.builder_state,
    })

    if (!reused) {
      after(async () => {
        try {
          await runTalonDraftJob(job.job_id, scope)
        } catch (error) {
          console.error(`[talon-draft-job] background run failed for ${job.job_id}:`, error)
        }
      })
    }

    return NextResponse.json(
      {
        ok: true,
        reused,
        job,
        job_id: job.job_id,
        poll_url: `/api/research/specs/draft-jobs/${encodeURIComponent(job.job_id)}`,
      },
      { status: reused ? 200 : 202 },
    )
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400
    const payload = (error as { payload?: unknown }).payload
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid Talon draft job request",
        ...(payload ? { payload } : {}),
      },
      { status },
    )
  }
}
