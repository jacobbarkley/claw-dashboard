import { anthropic } from "@ai-sdk/anthropic"
import { generateText, Output } from "ai"
import { z } from "zod"

import type {
  AdversarialCheck,
  ClarificationAnswer,
  ClarificationProposedDefault,
  ClarificationQuestion,
  ClarificationRequest,
  IdeaArtifact,
  ModelExecution,
  PacketCompileResultV1,
  PortfolioFit,
  ScopeTriple,
  StrategyAuthoringContextPacket,
  StrategyAuthoringDataReadiness,
  StrategyAuthoringPacketV1,
  StrategyAuthoringQuestionnaire,
  TrialLedgerConsumption,
} from "./research-lab-contracts"
import {
  compileStrategyAuthoringPacket,
} from "./research-lab-strategy-authoring-compiler"
import {
  loadStrategyAuthoringPackets,
  loadTrialLedgerEntriesForPacket,
  persistStrategyAuthoringPacket,
} from "./research-lab-strategy-authoring.server"
import {
  assessDataReadiness,
  type DataCapabilityCatalogV1,
  type DataCapabilityV1,
  loadDataCapabilityCatalog,
} from "./research-lab-data-capabilities.server"
import { formatReferenceStrategiesForPrompt } from "./research-lab-strategy-references.server"
import { formatTalonLessonsForPrompt } from "./research-lab-talon-lessons.server"
import {
  assertValidStrategyAuthoringPacket,
  computeQuestionnaireInputHash,
  REQUIRED_ADVERSARIAL_CATEGORIES,
  STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION,
  validateStrategyAuthoringPacket,
} from "./research-lab-strategy-authoring"
import { ulid } from "../app/api/research/specs/_shared"

const PROMPT_VERSION = "talon_strategy_authoring_packet.v1"
const QUESTIONNAIRE_SCHEMA_VERSION = "research_lab.strategy_authoring_questionnaire.v1"
const TALON_ORCHESTRATOR_VERSION = "research_lab.talon_packet_orchestrator.v1"
const DEFAULT_MODEL = "claude-sonnet-4-6"
const DEFAULT_TEMPERATURE = 0.2
const FAILED_PACKET_CONTEXT_LIMIT = 10
const TALON_SECTION_ATTEMPTS = 3
const TALON_SECTION_CONCURRENCY = 2
const DATA_INPUT_ALIASES: Record<string, string> = {
  alpaca_crypto_daily_ohlcv: "alpaca_crypto_ohlcv",
  alpaca_equity_daily_ohlcv: "alpaca_equity_ohlcv",
  options_chain_snapshots: "alpaca_options_chain",
  price_ohlcv_daily: "alpaca_equity_ohlcv",
  price_ohlcv: "alpaca_equity_ohlcv",
  equity_ohlcv: "alpaca_equity_ohlcv",
  daily_ohlcv: "alpaca_equity_ohlcv",
}

export interface TalonPacketSynthesisResult {
  packet: StrategyAuthoringPacketV1
  compile_result: PacketCompileResultV1
  validation_issues: ReturnType<typeof validateStrategyAuthoringPacket>
  raw_packet_json: string
  prompt: string
  persisted?: Awaited<ReturnType<typeof persistStrategyAuthoringPacket>> | null
}

export interface CreateStrategyAuthoringPacketWithTalonArgs {
  scope: ScopeTriple
  idea: IdeaArtifact
  questionnaire: StrategyAuthoringQuestionnaire
  clarificationAnswers?: ClarificationAnswer[]
  clarificationRequest?: ClarificationRequest | null
  operatorId?: string | null
  revisedFrom?: string | null
  revisionIndex?: number | null
  ledgerConsumption?: TrialLedgerConsumption
  persist?: boolean
}

export interface CreateStrategyAuthoringPacketFromPayloadArgs extends CreateStrategyAuthoringPacketWithTalonArgs {
  packetId?: string
  now?: string
  catalog: DataCapabilityCatalogV1
  modelExecution: ModelExecution
  rawPacketJson: string
  prompt: string
  payload: StrategyAuthoringSynthesisPayload
}

export type StrategyAuthoringSynthesisPayload = z.infer<typeof synthesisPayloadSchema>

export interface CreateStrategyAuthoringClarificationArgs {
  scope: ScopeTriple
  idea: IdeaArtifact
  questionnaire: StrategyAuthoringQuestionnaire
  clarificationAnswers?: ClarificationAnswer[]
}

export interface StrategyAuthoringClarificationResult {
  status: ClarificationRequest["status"]
  clarification_request: ClarificationRequest
  context_packet: StrategyAuthoringContextPacket
  response_id: string | null
}

interface StrategyAuthoringContextBundle {
  contextPacket: StrategyAuthoringContextPacket
  catalog: DataCapabilityCatalogV1
  lessons: string
  referenceContext: string
  failedPacketSummary: string
}

interface TalonSectionIssue {
  field_path: string
  severity: "error"
  code: string
  message: string
}

interface TalonSectionResult {
  key: SynthesisSectionKey
  value: unknown
  rawJson: string
  responseId: string | null
  scaffolded: boolean
  issues: TalonSectionIssue[]
}

const TALON_NUMERIC_FIELD_KEYS = new Set([
  "adjusted_significance_level",
  "base_size_pct",
  "calendar_days_multiplier",
  "closed_trades_multiplier",
  "commission_assumption_value",
  "current_sleeve_allocation_pct",
  "drawdown_tightening_pct",
  "effective_trials_estimate",
  "estimated_compute_cost_usd",
  "estimated_correlation",
  "max",
  "max_acceptable_correlation",
  "max_bench_runs",
  "max_correlated_exposure_pct",
  "max_drawdown_pct",
  "max_eras",
  "max_joint_drawdown_pct",
  "max_portfolio_drawdown_pct",
  "max_positions",
  "max_sector_concentration_pct",
  "max_single_loss_usd",
  "max_single_position_loss_pct",
  "max_symbols",
  "max_total_variants",
  "max_variants",
  "min",
  "min_active_exposure_days",
  "min_calendar_days",
  "min_closed_trades",
  "min_profit_factor",
  "min_profitable_fold_pct",
  "min_sharpe",
  "min_trades",
  "min_win_rate_pct",
  "proposed_addition_pct",
  "resulting_sleeve_allocation_pct",
  "risk_per_trade_pct",
  "slippage_assumption_bps",
  "step",
  "stop_loss_pct",
  "target_pct",
  "time_stop_days",
  "trail_pct",
  "activation_pct",
])

const TALON_INTEGER_FIELD_KEYS = new Set([
  "max_bench_runs",
  "max_eras",
  "max_positions",
  "max_symbols",
  "max_total_variants",
  "max_variants",
  "min_active_exposure_days",
  "min_calendar_days",
  "min_closed_trades",
  "min_trades",
])

const TALON_STRING_FIELD_KEYS = new Set([
  "benchmark_id",
  "benchmark_rationale",
  "circuit_breaker_rules",
  "condition",
  "confirmation_description",
  "custom_description",
  "data_input_id",
  "description",
  "display_name",
  "era_id",
  "field_path",
  "finding",
  "full_implementation_target",
  "label",
  "marginal_value_notes",
  "method",
  "name",
  "no_trade_zones",
  "notes",
  "parameter",
  "rationale",
  "rebalance_frequency",
  "remediation",
  "screen_criteria",
  "strategy_family",
  "strategy_name",
])

const provenanceSchema = z.object({
  source: z.enum(["USER", "REFERENCE", "PAPER", "CATALOG", "MARKET_PACKET", "TUNABLE_DEFAULT", "TALON_INFERENCE"]),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  rationale: z.string().min(1),
  source_artifact_id: z.string().nullable().optional(),
  operator_confirmed: z.boolean(),
})

function wrappedSchema<T extends z.ZodTypeAny>(value: T) {
  return z.object({
    value,
    provenance: provenanceSchema,
  })
}

const historicalWindowSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  rationale: z.string(),
  talon_tradeoff_notes: z.string(),
})

export const strategyAuthoringQuestionnaireSchema = z.object({
  render_mode: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  pattern_description: z.string().min(1),
  sleeve: z.enum(["STOCKS", "CRYPTO", "OPTIONS"]),
  trade_horizon: z.enum(["INTRADAY", "DAYS", "WEEKS", "MONTHS"]),
  capital_tier: z.enum(["TINY", "SMALL", "MEDIUM", "LARGE", "CUSTOM"]),
  capital_custom_usd: z.number().nullable().optional(),
  strategy_relationship: z.object({
    relationship: z.enum(["ALONGSIDE", "REPLACE", "STANDALONE_TEST"]),
    target_strategy_id: z.string().nullable().optional(),
    evidence_bar_modifier: z.enum(["STANDARD", "ELEVATED"]),
  }),
  kill_criteria_user: z.string().min(1),
  edge_family: z.enum(["MOMENTUM", "REVERSION", "BREAKOUT", "CATALYST", "SENTIMENT", "VOLATILITY", "HEDGE", "UNSURE"]),
  prior_work_refs: z.array(z.string()),
  changes_from_refs: z.string(),
  universe_shape: z.enum(["FIXED_LIST", "DYNAMIC_SCREEN", "THEME_LEADERS", "TALON_PROPOSES"]),
  universe_fixed_list: z.array(z.string()).nullable().optional(),
  regime_expectation: z.enum(["MOST_CONDITIONS", "CALM", "VOLATILE", "BULL", "BEAR", "UNSURE"]),
  universe_size_band: wrappedSchema(z.string()),
  allowed_data_inputs: wrappedSchema(z.array(z.string())),
  entry_confirmation: wrappedSchema(z.string()),
  exit_logic: wrappedSchema(z.string()),
  risk_profile: wrappedSchema(z.string()),
  benchmark: wrappedSchema(z.string()),
  era_validation_strategy: wrappedSchema(z.string()),
  era_weighting: wrappedSchema(z.string()),
  historical_window: wrappedSchema(historicalWindowSchema),
  promotion_bar: wrappedSchema(z.string()),
  talon_exclusions: wrappedSchema(z.string()),
  field_presentations: z.record(z.string(), z.enum(["PRESENTED", "HIDDEN", "SUGGESTED", "ACCEPTED"])),
}) satisfies z.ZodType<StrategyAuthoringQuestionnaire>

const clarificationAnswerSchema = z.object({
  question_id: z.string().min(1),
  action: z.enum(["ANSWER", "ACCEPT_DEFAULT", "MARK_UNKNOWN"]),
  value: z.unknown().optional(),
  rationale: z.string().nullable().optional(),
}) satisfies z.ZodType<ClarificationAnswer>

const clarificationRequestSchema = z.object({
  request_id: z.string().min(1),
  status: z.enum(["NEEDS_CLARIFICATION", "READY_FOR_SYNTHESIS"]),
  questions: z.array(z.object({
    id: z.string().min(1),
    field_path: z.string().min(1),
    section_key: z.enum(["assumptions", "era_benchmark_plan", "strategy_spec", "sweep_bounds", "evidence_thresholds", "trial_ledger_budget", "multiple_comparisons_plan", "portfolio_fit"]),
    question: z.string().min(1),
    why_it_matters: z.string().min(1),
    answer_kind: z.enum(["FREE_TEXT", "SINGLE_CHOICE", "MULTI_CHOICE", "NUMBER", "RANGE", "BOOLEAN"]),
    options: z.array(z.object({
      label: z.string().min(1),
      value: z.unknown(),
      description: z.string().nullable().optional(),
    })),
    proposed_default: z.object({
      value: z.unknown(),
      rationale: z.string().min(1),
      provenance_source: z.enum(["USER", "REFERENCE", "PAPER", "CATALOG", "MARKET_PACKET", "TUNABLE_DEFAULT", "TALON_INFERENCE"]),
    }).nullable().optional(),
    allow_unknown: z.boolean(),
    severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
    blocking_policy: z.enum(["BLOCKS_SYNTHESIS", "CAN_USE_DEFAULT", "CAN_PROCEED_UNKNOWN"]),
  })),
  can_proceed_without_answers: z.boolean(),
  missing_context_summary: z.array(z.string()),
}) satisfies z.ZodType<ClarificationRequest>

