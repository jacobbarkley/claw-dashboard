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

import { promises as fs } from "fs"
import path from "path"
import yaml from "js-yaml"

import { PHASE_1_DEFAULT_SCOPE } from "./research-lab-contracts"
import type { IdeaV1, ScopeTriple } from "./research-lab-contracts"

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

export async function loadIdeaById(
  ideaId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<IdeaV1 | null> {
  if (!ideaId || !/^[A-Za-z0-9_.:-]+$/.test(ideaId)) return null
  return readYamlIfPresent(ideaPath(ideaId, scope))
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
