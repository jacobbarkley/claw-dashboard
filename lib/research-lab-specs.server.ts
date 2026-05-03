// Server-side loader for research-lab strategy specs (strategy_spec.v1).
//
// Specs are dashboard-authored or system-authored implementation contracts,
// git-tracked at:
//   data/research_lab/<user>/<account>/<group>/strategy_specs/<spec_id>.yaml
//
// They are deliberately separate from ideas: the idea is the durable thesis,
// while the spec is the versioned bridge toward strategy implementation.

import { promises as fs } from "fs"
import path from "path"
import yaml from "js-yaml"

import { PHASE_1_DEFAULT_SCOPE } from "./research-lab-contracts"
import type { ScopeTriple, StrategySpecV1 } from "./research-lab-contracts"
import { readDashboardDirectory, readDashboardFileText } from "./github-multi-file-commit.server"

const GITHUB_RAW = "https://raw.githubusercontent.com/jacobbarkley/claw-dashboard/main"
const GITHUB_API = "https://api.github.com/repos/jacobbarkley/claw-dashboard/contents"
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export function strategySpecsDir(scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE): string {
  return path.join(
    process.cwd(),
    "data",
    "research_lab",
    scope.user_id,
    scope.account_id,
    scope.strategy_group_id,
    "strategy_specs",
  )
}

export function strategySpecPath(
  specId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): string {
  return path.join(strategySpecsDir(scope), `${specId}.yaml`)
}

export function strategySpecRepoRelpath(specId: string, scope: ScopeTriple): string {
  return `${strategySpecsRepoDirRelpath(scope)}/${specId}.yaml`
}

