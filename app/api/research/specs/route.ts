// GET/POST /api/research/specs
//
// Phase E foundation surface for Lab Pipeline v2. Creating a spec now links
// it onto the owning idea in the same persistence operation, so the approve
// route can enforce the idea <-> spec pointer invariant.

import { NextRequest, NextResponse } from "next/server"

import type { IdeaArtifact, ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"
import { commitDashboardFiles } from "@/lib/github-multi-file-commit.server"
import { createDraftExperimentPlanTemplate } from "@/lib/research-lab-experiment-plan"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import {
  loadStrategySpecById,
  loadStrategySpecs,
  loadStrategySpecsForIdea,
  strategySpecRepoRelpath,
} from "@/lib/research-lab-specs.server"

import {
  ideaArtifactToYaml,
  ideaRepoRelpath,
  linkIdeaToSpec,
  normalizeScope,
  normalizeStrategySpecPatchExperimentPlan,
  optionalString,
  parseAuthoringMode,
  parseCrudWritableSpecState,
  recordOrEmpty,
  requiredString,
  safePathSegment,
  strategySpecToYaml,
  stringListOrEmpty,
  ulid,
  validateStrategySpec,
} from "./_shared"

interface CreateBody {
  spec_id?: unknown
  spec_version?: unknown
  idea_id?: unknown
  scope?: unknown
  authoring_mode?: unknown
  authored_by?: unknown
  state?: unknown
  signal_logic?: unknown
  universe?: unknown
  entry_rules?: unknown
  exit_rules?: unknown
  risk_model?: unknown
  sweep_params?: unknown
  required_data?: unknown
  benchmark?: unknown
  acceptance_criteria?: unknown
  experiment_plan?: unknown
  candidate_strategy_family?: unknown
  implementation_notes?: unknown
  parent_spec_id?: unknown
  registered_strategy_id?: unknown
}

export async function GET(req: NextRequest) {
  let scope: ScopeTriple
  try {
    const url = new URL(req.url)
    scope = normalizeScope({
      user_id: url.searchParams.get("user_id") ?? undefined,
      account_id: url.searchParams.get("account_id") ?? undefined,
      strategy_group_id: url.searchParams.get("strategy_group_id") ?? undefined,
    })
    const ideaIdRaw = url.searchParams.get("idea_id")
    const ideaId = ideaIdRaw ? safePathSegment(ideaIdRaw, "idea_id") : null
    const specs = ideaId ? await loadStrategySpecsForIdea(ideaId, scope) : await loadStrategySpecs(scope)
    return NextResponse.json({ specs })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load strategy specs" },
      { status: 400 },
    )
  }
}

export async function POST(req: NextRequest) {
  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  let scope: ScopeTriple
  try {
    scope = normalizeScope(body.scope)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid scope" },
      { status: 400 },
    )
  }

  let spec: StrategySpecV1
  try {
    const specId =
      typeof body.spec_id === "string" && body.spec_id.trim()
        ? safePathSegment(body.spec_id, "spec_id")
        : `spec_${ulid()}`
    const ideaId = safePathSegment(requiredString(body.idea_id, "idea_id"), "idea_id")
    const specVersionRaw = typeof body.spec_version === "number" ? body.spec_version : 1
    const specVersion = Number.isFinite(specVersionRaw) ? Math.max(1, Math.floor(specVersionRaw)) : 1
    const initialState = parseCrudWritableSpecState(body.state, "DRAFTING")
    if (initialState === "REJECTED") {
      throw new Error("New strategy specs cannot start in REJECTED state")
    }
    const authoringMode = parseAuthoringMode(body.authoring_mode, "OPERATOR_DRAFTED")
    const benchmark = optionalString(body.benchmark)
    const providedExperimentPlan = normalizeStrategySpecPatchExperimentPlan(body.experiment_plan, {
      specId,
      ideaId,
    })
    const seedOperatorPlan =
      authoringMode === "OPERATOR_DRAFTED" || authoringMode === "MANUAL"
    const experimentPlan =
      providedExperimentPlan ??
      (seedOperatorPlan
        ? createDraftExperimentPlanTemplate({
            specId,
            ideaId,
            benchmarkSymbol: benchmark,
          })
        : null)
    spec = {
      schema_version: "research_lab.strategy_spec.v1",
      spec_id: specId,
      spec_version: specVersion,
      idea_id: ideaId,
      user_id: scope.user_id,
      account_id: scope.account_id,
      strategy_group_id: scope.strategy_group_id,
      created_at: new Date().toISOString(),
      authoring_mode: authoringMode,
      authored_by: requiredString(body.authored_by ?? "jacob", "authored_by"),
      state: initialState,
      signal_logic: requiredString(body.signal_logic, "signal_logic"),
      universe: recordOrEmpty(body.universe),
      entry_rules: requiredString(body.entry_rules, "entry_rules"),
      exit_rules: requiredString(body.exit_rules, "exit_rules"),
      risk_model: recordOrEmpty(body.risk_model),
      sweep_params: recordOrEmpty(body.sweep_params),
      required_data: stringListOrEmpty(body.required_data),
      benchmark,
      acceptance_criteria: recordOrEmpty(body.acceptance_criteria),
      experiment_plan: experimentPlan,
      candidate_strategy_family: optionalString(body.candidate_strategy_family),
      implementation_notes: optionalString(body.implementation_notes),
      parent_spec_id: optionalString(body.parent_spec_id),
      registered_strategy_id: optionalString(body.registered_strategy_id),
    }
    validateStrategySpec(spec)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid strategy spec" },
      { status: 400 },
    )
  }

  const idea = await loadIdeaById(spec.idea_id, scope)
  if (!idea) {
    return NextResponse.json(
      { error: `Idea not found for strategy spec: ${spec.idea_id}` },
      { status: 404 },
    )
  }
  let linkedIdea: IdeaArtifact
  try {
    linkedIdea = linkIdeaToSpec(idea, spec.spec_id)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Idea cannot accept this strategy spec" },
      { status: 409 },
    )
  }

  const existing = await loadStrategySpecById(spec.spec_id, scope)
  if (existing) {
    return NextResponse.json(
      { error: `Strategy spec already exists: ${spec.spec_id}. Use PATCH to update it.` },
      { status: 409 },
    )
  }

  try {
    const persisted = await commitDashboardFiles({
      message: `research lab: save strategy spec ${spec.spec_id}`,
      files: [
        {
          relpath: strategySpecRepoRelpath(spec.spec_id, scope),
          content: strategySpecToYaml(spec),
        },
        {
          relpath: ideaRepoRelpath(scope, linkedIdea.idea_id),
          content: ideaArtifactToYaml(linkedIdea),
        },
      ],
    })
    return NextResponse.json({ ok: true, ...persisted, spec, idea: linkedIdea })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json({ error: `Failed to persist strategy spec: ${detail}` }, { status: 500 })
  }
}
