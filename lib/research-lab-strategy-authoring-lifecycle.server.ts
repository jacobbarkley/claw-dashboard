import type {
  BenchJobConfigPreview,
  ImplementationPriority,
  PacketCompileResultV1,
  ScopeTriple,
  StrategyAuthoringPacketStatus,
  StrategyAuthoringPacketV1,
  TrialLedgerEntryV1,
} from "./research-lab-contracts"
import { compileStrategyAuthoringPacket } from "./research-lab-strategy-authoring-compiler"
import {
  loadStrategyAuthoringPacket,
  loadTrialLedgerEntriesForPacket,
  persistStrategyAuthoringPacket,
} from "./research-lab-strategy-authoring.server"
import {
  validateStrategyAuthoringPacket,
  type StrategyAuthoringValidationIssue,
} from "./research-lab-strategy-authoring"

const STRATEGY_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export interface PacketLifecycleView {
  packet: StrategyAuthoringPacketV1
  compile_result: PacketCompileResultV1
  validation_issues: StrategyAuthoringValidationIssue[]
  trial_ledger_entries: TrialLedgerEntryV1[]
}

export interface PacketLifecycleMutationResult extends PacketLifecycleView {
  persisted: Awaited<ReturnType<typeof persistStrategyAuthoringPacket>>
}

export interface ConfirmPacketStrategyIdArgs {
  scope: ScopeTriple
  packetId: string
  strategyId?: string | null
  actor?: string | null
}

export interface ConfirmPacketAssumptionArgs {
  scope: ScopeTriple
  packetId: string
  fieldPath: string
  actor?: string | null
}

export interface TransitionPacketStatusArgs {
  scope: ScopeTriple
  packetId: string
  nextStatus: StrategyAuthoringPacketStatus
  actor?: string | null
  implementationNotes?: string | null
  priority?: ImplementationPriority | null
}

export async function loadPacketLifecycleView({
  scope,
  packetId,
}: {
  scope: ScopeTriple
  packetId: string
}): Promise<PacketLifecycleView | null> {
  const packet = await loadStrategyAuthoringPacket(packetId, scope)
  if (!packet) return null
  return viewForPacket(packet, scope)
}

export async function confirmPacketStrategyId({
  scope,
  packetId,
  strategyId,
  actor = "jacob",
}: ConfirmPacketStrategyIdArgs): Promise<PacketLifecycleMutationResult> {
  const packet = await requirePacket(packetId, scope)
  if (packet.status !== "DRAFT" && packet.status !== "REVIEW" && packet.status !== "ADVERSARIAL") {
    throw httpError(409, `Cannot edit strategy_id while packet is ${packet.status}.`)
  }

  const nextSlug = (strategyId ?? packet.strategy_spec.strategy_id.value).trim()
  if (!STRATEGY_SLUG_RE.test(nextSlug)) {
    throw httpError(400, "strategy_id must be a safe registry slug.")
  }

  const now = new Date().toISOString()
  const slugChanged = nextSlug !== packet.strategy_spec.strategy_id.value
  const nextPacket: StrategyAuthoringPacketV1 = {
    ...packet,
    updated_at: now,
    strategy_spec: {
      ...packet.strategy_spec,
      strategy_id: {
        value: nextSlug,
        provenance: slugChanged
          ? {
              source: "USER",
              confidence: "HIGH",
              rationale: `Operator ${actor ?? "jacob"} edited and confirmed this strategy slug.`,
              source_artifact_id: null,
              operator_confirmed: true,
            }
          : {
              ...packet.strategy_spec.strategy_id.provenance,
              rationale: appendSentence(
                packet.strategy_spec.strategy_id.provenance.rationale,
                `Operator ${actor ?? "jacob"} confirmed this strategy slug.`,
              ),
              operator_confirmed: true,
            },
      },
    },
  }

  assertValidForPersist(nextPacket)
  const persisted = await persistStrategyAuthoringPacket({
    packet: nextPacket,
    scope,
    message: `research lab: confirm strategy authoring slug ${nextPacket.packet_id}`,
  })
  return { ...(await viewForPacket(nextPacket, scope)), persisted }
}

