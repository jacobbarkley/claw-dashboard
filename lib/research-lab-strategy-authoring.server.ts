import { promises as fs } from "fs"
import path from "path"

import {
  PHASE_1_DEFAULT_SCOPE,
  type ScopeTriple,
  type StrategyAuthoringPacketV1,
  type TrialLedgerEntryV1,
} from "./research-lab-contracts"
import {
  commitDashboardFiles,
  readDashboardDirectory,
  readDashboardFileText,
  type MultiFileCommitResult,
} from "./github-multi-file-commit.server"
import {
  assertValidStrategyAuthoringPacket,
  assertValidTrialLedgerEntry,
  STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION,
  TRIAL_LEDGER_ENTRY_SCHEMA_VERSION,
} from "./research-lab-strategy-authoring"

const SAFE_PACKET_ID = /^packet_[0-9A-HJKMNP-TV-Z]{26}$/
const SAFE_TRIAL_ID = /^trial_[0-9A-HJKMNP-TV-Z]{26}$/

export function strategyAuthoringPacketRepoRelpath(
  packetId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): string {
  if (!SAFE_PACKET_ID.test(packetId)) throw new Error(`Unsafe packet id: ${packetId}`)
  return `${strategyAuthoringPacketsRepoDirRelpath(scope)}/${packetId}.json`
}

export function trialLedgerEntryRepoRelpath(
  trialId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): string {
  if (!SAFE_TRIAL_ID.test(trialId)) throw new Error(`Unsafe trial id: ${trialId}`)
  return `${trialLedgerRepoDirRelpath(scope)}/${trialId}.json`
}

export function strategyAuthoringPacketsRepoDirRelpath(
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): string {
  return `${strategyAuthoringRootRepoDirRelpath(scope)}/packets`
}

export function trialLedgerRepoDirRelpath(scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE): string {
  return `${strategyAuthoringRootRepoDirRelpath(scope)}/trial_ledger`
}

export async function loadStrategyAuthoringPacket(
  packetId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<StrategyAuthoringPacketV1 | null> {
  if (!SAFE_PACKET_ID.test(packetId)) return null
  const raw = await readDashboardFileText(strategyAuthoringPacketRepoRelpath(packetId, scope))
  if (!raw) return null
  return parseStrategyAuthoringPacket(raw)
}

export async function loadStrategyAuthoringPackets(
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<StrategyAuthoringPacketV1[]> {
  const dirRelpath = strategyAuthoringPacketsRepoDirRelpath(scope)
  const entries = process.env.GITHUB_TOKEN
    ? await readDashboardDirectory(dirRelpath)
    : await readLocalDirectory(dirRelpath)
  if (!entries) return []

  const packets = await Promise.all(
    entries
      .filter(entry => entry.type === "file" && entry.name.endsWith(".json"))
      .map(async entry => {
        const raw = await readDashboardFileText(entry.path)
        return raw ? parseStrategyAuthoringPacket(raw) : null
      }),
  )
  return packets
    .filter((packet): packet is StrategyAuthoringPacketV1 => packet != null)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export async function loadTrialLedgerEntriesForPacket(
  packetId: string,
  scope: ScopeTriple = PHASE_1_DEFAULT_SCOPE,
): Promise<TrialLedgerEntryV1[]> {
  if (!SAFE_PACKET_ID.test(packetId)) return []
  const dirRelpath = trialLedgerRepoDirRelpath(scope)
  const entries = process.env.GITHUB_TOKEN
    ? await readDashboardDirectory(dirRelpath)
    : await readLocalDirectory(dirRelpath)
  if (!entries) return []

  const ledgerRows = await Promise.all(
    entries
      .filter(entry => entry.type === "file" && entry.name.endsWith(".json"))
      .map(async entry => {
        const raw = await readDashboardFileText(entry.path)
        return raw ? parseTrialLedgerEntry(raw) : null
      }),
  )

  return ledgerRows
    .filter((entry): entry is TrialLedgerEntryV1 => entry?.packet_id === packetId)
    .sort((a, b) => {
      if (a.variant_index !== b.variant_index) return a.variant_index - b.variant_index
      return a.era_id.localeCompare(b.era_id)
    })
}

export async function persistStrategyAuthoringPacket({
  packet,
  scope = PHASE_1_DEFAULT_SCOPE,
  message,
}: {
  packet: StrategyAuthoringPacketV1
  scope?: ScopeTriple
  message?: string
}): Promise<MultiFileCommitResult> {
  assertValidStrategyAuthoringPacket(packet)
  return commitDashboardFiles({
    message: message ?? `research lab: persist strategy authoring packet ${packet.packet_id}`,
    files: [
      {
        relpath: strategyAuthoringPacketRepoRelpath(packet.packet_id, scope),
        content: strategyAuthoringPacketToJson(packet),
      },
    ],
  })
}

export async function persistTrialLedgerEntries({
  entries,
  scope = PHASE_1_DEFAULT_SCOPE,
  message,
}: {
  entries: TrialLedgerEntryV1[]
  scope?: ScopeTriple
  message?: string
}): Promise<MultiFileCommitResult> {
  for (const entry of entries) assertValidTrialLedgerEntry(entry)
  return commitDashboardFiles({
    message: message ?? `research lab: persist ${entries.length} strategy trial ledger rows`,
    files: entries.map(entry => ({
      relpath: trialLedgerEntryRepoRelpath(entry.trial_id, scope),
      content: trialLedgerEntryToJson(entry),
    })),
  })
}

export function parseStrategyAuthoringPacket(raw: string): StrategyAuthoringPacketV1 | null {
  const parsed = JSON.parse(raw) as Partial<StrategyAuthoringPacketV1>
  if (parsed.schema_version !== STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION) return null
  const packet = parsed as StrategyAuthoringPacketV1
  assertValidStrategyAuthoringPacket(packet)
  return packet
}

export function parseTrialLedgerEntry(raw: string): TrialLedgerEntryV1 | null {
  const parsed = JSON.parse(raw) as Partial<TrialLedgerEntryV1>
  if (parsed.schema_version !== TRIAL_LEDGER_ENTRY_SCHEMA_VERSION) return null
  const entry = parsed as TrialLedgerEntryV1
  assertValidTrialLedgerEntry(entry)
  return entry
}

export function strategyAuthoringPacketToJson(packet: StrategyAuthoringPacketV1): string {
  return `${JSON.stringify(packet, null, 2)}\n`
}

export function trialLedgerEntryToJson(entry: TrialLedgerEntryV1): string {
  return `${JSON.stringify(entry, null, 2)}\n`
}

function strategyAuthoringRootRepoDirRelpath(scope: ScopeTriple): string {
  return `data/research_lab/${scope.user_id}/${scope.account_id}/${scope.strategy_group_id}/strategy_authoring`
}

async function readLocalDirectory(
  relpath: string,
): Promise<Array<{ name: string; path: string; type: "file" | "dir" | string }> | null> {
  try {
    const entries = await fs.readdir(path.join(process.cwd(), relpath), { withFileTypes: true })
    return entries.map(entry => ({
      name: entry.name,
      path: `${relpath}/${entry.name}`,
      type: entry.isDirectory() ? "dir" : "file",
    }))
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    throw err
  }
}
