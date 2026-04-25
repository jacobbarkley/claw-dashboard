// Server-side loader for research-lab ideas (idea.v1).
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
// and the form navigates to the detail page — but the detail page may
// route into the *previous* deployment's bundle for ~60s until the auto-
// deploy completes. To make the loader robust to that window, after a
// local FS miss we fall back to a raw GitHub fetch. Once Vercel rebuilds,
// the local hit returns first (faster path) and the GitHub fetch is only
// used for the post-create window.

import { promises as fs } from "fs"
import path from "path"
import yaml from "js-yaml"

import { PHASE_1_DEFAULT_SCOPE } from "./research-lab-contracts"
import type { IdeaV1, ScopeTriple } from "./research-lab-contracts"

const GITHUB_RAW = "https://raw.githubusercontent.com/jacobbarkley/claw-dashboard/main"

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

async function readYamlIfPresent(absPath: string): Promise<IdeaV1 | null> {
  try {
    const raw = await fs.readFile(absPath, "utf-8")
    const parsed = yaml.load(raw)
    if (parsed && typeof parsed === "object") return parsed as IdeaV1
    return null
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    console.error(`[research-lab-ideas] failed to read ${absPath}:`, err)
    return null
  }
}

function ideaRepoRelpath(ideaId: string, scope: ScopeTriple): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/ideas/${ideaId}.yaml`
}

async function fetchYamlFromGithub(
  ideaId: string,
  scope: ScopeTriple,
): Promise<IdeaV1 | null> {
  const url = `${GITHUB_RAW}/${ideaRepoRelpath(ideaId, scope)}`
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const text = await res.text()
    const parsed = yaml.load(text)
    if (parsed && typeof parsed === "object") return parsed as IdeaV1
    return null
  } catch (err) {
    console.error(`[research-lab-ideas] github fallback failed for ${ideaId}:`, err)
    return null
  }
}

export async function loadIdeaById(
  ideaId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<IdeaV1 | null> {
  if (!ideaId || !/^[A-Za-z0-9_.:-]+$/.test(ideaId)) return null
  const local = await readYamlIfPresent(ideaPath(ideaId, scope))
  if (local) return local
  // Local FS miss — could be a brand-new idea whose Vercel deploy hasn't
  // landed yet. Try the raw GitHub blob on main as a deterministic
  // fallback so post-create navigation always resolves.
  return fetchYamlFromGithub(ideaId, scope)
}

export async function loadIdeas(
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<IdeaV1[]> {
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
  return ideas.filter((i): i is IdeaV1 => i != null)
}
