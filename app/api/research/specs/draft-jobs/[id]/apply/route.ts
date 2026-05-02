// POST /api/research/specs/draft-jobs/[id]/apply
//
// The Apply boundary for Unified Spec Builder. This is the first point where
// a Talon proposal becomes a persisted StrategySpec and mutates the idea's
// strategy_ref. No model call happens here.

import { NextRequest, NextResponse } from "next/server"

import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { applyTalonDraftJob } from "@/lib/research-lab-talon-draft-jobs.server"

import {
  requiredString,
  safePathSegment,
} from "../../../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ApplyBody {
  actor?: unknown
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let body: ApplyBody
  try {
    body = (await req.json()) as ApplyBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  try {
    const { id } = await ctx.params
    const jobId = safePathSegment(requiredString(decodeURIComponent(id), "job_id"), "job_id")
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "jacob"
    const result = await applyTalonDraftJob({
      jobId,
      scope: PHASE_1_DEFAULT_SCOPE,
      appliedBy: actor,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400
    const payload = (error as { payload?: unknown }).payload
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid apply request",
        ...(payload ? { payload } : {}),
      },
      { status },
    )
  }
}
