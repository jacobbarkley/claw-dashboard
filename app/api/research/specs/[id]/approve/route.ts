// POST /api/research/specs/[id]/approve
//
// Phase E foundation: approving a reviewed spec moves it to APPROVED and
// enqueues a manual/Codex implementation work item in one dashboard commit.

import { randomBytes } from "crypto"

import { NextRequest, NextResponse } from "next/server"
import yaml from "js-yaml"

import type {
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
  normalizeScope,
  safePathSegment,
  strategySpecToYaml,
  validateStrategySpec,
} from "../../_shared"

interface ApproveBody {
  scope?: unknown
  actor?: unknown
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  let body: ApproveBody
  try {
    body = (await req.json()) as ApproveBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  let specId: string
  let scope: ScopeTriple
  try {
    specId = safePathSegment(decodeURIComponent(id), "spec_id")
    scope = normalizeScope(body.scope)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid approve request" },
      { status: 400 },
    )
  }
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "jacob"

  const spec = await loadStrategySpecById(specId, scope)
  if (!spec) return NextResponse.json({ error: `Strategy spec not found: ${specId}` }, { status: 404 })
  if (spec.state !== "AWAITING_APPROVAL") {
    return NextResponse.json(
      { error: "Spec must be AWAITING_APPROVAL before approval.", current_state: spec.state },
      { status: 409 },
    )
  }

  const idea = await loadIdeaById(spec.idea_id, scope)
  if (!idea) return NextResponse.json({ error: `Idea not found: ${spec.idea_id}` }, { status: 404 })

  const ref = idea.strategy_ref
  const pointsAtSpec = ref.active_spec_id === spec.spec_id || ref.pending_spec_id === spec.spec_id
  const acceptableKind =
    ref.kind === "SPEC_PENDING" ||
    (ref.kind === "REGISTERED" && ref.pending_spec_id === spec.spec_id)
  if (!acceptableKind || !pointsAtSpec) {
    return NextResponse.json(
      {
        error:
          "Idea strategy_ref must point at this spec before approval. " +
          "Expected SPEC_PENDING.active_spec_id or REGISTERED.pending_spec_id.",
        strategy_ref: ref,
      },
      { status: 409 },
    )
  }

  const existingQueue = await loadSpecImplementationQueueEntry(spec.spec_id, scope)
  if (existingQueue) {
    return NextResponse.json(
      { error: `Implementation queue entry already exists for ${spec.spec_id}.`, queue_entry: existingQueue },
      { status: 409 },
    )
  }

  const transition = canTransitionSpec(spec.state, "APPROVED")
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: 409 })

  const now = new Date().toISOString()
  const updatedSpec: StrategySpecV1 = {
    ...spec,
    state: "APPROVED",
    approved_at: now,
    approved_by: actor,
  }
  try {
    validateStrategySpec(updatedSpec)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approved spec failed validation" },
      { status: 400 },
    )
  }

  const queueEntry: SpecImplementationQueueV1 = {
    schema_version: "research_lab.spec_implementation_queue.v1",
    queue_entry_id: `que_${ulid()}`,
    spec_id: spec.spec_id,
    spec_version: spec.spec_version,
    idea_id: spec.idea_id,
    user_id: scope.user_id,
    account_id: scope.account_id,
    strategy_group_id: scope.strategy_group_id,
    state: "QUEUED",
    queued_at: now,
    queued_by: actor,
    claimed_at: null,
    claimed_by: null,
    attempts: 0,
    implementation_started_at: null,
    implementation_finished_at: null,
    implementation_commit: null,
    registered_strategy_id: null,
    preset_id: null,
    last_error: null,
    last_error_at: null,
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,
  }

  const auditRelpath = specAuditLogRelpath(spec.spec_id, scope)
  const existingAudit = await readDashboardFileText(auditRelpath)
  const event: SpecAuditEventV1 = {
    event_id: `evt_${ulid()}`,
    spec_id: spec.spec_id,
    ts: now,
    actor_kind: "operator",
    actor_id: actor,
    transition: { from: spec.state, to: "APPROVED" },
    context: {
      dashboard_commit: null,
      implementation_commit: null,
      queue_entry_id: queueEntry.queue_entry_id,
      message: "approved via /api/research/specs/[id]/approve",
    },
  }

  try {
    const persisted = await commitDashboardFiles({
      message: `research lab: approve strategy spec ${spec.spec_id}`,
      files: [
        {
          relpath: strategySpecRepoRelpath(spec.spec_id, scope),
          content: strategySpecToYaml(updatedSpec),
        },
        {
          relpath: specImplementationQueueRelpath(spec.spec_id, scope),
          content: yaml.dump(queueEntry, { noRefs: true, lineWidth: 100 }),
        },
        {
          relpath: auditRelpath,
          content: `${existingAudit ?? ""}${JSON.stringify(event)}\n`,
        },
      ],
    })
    return NextResponse.json({ ok: true, ...persisted, spec: updatedSpec, queue_entry: queueEntry })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown approve failure"
    return NextResponse.json({ error: `Failed to approve strategy spec: ${detail}` }, { status: 500 })
  }
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function ulid(): string {
  let ts = Date.now()
  let tsStr = ""
  for (let i = 0; i < 10; i++) {
    tsStr = CROCKFORD[ts % 32] + tsStr
    ts = Math.floor(ts / 32)
  }
  const rand = randomBytes(10)
  let randStr = ""
  for (let i = 0; i < 16; i++) {
    randStr += CROCKFORD[rand[i % rand.length] % 32]
  }
  return tsStr + randStr
}
