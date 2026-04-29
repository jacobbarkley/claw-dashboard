// PATCH /api/research/ideas/[id]
//
// Operator-side mutations for an existing idea.v1:
//   - promotion_target: assign / clear the passport role this idea targets
//   - promote_to_campaign: force first-job rollup
//   - status: transition between operator-allowed states (DRAFT, READY,
//     SHELVED, RETIRED). System-driven transitions (READY → QUEUED →
//     ACTIVE) are NOT permitted here; those are written by the lab
//     pipeline. Code-pending ideas are locked out of READY.
//   - draft fields (title, thesis, sleeve, strategy_id, code_pending,
//     strategy_family, tags, params): editable while the idea is in
//     DRAFT and no Lab campaign references it. Once the idea is
//     "released" (READY) or anything has run against it, these lock.
//
// Persistence mirrors the POST route: GitHub Contents API when
// GITHUB_TOKEN is set, local FS otherwise (dev path).

import { promises as fs } from "fs"
import path from "path"

import { NextRequest, NextResponse } from "next/server"
import yaml from "js-yaml"

import type {
  IdeaPromotionTarget,
  IdeaStatus,
  IdeaV1,
  ResearchSleeve,
  ScopeTriple,
} from "@/lib/research-lab-contracts"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { ideaPath, loadIdeaById } from "@/lib/research-lab-ideas.server"
import { hasLabCampaignForIdea } from "@/lib/vires-campaigns.server"

const VALID_SLEEVES: ResearchSleeve[] = ["STOCKS", "CRYPTO", "OPTIONS"]
const CODE_PENDING_STRATEGY_ID = "__code_pending__"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"

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
    user_id: typeof s.user_id === "string" ? s.user_id : PHASE_1_DEFAULT_SCOPE.user_id,
    account_id: typeof s.account_id === "string" ? s.account_id : PHASE_1_DEFAULT_SCOPE.account_id,
    strategy_group_id:
      typeof s.strategy_group_id === "string"
        ? s.strategy_group_id
        : PHASE_1_DEFAULT_SCOPE.strategy_group_id,
  }
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
  return {
    ok: true,
    value: {
      passport_role_id: roleId,
      target_action: targetAction as "NEW_RECORD" | "REPLACE_EXISTING",
      supersedes_record_id: supersedesRaw || null,
    },
  }
}

