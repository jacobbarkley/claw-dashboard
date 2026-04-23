// POST /api/research/requests
//
// Submit channel for the Research Lab. Implements the Phase 0 contract in
// trading-bot/docs/architecture-rebuild/33-research-lab-contracts.md:
//
//   - Dashboard generates a ULID for both request_id and job_id
//   - Builds campaign_request.v1 JSON
//   - Writes the governed request file into data/research_lab/<scope>/
//     requests/inbox/ (via GitHub API in prod; local-filesystem fallback
//     in dev)
//   - Returns {commit_sha?, request, job_pending} — job_pending.v1 is the
//     synthesized Option-B receipt the UI polls until the worker
//     materializes the real job.v1 row in SQLite.
//
// The worker on the trading-bot host watches the inbox, calls
// `openclaw_core.cli.research_lab enqueue-request --git-commit-sha X
// --git-relpath Y`, which rewrites the hot job.v1 projection and
// (eventually) publishes to the managed store for live read.

import { randomBytes } from "crypto"
import { promises as fs } from "fs"
import path from "path"

import { NextRequest, NextResponse } from "next/server"

import type {
  CampaignRequestV1,
  ExecutionIntent,
  JobPendingV1,
  Priority,
  ScopeTriple,
  Submitter,
} from "@/lib/research-lab-contracts"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"

// ─── ULID-ish id generator ──────────────────────────────────────────────
// Crockford base32 timestamp (10 chars) + random (16 chars) = 26 chars.
// Not RFC-strict ULID but lexically sortable by timestamp, sufficient for
// the identifier contract. Prefixed per-kind per Codex's examples.

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function ulid(): string {
  let ts = Date.now()
  let tsStr = ""
  for (let i = 0; i < 10; i++) {
    tsStr = CROCKFORD[ts % 32] + tsStr
    ts = Math.floor(ts / 32)
  }
  const rand = randomBytes(10)
  let randStr = ""
  for (let i = 0; i < 16; i++) {
    randStr += CROCKFORD[rand[i % rand.length] % 32]
  }
  return tsStr + randStr
}

function idWithPrefix(prefix: string): string {
  return `${prefix}_${ulid()}`
}

// ─── Input normalization ────────────────────────────────────────────────

interface SubmitBody {
  idea_id?: unknown
  preset_id?: unknown
  param_sweep?: unknown
  actor?: unknown
  submitted_by?: unknown
  execution_intent?: unknown
  priority?: unknown
  notes?: unknown
  scope?: unknown
  request_id?: unknown
  job_id?: unknown
}

const VALID_SUBMITTERS: Submitter[] = [
  "USER_ONDEMAND",
  "AUTOPILOT_NIGHTLY",
  "API",
  "AI_TRIAGE",
]

const VALID_INTENTS: ExecutionIntent[] = ["FULL_CAMPAIGN", "DRY_RUN"]
const VALID_PRIORITIES: Priority[] = ["LOW", "NORMAL", "HIGH"]

function normalizeScope(input: unknown): ScopeTriple {
  if (!input || typeof input !== "object") return { ...PHASE_1_DEFAULT_SCOPE }
  const s = input as Partial<Record<keyof ScopeTriple, unknown>>
  return {
    user_id: typeof s.user_id === "string" ? s.user_id : PHASE_1_DEFAULT_SCOPE.user_id,
    account_id:
      typeof s.account_id === "string" ? s.account_id : PHASE_1_DEFAULT_SCOPE.account_id,
    strategy_group_id:
      typeof s.strategy_group_id === "string"
        ? s.strategy_group_id
        : PHASE_1_DEFAULT_SCOPE.strategy_group_id,
  }
}

function normalizeSweep(input: unknown): Record<string, unknown[]> | null {
  if (!input || typeof input !== "object") return null
  const out: Record<string, unknown[]> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(v) || v.length === 0) return null
    out[k] = v
  }
  return Object.keys(out).length ? out : null
}

