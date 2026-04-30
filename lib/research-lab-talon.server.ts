// Shared server-side helpers for the Talon spec-drafting + spec-revision
// endpoints. Both endpoints emit the same proposal/assessment shapes and run
// the same data-readiness floor, so the schemas + builders + prompt rules
// live here rather than being duplicated. Anthropic's structured-output JSON
// Schema subset rejects validation keywords (.min/.max), so we expose two
// schemas per shape: a loose one for the provider call and a strict one for
// the server-side parse after generation.

import { z } from "zod"
import type { ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"
import {
  capabilityMatchesRequest,
  type DataCapabilityCatalogV1,
  type DataReadinessAssessment,
  type ModelDataRequirement,
} from "./research-lab-data-capabilities.server"

// ─── Schemas ────────────────────────────────────────────────────────────────

const requirementStatusSchema = z.enum(["AVAILABLE", "PARTIAL", "MISSING"])

const proposalLoose = z.object({
  signal_logic: z.string(),
  entry_rules: z.string(),
  exit_rules: z.string(),
  risk_model: z.string(),
  universe: z.string(),
  required_data: z.array(z.string()),
  benchmark: z.string(),
  acceptance_criteria: z.object({
    min_sharpe: z.number(),
    max_drawdown_pct: z.number(),
    min_hit_rate_pct: z.number(),
    other: z.string().optional().nullable(),
  }),
  candidate_strategy_family: z.string().optional().nullable(),
  sweep_params: z.string().optional().nullable(),
  implementation_notes: z.string().optional().nullable(),
})

const proposalStrict = z.object({
  signal_logic: z.string().min(40),
  entry_rules: z.string().min(20),
  exit_rules: z.string().min(20),
  risk_model: z.string().min(20),
  universe: z.string().min(10),
  required_data: z.array(z.string().min(1)).min(1),
  benchmark: z.string().min(1),
  acceptance_criteria: z.object({
    min_sharpe: z.number().min(0),
    max_drawdown_pct: z.number().min(0).max(100),
    min_hit_rate_pct: z.number().min(0).max(100),
    other: z.string().optional().nullable(),
  }),
  candidate_strategy_family: z.string().optional().nullable(),
  sweep_params: z.string().optional().nullable(),
  implementation_notes: z.string().optional().nullable(),
})

const assessmentLoose = z.object({
  verdict: z.enum(["PASS", "WARN", "BLOCKED"]),
  requirements: z.array(z.object({
    requested: z.string(),
    core: z.boolean().optional().nullable(),
    status: requirementStatusSchema.optional().nullable(),
    matched_capability: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })),
  blocking_summary: z.string().optional().nullable(),
  suggested_action: z.string().optional().nullable(),
  warnings: z.array(z.string()).optional(),
})

const assessmentStrict = z.object({
  verdict: z.enum(["PASS", "WARN", "BLOCKED"]),
  requirements: z.array(z.object({
    requested: z.string().min(1),
    core: z.boolean().optional().nullable(),
    status: requirementStatusSchema.optional().nullable(),
    matched_capability: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })).min(1),
  blocking_summary: z.string().optional().nullable(),
  suggested_action: z.string().optional().nullable(),
  warnings: z.array(z.string()).optional().default([]),
})

// Draft endpoint produces {proposal, assessment} on every call.
export const draftGenerationSchema = z.object({
  proposal: proposalLoose,
  assessment: assessmentLoose,
})

export const draftOutputSchema = z.object({
  proposal: proposalStrict,
  assessment: assessmentStrict,
})

// Revise endpoint produces {kind, reply, proposal?, assessment?}; the
// provider sees a fully-optional shape and the server checks afterwards
// that kind="revision" carries proposal+assessment.
export const reviseGenerationSchema = z.object({
  kind: z.enum(["clarification", "revision"]),
  reply: z.string(),
  proposal: proposalLoose.optional().nullable(),
  assessment: assessmentLoose.optional().nullable(),
})

export const reviseOutputSchema = z.object({
  kind: z.enum(["clarification", "revision"]),
  reply: z.string().min(1),
  proposal: proposalStrict.optional().nullable(),
  assessment: assessmentStrict.optional().nullable(),
})

export type TalonProposal = z.infer<typeof proposalStrict>
export type TalonAssessment = z.infer<typeof assessmentStrict>
export type TalonReviseOutput = z.infer<typeof reviseOutputSchema>

// ─── Verdict reconciliation ─────────────────────────────────────────────────

export function applyModelVerdictFloor(
  serverReadiness: DataReadinessAssessment,
  modelAssessment: TalonAssessment,
): DataReadinessAssessment {
  const rank = { PASS: 0, WARN: 1, BLOCKED: 2 } as const
  if (rank[modelAssessment.verdict] <= rank[serverReadiness.verdict]) {
    return serverReadiness
  }

  if (modelAssessment.verdict === "WARN") {
    const warnings = mergeStrings(
      serverReadiness.warnings,
      modelAssessment.warnings.length
        ? modelAssessment.warnings
        : ["Talon returned WARN even though the catalog resolver found no partial or missing source."],
    )
    return {
      ...serverReadiness,
      verdict: "WARN",
      warnings,
      discrepancies: [
        ...serverReadiness.discrepancies,
        `model returned WARN, server resolved ${serverReadiness.verdict}; using stricter model verdict`,
      ],
    }
  }

  return {
    ...serverReadiness,
    verdict: "BLOCKED",
    blocking_summary:
      modelAssessment.blocking_summary?.trim() ||
      "Talon marked the draft blocked by unavailable core data.",
    suggested_action:
      modelAssessment.suggested_action?.trim() ||
      "Re-thesis the idea around available data, or add the missing connector before drafting.",
    discrepancies: [
      ...serverReadiness.discrepancies,
      `model returned BLOCKED, server resolved ${serverReadiness.verdict}; using stricter model verdict`,
    ],
  }
}

export function includeProposalRequirements({
  requiredData,
  assessedRequirements,
  catalog,
}: {
  requiredData: string[]
  assessedRequirements: ModelDataRequirement[]
  catalog: DataCapabilityCatalogV1
}): ModelDataRequirement[] {
  const capabilitiesById = new Map(catalog.capabilities.map(capability => [
    capability.capability_id,
    capability,
  ]))
  const missingAssessments = requiredData
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => !assessedRequirements.some(req => requirementCoversProposalItem({
      proposalItem: item,
      assessedRequirement: req,
      capabilitiesById,
    })))
    .map(item => ({
      requested: item,
      core: true,
      status: "MISSING" as const,
      matched_capability: null,
      notes: "Talon proposed this required_data entry but did not assess it against the catalog.",
    }))
  return [...assessedRequirements, ...missingAssessments]
}

