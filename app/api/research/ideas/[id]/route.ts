// PATCH /api/research/ideas/[id]
//
// Update the `promotion_target` on an existing idea.v1. This is the
// dashboard-side "Assign promotion slot" action surfaced on Lab-spawned
// campaigns that rolled up without a promotion target.
//
// Only `promotion_target` is mutable here. Everything else is locked once
// an idea is authored — operators should create a new idea if the thesis,
// strategy, or sleeve changes.
//
// Persistence mirrors the POST route: GitHub Contents API when
// GITHUB_TOKEN is set, local FS otherwise (dev path).

import { promises as fs } from "fs"
import path from "path"

import { NextRequest, NextResponse } from "next/server"
import yaml from "js-yaml"

import type { IdeaPromotionTarget, IdeaV1, ScopeTriple } from "@/lib/research-lab-contracts"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { ideaPath, loadIdeaById } from "@/lib/research-lab-ideas.server"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"

interface PatchBody {
  promotion_target?: unknown
  promote_to_campaign?: unknown
  scope?: unknown
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
      message: `research lab: assign promotion slot on ${idea.idea_id}`,
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
  if (!hasPromotionTarget && !hasPromoteToCampaign) {
    return NextResponse.json(
      { error: "promotion_target or promote_to_campaign required" },
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

  // Rebuild idea preserving all other fields. Drop the keys when their
  // resolved value is falsy/null — matches the POST route's serialization
  // shape (it only emits these keys when truthy).
  const { promotion_target: _pt, promote_to_campaign: _pc, ...rest } = existing
  const updated: IdeaV1 = {
    ...rest,
    ...(promotionTargetValue && { promotion_target: promotionTargetValue }),
    ...(promoteToCampaignValue && { promote_to_campaign: true }),
  }

  let persisted:
    | Awaited<ReturnType<typeof persistLocal>>
    | Awaited<ReturnType<typeof persistGithub>>
  try {
    const token = process.env.GITHUB_TOKEN
    persisted = token
      ? await persistGithub(updated, scope, token)
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
