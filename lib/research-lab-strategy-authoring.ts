import { createHash } from "crypto"

import type {
  AdversarialCheckCategory,
  FieldPresentation,
  PacketSectionHashes,
  StrategyAuthoringPacketV1,
  StrategyAuthoringQuestionnaire,
  TrialLedgerEntryV1,
} from "./research-lab-contracts"

export const STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION = "research_lab.strategy_authoring_packet.v1" as const
export const TRIAL_LEDGER_ENTRY_SCHEMA_VERSION = "research_lab.trial_ledger_entry.v1" as const
export const STRATEGY_AUTHORING_COMPILE_RESULT_SCHEMA_VERSION = "research_lab.strategy_authoring_compile_result.v1" as const

export const REQUIRED_ADVERSARIAL_CATEGORIES: AdversarialCheckCategory[] = [
  "LOOKAHEAD_BIAS",
  "SURVIVORSHIP_BIAS",
  "COST_UNDERESTIMATE",
  "BENCHMARK_CHEATING",
  "DATA_LEAKAGE",
  "CURRENT_REGIME_ONLY",
  "WEAK_KILL_CRITERIA",
  "OVERFITTING",
]

const PACKET_ID_RE = /^packet_[0-9A-HJKMNP-TV-Z]{26}$/
const TRIAL_ID_RE = /^trial_[0-9A-HJKMNP-TV-Z]{26}$/
const STRATEGY_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T/
const A_LAYER_FIELDS = [
  "universe_size_band",
  "allowed_data_inputs",
  "entry_confirmation",
  "exit_logic",
  "risk_profile",
  "benchmark",
  "era_validation_strategy",
  "era_weighting",
  "historical_window",
  "promotion_bar",
  "talon_exclusions",
] as const

export interface StrategyAuthoringValidationIssue {
  field_path: string
  severity: "error" | "warn"
  code: string
  message: string
}

export function validateStrategyAuthoringPacket(
  packet: StrategyAuthoringPacketV1,
): StrategyAuthoringValidationIssue[] {
  const issues: StrategyAuthoringValidationIssue[] = []

  if (packet.schema_version !== STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION) {
    error(issues, "schema_version", "SCHEMA_VERSION", "Unsupported strategy authoring packet schema.")
  }
  if (!PACKET_ID_RE.test(packet.packet_id)) {
    error(issues, "packet_id", "PACKET_ID", "packet_id must use packet_${ULID}.")
  }
  validatePacketLineage(packet, issues)
  requireIsoTimestamp(issues, "created_at", packet.created_at)
  requireIsoTimestamp(issues, "updated_at", packet.updated_at)

  validateQuestionnaire(packet, issues)
  validateStrategySpec(packet, issues)
  validateDataReadiness(packet, issues)
  validateAdversarialReview(packet, issues)
  validatePortfolioFit(packet, issues)
  validateTrialBudget(packet, issues)
  validateReproducibility(packet, issues)

  if (packet.status === "APPROVED") {
    if (!packet.strategy_spec.strategy_id.provenance.operator_confirmed) {
      error(
        issues,
        "strategy_spec.strategy_id.provenance.operator_confirmed",
        "STRATEGY_ID_UNCONFIRMED",
        "APPROVED packets require operator-confirmed strategy_id provenance.",
      )
    }
    if (!packet.implementation_request) {
      error(
        issues,
        "implementation_request",
        "IMPLEMENTATION_REQUEST_REQUIRED",
        "APPROVED packets require an implementation_request.",
      )
    }
  } else if (packet.implementation_request) {
    error(
      issues,
      "implementation_request",
      "IMPLEMENTATION_REQUEST_PREMATURE",
      "implementation_request is only valid once packet status is APPROVED.",
    )
  }

  return issues
}

export function assertValidStrategyAuthoringPacket(packet: StrategyAuthoringPacketV1): void {
  const errors = validateStrategyAuthoringPacket(packet).filter(issue => issue.severity === "error")
  if (errors.length > 0) {
    throw new Error(errors.map(issue => `${issue.field_path}: ${issue.message}`).join("; "))
  }
}

