import type {
  BenchmarkComparisonMode,
  ExperimentDataRequirementStatus,
  ExperimentEraMode,
  ExperimentPlanV1,
  ExperimentPlanValidityIssue,
  RunnableEraStatus,
} from "./research-lab-contracts"

const COMPARISON_MODES = new Set<BenchmarkComparisonMode>(["absolute", "deployment_matched", "both"])
const ERA_MODES = new Set<ExperimentEraMode>(["single", "multi"])
const ERA_STATUSES = new Set<RunnableEraStatus>(["AVAILABLE", "INCOMPLETE_DATA", "UNAVAILABLE"])
const DATA_STATUSES = new Set<ExperimentDataRequirementStatus>(["AVAILABLE", "PARTIAL", "MISSING"])

export function normalizeExperimentPlan(input: unknown): ExperimentPlanV1 | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>
  const benchmark = record(raw.benchmark)
  const windows = record(raw.windows)
  const eras = record(raw.eras)
  const thresholds = record(raw.evidence_thresholds)
  const verdict = record(raw.decisive_verdict_rules)

  const plan: ExperimentPlanV1 = {
    schema_version: "research_lab.experiment_plan.v1",
    spec_id: stringField(raw.spec_id),
    idea_id: stringField(raw.idea_id),
    is_valid: raw.is_valid === true,
    validity_reasons: normalizeValidityIssues(raw.validity_reasons),
    benchmark: {
      symbol: stringField(benchmark.symbol).toUpperCase(),
      comparison_mode: enumField(benchmark.comparison_mode, COMPARISON_MODES, "both"),
    },
    windows: {
      requested_start: stringField(windows.requested_start),
      requested_end: stringField(windows.requested_end),
      fresh_data_required_from: nullableString(windows.fresh_data_required_from),
    },
    runnable_eras: array(raw.runnable_eras).map((item, index) => {
      const era = record(item)
      const range = record(era.date_range)
      return {
        era_id: stringField(era.era_id) || `era_${index + 1}`,
        label: stringField(era.label) || stringField(era.era_id) || `Era ${index + 1}`,
        date_range: {
          start: stringField(range.start),
          end: stringField(range.end),
        },
        status: enumField(era.status, ERA_STATUSES, "UNAVAILABLE"),
        reason: nullableString(era.reason),
      }
    }),
    eras: {
      mode: enumField(eras.mode, ERA_MODES, "single"),
      required_era_ids: stringArray(eras.required_era_ids),
    },
    data_requirements: array(raw.data_requirements).map(item => {
      const req = record(item)
      const status = enumField(req.status, DATA_STATUSES, "MISSING")
      return {
        capability_id: stringField(req.capability_id),
        required: req.required !== false,
        status,
        status_at_draft: enumField(req.status_at_draft, DATA_STATUSES, status),
        purpose: nullableString(req.purpose),
      }
    }),
    evidence_thresholds: normalizeThresholds(thresholds),
    decisive_verdict_rules: {
      pass: stringField(verdict.pass),
      inconclusive: stringField(verdict.inconclusive),
      fail: stringField(verdict.fail),
    },
    known_limitations: stringArray(raw.known_limitations),
  }

  return withComputedExperimentPlanValidity(plan)
}

export function withComputedExperimentPlanValidity(plan: ExperimentPlanV1): ExperimentPlanV1 {
  const validity = validateExperimentPlan(plan)
  return {
    ...plan,
    is_valid: validity.is_valid,
    validity_reasons: validity.validity_reasons,
  }
}

