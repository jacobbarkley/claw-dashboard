import type {
  AdversarialCheck,
  AuthoringProvenance,
  FieldPresentation,
  ModelExecution,
  StrategyAuthoringPacketV1,
  StrategyAuthoringQuestionnaire,
} from "./research-lab-contracts"
import {
  computeQuestionnaireInputHash,
  REQUIRED_ADVERSARIAL_CATEGORIES,
  STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION,
} from "./research-lab-strategy-authoring"

const PACKET_ID = "packet_01KQX5M8M2ABCDEFGHJKMNPQRS"
const CREATED_AT = "2026-05-03T12:00:00.000Z"

export function createRamReferenceStrategyAuthoringPacketFixture(): StrategyAuthoringPacketV1 {
  const questionnaire = createQuestionnaireFixture()

  return {
    schema_version: STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION,
    packet_id: PACKET_ID,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    status: "APPROVED",
    questionnaire,
    assumptions: {
      items: [
        {
          field_path: "strategy_spec.entry_rules",
          assumption: "Momentum ranking remains useful when guarded by regime and benchmark filters.",
          provenance: provenance("REFERENCE", "HIGH", "Lifted from RAM reference behavior and accepted by the operator.", true),
          risk_if_wrong: "HIGH",
          resolution_needed: false,
        },
      ],
    },
    data_readiness: {
      overall_status: "READY",
      items: [
        {
          data_input_id: "alpaca_equity_daily_ohlcv",
          catalog_entry_id: "catalog.alpaca.equity_daily_ohlcv",
          available: true,
          coverage_start: "2016-01-01",
          coverage_end: "2026-05-01",
          gaps: [],
          notes: "Daily adjusted OHLCV is available for the reference equity universe.",
        },
      ],
    },
    era_benchmark_plan: {
      benchmark_id: "SPY",
      benchmark_rationale: "SPY is the broad equity benchmark for a long-only stocks sleeve.",
      eras: [
        {
          era_id: "recent_cycle_2022_2026",
          label: "Recent rate-cycle tape",
          start_date: "2022-01-01",
          end_date: "2026-03-31",
          regime_tags: ["RISING_RATES", "VOLATILITY", "AI_LEADERSHIP"],
          rationale: "Matches the strongest known RAM reference window without adding more same-span tuning.",
        },
        {
          era_id: "forward_confirmation_stub",
          label: "Forward confirmation placeholder",
          start_date: "2026-04-01",
          end_date: "2026-05-01",
          regime_tags: ["FORWARD_CONFIRMATION"],
          rationale: "Reserved for fresh confirmation rather than repeated optimization on the same tape.",
        },
      ],
      era_weighting_method: wrapped("equal era weighting", "TALON_INFERENCE", "MEDIUM", "Defaulted to equal weighting until a portfolio-fit review assigns regime priorities.", true),
    },
    strategy_spec: {
      strategy_family: "MOMENTUM",
      strategy_name: "RAM reference authoring fixture",
      strategy_id: wrapped("ram_reference_authoring_fixture", "USER", "HIGH", "Operator-confirmed fixture slug for contract validation.", true),
      sleeve: "STOCKS",
      universe: wrapped(
        {
          type: "FIXED",
          symbols: ["AVGO", "NVDA", "AAPL", "LLY", "META", "COST"],
          screen_criteria: null,
          max_symbols: 6,
          rebalance_frequency: "monthly",
        },
        "REFERENCE",
        "HIGH",
        "Seeded from the RAM reference sleeve shape.",
        true,
      ),
      entry_rules: wrapped(
        {
          description: "Rank eligible symbols by medium-term momentum after regime and benchmark filters pass.",
          conditions: [
            {
              name: "benchmark_regime_filter",
              parameter: "spy_200d_trend",
              operator: "gte",
              threshold: 0,
              data_input_id: "alpaca_equity_daily_ohlcv",
              compiler_support: "SUPPORTED",
            },
            {
              name: "relative_momentum_rank",
              parameter: "six_month_total_return_rank",
              operator: "lte",
              threshold: 6,
              data_input_id: "alpaca_equity_daily_ohlcv",
              compiler_support: "SUPPORTED",
            },
          ],
          confirmation_required: true,
          confirmation_description: "Require both market regime and relative momentum confirmation before opening positions.",
        },
        "REFERENCE",
        "HIGH",
        "Represents the known RAM-style compile path in a small fixture packet.",
        true,
      ),
      exit_rules: wrapped(
        {
          stop_loss_pct: 5,
          target_pct: 15,
          time_stop_days: 10,
          trailing_stop: { enabled: false, trail_pct: null, activation_pct: null },
          custom_exits: [
            {
              name: "benchmark_flip",
              description: "Exit when the benchmark regime filter fails.",
              condition: "spy_200d_trend < 0",
              compiler_support: "SUPPORTED",
            },
          ],
        },
        "REFERENCE",
        "HIGH",
        "Uses the frozen RAM winner's stop/target/hold frame as a reference-level fixture.",
        true,
      ),
      position_sizing: wrapped(
        {
          method: "EQUAL_WEIGHT",
          base_size_pct: null,
          max_positions: 6,
          risk_per_trade_pct: null,
          custom_description: null,
        },
        "REFERENCE",
        "HIGH",
        "Equal-weight sleeve sizing matches the RAM reference family.",
        true,
      ),
      risk_limits: wrapped(
        {
          max_portfolio_drawdown_pct: 12,
          max_single_position_loss_pct: 5,
          max_correlated_exposure_pct: 80,
          max_sector_concentration_pct: 70,
          circuit_breaker_rules: "Pause new entries when benchmark regime filter fails.",
        },
        "TUNABLE_DEFAULT",
        "MEDIUM",
        "Defaulted from a conservative RAM-tier stocks sleeve profile.",
        true,
      ),
      execution_constraints: wrapped(
        {
          order_types: ["market", "limit"],
          no_trade_zones: "No entries during unresolved data readiness or market-halt incidents.",
          slippage_assumption_bps: 5,
          commission_model: "FLAT",
          commission_assumption_value: 0,
        },
        "CATALOG",
        "HIGH",
        "Equity paper broker uses commission-free stock trading; slippage remains explicit.",
        true,
      ),
    },
    sweep_bounds: {
      parameters: [
        {
          field_path: "strategy_spec.exit_rules.value.stop_loss_pct",
          min: 4,
          max: 6,
          step: 1,
          values: null,
          provenance: provenance("REFERENCE", "HIGH", "Narrow RAM-style stop sweep around the frozen reference value.", true),
        },
        {
          field_path: "strategy_spec.exit_rules.value.target_pct",
          min: 12,
          max: 16,
          step: 2,
          values: null,
          provenance: provenance("REFERENCE", "HIGH", "Narrow RAM-style target sweep around the frozen reference value.", true),
        },
      ],
      max_total_variants: 3,
      sweep_method: "GRID",
    },
    evidence_thresholds: {
      backtest: {
        min_trades: 30,
        min_win_rate_pct: 55,
        min_profit_factor: 1.2,
        min_sharpe: 1.5,
        max_drawdown_pct: 12,
        min_profitable_fold_pct: 60,
        additional: { min_excess_return_pct: 5 },
      },
      paper: {
        min_calendar_days: 30,
        min_closed_trades: 10,
        min_active_exposure_days: 15,
        max_drawdown_pct: 8,
        min_win_rate_pct: 52,
        min_profit_factor: 1.15,
        capital_tier_modifier: {
          tier: "SMALL",
          calendar_days_multiplier: 1,
          closed_trades_multiplier: 1,
          drawdown_tightening_pct: null,
        },
      },
      live: {
        min_calendar_days: 90,
        min_closed_trades: 25,
        min_active_exposure_days: 45,
        max_drawdown_pct: 6,
        min_win_rate_pct: 52,
        min_profit_factor: 1.2,
        capital_tier_modifier: {
          tier: "SMALL",
          calendar_days_multiplier: 1,
          closed_trades_multiplier: 1,
          drawdown_tightening_pct: 1,
        },
        max_single_loss_usd: 250,
      },
    },
    trial_ledger_budget: {
      max_variants: 3,
      max_eras: 2,
      max_bench_runs: 6,
      estimated_compute_cost_usd: null,
      rationale: "Fixture budget is intentionally tight: three variants across two eras.",
    },
    multiple_comparisons_plan: {
      method: "NONE_V1_PLACEHOLDER",
      effective_trials_estimate: 3,
      adjusted_significance_level: null,
      notes: "Placeholder for v1 fixture only; compiler still enforces variant/run budget.",
      full_implementation_target: "FDR_BH",
    },
    adversarial_review: {
      status: "PASS",
      reviewer_model_capabilities: {
        min_context_window_tokens: 64000,
        structured_output_required: true,
        reasoning_depth: "EXTENDED",
        notes: "Different-family blind reviewer required for real packets.",
      },
      reviewer_model_actual: "fixture-blind-reviewer",
      review_timestamp: CREATED_AT,
      required_categories: REQUIRED_ADVERSARIAL_CATEGORIES,
      checks: REQUIRED_ADVERSARIAL_CATEGORIES.map(category => adversarialPass(category)),
      overall_notes: "Fixture passes because all required review categories are explicitly represented.",
      conditions_for_pass: [],
    },
    portfolio_fit: {
      status: "ASSESSED",
      deferred_until: null,
      existing_strategies: ["regime_aware_momentum::stop_5_target_15"],
      correlation_assessment: {
        method: "reference-family self-check",
        max_acceptable_correlation: 0.85,
        estimated_correlation: 0.75,
        notes: "Fixture is intentionally RAM-like and should be treated as a reference, not a new diversifier.",
      },
      joint_drawdown_estimate: {
        method: "placeholder",
        max_joint_drawdown_pct: 12,
        notes: "Full portfolio rollup remains compiler/campaign-layer work.",
      },
      sleeve_budget_impact: {
        sleeve: "STOCKS",
        current_sleeve_allocation_pct: 40,
        proposed_addition_pct: 5,
        resulting_sleeve_allocation_pct: 45,
        within_limits: true,
      },
      capital_capacity_notes: "Small equity sleeve capacity is realistic for six liquid large-cap names.",
      marginal_value_notes: "Reference fixture tests contract behavior, not a real promotion candidate.",
    },
    reproducibility_manifest: {
      synthesis_model: modelExecutionFixture("synthesis"),
      questionnaire_model: modelExecutionFixture("questionnaire"),
      adversarial_model: modelExecutionFixture("adversarial"),
      data_catalog_version: "fixture-data-catalog-2026-05-03",
      market_packet_id: "market_packet_fixture_2026_05_03",
      paper_index_version: "fixture-paper-index-2026-05-03",
      strategy_registry_commit: "fixture-registry-commit",
      questionnaire_input_hash: computeQuestionnaireInputHash(questionnaire),
      prompt_version: "strategy_authoring_packet.fixture.v1",
      questionnaire_schema_version: "research_lab.strategy_authoring_questionnaire.v1",
      packet_contract_schema_version: STRATEGY_AUTHORING_PACKET_SCHEMA_VERSION,
      talon_orchestrator_version: "fixture",
    },
    implementation_request: {
      requested_at: CREATED_AT,
      requested_by: "fixture",
      packet_id: PACKET_ID,
      priority: "MEDIUM",
      implementation_notes: "Compiler fixture should produce a deterministic bench config preview only.",
      bench_job_config: null,
    },
  }
}

