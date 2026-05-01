// GET/PATCH/DELETE /api/research/specs/[id]
//
// Draft-friendly StrategySpec CRUD. Approval/implementation transitions
// intentionally wait for Phase E's dedicated approve route.

import { NextRequest, NextResponse } from "next/server"
import yaml from "js-yaml"

import type { IdeaArtifact, ScopeTriple, StrategySpecV1 } from "@/lib/research-lab-contracts"
import { commitDashboardFiles, readDashboardFileText } from "@/lib/github-multi-file-commit.server"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import {
  loadSpecImplementationQueueEntry,
  specAuditLogRelpath,
  specImplementationQueueRelpath,
} from "@/lib/research-lab-queue.server"
import { loadStrategySpecById } from "@/lib/research-lab-specs.server"

import {
  canTransitionSpec,
  deleteStrategySpecArtifact,
  ideaArtifactToYaml,
  ideaRepoRelpath,
  normalizeScope,
  normalizeStrategySpecPatchExperimentPlan,
  optionalString,
  parseAuthoringMode,
  parseCrudWritableSpecState,
  parseSpecState,
  persistStrategySpecArtifact,
  recordOrEmpty,
  requiredString,
  safePathSegment,
  strategySpecToYaml,
  stringListOrEmpty,
  ulid,
  validateStrategySpec,
} from "../_shared"

interface PatchBody {
  scope?: unknown
  spec_version?: unknown
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
  cancel_reason?: unknown
}

const APPROVED_CANCEL_BODY_KEYS = new Set(["scope", "state", "cancel_reason"])

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveSpec(req, ctx)
  if ("response" in resolved) return resolved.response
  return NextResponse.json({ spec: resolved.spec })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }
  const resolved = await resolveSpec(req, ctx, body.scope)
  if ("response" in resolved) return resolved.response

  const currentState = resolved.spec.state
  if (currentState === "APPROVED") {
    const invalidKeys = Object.keys(body as Record<string, unknown>).filter(
      key => !APPROVED_CANCEL_BODY_KEYS.has(key),
    )
    let updated: StrategySpecV1
    try {
      const requestedState = parseSpecState(body.state, currentState)
      if (requestedState !== "REJECTED") {
        throw new Error("APPROVED specs can only transition to REJECTED before implementation claim.")
      }
      if (invalidKeys.length) {
        throw new Error(
          `APPROVED spec cancellation may only include scope, state, and cancel_reason. ` +
            `Unexpected fields: ${invalidKeys.join(", ")}`,
        )
      }
      const transition = canTransitionSpec(currentState, requestedState)
      if (!transition.ok) throw new Error(transition.error)
      updated = { ...resolved.spec, state: requestedState }
      validateStrategySpec(updated)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid strategy spec cancellation" },
        { status: 400 },
      )
    }
    try {
      const persisted = await persistApprovedCancel({
        spec: updated,
        previousState: currentState,
        scope: resolved.scope,
        actor: "jacob",
        reason: optionalString(body.cancel_reason),
      })
      return NextResponse.json({ ok: true, ...persisted, spec: updated })
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown persistence failure"
      return NextResponse.json({ error: `Failed to persist strategy spec: ${detail}` }, { status: 500 })
    }
  }

  if (currentState !== "DRAFTING" && currentState !== "AWAITING_APPROVAL") {
    return NextResponse.json(
      {
        error:
          `${currentState} specs are not writable through generic StrategySpec CRUD. ` +
          "Use the dedicated approval/implementation route for lifecycle transitions.",
      },
      { status: 409 },
    )
  }

  let updated: StrategySpecV1
  try {
    const specVersionRaw =
      typeof body.spec_version === "number" ? body.spec_version : resolved.spec.spec_version
    updated = {
      ...resolved.spec,
      spec_version: Number.isFinite(specVersionRaw)
        ? Math.max(1, Math.floor(specVersionRaw))
        : resolved.spec.spec_version,
      authoring_mode: "authoring_mode" in body
        ? parseAuthoringMode(body.authoring_mode, resolved.spec.authoring_mode)
        : resolved.spec.authoring_mode,
      authored_by: "authored_by" in body
        ? requiredString(body.authored_by, "authored_by")
        : resolved.spec.authored_by,
      state: "state" in body
        ? parseCrudWritableSpecState(body.state, resolved.spec.state)
        : resolved.spec.state,
      signal_logic: "signal_logic" in body
        ? requiredString(body.signal_logic, "signal_logic")
        : resolved.spec.signal_logic,
      universe: "universe" in body ? recordOrEmpty(body.universe) : resolved.spec.universe,
      entry_rules: "entry_rules" in body
        ? requiredString(body.entry_rules, "entry_rules")
        : resolved.spec.entry_rules,
      exit_rules: "exit_rules" in body
        ? requiredString(body.exit_rules, "exit_rules")
        : resolved.spec.exit_rules,
      risk_model: "risk_model" in body ? recordOrEmpty(body.risk_model) : resolved.spec.risk_model,
      sweep_params: "sweep_params" in body ? recordOrEmpty(body.sweep_params) : resolved.spec.sweep_params,
      required_data: "required_data" in body
        ? stringListOrEmpty(body.required_data)
        : resolved.spec.required_data,
      benchmark: "benchmark" in body ? optionalString(body.benchmark) : resolved.spec.benchmark ?? null,
      acceptance_criteria: "acceptance_criteria" in body
        ? recordOrEmpty(body.acceptance_criteria)
        : resolved.spec.acceptance_criteria,
      experiment_plan: "experiment_plan" in body
        ? normalizeStrategySpecPatchExperimentPlan(body.experiment_plan, {
            specId: resolved.spec.spec_id,
            ideaId: resolved.spec.idea_id,
          })
        : resolved.spec.experiment_plan ?? null,
      candidate_strategy_family: "candidate_strategy_family" in body
        ? optionalString(body.candidate_strategy_family)
        : resolved.spec.candidate_strategy_family ?? null,
      implementation_notes: "implementation_notes" in body
        ? optionalString(body.implementation_notes)
        : resolved.spec.implementation_notes ?? null,
      parent_spec_id: "parent_spec_id" in body
        ? optionalString(body.parent_spec_id)
        : resolved.spec.parent_spec_id ?? null,
      registered_strategy_id: "registered_strategy_id" in body
        ? optionalString(body.registered_strategy_id)
        : resolved.spec.registered_strategy_id ?? null,
    }
    validateStrategySpec(updated)
    const transition = canTransitionSpec(currentState, updated.state)
    if (!transition.ok) throw new Error(transition.error)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid strategy spec" },
      { status: 400 },
    )
  }

  try {
    const persisted = currentState === updated.state
      ? await persistStrategySpecArtifact(
          updated,
          resolved.scope,
          `research lab: update strategy spec ${updated.spec_id}`,
        )
      : await persistSpecStateChange({
          spec: updated,
          previousState: currentState,
          scope: resolved.scope,
          actor: "jacob",
          message: `research lab: transition strategy spec ${updated.spec_id} to ${updated.state}`,
        })
    return NextResponse.json({ ok: true, ...persisted, spec: updated })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown persistence failure"
    return NextResponse.json({ error: `Failed to persist strategy spec: ${detail}` }, { status: 500 })
  }
}

