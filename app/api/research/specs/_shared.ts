import { promises as fs } from "fs"
import path from "path"

import yaml from "js-yaml"

import type {
  IdeaArtifact,
  ScopeTriple,
  SpecAuthoringMode,
  StrategySpecState,
  StrategySpecV1,
} from "@/lib/research-lab-contracts"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { strategySpecPath, strategySpecRepoRelpath } from "@/lib/research-lab-specs.server"

const GITHUB_REPO = "jacobbarkley/claw-dashboard"
const GITHUB_API = "https://api.github.com"
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export const VALID_SPEC_STATES: StrategySpecState[] = [
  "DRAFTING",
  "AWAITING_APPROVAL",
  "APPROVED",
  "IMPLEMENTING",
  "REGISTERED",
  "REJECTED",
  "SUPERSEDED",
]

export const VALID_AUTHORING_MODES: SpecAuthoringMode[] = ["AI_DRAFTED", "OPERATOR_DRAFTED"]
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
): Promise<{ mode: "local" | "github"; file: string; commit_sha: string | null }> {
  validateStrategySpec(spec)
  const token = process.env.GITHUB_TOKEN
  return token
    ? persistGithub(spec, scope, token, commitMessage)
    : persistLocal(spec, scope)
}

export async function deleteStrategySpecArtifact(
  spec: StrategySpecV1,
  scope: ScopeTriple,
  commitMessage: string,
): Promise<{ mode: "local" | "github"; file: string; commit_sha: string | null }> {
  if (spec.state !== "DRAFTING") {
    throw new Error("Only DRAFTING strategy specs can be deleted.")
  }
  const token = process.env.GITHUB_TOKEN
  return token
    ? deleteGithub(spec, scope, token, commitMessage)
    : deleteLocal(spec, scope)
}

async function persistLocal(
  spec: StrategySpecV1,
  scope: ScopeTriple,
): Promise<{ mode: "local"; file: string; commit_sha: null }> {
  const absolutePath = strategySpecPath(spec.spec_id, scope)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, yaml.dump(stripSchemaAlias(spec), { noRefs: true, lineWidth: 100 }))
  return { mode: "local", file: strategySpecRepoRelpath(spec.spec_id, scope), commit_sha: null }
}

async function persistGithub(
  spec: StrategySpecV1,
  scope: ScopeTriple,
  token: string,
  commitMessage: string,
): Promise<{ mode: "github"; file: string; commit_sha: string }> {
  const relpath = strategySpecRepoRelpath(spec.spec_id, scope)
  const existingSha = await githubFileSha(relpath, token)
  const yamlText = strategySpecToYaml(spec)
  const content = Buffer.from(yamlText, "utf-8").toString("base64")
  const body: Record<string, unknown> = { message: commitMessage, content }
  if (existingSha) body.sha = existingSha
  const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${relpath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub PUT ${response.status}: ${detail}`)
  }
  const payload = (await response.json()) as { commit?: { sha?: string }; content?: { sha?: string } }
  return { mode: "github", file: relpath, commit_sha: payload.commit?.sha ?? payload.content?.sha ?? "" }
}

async function deleteLocal(
  spec: StrategySpecV1,
  scope: ScopeTriple,
): Promise<{ mode: "local"; file: string; commit_sha: null }> {
  const absolutePath = strategySpecPath(spec.spec_id, scope)
  try {
    await fs.unlink(absolutePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err
  }
  return { mode: "local", file: strategySpecRepoRelpath(spec.spec_id, scope), commit_sha: null }
}

async function deleteGithub(
  spec: StrategySpecV1,
  scope: ScopeTriple,
  token: string,
  commitMessage: string,
): Promise<{ mode: "github"; file: string; commit_sha: string }> {
  const relpath = strategySpecRepoRelpath(spec.spec_id, scope)
  const existingSha = await githubFileSha(relpath, token)
  if (!existingSha) throw new Error(`GitHub file not found: ${relpath}`)
  const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${relpath}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ message: commitMessage, sha: existingSha }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub DELETE ${response.status}: ${detail}`)
  }
  const payload = (await response.json()) as { commit?: { sha?: string } }
  return { mode: "github", file: relpath, commit_sha: payload.commit?.sha ?? "" }
}

async function githubFileSha(relpath: string, token: string): Promise<string | null> {
  const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${relpath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  })
  if (response.status === 404) return null
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`GitHub GET ${response.status}: ${detail}`)
  }
  const payload = (await response.json()) as { sha?: string }
  return payload.sha ?? null
}

function stripSchemaAlias(spec: StrategySpecV1): Record<string, unknown> {
  const { schema: _schema, ...persisted } = spec as StrategySpecV1 & { schema?: unknown }
  return persisted
}

function stripIdeaViewFields(idea: IdeaArtifact): Record<string, unknown> {
  const {
    schema: _schema,
    strategy_id: _strategyId,
    strategy_family: _strategyFamily,
    code_pending: _codePending,
    ...persisted
  } = idea as IdeaArtifact & { schema?: unknown }
  return persisted
}