function strategySpecsRepoDirRelpath(scope: ScopeTriple): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/strategy_specs`
}

function normalizeStrategySpec(parsed: unknown): StrategySpecV1 | null {
  if (!parsed || typeof parsed !== "object") return null
  const raw = parsed as Record<string, unknown>
  const schemaVersion = raw.schema_version ?? raw.schema
  if (schemaVersion !== "research_lab.strategy_spec.v1") return null
  const canonicalRaw = { ...raw }
  delete canonicalRaw.schema
  const createdAt = normalizeDateString(canonicalRaw.created_at)
  return {
    ...canonicalRaw,
    schema_version: "research_lab.strategy_spec.v1",
    created_at: createdAt,
    universe: (canonicalRaw.universe ?? {}) as Record<string, unknown>,
    risk_model: (canonicalRaw.risk_model ?? {}) as Record<string, unknown>,
    sweep_params: (canonicalRaw.sweep_params ?? {}) as Record<string, unknown>,
    required_data: Array.isArray(canonicalRaw.required_data) ? canonicalRaw.required_data : [],
    acceptance_criteria: (canonicalRaw.acceptance_criteria ?? {}) as Record<string, unknown>,
    benchmark: (canonicalRaw.benchmark ?? null) as string | null,
    candidate_strategy_family: (canonicalRaw.candidate_strategy_family ?? null) as string | null,
    implementation_notes: (canonicalRaw.implementation_notes ?? null) as string | null,
    parent_spec_id: (canonicalRaw.parent_spec_id ?? null) as string | null,
    registered_strategy_id: (canonicalRaw.registered_strategy_id ?? null) as string | null,
    approved_at: normalizeNullableDateString(canonicalRaw.approved_at),
    approved_by: (canonicalRaw.approved_by ?? null) as string | null,
    preset_id: (canonicalRaw.preset_id ?? null) as string | null,
  } as StrategySpecV1
}

function normalizeDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") return value
  return ""
}

function normalizeNullableDateString(value: unknown): string | null {
  if (value == null) return null
  const normalized = normalizeDateString(value)
  return normalized || null
}

async function readYamlIfPresent(absPath: string): Promise<StrategySpecV1 | null> {
  try {
    const raw = await fs.readFile(absPath, "utf-8")
    return normalizeStrategySpec(yaml.load(raw))
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    console.error(`[research-lab-specs] failed to read ${absPath}:`, err)
    return null
  }
}

async function fetchYamlFromGithub(
  specId: string,
  scope: ScopeTriple,
): Promise<StrategySpecV1 | null> {
  const url = `${GITHUB_RAW}/${strategySpecRepoRelpath(specId, scope)}`
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const parsed = yaml.load(await res.text())
    return normalizeStrategySpec(parsed)
  } catch (err) {
    console.error(`[research-lab-specs] github fallback failed for ${specId}:`, err)
    return null
  }
}

export async function loadStrategySpecById(
  specId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<StrategySpecV1 | null> {
  if (!specId || !SAFE_ID.test(specId)) return null
  if (process.env.GITHUB_TOKEN) {
    const raw = await readDashboardFileText(strategySpecRepoRelpath(specId, scope))
    if (raw) return normalizeStrategySpec(yaml.load(raw))
    return null
  }
  const local = await readYamlIfPresent(strategySpecPath(specId, scope))
  if (local) return local
  return fetchYamlFromGithub(specId, scope)
}

export async function loadStrategySpecs(
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<StrategySpecV1[]> {
  if (process.env.GITHUB_TOKEN) {
    const githubSpecs = await fetchSpecsDirectoryFromGithub(scope)
    if (githubSpecs) return githubSpecs
  }

  const dir = strategySpecsDir(scope)
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return []
    console.error(`[research-lab-specs] failed to list ${dir}:`, err)
    return []
  }
  const yamlFiles = entries.filter(e => e.endsWith(".yaml") || e.endsWith(".yml"))
  const specs = await Promise.all(yamlFiles.map(f => readYamlIfPresent(path.join(dir, f))))
  return specs.filter((s): s is StrategySpecV1 => s != null)
}

export async function loadStrategySpecsForIdea(
  ideaId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<StrategySpecV1[]> {
  if (!ideaId || !SAFE_ID.test(ideaId)) return []
  const localSpecs = await loadStrategySpecs(scope)
  const githubSpecs = await fetchSpecsDirectoryFromGithub(scope) ?? []
  const specsById = new Map<string, StrategySpecV1>()
  for (const spec of [...localSpecs, ...githubSpecs]) specsById.set(spec.spec_id, spec)
  return [...specsById.values()]
    .filter(spec => spec.idea_id === ideaId)
    .sort((a, b) => {
      if (a.spec_version !== b.spec_version) return b.spec_version - a.spec_version
      return b.created_at.localeCompare(a.created_at)
    })
}

async function fetchSpecsDirectoryFromGithub(scope: ScopeTriple): Promise<StrategySpecV1[] | null> {
  const dirRelpath = strategySpecsRepoDirRelpath(scope)
  if (process.env.GITHUB_TOKEN) {
    const entries = await readDashboardDirectory(dirRelpath)
    if (!entries) return null
    const yamlEntries = entries.filter(
      entry =>
        entry.type === "file" &&
        (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")),
    )
    const specs = await Promise.all(
      yamlEntries.map(async entry => {
        const raw = await readDashboardFileText(entry.path)
        if (!raw) return null
        return normalizeStrategySpec(yaml.load(raw))
      }),
    )
    return specs.filter((spec): spec is StrategySpecV1 => spec != null)
  }

  try {
    const res = await fetch(`${GITHUB_API}/${dirRelpath}?ref=main`, { cache: "no-store" })
    if (!res.ok) return []
    const entries = (await res.json()) as Array<{ name?: string; download_url?: string | null; type?: string }>
    if (!Array.isArray(entries)) return []
    const yamlEntries = entries.filter(
      entry =>
        entry.type === "file" &&
        entry.download_url &&
        (entry.name?.endsWith(".yaml") || entry.name?.endsWith(".yml")),
    )
    const specs = await Promise.all(
      yamlEntries.map(async entry => {
        try {
          const fileRes = await fetch(entry.download_url!, { cache: "no-store" })
          if (!fileRes.ok) return null
          return normalizeStrategySpec(yaml.load(await fileRes.text()))
        } catch {
          return null
        }
      }),
    )
    return specs.filter((spec): spec is StrategySpecV1 => spec != null)
  } catch (err) {
    console.error(`[research-lab-specs] github directory fallback failed for ${dirRelpath}:`, err)
    return null
  }
}
