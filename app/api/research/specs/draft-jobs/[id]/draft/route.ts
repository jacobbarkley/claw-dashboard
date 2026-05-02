// PATCH /api/research/specs/draft-jobs/[id]/draft
//
// Deterministic proposal-edit endpoint. This does not call Talon; it mutates
// builder_state.current_draft, recomputes validity/readiness from the edited
// draft, and leaves actual spec persistence to POST /apply.

import { NextRequest, NextResponse } from "next/server"

import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { patchTalonDraftJobDraft } from "@/lib/research-lab-talon-draft-jobs.server"

import {
  requiredString,
  safePathSegment,
} from "../../../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface DraftPatchBody {
  patch?: unknown
  actor?: unknown
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let body: DraftPatchBody
  try {
    body = (await req.json()) as DraftPatchBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  try {
    const { id } = await ctx.params
    const jobId = safePathSegment(requiredString(decodeURIComponent(id), "job_id"), "job_id")
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "jacob"
    const job = await patchTalonDraftJobDraft({
      jobId,
      scope: PHASE_1_DEFAULT_SCOPE,
      patch: body.patch,
      actor,
    })
    return NextResponse.json({ ok: true, job })
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400
    const payload = (error as { payload?: unknown }).payload
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid draft patch request",
        ...(payload ? { payload } : {}),
      },
      { status },
    )
  }
}
