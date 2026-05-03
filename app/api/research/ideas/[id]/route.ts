// PATCH /api/research/ideas/[id]
//
// Phase A split for Lab Pipeline v2:
//   - this route handles draft body edits only
//   - lifecycle status moves live at /transitions
//   - promotion intent lives at /promotion
//
// The route still accepts the current dashboard draft-edit shape
// (including legacy strategy_id/code_pending toggles) and persists clean
// idea.v2 YAML so existing shells keep working during the migration.
//
// Persistence mirrors the POST route through the shared dashboard artifact
// commit helper so preview deployments write to their active branch.

import { promises as fs } from "fs"
import path from "path"

import { NextRequest, NextResponse } from "next/server"
import yaml from "js-yaml"

import type {
  IdeaPromotionTarget,
  IdeaStatus,
  IdeaArtifact,
  ResearchSleeve,
  ScopeTriple,
  StrategyRefV2,
} from "@/lib/research-lab-contracts"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { commitDashboardFiles, dashboardArtifactBranch } from "@/lib/github-multi-file-commit.server"
import { ideaPath, loadIdeaById } from "@/lib/research-lab-ideas.server"
import { normalizeReferenceStrategies } from "@/lib/research-lab-strategy-references.server"
import { hasLabCampaignForIdea } from "@/lib/vires-campaigns.server"

const VALID_SLEEVES: ResearchSleeve[] = ["STOCKS", "CRYPTO", "OPTIONS"]
const CODE_PENDING_STRATEGY_ID = "__code_pending__"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

interface PatchBody {
  promotion_target?: unknown
  promote_to_campaign?: unknown
  status?: unknown
  scope?: unknown
  // Draft-only edits (locked once status leaves DRAFT or a Lab campaign
  // exists for the idea):
  title?: unknown
  thesis?: unknown
  sleeve?: unknown
  strategy_id?: unknown
  code_pending?: unknown
  strategy_family?: unknown
  tags?: unknown
  params?: unknown
  reference_strategies?: unknown
}

// Mirrors the POST route's preset registry validator. Duplicated rather
// than extracted to keep the import surface small; the function is six
// lines.
async function loadRegisteredStrategies(): Promise<Set<string>> {
  try {
    const indexPath = path.join(process.cwd(), "data", "research_lab", "presets", "_index.json")
    const raw = await fs.readFile(indexPath, "utf-8")
    const parsed = JSON.parse(raw) as { presets?: { strategy_id?: string }[] }
    const ids = new Set<string>()
    for (const p of parsed.presets ?? []) {
      if (p.strategy_id) ids.add(p.strategy_id)
    }
    return ids
  } catch {
    return new Set<string>()
  }
}

function normalizeTags(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined
  const tags = input
    .filter((t): t is string => typeof t === "string")
    .map(t => t.trim())
    .filter(t => t.length > 0)
  return tags
}

function normalizeParams(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object") return undefined
  return input as Record<string, unknown>
}

// Operator-allowed transitions. Anything not listed here returns 400.
// QUEUED and ACTIVE never appear as targets — those are written only by
// the lab pipeline (autopilot pickup, job start). Operators can still
// pull an idea OUT of QUEUED/ACTIVE by shelving or retiring it.
const OPERATOR_ALLOWED_TRANSITIONS: Record<IdeaStatus, IdeaStatus[]> = {
  DRAFT:   ["READY", "SHELVED", "RETIRED"],
  READY:   ["DRAFT", "SHELVED", "RETIRED"],
  QUEUED:  ["SHELVED", "RETIRED"],
  ACTIVE:  ["SHELVED", "RETIRED"],
  SHELVED: ["DRAFT", "RETIRED"],
  RETIRED: [],
}

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