export function validateTrialLedgerEntry(entry: TrialLedgerEntryV1): StrategyAuthoringValidationIssue[] {
  const issues: StrategyAuthoringValidationIssue[] = []
  if (entry.schema_version !== TRIAL_LEDGER_ENTRY_SCHEMA_VERSION) {
    error(issues, "schema_version", "TRIAL_LEDGER_SCHEMA_VERSION", "Unsupported trial ledger entry schema.")
  }
  if (!TRIAL_ID_RE.test(entry.trial_id)) {
    error(issues, "trial_id", "TRIAL_ID", "trial_id must use trial_${ULID}.")
  }
  if (!PACKET_ID_RE.test(entry.packet_id)) {
    error(issues, "packet_id", "PACKET_ID", "packet_id must use packet_${ULID}.")
  }
  if (!STRATEGY_SLUG_RE.test(entry.strategy_id)) {
    error(issues, "strategy_id", "STRATEGY_ID_SLUG", "strategy_id must be a safe registry slug.")
  }
  if (!entry.strategy_family.trim()) {
    error(issues, "strategy_family", "STRATEGY_FAMILY_REQUIRED", "strategy_family is required.")
  }
  if (entry.variant_index < 0 || !Number.isInteger(entry.variant_index)) {
    error(issues, "variant_index", "VARIANT_INDEX", "variant_index must be a non-negative integer.")
  }
  if (!entry.era_id.trim()) {
    error(issues, "era_id", "ERA_ID_REQUIRED", "era_id is required.")
  }
  requireIsoTimestamp(issues, "created_at", entry.created_at)
  return issues
}

export function assertValidTrialLedgerEntry(entry: TrialLedgerEntryV1): void {
  const errors = validateTrialLedgerEntry(entry).filter(issue => issue.severity === "error")
  if (errors.length > 0) {
    throw new Error(errors.map(issue => `${issue.field_path}: ${issue.message}`).join("; "))
  }
}

export function computeQuestionnaireInputHash(questionnaire: StrategyAuthoringQuestionnaire): string {
  const canonical = {
    pattern_description: questionnaire.pattern_description,
    sleeve: questionnaire.sleeve,
    trade_horizon: questionnaire.trade_horizon,
    capital_tier: questionnaire.capital_tier,
    capital_custom_usd: questionnaire.capital_custom_usd ?? null,
    strategy_relationship: questionnaire.strategy_relationship,
    kill_criteria_user: questionnaire.kill_criteria_user,
    edge_family: questionnaire.edge_family,
    prior_work_refs: questionnaire.prior_work_refs,
    changes_from_refs: questionnaire.changes_from_refs,
    universe_shape: questionnaire.universe_shape,
    universe_fixed_list: questionnaire.universe_fixed_list ?? null,
    regime_expectation: questionnaire.regime_expectation,
    universe_size_band: questionnaire.universe_size_band.value,
    allowed_data_inputs: questionnaire.allowed_data_inputs.value,
    entry_confirmation: questionnaire.entry_confirmation.value,
    exit_logic: questionnaire.exit_logic.value,
    risk_profile: questionnaire.risk_profile.value,
    benchmark: questionnaire.benchmark.value,
    era_validation_strategy: questionnaire.era_validation_strategy.value,
    era_weighting: questionnaire.era_weighting.value,
    historical_window: questionnaire.historical_window.value,
    promotion_bar: questionnaire.promotion_bar.value,
    talon_exclusions: questionnaire.talon_exclusions.value,
    field_presentations: questionnaire.field_presentations,
  }
  return hashObject(canonical)
}

export function buildPacketSectionHashes(packet: StrategyAuthoringPacketV1): PacketSectionHashes {
  return {
    questionnaire_hash: computeQuestionnaireInputHash(packet.questionnaire),
    strategy_spec_hash: hashObject(packet.strategy_spec),
    sweep_bounds_hash: hashObject(packet.sweep_bounds),
    era_plan_hash: hashObject(packet.era_benchmark_plan),
    packet_hash: hashObject({
      schema_version: packet.schema_version,
      packet_id: packet.packet_id,
      revised_from: packet.revised_from ?? null,
      revision_index: packet.revision_index ?? null,
      questionnaire: packet.questionnaire,
      strategy_spec: packet.strategy_spec,
      sweep_bounds: packet.sweep_bounds,
      era_benchmark_plan: packet.era_benchmark_plan,
      evidence_thresholds: packet.evidence_thresholds,
      trial_ledger_budget: packet.trial_ledger_budget,
      multiple_comparisons_plan: packet.multiple_comparisons_plan,
    }),
  }
}

