import { anthropic } from "@ai-sdk/anthropic"
import { generateText, Output } from "ai"
import { z } from "zod"

import type {
  AdversarialCheck,
  IdeaArtifact,
  ModelExecution,
  PacketCompileResultV1,
  PortfolioFit,
  ScopeTriple,
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

export async function createStrategyAuthoringPacketWithTalon({
  scope,
  idea,
  questionnaire,
  operatorId = "jacob",
  revisedFrom = null,
  revisionIndex = null,
  ledgerConsumption,
  persist = true,
}: CreateStrategyAuthoringPacketWithTalonArgs): Promise<TalonPacketSynthesisResult> {
  if (idea.sleeve !== questionnaire.sleeve) {
    throw new Error(`Questionnaire sleeve ${questionnaire.sleeve} does not match idea sleeve ${idea.sleeve}.`)
  }

  const [catalog, lessons, referenceContext, failedPacketSummary] = await Promise.all([
    loadDataCapabilityCatalog(),
    formatTalonLessonsForPrompt(),
    formatReferenceStrategiesForPrompt(idea.reference_strategies),
    loadFailedPacketSummary(scope, questionnaire.edge_family),
  ])

  const model = process.env.TALON_PACKET_SYNTHESIS_MODEL ?? DEFAULT_MODEL
  const prompt = buildPacketSynthesisPrompt({
    idea,
    questionnaire,
    catalog,
    lessons,
    referenceContext,
    failedPacketSummary,
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
    catalog,
    modelExecution,
    rawPacketJson: staged.rawPacketJson,
    prompt,
    payload: staged.payload,
  })
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

  const packet: StrategyAuthoringPacketV1 = {
    schema_version: STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION,
    packet_id: packetId,
    revised_from: revisedFrom,
    revision_index: revisionIndex,
    created_at: now,
    updated_at: now,
    status: "REVIEW",
    questionnaire,
    assumptions: payload.assumptions,
    data_readiness: buildPacketDataReadiness({
      catalog,
      sleeve: questionnaire.sleeve,
      allowedDataInputs: questionnaire.allowed_data_inputs.value,
    }),
    era_benchmark_plan: payload.era_benchmark_plan,
    strategy_spec: {
      ...payload.strategy_spec,
      strategy_id: {
        ...payload.strategy_spec.strategy_id,
        provenance: {
          ...payload.strategy_spec.strategy_id.provenance,
          operator_confirmed: false,
        },
      },
    },
    sweep_bounds: payload.sweep_bounds,
    evidence_thresholds: payload.evidence_thresholds,
    trial_ledger_budget: payload.trial_ledger_budget,
    multiple_comparisons_plan: payload.multiple_comparisons_plan,
    adversarial_review: pendingAdversarialReview(now),
    portfolio_fit: normalizePortfolioFit(payload.portfolio_fit, questionnaire),
    reproducibility_manifest: {
      synthesis_model: modelExecution,
      questionnaire_model: null,
      adversarial_model: null,
      data_catalog_version: catalog.catalog_version,
      market_packet_id: process.env.VIRES_MARKET_PACKET_ID ?? null,
      paper_index_version: process.env.VIRES_PAPER_INDEX_VERSION ?? null,
      strategy_registry_commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local",
      questionnaire_input_hash: computeQuestionnaireInputHash(questionnaire),
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
  const uniqueInputs = [...new Set(allowedDataInputs.map(input => input.trim()).filter(Boolean))]
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
  if (proposed?.status === "ASSESSED" || proposed?.status === "WAIVED") return proposed
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
}: {
  idea: IdeaArtifact
  questionnaire: StrategyAuthoringQuestionnaire
  catalog: DataCapabilityCatalogV1
  lessons: string
  referenceContext: string
  failedPacketSummary: string
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