// Returns:
//   { ok: true, value: <target|null> }     — valid assignment or explicit clear
//   { ok: false, error: string }           — malformed input
function parsePromotionTarget(
  input: unknown,
): { ok: true; value: IdeaPromotionTarget | null } | { ok: false; error: string } {
  if (input === null) return { ok: true, value: null }
  if (!input || typeof input !== "object") {
    return { ok: false, error: "promotion_target must be an object or null" }
  }
  const pt = input as Record<string, unknown>
  const roleId = typeof pt.passport_role_id === "string" ? pt.passport_role_id.trim() : ""
  const targetAction =
    typeof pt.target_action === "string" ? pt.target_action.trim().toUpperCase() : ""
  if (!roleId) return { ok: false, error: "passport_role_id required" }
  if (targetAction !== "NEW_RECORD" && targetAction !== "REPLACE_EXISTING") {
    return { ok: false, error: "target_action must be NEW_RECORD or REPLACE_EXISTING" }
  }
  const supersedesRaw =
    typeof pt.supersedes_record_id === "string" ? pt.supersedes_record_id.trim() : ""
  if (targetAction === "REPLACE_EXISTING" && !supersedesRaw) {
    return {
      ok: false,
      error: "supersedes_record_id required when target_action is REPLACE_EXISTING",
    }
  }
  if (targetAction === "NEW_RECORD" && supersedesRaw) {
    return {
      ok: false,
      error: "supersedes_record_id must be omitted when target_action is NEW_RECORD",
    }
  }
  return {
    ok: true,
    value: {
      passport_role_id: roleId,
      target_action: targetAction as "NEW_RECORD" | "REPLACE_EXISTING",
      supersedes_record_id: targetAction === "REPLACE_EXISTING" ? supersedesRaw : null,
    },
  }
}

