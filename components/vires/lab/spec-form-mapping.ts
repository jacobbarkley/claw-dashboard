// Pure mapping between the operator-facing flat form (StrategySpecForm) and
// the canonical record-shaped fields on StrategySpecV1 that Phase E persists.
//
// Round-trip rules:
// - universe / risk_model / sweep_params each carry a free-text `description`
//   key in this UI. Other keys on the canonical record (e.g. `source`,
//   `sleeve` written by Codex) are preserved untouched on save.
// - acceptance_criteria is the structured triple (min_sharpe, max_drawdown,
//   min_hit_rate) plus an `other` free-text. Numeric values are stored as
//   numbers when parseable, omitted when blank.
// - benchmark: form distinguishes "custom" via a separate input; canonical
//   stores the resolved string (or null).
// - required_data: chip selections plus a free-text "other" comma-list. The
//   canonical string[] is the union, deduped, in the order chips→other.

import type { ExperimentPlanV1, StrategySpecV1 } from "@/lib/research-lab-contracts"
import { withComputedExperimentPlanValidity } from "@/lib/research-lab-experiment-plan"

import type { SpecFormValues } from "./strategy-spec-form"
import { EMPTY_SPEC } from "./strategy-spec-form"

export const DATA_CHIPS = [
  "Price OHLCV",
  "Fundamentals",
  "Options chain",
  "Implied vol surface",
  "Sentiment",
  "Attention proxies",
  "Macro",
  "Crypto on-chain",
] as const

const FIXED_BENCHMARKS = new Set(["SPY", "BTC", "sleeve-default"])

function recordDescription(record: Record<string, unknown> | null | undefined): string {
  if (!record) return ""
  const desc = record.description
  return typeof desc === "string" ? desc : ""
}

function setRecordDescription(
  record: Record<string, unknown> | null | undefined,
  description: string,
): Record<string, unknown> {
  const base = record && typeof record === "object" ? { ...record } : {}
  if (description.trim()) {
    base.description = description.trim()
  } else {
    delete base.description
  }
  return base
}

export function specToFormValues(spec: StrategySpecV1): SpecFormValues {
  const ac = spec.acceptance_criteria ?? {}
  const minSharpe = numberToInputString(ac.min_sharpe)
  const maxDrawdown = numberToInputString(ac.max_drawdown)
  const minHitRate = numberToInputString(ac.min_hit_rate)
  const acceptanceOther = typeof ac.other === "string" ? ac.other : ""

  const requiredDataAll = Array.isArray(spec.required_data) ? spec.required_data : []
  const chipSet = new Set<string>(DATA_CHIPS as readonly string[])
  const chips = requiredDataAll.filter(d => chipSet.has(d))
  const otherList = requiredDataAll.filter(d => !chipSet.has(d))

  const benchmarkRaw = spec.benchmark ?? ""
  const isFixed = FIXED_BENCHMARKS.has(benchmarkRaw)

  return {
    ...EMPTY_SPEC,
    authoring_mode: spec.authoring_mode,
    spec_state: spec.state,
    signal_logic: spec.signal_logic ?? "",
    entry_rules: spec.entry_rules ?? "",
    exit_rules: spec.exit_rules ?? "",
    risk_model: recordDescription(spec.risk_model),
    universe: recordDescription(spec.universe),
    required_data: chips,
    required_data_other: otherList.join(", "),
    benchmark: isFixed ? benchmarkRaw : benchmarkRaw ? "custom" : "SPY",
    benchmark_custom: isFixed || !benchmarkRaw ? "" : benchmarkRaw,
    min_sharpe: minSharpe || EMPTY_SPEC.min_sharpe,
    max_drawdown: maxDrawdown || EMPTY_SPEC.max_drawdown,
    min_hit_rate: minHitRate || EMPTY_SPEC.min_hit_rate,
    acceptance_other: acceptanceOther,
    candidate_strategy_family: spec.candidate_strategy_family ?? "",
    sweep_params: recordDescription(spec.sweep_params),
    implementation_notes: spec.implementation_notes ?? "",
    experiment_plan: spec.experiment_plan ?? null,
  }
}

export interface SpecPatchPayload {
  authoring_mode: SpecFormValues["authoring_mode"]
  signal_logic: string
  entry_rules: string
  exit_rules: string
  universe: Record<string, unknown>
  risk_model: Record<string, unknown>
  sweep_params: Record<string, unknown>
  required_data: string[]
  benchmark: string | null
  acceptance_criteria: Record<string, unknown>
  candidate_strategy_family: string | null
  implementation_notes: string | null
  experiment_plan: ExperimentPlanV1 | null
}

export function formValuesToPatch(
  values: SpecFormValues,
  spec: StrategySpecV1,
): SpecPatchPayload {
  const requiredData = mergeRequiredData(values.required_data, values.required_data_other)
  const acceptance = buildAcceptanceCriteria(values, spec.acceptance_criteria)
  const benchmarkSymbol = resolveBenchmark(values.benchmark, values.benchmark_custom)
  // Keep plan.benchmark.symbol in sync with the spec's benchmark — same
  // value, two surfaces. The plan is the new home for comparison_mode +
  // structured details; the spec field stays for legacy readers.
  const experimentPlan = values.experiment_plan
    ? withComputedExperimentPlanValidity({
        ...values.experiment_plan,
        benchmark: {
          ...values.experiment_plan.benchmark,
          symbol: benchmarkSymbol ?? values.experiment_plan.benchmark.symbol,
        },
      })
    : null
  return {
    authoring_mode: values.authoring_mode,
    signal_logic: values.signal_logic.trim(),
    entry_rules: values.entry_rules.trim(),
    exit_rules: values.exit_rules.trim(),
    universe: setRecordDescription(spec.universe, values.universe),
    risk_model: setRecordDescription(spec.risk_model, values.risk_model),
    sweep_params: setRecordDescription(spec.sweep_params, values.sweep_params),
    required_data: requiredData,
    benchmark: benchmarkSymbol,
    acceptance_criteria: acceptance,
    candidate_strategy_family: trimOrNull(values.candidate_strategy_family),
    implementation_notes: trimOrNull(values.implementation_notes),
    experiment_plan: experimentPlan,
  }
}

function mergeRequiredData(chips: string[], otherCsv: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const chip of chips) {
    const trimmed = chip.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      out.push(trimmed)
    }
  }
  for (const piece of otherCsv.split(",")) {
    const trimmed = piece.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      out.push(trimmed)
    }
  }
  return out
}

function buildAcceptanceCriteria(
  values: SpecFormValues,
  current: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const base = current && typeof current === "object" ? { ...current } : {}
  applyNumeric(base, "min_sharpe", values.min_sharpe)
  applyNumeric(base, "max_drawdown", values.max_drawdown)
  applyNumeric(base, "min_hit_rate", values.min_hit_rate)
  const other = values.acceptance_other.trim()
  if (other) base.other = other
  else delete base.other
  return base
}

function applyNumeric(
  target: Record<string, unknown>,
  key: string,
  raw: string,
): void {
  const trimmed = raw.trim()
  if (!trimmed) {
    delete target[key]
    return
  }
  const parsed = Number(trimmed)
  if (Number.isFinite(parsed)) {
    target[key] = parsed
  } else {
    target[key] = trimmed
  }
}

function resolveBenchmark(selection: string, custom: string): string | null {
  if (selection === "custom") {
    const trimmed = custom.trim()
    return trimmed ? trimmed : null
  }
  const trimmed = selection.trim()
  return trimmed ? trimmed : null
}

function trimOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function numberToInputString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value.trim()) return value.trim()
  return ""
}
