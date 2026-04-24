// POST /api/research/ideas
//
// Create a new idea.v1. Commits the YAML file to the dashboard repo under
// data/research_lab/<scope>/ideas/<idea_id>.yaml so the trading-bot
// worker can read it via git history on its rollup-producer sync.
//
// Guardrails (per spec §12 + Codex's idea-factory notes):
//   - strategy_id must already exist — validated against the preset index
//     so operators can't hand-author unsupported strategies.
//   - promotion_target is optional here; the campaign detail page's
//     "Assign promotion slot" action is the alternative assignment path.
//   - The route only persists the artifact. No auto-submit of jobs.
//
// Local-FS fallback kicks in when GITHUB_TOKEN isn't set (dev path).

import { randomBytes } from "crypto"
import { promises as fs } from "fs"
import path from "path"

import { NextRequest, NextResponse } from "next/server"
import yaml from "js-yaml"

import type {
  IdeaSource,
  IdeaStatus,
  IdeaV1,
  ResearchSleeve,
  ScopeTriple,
} from "@/lib/research-lab-contracts"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"

// ─── ULID-ish id generator (same shape as campaign-request route) ──────

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

// ─── Input normalization ────────────────────────────────────────────────

interface SubmitBody {
  idea_id?: unknown
  title?: unknown
  thesis?: unknown
  sleeve?: unknown
  strategy_id?: unknown
  strategy_family?: unknown
  status?: unknown
  source?: unknown
  tags?: unknown
  params?: unknown
  promote_to_campaign?: unknown
  promotion_target?: unknown
  scope?: unknown
  actor?: unknown
}

const VALID_SLEEVES: ResearchSleeve[] = ["STOCKS", "CRYPTO", "OPTIONS"]
const VALID_STATUSES: IdeaStatus[] = ["DRAFT", "READY", "QUEUED", "ACTIVE", "SHELVED", "RETIRED"]
const VALID_SOURCES: IdeaSource[] = ["CONVERSATION", "MANUAL", "IMPORTED"]

function normalizeScope(input: unknown): ScopeTriple {
  if (!input || typeof input !== "object") return { ...PHASE_1_DEFAULT_SCOPE }
  const s = input as Partial<Record<keyof ScopeTriple, unknown>>
  return {
    user_id: typeof s.user_id === "string" ? s.user_id : PHASE_1_DEFAULT_SCOPE.user_id,
    account_id: typeof s.account_id === "string" ? s.account_id : PHASE_1_DEFAULT_SCOPE.account_id,
    strategy_group_id:
      typeof s.strategy_group_id === "string"
        ? s.strategy_group_id
        : PHASE_1_DEFAULT_SCOPE.strategy_group_id,
  }
}

function normalizeTags(input: unknown): string[] | undefined {
  if (Array.isArray(input)) {
    const clean = input
      .filter((t): t is string => typeof t === "string")
      .map(t => t.trim())
      .filter(t => t.length > 0)
    return clean.length > 0 ? clean : undefined
  }
  return undefined
}

function normalizeParams(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {}
  return input as Record<string, unknown>
}

// ─── Preset registry validation (strategy_id must exist) ────────────────

interface PresetIndexEntry {
  strategy_id?: string
  strategy_family?: string
  sleeve?: string
}

async function loadRegisteredStrategies(): Promise<Set<string>> {
  try {
    const indexPath = path.join(process.cwd(), "data", "research_lab", "presets", "_index.json")
    const raw = await fs.readFile(indexPath, "utf-8")
    const parsed = JSON.parse(raw) as { presets?: PresetIndexEntry[] }
    const ids = new Set<string>()
    for (const p of parsed.presets ?? []) {
      if (p.strategy_id) ids.add(p.strategy_id)
    }
    return ids
  } catch {
    return new Set<string>()
  }
}

// ─── Persistence ────────────────────────────────────────────────────────