export function hashObject(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex")
}

export function stableShortId(prefix: string, seed: string): string {
  return `${prefix}_${hashString(seed).slice(0, 16)}`
}

export function stableTrialId(seed: string): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
  const digest = hashString(seed)
  let out = ""
  for (let index = 0; index < 26; index += 1) {
    const hex = digest.slice(index * 2, index * 2 + 2)
    out += alphabet[parseInt(hex, 16) % alphabet.length]
  }
  return `trial_${out}`
}

function validatePacketLineage(
  packet: StrategyAuthoringPacketV1,
  issues: StrategyAuthoringValidationIssue[],
) {
  const revisedFrom = packet.revised_from ?? null
  const revisionIndex = packet.revision_index ?? null
  const hasRevisedFrom = revisedFrom !== null
  const hasRevisionIndex = revisionIndex !== null

  if (hasRevisedFrom !== hasRevisionIndex) {
    error(
      issues,
      "revision_index",
      "REVISION_LINEAGE_PAIR_REQUIRED",
      "revised_from and revision_index must be provided together or omitted together.",
    )
  }
  if (revisedFrom !== null && !PACKET_ID_RE.test(revisedFrom)) {
    error(issues, "revised_from", "REVISED_FROM_PACKET_ID", "revised_from must use packet_${ULID}.")
  }
  if (revisedFrom !== null && revisedFrom === packet.packet_id) {
    error(issues, "revised_from", "REVISED_FROM_SELF", "A packet cannot revise itself.")
  }
  if (revisionIndex !== null && (!Number.isInteger(revisionIndex) || revisionIndex < 1)) {
    error(issues, "revision_index", "REVISION_INDEX", "revision_index must be a positive integer.")
  }
}

function validateQuestionnaire(
  packet: StrategyAuthoringPacketV1,
  issues: StrategyAuthoringValidationIssue[],
) {
  const q = packet.questionnaire
  if (q.capital_tier === "CUSTOM" && (!q.capital_custom_usd || q.capital_custom_usd <= 0)) {
    error(issues, "questionnaire.capital_custom_usd", "CAPITAL_CUSTOM_REQUIRED", "CUSTOM capital tier requires capital_custom_usd > 0.")
  }
  if (q.strategy_relationship.relationship === "REPLACE") {
    if (!q.strategy_relationship.target_strategy_id) {
      error(
        issues,
        "questionnaire.strategy_relationship.target_strategy_id",
        "REPLACE_TARGET_REQUIRED",
        "REPLACE relationships require target_strategy_id.",
      )
    }
    if (q.strategy_relationship.evidence_bar_modifier !== "ELEVATED") {
      error(
        issues,
        "questionnaire.strategy_relationship.evidence_bar_modifier",
        "REPLACE_REQUIRES_ELEVATED_BAR",
        "REPLACE relationships require evidence_bar_modifier=ELEVATED.",
      )
    }
  }
  if (q.strategy_relationship.relationship !== "REPLACE" && q.strategy_relationship.evidence_bar_modifier !== "STANDARD") {
    warn(
      issues,
      "questionnaire.strategy_relationship.evidence_bar_modifier",
      "ELEVATED_BAR_ON_NON_REPLACE",
      "Non-replacement packets usually use STANDARD; keep ELEVATED only when intentionally stricter.",
    )
  }
  for (const field of A_LAYER_FIELDS) {
    const presentation = q.field_presentations[field]
    if (!isFieldPresentation(presentation)) {
      error(
        issues,
        `questionnaire.field_presentations.${field}`,
        "FIELD_PRESENTATION_REQUIRED",
        `${field} must carry PRESENTED, HIDDEN, SUGGESTED, or ACCEPTED presentation state.`,
      )
    }
  }
}

