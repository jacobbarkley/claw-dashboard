// POST /api/research/ideas
//
// Create a new idea.v2. Commits the YAML file to the dashboard repo under
// data/research_lab/<scope>/ideas/<idea_id>.yaml so the trading-bot
// worker can read it via git history on its rollup-producer sync.
//
// Guardrails (per spec §12 + Codex's idea-factory notes):
//   - registered strategy refs must already exist — validated against the
//     preset index so operators can't hand-author unsupported strategies.
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
  IdeaArtifact,
  ResearchSleeve,
  ScopeTriple,
  StrategyRefV2,
} from "@/lib/research-lab-contracts"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import {
  normalizeReferenceStrategies,
} from "@/lib/research-lab-strategy-references.server"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

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
  reference_strategies?: unknown
  promote_to_campaign?: unknown
  promotion_target?: unknown
  scope?: unknown
  actor?: unknown
  code_pending?: unknown
}

const VALID_SLEEVES: ResearchSleeve[] = ["STOCKS", "CRYPTO", "OPTIONS"]
const VALID_STATUSES: IdeaStatus[] = ["DRAFT", "READY", "QUEUED", "ACTIVE", "SHELVED", "RETIRED"]
const VALID_SOURCES: IdeaSource[] = ["CONVERSATION", "MANUAL", "IMPORTED"]

function normalizeScope(input: unknown): ScopeTriple {
  if (!input || typeof input !== "object") return { ...PHASE_1_DEFAULT_SCOPE }
  const s = input as Partial<Record<keyof ScopeTriple, unknown>>
  return {
    user_id: safePathSegment(
      typeof s.user_id === "string" ? s.user_id : PHASE_1_DEFAULT_SCOPE.user_id,
      "scope.user_id",
    ),
    account_id: safePathSegment(
      typeof s.account_id === "string" ? s.account_id : PHASE_1_DEFAULT_SCOPE.account_id,
      "scope.account_id",
    ),
    strategy_group_id:
      safePathSegment(
        typeof s.strategy_group_id === "string"
          ? s.strategy_group_id
          : PHASE_1_DEFAULT_SCOPE.strategy_group_id,
        "scope.strategy_group_id",
      ),
  }
}

function safePathSegment(value: string, label: string): string {
  const trimmed = value.trim()
  if (
    !trimmed ||
    trimmed === "." ||
    trimmed === ".." ||
    !SAFE_PATH_SEGMENT.test(trimmed)
  ) {
    throw new Error(`${label} must be a safe path segment`)
  }
  return trimmed
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
  idea: IdeaArtifact,
  relpath: string,
): Promise<{ mode: "local"; file: string; commit_sha: null }> {
  const absolutePath = path.join(process.cwd(), relpath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, yaml.dump(stripViewFields(idea), { noRefs: true, lineWidth: 100 }))
  return { mode: "local", file: relpath, commit_sha: null }
}