const clarificationOptionModelSchema = z.object({
  label: z.string(),
  value_json: z.string(),
  description: z.string(),
})

const clarificationQuestionModelSchema = z.object({
  id: z.string(),
  field_path: z.string(),
  section_key: z.enum(["assumptions", "era_benchmark_plan", "strategy_spec", "sweep_bounds", "evidence_thresholds", "trial_ledger_budget", "multiple_comparisons_plan", "portfolio_fit"]),
  question: z.string(),
  why_it_matters: z.string(),
  answer_kind: z.enum(["FREE_TEXT", "SINGLE_CHOICE", "MULTI_CHOICE", "NUMBER", "RANGE", "BOOLEAN"]),
  options: z.array(clarificationOptionModelSchema),
  has_proposed_default: z.boolean(),
  proposed_default_value_json: z.string(),
  proposed_default_rationale: z.string(),
  proposed_default_provenance_source: z.enum(["USER", "REFERENCE", "PAPER", "CATALOG", "MARKET_PACKET", "TUNABLE_DEFAULT", "TALON_INFERENCE"]),
  allow_unknown: z.boolean(),
  severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
  blocking_policy: z.enum(["BLOCKS_SYNTHESIS", "CAN_USE_DEFAULT", "CAN_PROCEED_UNKNOWN"]),
})

const clarificationModelOutputSchema = z.object({
  questions: z.array(clarificationQuestionModelSchema),
  missing_context_summary: z.array(z.string()),
})

const assumptionItemSchema = z.object({
  field_path: z.string().min(1),
  assumption: z.string().min(1),
  provenance: provenanceSchema,
  risk_if_wrong: z.enum(["LOW", "MEDIUM", "HIGH"]),
  resolution_needed: z.boolean(),
})

const eraDefinitionSchema = z.object({
  era_id: z.string().min(1),
  label: z.string().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  regime_tags: z.array(z.string()),
  rationale: z.string().min(1),
})

const entryConditionSchema = z.object({
  name: z.string().min(1),
  parameter: z.string().min(1),
  operator: z.enum(["gte", "lte", "gt", "lt", "eq", "between", "in"]),
  threshold: z.union([z.number(), z.array(z.number()), z.array(z.string())]),
  data_input_id: z.string().min(1),
  compiler_support: z.enum(["SUPPORTED", "NEEDS_MAPPING"]).optional(),
})

const strategySpecSchema = z.object({
  strategy_family: z.string().min(1),
  strategy_name: z.string().min(1),
  strategy_id: wrappedSchema(z.string().min(1)),
  sleeve: z.enum(["STOCKS", "CRYPTO", "OPTIONS"]),
  universe: wrappedSchema(z.object({
    type: z.enum(["FIXED", "DYNAMIC"]),
    symbols: z.array(z.string()).nullable().optional(),
    screen_criteria: z.string().nullable().optional(),
    max_symbols: z.number().int().positive(),
    rebalance_frequency: z.string().nullable().optional(),
  })),
  entry_rules: wrappedSchema(z.object({
    description: z.string().min(1),
    conditions: z.array(entryConditionSchema),
    confirmation_required: z.boolean(),
    confirmation_description: z.string().nullable().optional(),
  })),
  exit_rules: wrappedSchema(z.object({
    stop_loss_pct: z.number().nullable().optional(),
    target_pct: z.number().nullable().optional(),
    time_stop_days: z.number().nullable().optional(),
    trailing_stop: z.object({
      enabled: z.boolean(),
      trail_pct: z.number().nullable().optional(),
      activation_pct: z.number().nullable().optional(),
    }).nullable().optional(),
    custom_exits: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      condition: z.string().min(1),
      compiler_support: z.enum(["SUPPORTED", "NEEDS_MAPPING"]).optional(),
    })).nullable().optional(),
  })),
  position_sizing: wrappedSchema(z.object({
    method: z.enum(["FIXED_PCT", "RISK_BASED", "EQUAL_WEIGHT", "CUSTOM"]),
    base_size_pct: z.number().nullable().optional(),
    max_positions: z.number().int().positive(),
    risk_per_trade_pct: z.number().nullable().optional(),
    custom_description: z.string().nullable().optional(),
  })),
  risk_limits: wrappedSchema(z.object({
    max_portfolio_drawdown_pct: z.number().nonnegative(),
    max_single_position_loss_pct: z.number().nonnegative(),
    max_correlated_exposure_pct: z.number().nullable().optional(),
    max_sector_concentration_pct: z.number().nullable().optional(),
    circuit_breaker_rules: z.string().nullable().optional(),
  })),
  execution_constraints: wrappedSchema(z.object({
    order_types: z.array(z.string()),
    no_trade_zones: z.string().nullable().optional(),
    slippage_assumption_bps: z.number().nonnegative(),
    commission_model: z.enum(["FLAT", "PER_SHARE", "PER_CONTRACT", "PCT_NOTIONAL"]),
    commission_assumption_value: z.number().nonnegative(),
  })),
})

const capitalTierModifierSchema = z.object({
  tier: z.enum(["TINY", "SMALL", "MEDIUM", "LARGE"]),
  calendar_days_multiplier: z.number().positive(),
  closed_trades_multiplier: z.number().positive(),
  drawdown_tightening_pct: z.number().nullable().optional(),
})

const paperThresholdsSchema = z.object({
  min_calendar_days: z.number().int().positive(),
  min_closed_trades: z.number().int().positive(),
  min_active_exposure_days: z.number().int().positive(),
  max_drawdown_pct: z.number().nonnegative(),
  min_win_rate_pct: z.number().nonnegative(),
  min_profit_factor: z.number().nonnegative(),
  capital_tier_modifier: capitalTierModifierSchema,
})

const portfolioFitSchema = z.object({
  status: z.enum(["PENDING", "ASSESSED", "WAIVED"]),
  deferred_until: z.enum(["BEFORE_BENCH", "PAPER_PROMOTION", "LIVE_PROMOTION"]).nullable().optional(),
  existing_strategies: z.array(z.string()),
  correlation_assessment: z.object({
    method: z.string(),
    max_acceptable_correlation: z.number(),
    estimated_correlation: z.number().nullable().optional(),
    notes: z.string(),
  }).nullable().optional(),
  joint_drawdown_estimate: z.object({
    method: z.string(),
    max_joint_drawdown_pct: z.number().nullable().optional(),
    notes: z.string(),
  }).nullable().optional(),
  sleeve_budget_impact: z.object({
    sleeve: z.enum(["STOCKS", "CRYPTO", "OPTIONS"]),
    current_sleeve_allocation_pct: z.number(),
    proposed_addition_pct: z.number(),
    resulting_sleeve_allocation_pct: z.number(),
    within_limits: z.boolean(),
  }).nullable().optional(),
  capital_capacity_notes: z.string().nullable().optional(),
  marginal_value_notes: z.string().nullable().optional(),
})

const assumptionsSchema = z.object({ items: z.array(assumptionItemSchema) })

const eraBenchmarkPlanSchema = z.object({
  benchmark_id: z.string().min(1),
  benchmark_rationale: z.string().min(1),
  eras: z.array(eraDefinitionSchema).min(1),
  era_weighting_method: wrappedSchema(z.string()),
})

const sweepBoundsSchema = z.object({
  parameters: z.array(z.object({
    field_path: z.string().min(1),
    min: z.number(),
    max: z.number(),
    step: z.number().nullable().optional(),
    values: z.array(z.union([z.number(), z.string()])).nullable().optional(),
    provenance: provenanceSchema,
  })),
  max_total_variants: z.number().int().positive(),
  sweep_method: z.enum(["GRID", "RANDOM", "BAYESIAN", "MANUAL"]),
})

const evidenceThresholdsSchema = z.object({
  backtest: z.object({
    min_trades: z.number().int().positive(),
    min_win_rate_pct: z.number().nonnegative(),
    min_profit_factor: z.number().nonnegative(),
    min_sharpe: z.number().nonnegative(),
    max_drawdown_pct: z.number().nonnegative(),
    min_profitable_fold_pct: z.number().nullable().optional(),
    additional: z.record(z.string(), z.number()).nullable().optional(),
  }),
  paper: paperThresholdsSchema,
  live: paperThresholdsSchema.extend({
    max_single_loss_usd: z.number().nullable().optional(),
  }),
})

const trialLedgerBudgetSchema = z.object({
  max_variants: z.number().int().positive(),
  max_eras: z.number().int().positive(),
  max_bench_runs: z.number().int().positive(),
  estimated_compute_cost_usd: z.number().nullable().optional(),
  rationale: z.string().min(1),
})

const multipleComparisonsPlanSchema = z.object({
  method: z.enum(["BONFERRONI", "FDR_BH", "BOOTSTRAP_REALITY_CHECK", "NONE_V1_PLACEHOLDER"]),
  effective_trials_estimate: z.number().nonnegative(),
  adjusted_significance_level: z.number().nullable().optional(),
  notes: z.string().min(1),
  full_implementation_target: z.string().nullable().optional(),
})

const synthesisPayloadSchema = z.object({
  assumptions: assumptionsSchema,
  era_benchmark_plan: eraBenchmarkPlanSchema,
  strategy_spec: strategySpecSchema,
  sweep_bounds: sweepBoundsSchema,
  evidence_thresholds: evidenceThresholdsSchema,
  trial_ledger_budget: trialLedgerBudgetSchema,
  multiple_comparisons_plan: multipleComparisonsPlanSchema,
  portfolio_fit: portfolioFitSchema.nullable().optional(),
})

type SynthesisSectionKey = keyof StrategyAuthoringSynthesisPayload

interface TalonSectionSpec<K extends SynthesisSectionKey = SynthesisSectionKey> {
  key: K
  label: string
  schema: z.ZodType<StrategyAuthoringSynthesisPayload[K]>
  shape: string
  guidance: string[]
  example?: unknown
}

const talonSectionEnvelopeSchema = z.object({
  section_json: z.string(),
})

