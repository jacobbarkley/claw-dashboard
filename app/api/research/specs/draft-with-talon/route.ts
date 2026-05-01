import { anthropic } from "@ai-sdk/anthropic"
import { generateText, Output } from "ai"
import { NextRequest, NextResponse } from "next/server"

import type { IdeaArtifact, ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"
import { commitDashboardFiles } from "@/lib/github-multi-file-commit.server"
import {
  assessDataReadiness,
  dataReadinessForResponse,
  loadDataCapabilityCatalog,
} from "@/lib/research-lab-data-capabilities.server"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import { loadStrategySpecById, strategySpecRepoRelpath } from "@/lib/research-lab-specs.server"
import { formatTalonLessonsForPrompt } from "@/lib/research-lab-talon-lessons.server"
import {
  applyModelVerdictFloor,
  buildStrategySpec,
  DATA_READINESS_PROMPT_RULES,
  draftGenerationSchema,
  draftOutputSchema,
  formatCatalogForPrompt,
  includeProposalRequirements,
  specProvenanceRelpath,
  type TalonProposal,
} from "@/lib/research-lab-talon.server"

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

type DraftOutput = {
  proposal: TalonProposal
  assessment: ReturnType<typeof draftOutputSchema.parse>["assessment"]
}

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

  let talonOutput: DraftOutput
  let rawCompletion: string | null = null
  const model = process.env.TALON_SPEC_DRAFTING_MODEL ?? DEFAULT_MODEL
  const lessons = await formatTalonLessonsForPrompt()
  const prompt = buildPrompt({ idea, overrideThesis, catalog, lessons })
  try {
    const result = await generateText({
      model: anthropic(model),
      output: Output.object({ schema: draftGenerationSchema }),
      temperature: 0.4,
      prompt,
    })
    talonOutput = draftOutputSchema.parse(result.output)
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
        catalog,
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

function buildPrompt({
  idea,
  overrideThesis,
  catalog,
  lessons,
}: {
  idea: IdeaArtifact
  overrideThesis: string | null
  catalog: Awaited<ReturnType<typeof loadDataCapabilityCatalog>>
  lessons: string
}): string {
  return [
    "You are Talon's spec-drafting mode inside the Vires Research Lab.",
    "Return only the structured object requested by the schema. Do not invent backtest results.",
    "",
    "Your task has two parts:",
    "1. Draft a StrategySpecV1 starting point for the operator to review.",
    "2. Draft its experiment_plan: how the strategy will be judged before implementation.",
    "3. Assess whether every data dependency is actually available in the catalog.",
    "",
    "Experiment-plan rules:",
    "- The plan is part of the spec. Do not omit it.",
    "- Use ISO dates for windows. If the idea does not specify dates, choose a recent executable window and state limitations.",
    "- evidence_thresholds must be numeric. minimum_trade_count defaults to at least 5 for exploratory stock ideas unless the thesis justifies a higher floor.",
    "- data_requirements are resolved by the server from your assessment; in experiment_plan focus on benchmark, windows, eras, thresholds, verdict rules, and limitations.",
    "- If a strategy depends on seeded/current-only data, put that in known_limitations and make the plan clear that the first run validates plumbing, not historical edge.",
    lessons ? ["", lessons].join("\n") : null,
    "",
    DATA_READINESS_PROMPT_RULES,
    "",
    `Idea sleeve: ${idea.sleeve}`,
    `Idea title: ${idea.title}`,
    `Idea thesis: ${idea.thesis}`,
    overrideThesis ? `Operator augmentation: ${overrideThesis}` : null,
    "",
    `Data capability catalog (${catalog.catalog_version}):`,
    formatCatalogForPrompt(catalog),
  ].filter((line): line is string => line != null).join("\n")
}
