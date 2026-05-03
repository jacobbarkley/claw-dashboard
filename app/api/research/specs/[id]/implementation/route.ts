// POST /api/research/specs/[id]/implementation
//
// Phase E manual implementation lifecycle. Codex or a future worker can claim
// an approved spec, mark implementation as started, then finish with either a
// registered strategy/preset or a failure reason. All queue/spec/idea/audit
// changes land in one dashboard artifact commit.

import { NextRequest, NextResponse } from "next/server"
import yaml from "js-yaml"

import type {
  IdeaArtifact,
  ScopeTriple,
  SpecAuditEventV1,
  SpecImplementationQueueV1,
  StrategySpecV1,
} from "@/lib/research-lab-contracts"
import { commitDashboardFiles, readDashboardFileText } from "@/lib/github-multi-file-commit.server"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import {
  loadSpecImplementationQueueEntry,
  specAuditLogRelpath,
  specImplementationQueueRelpath,
} from "@/lib/research-lab-queue.server"
import { loadStrategySpecById, strategySpecRepoRelpath } from "@/lib/research-lab-specs.server"

import {
  canTransitionSpec,
  ideaArtifactToYaml,
  ideaRepoRelpath,
  normalizeScope,
  optionalString,
  safePathSegment,
  strategySpecToYaml,
  ulid,
  validateStrategySpec,
} from "../../_shared"

type ImplementationAction = "claim" | "start" | "finish"
type FinishOutcome = "COMPLETED" | "FAILED"

interface Body {
  scope?: unknown
  action?: unknown
  actor?: unknown
  outcome?: unknown
  implementation_commit?: unknown
  registered_strategy_id?: unknown
  preset_id?: unknown
  error?: unknown
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  const { id } = await ctx.params
  let specId: string
  let scope: ScopeTriple
  let action: ImplementationAction
  try {
    specId = safePathSegment(decodeURIComponent(id), "spec_id")
    scope = normalizeScope(body.scope)
    action = parseAction(body.action)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid implementation request" },
      { status: 400 },
    )
  }

  const actor = optionalString(body.actor) ?? "codex"
  const spec = await loadStrategySpecById(specId, scope)
  if (!spec) return NextResponse.json({ error: `Strategy spec not found: ${specId}` }, { status: 404 })

  const queueEntry = await loadSpecImplementationQueueEntry(specId, scope)
  if (!queueEntry) {
    return NextResponse.json(
      { error: `Implementation queue entry not found for ${specId}. Approve the spec first.` },
      { status: 404 },
    )
  }

  try {
    if (action === "claim") {
      return NextResponse.json(await claimImplementation({ spec, queueEntry, scope, actor }))
    }
    if (action === "start") {
      return NextResponse.json(await startImplementation({ spec, queueEntry, scope, actor }))
    }
    return NextResponse.json(await finishImplementation({ spec, queueEntry, scope, actor, body }))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Implementation lifecycle update failed" },
      { status: 409 },
    )
  }
}

async function claimImplementation({
  spec,
  queueEntry,
  scope,
  actor,
}: {
  spec: StrategySpecV1
  queueEntry: SpecImplementationQueueV1
  scope: ScopeTriple
  actor: string
}) {
  if (spec.state !== "APPROVED") {
    throw new Error(`Spec must be APPROVED before implementation claim; got ${spec.state}.`)
  }
  if (queueEntry.state !== "QUEUED") {
    throw new Error(`Only QUEUED implementation entries can be claimed; got ${queueEntry.state}.`)
  }
  const now = new Date().toISOString()
  const nextQueue: SpecImplementationQueueV1 = {
    ...queueEntry,
    state: "CLAIMED",
    claimed_at: now,
    claimed_by: actor,
    attempts: queueEntry.attempts + 1,
  }
  return persistLifecycle({
    spec,
    queueEntry: nextQueue,
    scope,
    actor,
    message: `research lab: claim implementation for ${spec.spec_id}`,
    auditTransition: { from: spec.state, to: spec.state },
  })
}

