// POST /api/research/nominations
//
// Submit channel for a nomination.v1 request — the governed handoff from
// a Research Lab candidate into the strategy bank. Mirrors the campaign-
// request route shape: builds the artifact, commits it to the dashboard
// repo inbox via the GitHub App token (or falls back to local FS), and
// returns the nomination artifact + commit SHA.
//
// The worker's nomination adapter is the only path that mutates the
// strategy bank — this route just lands the request; the adapter runs it
// at its next sync. Until the adapter ships, the file sits in the inbox
// unprocessed and the UI reports "recorded, awaiting adapter."

import { randomBytes } from "crypto"
import { promises as fs } from "fs"
import path from "path"

import { NextRequest, NextResponse } from "next/server"

import type {
  NominationV1,
  ResearchSleeve,
  ScopeTriple,
  Submitter,
} from "@/lib/research-lab-contracts"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { loadCandidateById } from "@/lib/research-lab-cold.server"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"

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

interface SubmitBody {
  candidate_id?: unknown
  result_id?: unknown
  idea_id?: unknown
  sleeve?: unknown
  strategy_id?: unknown
  actor?: unknown
  submitted_by?: unknown
  user_id?: unknown
  account_id?: unknown
  strategy_group_id?: unknown
  request_id?: unknown
  nomination_id?: unknown
}

const VALID_SUBMITTERS: Submitter[] = [
  "USER_ONDEMAND",
  "AUTOPILOT_NIGHTLY",
  "API",
  "AI_TRIAGE",
]

const VALID_SLEEVES: ResearchSleeve[] = ["STOCKS", "CRYPTO", "OPTIONS"]

function normalizeScope(input: SubmitBody): ScopeTriple {
  return {
    user_id: typeof input.user_id === "string" ? input.user_id : PHASE_1_DEFAULT_SCOPE.user_id,
    account_id:
      typeof input.account_id === "string" ? input.account_id : PHASE_1_DEFAULT_SCOPE.account_id,
    strategy_group_id:
      typeof input.strategy_group_id === "string"
        ? input.strategy_group_id
        : PHASE_1_DEFAULT_SCOPE.strategy_group_id,
  }
}

function requestRelpath(scope: ScopeTriple, nomination: NominationV1): string {
  const ts = nomination.submitted_at.replace(/[:.]/g, "-")
  const filename = `${ts}-${nomination.request_id}.nomination.json`
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/requests/inbox/${filename}`
}

async function persistLocal(
  nomination: NominationV1,
  relpath: string,
): Promise<{ mode: "local"; file: string; commit_sha: null }> {
  const absolutePath = path.join(process.cwd(), relpath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, JSON.stringify(nomination, null, 2))
  return { mode: "local", file: relpath, commit_sha: null }
}

async function persistGithub(
  nomination: NominationV1,
  relpath: string,
  token: string,
): Promise<{ mode: "github"; file: string; commit_sha: string }> {
  const content = Buffer.from(JSON.stringify(nomination, null, 2)).toString("base64")
  const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${relpath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      message: `research lab: nominate ${nomination.candidate_id}`,
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

export async function POST(req: NextRequest) {
  let body: SubmitBody
  try {
    body = (await req.json()) as SubmitBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  const candidateId = typeof body.candidate_id === "string" ? body.candidate_id.trim() : ""
  if (!candidateId) return NextResponse.json({ error: "candidate_id required" }, { status: 400 })

  const scope = normalizeScope(body)

  // Derive result_id / idea_id / sleeve / strategy_id from the candidate
  // artifact when the caller omits them. The campaign-detail nominate
  // button only has candidate_id in hand; the Lab job-detail flow already
  // passes the full payload and works unchanged.
  let resultId = typeof body.result_id === "string" ? body.result_id.trim() : ""
  let ideaId = typeof body.idea_id === "string" ? body.idea_id.trim() : ""
  let strategyId = typeof body.strategy_id === "string" ? body.strategy_id.trim() : ""
  const sleeveIn = typeof body.sleeve === "string" ? body.sleeve.trim().toUpperCase() : ""
  let sleeve: ResearchSleeve | null = VALID_SLEEVES.includes(sleeveIn as ResearchSleeve)
    ? (sleeveIn as ResearchSleeve)
    : null

  if (!resultId || !ideaId || !strategyId || !sleeve) {
    const candidate = await loadCandidateById(candidateId, scope)
    if (!candidate) {
      return NextResponse.json(
        {
          error: `Candidate ${candidateId} not found in scope; pass result_id/idea_id/sleeve/strategy_id explicitly.`,
        },
        { status: 404 },
      )
    }
    resultId = resultId || candidate.result_id
    ideaId = ideaId || candidate.idea_id
    strategyId = strategyId || candidate.strategy_id
    if (!sleeve) {
      sleeve = VALID_SLEEVES.includes(candidate.sleeve as ResearchSleeve)
        ? (candidate.sleeve as ResearchSleeve)
        : null
    }
  }

  if (!resultId) return NextResponse.json({ error: "result_id required" }, { status: 400 })
  if (!ideaId) return NextResponse.json({ error: "idea_id required" }, { status: 400 })
  if (!strategyId) return NextResponse.json({ error: "strategy_id required" }, { status: 400 })
  if (!sleeve) return NextResponse.json({ error: "sleeve must be STOCKS | CRYPTO | OPTIONS" }, { status: 400 })
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "jacob"
  const submittedBy: Submitter = VALID_SUBMITTERS.includes(body.submitted_by as Submitter)
    ? (body.submitted_by as Submitter)
    : "USER_ONDEMAND"
  const requestId =
    typeof body.request_id === "string" && body.request_id.trim()
      ? body.request_id.trim()
      : `req_${ulid()}`
  const nominationId =
    typeof body.nomination_id === "string" && body.nomination_id.trim()
      ? body.nomination_id.trim()
      : `nom_${ulid()}`

  const submittedAt = new Date().toISOString()

  // Identity resolution is determined by the worker-side adapter when it
  // reads the candidate + strategy bank state. We stub an initial shape
  // here with mode "NEW_RECORD"; the adapter may overwrite based on
  // whether the candidate's passport_role_id already has a holder.
  const nomination: NominationV1 = {
    schema_version: "research_lab.nomination.v1",
    nomination_id: nominationId,
    request_id: requestId,
    candidate_id: candidateId,
    result_id: resultId,
    ...scope,
    actor,
    submitted_at: submittedAt,
    submitted_by: submittedBy,
    state: "PENDING",
    identity_resolution: {
      mode: "NEW_RECORD",
      replaces_record_id: null,
      resolution_rule: "adapter_decides",
    },
    materialized_bank_record: {},
    promotion_event_id: null,
  }

  const relpath = requestRelpath(scope, nomination)

  let persisted: Awaited<ReturnType<typeof persistLocal>> | Awaited<ReturnType<typeof persistGithub>>
  try {
    const token = process.env.GITHUB_TOKEN
    persisted = token ? await persistGithub(nomination, relpath, token) : await persistLocal(nomination, relpath)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json({ error: `Failed to persist nomination: ${detail}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mode: persisted.mode,
    file: persisted.file,
    commit_sha: persisted.commit_sha,
    nomination,
  })
}