const TALON_SECTION_SPECS = [
  {
    key: "assumptions",
    label: "assumptions",
    schema: assumptionsSchema,
    shape: "Object: { items: [{ field_path, assumption, provenance, risk_if_wrong, resolution_needed }] }.",
    guidance: [
      "Use assumptions only for material gaps or inferred defaults.",
      "Set resolution_needed=true when a wrong assumption would change the strategy or bench plan.",
    ],
  },
  {
    key: "era_benchmark_plan",
    label: "era and benchmark plan",
    schema: eraBenchmarkPlanSchema,
    shape: "Object: { benchmark_id, benchmark_rationale, eras, era_weighting_method }.",
    guidance: [
      "Choose eras that make the strategy honestly testable, including at least one recent or relevant validation window.",
      "Explain why the benchmark is fair for the sleeve and thesis.",
    ],
    example: {
      benchmark_id: "SPY",
      benchmark_rationale: "SPY is the broad equity baseline for a stocks sleeve strategy.",
      eras: [{
        era_id: "recent_3y",
        label: "Recent 3-year validation",
        start_date: "2023-01-01",
        end_date: "2026-05-04",
        regime_tags: ["recent", "mixed_regime"],
        rationale: "A recent window checks whether the strategy is still relevant before wider historical testing.",
      }],
      era_weighting_method: {
        value: "equal",
        provenance: {
          source: "TALON_INFERENCE",
          confidence: "MEDIUM",
          rationale: "Equal weighting keeps the first benchmark plan simple until the operator overrides era emphasis.",
          source_artifact_id: null,
          operator_confirmed: false,
        },
      },
    },
  },
  {
    key: "strategy_spec",
    label: "strategy specification",
    schema: strategySpecSchema,
    shape: "Object: { strategy_family, strategy_name, strategy_id, sleeve, universe, entry_rules, exit_rules, position_sizing, risk_limits, execution_constraints }.",
    guidance: [
      "strategy_id.value should be a human-readable slug proposal; operator_confirmed must be false.",
      "entry_rules.value.conditions[].data_input_id must use allowed_data_inputs from the questionnaire.",
      "Mark compiler_support=NEEDS_MAPPING for custom logic that cannot be directly compiled.",
    ],
  },
  {
    key: "sweep_bounds",
    label: "sweep bounds",
    schema: sweepBoundsSchema,
    shape: "Object: { parameters, max_total_variants, sweep_method }.",
    guidance: [
      "Keep search budgets narrow enough to avoid p-hacking.",
      "Every parameter must include field_path, min, max, optional step or values, and provenance.",
    ],
  },
  {
    key: "evidence_thresholds",
    label: "evidence thresholds",
    schema: evidenceThresholdsSchema,
    shape: "Object: { backtest, paper, live } with closed-trade and active-exposure gates.",
    guidance: [
      "Calendar days are only a floor; closed trades and exposure days matter.",
      "Higher capital or replacement intent should raise the evidence bar.",
    ],
  },
  {
    key: "trial_ledger_budget",
    label: "trial ledger budget",
    schema: trialLedgerBudgetSchema,
    shape: "Object: { max_variants, max_eras, max_bench_runs, estimated_compute_cost_usd, rationale }.",
    guidance: [
      "Ensure max_variants covers sweep_bounds.max_total_variants and max_bench_runs covers variants times eras.",
      "Use a conservative budget that keeps the experiment honest.",
    ],
  },
  {
    key: "multiple_comparisons_plan",
    label: "multiple-comparisons plan",
    schema: multipleComparisonsPlanSchema,
    shape: "Object: { method, effective_trials_estimate, adjusted_significance_level, notes, full_implementation_target }.",
    guidance: [
      "Use NONE_V1_PLACEHOLDER only when the adjustment will be enforced by the ledger/compiler later.",
      "Do not pretend a broad sweep has the same evidence value as one planned test.",
    ],
  },
  {
    key: "portfolio_fit",
    label: "portfolio fit",
    schema: portfolioFitSchema.nullable(),
    shape: "Object or null. Prefer PENDING with deferred_until=PAPER_PROMOTION when full correlation data is not available yet.",
    guidance: [
      "Include the target strategy from the relationship question in existing_strategies when relevant.",
      "Use WAIVED only with clear notes; otherwise defer explicitly.",
    ],
  },
] satisfies TalonSectionSpec[]

export function parseStrategyAuthoringQuestionnaire(input: unknown): StrategyAuthoringQuestionnaire {
  return strategyAuthoringQuestionnaireSchema.parse(input)
}

export function parseClarificationAnswers(input: unknown): ClarificationAnswer[] {
  if (input == null) return []
  return z.array(clarificationAnswerSchema).parse(input)
}

export function parseClarificationRequest(input: unknown): ClarificationRequest | null {
  if (input == null) return null
  return clarificationRequestSchema.parse(input)
}

export function parseStrategyAuthoringSynthesisPayload(rawPacketJson: string): StrategyAuthoringSynthesisPayload {
  return parseStrategyAuthoringSynthesisObject(JSON.parse(rawPacketJson))
}

export function parseStrategyAuthoringSynthesisObject(input: unknown): StrategyAuthoringSynthesisPayload {
  const parsed = synthesisPayloadSchema.safeParse(input)
  if (parsed.success) return parsed.data
  const error = new Error("Talon packet synthesis did not match the StrategyAuthoringPacketV1 synthesis contract.")
  throw Object.assign(error, {
    status: 422,
    payload: {
      validation_issues: parsed.error.issues.map(issue => ({
        field_path: issue.path.join(".") || "packet",
        severity: "error",
        code: "TALON_SYNTHESIS_SCHEMA",
        message: issue.message,
      })),
    },
  })
}

export async function createStrategyAuthoringClarification({
  scope,
  idea,
  questionnaire,
  clarificationAnswers = [],
}: CreateStrategyAuthoringClarificationArgs): Promise<StrategyAuthoringClarificationResult> {
  if (idea.sleeve !== questionnaire.sleeve) {
    throw new Error(`Questionnaire sleeve ${questionnaire.sleeve} does not match idea sleeve ${idea.sleeve}.`)
  }
  const context = await loadStrategyAuthoringContext({ scope, idea, questionnaire })
  return createStrategyAuthoringClarificationFromContext({
    context,
    clarificationAnswers,
    model: process.env.TALON_PACKET_CLARIFICATION_MODEL ?? process.env.TALON_PACKET_SYNTHESIS_MODEL ?? DEFAULT_MODEL,
  })
}

export async function createStrategyAuthoringPacketWithTalon({
  scope,
  idea,
  questionnaire,
  clarificationAnswers = [],
  clarificationRequest = null,
  operatorId = "jacob",
  revisedFrom = null,
  revisionIndex = null,
  ledgerConsumption,
  persist = true,
}: CreateStrategyAuthoringPacketWithTalonArgs): Promise<TalonPacketSynthesisResult> {
  if (idea.sleeve !== questionnaire.sleeve) {
    throw new Error(`Questionnaire sleeve ${questionnaire.sleeve} does not match idea sleeve ${idea.sleeve}.`)
  }

  const context = await loadStrategyAuthoringContext({ scope, idea, questionnaire })
  const model = process.env.TALON_PACKET_SYNTHESIS_MODEL ?? DEFAULT_MODEL
  const activeClarification = clarificationRequest ?? (await createStrategyAuthoringClarificationFromContext({
    context,
    clarificationAnswers,
    model: process.env.TALON_PACKET_CLARIFICATION_MODEL ?? model,
  })).clarification_request
  assertClarificationReadyForSynthesis(activeClarification, clarificationAnswers)
  const prompt = buildPacketSynthesisPrompt({
    idea,
    questionnaire,
    catalog: context.catalog,
    lessons: context.lessons,
    referenceContext: context.referenceContext,
    failedPacketSummary: context.failedPacketSummary,
    contextPacket: context.contextPacket,
    clarificationRequest: activeClarification,
    clarificationAnswers,
  })
  const started = Date.now()
  const staged = await synthesizePacketPayloadInSections({ model, prompt, idea, questionnaire })
  const modelExecution: ModelExecution = {
    required_capabilities: {
      min_context_window_tokens: 64000,
      structured_output_required: true,
      reasoning_depth: "EXTENDED",
      notes: "Strategy Authoring Packet synthesis runs as sectioned Talon calls over questionnaire, catalog, references, and past failures.",
    },
    actual_provider: "anthropic",
    actual_model_id: model,
    actual_response_id: staged.responseIds.length ? staged.responseIds.join(",") : null,
    temperature: DEFAULT_TEMPERATURE,
    seed: null,
    max_tokens: null,
    timestamp: new Date(started).toISOString(),
  }

  return createStrategyAuthoringPacketFromSynthesisPayload({
    scope,
    idea,
    questionnaire,
    operatorId,
    revisedFrom,
    revisionIndex,
    ledgerConsumption,
    persist,
    catalog: context.catalog,
    modelExecution,
    rawPacketJson: staged.rawPacketJson,
    prompt,
    payload: staged.payload,
  })
}

async function createStrategyAuthoringClarificationFromContext({
  context,
  clarificationAnswers,
  model,
}: {
  context: StrategyAuthoringContextBundle
  clarificationAnswers: ClarificationAnswer[]
  model: string
}): Promise<StrategyAuthoringClarificationResult> {
  const result = await generateText({
    model: anthropic(model),
    output: Output.object({
      name: "TalonStrategyAuthoringClarification",
      description: "Targeted questions Talon must ask before strategy packet synthesis.",
      schema: clarificationModelOutputSchema,
    }),
    temperature: DEFAULT_TEMPERATURE,
    prompt: buildClarificationPrompt(context.contextPacket, clarificationAnswers),
  })

  const questions = mergeClarificationQuestions(
    deterministicClarificationQuestions(context.contextPacket),
    normalizeClarificationQuestions(result.output.questions),
  )
  const request = finalizeClarificationRequest({
    requestId: clarificationRequestId(context.contextPacket),
    questions,
    answers: clarificationAnswers,
    missingContextSummary: normalizeMissingContextSummary(
      result.output.missing_context_summary,
      context.contextPacket.missing_context_candidates,
    ),
  })

  return {
    status: request.status,
    clarification_request: request,
    context_packet: context.contextPacket,
    response_id: responseIdFromResult(result),
  }
}

async function loadStrategyAuthoringContext({
  scope,
  idea,
  questionnaire,
}: {
  scope: ScopeTriple
  idea: IdeaArtifact
  questionnaire: StrategyAuthoringQuestionnaire
}): Promise<StrategyAuthoringContextBundle> {
  const [catalog, lessons, referenceContext, failedPacketSummary] = await Promise.all([
    loadDataCapabilityCatalog(),
    formatTalonLessonsForPrompt(),
    formatReferenceStrategiesForPrompt(idea.reference_strategies),
    loadFailedPacketSummary(scope, questionnaire.edge_family),
  ])
  const contextPacket: StrategyAuthoringContextPacket = {
    schema_version: "research_lab.strategy_authoring_context_packet.v1",
    generated_at: new Date().toISOString(),
    idea: {
      idea_id: idea.idea_id,
      title: idea.title,
      thesis: idea.thesis,
      sleeve: idea.sleeve,
      tags: idea.tags ?? [],
      reference_strategies: idea.reference_strategies ?? [],
      created_by: idea.created_by,
    },
    questionnaire,
    data_catalog: catalog.capabilities.map(capability => ({
      capability_id: capability.capability_id,
      display_name: capability.display_name,
      category: capability.category,
      status: capability.status,
      sleeves: capability.sleeves,
      notes: capability.notes ?? null,
    })),
    talon_lessons: lessons || "Durable Talon lessons: none.",
    reference_context: referenceContext,
    failed_packet_summary: failedPacketSummary,
    missing_context_candidates: deterministicMissingContextCandidates(questionnaire),
  }
  return { contextPacket, catalog, lessons, referenceContext, failedPacketSummary }
}

function buildClarificationPrompt(
  contextPacket: StrategyAuthoringContextPacket,
  clarificationAnswers: ClarificationAnswer[],
): string {
  return [
    "You are Talon, Vires Capital's governed strategy-authoring agent.",
    "Before drafting a StrategyAuthoringPacketV1, ask only the missing high-impact questions needed to prevent hallucinated strategy details.",
    "",
    "Rules:",
    "- Ask at most 8 questions.",
    "- Prefer no question when the questionnaire, references, data catalog, or prior lessons already answer it.",
    "- Use BLOCKS_SYNTHESIS only when drafting would require inventing a core thesis, universe, benchmark, data source, or validation gate.",
    "- Use CAN_USE_DEFAULT when a visible tunable default is honest and safe for a first draft.",
    "- Use CAN_PROCEED_UNKNOWN when the unknown can be carried as an explicit assumption without degrading the draft.",
    "- Do not ask for data sources that are not in the context packet data_catalog.",
    "- For value_json fields, return valid JSON. Strings must be quoted JSON strings.",
    "- If there is no proposed default, set has_proposed_default=false, proposed_default_value_json=null, and proposed_default_rationale='No safe default.'.",
    "",
    "Existing clarification answers:",
    JSON.stringify(clarificationAnswers, null, 2),
    "",
    "Strategy authoring context packet:",
    JSON.stringify(contextPacket, null, 2),
  ].join("\n")
}

