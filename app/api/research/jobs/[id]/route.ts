// GET /api/research/jobs/[id]
//
// Live-read channel for the Research Lab. Reads a single job.v1 snapshot
// from the managed store (Upstash Redis REST). Honest degradation:
//
//   - store returns a real value  → 200 { job: job.v1, source: "store" }
//   - store returns null (no key) → 200 { job: null, source: "store",
//                                         state: "not_materialized" }
//   - store env vars missing      → 200 { job: null, source: "unconfigured" }
//   - store call fails / errors   → 200 { job: null, source: "outage",
//                                         error: "..." }
//
// We never 500 on store issues — the UI needs a deterministic shape to
// render a graceful "live progress unavailable" state. Actual 4xx/5xx
// are reserved for protocol bugs (bad job_id shape, etc.).
//
// Key format matches Phase 0 contracts:
//   research_lab:<user>:<account>:<group>:job:<job_id>

import { NextRequest, NextResponse } from "next/server"

import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import type { JobV1 } from "@/lib/research-lab-contracts"

type StoreReadResult =
  | { source: "store"; job: JobV1; state: "materialized" }
  | { source: "store"; job: null; state: "not_materialized" }
  | { source: "unconfigured"; job: null }
  | { source: "outage"; job: null; error: string }

function storeKey(jobId: string): string {
  const { user_id, account_id, strategy_group_id } = PHASE_1_DEFAULT_SCOPE
  return `research_lab:${user_id}:${account_id}:${strategy_group_id}:job:${jobId}`
}

async function readJobFromStore(jobId: string): Promise<StoreReadResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    return { source: "unconfigured", job: null }
  }
  const key = storeKey(jobId)
  try {
    const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!response.ok) {
      return {
        source: "outage",
        job: null,
        error: `Upstash GET ${response.status}`,
      }
    }
    const payload = (await response.json()) as { result: string | null }
    if (payload.result == null) {
      return { source: "store", job: null, state: "not_materialized" }
    }
    try {
      const job = JSON.parse(payload.result) as JobV1
      return { source: "store", job, state: "materialized" }
    } catch {
      return {
        source: "outage",
        job: null,
        error: "Stored value is not valid JSON",
      }
    }
  } catch (error) {
    return {
      source: "outage",
      job: null,
      error: error instanceof Error ? error.message : "Unknown store error",
    }
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const jobId = decodeURIComponent(id).trim()
  if (!jobId) {
    return NextResponse.json({ error: "job id required" }, { status: 400 })
  }
  // Basic shape guard — prevent obvious protocol abuse. Real validation
  // happens worker-side.
  if (!/^[A-Za-z0-9_:-]{1,128}$/.test(jobId)) {
    return NextResponse.json({ error: "job id has invalid shape" }, { status: 400 })
  }

  const result = await readJobFromStore(jobId)
  return NextResponse.json({
    ok: true,
    job_id: jobId,
    ...result,
    // ISO ts so the UI can show "last polled at …" if desired
    polled_at: new Date().toISOString(),
  })
}
