// Server-side helpers for Phase E spec implementation queue artifacts.

import { promises as fs } from "fs"
import path from "path"
import yaml from "js-yaml"

import { PHASE_1_DEFAULT_SCOPE } from "./research-lab-contracts"
import type {
  ScopeTriple,
  SpecImplementationQueueState,
  SpecImplementationQueueV1,
} from "./research-lab-contracts"
import { readDashboardFileText } from "./github-multi-file-commit.server"

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export function specImplementationQueueDir(scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE): string {
  return path.join(
    process.cwd(),
    "data",
    "research_lab",
    scope.user_id,
    scope.account_id,
    scope.strategy_group_id,
    "spec_implementation_queue",
  )
}

export function specImplementationQueueRelpath(specId: string, scope: ScopeTriple): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/spec_implementation_queue/${specId}.yaml`
}

export function specImplementationQueuePath(
  specId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): string {
  return path.join(specImplementationQueueDir(scope), `${specId}.yaml`)
}

export function specAuditLogRelpath(specId: string, scope: ScopeTriple): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/strategy_specs/${specId}_events.jsonl`
}

export async function loadSpecImplementationQueueEntry(
  specId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<SpecImplementationQueueV1 | null> {
  if (!SAFE_ID.test(specId)) return null
  const raw = await readDashboardFileText(specImplementationQueueRelpath(specId, scope))
  if (raw) return normalizeQueueEntry(yaml.load(raw))
  return readQueueYamlIfPresent(specImplementationQueuePath(specId, scope))
}

export function normalizeQueueEntry(parsed: unknown): SpecImplementationQueueV1 | null {
  if (!parsed || typeof parsed !== "object") return null
  const raw = parsed as Record<string, unknown>
  if (raw.schema_version !== "research_lab.spec_implementation_queue.v1") return null
  return {
    ...raw,
    schema_version: "research_lab.spec_implementation_queue.v1",
    attempts: typeof raw.attempts === "number" ? raw.attempts : Number(raw.attempts ?? 0),
    claimed_at: nullableDateString(raw.claimed_at),
    implementation_started_at: nullableDateString(raw.implementation_started_at),
    implementation_finished_at: nullableDateString(raw.implementation_finished_at),
    last_error_at: nullableDateString(raw.last_error_at),
    cancelled_at: nullableDateString(raw.cancelled_at),
    claimed_by: nullableString(raw.claimed_by),
    implementation_commit: nullableString(raw.implementation_commit),
    registered_strategy_id: nullableString(raw.registered_strategy_id),
    preset_id: nullableString(raw.preset_id),
    last_error: nullableString(raw.last_error),
    cancelled_by: nullableString(raw.cancelled_by),
    cancel_reason: nullableString(raw.cancel_reason),
  } as SpecImplementationQueueV1
}

export function isQueueTerminal(state: SpecImplementationQueueState): boolean {
  return state === "COMPLETED" || state === "FAILED" || state === "CANCELLED"
}

async function readQueueYamlIfPresent(absPath: string): Promise<SpecImplementationQueueV1 | null> {
  try {
    const raw = await fs.readFile(absPath, "utf-8")
    return normalizeQueueEntry(yaml.load(raw))
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    console.error(`[research-lab-queue] failed to read ${absPath}:`, err)
    return null
  }
}

function nullableString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function nullableDateString(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") return value
  return null
}