async function startImplementation({
  spec,
  queueEntry,
  scope,
  actor,
}: {
  spec: StrategySpecV1
  queueEntry: SpecImplementationQueueV1
  scope: ScopeTriple
  actor: string
}) {
  if (spec.state !== "APPROVED") {
    throw new Error(`Spec must be APPROVED before implementation start; got ${spec.state}.`)
  }
  if (queueEntry.state !== "CLAIMED") {
    throw new Error(`Only CLAIMED implementation entries can start; got ${queueEntry.state}.`)
  }
  const now = new Date().toISOString()
  const nextQueue: SpecImplementationQueueV1 = {
    ...queueEntry,
    state: "IMPLEMENTING",
    implementation_started_at: now,
  }
  return persistLifecycle({
    spec,
    queueEntry: nextQueue,
    scope,
    actor,
    message: `research lab: start implementation for ${spec.spec_id}`,
    auditTransition: { from: spec.state, to: spec.state },
  })
}

async function finishImplementation({
  spec,
  queueEntry,
  scope,
  actor,
  body,
}: {
  spec: StrategySpecV1
  queueEntry: SpecImplementationQueueV1
  scope: ScopeTriple
  actor: string
  body: Body
}) {
  const outcome = parseOutcome(body.outcome)
  if (queueEntry.state !== "CLAIMED" && queueEntry.state !== "IMPLEMENTING") {
    throw new Error(`Only CLAIMED or IMPLEMENTING entries can finish; got ${queueEntry.state}.`)
  }
  if (outcome === "FAILED") {
    const now = new Date().toISOString()
    const message = optionalString(body.error) ?? "implementation failed without detail"
    const failedQueue: SpecImplementationQueueV1 = {
      ...queueEntry,
      state: "FAILED",
      implementation_started_at: queueEntry.implementation_started_at ?? now,
      implementation_finished_at: now,
      last_error: message,
      last_error_at: now,
    }
    return persistLifecycle({
      spec,
      queueEntry: failedQueue,
      scope,
      actor,
      message: `research lab: fail implementation for ${spec.spec_id}`,
      auditTransition: { from: spec.state, to: spec.state },
    })
  }

  const registeredStrategyId = parseSafeOptional(body.registered_strategy_id, "registered_strategy_id")
  const presetId = parseSafeOptional(body.preset_id, "preset_id")
  if (!registeredStrategyId) throw new Error("registered_strategy_id required when outcome=COMPLETED.")
  if (!presetId) throw new Error("preset_id required when outcome=COMPLETED.")

  const implementationCommit = parseSafeOptional(body.implementation_commit, "implementation_commit")
  const now = new Date().toISOString()
  const registeredSpec: StrategySpecV1 = {
    ...spec,
    state: "REGISTERED",
    registered_strategy_id: registeredStrategyId,
    preset_id: presetId,
  }
  const transition = canTransitionSpec(spec.state, registeredSpec.state)
  if (!transition.ok) throw new Error(transition.error)
  validateStrategySpec(registeredSpec)

  const idea = await loadIdeaById(spec.idea_id, scope)
  if (!idea) throw new Error(`Idea not found: ${spec.idea_id}`)
  const registeredIdea = registerIdeaAfterImplementation({
    idea,
    spec,
    registeredStrategyId,
    presetId,
  })

  const completedQueue: SpecImplementationQueueV1 = {
    ...queueEntry,
    state: "COMPLETED",
    implementation_started_at: queueEntry.implementation_started_at ?? now,
    implementation_finished_at: now,
    implementation_commit: implementationCommit,
    registered_strategy_id: registeredStrategyId,
    preset_id: presetId,
    last_error: null,
    last_error_at: null,
  }

  return persistLifecycle({
    spec: registeredSpec,
    queueEntry: completedQueue,
    idea: registeredIdea,
    scope,
    actor,
    message: `research lab: finish implementation for ${spec.spec_id}`,
    implementationCommit,
    auditTransition: { from: spec.state, to: registeredSpec.state },
  })
}

