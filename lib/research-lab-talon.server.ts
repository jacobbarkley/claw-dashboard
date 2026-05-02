// Shared server-side helpers for the Talon spec-drafting + spec-revision
// endpoints. Both endpoints emit the same proposal/assessment shapes and run
// the same data-readiness floor, so the schemas + builders + prompt rules
// live here rather than being duplicated. Anthropic's structured-output JSON
// Schema subset rejects validation keywords (.min/.max), and the full Lab
// spec grammar became too large once experiment plans landed. The provider now
// sees a tiny JSON-string envelope; the server parses those strings and applies
// the full strict contract before anything is persisted or returned.

import { z } from "zod"
import type { ExperimentPlanV1, ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"
import { withComputedExperimentPlanValidity } from "@/lib/research-lab-experiment-plan"
import {
  capabilityMatchesRequest,
  type DataCapabilityCatalogV1,
  type DataReadinessAssessment,
  type ModelDataRequirement,
} from "./research-lab-data-capabilities.server"

// ─── Schemas ────────────────────────────────────────────────────────────────

const requirementStatusSchema = z.enum(["AVAILABLE", "PARTIAL", "MISSING"])
const benchmarkComparisonModeSchema = z.enum(["absolute", "deployment_matched", "both"])
const eraStatusSchema = z.enum(["AVAILABLE", "INCOMPLETE_DATA", "UNAVAILABLE"])
const eraModeSchema = z.enum(["single", "multi"])

const textFromDescriptionSchema = z.preprocess(
  value => descriptionStringFromUnknown(value),
  z.string(),
)

const requiredDataSchema = z.preprocess(
  value => stringArrayFromUnknown(value),
  z.array(z.string().min(1)).min(1),
)

const optionalTextFromDescriptionSchema = z.preprocess(
  value => {
    if (value == null) return null
    const text = descriptionStringFromUnknown(value).trim()
    return text || null
  },
  z.string().optional().nullable(),
)

const acceptanceCriteriaStrict = z.preprocess(
  normalizeAcceptanceCriteriaInput,
  z.object({
    min_sharpe: z.number().min(0),
    max_drawdown_pct: z.number().min(0).max(100),
    min_hit_rate_pct: z.number().min(0).max(100),
    other: z.string().optional().nullable(),
  }),
)

const experimentPlanStrict = z.preprocess(normalizeExperimentPlanInput, z.object({
  benchmark: z.object({
    symbol: z.string(),
    comparison_mode: benchmarkComparisonModeSchema,
  }),
  windows: z.object({
    requested_start: z.string(),
    requested_end: z.string(),
    fresh_data_required_from: z.string().optional().nullable(),
  }),
  runnable_eras: z.array(z.object({
    era_id: z.string(),
    label: z.string(),
    date_range: z.object({
      start: z.string(),
      end: z.string(),
    }),
    status: eraStatusSchema,
    reason: z.string().optional().nullable(),
  })),
  eras: z.object({
    mode: eraModeSchema,
    required_era_ids: z.array(z.string().min(1)),
  }),
  evidence_thresholds: z.object({
    minimum_trade_count: z.number().min(1),
    minimum_evaluated_trading_days: z.number().min(1),
  }),
  decisive_verdict_rules: z.object({
    pass: z.string(),
    inconclusive: z.string(),
    fail: z.string(),
  }),
  known_limitations: z.array(z.string()),
}))

const proposalStrict = z.object({
  signal_logic: textFromDescriptionSchema.pipe(z.string().min(40)),
  entry_rules: textFromDescriptionSchema.pipe(z.string().min(20)),
  exit_rules: textFromDescriptionSchema.pipe(z.string().min(20)),
  risk_model: textFromDescriptionSchema.pipe(z.string().min(20)),
  universe: textFromDescriptionSchema.pipe(z.string().min(10)),
  required_data: requiredDataSchema,
  experiment_plan: experimentPlanStrict,
  benchmark: textFromDescriptionSchema.pipe(z.string().min(1)),
  acceptance_criteria: acceptanceCriteriaStrict,
  candidate_strategy_family: z.string().optional().nullable(),
  sweep_params: optionalTextFromDescriptionSchema,
  implementation_notes: optionalTextFromDescriptionSchema,
})

const assessmentStrict = z.preprocess(normalizeAssessmentInput, z.object({
  verdict: z.enum(["PASS", "WARN", "BLOCKED"]),
  requirements: z.array(z.object({
    requested: textFromDescriptionSchema.pipe(z.string().min(1)),
    core: z.boolean().optional().nullable(),
    status: z.preprocess(
      value => stringEnumOrDefault(value, ["AVAILABLE", "PARTIAL", "MISSING"], "MISSING"),
      requirementStatusSchema.optional().nullable(),
    ),
    matched_capability: optionalTextFromDescriptionSchema,
    notes: optionalTextFromDescriptionSchema,
  })).default([]),
  blocking_summary: optionalTextFromDescriptionSchema,
  suggested_action: optionalTextFromDescriptionSchema,
  warnings: z.preprocess(value => stringArrayFromUnknown(value), z.array(z.string()).optional().default([])),
}))

// Draft endpoint produces JSON strings on every call. Keeping the provider
// grammar this small avoids Anthropic's compiled-grammar ceiling while our
// strict parser below still owns the real contract.
export const draftGenerationSchema = z.object({
  proposal_json: z.string(),
  assessment_json: z.string(),
})

export const draftOutputSchema = z.object({
  proposal: proposalStrict,
  assessment: assessmentStrict,
})

// Revise endpoint produces JSON strings only for kind="revision"; clarification
// turns intentionally carry no proposal/assessment payload.
export const reviseGenerationSchema = z.object({
  kind: z.enum(["clarification", "revision"]),
  reply: z.string(),
  proposal_json: z.string().optional().nullable(),
  assessment_json: z.string().optional().nullable(),
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

export type ParsedDraftGeneratedOutput = z.infer<typeof draftOutputSchema> & {
  raw_proposal_json: string
  raw_assessment_json: string
}

export type ParsedReviseGeneratedOutput = TalonReviseOutput & {
  raw_proposal_json: string | null
  raw_assessment_json: string | null
}

export function parseDraftGeneratedOutput(output: unknown): ParsedDraftGeneratedOutput {
  const generated = draftGenerationSchema.parse(output)
  const proposal = parseJsonField(generated.proposal_json, proposalStrict, "proposal_json")
  const assessment = parseJsonField(generated.assessment_json, assessmentStrict, "assessment_json")
  const parsed = draftOutputSchema.parse({ proposal, assessment })
  return {
    ...parsed,
    raw_proposal_json: generated.proposal_json,
    raw_assessment_json: generated.assessment_json,
  }
}

export function parseReviseGeneratedOutput(output: unknown): ParsedReviseGeneratedOutput {
  const generated = reviseGenerationSchema.parse(output)

  if (generated.kind === "clarification") {
    const parsed = reviseOutputSchema.parse({
      kind: generated.kind,
      reply: generated.reply,
      proposal: null,
      assessment: null,
    })
    return {
      ...parsed,
      raw_proposal_json: generated.proposal_json ?? null,
      raw_assessment_json: generated.assessment_json ?? null,
    }
  }

  const proposal = parseJsonField(generated.proposal_json, proposalStrict, "proposal_json")
  const assessment = parseJsonField(generated.assessment_json, assessmentStrict, "assessment_json")
  const parsed = reviseOutputSchema.parse({
    kind: generated.kind,
    reply: generated.reply,
    proposal,
    assessment,
  })
  return {
    ...parsed,
    raw_proposal_json: generated.proposal_json ?? null,
    raw_assessment_json: generated.assessment_json ?? null,
  }
}

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
    experiment_plan: buildExperimentPlan({
      specId,
      ideaId,
      proposal,
      readiness,
    }),
    candidate_strategy_family: proposal.candidate_strategy_family?.trim() || null,
    implementation_notes: buildImplementationNotes(proposal.implementation_notes, readiness),
    parent_spec_id: base?.parent_spec_id ?? null,
    registered_strategy_id: null,
  }
}

function buildExperimentPlan({
  specId,
  ideaId,
  proposal,
  readiness,
}: {
  specId: string
  ideaId: string
  proposal: TalonProposal
  readiness: DataReadinessAssessment
}): ExperimentPlanV1 {
  const plan = proposal.experiment_plan
  const benchmarkSymbol =
    plan.benchmark.symbol.trim().toUpperCase() ||
    normalizeBenchmark(proposal.benchmark)?.toUpperCase() ||
    "SPY"
  const dataRequirements = readiness.requirements.map(requirement => ({
    capability_id: requirement.source ?? normalizeCapabilityId(requirement.requested),
    required: requirement.core,
    status: requirement.status,
    status_at_draft: requirement.status,
    purpose: requirement.requested,
  }))
  return withComputedExperimentPlanValidity({
    schema_version: "research_lab.experiment_plan.v1",
    spec_id: specId,
    idea_id: ideaId,
    is_valid: false,
    validity_reasons: [],
    benchmark: {
      symbol: benchmarkSymbol,
      comparison_mode: plan.benchmark.comparison_mode,
    },
    windows: {
      requested_start: plan.windows.requested_start,
      requested_end: plan.windows.requested_end,
      fresh_data_required_from: plan.windows.fresh_data_required_from ?? null,
    },
    runnable_eras: plan.runnable_eras,
    eras: plan.eras,
    data_requirements: dataRequirements,
    evidence_thresholds: plan.evidence_thresholds,
    decisive_verdict_rules: plan.decisive_verdict_rules,
    known_limitations: dedupeStrings(plan.known_limitations),
  })
}

function normalizeCapabilityId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  return normalized || "unknown_requirement"
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

function normalizeAcceptanceCriteriaInput(input: unknown): Record<string, unknown> {
  const raw = recordFromUnknown(input)
  return {
    min_sharpe: numberFromUnknown(raw.min_sharpe, 1),
    max_drawdown_pct: numberFromUnknown(raw.max_drawdown_pct ?? raw.max_drawdown, 20),
    min_hit_rate_pct: numberFromUnknown(raw.min_hit_rate_pct ?? raw.min_hit_rate, 45),
    other: nullableStringFromUnknown(raw.other),
  }
}

function normalizeExperimentPlanInput(input: unknown): Record<string, unknown> {
  const raw = recordFromUnknown(input)
  const defaultWindow = defaultExperimentWindow()
  const benchmarkRaw = raw.benchmark
  const benchmark =
    typeof benchmarkRaw === "string"
      ? {
          symbol: benchmarkRaw || "SPY",
          comparison_mode: stringEnumOrDefault(raw.comparison_mode, ["absolute", "deployment_matched", "both"], "both"),
        }
      : {
          symbol: stringFromUnknown(
            recordFromUnknown(benchmarkRaw).symbol ??
              recordFromUnknown(benchmarkRaw).benchmark ??
              raw.benchmark_symbol,
          ) || "SPY",
          comparison_mode: stringEnumOrDefault(
            recordFromUnknown(benchmarkRaw).comparison_mode ?? raw.comparison_mode,
            ["absolute", "deployment_matched", "both"],
            "both",
          ),
        }

  const windowsRaw = recordFromUnknown(raw.windows)
  const requestedStart = stringFromUnknown(windowsRaw.requested_start ?? raw.requested_start) || defaultWindow.start
  const requestedEnd = stringFromUnknown(windowsRaw.requested_end ?? raw.requested_end) || defaultWindow.end
  const runnableEras = normalizeRunnableEras(raw.runnable_eras, {
    start: requestedStart,
    end: requestedEnd,
  })
  const eraIds = runnableEras.map(era => era.era_id).filter(Boolean)
  const erasRaw = recordFromUnknown(raw.eras)
  const requiredEraIds = stringArrayFromUnknown(erasRaw.required_era_ids)

  return {
    benchmark,
    windows: {
      requested_start: requestedStart,
      requested_end: requestedEnd,
      fresh_data_required_from: nullableStringFromUnknown(
        windowsRaw.fresh_data_required_from ?? raw.fresh_data_required_from,
      ),
    },
    runnable_eras: runnableEras,
    eras: {
      mode: stringEnumOrDefault(erasRaw.mode ?? raw.era_mode, ["single", "multi"], eraIds.length > 1 ? "multi" : "single"),
      required_era_ids: requiredEraIds.length > 0 ? requiredEraIds : eraIds,
    },
    evidence_thresholds: {
      minimum_trade_count: numberFromUnknown(recordFromUnknown(raw.evidence_thresholds).minimum_trade_count, 5),
      minimum_evaluated_trading_days: numberFromUnknown(
        recordFromUnknown(raw.evidence_thresholds).minimum_evaluated_trading_days,
        20,
      ),
    },
    decisive_verdict_rules: normalizeVerdictRules(raw.decisive_verdict_rules),
    known_limitations: stringArrayFromUnknown(raw.known_limitations),
  }
}

function normalizeRunnableEras(
  input: unknown,
  fallbackRange: { start: string; end: string },
): Array<Record<string, unknown>> {
  const items = arrayFromUnknown(input)
  if (items.length === 0) {
    return [{
      era_id: "recent_default",
      label: "Recent default window",
      date_range: fallbackRange,
      status: "INCOMPLETE_DATA",
      reason: "Talon did not specify runnable eras; server supplied a recent default window for review.",
    }]
  }
  return items.map((item, index) => {
    const raw = recordFromUnknown(item)
    const dateRange = recordFromUnknown(raw.date_range)
    const eraId = stringFromUnknown(raw.era_id) || `era_${index + 1}`
    return {
      era_id: eraId,
      label: stringFromUnknown(raw.label) || eraId,
      date_range: {
        start: stringFromUnknown(dateRange.start ?? raw.start) || fallbackRange.start,
        end: stringFromUnknown(dateRange.end ?? raw.end) || fallbackRange.end,
      },
      status: stringEnumOrDefault(raw.status, ["AVAILABLE", "INCOMPLETE_DATA", "UNAVAILABLE"], "INCOMPLETE_DATA"),
      reason: nullableStringFromUnknown(raw.reason),
    }
  })
}

function normalizeVerdictRules(input: unknown): Record<string, unknown> {
  const defaults = defaultVerdictRules()
  if (typeof input === "string") {
    return {
      pass: input || defaults.pass,
      inconclusive: defaults.inconclusive,
      fail: defaults.fail,
    }
  }
  const raw = recordFromUnknown(input)
  return {
    pass: stringFromUnknown(raw.pass) || defaults.pass,
    inconclusive: stringFromUnknown(raw.inconclusive) || defaults.inconclusive,
    fail: stringFromUnknown(raw.fail) || defaults.fail,
  }
}

function defaultExperimentWindow(): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 90)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function defaultVerdictRules(): { pass: string; inconclusive: string; fail: string } {
  return {
    pass: "Passes only if it beats the benchmark after meeting the minimum trade-count and evaluated-days thresholds.",
    inconclusive: "Inconclusive if trade count, evaluated days, or runnable-era coverage is below the evidence threshold.",
    fail: "Fails if it underperforms the benchmark or breaches risk limits after evidence thresholds are met.",
  }
}