function requirementCoversProposalItem({
  proposalItem,
  assessedRequirement,
  capabilitiesById,
}: {
  proposalItem: string
  assessedRequirement: ModelDataRequirement
  capabilitiesById: Map<string, DataCapabilityCatalogV1["capabilities"][number]>
}): boolean {
  if (requirementLabelsOverlap(proposalItem, assessedRequirement.requested)) {
    return true
  }
  const matchedCapability = assessedRequirement.matched_capability
    ? capabilitiesById.get(assessedRequirement.matched_capability)
    : null
  return matchedCapability ? capabilityMatchesRequest(matchedCapability, proposalItem) : false
}

function requirementLabelsOverlap(first: string, second: string): boolean {
  const a = normalizeRequirementLabel(first)
  const b = normalizeRequirementLabel(second)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

function normalizeRequirementLabel(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

// ─── Spec construction ─────────────────────────────────────────────────────

export interface BuildStrategySpecArgs {
  specId: string
  scope: ScopeTriple
  ideaId: string
  authoredBy: string
  proposal: TalonProposal
  readiness: DataReadinessAssessment
  // For revise — carry these forward from the existing spec.
  base?: {
    spec_version?: number
    parent_spec_id?: string | null
    created_at?: string
    state?: StrategySpecV1["state"]
  }
}

export function buildStrategySpec({
  specId,
  scope,
  ideaId,
  authoredBy,
  proposal,
  readiness,
  base,
}: BuildStrategySpecArgs): StrategySpecV1 {
  return {
    schema_version: "research_lab.strategy_spec.v1",
    spec_id: specId,
    spec_version: base?.spec_version ?? 1,
    idea_id: ideaId,
    user_id: scope.user_id,
    account_id: scope.account_id,
    strategy_group_id: scope.strategy_group_id,
    created_at: base?.created_at ?? new Date().toISOString(),
    authoring_mode: "AI_DRAFTED",
    authored_by: authoredBy,
    state: base?.state ?? "DRAFTING",
    signal_logic: proposal.signal_logic.trim(),
    universe: descriptionRecord(proposal.universe),
    entry_rules: proposal.entry_rules.trim(),
    exit_rules: proposal.exit_rules.trim(),
    risk_model: descriptionRecord(proposal.risk_model),
    sweep_params: descriptionRecord(proposal.sweep_params ?? ""),
    required_data: dedupeStrings(proposal.required_data),
    benchmark: normalizeBenchmark(proposal.benchmark),
    acceptance_criteria: {
      min_sharpe: proposal.acceptance_criteria.min_sharpe,
      max_drawdown: proposal.acceptance_criteria.max_drawdown_pct,
      min_hit_rate: proposal.acceptance_criteria.min_hit_rate_pct,
      ...(proposal.acceptance_criteria.other?.trim()
        ? { other: proposal.acceptance_criteria.other.trim() }
        : {}),
    },
    candidate_strategy_family: proposal.candidate_strategy_family?.trim() || null,
    implementation_notes: buildImplementationNotes(proposal.implementation_notes, readiness),
    parent_spec_id: base?.parent_spec_id ?? null,
    registered_strategy_id: null,
  }
}

export function buildImplementationNotes(
  modelNotes: string | null | undefined,
  readiness: DataReadinessAssessment,
): string | null {
  const notes = modelNotes?.trim() || ""
  if (readiness.verdict !== "WARN") return notes || null
  const warningBlock = [
    "Data-readiness warnings:",
    ...readiness.warnings.map(warning => `- ${warning}`),
  ].join("\n")
  return notes ? `${warningBlock}\n\n${notes}` : warningBlock
}

export function specProvenanceRelpath(specId: string, scope: ScopeTriple): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/strategy_specs/${specId}_provenance.json`
}

// ─── Prompt fragments ──────────────────────────────────────────────────────

export const DATA_READINESS_PROMPT_RULES = [
  "Data readiness rules:",
  "- PASS only when every core requirement maps to AVAILABLE.",
  "- WARN when requirements map to PARTIAL, or when a non-core nice-to-have is missing.",
  "- BLOCKED when any core signal, entry rule, or exit rule requires missing data.",
  "- When unsure whether data is core, treat it as core.",
  "- Thin theses are allowed. Unavailable data is not allowed.",
  "",
  "Requirement-emission rules (avoid false BLOCKEDs):",
  "- One capability per underlying feed. If a signal is derivable from OHLCV (volume, ADV, returns, momentum, moving averages, RSI, realized vol, mean reversion), list `alpaca_equity_ohlcv` (or the relevant OHLCV capability) once. Do NOT emit each derived metric as a separate `assessment.requirements` row.",
  "- When a catalog capability is the proxy for a thesis-mentioned source (e.g. apewisdom_top100 covers WSB / X / Twitter / StockTwits attention), list ONLY the proxy. Do not also list the upstream source names — that produces duplicate MISSING rows for data that's already covered.",
  "- If you must mention a thesis source that the actual spec does not depend on (incidental flavor, replaced by a proxy, deferred to v2), set `core: false` on that requirement OR omit it entirely. The verdict floor treats `core` as true by default; an unset `core` on a MISSING row will escalate to BLOCKED, even if your `notes` say it's non-core.",
].join("\n")

export function formatCatalogForPrompt(catalog: DataCapabilityCatalogV1): string {
  return catalog.capabilities
    .map(capability => {
      const sleeves = capability.sleeves.join(", ")
      const coverage = capability.asof_coverage ? ` coverage=${capability.asof_coverage}` : ""
      const notes = capability.notes ? ` notes=${capability.notes}` : ""
      return `- ${capability.capability_id}: ${capability.category}; ${capability.status}; sleeves=${sleeves};${coverage}${notes}`
    })
    .join("\n")
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (trimmed && !seen.has(key)) {
      seen.add(key)
      out.push(trimmed)
    }
  }
  return out
}

function descriptionRecord(description: string): Record<string, unknown> {
  const trimmed = description.trim()
  return trimmed ? { description: trimmed } : {}
}

function normalizeBenchmark(input: string): string | null {
  const trimmed = input.trim()
  return trimmed ? trimmed : null
}

function mergeStrings(first: string[], second: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of [...first, ...second]) {
    const trimmed = value.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      out.push(trimmed)
    }
  }
  return out
}
