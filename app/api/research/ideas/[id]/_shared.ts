import yaml from "js-yaml"

import type {
  IdeaArtifact,
  IdeaPromotionTarget,
  IdeaStatus,
  ScopeTriple,
} from "@/lib/research-lab-contracts"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { commitDashboardFiles } from "@/lib/github-multi-file-commit.server"

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
): Promise<{ mode: "local" | "github"; file: string; commit_sha: string | null; branch: string | null }> {
  const relpath = ideaRelpath(scope, idea.idea_id)
  const yamlText = yaml.dump(stripViewFields(idea), { noRefs: true, lineWidth: 100 })
  const persisted = await commitDashboardFiles({
    message: commitMessage,
    files: [{ relpath, content: yamlText }],
  })
  return { mode: persisted.mode, file: relpath, commit_sha: persisted.commit_sha, branch: persisted.branch }
}

function stripViewFields(idea: IdeaArtifact): Record<string, unknown> {
  const persisted = { ...idea } as Record<string, unknown>
  delete persisted.schema
  delete persisted.strategy_id
  delete persisted.strategy_family
  delete persisted.code_pending
  return persisted
}