function ideaRelpath(scope: ScopeTriple, ideaId: string): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/ideas/${ideaId}.yaml`
}

async function persistLocal(
  idea: IdeaV1,
  relpath: string,
): Promise<{ mode: "local"; file: string; commit_sha: null }> {
  const absolutePath = path.join(process.cwd(), relpath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, yaml.dump(idea, { noRefs: true, lineWidth: 100 }))
  return { mode: "local", file: relpath, commit_sha: null }
}

async function persistGithub(
  idea: IdeaV1,
  relpath: string,
  token: string,
): Promise<{ mode: "github"; file: string; commit_sha: string }> {
  const yamlText = yaml.dump(idea, { noRefs: true, lineWidth: 100 })
  const content = Buffer.from(yamlText, "utf-8").toString("base64")
  const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${relpath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      message: `research lab: save idea ${idea.idea_id}`,
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

  // Required
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const thesis = typeof body.thesis === "string" ? body.thesis.trim() : ""
  const sleeveRaw = typeof body.sleeve === "string" ? body.sleeve.trim().toUpperCase() : ""
  const strategyId = typeof body.strategy_id === "string" ? body.strategy_id.trim() : ""

  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })
  if (!thesis) return NextResponse.json({ error: "thesis required" }, { status: 400 })
  if (!VALID_SLEEVES.includes(sleeveRaw as ResearchSleeve)) {
    return NextResponse.json({ error: "sleeve must be STOCKS | CRYPTO | OPTIONS" }, { status: 400 })
  }
  if (!strategyId) return NextResponse.json({ error: "strategy_id required" }, { status: 400 })

  // Validate strategy_id against the preset index — guardrail: no
  // hand-authored unsupported strategies.
  const registered = await loadRegisteredStrategies()
  if (registered.size > 0 && !registered.has(strategyId)) {
    return NextResponse.json(
      {
        error: `strategy_id "${strategyId}" is not registered. Valid options: ${[...registered].join(", ")}`,
      },
      { status: 400 },
    )
  }

  // Optional fields
  const scope = normalizeScope(body.scope)
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "jacob"
  const statusIn = typeof body.status === "string" ? body.status.trim().toUpperCase() : "DRAFT"
  const status: IdeaStatus = VALID_STATUSES.includes(statusIn as IdeaStatus)
    ? (statusIn as IdeaStatus)
    : "DRAFT"
  const sourceIn = typeof body.source === "string" ? body.source.trim().toUpperCase() : "MANUAL"
  const source: IdeaSource = VALID_SOURCES.includes(sourceIn as IdeaSource)
    ? (sourceIn as IdeaSource)
    : "MANUAL"
  const tags = normalizeTags(body.tags)
  const params = normalizeParams(body.params)
  const strategyFamily =
    typeof body.strategy_family === "string" && body.strategy_family.trim()
      ? body.strategy_family.trim()
      : undefined
  const promoteToCampaign = body.promote_to_campaign === true

  // promotion_target is optional — if present, shape-validate. (Per spec,
  // these stay advisory suggestions until operator confirms at submit.)
  let promotionTarget: IdeaV1["promotion_target"] = null
  if (body.promotion_target && typeof body.promotion_target === "object") {
    const pt = body.promotion_target as Record<string, unknown>
    const roleId = typeof pt.passport_role_id === "string" ? pt.passport_role_id.trim() : ""
    const targetAction =
      typeof pt.target_action === "string" ? pt.target_action.trim().toUpperCase() : ""
    if (roleId && (targetAction === "NEW_RECORD" || targetAction === "REPLACE_EXISTING")) {
      promotionTarget = {
        passport_role_id: roleId,
        target_action: targetAction as "NEW_RECORD" | "REPLACE_EXISTING",
        supersedes_record_id:
          typeof pt.supersedes_record_id === "string" && pt.supersedes_record_id.trim()
            ? pt.supersedes_record_id.trim()
            : null,
      }
    }
  }

  const ideaId =
    typeof body.idea_id === "string" && body.idea_id.trim() ? body.idea_id.trim() : `idea_${ulid()}`
  const createdAt = new Date().toISOString()

  const idea: IdeaV1 = {
    schema_version: "research_lab.idea.v1",
    idea_id: ideaId,
    ...scope,
    title,
    thesis,
    sleeve: sleeveRaw as ResearchSleeve,
    strategy_id: strategyId,
    status,
    created_at: createdAt,
    created_by: actor,
    source,
    params,
    ...(strategyFamily && { strategy_family: strategyFamily }),
    ...(tags && { tags }),
    ...(promoteToCampaign && { promote_to_campaign: true }),
    ...(promotionTarget && { promotion_target: promotionTarget }),
  }

  const relpath = ideaRelpath(scope, ideaId)
  let persisted:
    | Awaited<ReturnType<typeof persistLocal>>
    | Awaited<ReturnType<typeof persistGithub>>
  try {
    const token = process.env.GITHUB_TOKEN
    persisted = token ? await persistGithub(idea, relpath, token) : await persistLocal(idea, relpath)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json({ error: `Failed to persist idea: ${detail}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mode: persisted.mode,
    file: persisted.file,
    commit_sha: persisted.commit_sha,
    idea,
  })
}