function ideaRelpath(scope: ScopeTriple, ideaId: string): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/ideas/${ideaId}.yaml`
}

async function persistIdea(
  idea: IdeaArtifact,
  scope: ScopeTriple,
  commitMessage: string,
): Promise<{ mode: "local" | "github"; file: string; commit_sha: string | null; branch: string | null }> {
  const relpath = ideaRelpath(scope, idea.idea_id)
  const yamlText = yaml.dump(stripViewFields(idea), { noRefs: true, lineWidth: 100 })
  const persisted = await commitDashboardFiles({
    message: commitMessage,
    files: [{ relpath, content: yamlText }],
  })
  return { mode: persisted.mode, file: relpath, commit_sha: persisted.commit_sha, branch: persisted.branch }
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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  let ideaId: string
  try {
    ideaId = safePathSegment(decodeURIComponent(id), "idea_id")
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid idea_id" },
      { status: 400 },
    )
  }

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  const hasPromotionTarget = "promotion_target" in body
  const hasPromoteToCampaign = "promote_to_campaign" in body
  const hasStatus = "status" in body
  // Draft-only edit fields. If any of these are present, we'll need to
  // verify the lock condition before applying them.
  const DRAFT_FIELDS = [
    "title", "thesis", "sleeve", "strategy_id", "code_pending",
    "strategy_family", "tags", "params", "reference_strategies",
  ] as const
  const hasDraftEdits = DRAFT_FIELDS.some(k => k in body)
  if (hasStatus) {
    return NextResponse.json(
      {
        error:
          "Idea status changes moved to POST /api/research/ideas/[id]/transitions in Lab Pipeline v2.",
      },
      { status: 410 },
    )
  }
  if (hasPromotionTarget || hasPromoteToCampaign) {
    return NextResponse.json(
      {
        error:
          "Idea promotion intent moved to POST /api/research/ideas/[id]/promotion in Lab Pipeline v2.",
      },
      { status: 410 },
    )
  }
  if (!hasPromotionTarget && !hasPromoteToCampaign && !hasStatus && !hasDraftEdits) {
    return NextResponse.json(
      {
        error:
          "At least one draft field required: " +
          `${DRAFT_FIELDS.join(", ")}. ` +
          "Use /transitions for status changes and /promotion for promotion intent.",
      },
      { status: 400 },
    )
  }

  let scope: ScopeTriple
  try {
    scope = normalizeScope(body.scope)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid scope" },
      { status: 400 },
    )
  }
  const existing = await loadIdeaById(ideaId, scope)
  if (!existing) {
    return NextResponse.json(
      { error: `Idea not found: ${ideaId}` },
      { status: 404 },
    )
  }

  // Apply promotion_target update if present.
  let promotionTargetValue: IdeaPromotionTarget | null = existing.promotion_target ?? null
  if (hasPromotionTarget) {
    const parsed = parsePromotionTarget(body.promotion_target)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    promotionTargetValue = parsed.value
  }

  // Apply promote_to_campaign update if present. Per §12, true forces
  // rollup on the first DONE job. Setting to false drops the override.
  let promoteToCampaignValue: boolean | undefined = existing.promote_to_campaign
  if (hasPromoteToCampaign) {
    if (typeof body.promote_to_campaign !== "boolean") {
      return NextResponse.json(
        { error: "promote_to_campaign must be a boolean" },
        { status: 400 },
      )
    }
    promoteToCampaignValue = body.promote_to_campaign
  }

  // Apply status transition if present. Validate against the allowed
  // operator transition map and the code-pending lock.
  let statusValue: IdeaStatus = existing.status
  let statusChanged = false
  if (hasStatus) {
    const raw = typeof body.status === "string" ? body.status.trim().toUpperCase() : ""
    if (!(raw in OPERATOR_ALLOWED_TRANSITIONS)) {
      return NextResponse.json(
        { error: `status must be one of DRAFT | READY | QUEUED | ACTIVE | SHELVED | RETIRED (got "${body.status}")` },
        { status: 400 },
      )
    }
    const next = raw as IdeaStatus
    if (next !== existing.status) {
      const allowed = OPERATOR_ALLOWED_TRANSITIONS[existing.status] ?? []
      if (!allowed.includes(next)) {
        return NextResponse.json(
          {
            error:
              `Operators cannot transition ${existing.status} → ${next}. ` +
              `Allowed from ${existing.status}: ${allowed.length > 0 ? allowed.join(", ") : "none"}.`,
          },
          { status: 400 },
        )
      }
      // Code-pending ideas can never go to READY (or QUEUED/ACTIVE, but
      // those are already blocked by the operator map). They're stuck at
      // DRAFT until the strategy is implemented; SHELVED/RETIRED are fine.
      if (existing.strategy_ref.kind !== "REGISTERED" && next === "READY") {
        return NextResponse.json(
          {
            error:
              "Code-pending ideas can't be marked READY — there's no executable strategy yet. " +
              "Implement the strategy and register a strategy_id first.",
          },
          { status: 400 },
        )
      }
      statusValue = next
      statusChanged = true
    }
  }

  // Apply draft field edits if any are present. Locked once status is
  // anything other than DRAFT or once a Lab campaign references the idea
  // (downstream artifacts would lose their meaning if we mutated the
  // thesis/strategy underneath them).
  let titleValue       = existing.title
  let thesisValue      = existing.thesis
  let sleeveValue      = existing.sleeve
  let strategyIdValue  = existing.strategy_ref.strategy_id ?? ""
  let codePendingValue = existing.strategy_ref.kind !== "REGISTERED"
  let strategyFamilyValue: string | undefined = existing.strategy_family ?? undefined
  let tagsValue: string[] | undefined = existing.tags ?? undefined
  let paramsValue      = existing.params
  let referenceStrategiesValue = existing.reference_strategies ?? []
  const draftFieldsTouched: string[] = []
  if (hasDraftEdits) {
    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        {
          error:
            `Idea is in ${existing.status} state — title, thesis, strategy, sleeve, params and tags ` +
            `are locked once an idea moves out of DRAFT. Move it back to DRAFT first if you need to edit.`,
        },
        { status: 409 },
      )
    }
    const campaignExists = await hasLabCampaignForIdea(ideaId)
    if (campaignExists) {
      return NextResponse.json(
        {
          error:
            "A Lab campaign already exists for this idea — its thesis and strategy are now locked. " +
            "Create a new idea if you need different fundamentals.",
        },
        { status: 409 },
      )
    }

    // Validate + normalize each provided field.
    if ("title" in body) {
      const v = typeof body.title === "string" ? body.title.trim() : ""
      if (!v) return NextResponse.json({ error: "title can't be empty" }, { status: 400 })
      titleValue = v
      draftFieldsTouched.push("title")
    }
    if ("thesis" in body) {
      const v = typeof body.thesis === "string" ? body.thesis.trim() : ""
      if (!v) return NextResponse.json({ error: "thesis can't be empty" }, { status: 400 })
      thesisValue = v
      draftFieldsTouched.push("thesis")
    }
    if ("sleeve" in body) {
      const v = typeof body.sleeve === "string" ? body.sleeve.trim().toUpperCase() : ""
      if (!VALID_SLEEVES.includes(v as ResearchSleeve)) {
        return NextResponse.json(
          { error: "sleeve must be STOCKS | CRYPTO | OPTIONS" },
          { status: 400 },
        )
      }
      sleeveValue = v as ResearchSleeve
      draftFieldsTouched.push("sleeve")
    }
    if ("code_pending" in body) {
      if (typeof body.code_pending !== "boolean") {
        return NextResponse.json(
          { error: "code_pending must be a boolean" },
          { status: 400 },
        )
      }
      codePendingValue = body.code_pending
      draftFieldsTouched.push("code_pending")
    }
    if ("strategy_id" in body) {
      const v = typeof body.strategy_id === "string" ? body.strategy_id.trim() : ""
      // When code-pending, strategy_id intentionally clears.
      if (codePendingValue) {
        strategyIdValue = ""
      } else {
        if (!v) {
          return NextResponse.json(
            { error: "strategy_id required unless code_pending is true" },
            { status: 400 },
          )
        }
        if (v !== CODE_PENDING_STRATEGY_ID) {
          const registered = await loadRegisteredStrategies()
          if (registered.size > 0 && !registered.has(v)) {
            return NextResponse.json(
              {
                error: `strategy_id "${v}" is not registered. Valid options: ${[...registered].join(", ")}`,
              },
              { status: 400 },
            )
          }
        }
        strategyIdValue = v
      }
      draftFieldsTouched.push("strategy_id")
    } else if ("code_pending" in body && codePendingValue) {
      // Toggling on code_pending without explicitly clearing strategy_id —
      // do it for the operator so the artifact stays coherent.
      strategyIdValue = ""
      if (!draftFieldsTouched.includes("strategy_id")) {
        draftFieldsTouched.push("strategy_id (cleared)")
      }
    }
    if ("strategy_family" in body) {
      const v = typeof body.strategy_family === "string" ? body.strategy_family.trim() : ""
      strategyFamilyValue = v || undefined
      draftFieldsTouched.push("strategy_family")
    }
    // Toggling on code_pending always clears strategy_family — same
    // rationale as the strategy_id auto-clear above. Without this, the
    // detail page keeps showing a stale strategy family (e.g.
    // "regime aware momentum") even after the operator switches the idea
    // back to code-pending. Runs after the explicit setter so an operator
    // can't accidentally pin a family on a code-pending idea.
    if (codePendingValue && strategyFamilyValue !== undefined) {
      strategyFamilyValue = undefined
      if (!draftFieldsTouched.includes("strategy_family")) {
        draftFieldsTouched.push("strategy_family (cleared)")
      }
    }
    if ("tags" in body) {
      tagsValue = normalizeTags(body.tags)
      draftFieldsTouched.push("tags")
    }
    if ("params" in body) {
      const v = normalizeParams(body.params)
      paramsValue = v ?? {}
      draftFieldsTouched.push("params")
    }
    if ("reference_strategies" in body) {
      try {
        referenceStrategiesValue = normalizeReferenceStrategies(
          body.reference_strategies,
          await loadRegisteredStrategies(),
        )
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Invalid reference_strategies" },
          { status: 400 },
        )
      }
      draftFieldsTouched.push("reference_strategies")
    }
  }

  // Rebuild idea preserving all other fields. Drop the keys when their
  // resolved value is falsy/null — matches the POST route's serialization
  // shape (it only emits these keys when truthy).
  if (!codePendingValue && !strategyIdValue) {
    return NextResponse.json(
      { error: "strategy_id required unless code_pending is true" },
      { status: 400 },
    )
  }

  const strategyRefValue: StrategyRefV2 = codePendingValue
    ? hasMeaningfulSpecSeed(paramsValue)
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
    : {
        kind: "REGISTERED",
        active_spec_id:
          existing.strategy_ref.kind === "REGISTERED"
            ? existing.strategy_ref.active_spec_id ?? null
            : null,
        pending_spec_id:
          existing.strategy_ref.kind === "REGISTERED"
            ? existing.strategy_ref.pending_spec_id ?? null
            : null,
        strategy_id: strategyIdValue,
        preset_id:
          existing.strategy_ref.kind === "REGISTERED" &&
          existing.strategy_ref.strategy_id === strategyIdValue
            ? existing.strategy_ref.preset_id ?? null
            : null,
      }

  const {
    promotion_target: _pt,
    promote_to_campaign: _pc,
    status: _s,
    title: _t,
    thesis: _th,
    sleeve: _sl,
    strategy_id: _sid,
    code_pending: _cp,
    strategy_family: _sf,
    reference_strategies: _refs,
    strategy_ref: _sr,
    needs_spec: _ns,
    tags: _tg,
    params: _pa,
    ...rest
  } = existing
  void [_pt, _pc, _s, _t, _th, _sl, _sid, _cp, _sf, _refs, _sr, _ns, _tg, _pa]
  const updated: IdeaArtifact = {
    ...rest,
    schema_version: "research_lab.idea.v2",
    title: titleValue,
    thesis: thesisValue,
    sleeve: sleeveValue,
    tags: tagsValue ?? [],
    params: paramsValue,
    reference_strategies: referenceStrategiesValue,
    strategy_ref: strategyRefValue,
    status: statusValue,
    needs_spec: strategyRefValue.kind === "NONE",
    strategy_id: strategyRefValue.strategy_id ?? "",
    strategy_family: strategyRefValue.strategy_id ? strategyFamilyValue ?? null : null,
    code_pending: strategyRefValue.kind !== "REGISTERED",
    // Promotion fields are meaningless on code-pending — drop them.
    ...(strategyRefValue.kind === "REGISTERED" && promotionTargetValue && { promotion_target: promotionTargetValue }),
    ...(strategyRefValue.kind === "REGISTERED" && promoteToCampaignValue && { promote_to_campaign: true }),
  }

  // Compose a concise commit message that reflects what actually changed.
  const changeNotes: string[] = []
  if (statusChanged) changeNotes.push(`status → ${statusValue}`)
  if (hasPromotionTarget) changeNotes.push(promotionTargetValue ? "assign promotion slot" : "clear promotion slot")
  if (hasPromoteToCampaign) changeNotes.push(`promote_to_campaign=${Boolean(promoteToCampaignValue)}`)
  if (draftFieldsTouched.length > 0) changeNotes.push(`edit ${draftFieldsTouched.join("/")}`)
  const commitMessage = `research lab: ${changeNotes.join(" · ") || "update"} on ${updated.idea_id}`

  let persisted: Awaited<ReturnType<typeof persistIdea>>
  try {
    persisted = await persistIdea(updated, scope, commitMessage)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json({ error: `Failed to persist idea: ${detail}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mode: persisted.mode,
    file: persisted.file,
    commit_sha: persisted.commit_sha,
    branch: persisted.branch,
    idea: updated,
  })
}

