// GET /api/research/lab-desk
//
// Pre-classified payload for the Lab Desk surface. Three rails — ideas
// where the operator owns the next move ("needs you"), jobs in flight,
// and jobs that finished in the last 7 days. Resolved server-side so the
// client just renders.

import { NextResponse } from "next/server"

import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import type {
  IdeaArtifact,
  JobState,
  JobV1,
  ResearchSleeve,
} from "@/lib/research-lab-contracts"
import { loadIdeas } from "@/lib/research-lab-ideas.server"
import { loadCampaignsIndex } from "@/lib/vires-campaigns.server"
import { deriveIdeaStage, type IdeaStage } from "@/lib/research-lab-stage"

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
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

interface NeedsYouItem {
  idea_id: string
  title: string
  sleeve: ResearchSleeve
  stage: IdeaStage
  eyebrow: string
}

interface JobRail {
  job_id: string
  idea_id: string | null
  title: string
  sleeve: ResearchSleeve | null
  state: JobState
  created_at: string | null
  finished_at: string | null
}

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

async function loadJobs(): Promise<JobV1[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return []
  try {
    const raw = (await upstash(url, token, ["SCAN", "0", "MATCH", JOB_KEY_PATTERN, "COUNT", 500])) as [
      string,
      string[],
    ]
    if (!Array.isArray(raw) || raw.length !== 2) return []
    const keys = Array.isArray(raw[1]) ? raw[1] : []
    if (keys.length === 0) return []
    const values = (await upstash(url, token, ["MGET", ...keys])) as Array<string | null>
    if (!Array.isArray(values)) return []
    const jobs: JobV1[] = []
    for (const value of values) {
      if (value == null) continue
      try {
        const parsed = JSON.parse(value) as JobV1
        if (parsed && typeof parsed === "object" && "job_id" in parsed && "state" in parsed) {
          jobs.push(parsed)
        }
      } catch {
        // skip
      }
    }
    return jobs
  } catch {
    return []
  }
}

function eyebrowForNeedsYou(stage: IdeaStage, idea: IdeaArtifact): string | null {
  if (idea.code_pending) return "Captured · awaiting strategy code"
  if (stage === "thesis") return "Thesis captured · ready to draft a spec"
  if (stage === "spec")  return "Spec drafted · keep iterating or submit for approval"
  if (stage === "build") return "Spec approved · ready to run"
  return null
}

export async function GET() {
  const [ideas, campaignsIndex, jobs] = await Promise.all([
    loadIdeas(SCOPE),
    loadCampaignsIndex(),
    loadJobs(),
  ])

  const labCampaignIds = new Set(
    (campaignsIndex?.registry?.campaigns ?? [])
      .map(c => c.campaign_id)
      .filter((id): id is string => typeof id === "string" && id.startsWith("lab_")),
  )

  const liveIdeas = ideas.filter(i => i.status !== "RETIRED")
  const ideasWithStage = liveIdeas.map(idea => ({
    idea,
    stage: deriveIdeaStage(idea, { hasCampaign: labCampaignIds.has(`lab_${idea.idea_id}`) }),
  }))

  const ideaTitleById: Record<string, { title: string; sleeve: ResearchSleeve }> = {}
  for (const { idea } of ideasWithStage) {
    ideaTitleById[idea.idea_id] = { title: idea.title, sleeve: idea.sleeve }
  }

  // ─── Needs you ────────────────────────────────────────────────────────
  const needsYou: NeedsYouItem[] = []
  for (const { idea, stage } of ideasWithStage) {
    const eyebrow = eyebrowForNeedsYou(stage, idea)
    if (!eyebrow) continue
    needsYou.push({
      idea_id: idea.idea_id,
      title: idea.title,
      sleeve: idea.sleeve,
      stage,
      eyebrow,
    })
  }
  needsYou.sort((a, b) => a.title.localeCompare(b.title))

  // ─── Jobs (in flight + recently landed) ───────────────────────────────
  const inFlight: JobRail[] = []
  const recent: JobRail[] = []
  const cutoff = Date.now() - RECENT_WINDOW_MS

  for (const job of jobs) {
    const display = job.idea_id ? ideaTitleById[job.idea_id] : undefined
    const rail: JobRail = {
      job_id: job.job_id,
      idea_id: typeof job.idea_id === "string" ? job.idea_id : null,
      title: display?.title ?? job.idea_id ?? job.job_id,
      sleeve: display?.sleeve ?? null,
      state: job.state,
      created_at: typeof job.created_at === "string" ? job.created_at : null,
      finished_at: typeof job.finished_at === "string" ? job.finished_at : null,
    }
    if (NON_TERMINAL.has(job.state)) {
      inFlight.push(rail)
    } else {
      const finished = rail.finished_at ? Date.parse(rail.finished_at) : NaN
      if (Number.isFinite(finished) && finished >= cutoff) recent.push(rail)
    }
  }
  inFlight.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
  recent.sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? ""))

  return NextResponse.json(
    {
      ok: true,
      needs_you: needsYou,
      in_flight: inFlight,
      recently_landed: recent,
      idea_count: liveIdeas.length,
      job_count: jobs.length,
      polled_at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
