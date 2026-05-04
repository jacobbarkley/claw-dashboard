import type {
  PacketBenchConfigPreview,
  PacketCompileIssue,
  PacketCompileResultV1,
  StrategyAuthoringPacketV1,
  TrialLedgerConsumption,
  TrialLedgerEntryV1,
} from "./research-lab-contracts"
import {
  buildPacketSectionHashes,
  stableShortId,
  stableTrialId,
  STRATEGY_AUTHORING_COMPILE_RESULT_SCHEMA_VERSION,
  TRIAL_LEDGER_ENTRY_SCHEMA_VERSION,
  validateStrategyAuthoringPacket,
} from "./research-lab-strategy-authoring"

export interface CompileStrategyAuthoringPacketOptions {
  compiledAt?: string
  ledgerConsumption?: TrialLedgerConsumption
  targetBenchRunner?: string
  estimatedRuntimeMinutes?: number | null
}

const DEFAULT_LEDGER_CONSUMPTION: TrialLedgerConsumption = {
  variants_used: 0,
  bench_runs_used: 0,
  eras_used: 0,
}

export function compileStrategyAuthoringPacket(
  packet: StrategyAuthoringPacketV1,
  options: CompileStrategyAuthoringPacketOptions = {},
): PacketCompileResultV1 {
  const compiledAt = options.compiledAt ?? new Date().toISOString()
  const sectionHashes = buildPacketSectionHashes(packet)
  const benchConfigId = deterministicBenchConfigId(packet.packet_id, sectionHashes)
  const ledgerConsumption = options.ledgerConsumption ?? DEFAULT_LEDGER_CONSUMPTION
  const issues: PacketCompileIssue[] = []

  for (const issue of validateStrategyAuthoringPacket(packet)) {
    if (issue.severity === "error") {
      issues.push({
        code: "INVALID_PACKET",
        field_path: issue.field_path,
        message: issue.message,
      })
    }
  }

  if (packet.status !== "APPROVED") {
    issues.push({
      code: "APPROVAL_REQUIRED",
      field_path: "status",
      message: "Only APPROVED strategy authoring packets can compile into bench config previews.",
    })
  }

  if (packet.portfolio_fit.status === "PENDING" && packet.portfolio_fit.deferred_until === "BEFORE_BENCH") {
    issues.push({
      code: "APPROVAL_REQUIRED",
      field_path: "portfolio_fit",
      message: "Portfolio-fit review is deferred until BEFORE_BENCH and must be resolved before compilation.",
    })
  }

  addLedgerBudgetIssues(packet, ledgerConsumption, issues)
  addDataReadinessIssues(packet, issues)
  addCompilerMappingIssues(packet, issues)

  const plannedTrialLedgerEntries = buildPlannedTrialLedgerEntries(packet, benchConfigId, compiledAt)
  const benchJobConfigPreview =
    hasBlockingIssue(issues) || hasMappingIssue(issues)
      ? null
      : buildBenchJobConfigPreview(packet, sectionHashes, benchConfigId, options)

  return {
    schema_version: STRATEGY_AUTHORING_COMPILE_RESULT_SCHEMA_VERSION,
    packet_id: packet.packet_id,
    compiled_at: compiledAt,
    compile_status: compileStatusFor(issues),
    issues,
    section_hashes: sectionHashes,
    bench_config_id: benchConfigId,
    planned_trial_ledger_entries: plannedTrialLedgerEntries,
    bench_job_config_preview: benchJobConfigPreview,
  }
}

export function deterministicBenchConfigId(
  packetId: string,
  hashes: {
    strategy_spec_hash: string
    sweep_bounds_hash: string
    era_plan_hash: string
  },
): string {
  return stableShortId(
    "benchcfg",
    `${packetId}|${hashes.strategy_spec_hash}|${hashes.sweep_bounds_hash}|${hashes.era_plan_hash}`,
  )
}

function buildBenchJobConfigPreview(
  packet: StrategyAuthoringPacketV1,
  hashes: PacketCompileResultV1["section_hashes"],
  benchConfigId: string,
  options: CompileStrategyAuthoringPacketOptions,
): PacketBenchConfigPreview {
  return {
    bench_config_id: benchConfigId,
    strategy_spec_hash: hashes.strategy_spec_hash,
    sweep_bounds_hash: hashes.sweep_bounds_hash,
    era_plan_hash: hashes.era_plan_hash,
    target_bench_runner: options.targetBenchRunner ?? inferTargetBenchRunner(packet),
    estimated_runtime_minutes: options.estimatedRuntimeMinutes ?? null,
  }
}

function inferTargetBenchRunner(packet: StrategyAuthoringPacketV1): string {
  switch (packet.questionnaire.sleeve) {
    case "CRYPTO":
      return "research_lab.crypto_strategy_bench.v1"
    case "OPTIONS":
      return "research_lab.options_strategy_bench.v1"
    case "STOCKS":
    default:
      return "research_lab.equity_strategy_bench.v1"
  }
}