async function persistGithub(
  idea: IdeaArtifact,
  relpath: string,
  token: string,
): Promise<{ mode: "github"; file: string; commit_sha: string }> {
  const yamlText = yaml.dump(stripViewFields(idea), { noRefs: true, lineWidth: 100 })
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

function hasMeaningfulSpecSeed(params: Record<string, unknown>): boolean {
  const spec = params.spec
  if (typeof spec === "string") return spec.trim().length > 0
  return spec != null
}

function stripViewFields(idea: IdeaArtifact): Record<string, unknown> {
  const persisted = { ...idea } as Record<string, unknown>
  delete persisted.schema
  delete persisted.strategy_id
  delete persisted.strategy_family
  delete persisted.code_pending
  return persisted
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
  const explicitCodePending = body.code_pending === true
  const strategyIdInput = typeof body.strategy_id === "string" ? body.strategy_id.trim() : ""
  const createsRegisteredIdea = !explicitCodePending && strategyIdInput.length > 0
  const strategyId = createsRegisteredIdea ? strategyIdInput : ""

  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })
  if (!thesis) return NextResponse.json({ error: "thesis required" }, { status: 400 })
  if (!VALID_SLEEVES.includes(sleeveRaw as ResearchSleeve)) {
    return NextResponse.json({ error: "sleeve must be STOCKS | CRYPTO | OPTIONS" }, { status: 400 })
  }
  const registered = await loadRegisteredStrategies()

  // Validate strategy_id against the preset index — guardrail: no
  // hand-authored unsupported strategies. Skipped for code-pending ideas
  // since their sentinel intentionally isn't registered.
  if (createsRegisteredIdea) {
    if (registered.size > 0 && !registered.has(strategyId)) {
      return NextResponse.json(
        {
          error: `strategy_id "${strategyId}" is not registered. Valid options: ${[...registered].join(", ")}`,
        },
        { status: 400 },
      )
    }
  }

  let referenceStrategies: IdeaArtifact["reference_strategies"] = []
  try {
    referenceStrategies = normalizeReferenceStrategies(body.reference_strategies, registered)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid reference_strategies" },
      { status: 400 },
    )
  }

  // Optional fields
  let scope: ScopeTriple
  try {
    scope = normalizeScope(body.scope)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid scope" },
      { status: 400 },
    )
  }
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "jacob"
  const statusIn = typeof body.status === "string" ? body.status.trim().toUpperCase() : "DRAFT"
  // Code-pending ideas must stay DRAFT — there's no executable strategy
  // to mark READY/QUEUED/ACTIVE against yet.
  const status: IdeaStatus = createsRegisteredIdea && VALID_STATUSES.includes(statusIn as IdeaStatus)
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
  let promotionTarget: IdeaArtifact["promotion_target"] = null
  if (body.promotion_target != null) {
    if (typeof body.promotion_target !== "object") {
      return NextResponse.json(
        { error: "promotion_target must be an object or null" },
        { status: 400 },
      )
    }
    const pt = body.promotion_target as Record<string, unknown>
    const roleId = typeof pt.passport_role_id === "string" ? pt.passport_role_id.trim() : ""
    const targetAction =
      typeof pt.target_action === "string" ? pt.target_action.trim().toUpperCase() : ""
    if (!roleId) return NextResponse.json({ error: "passport_role_id required" }, { status: 400 })
    if (targetAction !== "NEW_RECORD" && targetAction !== "REPLACE_EXISTING") {
      return NextResponse.json(
        { error: "target_action must be NEW_RECORD or REPLACE_EXISTING" },
        { status: 400 },
      )
    }
    const supersedesRaw =
      typeof pt.supersedes_record_id === "string" ? pt.supersedes_record_id.trim() : ""
    if (targetAction === "REPLACE_EXISTING" && !supersedesRaw) {
      return NextResponse.json(
        { error: "supersedes_record_id required when target_action is REPLACE_EXISTING" },
        { status: 400 },
      )
    }
    if (targetAction === "NEW_RECORD" && supersedesRaw) {
      return NextResponse.json(
        { error: "supersedes_record_id must be omitted when target_action is NEW_RECORD" },
        { status: 400 },
      )
    }
    promotionTarget = {
      passport_role_id: roleId,
      target_action: targetAction as "NEW_RECORD" | "REPLACE_EXISTING",
      supersedes_record_id: targetAction === "REPLACE_EXISTING" ? supersedesRaw : null,
    }
  }

  const ideaId =
    typeof body.idea_id === "string" && body.idea_id.trim() ? body.idea_id.trim() : `idea_${ulid()}`
  try {
    safePathSegment(ideaId, "idea_id")
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid idea_id" },
      { status: 400 },
    )
  }
  const createdAt = new Date().toISOString()

  const strategyRef: StrategyRefV2 = createsRegisteredIdea
    ? {
        kind: "REGISTERED",
        active_spec_id: null,
        pending_spec_id: null,
        strategy_id: strategyId,
        preset_id: null,
      }
    : hasMeaningfulSpecSeed(params)
      ? {
          kind: "SPEC_PENDING",
          active_spec_id: null,
          pending_spec_id: null,
          strategy_id: null,
          preset_id: null,
        }
      : {
          kind: "NONE",
          active_spec_id: null,
          pending_spec_id: null,
          strategy_id: null,
          preset_id: null,
        }

  const idea: IdeaArtifact = {
    schema_version: "research_lab.idea.v2",
    idea_id: ideaId,
    ...scope,
    title,
    thesis,
    sleeve: sleeveRaw as ResearchSleeve,
    tags: tags ?? [],
    params,
    reference_strategies: referenceStrategies,
    strategy_ref: strategyRef,
    status,
    needs_spec: strategyRef.kind === "NONE",
    created_at: createdAt,
    created_by: actor,
    source,
    // Compatibility fields for existing UI readers. stripViewFields()
    // keeps these out of persisted idea.v2 YAML.
    strategy_id: strategyId,
    strategy_family: strategyId ? strategyFamily ?? null : null,
    code_pending: strategyRef.kind !== "REGISTERED",
    // Promotion fields are meaningless on code-pending ideas — drop them
    // even if the caller sent them.
    ...(createsRegisteredIdea && promoteToCampaign && { promote_to_campaign: true }),
    ...(createsRegisteredIdea && promotionTarget && { promotion_target: promotionTarget }),
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