async function persistApprovedCancel({
  spec,
  previousState,
  scope,
  actor,
  reason,
}: {
  spec: StrategySpecV1
  previousState: StrategySpecV1["state"]
  scope: ScopeTriple
  actor: string
  reason: string | null
}) {
  const queueEntry = await loadSpecImplementationQueueEntry(spec.spec_id, scope)
  if (!queueEntry) {
    throw new Error(`Cannot cancel approved spec ${spec.spec_id}: implementation queue entry not found.`)
  }
  if (queueEntry.state !== "QUEUED") {
    throw new Error(`Cannot cancel approved spec ${spec.spec_id}: queue state is ${queueEntry.state}.`)
  }
  const now = new Date().toISOString()
  const cancelledQueueEntry = {
    ...queueEntry,
    state: "CANCELLED" as const,
    cancelled_at: now,
    cancelled_by: actor,
    cancel_reason: reason ?? "operator cancelled before implementation claim",
  }
  const idea = await loadIdeaById(spec.idea_id, scope)
  if (!idea) {
    throw new Error(`Cannot cancel approved spec ${spec.spec_id}: idea ${spec.idea_id} not found.`)
  }
  const restoredIdea = restoreIdeaAfterSpecCancel(idea, spec.spec_id)
  const message = `research lab: cancel approved strategy spec ${spec.spec_id}`
  const auditRelpath = specAuditLogRelpath(spec.spec_id, scope)
  const existingAudit = await readDashboardFileText(auditRelpath)
  const event = {
    event_id: `evt_${ulid()}`,
    spec_id: spec.spec_id,
    ts: now,
    actor_kind: "operator",
    actor_id: actor,
    transition: { from: previousState, to: spec.state },
    context: {
      dashboard_commit: null,
      implementation_commit: null,
      queue_entry_id: queueEntry.queue_entry_id,
      message,
    },
  }
  return commitDashboardFiles({
    message,
    files: [
      {
        relpath: `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/strategy_specs/${spec.spec_id}.yaml`,
        content: strategySpecToYaml(spec),
      },
      {
        relpath: specImplementationQueueRelpath(spec.spec_id, scope),
        content: yaml.dump(cancelledQueueEntry, { noRefs: true, lineWidth: 100 }),
      },
      {
        relpath: ideaRepoRelpath(scope, restoredIdea.idea_id),
        content: ideaArtifactToYaml(restoredIdea),
      },
      {
        relpath: auditRelpath,
        content: `${existingAudit ?? ""}${JSON.stringify(event)}\n`,
      },
    ],
  })
}