function buildPlannedTrialLedgerEntries(
  packet: StrategyAuthoringPacketV1,
  benchConfigId: string,
  createdAt: string,
): TrialLedgerEntryV1[] {
  const variantCount = Math.max(0, packet.sweep_bounds.max_total_variants)
  const entries: TrialLedgerEntryV1[] = []
  for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
    for (const era of packet.era_benchmark_plan.eras) {
      entries.push({
        schema_version: TRIAL_LEDGER_ENTRY_SCHEMA_VERSION,
        trial_id: stableTrialId(`${benchConfigId}:${packet.packet_id}:${variantIndex}:${era.era_id}`),
        packet_id: packet.packet_id,
        strategy_family: packet.questionnaire.edge_family,
        strategy_id: packet.strategy_spec.strategy_id.value,
        variant_index: variantIndex,
        era_id: era.era_id,
        created_at: createdAt,
        bench_result: null,
        reviewer_outcome: null,
        promotion_outcome: "PENDING",
        failure_reason: null,
        questionnaire_mapping: [
          "questionnaire.pattern_description",
          "questionnaire.edge_family",
          "questionnaire.strategy_relationship",
          "questionnaire.historical_window",
        ],
      })
    }
  }
  return entries
}

function addLedgerBudgetIssues(
  packet: StrategyAuthoringPacketV1,
  consumption: TrialLedgerConsumption,
  issues: PacketCompileIssue[],
) {
  const plannedVariants = Math.max(0, packet.sweep_bounds.max_total_variants)
  const plannedEras = Math.max(0, packet.era_benchmark_plan.eras.length)
  const plannedRuns = plannedVariants * plannedEras
  const budget = packet.trial_ledger_budget

  if (consumption.variants_used + plannedVariants > budget.max_variants) {
    issues.push({
      code: "BUDGET_EXCEEDED",
      field_path: "trial_ledger_budget.max_variants",
      message: "Compiler ledger query shows this packet would exceed the variant budget.",
    })
  }
  if (consumption.eras_used + plannedEras > budget.max_eras) {
    issues.push({
      code: "BUDGET_EXCEEDED",
      field_path: "trial_ledger_budget.max_eras",
      message: "Compiler ledger query shows this packet would exceed the era budget.",
    })
  }
  if (consumption.bench_runs_used + plannedRuns > budget.max_bench_runs) {
    issues.push({
      code: "BUDGET_EXCEEDED",
      field_path: "trial_ledger_budget.max_bench_runs",
      message: "Compiler ledger query shows this packet would exceed the bench-run budget.",
    })
  }
}

function addDataReadinessIssues(packet: StrategyAuthoringPacketV1, issues: PacketCompileIssue[]) {
  if (packet.data_readiness.overall_status === "BLOCKED") {
    issues.push({
      code: "DATA_BLOCKED",
      field_path: "data_readiness.overall_status",
      message: "Core data is blocked; Talon must ask for a supported data source or operator clarification.",
    })
  }
  for (const [index, item] of packet.data_readiness.items.entries()) {
    if (!item.available) {
      issues.push({
        code: "DATA_BLOCKED",
        field_path: `data_readiness.items.${index}`,
        message: `Data input ${item.data_input_id} is unavailable.`,
      })
    }
  }
}

function addCompilerMappingIssues(packet: StrategyAuthoringPacketV1, issues: PacketCompileIssue[]) {
  for (const [index, condition] of packet.strategy_spec.entry_rules.value.conditions.entries()) {
    if (condition.compiler_support === "NEEDS_MAPPING") {
      issues.push({
        code: "CUSTOM_MAPPING_REQUIRED",
        field_path: `strategy_spec.entry_rules.value.conditions.${index}`,
        message: `Entry condition ${condition.name} needs explicit compiler mapping before bench execution.`,
      })
    }
  }
  for (const [index, exitRule] of (packet.strategy_spec.exit_rules.value.custom_exits ?? []).entries()) {
    if (exitRule.compiler_support === "NEEDS_MAPPING") {
      issues.push({
        code: "CUSTOM_MAPPING_REQUIRED",
        field_path: `strategy_spec.exit_rules.value.custom_exits.${index}`,
        message: `Custom exit ${exitRule.name} needs explicit compiler mapping before bench execution.`,
      })
    }
  }
}

function compileStatusFor(issues: PacketCompileIssue[]): PacketCompileResultV1["compile_status"] {
  if (hasBlockingIssue(issues)) return "BLOCKED"
  if (hasMappingIssue(issues)) return "NEEDS_MAPPING"
  return "PASS"
}

function hasBlockingIssue(issues: PacketCompileIssue[]): boolean {
  return issues.some(issue => issue.code !== "CUSTOM_MAPPING_REQUIRED")
}

function hasMappingIssue(issues: PacketCompileIssue[]): boolean {
  return issues.some(issue => issue.code === "CUSTOM_MAPPING_REQUIRED")
}