function ideaRelpath(scope: ScopeTriple, ideaId: string): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/ideas/${ideaId}.yaml`
}

async function persistLocal(
  idea: IdeaV1,
  scope: ScopeTriple,
): Promise<{ mode: "local"; file: string; commit_sha: null }> {
  const absolutePath = ideaPath(idea.idea_id, scope)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, yaml.dump(idea, { noRefs: true, lineWidth: 100 }))
  return { mode: "local", file: ideaRelpath(scope, idea.idea_id), commit_sha: null }
}

async function persistGithub(
  idea: IdeaV1,
  scope: ScopeTriple,
  token: string,
  commitMessage: string,
): Promise<{ mode: "github"; file: string; commit_sha: string }> {
  const relpath = ideaRelpath(scope, idea.idea_id)

  // GitHub Contents API requires the current file sha to update.
  const getResponse = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${relpath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  })
  if (!getResponse.ok) {
    const detail = await getResponse.text()
    throw new Error(`GitHub GET ${getResponse.status}: ${detail}`)
  }
  const existing = (await getResponse.json()) as { sha?: string }
  if (!existing.sha) {
    throw new Error("GitHub response missing file sha")
  }

  const yamlText = yaml.dump(idea, { noRefs: true, lineWidth: 100 })
  const content = Buffer.from(yamlText, "utf-8").toString("base64")
  const putResponse = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${relpath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      message: commitMessage,
      content,
      sha: existing.sha,
    }),
  })
  if (!putResponse.ok) {
    const detail = await putResponse.text()
    throw new Error(`GitHub PUT ${putResponse.status}: ${detail}`)
  }
  const payload = (await putResponse.json()) as {
    commit?: { sha?: string }
    content?: { sha?: string }
  }
  const commit_sha = payload.commit?.sha ?? payload.content?.sha ?? ""
  return { mode: "github", file: relpath, commit_sha }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const ideaId = decodeURIComponent(id)

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
    "strategy_family", "tags", "params",
  ] as const
  const hasDraftEdits = DRAFT_FIELDS.some(k => k in body)
  if (!hasPromotionTarget && !hasPromoteToCampaign && !hasStatus && !hasDraftEdits) {
    return NextResponse.json(
      {
        error:
          "At least one mutable field required: " +
          "promotion_target, promote_to_campaign, status, or any draft field " +
          `(${DRAFT_FIELDS.join(", ")}).`,
      },
      { status: 400 },
    )
  }

  const scope = normalizeScope(body.scope)
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
      if (existing.code_pending && next === "READY") {
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
  let strategyIdValue  = existing.strategy_id
  let codePendingValue = existing.code_pending === true
  let strategyFamilyValue: string | undefined = existing.strategy_family ?? undefined
  let tagsValue: string[] | undefined = existing.tags ?? undefined
  let paramsValue      = existing.params
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
  }

  // Rebuild idea preserving all other fields. Drop the keys when their
  // resolved value is falsy/null — matches the POST route's serialization
  // shape (it only emits these keys when truthy).
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
    tags: _tg,
    params: _pa,
    ...rest
  } = existing
  const updated: IdeaV1 = {
    ...rest,
    title: titleValue,
    thesis: thesisValue,
    sleeve: sleeveValue,
    strategy_id: strategyIdValue,
    status: statusValue,
    params: paramsValue,
    ...(strategyFamilyValue && { strategy_family: strategyFamilyValue }),
    ...(tagsValue && tagsValue.length > 0 && { tags: tagsValue }),
    ...(codePendingValue && { code_pending: true }),
    // Promotion fields are meaningless on code-pending — drop them.
    ...(!codePendingValue && promotionTargetValue && { promotion_target: promotionTargetValue }),
    ...(!codePendingValue && promoteToCampaignValue && { promote_to_campaign: true }),
  }

  // Compose a concise commit message that reflects what actually changed.
  const changeNotes: string[] = []
  if (statusChanged) changeNotes.push(`status → ${statusValue}`)
  if (hasPromotionTarget) changeNotes.push(promotionTargetValue ? "assign promotion slot" : "clear promotion slot")
  if (hasPromoteToCampaign) changeNotes.push(`promote_to_campaign=${Boolean(promoteToCampaignValue)}`)
  if (draftFieldsTouched.length > 0) changeNotes.push(`edit ${draftFieldsTouched.join("/")}`)
  const commitMessage = `research lab: ${changeNotes.join(" · ") || "update"} on ${updated.idea_id}`

  let persisted:
    | Awaited<ReturnType<typeof persistLocal>>
    | Awaited<ReturnType<typeof persistGithub>>
  try {
    const token = process.env.GITHUB_TOKEN
    persisted = token
      ? await persistGithub(updated, scope, token, commitMessage)
      : await persistLocal(updated, scope)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json({ error: `Failed to persist idea: ${detail}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mode: persisted.mode,
    file: persisted.file,
    commit_sha: persisted.commit_sha,
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
): Promise<{ mode: "github"; file: string; commit_sha: string }> {
  const relpath = ideaRelpath(scope, ideaId)

  // GitHub DELETE requires the current file sha.
  const getResponse = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${relpath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  })
  if (getResponse.status === 404) {
    return { mode: "github", file: relpath, commit_sha: "" }
  }
  if (!getResponse.ok) {
    const detail = await getResponse.text()
    throw new Error(`GitHub GET ${getResponse.status}: ${detail}`)
  }
  const existing = (await getResponse.json()) as { sha?: string }
  if (!existing.sha) {
    throw new Error("GitHub response missing file sha")
  }

  const deleteResponse = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${relpath}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      message: `research lab: delete idea ${ideaId}`,
      sha: existing.sha,
    }),
  })
  if (!deleteResponse.ok) {
    const detail = await deleteResponse.text()
    throw new Error(`GitHub DELETE ${deleteResponse.status}: ${detail}`)
  }
  const payload = (await deleteResponse.json()) as { commit?: { sha?: string } }
  return { mode: "github", file: relpath, commit_sha: payload.commit?.sha ?? "" }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const ideaId = decodeURIComponent(id)

  // Scope can come via query string for the DELETE method; default to phase-1.
  const url = new URL(req.url)
  const scope: ScopeTriple = {
    user_id: url.searchParams.get("user_id") ?? PHASE_1_DEFAULT_SCOPE.user_id,
    account_id: url.searchParams.get("account_id") ?? PHASE_1_DEFAULT_SCOPE.account_id,
    strategy_group_id:
      url.searchParams.get("strategy_group_id") ?? PHASE_1_DEFAULT_SCOPE.strategy_group_id,
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
    removed = token
      ? await deleteGithub(scope, ideaId, token)
      : await deleteLocal(scope, ideaId)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown deletion failure"
    return NextResponse.json({ error: `Failed to delete idea: ${detail}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mode: removed.mode,
    file: removed.file,
    commit_sha: removed.commit_sha,
  })
}
