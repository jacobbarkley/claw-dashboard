// POST /api/research/specs/[id]/apply-talon-revision
//
// Persists a previously-proposed revision from the chat refinement loop.
// The propose-side endpoint (revise-with-talon) returns proposal +
// assessment + data_readiness without writing anything; the operator
// reviews Talon's proposed change in the chat and taps Apply, which
// hits this endpoint with the proposal+assessment payload.
//
// This endpoint re-runs the data-readiness check server-side to defend
// against tampering and stale-catalog drift between propose and apply,
// then writes the new spec YAML in place + a per-revision provenance
// JSON. The spec_id stays stable; spec_version increments;
// AWAITING_APPROVAL drops to DRAFTING because the revised content has
// not been re-approved.

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import type { ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"
import { commitDashboardFiles } from "@/lib/github-multi-file-commit.server"
import {
  assessDataReadiness,
  dataReadinessForResponse,
  loadDataCapabilityCatalog,
} from "@/lib/research-lab-data-capabilities.server"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import { loadStrategySpecById, strategySpecRepoRelpath } from "@/lib/research-lab-specs.server"
import {
  applyModelVerdictFloor,
  buildStrategySpec,
  draftOutputSchema,
  includeProposalRequirements,
} from "@/lib/research-lab-talon.server"

import {
  normalizeScope,
  requiredString,
  safePathSegment,
  strategySpecToYaml,
  validateStrategySpec,
} from "../../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const APPLY_PROMPT_VERSION = "talon_spec_revision_apply.v1"

const proposalShape = draftOutputSchema.shape.proposal
const assessmentShape = draftOutputSchema.shape.assessment

const applyBodySchema = z.object({
  proposal: proposalShape,
  assessment: assessmentShape,
})

interface ApplyBody {
  scope?: unknown
  proposal?: unknown
  assessment?: unknown
  talon_reply?: unknown
  operator_message?: unknown
  conversation_at_revision?: unknown
  base_spec_version?: unknown
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: specIdParam } = await ctx.params

  let body: ApplyBody
  try {
    body = (await req.json()) as ApplyBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  let scope: ScopeTriple
  let specId: string
  try {
    scope = normalizeScope(body.scope)
    specId = safePathSegment(requiredString(specIdParam, "spec_id"), "spec_id")
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid apply request" },
      { status: 400 },
    )
  }

  const parsed = applyBodySchema.safeParse({
    proposal: body.proposal,
    assessment: body.assessment,
  })
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_proposal_payload",
        detail: parsed.error.message,
      },
      { status: 400 },
    )
  }
  const { proposal, assessment } = parsed.data

  const spec = await loadStrategySpecById(specId, scope)
  if (!spec) {
    return NextResponse.json({ error: `Strategy spec not found: ${specId}` }, { status: 404 })
  }
  if (spec.authoring_mode !== "AI_DRAFTED") {
    return NextResponse.json(
      { error: "Talon revisions are only applyable to AI_DRAFTED specs." },
      { status: 409 },
    )
  }
  if (spec.state !== "DRAFTING" && spec.state !== "AWAITING_APPROVAL") {
    return NextResponse.json(
      { error: `Spec state is ${spec.state}; revisions require DRAFTING or AWAITING_APPROVAL.` },
      { status: 409 },
    )
  }

  if (
    typeof body.base_spec_version === "number" &&
    Number.isFinite(body.base_spec_version) &&
    body.base_spec_version !== spec.spec_version
  ) {
    return NextResponse.json(
      {
        error: "stale_proposal",
        detail: `Proposal was generated against spec_version=${body.base_spec_version} but current is ${spec.spec_version}. Re-send the message to get a fresh proposal.`,
      },
      { status: 409 },
    )
  }

  const idea = await loadIdeaById(spec.idea_id, scope)
  if (!idea) {
    return NextResponse.json({ error: `Parent idea not found: ${spec.idea_id}` }, { status: 404 })
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

  // Re-run the readiness check server-side. Defends against client
  // tampering and catches catalog drift between propose and apply.
  const readiness = applyModelVerdictFloor(
    assessDataReadiness({
      catalog,
      sleeve: idea.sleeve,
      requirements: includeProposalRequirements({
        requiredData: proposal.required_data,
        assessedRequirements: assessment.requirements,
        catalog,
      }),
    }),
    assessment,
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

  const newState: StrategySpecV1["state"] =
    spec.state === "AWAITING_APPROVAL" ? "DRAFTING" : spec.state
  const newVersion = spec.spec_version + 1

  let revisedSpec: StrategySpecV1
  try {
    revisedSpec = buildStrategySpec({
      specId: spec.spec_id,
      scope,
      ideaId: spec.idea_id,
      authoredBy: spec.authored_by,
      proposal,
      readiness,
      base: {
        spec_version: newVersion,
        parent_spec_id: spec.parent_spec_id,
        created_at: spec.created_at,
        state: newState,
      },
    })
    validateStrategySpec(revisedSpec)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Proposed spec is invalid" },
      { status: 400 },
    )
  }

  const operatorMessage =
    typeof body.operator_message === "string" ? body.operator_message : null
  const talonReply = typeof body.talon_reply === "string" ? body.talon_reply : null
  const conversationAtRevision = Array.isArray(body.conversation_at_revision)
    ? body.conversation_at_revision
    : []

  const revisionProvenance = {
    schema_version: "research_lab.spec_revision_provenance.v1",
    spec_id: revisedSpec.spec_id,
    spec_version: revisedSpec.spec_version,
    revised_at: new Date().toISOString(),
    catalog_version: catalog.catalog_version,
    prompt_version: APPLY_PROMPT_VERSION,
    data_readiness: {
      ...dataReadinessForResponse(readiness),
      discrepancies: readiness.discrepancies,
    },
    operator_message: operatorMessage,
    talon_reply: talonReply,
    conversation_at_revision: conversationAtRevision,
    raw_proposal: proposal,
    raw_assessment: assessment,
  }

  try {
    const persisted = await commitDashboardFiles({
      message: `research lab: Talon-revised strategy spec ${revisedSpec.spec_id} v${revisedSpec.spec_version}`,
      files: [
        {
          relpath: strategySpecRepoRelpath(revisedSpec.spec_id, scope),
          content: strategySpecToYaml(revisedSpec),
        },
        {
          relpath: revisionProvenanceRelpath(revisedSpec.spec_id, revisedSpec.spec_version, scope),
          content: `${JSON.stringify(revisionProvenance, null, 2)}\n`,
        },
      ],
    })
    return NextResponse.json({
      ok: true,
      ...persisted,
      spec: revisedSpec,
      data_readiness: dataReadinessForResponse(readiness),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json(
      { error: `Failed to persist revised strategy spec: ${detail}` },
      { status: 500 },
    )
  }
}

function revisionProvenanceRelpath(
  specId: string,
  version: number,
  scope: ScopeTriple,
): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/strategy_specs/${specId}_revision_v${version}.json`
}