function normalizeClarificationQuestions(
  questions: z.infer<typeof clarificationQuestionModelSchema>[],
): ClarificationQuestion[] {
  return questions
    .slice(0, 8)
    .map((question, index) => {
      const id = safeClarificationId(question.id, index)
      const proposedDefault = normalizeProposedDefault(question)
      return {
        id,
        field_path: normalizeRequiredText(question.field_path, `clarification.${id}`),
        section_key: question.section_key,
        question: normalizeRequiredText(question.question, "What information should Talon clarify?"),
        why_it_matters: normalizeRequiredText(question.why_it_matters, "This affects whether Talon can draft without inventing important strategy details."),
        answer_kind: question.answer_kind,
        options: question.options.map(option => ({
          label: normalizeRequiredText(option.label, "Option"),
          value: parseJsonOrString(option.value_json),
          description: option.description.trim() || null,
        })),
        proposed_default: proposedDefault,
        allow_unknown: question.allow_unknown,
        severity: question.severity,
        blocking_policy: question.blocking_policy,
      }
    })
}

function mergeClarificationQuestions(
  deterministicQuestions: ClarificationQuestion[],
  modelQuestions: ClarificationQuestion[],
): ClarificationQuestion[] {
  const seen = new Set<string>()
  return [...deterministicQuestions, ...modelQuestions]
    .filter(question => {
      const key = `${question.field_path}:${question.question.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}

function deterministicClarificationQuestions(
  contextPacket: StrategyAuthoringContextPacket,
): ClarificationQuestion[] {
  const questionnaire = contextPacket.questionnaire
  const questions: ClarificationQuestion[] = []
  if (questionnaire.allowed_data_inputs.value.length === 0) {
    questions.push({
      id: "clarify_required_data_inputs",
      field_path: "questionnaire.allowed_data_inputs",
      section_key: "strategy_spec",
      question: "Which approved data inputs may Talon use for this strategy?",
      why_it_matters: "Talon cannot draft entry rules or validation requirements without a real data source from the catalog.",
      answer_kind: "MULTI_CHOICE",
      options: contextPacket.data_catalog
        .filter(capability => capability.sleeves.includes(questionnaire.sleeve))
        .map(capability => ({
          label: capability.display_name,
          value: capability.capability_id,
          description: capability.notes ?? null,
        })),
      proposed_default: null,
      allow_unknown: false,
      severity: "HIGH",
      blocking_policy: "BLOCKS_SYNTHESIS",
    })
  }
  if (
    questionnaire.strategy_relationship.relationship === "REPLACE"
    && !questionnaire.strategy_relationship.target_strategy_id
  ) {
    questions.push({
      id: "clarify_replacement_target",
      field_path: "questionnaire.strategy_relationship.target_strategy_id",
      section_key: "portfolio_fit",
      question: "Which existing strategy is this intended to replace?",
      why_it_matters: "Replacement requires a higher evidence bar and a direct portfolio-fit comparison against the incumbent strategy.",
      answer_kind: "FREE_TEXT",
      options: [],
      proposed_default: null,
      allow_unknown: false,
      severity: "HIGH",
      blocking_policy: "BLOCKS_SYNTHESIS",
    })
  }
  if (questionnaire.edge_family === "UNSURE") {
    questions.push({
      id: "clarify_edge_family",
      field_path: "questionnaire.edge_family",
      section_key: "strategy_spec",
      question: "Which edge family best describes the pattern, or should Talon classify it from the thesis?",
      why_it_matters: "The edge family changes entry confirmation, benchmark choice, and which prior failures Talon should study.",
      answer_kind: "SINGLE_CHOICE",
      options: ["MOMENTUM", "REVERSION", "BREAKOUT", "CATALYST", "SENTIMENT", "VOLATILITY", "HEDGE", "Talon classifies from thesis"].map(value => ({
        label: value,
        value,
        description: null,
      })),
      proposed_default: {
        value: "Talon classifies from thesis",
        rationale: "Classification can be carried as a visible Talon inference when the operator is unsure.",
        provenance_source: "TALON_INFERENCE",
      },
      allow_unknown: true,
      severity: "MEDIUM",
      blocking_policy: "CAN_USE_DEFAULT",
    })
  }
  if (questionnaire.universe_shape === "TALON_PROPOSES" && fixedUniverseSymbols(questionnaire).length === 0) {
    questions.push({
      id: "clarify_universe_proposal",
      field_path: "strategy_spec.universe",
      section_key: "strategy_spec",
      question: "Should Talon propose a dynamic universe screen, or do you want to provide specific symbols?",
      why_it_matters: "Universe construction drives survivorship-bias risk, data coverage, trade count, and benchmark fairness.",
      answer_kind: "FREE_TEXT",
      options: [],
      proposed_default: {
        value: "Talon proposes a dynamic screen constrained to catalog-supported data and marks it TENTATIVE.",
        rationale: "The operator delegated universe selection to Talon; the safest default is a tentative dynamic screen, not hidden symbol invention.",
        provenance_source: "TALON_INFERENCE",
      },
      allow_unknown: true,
      severity: "MEDIUM",
      blocking_policy: "CAN_USE_DEFAULT",
    })
  }
  return questions
}

function finalizeClarificationRequest({
  requestId,
  questions,
  answers,
  missingContextSummary,
}: {
  requestId: string
  questions: ClarificationQuestion[]
  answers: ClarificationAnswer[]
  missingContextSummary: string[]
}): ClarificationRequest {
  const unresolvedBlocking = questions.filter(question => (
    question.blocking_policy === "BLOCKS_SYNTHESIS"
    && !isClarificationQuestionResolved(question, answers)
  ))
  return {
    request_id: requestId,
    status: unresolvedBlocking.length > 0 ? "NEEDS_CLARIFICATION" : "READY_FOR_SYNTHESIS",
    questions,
    can_proceed_without_answers: questions.every(question => question.blocking_policy !== "BLOCKS_SYNTHESIS"),
    missing_context_summary: missingContextSummary,
  }
}

function assertClarificationReadyForSynthesis(
  request: ClarificationRequest,
  answers: ClarificationAnswer[],
) {
  const unresolved = request.questions.filter(question => (
    question.blocking_policy === "BLOCKS_SYNTHESIS"
    && !isClarificationQuestionResolved(question, answers)
  ))
  if (unresolved.length === 0) return

  throw Object.assign(new Error("Talon needs clarification before strategy packet synthesis."), {
    status: 409,
    payload: {
      error_code: "TALON_CLARIFICATION_REQUIRED",
      route: "POST /api/research/strategy-authoring/packets",
      source_file: "lib/research-lab-strategy-authoring-orchestration.server.ts",
      source_function: "assertClarificationReadyForSynthesis",
      clarification_request: {
        ...request,
        status: "NEEDS_CLARIFICATION",
      },
      unresolved_question_ids: unresolved.map(question => question.id),
      operator_hint: "Answer blocking questions or accept a proposed default before drafting the packet.",
    },
  })
}

function isClarificationQuestionResolved(
  question: ClarificationQuestion,
  answers: ClarificationAnswer[],
): boolean {
  const answer = answers.find(candidate => candidate.question_id === question.id)
  if (!answer) return false
  if (answer.action === "ANSWER") return answer.value != null && String(answer.value).trim() !== ""
  if (answer.action === "ACCEPT_DEFAULT") return question.proposed_default != null
  if (answer.action === "MARK_UNKNOWN") return question.allow_unknown && question.blocking_policy !== "BLOCKS_SYNTHESIS"
  return false
}

function normalizeProposedDefault(
  question: z.infer<typeof clarificationQuestionModelSchema>,
): ClarificationProposedDefault | null {
  if (!question.has_proposed_default) return null
  return {
    value: parseJsonOrString(question.proposed_default_value_json),
    rationale: normalizeRequiredText(question.proposed_default_rationale, "Talon proposed this as a tunable default for operator review."),
    provenance_source: question.proposed_default_provenance_source,
  }
}

function parseJsonOrString(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function normalizeMissingContextSummary(modelSummary: string[], deterministicSummary: string[]): string[] {
  return [...modelSummary, ...deterministicSummary]
    .map(item => item.trim())
    .filter((item, index, items) => item && items.indexOf(item) === index)
    .slice(0, 12)
}

function deterministicMissingContextCandidates(questionnaire: StrategyAuthoringQuestionnaire): string[] {
  const gaps: string[] = []
  if (questionnaire.edge_family === "UNSURE") gaps.push("Edge family is UNSURE; Talon should classify it or ask the operator before drafting entry logic.")
  if (questionnaire.universe_shape === "TALON_PROPOSES" && fixedUniverseSymbols(questionnaire).length === 0) {
    gaps.push("Universe is delegated to Talon; Talon must ask or propose a visible default instead of inventing unsupported symbols.")
  }
  if (questionnaire.allowed_data_inputs.value.length === 0) {
    gaps.push("No allowed data inputs were selected; synthesis must block until data sources are chosen.")
  }
  if (questionnaire.strategy_relationship.relationship === "REPLACE" && !questionnaire.strategy_relationship.target_strategy_id) {
    gaps.push("Replacement intent requires a target strategy id so portfolio-fit and evidence bars can be raised.")
  }
  if (!questionnaire.kill_criteria_user.trim()) {
    gaps.push("Kill criteria are empty; Talon needs a failure condition before setting promotion thresholds.")
  }
  return gaps
}

function clarificationRequestId(contextPacket: StrategyAuthoringContextPacket): string {
  return `clarify_${simpleHash(JSON.stringify({
    idea_id: contextPacket.idea.idea_id,
    questionnaire: contextPacket.questionnaire,
    missing_context_candidates: contextPacket.missing_context_candidates,
  }))}`
}

function simpleHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function safeClarificationId(value: string, index: number): string {
  const slug = slugify(value || `question_${index + 1}`)
  return `clarify_${String(index + 1).padStart(2, "0")}_${slug}`.slice(0, 80)
}

function normalizeRequiredText(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed || fallback
}

async function synthesizePacketPayloadInSections({
  model,
  prompt,
  idea,
  questionnaire,
}: {
  model: string
  prompt: string
  idea: IdeaArtifact
  questionnaire: StrategyAuthoringQuestionnaire
}): Promise<{
  payload: StrategyAuthoringSynthesisPayload
  rawPacketJson: string
  responseIds: string[]
}> {
  const sections = await mapWithConcurrency(
    TALON_SECTION_SPECS,
    TALON_SECTION_CONCURRENCY,
    spec => generateTalonSection({ model, prompt, spec, idea, questionnaire }),
  )
  const candidate = Object.fromEntries(
    sections.map(section => [section.key, section.value]),
  ) as Record<SynthesisSectionKey, unknown>
  const scaffoldedSections = sections.filter(section => section.scaffolded)
  if (scaffoldedSections.length > 0) {
    candidate.assumptions = mergeScaffoldWarnings(candidate.assumptions, scaffoldedSections)
  }
  const payload = parseStrategyAuthoringSynthesisObject(candidate)
  return {
    payload,
    rawPacketJson: JSON.stringify({
      synthesis_mode: "sectioned",
      sections: Object.fromEntries(sections.map(section => [section.key, section.rawJson])),
      scaffolded_sections: scaffoldedSections.map(section => section.key),
      section_validation_issues: Object.fromEntries(
        scaffoldedSections.map(section => [section.key, section.issues]),
      ),
      payload,
    }, null, 2),
    responseIds: sections.map(section => section.responseId).filter((id): id is string => Boolean(id)),
  }
}

async function generateTalonSection({
  model,
  prompt,
  spec,
  idea,
  questionnaire,
}: {
  model: string
  prompt: string
  spec: TalonSectionSpec
  idea: IdeaArtifact
  questionnaire: StrategyAuthoringQuestionnaire
}): Promise<TalonSectionResult> {
  let feedback: string | null = null
  let lastIssues: TalonSectionIssue[] = []
  let lastRawJson = ""
  let lastResponseId: string | null = null
  for (let attempt = 1; attempt <= TALON_SECTION_ATTEMPTS; attempt += 1) {
    const result = await generateText({
      model: anthropic(model),
      output: Output.object({
        name: "TalonStrategyAuthoringSection",
        description: `JSON string for the ${spec.label} section of a StrategyAuthoringPacketV1.`,
        schema: talonSectionEnvelopeSchema,
      }),
      temperature: DEFAULT_TEMPERATURE,
      prompt: buildTalonSectionPrompt({ basePrompt: prompt, spec, attempt, feedback }),
    })
    lastRawJson = result.output.section_json
    lastResponseId = responseIdFromResult(result)
    const parsed = parseTalonSectionJson(spec, result.output.section_json)
    if (parsed.ok) {
      return {
        key: spec.key,
        value: parsed.value,
        rawJson: result.output.section_json,
        responseId: lastResponseId,
        scaffolded: false,
        issues: [],
      }
    }
    lastIssues = parsed.issues
    feedback = formatSectionValidationFeedback(lastIssues)
  }

  const scaffold = spec.schema.parse(scaffoldTalonSection(spec.key, { idea, questionnaire }))
  return {
    key: spec.key,
    value: scaffold,
    rawJson: lastRawJson,
    responseId: lastResponseId,
    scaffolded: true,
    issues: lastIssues,
  }
}

function mergeScaffoldWarnings(
  assumptions: unknown,
  scaffoldedSections: TalonSectionResult[],
): StrategyAuthoringSynthesisPayload["assumptions"] {
  const parsed = assumptionsSchema.safeParse(assumptions)
  const baseItems = parsed.success ? parsed.data.items : []
  return {
    items: [
      ...baseItems,
      ...scaffoldedSections.map(section => scaffoldWarningAssumption(section)),
    ],
  }
}

function scaffoldWarningAssumption(section: TalonSectionResult): StrategyAuthoringSynthesisPayload["assumptions"]["items"][number] {
  const issueSummary = formatSectionValidationFeedback(section.issues.slice(0, 6))
  return {
    field_path: section.key,
    assumption: [
      `Talon could not produce a contract-valid ${section.key} section after ${TALON_SECTION_ATTEMPTS} attempts.`,
      "The server scaffolded a conservative placeholder so this packet can be reviewed instead of losing the operator's work.",
    ].join(" "),
    provenance: scaffoldProvenance(
      [
        "Server-generated scaffold from failed Talon section validation.",
        issueSummary ? `Validation issues: ${issueSummary.replace(/\n/g, " ")}` : "",
      ].filter(Boolean).join(" "),
    ),
    risk_if_wrong: "HIGH",
    resolution_needed: true,
  }
}

function scaffoldTalonSection<K extends SynthesisSectionKey>(
  key: K,
  context: {
    idea: IdeaArtifact
    questionnaire: StrategyAuthoringQuestionnaire
  },
): StrategyAuthoringSynthesisPayload[K] {
  switch (key) {
    case "assumptions":
      return { items: [] } as unknown as StrategyAuthoringSynthesisPayload[K]
    case "era_benchmark_plan":
      return scaffoldEraBenchmarkPlan(context.questionnaire) as unknown as StrategyAuthoringSynthesisPayload[K]
    case "strategy_spec":
      return scaffoldStrategySpec(context.idea, context.questionnaire) as unknown as StrategyAuthoringSynthesisPayload[K]
    case "sweep_bounds":
      return scaffoldSweepBounds() as unknown as StrategyAuthoringSynthesisPayload[K]
    case "evidence_thresholds":
      return scaffoldEvidenceThresholds(context.questionnaire) as unknown as StrategyAuthoringSynthesisPayload[K]
    case "trial_ledger_budget":
      return scaffoldTrialLedgerBudget() as unknown as StrategyAuthoringSynthesisPayload[K]
    case "multiple_comparisons_plan":
      return scaffoldMultipleComparisonsPlan() as unknown as StrategyAuthoringSynthesisPayload[K]
    case "portfolio_fit":
      return scaffoldPortfolioFit(context.questionnaire) as unknown as StrategyAuthoringSynthesisPayload[K]
    default:
      return assertNever(key)
  }
}

function scaffoldEraBenchmarkPlan(
  questionnaire: StrategyAuthoringQuestionnaire,
): StrategyAuthoringSynthesisPayload["era_benchmark_plan"] {
  const historicalWindow = questionnaire.historical_window.value
  return {
    benchmark_id: questionnaire.benchmark.value || defaultBenchmarkForSleeve(questionnaire.sleeve),
    benchmark_rationale: "Scaffolded from the operator questionnaire because Talon returned an invalid era/benchmark section; review before adversarial submission.",
    eras: [{
      era_id: "questionnaire_window",
      label: "Questionnaire historical window",
      start_date: historicalWindow.start_date || "2018-01-01",
      end_date: historicalWindow.end_date || new Date().toISOString().slice(0, 10),
      regime_tags: ["operator_requested", "scaffolded"],
      rationale: historicalWindow.rationale || "Scaffolded from the questionnaire historical window; operator review required.",
    }],
    era_weighting_method: wrappedScaffold(
      questionnaire.era_weighting.value || "equal",
      "Scaffolded from the questionnaire era weighting because Talon returned invalid section output.",
    ),
  }
}

function scaffoldStrategySpec(
  idea: IdeaArtifact,
  questionnaire: StrategyAuthoringQuestionnaire,
): StrategyAuthoringSynthesisPayload["strategy_spec"] {
  const maxSymbols = maxSymbolsFromQuestionnaire(questionnaire)
  const fixedSymbols = fixedUniverseSymbols(questionnaire)
  const dataInputId = firstAllowedDataInput(questionnaire)
  return {
    strategy_family: `${questionnaire.edge_family.toLowerCase()}_${questionnaire.sleeve.toLowerCase()}`,
    strategy_name: idea.title || "Talon scaffolded strategy",
    strategy_id: wrappedScaffold(
      safeStrategySlug(idea),
      "Server-scaffolded slug proposal after Talon returned an invalid strategy specification; operator confirmation is required.",
    ),
    sleeve: questionnaire.sleeve,
    universe: wrappedScaffold({
      type: fixedSymbols.length > 0 ? "FIXED" : "DYNAMIC",
      symbols: fixedSymbols.length > 0 ? fixedSymbols : null,
      screen_criteria: fixedSymbols.length > 0
        ? null
        : questionnaire.universe_shape === "TALON_PROPOSES"
          ? "Talon must propose a supported universe screen before implementation."
          : questionnaire.universe_size_band.value,
      max_symbols: maxSymbols,
      rebalance_frequency: "per_bench_run",
    }, "Conservative universe scaffold from questionnaire answers; operator review required."),
    entry_rules: wrappedScaffold({
      description: "Scaffolded entry logic because Talon returned invalid strategy rules; implementation must map or replace this before bench automation.",
      conditions: dataInputId
        ? [{
            name: "Review-required signal placeholder",
            parameter: "signal",
            operator: "gte",
            threshold: 1,
            data_input_id: dataInputId,
            compiler_support: "NEEDS_MAPPING",
          }]
        : [],
      confirmation_required: true,
      confirmation_description: "Entry rules were scaffolded by the server and require operator review.",
    }, "Server scaffold; Talon output failed strategy specification validation."),
    exit_rules: wrappedScaffold({
      stop_loss_pct: null,
      target_pct: null,
      time_stop_days: null,
      trailing_stop: { enabled: false, trail_pct: null, activation_pct: null },
      custom_exits: [{
        name: "Review-required exit placeholder",
        description: "Exit logic must be confirmed or mapped before implementation.",
        condition: questionnaire.exit_logic.value || "Operator review required.",
        compiler_support: "NEEDS_MAPPING",
      }],
    }, "Server scaffold from questionnaire exit logic; operator review required."),
    position_sizing: wrappedScaffold({
      method: "EQUAL_WEIGHT",
      base_size_pct: null,
      max_positions: maxSymbols,
      risk_per_trade_pct: null,
      custom_description: "Equal-weight scaffold only; tune before implementation.",
    }, "Server-scaffolded neutral sizing because Talon returned invalid strategy specification output."),
    risk_limits: wrappedScaffold({
      max_portfolio_drawdown_pct: questionnaire.capital_tier === "LARGE" ? 8 : 12,
      max_single_position_loss_pct: 5,
      max_correlated_exposure_pct: null,
      max_sector_concentration_pct: null,
      circuit_breaker_rules: "Scaffolded risk guard; operator review required before promotion.",
    }, "Server-scaffolded conservative risk limits."),
    execution_constraints: wrappedScaffold({
      order_types: ["MARKET"],
      no_trade_zones: null,
      slippage_assumption_bps: questionnaire.sleeve === "OPTIONS" ? 25 : 10,
      commission_model: questionnaire.sleeve === "OPTIONS" ? "PER_CONTRACT" : "FLAT",
      commission_assumption_value: 0,
    }, "Server-scaffolded execution assumptions; confirm cost model before bench handoff."),
  }
}

function scaffoldSweepBounds(): StrategyAuthoringSynthesisPayload["sweep_bounds"] {
  return {
    parameters: [],
    max_total_variants: 1,
    sweep_method: "MANUAL",
  }
}

function scaffoldEvidenceThresholds(
  questionnaire: StrategyAuthoringQuestionnaire,
): StrategyAuthoringSynthesisPayload["evidence_thresholds"] {
  const capitalTierModifier = {
    tier: normalizeTalonCapitalTier(questionnaire.capital_tier),
    calendar_days_multiplier: questionnaire.capital_tier === "LARGE" ? 1.5 : 1,
    closed_trades_multiplier: questionnaire.capital_tier === "LARGE" ? 1.5 : 1,
    drawdown_tightening_pct: questionnaire.capital_tier === "LARGE" ? 2 : null,
  }
  return {
    backtest: {
      min_trades: 30,
      min_win_rate_pct: 50,
      min_profit_factor: 1.1,
      min_sharpe: 0.5,
      max_drawdown_pct: 15,
      min_profitable_fold_pct: null,
      additional: null,
    },
    paper: {
      min_calendar_days: 30,
      min_closed_trades: 10,
      min_active_exposure_days: 10,
      max_drawdown_pct: 10,
      min_win_rate_pct: 50,
      min_profit_factor: 1.1,
      capital_tier_modifier: capitalTierModifier,
    },
    live: {
      min_calendar_days: 60,
      min_closed_trades: 20,
      min_active_exposure_days: 20,
      max_drawdown_pct: 8,
      min_win_rate_pct: 50,
      min_profit_factor: 1.15,
      capital_tier_modifier: capitalTierModifier,
      max_single_loss_usd: null,
    },
  }
}

function scaffoldTrialLedgerBudget(): StrategyAuthoringSynthesisPayload["trial_ledger_budget"] {
  return {
    max_variants: 1,
    max_eras: 1,
    max_bench_runs: 1,
    estimated_compute_cost_usd: null,
    rationale: "Server-scaffolded single-run budget after Talon returned invalid budget output; expand only after operator review.",
  }
}

function scaffoldMultipleComparisonsPlan(): StrategyAuthoringSynthesisPayload["multiple_comparisons_plan"] {
  return {
    method: "NONE_V1_PLACEHOLDER",
    effective_trials_estimate: 1,
    adjusted_significance_level: null,
    notes: "Server-scaffolded single-variant placeholder; compiler and trial ledger still enforce budget consumption.",
    full_implementation_target: null,
  }
}

function scaffoldPortfolioFit(
  questionnaire: StrategyAuthoringQuestionnaire,
): StrategyAuthoringSynthesisPayload["portfolio_fit"] {
  return {
    status: "PENDING",
    deferred_until: "PAPER_PROMOTION",
    existing_strategies: questionnaire.strategy_relationship.target_strategy_id
      ? [questionnaire.strategy_relationship.target_strategy_id]
      : [],
    correlation_assessment: null,
    joint_drawdown_estimate: null,
    sleeve_budget_impact: null,
    capital_capacity_notes: "Server-scaffolded portfolio-fit placeholder; must be assessed before the deferred promotion deadline.",
    marginal_value_notes: null,
  }
}

function wrappedScaffold<T>(value: T, rationale: string): { value: T; provenance: z.infer<typeof provenanceSchema> } {
  return { value, provenance: scaffoldProvenance(rationale) }
}

function scaffoldProvenance(rationale: string): z.infer<typeof provenanceSchema> {
  return {
    source: "TALON_INFERENCE",
    confidence: "LOW",
    rationale,
    source_artifact_id: null,
    operator_confirmed: false,
  }
}

function defaultBenchmarkForSleeve(sleeve: StrategyAuthoringQuestionnaire["sleeve"]): string {
  if (sleeve === "CRYPTO") return "BTC"
  if (sleeve === "OPTIONS") return "SPY"
  return "SPY"
}

function firstAllowedDataInput(questionnaire: StrategyAuthoringQuestionnaire): string | null {
  return questionnaire.allowed_data_inputs.value.map(input => input.trim()).find(Boolean) ?? null
}

function fixedUniverseSymbols(questionnaire: StrategyAuthoringQuestionnaire): string[] {
  return (questionnaire.universe_fixed_list ?? [])
    .map(symbol => symbol.trim().toUpperCase())
    .filter(Boolean)
}

function maxSymbolsFromQuestionnaire(questionnaire: StrategyAuthoringQuestionnaire): number {
  const fixedSymbols = fixedUniverseSymbols(questionnaire)
  if (fixedSymbols.length > 0) return clampPositiveInt(fixedSymbols.length, 1, 50)
  const matches = questionnaire.universe_size_band.value.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? []
  const parsed = matches.length > 0 ? Math.max(...matches) : 6
  return clampPositiveInt(parsed, 1, 50)
}

function clampPositiveInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function safeStrategySlug(idea: IdeaArtifact): string {
  const candidate = slugify([idea.title, idea.idea_id].filter(Boolean).join(" "))
  if (/^[A-Za-z0-9]/.test(candidate)) return candidate.slice(0, 128)
  return `strategy_${slugify(idea.idea_id || "talon_packet")}`.slice(0, 128)
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    || "talon_packet"
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Talon section key: ${String(value)}`)
}

function parseTalonSectionJson(
  spec: TalonSectionSpec,
  sectionJson: string,
): {
  ok: true
  value: unknown
} | {
  ok: false
  issues: TalonSectionIssue[]
} {
  let json: unknown
  try {
    json = JSON.parse(normalizeTalonSectionJson(sectionJson))
  } catch (error) {
    return {
      ok: false,
      issues: [{
        field_path: spec.key,
        severity: "error",
        code: "TALON_SECTION_JSON",
        message: error instanceof Error ? error.message : "Section JSON did not parse.",
      }],
    }
  }

  const sectionValue = normalizeTalonGeneratedValue(unwrapTalonSectionValue(spec, json))
  const parsed = spec.schema.safeParse(sectionValue)
  if (parsed.success) return { ok: true, value: parsed.data }
  return {
    ok: false,
    issues: parsed.error.issues.map(issue => ({
      field_path: [spec.key, ...issue.path].join("."),
      severity: "error",
      code: "TALON_SECTION_SCHEMA",
      message: issue.message,
    })),
  }
}

function normalizeTalonSectionJson(sectionJson: string): string {
  const trimmed = sectionJson.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced) return fenced[1].trim()

  const firstObject = trimmed.indexOf("{")
  const lastObject = trimmed.lastIndexOf("}")
  if (firstObject >= 0 && lastObject > firstObject) {
    return trimmed.slice(firstObject, lastObject + 1)
  }

  const firstArray = trimmed.indexOf("[")
  const lastArray = trimmed.lastIndexOf("]")
  if (firstArray >= 0 && lastArray > firstArray) {
    return trimmed.slice(firstArray, lastArray + 1)
  }

  return trimmed
}