function restoreIdeaAfterSpecCancel(idea: IdeaArtifact, specId: string): IdeaArtifact {
  if (idea.strategy_ref.kind === "SPEC_PENDING" && idea.strategy_ref.active_spec_id === specId) {
    return {
      ...idea,
      needs_spec: true,
      strategy_ref: {
        kind: "NONE",
        active_spec_id: null,
        pending_spec_id: null,
        strategy_id: null,
        preset_id: null,
      },
    }
  }
  if (idea.strategy_ref.kind === "REGISTERED" && idea.strategy_ref.pending_spec_id === specId) {
    return {
      ...idea,
      strategy_ref: {
        ...idea.strategy_ref,
        pending_spec_id: null,
      },
    }
  }
  throw new Error(`Cannot cancel approved spec ${specId}: idea strategy_ref no longer points at this spec.`)
}

async function persistSpecStateChange({
  spec,
  previousState,
  scope,
  actor,
  message,
}: {
  spec: StrategySpecV1
  previousState: StrategySpecV1["state"]
  scope: ScopeTriple
  actor: string
  message: string
}) {
  const auditRelpath = specAuditLogRelpath(spec.spec_id, scope)
  const existingAudit = await readDashboardFileText(auditRelpath)
  const event = {
    event_id: `evt_${ulid()}`,
    spec_id: spec.spec_id,
    ts: new Date().toISOString(),
    actor_kind: "operator",
    actor_id: actor,
    transition: { from: previousState, to: spec.state },
    context: {
      dashboard_commit: null,
      implementation_commit: null,
      queue_entry_id: null,
      message,
    },
  }
  return commitDashboardFiles({
    message,
    files: [
      {
        relpath: `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/strategy_specs/${spec.spec_id}.yaml`,
        content: strategySpecToYaml(spec),
      },
      {
        relpath: auditRelpath,
        content: `${existingAudit ?? ""}${JSON.stringify(event)}\n`,
      },
    ],
  })
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveSpec(req, ctx)
  if ("response" in resolved) return resolved.response

  try {
    const persisted = await deleteStrategySpecArtifact(
      resolved.spec,
      resolved.scope,
      `research lab: delete draft strategy spec ${resolved.spec.spec_id}`,
    )
    return NextResponse.json({ ok: true, ...persisted, spec_id: resolved.spec.spec_id })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete strategy spec" },
      { status: 409 },
    )
  }
}

async function resolveSpec(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
  scopeInput?: unknown,
): Promise<{ scope: ScopeTriple; spec: StrategySpecV1 } | { response: NextResponse }> {
  const { id } = await ctx.params
  let specId: string
  let scope: ScopeTriple
  try {
    specId = safePathSegment(decodeURIComponent(id), "spec_id")
    if (scopeInput !== undefined) {
      scope = normalizeScope(scopeInput)
    } else {
      const url = new URL(req.url)
      scope = normalizeScope({
        user_id: url.searchParams.get("user_id") ?? undefined,
        account_id: url.searchParams.get("account_id") ?? undefined,
        strategy_group_id: url.searchParams.get("strategy_group_id") ?? undefined,
      })
    }
  } catch (error) {
    return {
      response: NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid strategy spec request" },
        { status: 400 },
      ),
    }
  }

  const spec = await loadStrategySpecById(specId, scope)
  if (!spec) {
    return {
      response: NextResponse.json({ error: `Strategy spec not found: ${specId}` }, { status: 404 }),
    }
  }
  return { scope, spec }
}