function validateStrategySpec(
  packet: StrategyAuthoringPacketV1,
  issues: StrategyAuthoringValidationIssue[],
) {
  const slug = packet.strategy_spec.strategy_id.value.trim()
  if (!STRATEGY_SLUG_RE.test(slug)) {
    error(issues, "strategy_spec.strategy_id.value", "STRATEGY_ID_SLUG", "strategy_id must be a safe registry slug.")
  }
  if (packet.strategy_spec.sleeve !== packet.questionnaire.sleeve) {
    error(issues, "strategy_spec.sleeve", "SLEEVE_MISMATCH", "strategy_spec.sleeve must match questionnaire.sleeve.")
  }
  if (packet.strategy_spec.execution_constraints.value.commission_assumption_value < 0) {
    error(
      issues,
      "strategy_spec.execution_constraints.value.commission_assumption_value",
      "COMMISSION_NEGATIVE",
      "commission_assumption_value must be non-negative.",
    )
  }
  for (const [index, condition] of packet.strategy_spec.entry_rules.value.conditions.entries()) {
    if (!packet.questionnaire.allowed_data_inputs.value.includes(condition.data_input_id)) {
      error(
        issues,
        `strategy_spec.entry_rules.value.conditions.${index}.data_input_id`,
        "ENTRY_DATA_NOT_ALLOWED",
        `Entry condition ${condition.name} uses data_input_id not listed in questionnaire.allowed_data_inputs.`,
      )
    }
  }
}

function validateDataReadiness(
  packet: StrategyAuthoringPacketV1,
  issues: StrategyAuthoringValidationIssue[],
) {
  const readinessById = new Map(packet.data_readiness.items.map(item => [item.data_input_id, item]))
  for (const dataInput of packet.questionnaire.allowed_data_inputs.value) {
    const readiness = readinessById.get(dataInput)
    if (!readiness) {
      error(
        issues,
        "data_readiness.items",
        "DATA_READINESS_MISSING_INPUT",
        `Missing data-readiness row for ${dataInput}.`,
      )
    } else if (packet.status === "APPROVED" && !readiness.available) {
      error(
        issues,
        "data_readiness.items",
        "APPROVED_DATA_INPUT_UNAVAILABLE",
        `APPROVED packet requires allowed data input ${dataInput} to be available.`,
      )
    }
  }
  if (packet.status === "APPROVED" && packet.data_readiness.overall_status === "BLOCKED") {
    error(issues, "data_readiness.overall_status", "BLOCKED_DATA_APPROVED", "Packets with BLOCKED data readiness cannot be APPROVED.")
  }
}

function validateAdversarialReview(
  packet: StrategyAuthoringPacketV1,
  issues: StrategyAuthoringValidationIssue[],
) {
  const review = packet.adversarial_review
  const declaredRequired = new Set(review.required_categories)
  for (const category of REQUIRED_ADVERSARIAL_CATEGORIES) {
    if (!declaredRequired.has(category)) {
      error(
        issues,
        "adversarial_review.required_categories",
        "ADVERSARIAL_REQUIRED_CATEGORY_UNDECLARED",
        `Adversarial review required_categories must include ${category}.`,
      )
    }
  }
  const checked = new Set(review.checks.map(check => check.category))
  for (const category of review.required_categories) {
    if (!checked.has(category)) {
      error(
        issues,
        "adversarial_review.checks",
        "ADVERSARIAL_REQUIRED_CATEGORY_MISSING",
        `Adversarial review missing required category ${category}.`,
      )
    }
  }
  if ((review.status === "PASS" || review.status === "CONDITIONAL") && review.required_categories.length === 0) {
    error(
      issues,
      "adversarial_review.required_categories",
      "ADVERSARIAL_REQUIRED_CATEGORIES_EMPTY",
      "Passing adversarial reviews must declare required_categories.",
    )
  }
}

function validatePortfolioFit(
  packet: StrategyAuthoringPacketV1,
  issues: StrategyAuthoringValidationIssue[],
) {
  const portfolio = packet.portfolio_fit
  if (portfolio.status === "PENDING" && !portfolio.deferred_until) {
    error(
      issues,
      "portfolio_fit.deferred_until",
      "PORTFOLIO_PENDING_REQUIRES_DEADLINE",
      "PENDING portfolio fit requires deferred_until so promotion gates can enforce the deadline.",
    )
  }
  if (portfolio.status === "WAIVED" && !portfolio.marginal_value_notes?.trim()) {
    error(
      issues,
      "portfolio_fit.marginal_value_notes",
      "PORTFOLIO_WAIVER_NEEDS_NOTES",
      "WAIVED portfolio fit requires marginal_value_notes.",
    )
  }
  if (portfolio.status === "ASSESSED" && portfolio.deferred_until) {
    warn(
      issues,
      "portfolio_fit.deferred_until",
      "ASSESSED_WITH_DEFERRED_UNTIL",
      "ASSESSED portfolio fit does not need deferred_until.",
    )
  }
  if (
    packet.status === "APPROVED" &&
    packet.questionnaire.strategy_relationship.relationship === "REPLACE" &&
    portfolio.status === "PENDING"
  ) {
    error(
      issues,
      "portfolio_fit.status",
      "REPLACE_REQUIRES_PORTFOLIO_FIT",
      "Replacement packets require assessed or waived portfolio fit before approval.",
    )
  }
}