function normalizeAssessmentInput(input: unknown): Record<string, unknown> {
  const raw = recordFromUnknown(input)
  return {
    verdict: stringEnumOrDefault(raw.verdict, ["PASS", "WARN", "BLOCKED"], "WARN"),
    requirements: arrayOrSingleFromUnknown(
      raw.requirements ?? raw.data_requirements ?? raw.required_data,
    ).map(item => {
      const requirement = recordFromUnknown(item)
      const itemText = descriptionStringFromUnknown(item)
      return {
        requested: (
          requirement.requested ??
          requirement.requirement ??
          requirement.name ??
          requirement.capability ??
          requirement.matched_capability ??
          requirement.capability_id ??
          itemText
        ) ||
          "unspecified data requirement",
        core: booleanOrNull(requirement.core),
        status: requirement.status,
        matched_capability:
          requirement.matched_capability ??
          requirement.capability_id ??
          requirement.source,
        notes: requirement.notes ?? requirement.reason ?? requirement.purpose,
      }
    }),
    blocking_summary: raw.blocking_summary,
    suggested_action: raw.suggested_action,
    warnings: raw.warnings,
  }
}

function parseJsonField<T>(raw: string | null | undefined, schema: z.ZodType<T>, fieldName: string): T {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`${fieldName} must be a non-empty JSON string`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`${fieldName} was not valid JSON: ${detail}`)
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 6)
      .map(issue => `${issue.path.join(".") || fieldName}: ${issue.message}`)
      .join("; ")
    throw new Error(`${fieldName} did not match Talon's expected JSON shape: ${issues}`)
  }
  return result.data
}

function descriptionStringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (Array.isArray(value)) {
    const text = value
      .map(item => descriptionStringFromUnknown(item))
      .filter(Boolean)
      .join(", ")
    return text || (value.length > 0 ? JSON.stringify(value) : "")
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const raw = value as Record<string, unknown>
    const description =
      raw.description ??
      raw.summary ??
      raw.text ??
      raw.value ??
      raw.symbol ??
      raw.benchmark ??
      raw.name ??
      raw.requested ??
      raw.requirement ??
      raw.capability ??
      raw.capability_id ??
      raw.matched_capability ??
      raw.display_name ??
      raw.category
    if (typeof description === "string") return description.trim()
    if (typeof description === "number" && Number.isFinite(description)) return String(description)
    const serialized = JSON.stringify(raw)
    return serialized === "{}" ? "" : serialized
  }
  return ""
}

function recordFromUnknown(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
}

function arrayFromUnknown(input: unknown): unknown[] {
  return Array.isArray(input) ? input : []
}

function arrayOrSingleFromUnknown(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (input == null) return []
  return [input]
}

function stringArrayFromUnknown(input: unknown): string[] {
  if (typeof input === "string") {
    return input
      .split(",")
      .map(item => item.trim())
      .filter(Boolean)
  }
  return arrayFromUnknown(input)
    .map(item => descriptionStringFromUnknown(item))
    .filter(Boolean)
}

function stringFromUnknown(input: unknown): string {
  return descriptionStringFromUnknown(input)
}

function nullableStringFromUnknown(input: unknown): string | null {
  const value = stringFromUnknown(input)
  return value || null
}

function booleanOrNull(input: unknown): boolean | null {
  if (typeof input === "boolean") return input
  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase()
    if (normalized === "true" || normalized === "yes" || normalized === "1") return true
    if (normalized === "false" || normalized === "no" || normalized === "0") return false
  }
  return null
}

function numberFromUnknown(input: unknown, fallback: number): number {
  const value = typeof input === "number" ? input : Number(input)
  return Number.isFinite(value) ? value : fallback
}

function stringEnumOrDefault<T extends string>(
  input: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = typeof input === "string" ? input.trim() : ""
  const match = allowed.find(option => option.toLowerCase() === value.toLowerCase())
  return match ?? fallback
}

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