function unwrapTalonSectionValue(spec: TalonSectionSpec, json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json
  const object = json as Record<string, unknown>
  if (spec.key in object) return object[spec.key]
  if ("section" in object && object.section === spec.key && "value" in object) return object.value
  return json
}

function normalizeTalonGeneratedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeTalonGeneratedValue)
  }
  if (!value || typeof value !== "object") {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (key === "source" && typeof child === "string") {
        return [key, normalizeTalonProvenanceSource(child)]
      }
      if (key === "capital_tier_modifier") {
        return [key, normalizeTalonCapitalTierModifier(child)]
      }
      if (key === "operator" && typeof child === "string") {
        return [key, normalizeTalonEntryOperator(child)]
      }
      if (key === "sleeve" && typeof child === "string") {
        return [key, normalizeTalonSleeve(child)]
      }
      if (TALON_NUMERIC_FIELD_KEYS.has(key) && typeof child === "string") {
        return [key, normalizeTalonNumber(key, child)]
      }
      if (TALON_STRING_FIELD_KEYS.has(key)) {
        return [key, normalizeTalonString(key, child)]
      }
      return [key, normalizeTalonGeneratedValue(child)]
    }),
  )
}

function normalizeTalonString(key: string, value: unknown): string | null {
  if (value == null) {
    if (key === "screen_criteria" || key.endsWith("_notes") || key.endsWith("_description")) return null
    return fallbackTalonString(key)
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed || fallbackTalonString(key)
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (typeof value === "object") {
    const unwrapped = unwrapValueObject(value)
    if (unwrapped !== value) return normalizeTalonString(key, unwrapped)
    return JSON.stringify(value)
  }
  return fallbackTalonString(key)
}

function fallbackTalonString(key: string): string {
  if (key === "strategy_family") return "Talon authored"
  if (key === "strategy_name") return "Talon authored strategy"
  if (key === "description") return "Talon provided no valid description; operator review is required."
  if (key === "parameter") return "signal"
  if (key === "name") return "Talon condition"
  if (key === "data_input_id") return "price_ohlcv_daily"
  if (key === "field_path") return "strategy_spec.entry_rules"
  if (key === "benchmark_id") return "SPY"
  if (key === "benchmark_rationale") return "Default broad-market benchmark; operator review is required."
  if (key === "rationale") return "Talon did not provide a valid rationale; operator review is required."
  if (key === "label") return "Talon-authored era"
  if (key === "era_id") return "talon_era"
  return "Operator review required"
}

function normalizeTalonEntryOperator(value: string): "gte" | "lte" | "gt" | "lt" | "eq" | "between" | "in" {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_")
  if (normalized === ">=" || normalized === "=>" || normalized === "at_least" || normalized === "greater_than_or_equal_to") return "gte"
  if (normalized === "<=" || normalized === "=<" || normalized === "at_most" || normalized === "less_than_or_equal_to") return "lte"
  if (normalized === ">" || normalized === "above" || normalized === "greater_than") return "gt"
  if (normalized === "<" || normalized === "below" || normalized === "less_than") return "lt"
  if (normalized === "=" || normalized === "==" || normalized === "equals" || normalized === "equal_to") return "eq"
  if (normalized === "between" || normalized === "range") return "between"
  if (normalized === "in" || normalized === "one_of") return "in"
  return "gte"
}

function normalizeTalonSleeve(value: string): "STOCKS" | "CRYPTO" | "OPTIONS" {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_")
  if (normalized === "STOCKS" || normalized === "STOCK" || normalized === "EQUITY" || normalized === "EQUITIES") return "STOCKS"
  if (normalized === "CRYPTO" || normalized === "CRYPTOCURRENCY" || normalized === "DIGITAL_ASSETS") return "CRYPTO"
  if (normalized === "OPTIONS" || normalized === "OPTION") return "OPTIONS"
  return "STOCKS"
}

function normalizeTalonNumber(key: string, value: string): number | string {
  const cleaned = value.replace(/,/g, "")
  const match = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!match) return value
  const parsed = Number(match[0])
  if (!Number.isFinite(parsed)) return value
  if (TALON_INTEGER_FIELD_KEYS.has(key)) return Math.max(1, Math.round(parsed))
  return parsed
}