function requestRelpath(scope: ScopeTriple, request: CampaignRequestV1): string {
  // Lowercased to match the dashboard's other git-tracked paths; worker
  // watches this prefix via a git-fetch poll every ~15s.
  const ts = request.submitted_at.replace(/[:.]/g, "-")
  const filename = `${ts}-${request.request_id}.json`
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/requests/inbox/${filename}`
}

// ─── Persistence ────────────────────────────────────────────────────────

async function persistLocal(
  request: CampaignRequestV1,
  relpath: string,
): Promise<{ mode: "local"; file: string; commit_sha: null }> {
  const absolutePath = path.join(process.cwd(), relpath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, JSON.stringify(request, null, 2))
  return { mode: "local", file: relpath, commit_sha: null }
}

async function persistGithub(
  request: CampaignRequestV1,
  relpath: string,
  token: string,
): Promise<{ mode: "github"; file: string; commit_sha: string }> {
  const content = Buffer.from(JSON.stringify(request, null, 2)).toString("base64")
  const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${relpath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      message: `research lab: submit campaign ${request.request_id}`,
      content,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub API ${response.status}: ${detail}`)
  }

  const payload = (await response.json()) as {
    commit?: { sha?: string }
    content?: { sha?: string }
  }
  const commit_sha = payload.commit?.sha ?? payload.content?.sha ?? ""
  return { mode: "github", file: relpath, commit_sha }
}

// ─── Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: SubmitBody
  try {
    body = (await req.json()) as SubmitBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  // Required inputs
  const ideaId = typeof body.idea_id === "string" ? body.idea_id.trim() : ""
  const presetId = typeof body.preset_id === "string" ? body.preset_id.trim() : ""
  if (!ideaId) return NextResponse.json({ error: "idea_id required" }, { status: 400 })
  if (!presetId) return NextResponse.json({ error: "preset_id required" }, { status: 400 })

  const sweep = normalizeSweep(body.param_sweep)
  if (!sweep) {
    return NextResponse.json(
      { error: "param_sweep must be an object with at least one non-empty array value" },
      { status: 400 },
    )
  }

  // Optional fields with sensible defaults
  const scope = normalizeScope(body.scope)
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "jacob"
  const submittedBy: Submitter = VALID_SUBMITTERS.includes(body.submitted_by as Submitter)
    ? (body.submitted_by as Submitter)
    : "USER_ONDEMAND"
  const executionIntent: ExecutionIntent = VALID_INTENTS.includes(body.execution_intent as ExecutionIntent)
    ? (body.execution_intent as ExecutionIntent)
    : "FULL_CAMPAIGN"
  const priority: Priority = VALID_PRIORITIES.includes(body.priority as Priority)
    ? (body.priority as Priority)
    : "NORMAL"
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null
  const requestId =
    typeof body.request_id === "string" && body.request_id.trim()
      ? body.request_id.trim()
      : idWithPrefix("req")
  const jobId =
    typeof body.job_id === "string" && body.job_id.trim()
      ? body.job_id.trim()
      : idWithPrefix("job")

  const submittedAt = new Date().toISOString()

  const request: CampaignRequestV1 = {
    schema_version: "research_lab.campaign_request.v1",
    request_id: requestId,
    job_id: jobId,
    ...scope,
    idea_id: ideaId,
    actor,
    submitted_at: submittedAt,
    submitted_by: submittedBy,
    preset_id: presetId,
    param_sweep: sweep,
    execution_intent: executionIntent,
    priority,
    notes,
  }

  const relpath = requestRelpath(scope, request)

  let persisted: Awaited<ReturnType<typeof persistLocal>> | Awaited<ReturnType<typeof persistGithub>>
  try {
    const token = process.env.GITHUB_TOKEN
    persisted = token ? await persistGithub(request, relpath, token) : await persistLocal(request, relpath)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json({ error: `Failed to persist request: ${detail}` }, { status: 500 })
  }

  // Synthesize the job_pending.v1 receipt. Not persisted anywhere durable;
  // dashboard renders this until the worker materializes the real job.v1.
  const jobPending: JobPendingV1 = {
    schema_version: "research_lab.job_pending.v1",
    request_id: requestId,
    job_id: jobId,
    ...scope,
    submitted_at: submittedAt,
    submitted_by: submittedBy,
    state: "PENDING_ENQUEUE",
    summary:
      persisted.mode === "github"
        ? `Governed request committed to dashboard repo. The worker will pick it up on the next git-fetch poll (~15-30s) and materialize a real job row.`
        : `Governed request written locally (dev mode; GITHUB_TOKEN not configured). In production, the request would commit to the dashboard repo and the worker would pick it up on its next poll.`,
  }

  return NextResponse.json({
    ok: true,
    mode: persisted.mode,
    file: persisted.file,
    commit_sha: persisted.commit_sha,
    request,
    job_pending: jobPending,
  })
}
