import { promises as fs } from "fs"
import path from "path"

import yaml from "js-yaml"

import type {
  IdeaArtifact,
  IdeaPromotionTarget,
  IdeaStatus,
  ScopeTriple,
} from "@/lib/research-lab-contracts"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { ideaPath } from "@/lib/research-lab-ideas.server"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export const OPERATOR_ALLOWED_TRANSITIONS: Record<IdeaStatus, IdeaStatus[]> = {
  DRAFT: ["READY", "SHELVED", "RETIRED"],
  READY: ["DRAFT", "SHELVED", "RETIRED"],
  QUEUED: ["SHELVED", "RETIRED"],
  ACTIVE: ["SHELVED", "RETIRED"],
  SHELVED: ["DRAFT", "RETIRED"],
  RETIRED: [],
}

export function normalizeScope(input: unknown): ScopeTriple {
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

export function safePathSegment(value: string, label: string): string {
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

export function parsePromotionTarget(
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

export function ideaRelpath(scope: ScopeTriple, ideaId: string): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/ideas/${ideaId}.yaml`
}

export async function persistIdeaArtifact(
  idea: IdeaArtifact,
  scope: ScopeTriple,
  commitMessage: string,
): Promise<{ mode: "local" | "github"; file: string; commit_sha: string | null }> {
  const token = process.env.GITHUB_TOKEN
  return token
    ? persistGithub(idea, scope, token, commitMessage)
    : persistLocal(idea, scope)
}

async function persistLocal(
  idea: IdeaArtifact,
  scope: ScopeTriple,
): Promise<{ mode: "local"; file: string; commit_sha: null }> {
  const absolutePath = ideaPath(idea.idea_id, scope)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, yaml.dump(stripViewFields(idea), { noRefs: true, lineWidth: 100 }))
  return { mode: "local", file: ideaRelpath(scope, idea.idea_id), commit_sha: null }
}

async function persistGithub(
  idea: IdeaArtifact,
  scope: ScopeTriple,
  token: string,
  commitMessage: string,
): Promise<{ mode: "github"; file: string; commit_sha: string }> {
  const relpath = ideaRelpath(scope, idea.idea_id)
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
  if (!existing.sha) throw new Error("GitHub response missing file sha")

  const yamlText = yaml.dump(stripViewFields(idea), { noRefs: true, lineWidth: 100 })
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
  return { mode: "github", file: relpath, commit_sha: payload.commit?.sha ?? payload.content?.sha ?? "" }
}

function stripViewFields(idea: IdeaArtifact): Record<string, unknown> {
  const {
    schema: _schema,
    strategy_id: _strategyId,
    strategy_family: _strategyFamily,
    code_pending: _codePending,
    ...persisted
  } = idea as IdeaArtifact & { schema?: unknown }
  return persisted
}
