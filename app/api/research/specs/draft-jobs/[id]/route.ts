// GET /api/research/specs/draft-jobs/[id]
// DELETE /api/research/specs/draft-jobs/[id]
//
// Scoped live-state channel for Talon Draft v2. Scope mismatch returns 404
// so future multi-user deployments do not leak job existence.

import { NextRequest, NextResponse } from "next/server"

import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import {
  cancelTalonDraftJob,
  readTalonDraftJob,
} from "@/lib/research-lab-talon-draft-jobs.server"

import {
  requiredString,
  safePathSegment,
} from "../../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function scopeFromRequest(req: NextRequest) {
  const url = new URL(req.url)
  // Single-operator v1: scope is server-owned, not caller-owned. Query params
  // are accepted only when they match the default scope, preserving the future
  // poll URL shape without trusting it for tenancy.
  if (
    (url.searchParams.get("user_id") && url.searchParams.get("user_id") !== PHASE_1_DEFAULT_SCOPE.user_id) ||
    (url.searchParams.get("account_id") && url.searchParams.get("account_id") !== PHASE_1_DEFAULT_SCOPE.account_id) ||
    (url.searchParams.get("strategy_group_id") && url.searchParams.get("strategy_group_id") !== PHASE_1_DEFAULT_SCOPE.strategy_group_id)
  ) {
    const error = new Error("Talon draft job not found")
    throw Object.assign(error, { status: 404 })
  }
  return PHASE_1_DEFAULT_SCOPE
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    const jobId = safePathSegment(requiredString(decodeURIComponent(id), "job_id"), "job_id")
    const scope = scopeFromRequest(req)
    const job = await readTalonDraftJob(jobId, scope)
    if (!job) {
      return NextResponse.json({ error: "Talon draft job not found" }, { status: 404 })
    }
    return NextResponse.json(
      { ok: true, job, polled_at: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Talon draft job request" },
      { status },
    )
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    const jobId = safePathSegment(requiredString(decodeURIComponent(id), "job_id"), "job_id")
    const scope = scopeFromRequest(req)
    const cancelledBy = req.headers.get("x-operator-id") ?? "jacob"
    const job = await cancelTalonDraftJob(jobId, scope, cancelledBy)
    return NextResponse.json({ ok: true, job })
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400
    const payload = (error as { payload?: unknown }).payload
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid Talon draft job cancellation",
        ...(payload ? { payload } : {}),
      },
      { status },
    )
  }
}