export async function confirmPacketAssumption({
  scope,
  packetId,
  fieldPath,
  actor = "jacob",
}: ConfirmPacketAssumptionArgs): Promise<PacketLifecycleMutationResult> {
  const packet = await requirePacket(packetId, scope)
  if (packet.status !== "DRAFT" && packet.status !== "REVIEW" && packet.status !== "ADVERSARIAL") {
    throw httpError(409, `Cannot confirm assumptions while packet is ${packet.status}.`)
  }

  const targetFieldPath = fieldPath.trim()
  if (!targetFieldPath) throw httpError(400, "field_path required")

  let matchCount = 0
  const now = new Date().toISOString()
  const nextPacket: StrategyAuthoringPacketV1 = {
    ...packet,
    updated_at: now,
    assumptions: {
      ...packet.assumptions,
      items: packet.assumptions.items.map(item => {
        if (item.field_path !== targetFieldPath) return item
        matchCount += 1
        return {
          ...item,
          resolution_needed: false,
          provenance: {
            ...item.provenance,
            rationale: appendSentence(
              item.provenance.rationale,
              `Operator ${actor ?? "jacob"} confirmed this assumption.`,
            ),
            operator_confirmed: true,
          },
        }
      }),
    },
  }

  if (matchCount === 0) {
    throw httpError(404, `No packet assumption found for field_path ${targetFieldPath}.`)
  }

  assertValidForPersist(nextPacket)
  const persisted = await persistStrategyAuthoringPacket({
    packet: nextPacket,
    scope,
    message: `research lab: confirm strategy authoring assumption ${nextPacket.packet_id}`,
  })
  return { ...(await viewForPacket(nextPacket, scope)), persisted }
}

export async function transitionPacketStatus({
  scope,
  packetId,
  nextStatus,
  actor = "jacob",
  implementationNotes = null,
  priority = "MEDIUM",
}: TransitionPacketStatusArgs): Promise<PacketLifecycleMutationResult> {
  const packet = await requirePacket(packetId, scope)
  validateStatusTransition(packet.status, nextStatus)

  const now = new Date().toISOString()
  let nextPacket: StrategyAuthoringPacketV1 = {
    ...packet,
    updated_at: now,
    status: nextStatus,
  }

  if (nextStatus === "ADVERSARIAL" || nextStatus === "APPROVED") {
    assertReviewAssumptionsResolved(nextPacket)
  }

  if (nextStatus === "APPROVED") {
    if (!nextPacket.strategy_spec.strategy_id.provenance.operator_confirmed) {
      throw httpError(422, "Confirm strategy_id before approving this packet.")
    }
    if (nextPacket.adversarial_review.status !== "PASS" && nextPacket.adversarial_review.status !== "CONDITIONAL") {
      throw httpError(422, "Adversarial review must be PASS or CONDITIONAL before approval.")
    }

    nextPacket = {
      ...nextPacket,
      implementation_request: {
        requested_at: now,
        requested_by: actor ?? "jacob",
        packet_id: nextPacket.packet_id,
        priority: priority ?? "MEDIUM",
        implementation_notes:
          implementationNotes?.trim() ||
          "Operator approved this strategy authoring packet for implementation.",
        bench_job_config: null,
      },
    }
    assertValidForPersist(nextPacket)
    const compilePreview = compileStrategyAuthoringPacket(nextPacket, { compiledAt: now })
    if (compilePreview.compile_status === "BLOCKED") {
      throw httpError(
        422,
        "Packet cannot be approved while the compiler preview is blocked.",
        { compile_result: compilePreview },
      )
    }
    const implementationRequest = nextPacket.implementation_request
    if (!implementationRequest) {
      throw httpError(500, "Implementation request was not created for approved packet.")
    }
    nextPacket = {
      ...nextPacket,
      implementation_request: {
        ...implementationRequest,
        bench_job_config: benchJobConfigForImplementation(compilePreview),
      },
    }
  } else {
    nextPacket = {
      ...nextPacket,
      implementation_request: null,
    }
  }

  assertValidForPersist(nextPacket)
  const persisted = await persistStrategyAuthoringPacket({
    packet: nextPacket,
    scope,
    message: `research lab: move strategy authoring packet ${nextPacket.packet_id} to ${nextStatus}`,
  })
  return { ...(await viewForPacket(nextPacket, scope)), persisted }
}

