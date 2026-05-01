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
import type {
  CandidateV1,
  EquitySwarmV1,
  ResultV1,
  ScopeTriple,
} from "./research-lab-contracts"

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

// Codex's paths.py unconditionally prepends "result_" / "candidate_" to
// the id, and the id itself already carries that prefix
// (result_id = "result_<job_id>", candidate_id = "candidate_<job_id>").
// That's why the files on disk have the double-prefix shape:
//   result_result_<job_id>.json
//   candidate_candidate_<job_id>.json
// We mirror the helper's behavior exactly — always prefix, never branch.

export async function loadResultById(
  resultId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<ResultV1 | null> {
  if (!resultId || !/^[A-Za-z0-9_.:-]+$/.test(resultId)) return null
  return readJsonIfPresent<ResultV1>(
    path.join(scopeRoot(scope), "results", `result_${resultId}.json`),
  )
}

export async function loadCandidateByJobId(
  jobId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<CandidateV1 | null> {
  if (!jobId || !/^[A-Za-z0-9_.:-]+$/.test(jobId)) return null
  return readJsonIfPresent<CandidateV1>(
    path.join(scopeRoot(scope), "candidates", `candidate_candidate_${jobId}.json`),
  )
}

export async function loadCandidateById(
  candidateId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<CandidateV1 | null> {
  if (!candidateId || !/^[A-Za-z0-9_.:-]+$/.test(candidateId)) return null
  return readJsonIfPresent<CandidateV1>(
    path.join(scopeRoot(scope), "candidates", `candidate_${candidateId}.json`),
  )
}

// Loads an equity_swarm.v1 artifact from a repo-relative path stamped by
// the producer in `ResultV1.equity_swarm_artifact.path`. Path is checked
// to live under data/research_lab/ so a tampered result file can't read
// arbitrary files off the deployment filesystem.
export async function loadEquitySwarmFromArtifactPath(
  artifactPath: string,
): Promise<EquitySwarmV1 | null> {
  if (!artifactPath || typeof artifactPath !== "string") return null
  if (!artifactPath.endsWith(".json")) return null
  if (artifactPath.includes("..")) return null
  if (!artifactPath.startsWith("data/research_lab/")) return null
  return readJsonIfPresent<EquitySwarmV1>(
    path.join(process.cwd(), artifactPath),
  )
}