function normalizeTalonCapitalTierModifier(value: unknown): unknown {
  const raw = unwrapValueObject(value)
  const normalized = normalizeTalonGeneratedValue(raw)
  const object = normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized as Record<string, unknown>
    : {}
  return {
    tier: normalizeTalonCapitalTier(object.tier),
    calendar_days_multiplier: positiveNumberOrDefault(object.calendar_days_multiplier, 1),
    closed_trades_multiplier: positiveNumberOrDefault(object.closed_trades_multiplier, 1),
    drawdown_tightening_pct: nullableNonNegativeNumber(object.drawdown_tightening_pct),
  }
}

function unwrapValueObject(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const object = value as Record<string, unknown>
  return "value" in object ? object.value : value
}

function normalizeTalonCapitalTier(value: unknown): "TINY" | "SMALL" | "MEDIUM" | "LARGE" {
  if (typeof value !== "string") return "SMALL"
  const normalized = value.trim().toUpperCase()
  if (normalized === "TINY" || normalized === "SMALL" || normalized === "MEDIUM" || normalized === "LARGE") {
    return normalized
  }
  return "SMALL"
}

function positiveNumberOrDefault(value: unknown, fallback: number): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? normalizeTalonNumber("generic", value)
      : fallback
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function nullableNonNegativeNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? normalizeTalonNumber("generic", value)
      : null
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function normalizeTalonProvenanceSource(source: string): string {
  const normalized = source.trim().toUpperCase().replace(/[\s-]+/g, "_")
  const canonical = new Set(["USER", "REFERENCE", "PAPER", "CATALOG", "MARKET_PACKET", "TUNABLE_DEFAULT", "TALON_INFERENCE"])
  if (canonical.has(normalized)) return normalized
  if (
    normalized === "TALON"
    || normalized === "AI"
    || normalized === "AI_INFERENCE"
    || normalized === "AI_INFERRED"
    || normalized === "ASSISTANT"
    || normalized === "MODEL"
    || normalized === "MODEL_INFERENCE"
    || normalized === "LLM"
    || normalized === "LLM_INFERENCE"
    || normalized === "INFERENCE"
    || normalized === "TALON_ASSUMPTION"
    || normalized === "TALON_GENERATED"
  ) {
    return "TALON_INFERENCE"
  }
  if (normalized === "OPERATOR" || normalized === "HUMAN") return "USER"
  if (normalized === "REFERENCE_STRATEGY" || normalized === "REFERENCES") return "REFERENCE"
  if (normalized === "DATA_CATALOG") return "CATALOG"
  if (normalized === "MARKET" || normalized === "MARKET_DATA") return "MARKET_PACKET"
  if (normalized === "DEFAULT" || normalized === "TUNABLE") return "TUNABLE_DEFAULT"
  return "TALON_INFERENCE"
}

