import type {
  PacketCompileResultV1,
  ScopeTriple,
  StrategyAuthoringPacketV1,
  TrialLedgerEntryV1,
} from "./research-lab-contracts"
import { compileStrategyAuthoringPacket } from "./research-lab-strategy-authoring-compiler"
import {
  loadStrategyAuthoringPacket,
  loadTrialLedgerEntriesForPacket,
  persistTrialLedgerEntries,
} from "./research-lab-strategy-authoring.server"
import {
  validateStrategyAuthoringPacket,
  type StrategyAuthoringValidationIssue,
} from "./research-lab-strategy-authoring"

export type PacketBenchHandoffStatus = "READY_FOR_BENCH" | "NEEDS_MAPPING"

export interface PreparePacketBenchHandoffArgs {
  scope: ScopeTriple
  packetId: string
  persist?: boolean
}

export interface PacketBenchHandoffResult {
  packet: StrategyAuthoringPacketV1
  compile_result: PacketCompileResultV1
  validation_issues: StrategyAuthoringValidationIssue[]
  trial_ledger_entries: TrialLedgerEntryV1[]
  pending_trial_ledger_entries: TrialLedgerEntryV1[]
  created_trial_ledger_entries: TrialLedgerEntryV1[]
  existing_trial_ledger_entries: TrialLedgerEntryV1[]
  handoff_status: PacketBenchHandoffStatus
  persisted?: Awaited<ReturnType<typeof persistTrialLedgerEntries>> | null
}

export async function preparePacketBenchHandoff({
  scope,
  packetId,
  persist = true,
}: PreparePacketBenchHandoffArgs): Promise<PacketBenchHandoffResult> {
  const packet = await loadStrategyAuthoringPacket(packetId, scope)
  if (!packet) throw httpError(404, "Strategy authoring packet not found.")
  if (packet.status !== "APPROVED") {
    throw httpError(409, "Bench handoff only accepts APPROVED StrategyAuthoringPacketV1 artifacts.")
  }

  const validationIssues = validateStrategyAuthoringPacket(packet)
  const validationErrors = validationIssues.filter(issue => issue.severity === "error")
  if (validationErrors.length > 0) {
    throw httpError(422, "Strategy authoring packet failed handoff validation.", {
      validation_issues: validationIssues,
    })
  }

  const existingEntries = await loadTrialLedgerEntriesForPacket(packet.packet_id, scope)
  const compileResult = compileStrategyAuthoringPacket(packet, {
    compiledAt: compileTimestampFor(packet),
  })
  if (compileResult.compile_status === "BLOCKED") {
    throw httpError(422, "Packet compiler is blocked; trial ledger rows were not written.", {
      compile_result: compileResult,
    })
  }

  const plannedById = new Map(compileResult.planned_trial_ledger_entries.map(entry => [entry.trial_id, entry]))
  const staleEntries = existingEntries.filter(entry => !plannedById.has(entry.trial_id))
  if (staleEntries.length > 0) {
    throw httpError(409, "Existing trial ledger rows no longer match the packet compiler preview.", {
      stale_trial_ids: staleEntries.map(entry => entry.trial_id),
    })
  }

  const existingById = new Map(existingEntries.map(entry => [entry.trial_id, entry]))
  const missingEntries = compileResult.planned_trial_ledger_entries.filter(entry => !existingById.has(entry.trial_id))
  const persisted = persist && missingEntries.length > 0
    ? await persistTrialLedgerEntries({
        entries: missingEntries,
        scope,
        message: `research lab: seed strategy trial ledger ${packet.packet_id}`,
      })
    : null

  return {
    packet,
    compile_result: compileResult,
    validation_issues: validationIssues,
    trial_ledger_entries: sortTrialLedgerEntries([...existingEntries, ...missingEntries]),
    pending_trial_ledger_entries: missingEntries,
    created_trial_ledger_entries: persist ? missingEntries : [],
    existing_trial_ledger_entries: existingEntries,
    handoff_status: compileResult.compile_status === "NEEDS_MAPPING" ? "NEEDS_MAPPING" : "READY_FOR_BENCH",
    persisted,
  }
}

function compileTimestampFor(packet: StrategyAuthoringPacketV1): string {
  return packet.implementation_request?.requested_at ?? packet.updated_at
}

function sortTrialLedgerEntries(entries: TrialLedgerEntryV1[]): TrialLedgerEntryV1[] {
  return [...entries].sort((a, b) => {
    if (a.variant_index !== b.variant_index) return a.variant_index - b.variant_index
    if (a.era_id !== b.era_id) return a.era_id.localeCompare(b.era_id)
    return a.trial_id.localeCompare(b.trial_id)
  })
}

function httpError(status: number, message: string, payload?: unknown): Error {
  return Object.assign(new Error(message), { status, payload })
}
