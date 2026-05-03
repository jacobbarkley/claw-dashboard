// Server-side loader for research-lab ideas (idea.v1 + idea.v2).
//
// Ideas are dashboard-authored, git-tracked, stored as YAML at:
//   data/research_lab/<user>/<account>/<group>/ideas/<idea_id>.yaml
//
// Same trust model as the governed request inbox: operator commits idea
// specs to the dashboard repo; the trading-bot worker reads them via git
// history on its rollup-producer sync pass. Full chat transcripts are NOT
// committed here — only the finished idea.v1 artifact + (eventually) a
// compact provenance summary. Per Codex's guardrail, draft state lives
// in scratch/runtime, not git.
//
// Vercel deploy race
// ──────────────────
// Vercel serverless functions read from a build-time filesystem snapshot.
// When the operator authors a new idea, the POST commits a YAML to GitHub
// and the form navigates to the detail page — but the detail page may route
// into the *previous* deployment's bundle for ~60s until the auto-deploy
// completes. In production, GITHUB_TOKEN tells us to read the live GitHub
// file first; in local dev, we keep the fast local read with a raw GitHub
// fallback for the post-create window.

import { promises as fs } from "fs"
import path from "path"
import yaml from "js-yaml"

import { PHASE_1_DEFAULT_SCOPE } from "./research-lab-contracts"
import type { IdeaArtifact, IdeaV1, IdeaV2, ScopeTriple, StrategyRefV2 } from "./research-lab-contracts"
import { readDashboardDirectory, readDashboardFileText } from "./github-multi-file-commit.server"

const GITHUB_RAW = "https://raw.githubusercontent.com/jacobbarkley/claw-dashboard/main"
const PRESET_INDEX_PATH = path.join(process.cwd(), "data", "research_lab", "presets", "_index.json")
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

function ideasDir(scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE): string {
  return path.join(
    process.cwd(),
    "data",
    "research_lab",
    scope.user_id,
    scope.account_id,
    scope.strategy_group_id,
    "ideas",
  )
}

export function ideaPath(ideaId: string, scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE): string {
  return path.join(ideasDir(scope), `${ideaId}.yaml`)
}

async function strategyFamilyById(): Promise<Map<string, string>> {
  try {
    const raw = await fs.readFile(PRESET_INDEX_PATH, "utf-8")
    const parsed = JSON.parse(raw) as { presets?: { strategy_id?: string; strategy_family?: string }[] }
    const map = new Map<string, string>()
    for (const preset of parsed.presets ?? []) {
      if (preset.strategy_id && preset.strategy_family && !map.has(preset.strategy_id)) {
        map.set(preset.strategy_id, preset.strategy_family)
      }
    }
    return map
  } catch {
    return new Map()
  }
}

function hasMeaningfulSpecSeed(params: Record<string, unknown>): boolean {
  const spec = params.spec
  if (typeof spec === "string") return spec.trim().length > 0
  return spec != null
}

function normalizeIdeaArtifact(
  parsed: unknown,
  familyByStrategy: Map<string, string>,
): IdeaArtifact | null {
  if (!parsed || typeof parsed !== "object") return null
  const raw = parsed as Record<string, unknown>
  const schemaVersion = raw.schema_version ?? raw.schema
  if (schemaVersion === "research_lab.idea.v2") {
    const canonicalRaw = { ...raw }
    delete canonicalRaw.schema
    const idea = canonicalRaw as unknown as IdeaV2
    const strategyId = idea.strategy_ref?.strategy_id ?? ""
    const strategyFamily = strategyId ? familyByStrategy.get(strategyId) ?? null : null
    return {
      ...idea,
      schema_version: "research_lab.idea.v2",
      tags: idea.tags ?? [],
      params: idea.params ?? {},
      reference_strategies: idea.reference_strategies ?? [],
      needs_spec: idea.needs_spec === true,
      strategy_id: strategyId,
      strategy_family: strategyFamily,
      code_pending: idea.strategy_ref?.kind !== "REGISTERED",
    }
  }

  const v1 = raw as unknown as IdeaV1
  const params = v1.params ?? {}
  const codePending = v1.code_pending === true
  const strategyId = typeof v1.strategy_id === "string" ? v1.strategy_id.trim() : ""
  let strategyRef: StrategyRefV2
  let needsSpec = false
  if (codePending && hasMeaningfulSpecSeed(params)) {
    strategyRef = { kind: "SPEC_PENDING", active_spec_id: null, pending_spec_id: null, strategy_id: null, preset_id: null }
  } else if (codePending) {
    strategyRef = { kind: "NONE", active_spec_id: null, pending_spec_id: null, strategy_id: null, preset_id: null }
    needsSpec = true
  } else if (strategyId) {
    strategyRef = { kind: "REGISTERED", active_spec_id: null, pending_spec_id: null, strategy_id: strategyId, preset_id: null }
  } else {
    strategyRef = { kind: "NONE", active_spec_id: null, pending_spec_id: null, strategy_id: null, preset_id: null }
    needsSpec = true
  }
  const derivedStrategyId = strategyRef.strategy_id ?? ""
  return {
    schema_version: "research_lab.idea.v2",
    idea_id: v1.idea_id,
    user_id: v1.user_id,
    account_id: v1.account_id,
    strategy_group_id: v1.strategy_group_id,
    title: v1.title,
    thesis: v1.thesis,
    sleeve: v1.sleeve,
    tags: v1.tags ?? [],
    params,
    reference_strategies: [],
    strategy_ref: strategyRef,
    status: v1.status,
    needs_spec: needsSpec,
    created_at: v1.created_at,
    created_by: v1.created_by,
    source: v1.source,
    provenance: v1.provenance ?? null,
    promote_to_campaign: v1.promote_to_campaign === true,
    promotion_target: v1.promotion_target ?? null,
    strategy_id: derivedStrategyId,
    strategy_family:
      derivedStrategyId ? familyByStrategy.get(derivedStrategyId) ?? v1.strategy_family ?? null : null,
    code_pending: strategyRef.kind !== "REGISTERED",
  }
}

