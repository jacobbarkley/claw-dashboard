// Server-side loaders for Research Lab cold artifacts.
//
// Cold tree layout (per trading-bot/src/openclaw_core/research_lab/paths.py):
//   data/research_lab/<scope>/results/result_<result_id>.json
//   data/research_lab/<scope>/candidates/candidate_<candidate_id>.json
//
// For Phase 1a, candidate_id is deterministically `candidate_<job_id>` —
// so we can look up the candidate by job_id directly, no need to scan
// candidates for a matching result_id.
//
// These files land in the trading-bot repo today. Once Codex's mirror
// script ships, they'll also land here in the dashboard repo and the
// readers below will actually find files. Until then, every read falls
// through to null and the UI renders honest empty states.

import { promises as fs } from "fs"
import path from "path"

import { PHASE_1_DEFAULT_SCOPE } from "./research-lab-contracts"
import type { CandidateV1, ResultV1, ScopeTriple } from "./research-lab-contracts"

function scopeRoot(scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE): string {
  return path.join(
    process.cwd(),
    "data",
    "research_lab",
    scope.user_id,
    scope.account_id,
    scope.strategy_group_id,
  )
}

async function readJsonIfPresent<T>(absPath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(absPath, "utf-8")
    return JSON.parse(raw) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    // Surface actual parse errors to server logs but don't crash the page.
    console.error(`[research-lab-cold] failed to read ${absPath}:`, err)
    return null
  }
}

export async function loadResultById(
  resultId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<ResultV1 | null> {
  if (!resultId || !/^[A-Za-z0-9_.:-]+$/.test(resultId)) return null
  const filename = resultId.startsWith("result_") ? `${resultId}.json` : `result_${resultId}.json`
  return readJsonIfPresent<ResultV1>(path.join(scopeRoot(scope), "results", filename))
}

export async function loadCandidateByJobId(
  jobId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<CandidateV1 | null> {
  if (!jobId || !/^[A-Za-z0-9_.:-]+$/.test(jobId)) return null
  // Codex's executor names the candidate deterministically as
  // candidate_<job_id>. See build_candidate_projection in executor.py.
  return readJsonIfPresent<CandidateV1>(
    path.join(scopeRoot(scope), "candidates", `candidate_candidate_${jobId}.json`),
  )
}

// Also expose a direct-by-id lookup for when we have the candidate_id.
export async function loadCandidateById(
  candidateId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<CandidateV1 | null> {
  if (!candidateId || !/^[A-Za-z0-9_.:-]+$/.test(candidateId)) return null
  const filename = candidateId.startsWith("candidate_")
    ? `${candidateId}.json`
    : `candidate_${candidateId}.json`
  return readJsonIfPresent<CandidateV1>(path.join(scopeRoot(scope), "candidates", filename))
}