// ─── DELETE handler ─────────────────────────────────────────────────────
//
// Hard-delete the idea YAML. Distinct from RETIRED, which is a soft state
// that keeps the record on disk. Use DELETE for throwaway drafts that
// should leave no trace.
//
// Safety rails:
//   - Refuses if status is QUEUED or ACTIVE (the lab is currently using it)
//   - Refuses if a Lab campaign already exists for this idea (deleting
//     would orphan the campaign manifest's idea reference)
//   - Idempotent on missing files: returns 200 with mode "noop"
//
// Persistence parallels POST/PATCH: GitHub Contents API DELETE when
// GITHUB_TOKEN is set, local FS otherwise.

async function deleteLocal(
  scope: ScopeTriple,
  ideaId: string,
): Promise<{ mode: "local"; file: string; commit_sha: null }> {
  const absolutePath = ideaPath(ideaId, scope)
  try {
    await fs.unlink(absolutePath)
  } catch (e) {
    // ENOENT is fine — already absent. Anything else bubbles.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
  }
  return { mode: "local", file: ideaRelpath(scope, ideaId), commit_sha: null }
}

async function deleteGithub(
  scope: ScopeTriple,
  ideaId: string,
  token: string,
  branch: string,
): Promise<{ mode: "github"; file: string; commit_sha: string; branch: string }> {
  const relpath = ideaRelpath(scope, ideaId)
  const encodedRelpath = relpath.split("/").map(encodeURIComponent).join("/")

  // GitHub DELETE requires the current file sha.
  const getResponse = await fetch(
    `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${encodedRelpath}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    },
  )
  if (getResponse.status === 404) {
    return { mode: "github", file: relpath, commit_sha: "", branch }
  }
  if (!getResponse.ok) {
    const detail = await getResponse.text()
    throw new Error(`GitHub GET ${getResponse.status}: ${detail}`)
  }
  const existing = (await getResponse.json()) as { sha?: string }
  if (!existing.sha) {
    throw new Error("GitHub response missing file sha")
  }

  const deleteResponse = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${encodedRelpath}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      message: `research lab: delete idea ${ideaId}`,
      sha: existing.sha,
      branch,
    }),
  })
  if (!deleteResponse.ok) {
    const detail = await deleteResponse.text()
    throw new Error(`GitHub DELETE ${deleteResponse.status}: ${detail}`)
  }
  const payload = (await deleteResponse.json()) as { commit?: { sha?: string } }
  return { mode: "github", file: relpath, commit_sha: payload.commit?.sha ?? "", branch }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  let ideaId: string
  try {
    ideaId = safePathSegment(decodeURIComponent(id), "idea_id")
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid idea_id" },
      { status: 400 },
    )
  }

  // Scope can come via query string for the DELETE method; default to phase-1.
  const url = new URL(req.url)
  let scope: ScopeTriple
  try {
    scope = {
      user_id: safePathSegment(
        url.searchParams.get("user_id") ?? PHASE_1_DEFAULT_SCOPE.user_id,
        "scope.user_id",
      ),
      account_id: safePathSegment(
        url.searchParams.get("account_id") ?? PHASE_1_DEFAULT_SCOPE.account_id,
        "scope.account_id",
      ),
      strategy_group_id: safePathSegment(
        url.searchParams.get("strategy_group_id") ?? PHASE_1_DEFAULT_SCOPE.strategy_group_id,
        "scope.strategy_group_id",
      ),
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid scope" },
      { status: 400 },
    )
  }

  const existing = await loadIdeaById(ideaId, scope)
  if (!existing) {
    // Idempotent: caller deleted it already, that's fine.
    return NextResponse.json({ ok: true, mode: "noop", file: null, commit_sha: null })
  }

  // Block deletion of in-flight ideas — the lab is using them.
  if (existing.status === "QUEUED" || existing.status === "ACTIVE") {
    return NextResponse.json(
      {
        error:
          `Can't delete an idea in ${existing.status} state — the lab is currently using it. ` +
          `Shelve or retire it first if you want it out of the active list.`,
      },
      { status: 409 },
    )
  }

  // Block deletion if a Lab campaign already references this idea — that
  // would leave the campaign manifest pointing at a missing idea_id.
  const campaignExists = await hasLabCampaignForIdea(ideaId)
  if (campaignExists) {
    return NextResponse.json(
      {
        error:
          "A Lab campaign already exists for this idea. Retire the idea instead — " +
          "deletion would orphan the campaign manifest's idea reference.",
      },
      { status: 409 },
    )
  }

  let removed: Awaited<ReturnType<typeof deleteLocal>> | Awaited<ReturnType<typeof deleteGithub>>
  try {
    const token = process.env.GITHUB_TOKEN
    if (token) {
      removed = await deleteGithub(scope, ideaId, token, dashboardArtifactBranch())
    } else if (process.env.VERCEL) {
      throw new Error("GITHUB_TOKEN is required for dashboard artifact deletes on Vercel.")
    } else {
      removed = await deleteLocal(scope, ideaId)
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown deletion failure"
    return NextResponse.json({ error: `Failed to delete idea: ${detail}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mode: removed.mode,
    file: removed.file,
    commit_sha: removed.commit_sha,
    branch: "branch" in removed ? removed.branch : null,
  })
}