function formatSectionValidationFeedback(
  issues: Array<{ field_path: string; message: string }>,
): string {
  return issues.map(issue => `- ${issue.field_path}: ${issue.message}`).join("\n")
}

function buildTalonSectionPrompt({
  basePrompt,
  spec,
  attempt,
  feedback,
}: {
  basePrompt: string
  spec: TalonSectionSpec
  attempt: number
  feedback: string | null
}): string {
  return [
    basePrompt,
    "",
    "Sectioned synthesis task:",
    `- Produce only the ${spec.label} section.`,
    "- Return one object with exactly one property: section_json.",
    "- section_json must be a parseable JSON string for the section VALUE itself, not the whole packet and not wrapped under its top-level key.",
    "- Do not include Markdown fences, commentary, or extra keys inside section_json.",
    "- Omit optional nullable fields when they do not apply; use null only when the field is nullable and its absence would be ambiguous.",
    `- Attempt: ${attempt} of ${TALON_SECTION_ATTEMPTS}.`,
    "",
    `Section key: ${spec.key}`,
    `Section shape: ${spec.shape}`,
    ...spec.guidance.map(line => `- ${line}`),
    spec.example ? `Example section_json value:\n${JSON.stringify(spec.example, null, 2)}` : "",
    feedback ? `\nPrevious validation errors to fix:\n${feedback}` : "",
  ].filter(Boolean).join("\n")
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return results
}

export async function createStrategyAuthoringPacketFromSynthesisPayload({
  scope,
  idea,
  questionnaire,
  revisedFrom = null,
  revisionIndex = null,
  ledgerConsumption,
  persist = false,
  packetId = `packet_${ulid()}`,
  now = new Date().toISOString(),
  catalog,
  modelExecution,
  rawPacketJson,
  prompt,
  payload,
}: CreateStrategyAuthoringPacketFromPayloadArgs): Promise<TalonPacketSynthesisResult> {
  if (idea.sleeve !== questionnaire.sleeve) {
    throw new Error(`Questionnaire sleeve ${questionnaire.sleeve} does not match idea sleeve ${idea.sleeve}.`)
  }
  const normalizedQuestionnaire = normalizeQuestionnaireDataInputs(questionnaire)
  const normalizedPayload = normalizeSynthesisPayloadForPacket(payload, normalizedQuestionnaire)

  const packet: StrategyAuthoringPacketV1 = {
    schema_version: STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION,
    packet_id: packetId,
    revised_from: revisedFrom,
    revision_index: revisionIndex,
    created_at: now,
    updated_at: now,
    status: "REVIEW",
    questionnaire: normalizedQuestionnaire,
    assumptions: normalizedPayload.assumptions,
    data_readiness: buildPacketDataReadiness({
      catalog,
      sleeve: normalizedQuestionnaire.sleeve,
      allowedDataInputs: normalizedQuestionnaire.allowed_data_inputs.value,
    }),
    era_benchmark_plan: normalizedPayload.era_benchmark_plan,
    strategy_spec: {
      ...normalizedPayload.strategy_spec,
      strategy_id: {
        ...normalizedPayload.strategy_spec.strategy_id,
        provenance: {
          ...normalizedPayload.strategy_spec.strategy_id.provenance,
          operator_confirmed: false,
        },
      },
    },
    sweep_bounds: normalizedPayload.sweep_bounds,
    evidence_thresholds: normalizedPayload.evidence_thresholds,
    trial_ledger_budget: normalizedPayload.trial_ledger_budget,
    multiple_comparisons_plan: normalizedPayload.multiple_comparisons_plan,
    adversarial_review: pendingAdversarialReview(now),
    portfolio_fit: normalizePortfolioFit(normalizedPayload.portfolio_fit, normalizedQuestionnaire),
    reproducibility_manifest: {
      synthesis_model: modelExecution,
      questionnaire_model: null,
      adversarial_model: null,
      data_catalog_version: catalog.catalog_version,
      market_packet_id: process.env.VIRES_MARKET_PACKET_ID ?? null,
      paper_index_version: process.env.VIRES_PAPER_INDEX_VERSION ?? null,
      strategy_registry_commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local",
      questionnaire_input_hash: computeQuestionnaireInputHash(normalizedQuestionnaire),
      prompt_version: PROMPT_VERSION,
      questionnaire_schema_version: QUESTIONNAIRE_SCHEMA_VERSION,
      packet_contract_schema_version: STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION,
      talon_orchestrator_version: TALON_ORCHESTRATOR_VERSION,
    },
    implementation_request: null,
  }

  const validationIssues = validateStrategyAuthoringPacket(packet)
  const errors = validationIssues.filter(issue => issue.severity === "error")
  if (errors.length > 0) {
    const error = new Error("Talon packet synthesis produced an invalid StrategyAuthoringPacketV1.")
    throw Object.assign(error, { status: 422, payload: { validation_issues: validationIssues } })
  }
  assertValidStrategyAuthoringPacket(packet)
  const compileResult = compileStrategyAuthoringPacket(packet, {
    compiledAt: now,
    ledgerConsumption,
  })
  const persisted = persist
    ? await persistStrategyAuthoringPacket({
        packet,
        scope,
        message: `research lab: synthesize strategy authoring packet ${packet.packet_id}`,
      })
    : null

  return {
    packet,
    compile_result: compileResult,
    validation_issues: validationIssues,
    raw_packet_json: rawPacketJson,
    prompt,
    persisted,
  }
}

function normalizeQuestionnaireDataInputs(
  questionnaire: StrategyAuthoringQuestionnaire,
): StrategyAuthoringQuestionnaire {
  const originalInputs = questionnaire.allowed_data_inputs.value
    .map(input => input.trim())
    .filter(Boolean)
  const normalizedInputs = [...new Set(originalInputs.map(canonicalDataInputId).filter(Boolean))]
  if (
    originalInputs.length === normalizedInputs.length &&
    originalInputs.every((input, index) => input === normalizedInputs[index])
  ) {
    return questionnaire
  }

  return {
    ...questionnaire,
    allowed_data_inputs: {
      ...questionnaire.allowed_data_inputs,
      value: normalizedInputs,
      provenance: {
        ...questionnaire.allowed_data_inputs.provenance,
        rationale: appendServerNormalizationNote(
          questionnaire.allowed_data_inputs.provenance.rationale,
          `Server canonicalized allowed_data_inputs from [${originalInputs.join(", ") || "none"}] to [${normalizedInputs.join(", ") || "none"}] using data catalog capability IDs.`,
        ),
      },
    },
  }
}

function normalizeSynthesisPayloadForPacket(
  payload: StrategyAuthoringSynthesisPayload,
  questionnaire: StrategyAuthoringQuestionnaire,
): StrategyAuthoringSynthesisPayload {
  const assumptions = [...payload.assumptions.items]
  const strategySpec = normalizeStrategySpecForQuestionnaire(payload.strategy_spec, questionnaire, assumptions)
  const sweepBounds = payload.sweep_bounds
  const eraCount = Math.max(1, payload.era_benchmark_plan.eras.length)
  const maxTotalVariants = Math.max(1, Math.round(sweepBounds.max_total_variants))
  const requiredBenchRuns = maxTotalVariants * eraCount
  const trialLedgerBudget = {
    ...payload.trial_ledger_budget,
    max_variants: Math.max(payload.trial_ledger_budget.max_variants, maxTotalVariants),
    max_eras: Math.max(payload.trial_ledger_budget.max_eras, eraCount),
    max_bench_runs: Math.max(payload.trial_ledger_budget.max_bench_runs, requiredBenchRuns),
  }
  if (
    trialLedgerBudget.max_variants !== payload.trial_ledger_budget.max_variants ||
    trialLedgerBudget.max_eras !== payload.trial_ledger_budget.max_eras ||
    trialLedgerBudget.max_bench_runs !== payload.trial_ledger_budget.max_bench_runs
  ) {
    trialLedgerBudget.rationale = appendServerNormalizationNote(
      trialLedgerBudget.rationale,
      `Server raised the trial-ledger budget to cover ${maxTotalVariants} variants across ${eraCount} eras after sectioned Talon synthesis.`,
    )
    assumptions.push(serverNormalizationAssumption(
      "trial_ledger_budget",
      "Sectioned Talon synthesis produced a sweep/era plan larger than the separately drafted trial budget; the server expanded the budget so validation and compiler accounting stay internally consistent.",
    ))
  }

  return {
    ...payload,
    assumptions: { items: assumptions },
    strategy_spec: strategySpec,
    trial_ledger_budget: trialLedgerBudget,
    multiple_comparisons_plan: {
      ...payload.multiple_comparisons_plan,
      effective_trials_estimate: Math.max(
        payload.multiple_comparisons_plan.effective_trials_estimate,
        maxTotalVariants,
      ),
    },
  }
}

function normalizeStrategySpecForQuestionnaire(
  strategySpec: StrategyAuthoringSynthesisPayload["strategy_spec"],
  questionnaire: StrategyAuthoringQuestionnaire,
  assumptions: StrategyAuthoringSynthesisPayload["assumptions"]["items"],
): StrategyAuthoringSynthesisPayload["strategy_spec"] {
  const normalizedSpec = { ...strategySpec }
  if (normalizedSpec.sleeve !== questionnaire.sleeve) {
    assumptions.push(serverNormalizationAssumption(
      "strategy_spec.sleeve",
      `Talon returned sleeve=${normalizedSpec.sleeve}; the server reset it to the operator-confirmed questionnaire sleeve ${questionnaire.sleeve}.`,
    ))
    normalizedSpec.sleeve = questionnaire.sleeve
  }

  const allowedInputs = questionnaire.allowed_data_inputs.value
    .map(input => input.trim())
    .filter(Boolean)
  if (allowedInputs.length === 0) return normalizedSpec

  const entryRules = normalizedSpec.entry_rules.value
  const normalizedConditions = entryRules.conditions.map(condition => {
    const normalizedDataInputId = normalizeEntryConditionDataInputId(condition.data_input_id, allowedInputs)
    if (normalizedDataInputId === condition.data_input_id) return condition
    assumptions.push(serverNormalizationAssumption(
      `strategy_spec.entry_rules.value.conditions.${condition.name}.data_input_id`,
      `Talon used data_input_id=${condition.data_input_id}, which is not in questionnaire.allowed_data_inputs; the server remapped it to ${normalizedDataInputId} and marked the condition as needing compiler mapping unless it was already unsupported.`,
    ))
    return {
      ...condition,
      data_input_id: normalizedDataInputId,
      compiler_support: condition.compiler_support === "SUPPORTED" ? "NEEDS_MAPPING" : condition.compiler_support,
    }
  })

  return {
    ...normalizedSpec,
    entry_rules: {
      ...normalizedSpec.entry_rules,
      value: {
        ...entryRules,
        conditions: normalizedConditions,
      },
    },
  }
}