async function viewForPacket(packet: StrategyAuthoringPacketV1, scope: ScopeTriple): Promise<PacketLifecycleView> {
  const [trialLedgerEntries] = await Promise.all([
    loadTrialLedgerEntriesForPacket(packet.packet_id, scope),
  ])
  return {
    packet,
    compile_result: compileStrategyAuthoringPacket(packet),
    validation_issues: validateStrategyAuthoringPacket(packet),
    trial_ledger_entries: trialLedgerEntries,
  }
}

async function requirePacket(packetId: string, scope: ScopeTriple): Promise<StrategyAuthoringPacketV1> {
  const packet = await loadStrategyAuthoringPacket(packetId, scope)
  if (!packet) throw httpError(404, "Strategy authoring packet not found.")
  return packet
}

function validateStatusTransition(
  current: StrategyAuthoringPacketStatus,
  next: StrategyAuthoringPacketStatus,
) {
  if (current === next) return
  const allowed: Partial<Record<StrategyAuthoringPacketStatus, StrategyAuthoringPacketStatus[]>> = {
    DRAFT: ["REVIEW", "REJECTED", "ARCHIVED"],
    REVIEW: ["ADVERSARIAL", "REJECTED", "ARCHIVED"],
    ADVERSARIAL: ["REVIEW", "APPROVED", "REJECTED", "ARCHIVED"],
    REJECTED: ["ARCHIVED"],
  }
  if ((allowed[current] ?? []).includes(next)) return
  throw httpError(409, `Illegal StrategyAuthoringPacket transition: ${current} -> ${next}.`)
}

function assertReviewAssumptionsResolved(packet: StrategyAuthoringPacketV1) {
  const unresolved = packet.assumptions.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.resolution_needed && !item.provenance.operator_confirmed)
  if (unresolved.length === 0) return

  throw httpError(422, "Resolve review-required packet assumptions before advancing this packet.", {
    validation_issues: unresolved.map(({ item, index }) => ({
      field_path: `assumptions.items.${index}`,
      severity: "error",
      code: "ASSUMPTION_REVIEW_REQUIRED",
      message: `${item.field_path}: ${item.assumption}`,
    })),
    operator_hint: "Confirm, edit, or reject the review-required assumptions before moving this packet into adversarial review or approval.",
  })
}

function assertValidForPersist(packet: StrategyAuthoringPacketV1) {
  const issues = validateStrategyAuthoringPacket(packet)
  const errors = issues.filter(issue => issue.severity === "error")
  if (errors.length > 0) {
    throw httpError(422, "Strategy authoring packet failed lifecycle validation.", {
      validation_issues: issues,
    })
  }
}

function benchJobConfigForImplementation(
  compileResult: PacketCompileResultV1,
): BenchJobConfigPreview | null {
  const preview = compileResult.bench_job_config_preview
  if (!preview) return null
  return {
    strategy_spec_hash: preview.strategy_spec_hash,
    sweep_bounds_hash: preview.sweep_bounds_hash,
    era_plan_hash: preview.era_plan_hash,
    target_bench_runner: preview.target_bench_runner,
    estimated_runtime_minutes: preview.estimated_runtime_minutes ?? null,
  }
}

function appendSentence(base: string, sentence: string): string {
  const trimmedBase = base.trim()
  const trimmedSentence = sentence.trim()
  if (!trimmedBase) return trimmedSentence
  if (trimmedBase.includes(trimmedSentence)) return trimmedBase
  return `${trimmedBase}${trimmedBase.endsWith(".") ? "" : "."} ${trimmedSentence}`
}

function httpError(status: number, message: string, payload?: unknown): Error {
  return Object.assign(new Error(message), { status, payload })
}