async function readYamlIfPresent(absPath: string): Promise<IdeaArtifact | null> {
  try {
    const raw = await fs.readFile(absPath, "utf-8")
    const parsed = yaml.load(raw)
    return normalizeIdeaArtifact(parsed, await strategyFamilyById())
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    console.error(`[research-lab-ideas] failed to read ${absPath}:`, err)
    return null
  }
}

function ideaRepoRelpath(ideaId: string, scope: ScopeTriple): string {
  return `${ideasRepoDirRelpath(scope)}/${ideaId}.yaml`
}

function ideasRepoDirRelpath(scope: ScopeTriple): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/ideas`
}

async function fetchYamlFromGithub(
  ideaId: string,
  scope: ScopeTriple,
): Promise<IdeaArtifact | null> {
  const url = `${GITHUB_RAW}/${ideaRepoRelpath(ideaId, scope)}`
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const text = await res.text()
    const parsed = yaml.load(text)
    return normalizeIdeaArtifact(parsed, await strategyFamilyById())
  } catch (err) {
    console.error(`[research-lab-ideas] github fallback failed for ${ideaId}:`, err)
    return null
  }
}

export async function loadIdeaById(
  ideaId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<IdeaArtifact | null> {
  if (!ideaId || !SAFE_ID.test(ideaId)) return null
  if (process.env.GITHUB_TOKEN) {
    const raw = await readDashboardFileText(ideaRepoRelpath(ideaId, scope))
    if (raw) return normalizeIdeaArtifact(yaml.load(raw), await strategyFamilyById())
    return null
  }
  const local = await readYamlIfPresent(ideaPath(ideaId, scope))
  if (local) return local
  // Local FS miss — could be a brand-new idea whose Vercel deploy hasn't
  // landed yet. Try the raw GitHub blob on main as a deterministic
  // fallback so post-create navigation always resolves.
  return fetchYamlFromGithub(ideaId, scope)
}

export async function loadIdeas(
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<IdeaArtifact[]> {
  if (process.env.GITHUB_TOKEN) {
    const githubIdeas = await fetchIdeasDirectoryFromGithub(scope)
    if (githubIdeas) return githubIdeas
  }

  const dir = ideasDir(scope)
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return []
    console.error(`[research-lab-ideas] failed to list ${dir}:`, err)
    return []
  }
  const yamlFiles = entries.filter(e => e.endsWith(".yaml") || e.endsWith(".yml"))
  const ideas = await Promise.all(
    yamlFiles.map(f => readYamlIfPresent(path.join(dir, f))),
  )
  return ideas.filter((i): i is IdeaArtifact => i != null)
}

async function fetchIdeasDirectoryFromGithub(scope: ScopeTriple): Promise<IdeaArtifact[] | null> {
  const entries = await readDashboardDirectory(ideasRepoDirRelpath(scope))
  if (!entries) return null
  const yamlEntries = entries.filter(
    entry =>
      entry.type === "file" &&
      (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")),
  )
  const ideas = await Promise.all(
    yamlEntries.map(async entry => {
      const raw = await readDashboardFileText(entry.path)
      if (!raw) return null
      return normalizeIdeaArtifact(yaml.load(raw), await strategyFamilyById())
    }),
  )
  return ideas.filter((idea): idea is IdeaArtifact => idea != null)
}