async function persistLifecycle({
  spec,
  queueEntry,
  idea,
  scope,
  actor,
  message,
  implementationCommit = null,
  auditTransition,
}: {
  spec: StrategySpecV1
  queueEntry: SpecImplementationQueueV1
  idea?: IdeaArtifact
  scope: ScopeTriple
  actor: string
  message: string
  implementationCommit?: string | null
  auditTransition: SpecAuditEventV1["transition"]
}) {
  const auditRelpath = specAuditLogRelpath(spec.spec_id, scope)
  const existingAudit = await readDashboardFileText(auditRelpath)
  const event: SpecAuditEventV1 = {
    event_id: `evt_${ulid()}`,
    spec_id: spec.spec_id,
    ts: new Date().toISOString(),
    actor_kind: "worker",
    actor_id: actor,
    transition: auditTransition,
    context: {
      dashboard_commit: null,
      implementation_commit: implementationCommit,
      queue_entry_id: queueEntry.queue_entry_id,
      message,
    },
  }
  const files = [
    {
      relpath: strategySpecRepoRelpath(spec.spec_id, scope),
      content: strategySpecToYaml(spec),
    },
    {
      relpath: specImplementationQueueRelpath(spec.spec_id, scope),
      content: yaml.dump(queueEntry, { noRefs: true, lineWidth: 100 }),
    },
    {
      relpath: auditRelpath,
      content: `${existingAudit ?? ""}${JSON.stringify(event)}\n`,
    },
  ]
  if (idea) {
    files.push({
      relpath: ideaRepoRelpath(scope, idea.idea_id),
      content: ideaArtifactToYaml(idea),
    })
  }
  const persisted = await commitDashboardFiles({ message, files })
  return { ok: true, ...persisted, spec, queue_entry: queueEntry, idea: idea ?? null }
}

function registerIdeaAfterImplementation({
  idea,
  spec,
  registeredStrategyId,
  presetId,
}: {
  idea: IdeaArtifact
  spec: StrategySpecV1
  registeredStrategyId: string
  presetId: string
}): IdeaArtifact {
  if (idea.strategy_ref.kind === "SPEC_PENDING" && idea.strategy_ref.active_spec_id === spec.spec_id) {
    return {
      ...idea,
      status: "READY",
      needs_spec: false,
      strategy_ref: {
        kind: "REGISTERED",
        active_spec_id: spec.spec_id,
        pending_spec_id: null,
        strategy_id: registeredStrategyId,
        preset_id: presetId,
      },
      strategy_id: registeredStrategyId,
      code_pending: false,
    }
  }
  if (idea.strategy_ref.kind === "REGISTERED" && idea.strategy_ref.pending_spec_id === spec.spec_id) {
    return {
      ...idea,
      status: "READY",
      needs_spec: false,
      strategy_ref: {
        ...idea.strategy_ref,
        active_spec_id: spec.spec_id,
        pending_spec_id: null,
        strategy_id: registeredStrategyId,
        preset_id: presetId,
      },
      strategy_id: registeredStrategyId,
      code_pending: false,
    }
  }
  throw new Error(`Idea strategy_ref does not point at implementation spec ${spec.spec_id}.`)
}

function parseAction(input: unknown): ImplementationAction {
  const value = typeof input === "string" ? input.trim().toLowerCase() : ""
  if (value === "claim" || value === "start" || value === "finish") return value
  throw new Error("action must be claim, start, or finish")
}

function parseOutcome(input: unknown): FinishOutcome {
  const value = typeof input === "string" ? input.trim().toUpperCase() : ""
  if (value === "COMPLETED" || value === "FAILED") return value
  throw new Error("outcome must be COMPLETED or FAILED when action=finish")
}

function parseSafeOptional(input: unknown, label: string): string | null {
  const value = optionalString(input)
  if (!value) return null
  return safePathSegment(value, label)
}