export const RAM_REFERENCE_STRATEGY_AUTHORING_PACKET_FIXTURE =
  createRamReferenceStrategyAuthoringPacketFixture()

function createQuestionnaireFixture(): StrategyAuthoringQuestionnaire {
  return {
    render_mode: "ADVANCED",
    pattern_description: "Study whether a six-stock RAM-style sleeve can keep momentum exposure while surviving regime flips.",
    sleeve: "STOCKS",
    trade_horizon: "DAYS",
    capital_tier: "SMALL",
    capital_custom_usd: null,
    strategy_relationship: {
      relationship: "ALONGSIDE",
      target_strategy_id: "regime_aware_momentum::stop_5_target_15",
      evidence_bar_modifier: "STANDARD",
    },
    kill_criteria_user: "Give up if it cannot beat SPY with acceptable drawdown across the chosen eras.",
    edge_family: "MOMENTUM",
    prior_work_refs: ["regime_aware_momentum::stop_5_target_15"],
    changes_from_refs: "Use this as a high-integrity reference fixture rather than a fresh optimized strategy.",
    universe_shape: "FIXED_LIST",
    universe_fixed_list: ["AVGO", "NVDA", "AAPL", "LLY", "META", "COST"],
    regime_expectation: "MOST_CONDITIONS",
    universe_size_band: wrapped("3-6", "USER", "HIGH", "Operator selected a six-stock sleeve size.", true),
    allowed_data_inputs: wrapped(["alpaca_equity_daily_ohlcv"], "CATALOG", "HIGH", "Fixture only uses catalog-backed equity daily bars.", true),
    entry_confirmation: wrapped("regime filter plus relative momentum rank", "REFERENCE", "HIGH", "Derived from the RAM reference packet.", true),
    exit_logic: wrapped("5% stop, 15% target, 10-day hold, benchmark flip exit", "REFERENCE", "HIGH", "Derived from the RAM reference packet.", true),
    risk_profile: wrapped("balanced", "USER", "HIGH", "Operator accepted a balanced reference risk profile.", true),
    benchmark: wrapped("SPY", "USER", "HIGH", "Operator selected the broad equity benchmark.", true),
    era_validation_strategy: wrapped("multi-era", "USER", "HIGH", "Operator wants at least one reference era and one forward confirmation era.", true),
    era_weighting: wrapped("equal", "USER", "HIGH", "Operator accepted equal era treatment for the fixture.", true),
    historical_window: wrapped(
      {
        start_date: "2022-01-01",
        end_date: "2026-05-01",
        rationale: "Covers the known RAM window plus a small forward-confirmation stub.",
        talon_tradeoff_notes: "This fixture must not justify additional same-span tuning.",
      },
      "USER",
      "HIGH",
      "Operator chose the validation window for fixture reproducibility.",
      true,
    ),
    promotion_bar: wrapped("RAM-tier reference", "USER", "HIGH", "Fixture models a high-tier strategy bar.", true),
    talon_exclusions: wrapped("Do not invent unavailable data or assume live readiness from fixture values.", "USER", "HIGH", "Explicit no-go zone for Talon inference.", true),
    field_presentations: fieldPresentations("ACCEPTED"),
  }
}