function validateTrialBudget(
  packet: StrategyAuthoringPacketV1,
  issues: StrategyAuthoringValidationIssue[],
) {
  const variants = packet.sweep_bounds.max_total_variants
  const eras = packet.era_benchmark_plan.eras.length
  if (variants <= 0) {
    error(issues, "sweep_bounds.max_total_variants", "SWEEP_VARIANTS_POSITIVE", "max_total_variants must be > 0.")
  }
  if (eras <= 0) {
    error(issues, "era_benchmark_plan.eras", "ERA_REQUIRED", "At least one validation era is required.")
  }
  if (packet.trial_ledger_budget.max_variants <= 0 || packet.trial_ledger_budget.max_bench_runs <= 0) {
    error(issues, "trial_ledger_budget", "TRIAL_BUDGET_POSITIVE", "max_variants and max_bench_runs must be > 0.")
  }
  if (variants > packet.trial_ledger_budget.max_variants) {
    error(
      issues,
      "sweep_bounds.max_total_variants",
      "SWEEP_EXCEEDS_VARIANT_BUDGET",
      "sweep_bounds.max_total_variants must be <= trial_ledger_budget.max_variants.",
    )
  }
  if (eras > packet.trial_ledger_budget.max_eras) {
    error(
      issues,
      "era_benchmark_plan.eras",
      "ERAS_EXCEED_BUDGET",
      "era count must be <= trial_ledger_budget.max_eras.",
    )
  }
  if (variants * Math.max(eras, 1) > packet.trial_ledger_budget.max_bench_runs) {
    error(
      issues,
      "trial_ledger_budget.max_bench_runs",
      "PLANNED_RUNS_EXCEED_BUDGET",
      "planned variants x eras must be <= trial_ledger_budget.max_bench_runs.",
    )
  }
}

function validateReproducibility(
  packet: StrategyAuthoringPacketV1,
  issues: StrategyAuthoringValidationIssue[],
) {
  const expectedHash = computeQuestionnaireInputHash(packet.questionnaire)
  if (packet.reproducibility_manifest.questionnaire_input_hash !== expectedHash) {
    error(
      issues,
      "reproducibility_manifest.questionnaire_input_hash",
      "QUESTIONNAIRE_HASH_MISMATCH",
      "questionnaire_input_hash must match the canonical questionnaire input hash.",
    )
  }
  if (packet.reproducibility_manifest.packet_contract_schema_version !== STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION) {
    error(
      issues,
      "reproducibility_manifest.packet_contract_schema_version",
      "PACKET_CONTRACT_SCHEMA_VERSION",
      "packet_contract_schema_version must match packet schema_version.",
    )
  }
}

function requireIsoTimestamp(
  issues: StrategyAuthoringValidationIssue[],
  fieldPath: string,
  value: string,
) {
  if (!ISO_TIMESTAMP_RE.test(value) || Number.isNaN(Date.parse(value))) {
    error(issues, fieldPath, "ISO_TIMESTAMP", `${fieldPath} must be an ISO timestamp.`)
  }
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

function isFieldPresentation(input: unknown): input is FieldPresentation {
  return input === "PRESENTED" || input === "HIDDEN" || input === "SUGGESTED" || input === "ACCEPTED"
}

function error(
  issues: StrategyAuthoringValidationIssue[],
  fieldPath: string,
  code: string,
  message: string,
) {
  issues.push({ field_path: fieldPath, severity: "error", code, message })
}

function warn(
  issues: StrategyAuthoringValidationIssue[],
  fieldPath: string,
  code: string,
  message: string,
) {
  issues.push({ field_path: fieldPath, severity: "warn", code, message })
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortCanonical(value))
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical)
  if (!value || typeof value !== "object") return value
  const record = value as Record<string, unknown>
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((out, key) => {
      out[key] = sortCanonical(record[key])
      return out
    }, {})
}