function normalizeEntryConditionDataInputId(dataInputId: string, allowedInputs: string[]): string {
  if (allowedInputs.includes(dataInputId)) return dataInputId
  const normalized = dataInputId.trim().toLowerCase()
  const canonical = canonicalDataInputId(dataInputId)
  if (allowedInputs.includes(canonical)) return canonical
  const ohlcvFallback = allowedInputs.find(input => input.includes("ohlcv"))
  if (
    ohlcvFallback &&
    /ohlcv|price|volume|momentum|return|moving_average|rsi|volatility|mean_reversion/.test(normalized)
  ) {
    return ohlcvFallback
  }
  return allowedInputs[0]
}

function canonicalDataInputId(input: string): string {
  const trimmed = input.trim()
  return DATA_INPUT_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

function appendServerNormalizationNote(existing: string, note: string): string {
  const trimmed = existing.trim()
  return trimmed ? `${trimmed} Server normalization: ${note}` : `Server normalization: ${note}`
}

function serverNormalizationAssumption(
  fieldPath: string,
  assumption: string,
): StrategyAuthoringSynthesisPayload["assumptions"]["items"][number] {
  return {
    field_path: fieldPath,
    assumption,
    provenance: scaffoldProvenance("Server-normalized cross-section Talon output after schema-valid section synthesis."),
    risk_if_wrong: "MEDIUM",
    resolution_needed: true,
  }
}

function buildPacketDataReadiness({
  catalog,
  sleeve,
  allowedDataInputs,
}: {
  catalog: DataCapabilityCatalogV1
  sleeve: StrategyAuthoringQuestionnaire["sleeve"]
  allowedDataInputs: string[]
}): StrategyAuthoringDataReadiness {
  const capabilityById = new Map(catalog.capabilities.map(capability => [capability.capability_id, capability]))
  const uniqueInputs = [...new Set(allowedDataInputs.map(canonicalDataInputId).filter(Boolean))]
  const assessment = assessDataReadiness({
    catalog,
    sleeve,
    requirements: uniqueInputs.map(input => ({
      requested: input,
      core: true,
      matched_capability: input,
    })),
  })
  return {
    overall_status: assessment.verdict === "PASS"
      ? "READY"
      : assessment.verdict === "WARN"
        ? "PARTIAL"
        : "BLOCKED",
    items: assessment.requirements.map(requirement => {
      const capability = requirement.source ? capabilityById.get(requirement.source) : capabilityById.get(requirement.requested)
      return dataReadinessItemFromRequirement(requirement, capability ?? null)
    }),
  }
}

function dataReadinessItemFromRequirement(
  requirement: ReturnType<typeof assessDataReadiness>["requirements"][number],
  capability: DataCapabilityV1 | null,
): StrategyAuthoringDataReadiness["items"][number] {
  const available = requirement.status === "AVAILABLE"
  return {
    data_input_id: requirement.source ?? requirement.requested,
    catalog_entry_id: requirement.source,
    available,
    coverage_start: null,
    coverage_end: capability?.asof_coverage ?? null,
    gaps: available ? [] : [requirement.notes ?? `${requirement.requested} is ${requirement.status}.`],
    notes: requirement.notes ?? capability?.notes ?? "",
  }
}

function pendingAdversarialReview(now: string): StrategyAuthoringPacketV1["adversarial_review"] {
  return {
    status: "PENDING",
    reviewer_model_capabilities: {
      min_context_window_tokens: 64000,
      structured_output_required: true,
      reasoning_depth: "EXTENDED",
      notes: "Separate blind reviewer must run before approval or promotion.",
    },
    reviewer_model_actual: null,
    review_timestamp: null,
    required_categories: REQUIRED_ADVERSARIAL_CATEGORIES,
    checks: REQUIRED_ADVERSARIAL_CATEGORIES.map(category => pendingAdversarialCheck(category, now)),
    overall_notes: "Blind adversarial review has not run yet; placeholder rows keep category coverage explicit.",
    conditions_for_pass: ["Run a blind, different-family adversarial review before approval."],
  }
}

function pendingAdversarialCheck(category: AdversarialCheck["category"], now: string): AdversarialCheck {
  return {
    category,
    passed: false,
    finding: `PENDING as of ${now}; blind adversarial reviewer has not evaluated ${category}.`,
    severity: "INFO",
    remediation: "Run required adversarial review.",
  }
}

function normalizePortfolioFit(
  proposed: PortfolioFit | null | undefined,
  questionnaire: StrategyAuthoringQuestionnaire,
): PortfolioFit {
  if (proposed?.status === "ASSESSED") return proposed
  if (proposed?.status === "WAIVED" && proposed.marginal_value_notes?.trim()) return proposed
  return {
    status: "PENDING",
    deferred_until: "PAPER_PROMOTION",
    existing_strategies: [
      ...(proposed?.existing_strategies ?? []),
      ...(questionnaire.strategy_relationship.target_strategy_id
        ? [questionnaire.strategy_relationship.target_strategy_id]
        : []),
    ].filter((value, index, values) => value && values.indexOf(value) === index),
    correlation_assessment: proposed?.correlation_assessment ?? null,
    joint_drawdown_estimate: proposed?.joint_drawdown_estimate ?? null,
    sleeve_budget_impact: proposed?.sleeve_budget_impact ?? null,
    capital_capacity_notes: proposed?.capital_capacity_notes ?? "Portfolio-fit review is deferred until paper-promotion review.",
    marginal_value_notes: proposed?.marginal_value_notes ?? null,
  }
}

function buildPacketSynthesisPrompt({
  idea,
  questionnaire,
  catalog,
  lessons,
  referenceContext,
  failedPacketSummary,
  contextPacket,
  clarificationRequest,
  clarificationAnswers,
}: {
  idea: IdeaArtifact
  questionnaire: StrategyAuthoringQuestionnaire
  catalog: DataCapabilityCatalogV1
  lessons: string
  referenceContext: string
  failedPacketSummary: string
  contextPacket: StrategyAuthoringContextPacket
  clarificationRequest: ClarificationRequest
  clarificationAnswers: ClarificationAnswer[]
}): string {
  return [
    "You are Talon, Vires Capital's governed strategy-authoring agent.",
    "Create the research content for StrategyAuthoringPacketV1 from the operator questionnaire.",
    "",
    "Non-negotiable rules:",
    "- Do not invent data sources. Use only capability_id values present in the data catalog and allowed_data_inputs.",
    "- If a rule cannot be compiled from supported fields, set compiler_support to NEEDS_MAPPING instead of pretending it is supported.",
    "- Do not mark strategy_id operator_confirmed=true; the operator must confirm the slug later.",
    "- Do not include packet_id, timestamps, data_readiness, adversarial_review, reproducibility_manifest, implementation_request, or status. The server owns those.",
    "- Ask through assumptions/unknowns by setting resolution_needed=true when a missing answer materially changes the strategy.",
    "- Keep sweep bounds tight. The trial budget must be internally consistent.",
    "- Respect post-mortem lessons from failed packets in the same edge family.",
    "- Use clarification answers as operator-confirmed context. If the operator accepted a default, keep that provenance visible as a tunable default.",
    "- If a clarification was marked unknown and the blocking policy allows it, carry it as an assumption rather than inventing a hidden fact.",
    "- Counts, days, position limits, variants, and trial budgets must be positive integers. Percentages, costs, multipliers, and thresholds must be non-negative numbers unless the field is nullable.",
    "- Omit optional nullable fields when they do not apply; do not spoof values just to fill blanks.",
    "",
    "The orchestrator will request one section at a time. The final packet payload has these top-level keys:",
    "assumptions, era_benchmark_plan, strategy_spec, sweep_bounds, evidence_thresholds, trial_ledger_budget, multiple_comparisons_plan, portfolio_fit.",
    "",
    "Required output shape summary:",
    "- Every ProvenanceWrapped field is { value, provenance }, where provenance is { source, confidence, rationale, source_artifact_id, operator_confirmed }.",
    "- assumptions.items[]: { field_path, assumption, provenance, risk_if_wrong: LOW|MEDIUM|HIGH, resolution_needed }.",
    "- era_benchmark_plan: { benchmark_id, benchmark_rationale, eras[], era_weighting_method }; each era has { era_id, label, start_date, end_date, regime_tags, rationale }.",
    "- strategy_spec: { strategy_family, strategy_name, strategy_id, sleeve, universe, entry_rules, exit_rules, position_sizing, risk_limits, execution_constraints }.",
    "- universe.value: { type: FIXED|DYNAMIC, symbols?, screen_criteria?, max_symbols, rebalance_frequency? }.",
    "- entry_rules.value.conditions[]: { name, parameter, operator, threshold, data_input_id, compiler_support }; data_input_id must be in allowed_data_inputs.",
    "- exit_rules.value: { stop_loss_pct?, target_pct?, time_stop_days?, trailing_stop?, custom_exits? }.",
    "- execution_constraints.value: { order_types, no_trade_zones?, slippage_assumption_bps, commission_model, commission_assumption_value }.",
    "- evidence_thresholds: { backtest, paper, live }; paper/live require min_calendar_days, min_closed_trades, min_active_exposure_days, max_drawdown_pct, min_win_rate_pct, min_profit_factor, capital_tier_modifier.",
    "- trial_ledger_budget must satisfy sweep_bounds.max_total_variants <= max_variants and max_total_variants * eras.length <= max_bench_runs.",
    "",
    `Idea:\n${JSON.stringify({
      idea_id: idea.idea_id,
      title: idea.title,
      thesis: idea.thesis,
      sleeve: idea.sleeve,
      tags: idea.tags ?? [],
      reference_strategies: idea.reference_strategies ?? [],
      created_by: idea.created_by,
    }, null, 2)}`,
    "",
    `Questionnaire:\n${JSON.stringify(questionnaire, null, 2)}`,
    "",
    `Clarification request:\n${JSON.stringify(clarificationRequest, null, 2)}`,
    "",
    `Clarification answers:\n${JSON.stringify(clarificationAnswers, null, 2)}`,
    "",
    `Strategy authoring context packet:\n${JSON.stringify(contextPacket, null, 2)}`,
    "",
    `Available data catalog:\n${JSON.stringify(catalog.capabilities.map(capability => ({
      capability_id: capability.capability_id,
      display_name: capability.display_name,
      category: capability.category,
      status: capability.status,
      sleeves: capability.sleeves,
      asof_coverage: capability.asof_coverage ?? null,
      notes: capability.notes ?? null,
    })), null, 2)}`,
    "",
    lessons || "Durable Talon lessons: none.",
    "",
    referenceContext,
    "",
    failedPacketSummary,
  ].join("\n")
}

async function loadFailedPacketSummary(scope: ScopeTriple, edgeFamily: StrategyAuthoringQuestionnaire["edge_family"]): Promise<string> {
  const packets = await loadStrategyAuthoringPackets(scope)
  const matching = packets.filter(packet => packet.questionnaire.edge_family === edgeFamily)
  const rows = (await Promise.all(
    matching.map(packet => loadTrialLedgerEntriesForPacket(packet.packet_id, scope)),
  )).flat()
  const failed = rows
    .filter(row => row.failure_reason?.trim())
    .slice(-FAILED_PACKET_CONTEXT_LIMIT)
    .map(row => ({
      packet_id: row.packet_id,
      strategy_id: row.strategy_id,
      variant_index: row.variant_index,
      era_id: row.era_id,
      failure_reason: row.failure_reason,
      questionnaire_mapping: row.questionnaire_mapping ?? [],
    }))
  return failed.length
    ? `Recent failed packets in edge_family=${edgeFamily}:\n${JSON.stringify(failed, null, 2)}`
    : `Recent failed packets in edge_family=${edgeFamily}: none found.`
}

function responseIdFromResult(result: unknown): string | null {
  const raw = result as { response?: { id?: unknown } }
  return typeof raw.response?.id === "string" ? raw.response.id : null
}
