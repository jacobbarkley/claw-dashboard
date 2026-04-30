import { anthropic } from "@ai-sdk/anthropic"
import { generateText, Output } from "ai"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import type { IdeaArtifact, ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"
import { commitDashboardFiles } from "@/lib/github-multi-file-commit.server"
import {
  assessDataReadiness,
  dataReadinessForResponse,
  loadDataCapabilityCatalog,
  type DataReadinessAssessment,
  type ModelDataRequirement,
} from "@/lib/research-lab-data-capabilities.server"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import { loadStrategySpecById, strategySpecRepoRelpath } from "@/lib/research-lab-specs.server"

import {
  ideaArtifactToYaml,
  ideaRepoRelpath,
  linkIdeaToSpec,
  normalizeScope,
  requiredString,
  safePathSegment,
  strategySpecToYaml,
  ulid,
  validateStrategySpec,
} from "../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const PROMPT_VERSION = "talon_spec_drafting.v1"
const DEFAULT_MODEL = "claude-sonnet-4-6"

const requirementStatusSchema = z.enum(["AVAILABLE", "PARTIAL", "MISSING"])

// Anthropic's structured-output JSON Schema subset rejects validation
// keywords such as minimum/maximum. Keep the provider-facing schema loose,
// then apply the stricter Zod parse after generation.
const talonGenerationSchema = z.object({
  proposal: z.object({
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
  }),
  assessment: z.object({
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
  }),
})

const talonOutputSchema = z.object({
  proposal: z.object({
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
  }),
  assessment: z.object({
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
  }),
})

type TalonOutput = z.infer<typeof talonOutputSchema>

interface DraftBody {
  idea_id?: unknown
  scope?: unknown
  authored_by?: unknown
  override_thesis?: unknown
}

export async function POST(req: NextRequest) {
  let body: DraftBody
  try {
    body = (await req.json()) as DraftBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  let scope: ScopeTriple
  let ideaId: string
  let authoredBy: string
  let overrideThesis: string | null
  try {
    scope = normalizeScope(body.scope)
    ideaId = safePathSegment(requiredString(body.idea_id, "idea_id"), "idea_id")
    authoredBy = requiredString(body.authored_by ?? "jacob", "authored_by")
    overrideThesis =
      typeof body.override_thesis === "string" && body.override_thesis.trim()
        ? body.override_thesis.trim()
        : null
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Talon draft request" },
      { status: 400 },
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY missing from environment" },
      { status: 503 },
    )
  }

  const idea = await loadIdeaById(ideaId, scope)
  if (!idea) {
    return NextResponse.json({ error: `Idea not found: ${ideaId}` }, { status: 404 })
  }
  if (idea.strategy_ref.kind === "REGISTERED") {
    return NextResponse.json(
      { error: "Talon draft v1 cannot create re-specs for registered ideas. Start an explicit re-spec flow first." },
      { status: 409 },
    )
  }

  const specId = `spec_${ulid()}`
  try {
    linkIdeaToSpec(idea, specId)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Idea cannot accept a Talon draft" },
      { status: 409 },
    )
  }

  const existing = await loadStrategySpecById(specId, scope)
  if (existing) {
    return NextResponse.json(
      { error: `Strategy spec already exists: ${specId}. Retry the draft request.` },
      { status: 409 },
    )
  }

  let catalog: Awaited<ReturnType<typeof loadDataCapabilityCatalog>>
  try {
    catalog = await loadDataCapabilityCatalog()
  } catch (error) {
    return NextResponse.json(
      {
        error: "data_capability_catalog_unavailable",
        detail: error instanceof Error ? error.message : "Data capability catalog is unavailable",
      },
      { status: 503 },
    )
  }

  let talonOutput: TalonOutput
  let rawCompletion: string | null = null
  const model = process.env.TALON_SPEC_DRAFTING_MODEL ?? DEFAULT_MODEL
  const prompt = buildPrompt({ idea, overrideThesis, catalog })
  try {
    const result = await generateText({
      model: anthropic(model),
      output: Output.object({ schema: talonGenerationSchema }),
      temperature: 0.4,
      prompt,
    })
    talonOutput = talonOutputSchema.parse(result.output)
    rawCompletion = typeof result.text === "string" ? result.text : null
  } catch (error) {
    return NextResponse.json(
      {
        error: "talon_failed",
        talon_error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    )
  }

  const readiness = applyModelVerdictFloor(
    assessDataReadiness({
      catalog,
      sleeve: idea.sleeve,
      requirements: includeProposalRequirements({
        requiredData: talonOutput.proposal.required_data,
        assessedRequirements: talonOutput.assessment.requirements,
      }),
    }),
    talonOutput.assessment,
  )

  if (readiness.verdict === "BLOCKED") {
    return NextResponse.json(
      {
        ok: false,
        error: "data_unavailable",
        data_readiness: dataReadinessForResponse(readiness),
      },
      { status: 422 },
    )
  }

  let spec: StrategySpecV1
  try {
    spec = buildStrategySpec({
      specId,
      scope,
      ideaId,
      authoredBy,
      proposal: talonOutput.proposal,
      readiness,
    })
    validateStrategySpec(spec)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Talon returned an invalid strategy spec" },
      { status: 502 },
    )
  }

  const provenance = {
    schema_version: "research_lab.spec_provenance.v1",
    spec_id: spec.spec_id,
    generated_at: new Date().toISOString(),
    model,
    catalog_version: catalog.catalog_version,
    prompt_version: PROMPT_VERSION,
    data_readiness: {
      ...dataReadinessForResponse(readiness),
      discrepancies: readiness.discrepancies,
    },
    prompt,
    raw_completion: rawCompletion,
    raw_proposal: talonOutput.proposal,
    raw_assessment: talonOutput.assessment,
  }

  try {
    const latestIdea = await loadIdeaById(ideaId, scope)
    if (!latestIdea) {
      return NextResponse.json({ error: `Idea not found before persistence: ${ideaId}` }, { status: 404 })
    }
    if (latestIdea.strategy_ref.kind === "REGISTERED") {
      return NextResponse.json(
        { error: "Idea became registered before Talon persistence. Start an explicit re-spec flow first." },
        { status: 409 },
      )
    }
    let linkedIdea: IdeaArtifact
    try {
      linkedIdea = linkIdeaToSpec(latestIdea, spec.spec_id)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Idea cannot accept this Talon draft" },
        { status: 409 },
      )
    }

    const persisted = await commitDashboardFiles({
      message: `research lab: Talon-drafted strategy spec ${spec.spec_id}`,
      files: [
        {
          relpath: strategySpecRepoRelpath(spec.spec_id, scope),
          content: strategySpecToYaml(spec),
        },
        {
          relpath: ideaRepoRelpath(scope, linkedIdea.idea_id),
          content: ideaArtifactToYaml(linkedIdea),
        },
        {
          relpath: specProvenanceRelpath(spec.spec_id, scope),
          content: `${JSON.stringify(provenance, null, 2)}\n`,
        },
      ],
    })
    return NextResponse.json({
      ok: true,
      ...persisted,
      spec,
      idea: linkedIdea,
      data_readiness: dataReadinessForResponse(readiness),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json(
      { error: `Failed to persist Talon-drafted strategy spec: ${detail}` },
      { status: 500 },
    )
  }
}

function buildStrategySpec({
  specId,
  scope,
  ideaId,
  authoredBy,
  proposal,
  readiness,
}: {
  specId: string
  scope: ScopeTriple
  ideaId: string
  authoredBy: string
  proposal: TalonOutput["proposal"]
  readiness: DataReadinessAssessment
}): StrategySpecV1 {
  return {
    schema_version: "research_lab.strategy_spec.v1",
    spec_id: specId,
    spec_version: 1,
    idea_id: ideaId,
    user_id: scope.user_id,
    account_id: scope.account_id,
    strategy_group_id: scope.strategy_group_id,
    created_at: new Date().toISOString(),
    authoring_mode: "AI_DRAFTED",
    authored_by: authoredBy,
    state: "DRAFTING",
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
    parent_spec_id: null,
    registered_strategy_id: null,
  }
}

function buildPrompt({
  idea,
  overrideThesis,
  catalog,
}: {
  idea: IdeaArtifact
  overrideThesis: string | null
  catalog: Awaited<ReturnType<typeof loadDataCapabilityCatalog>>
}): string {
  const catalogRows = catalog.capabilities
    .map(capability => {
      const sleeves = capability.sleeves.join(", ")
      const coverage = capability.asof_coverage ? ` coverage=${capability.asof_coverage}` : ""
      const notes = capability.notes ? ` notes=${capability.notes}` : ""
      return `- ${capability.capability_id}: ${capability.category}; ${capability.status}; sleeves=${sleeves};${coverage}${notes}`
    })
    .join("\n")

  return [
    "You are Talon's spec-drafting mode inside the Vires Research Lab.",
    "Return only the structured object requested by the schema. Do not invent backtest results.",
    "",
    "Your task has two parts:",
    "1. Draft a StrategySpecV1 starting point for the operator to review.",
    "2. Assess whether every data dependency is actually available in the catalog.",
    "",
    "Data readiness rules:",
    "- PASS only when every core requirement maps to AVAILABLE.",
    "- WARN when requirements map to PARTIAL, or when a non-core nice-to-have is missing.",
    "- BLOCKED when any core signal, entry rule, or exit rule requires missing data.",
    "- When unsure whether data is core, treat it as core.",
    "- Thin theses are allowed. Unavailable data is not allowed.",
    "",
    `Idea sleeve: ${idea.sleeve}`,
    `Idea title: ${idea.title}`,
    `Idea thesis: ${idea.thesis}`,
    overrideThesis ? `Operator augmentation: ${overrideThesis}` : null,
    "",
    `Data capability catalog (${catalog.catalog_version}):`,
    catalogRows,
  ].filter((line): line is string => line != null).join("\n")
}

function includeProposalRequirements({
  requiredData,
  assessedRequirements,
}: {
  requiredData: string[]
  assessedRequirements: ModelDataRequirement[]
}): ModelDataRequirement[] {
  const covered = new Set(
    assessedRequirements.map(req => normalizeRequirementLabel(req.requested)),
  )
  const missingAssessments = requiredData
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => !covered.has(normalizeRequirementLabel(item)))
    .map(item => ({
      requested: item,
      core: true,
      status: "MISSING" as const,
      matched_capability: null,
      notes: "Talon proposed this required_data entry but did not assess it against the catalog.",
    }))
  return [...assessedRequirements, ...missingAssessments]
}

function applyModelVerdictFloor(
  serverReadiness: DataReadinessAssessment,
  modelAssessment: TalonOutput["assessment"],
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

function normalizeRequirementLabel(input: string): string {
  return input.trim().toLowerCase()
}

function descriptionRecord(description: string): Record<string, unknown> {
  const trimmed = description.trim()
  return trimmed ? { description: trimmed } : {}
}

function normalizeBenchmark(input: string): string | null {
  const trimmed = input.trim()
  return trimmed ? trimmed : null
}

function buildImplementationNotes(
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

function specProvenanceRelpath(specId: string, scope: ScopeTriple): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/strategy_specs/${specId}_provenance.json`
}
