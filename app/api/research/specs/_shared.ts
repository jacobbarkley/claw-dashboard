import { randomBytes } from "crypto"
import { promises as fs } from "fs"

import yaml from "js-yaml"

import type {
  ExperimentPlanV1,
  IdeaArtifact,
  ScopeTriple,
  SpecAuthoringMode,
  StrategySpecState,
  StrategySpecV1,
} from "@/lib/research-lab-contracts"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import {
  normalizeExperimentPlan,
  validateExperimentPlan,
  withComputedExperimentPlanValidity,
} from "@/lib/research-lab-experiment-plan"
import { commitDashboardFiles, dashboardArtifactBranch } from "@/lib/github-multi-file-commit.server"
import { strategySpecPath, strategySpecRepoRelpath } from "@/lib/research-lab-specs.server"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

export const VALID_SPEC_STATES: StrategySpecState[] = [
  "DRAFTING",
  "AWAITING_APPROVAL",
  "APPROVED",
  "IMPLEMENTING",
  "REGISTERED",
  "REJECTED",
  "SUPERSEDED",
]

export const VALID_AUTHORING_MODES: SpecAuthoringMode[] = [
  "AI_DRAFTED",
  "OPERATOR_DRAFTED",
  "MANUAL",
  "AI_ASSISTED",
]
export const CRUD_WRITABLE_SPEC_STATES: StrategySpecState[] = [
  "DRAFTING",
  "AWAITING_APPROVAL",
  "REJECTED",
]

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
    strategy_group_id: safePathSegment(
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

export function ulid(): string {
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

export function ideaRepoRelpath(scope: ScopeTriple, ideaId: string): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/ideas/${ideaId}.yaml`
}

export function optionalString(input: unknown): string | null {
  if (input == null) return null
  if (typeof input !== "string") return null
  const trimmed = input.trim()
  return trimmed ? trimmed : null
}

export function requiredString(input: unknown, label: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error(`${label} required`)
  }
  return input.trim()
}

export function recordOrEmpty(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

export function stringListOrEmpty(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean)
}

export function parseSpecState(input: unknown, fallback: StrategySpecState): StrategySpecState {
  if (input == null) return fallback
  const raw = typeof input === "string" ? input.trim().toUpperCase() : ""
  if (VALID_SPEC_STATES.includes(raw as StrategySpecState)) return raw as StrategySpecState
  throw new Error(`state must be one of ${VALID_SPEC_STATES.join(" | ")}`)
}

export function parseCrudWritableSpecState(input: unknown, fallback: StrategySpecState): StrategySpecState {
  const state = parseSpecState(input, fallback)
  if (CRUD_WRITABLE_SPEC_STATES.includes(state)) return state
  throw new Error(
    `${state} is not writable through generic StrategySpec CRUD. ` +
      "Use the dedicated approval/implementation route for lifecycle transitions.",
  )
}

export function parseAuthoringMode(input: unknown, fallback: SpecAuthoringMode): SpecAuthoringMode {
  if (input == null) return fallback
  const raw = typeof input === "string" ? input.trim().toUpperCase() : ""
  if (VALID_AUTHORING_MODES.includes(raw as SpecAuthoringMode)) return raw as SpecAuthoringMode
  throw new Error(`authoring_mode must be one of ${VALID_AUTHORING_MODES.join(" | ")}`)
}

export function canTransitionSpec(
  current: StrategySpecState,
  next: StrategySpecState,
): { ok: true } | { ok: false; error: string } {
  if (current === next) return { ok: true }
  const allowed: Partial<Record<StrategySpecState, StrategySpecState[]>> = {
    DRAFTING: ["AWAITING_APPROVAL"],
    AWAITING_APPROVAL: ["DRAFTING", "APPROVED", "REJECTED"],
    APPROVED: ["REGISTERED", "REJECTED"],
    REGISTERED: ["SUPERSEDED"],
  }
  if ((allowed[current] ?? []).includes(next)) return { ok: true }
  return { ok: false, error: `Illegal StrategySpec transition: ${current} -> ${next}` }
}

export function validateStrategySpec(spec: StrategySpecV1): void {
  safePathSegment(spec.spec_id, "spec_id")
  safePathSegment(spec.idea_id, "idea_id")
  if (spec.parent_spec_id) safePathSegment(spec.parent_spec_id, "parent_spec_id")
  if (spec.registered_strategy_id) safePathSegment(spec.registered_strategy_id, "registered_strategy_id")
  if (spec.preset_id) safePathSegment(spec.preset_id, "preset_id")
  if (spec.spec_version < 1 || !Number.isFinite(spec.spec_version)) {
    throw new Error("spec_version must be >= 1")
  }
  if (spec.state === "REGISTERED" && !spec.registered_strategy_id) {
    throw new Error("REGISTERED strategy specs require registered_strategy_id")
  }
  if (spec.experiment_plan) {
    const plan = withComputedExperimentPlanValidity(spec.experiment_plan)
    if (plan.spec_id !== spec.spec_id) {
      throw new Error("Experiment plan spec_id must match the strategy spec.")
    }
    if (plan.idea_id !== spec.idea_id) {
      throw new Error("Experiment plan idea_id must match the strategy spec.")
    }
    const validity = validateExperimentPlan(plan)
    if (spec.state === "AWAITING_APPROVAL" || spec.state === "APPROVED") {
      const errors = validity.validity_reasons.filter(reason => reason.severity === "error")
      if (!validity.is_valid) {
        throw new Error(
          `Experiment plan is not valid: ${errors.map(reason => reason.message).join("; ")}`,
        )
      }
    }
  } else if (spec.state === "AWAITING_APPROVAL" || spec.state === "APPROVED") {
    throw new Error("Experiment plan is required before a strategy spec can be submitted or approved.")
  }
}

export function normalizeStrategySpecPatchExperimentPlan(
  input: unknown,
  identity?: { specId: string; ideaId: string },
): ExperimentPlanV1 | null {
  const plan = normalizeExperimentPlan(input)
  if (!plan) return null
  return withComputedExperimentPlanValidity({
    ...plan,
    spec_id: identity?.specId ?? plan.spec_id,
    idea_id: identity?.ideaId ?? plan.idea_id,
  })
}

export function linkIdeaToSpec(idea: IdeaArtifact, specId: string): IdeaArtifact {
  if (idea.strategy_ref.kind === "NONE") {
    return {
      ...idea,
      needs_spec: false,
      strategy_ref: {
        ...idea.strategy_ref,
        kind: "SPEC_PENDING",
        active_spec_id: specId,
        pending_spec_id: null,
        strategy_id: null,
        preset_id: null,
      },
    }
  }
  if (idea.strategy_ref.kind === "SPEC_PENDING") {
    const activeSpecId = idea.strategy_ref.active_spec_id ?? null
    if (activeSpecId && activeSpecId !== specId) {
      throw new Error(`Idea already points at active_spec_id ${activeSpecId}`)
    }
    return {
      ...idea,
      needs_spec: false,
      strategy_ref: {
        ...idea.strategy_ref,
        active_spec_id: specId,
      },
    }
  }
  if (idea.strategy_ref.kind === "REGISTERED") {
    const pendingSpecId = idea.strategy_ref.pending_spec_id ?? null
    if (pendingSpecId && pendingSpecId !== specId) {
      throw new Error(`Idea already has pending_spec_id ${pendingSpecId}`)
    }
    return {
      ...idea,
      strategy_ref: {
        ...idea.strategy_ref,
        pending_spec_id: specId,
      },
    }
  }
  throw new Error(`Unsupported strategy_ref.kind ${(idea.strategy_ref as { kind?: unknown }).kind}`)
}

export function strategySpecToYaml(spec: StrategySpecV1): string {
  return yaml.dump(stripSchemaAlias(spec), { noRefs: true, lineWidth: 100 })
}

export function ideaArtifactToYaml(idea: IdeaArtifact): string {
  return yaml.dump(stripIdeaViewFields(idea), { noRefs: true, lineWidth: 100 })
}

export async function persistStrategySpecArtifact(
  spec: StrategySpecV1,
  scope: ScopeTriple,
  commitMessage: string,
): Promise<{ mode: "local" | "github"; file: string; commit_sha: string | null; branch: string | null }> {
  validateStrategySpec(spec)
  const relpath = strategySpecRepoRelpath(spec.spec_id, scope)
  const persisted = await commitDashboardFiles({
    message: commitMessage,
    files: [{ relpath, content: strategySpecToYaml(spec) }],
  })
  return { mode: persisted.mode, file: relpath, commit_sha: persisted.commit_sha, branch: persisted.branch }
}

export async function deleteStrategySpecArtifact(
  spec: StrategySpecV1,
  scope: ScopeTriple,
  commitMessage: string,
): Promise<{ mode: "local" | "github"; file: string; commit_sha: string | null; branch: string | null }> {
  if (spec.state !== "DRAFTING") {
    throw new Error("Only DRAFTING strategy specs can be deleted.")
  }
  const token = process.env.GITHUB_TOKEN
  if (token) {
    return deleteGithub(spec, scope, token, commitMessage, dashboardArtifactBranch())
  }
  if (process.env.VERCEL) {
    throw new Error("GITHUB_TOKEN is required for dashboard artifact deletes on Vercel.")
  }
  return deleteLocal(spec, scope)
}

async function deleteLocal(
  spec: StrategySpecV1,
  scope: ScopeTriple,
): Promise<{ mode: "local"; file: string; commit_sha: null; branch: null }> {
  const absolutePath = strategySpecPath(spec.spec_id, scope)
  try {
    await fs.unlink(absolutePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err
  }
  return { mode: "local", file: strategySpecRepoRelpath(spec.spec_id, scope), commit_sha: null, branch: null }
}

async function deleteGithub(
  spec: StrategySpecV1,
  scope: ScopeTriple,
  token: string,
  commitMessage: string,
  branch: string,
): Promise<{ mode: "github"; file: string; commit_sha: string; branch: string }> {
  const relpath = strategySpecRepoRelpath(spec.spec_id, scope)
  const existingSha = await githubFileSha(relpath, token, branch)
  if (!existingSha) throw new Error(`GitHub file not found: ${relpath}`)
  const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${encodePathSegments(relpath)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ message: commitMessage, sha: existingSha, branch }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub DELETE ${response.status}: ${detail}`)
  }
  const payload = (await response.json()) as { commit?: { sha?: string } }
  return { mode: "github", file: relpath, commit_sha: payload.commit?.sha ?? "", branch }
}

async function githubFileSha(relpath: string, token: string, branch: string): Promise<string | null> {
  const response = await fetch(
    `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${encodePathSegments(relpath)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    },
  )
  if (response.status === 404) return null
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub GET ${response.status}: ${detail}`)
  }
  const payload = (await response.json()) as { sha?: string }
  return payload.sha ?? null
}

function encodePathSegments(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/")
}

function stripSchemaAlias(spec: StrategySpecV1): Record<string, unknown> {
  const persisted = { ...(spec as StrategySpecV1 & { schema?: unknown }) } as Record<string, unknown>
  delete persisted.schema
  if (persisted.experiment_plan) {
    persisted.experiment_plan = withComputedExperimentPlanValidity(persisted.experiment_plan as ExperimentPlanV1)
  }
  return persisted
}

function stripIdeaViewFields(idea: IdeaArtifact): Record<string, unknown> {
  const persisted = { ...(idea as IdeaArtifact & { schema?: unknown }) } as Record<string, unknown>
  delete persisted.schema
  delete persisted.strategy_id
  delete persisted.strategy_family
  delete persisted.code_pending
  return persisted
}
