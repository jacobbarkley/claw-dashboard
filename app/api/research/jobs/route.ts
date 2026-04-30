// GET /api/research/jobs
//
// List live research-lab jobs for the default scope. Scans Upstash Redis
// for keys matching research_lab:<scope>:job:* and MGETs the values.
//
// Same honest-degradation contract as the single-job route:
//   - store returns values       → 200 { source: "store", jobs: [...] }
//   - store returns zero keys    → 200 { source: "store", jobs: [],
//                                        state: "empty" }
//   - store env vars missing     → 200 { source: "unconfigured", jobs: [] }
//   - store call fails / errors  → 200 { source: "outage", jobs: [],
//                                        error: "..." }
//
// Cold-tree historicals (data/research_lab/<scope>/jobs/*.final.json) are
// NOT yet read — those land once Codex's (5) slice ships terminal
// artifacts. Extend here when the cold tree has content.

import { promises as fs } from "fs"
import path from "path"

import { NextRequest, NextResponse } from "next/server"

import { PHASE_1_DEFAULT_SCOPE, type ResearchSleeve } from "@/lib/research-lab-contracts"
import type { JobV1 } from "@/lib/research-lab-contracts"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"

type JobListResult =
  | { source: "store"; jobs: JobV1[]; state: "populated" | "empty" }
  | { source: "unconfigured"; jobs: [] }
  | { source: "outage"; jobs: []; error: string }

interface JobDisplayEntry {
  title: string
  sleeve: ResearchSleeve | null
}

const SCOPE = PHASE_1_DEFAULT_SCOPE
const KEY_PATTERN = `research_lab:${SCOPE.user_id}:${SCOPE.account_id}:${SCOPE.strategy_group_id}:job:*`

// ─── Upstash REST helpers ───────────────────────────────────────────────
// Upstash supports Redis SCAN via POST with a JSON body: [cmd, ...args].
// Cursor-paginated; we bound to a single page at COUNT 500 because the
// Phase 1a default scope will never approach that volume. Extend to a
// real cursor loop only if it becomes an issue.

async function upstashCommand(
  url: string,
  token: string,
  command: unknown[],
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Upstash ${command[0]} ${response.status}`)
  }
  const payload = (await response.json()) as { result: unknown; error?: string }
  if (payload.error) {
    throw new Error(`Upstash ${command[0]} error: ${payload.error}`)
  }
  return payload.result
}

async function scanAllKeys(url: string, token: string, pattern: string): Promise<string[]> {
  const raw = (await upstashCommand(url, token, ["SCAN", "0", "MATCH", pattern, "COUNT", 500])) as [
    string,
    string[],
  ]
  if (!Array.isArray(raw) || raw.length !== 2) return []
  const [, keys] = raw
  return Array.isArray(keys) ? keys : []
}

async function mgetJobs(url: string, token: string, keys: string[]): Promise<JobV1[]> {
  if (keys.length === 0) return []
  const raw = (await upstashCommand(url, token, ["MGET", ...keys])) as Array<string | null>
  if (!Array.isArray(raw)) return []
  const out: JobV1[] = []
  for (const value of raw) {
    if (value == null) continue
    try {
      const parsed = JSON.parse(value) as JobV1
      if (parsed && typeof parsed === "object" && "job_id" in parsed && "state" in parsed) {
        out.push(parsed)
      }
    } catch {
      // Skip corrupted values — worker should never write non-JSON, but be
      // defensive.
    }
  }
  return out
}

async function listJobsFromStore(): Promise<JobListResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return { source: "unconfigured", jobs: [] }

  try {
    const keys = await scanAllKeys(url, token, KEY_PATTERN)
    if (keys.length === 0) return { source: "store", jobs: [], state: "empty" }
    const jobs = await mgetJobs(url, token, keys)
    // Most-recent first
    jobs.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return {
      source: "store",
      jobs,
      state: jobs.length > 0 ? "populated" : "empty",
    }
  } catch (error) {
    return {
      source: "outage",
      jobs: [],
      error: error instanceof Error ? error.message : "Unknown store error",
    }
  }
}

// ─── Cold-tree pass (forward-prepared, returns empty today) ─────────────

async function countColdTerminalJobs(): Promise<number> {
  const dir = path.join(
    process.cwd(),
    "data",
    "research_lab",
    SCOPE.user_id,
    SCOPE.account_id,
    SCOPE.strategy_group_id,
    "jobs",
  )
  try {
    const entries = await fs.readdir(dir)
    return entries.filter(e => e.endsWith(".final.json")).length
  } catch {
    return 0
  }
}

// ─── Idea-title enrichment ──────────────────────────────────────────────
//
// Job rows in the dashboard read better with a friendly label derived from
// the owning idea's title + sleeve. We do the join here (one read per
// distinct idea_id) rather than extending JobV1 — that contract belongs to
// Codex, and the join is purely view-side.

async function loadIdeaDisplayMap(jobs: JobV1[]): Promise<Record<string, JobDisplayEntry>> {
  const ideaIds = new Set<string>()
  for (const job of jobs) {
    if (typeof job.idea_id === "string" && job.idea_id) ideaIds.add(job.idea_id)
  }
  if (ideaIds.size === 0) return {}
  const entries = await Promise.all(
    [...ideaIds].map(async ideaId => {
      const idea = await loadIdeaById(ideaId, SCOPE)
      if (!idea) return [ideaId, null] as const
      return [ideaId, { title: idea.title, sleeve: idea.sleeve }] as const
    }),
  )
  const out: Record<string, JobDisplayEntry> = {}
  for (const [ideaId, entry] of entries) if (entry) out[ideaId] = entry
  return out
}

// ─── Handler ────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const [store, coldTerminalCount] = await Promise.all([
    listJobsFromStore(),
    countColdTerminalJobs(),
  ])

  const ideaDisplayMap =
    store.source === "store" ? await loadIdeaDisplayMap(store.jobs) : {}

  return NextResponse.json({
    ok: true,
    scope: SCOPE,
    ...store,
    idea_display: ideaDisplayMap,
    cold_terminal_count: coldTerminalCount,
    polled_at: new Date().toISOString(),
  })
}
