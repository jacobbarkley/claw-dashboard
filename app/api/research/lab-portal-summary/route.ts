// GET /api/research/lab-portal-summary
//
// Counts feeding the bench-home Lab portal banner. Three numbers:
//   - needs_you: ideas where the operator owns the next move
//   - in_flight: jobs currently QUEUED/COMPILING/RUNNING/POST_PROCESSING/RETRY_QUEUED
//   - idea_count: total non-retired ideas
//
// Server-resolved so the portal can render glanceable counts without leaking
// the full idea or job lists to the client.

import { NextResponse } from "next/server"

import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import type { JobState, JobV1 } from "@/lib/research-lab-contracts"
import { loadIdeas } from "@/lib/research-lab-ideas.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SCOPE = PHASE_1_DEFAULT_SCOPE
const JOB_KEY_PATTERN = `research_lab:${SCOPE.user_id}:${SCOPE.account_id}:${SCOPE.strategy_group_id}:job:*`
const NON_TERMINAL: ReadonlySet<JobState> = new Set([
  "QUEUED",
  "COMPILING",
  "RUNNING",
  "POST_PROCESSING",
  "RETRY_QUEUED",
])

async function upstash(url: string, token: string, command: unknown[]): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Upstash ${command[0]} ${response.status}`)
  const payload = (await response.json()) as { result: unknown; error?: string }
  if (payload.error) throw new Error(`Upstash ${command[0]} error: ${payload.error}`)
  return payload.result
}

async function countInFlightJobs(): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return 0
  try {
    const raw = (await upstash(url, token, ["SCAN", "0", "MATCH", JOB_KEY_PATTERN, "COUNT", 500])) as [
      string,
      string[],
    ]
    if (!Array.isArray(raw) || raw.length !== 2) return 0
    const keys = Array.isArray(raw[1]) ? raw[1] : []
    if (keys.length === 0) return 0
    const values = (await upstash(url, token, ["MGET", ...keys])) as Array<string | null>
    if (!Array.isArray(values)) return 0
    let inFlight = 0
    for (const value of values) {
      if (value == null) continue
      try {
        const parsed = JSON.parse(value) as JobV1
        if (parsed && typeof parsed === "object" && NON_TERMINAL.has(parsed.state)) {
          inFlight += 1
        }
      } catch {
        // Skip corrupted values; worker should never write non-JSON.
      }
    }
    return inFlight
  } catch {
    // Outage: treat as zero in flight rather than blocking the portal.
    return 0
  }
}

export async function GET() {
  const [ideas, inFlight] = await Promise.all([loadIdeas(SCOPE), countInFlightJobs()])
  // "Needs you" v1 heuristic: ideas captured but not yet moved off DRAFT,
  // and not waiting on Codex to write code. Refine as the spec/build state
  // crawl lands.
  const liveIdeas = ideas.filter(i => i.status !== "RETIRED")
  const needsYou = liveIdeas.filter(i => i.status === "DRAFT" && !i.code_pending).length
  return NextResponse.json(
    {
      ok: true,
      needs_you: needsYou,
      in_flight: inFlight,
      idea_count: liveIdeas.length,
      polled_at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