function adversarialPass(category: AdversarialCheck["category"]): AdversarialCheck {
  return {
    category,
    passed: true,
    finding: `Fixture explicitly covers ${category}.`,
    severity: "INFO",
    remediation: null,
  }
}

function wrapped<T>(
  value: T,
  source: AuthoringProvenance["source"],
  confidence: AuthoringProvenance["confidence"],
  rationale: string,
  operatorConfirmed: boolean,
) {
  return {
    value,
    provenance: provenance(source, confidence, rationale, operatorConfirmed),
  }
}

function provenance(
  source: AuthoringProvenance["source"],
  confidence: AuthoringProvenance["confidence"],
  rationale: string,
  operatorConfirmed: boolean,
): AuthoringProvenance {
  return {
    source,
    confidence,
    rationale,
    source_artifact_id: null,
    operator_confirmed: operatorConfirmed,
  }
}

function fieldPresentations(presentation: FieldPresentation): Record<string, FieldPresentation> {
  return {
    universe_size_band: presentation,
    allowed_data_inputs: presentation,
    entry_confirmation: presentation,
    exit_logic: presentation,
    risk_profile: presentation,
    benchmark: presentation,
    era_validation_strategy: presentation,
    era_weighting: presentation,
    historical_window: presentation,
    promotion_bar: presentation,
    talon_exclusions: presentation,
  }
}

function modelExecutionFixture(stage: string): ModelExecution {
  return {
    required_capabilities: {
      min_context_window_tokens: 64000,
      structured_output_required: true,
      reasoning_depth: stage === "questionnaire" ? "STANDARD" : "EXTENDED",
      notes: "Fixture records capabilities; real model IDs are runtime values.",
    },
    actual_provider: "fixture",
    actual_model_id: `${stage}-capability-routed-model`,
    actual_response_id: null,
    temperature: 0,
    seed: 1,
    max_tokens: 4096,
    timestamp: CREATED_AT,
  }
}