export function validateExperimentPlan(
  plan: ExperimentPlanV1 | null | undefined,
): { is_valid: boolean; validity_reasons: ExperimentPlanValidityIssue[] } {
  const issues: ExperimentPlanValidityIssue[] = []
  if (!plan) {
    return {
      is_valid: false,
      validity_reasons: [
        {
          field_id: "experiment_plan",
          severity: "error",
          message: "Experiment plan is required before this spec can be submitted for approval.",
        },
      ],
    }
  }

  requireText(issues, "benchmark.symbol", plan.benchmark.symbol, "Benchmark symbol is required.")
  if (!COMPARISON_MODES.has(plan.benchmark.comparison_mode)) {
    issues.push({
      field_id: "benchmark.comparison_mode",
      severity: "error",
      message: "Benchmark comparison mode must be absolute, deployment_matched, or both.",
    })
  }

  const start = parseIsoDate(plan.windows.requested_start)
  const end = parseIsoDate(plan.windows.requested_end)
  if (!start) {
    issues.push({
      field_id: "windows.requested_start",
      severity: "error",
      message: "Requested start must be an ISO date.",
    })
  }
  if (!end) {
    issues.push({
      field_id: "windows.requested_end",
      severity: "error",
      message: "Requested end must be an ISO date.",
    })
  }
  if (start && end && start > end) {
    issues.push({
      field_id: "windows.requested_end",
      severity: "error",
      message: "Requested end must be on or after requested start.",
    })
  }
  if (plan.windows.fresh_data_required_from && !parseIsoDate(plan.windows.fresh_data_required_from)) {
    issues.push({
      field_id: "windows.fresh_data_required_from",
      severity: "error",
      message: "Fresh-data date must be an ISO date when present.",
    })
  }

  if (plan.eras.mode === "multi" && plan.eras.required_era_ids.length === 0) {
    issues.push({
      field_id: "eras.required_era_ids",
      severity: "error",
      message: "Multi-era plans must select at least one runnable era.",
    })
  }
  const erasById = new Map(plan.runnable_eras.map(era => [era.era_id, era]))
  for (const eraId of plan.eras.required_era_ids) {
    const era = erasById.get(eraId)
    if (!era) {
      issues.push({
        field_id: "eras.required_era_ids",
        severity: "error",
        message: `Selected era ${eraId} is not listed in runnable_eras.`,
      })
      continue
    }
    if (era.status === "UNAVAILABLE") {
      issues.push({
        field_id: `runnable_eras.${eraId}.status`,
        severity: "error",
        message: `Selected era ${era.label} is unavailable.`,
      })
    } else if (era.status === "INCOMPLETE_DATA") {
      issues.push({
        field_id: `runnable_eras.${eraId}.status`,
        severity: "warn",
        message: `Selected era ${era.label} has incomplete data.`,
      })
    }
  }

  const thresholds = plan.evidence_thresholds
  requirePositiveNumber(
    issues,
    "evidence_thresholds.minimum_trade_count",
    thresholds.minimum_trade_count,
    "Minimum trade count must be a positive number.",
  )
  requirePositiveNumber(
    issues,
    "evidence_thresholds.minimum_evaluated_trading_days",
    thresholds.minimum_evaluated_trading_days,
    "Minimum evaluated trading days must be a positive number.",
  )
  for (const [key, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value)) {
      issues.push({
        field_id: `evidence_thresholds.${key}`,
        severity: "error",
        message: `${key} must be a finite number.`,
      })
    }
  }

  if (plan.data_requirements.length === 0) {
    issues.push({
      field_id: "data_requirements",
      severity: "warn",
      message: "No data requirements are listed; confirm this strategy can be evaluated from default OHLCV only.",
    })
  }
  for (let index = 0; index < plan.data_requirements.length; index += 1) {
    const req = plan.data_requirements[index]
    requireText(
      issues,
      `data_requirements[${index}].capability_id`,
      req.capability_id,
      "Capability id is required.",
    )
    if (req.required && req.status === "MISSING") {
      issues.push({
        field_id: `data_requirements[${index}].status`,
        severity: "error",
        message: `${req.capability_id || "Required data"} is missing.`,
      })
    } else if (req.required && req.status === "PARTIAL") {
      issues.push({
        field_id: `data_requirements[${index}].status`,
        severity: "warn",
        message: `${req.capability_id} is only partially available.`,
      })
    }
    if (req.status !== req.status_at_draft) {
      issues.push({
        field_id: `data_requirements[${index}].status`,
        severity: req.status === "MISSING" && req.required ? "error" : "warn",
        message: `${req.capability_id || "Data requirement"} drifted from ${req.status_at_draft} to ${req.status}.`,
      })
    }
  }

  requireText(issues, "decisive_verdict_rules.pass", plan.decisive_verdict_rules.pass, "Pass rule is required.")
  requireText(
    issues,
    "decisive_verdict_rules.inconclusive",
    plan.decisive_verdict_rules.inconclusive,
    "Inconclusive rule is required.",
  )
  requireText(issues, "decisive_verdict_rules.fail", plan.decisive_verdict_rules.fail, "Fail rule is required.")

  return {
    is_valid: !issues.some(issue => issue.severity === "error"),
    validity_reasons: issues,
  }
}

function normalizeThresholds(input: Record<string, unknown>): ExperimentPlanV1["evidence_thresholds"] {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(input)) {
    const numeric = typeof value === "number" ? value : Number(value)
    if (Number.isFinite(numeric)) out[key] = numeric
  }
  return {
    minimum_trade_count: out.minimum_trade_count ?? 5,
    minimum_evaluated_trading_days: out.minimum_evaluated_trading_days ?? 20,
  }
}

function normalizeValidityIssues(input: unknown): ExperimentPlanValidityIssue[] {
  return array(input).flatMap(item => {
    const raw = record(item)
    const fieldId = stringField(raw.field_id)
    const severity = raw.severity === "warn" ? "warn" : raw.severity === "error" ? "error" : null
    const message = stringField(raw.message)
    return fieldId && severity && message ? [{ field_id: fieldId, severity, message }] : []
  })
}

function requireText(
  issues: ExperimentPlanValidityIssue[],
  fieldId: string,
  value: string | null | undefined,
  message: string,
) {
  if (!value?.trim()) issues.push({ field_id: fieldId, severity: "error", message })
}

function requirePositiveNumber(
  issues: ExperimentPlanValidityIssue[],
  fieldId: string,
  value: number,
  message: string,
) {
  if (!Number.isFinite(value) || value <= 0) issues.push({ field_id: fieldId, severity: "error", message })
}

function parseIsoDate(input: string | null | undefined): number | null {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return null
  const ts = Date.parse(`${input}T00:00:00.000Z`)
  return Number.isFinite(ts) ? ts : null
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

function array(input: unknown): unknown[] {
  return Array.isArray(input) ? input : []
}

function stringArray(input: unknown): string[] {
  return array(input)
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean)
}

function stringField(input: unknown): string {
  return typeof input === "string" ? input.trim() : ""
}

function nullableString(input: unknown): string | null {
  const value = stringField(input)
  return value || null
}

function enumField<T extends string>(input: unknown, allowed: Set<T>, fallback: T): T {
  const value = typeof input === "string" ? input.trim() : ""
  return allowed.has(value as T) ? value as T : fallback
}
