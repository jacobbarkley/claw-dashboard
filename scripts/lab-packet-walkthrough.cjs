#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

require("./register-ts.cjs")

const {
  createStrategyAuthoringPacketFromSynthesisPayload,
  parseStrategyAuthoringQuestionnaire,
  parseStrategyAuthoringSynthesisObject,
} = require("../lib/research-lab-strategy-authoring-orchestration.server")
const { PHASE_1_DEFAULT_SCOPE } = require("../lib/research-lab-contracts")

const DEFAULT_IDEA_ID = "idea_01KQRJ889RV37QZPEAGGV37QZP"
const NOW = "2026-05-04T12:00:00.000Z"
const PACKET_ID = "packet_01KQY0C8M2ABCDEFGHJKMNPQRS"

async function main() {
  const { mode, options } = parseArgs(process.argv.slice(2))
  if (mode === "help") {
    printHelp()
    return
  }
  if (mode === "live") {
    await runLiveWalkthrough(options)
    return
  }
  await runMockWalkthrough(options)
}

function parseArgs(argv) {
  let mode = "mock"
  const options = {
    baseUrl: "http://localhost:3000",
    ideaId: DEFAULT_IDEA_ID,
    sleeve: null,
    persist: false,
    json: false,
    scope: { ...PHASE_1_DEFAULT_SCOPE },
  }

  const args = [...argv]
  if (args[0] && !args[0].startsWith("-")) mode = args.shift()
  if (mode === "--help" || mode === "-h") mode = "help"

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const [key, inlineValue] = arg.split("=", 2)
    const readValue = () => {
      if (inlineValue != null) return inlineValue
      index += 1
      if (index >= args.length) throw new Error(`${arg} requires a value`)
      return args[index]
    }

    if (key === "--help" || key === "-h") mode = "help"
    else if (key === "--base-url") options.baseUrl = trimTrailingSlash(readValue())
    else if (key === "--idea" || key === "--idea-id") options.ideaId = readValue()
    else if (key === "--sleeve") options.sleeve = normalizeSleeve(readValue())
    else if (key === "--persist") options.persist = true
    else if (key === "--dry-run") options.persist = false
    else if (key === "--json") options.json = true
    else if (key === "--user") options.scope.user_id = readValue()
    else if (key === "--account") options.scope.account_id = readValue()
    else if (key === "--strategy-group") options.scope.strategy_group_id = readValue()
    else throw new Error(`Unknown option: ${arg}`)
  }

  if (!["mock", "live", "help"].includes(mode)) {
    throw new Error(`Unknown mode: ${mode}`)
  }

  return { mode, options }
}

async function runMockWalkthrough(options) {
  const scenario = createMockScenario()
  const questionnaire = parseStrategyAuthoringQuestionnaire(scenario.questionnaire)
  const payload = parseStrategyAuthoringSynthesisObject(scenario.payload)

  const result = await createStrategyAuthoringPacketFromSynthesisPayload({
    scope: scenario.scope,
    idea: scenario.idea,
    questionnaire,
    operatorId: "walkthrough",
    persist: false,
    packetId: PACKET_ID,
    now: NOW,
    catalog: scenario.catalog,
    modelExecution: scenario.modelExecution,
    rawPacketJson: JSON.stringify(payload, null, 2),
    prompt: "offline walkthrough fixture",
    payload,
  })

  const packet = result.packet
  const checks = [
    {
      label: "packet validates without fatal StrategyAuthoringPacketV1 errors",
      ok: result.validation_issues.every(issue => issue.severity !== "error"),
    },
    {
      label: "strategy sleeve was reconciled to the questionnaire",
      ok: packet.strategy_spec.sleeve === questionnaire.sleeve,
    },
    {
      label: "entry data source was remapped to an allowed catalog input",
      ok: packet.strategy_spec.entry_rules.value.conditions.every(condition =>
        questionnaire.allowed_data_inputs.value.includes(condition.data_input_id),
      ),
    },
    {
      label: "trial budget covers variants x eras",
      ok: packet.trial_ledger_budget.max_bench_runs >=
        packet.sweep_bounds.max_total_variants * packet.era_benchmark_plan.eras.length,
    },
    {
      label: "waived portfolio fit without notes became an explicit pending review",
      ok: packet.portfolio_fit.status === "PENDING" &&
        packet.portfolio_fit.deferred_until === "PAPER_PROMOTION",
    },
  ]

  const summary = packetSummary(result, checks)
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    printSummary("offline mock packet walkthrough", summary)
  }

  if (checks.some(check => !check.ok)) {
    process.exitCode = 1
  }
}

async function runLiveWalkthrough(options) {
  const sleeve = options.sleeve ?? "STOCKS"
  const questionnaire = createQuestionnaire({
    sleeve,
    allowedDataInputs: defaultAllowedDataInputs(sleeve),
  })
  const bodyBase = {
    idea_id: options.ideaId,
    scope: options.scope,
    questionnaire,
  }

  const clarification = await postJson(
    `${options.baseUrl}/api/research/strategy-authoring/packets/clarify`,
    bodyBase,
  )
  let clarificationRequest = clarification.clarification_request ?? null
  let clarificationAnswers = []

  if (clarificationRequest?.status === "NEEDS_CLARIFICATION") {
    clarificationAnswers = buildClarificationAnswers(clarificationRequest)
    const blocked = unresolvedBlockingQuestions(clarificationRequest, clarificationAnswers)
    if (blocked.length > 0) {
      throw new Error([
        "Live walkthrough stopped because Talon asked blocking questions without safe defaults.",
        ...blocked.map(question => `- ${question.id}: ${question.question}`),
      ].join("\n"))
    }

    const clarified = await postJson(
      `${options.baseUrl}/api/research/strategy-authoring/packets/clarify`,
      { ...bodyBase, clarification_answers: clarificationAnswers },
    )
    clarificationRequest = clarified.clarification_request ?? clarificationRequest
  }

  const packetResponse = await postJson(
    `${options.baseUrl}/api/research/strategy-authoring/packets`,
    {
      ...bodyBase,
      clarification_request: clarificationRequest,
      clarification_answers: clarificationAnswers,
      dry_run: !options.persist,
    },
  )

  const result = {
    packet: packetResponse.packet,
    compile_result: packetResponse.compile_result,
    validation_issues: packetResponse.validation_issues ?? [],
    persisted: packetResponse.persisted ?? null,
  }
  const checks = [
    {
      label: "packet route returned ok=true",
      ok: packetResponse.ok === true,
    },
    {
      label: "packet validates without fatal StrategyAuthoringPacketV1 errors",
      ok: result.validation_issues.every(issue => issue.severity !== "error"),
    },
    {
      label: options.persist ? "packet persisted" : "dry run avoided persistence",
      ok: options.persist ? result.persisted != null : result.persisted == null,
    },
  ]
  const summary = {
    ...packetSummary(result, checks),
    mode: "live",
    base_url: options.baseUrl,
    idea_id: options.ideaId,
    persisted: result.persisted,
    clarification: {
      status: clarificationRequest?.status ?? null,
      answers_sent: clarificationAnswers.length,
    },
  }

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    printSummary("live packet walkthrough", summary)
  }

  if (checks.some(check => !check.ok)) {
    process.exitCode = 1
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await readJsonResponse(response)
  if (!response.ok) {
    const validationIssues = extractValidationIssues(payload)
    const lines = [
      `POST ${url} failed with ${response.status}`,
      payload?.error ? `error: ${payload.error}` : null,
      validationIssues.length ? "validation issues:" : null,
      ...validationIssues.map(formatIssue),
      payload?.debug ? `debug: ${JSON.stringify(payload.debug)}` : null,
    ].filter(Boolean)
    const error = new Error(lines.join("\n"))
    error.payload = payload
    throw error
  }
  return payload
}

async function readJsonResponse(response) {
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

function buildClarificationAnswers(request) {
  return (request.questions ?? []).flatMap(question => {
    if (question.proposed_default) {
      return [{
        question_id: question.id,
        action: "ACCEPT_DEFAULT",
        value: question.proposed_default.value,
        rationale: "Walkthrough accepted Talon's proposed default.",
      }]
    }
    if (question.allow_unknown && question.blocking_policy !== "BLOCKS_SYNTHESIS") {
      return [{
        question_id: question.id,
        action: "MARK_UNKNOWN",
        rationale: "Walkthrough carried this as an explicit unknown.",
      }]
    }
    return []
  })
}

function unresolvedBlockingQuestions(request, answers) {
  const answered = new Set(answers.map(answer => answer.question_id))
  return (request.questions ?? []).filter(question =>
    question.blocking_policy === "BLOCKS_SYNTHESIS" && !answered.has(question.id),
  )
}

function packetSummary(result, checks) {
  const packet = result.packet
  const compileResult = result.compile_result
  const conditions = packet.strategy_spec.entry_rules.value.conditions
  return {
    ok: checks.every(check => check.ok),
    checks,
    packet_id: packet.packet_id,
    status: packet.status,
    sleeve: packet.strategy_spec.sleeve,
    allowed_data_inputs: packet.questionnaire.allowed_data_inputs.value,
    entry_data_inputs: conditions.map(condition => ({
      name: condition.name,
      data_input_id: condition.data_input_id,
      compiler_support: condition.compiler_support ?? null,
    })),
    trial_budget: packet.trial_ledger_budget,
    sweep_max_total_variants: packet.sweep_bounds.max_total_variants,
    era_count: packet.era_benchmark_plan.eras.length,
    portfolio_fit: packet.portfolio_fit,
    normalization_assumptions: packet.assumptions.items.filter(item =>
      item.provenance?.rationale?.includes("Server-normalized"),
    ),
    validation_issues: result.validation_issues,
    compile_status: compileResult?.compile_status ?? null,
    compile_issues: compileResult?.issues ?? [],
  }
}

function printSummary(title, summary) {
  console.log(`\n${title}`)
  console.log("=".repeat(title.length))
  for (const check of summary.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}`)
  }
  console.log("")
  console.log(`packet: ${summary.packet_id}`)
  console.log(`status: ${summary.status}`)
  console.log(`sleeve: ${summary.sleeve}`)
  console.log(`allowed data: ${summary.allowed_data_inputs.join(", ")}`)
  console.log(`entry data: ${summary.entry_data_inputs.map(input => `${input.name}:${input.data_input_id}`).join(", ")}`)
  console.log(`trial budget: ${summary.trial_budget.max_variants} variants, ${summary.trial_budget.max_eras} eras, ${summary.trial_budget.max_bench_runs} bench runs`)
  console.log(`portfolio fit: ${summary.portfolio_fit.status} (${summary.portfolio_fit.deferred_until ?? "no deadline"})`)
  console.log(`compiler preview: ${summary.compile_status}`)
  if (summary.normalization_assumptions.length) {
    console.log("")
    console.log("server normalizations:")
    for (const item of summary.normalization_assumptions) {
      console.log(`- ${item.field_path}: ${item.assumption}`)
    }
  }
  if (summary.validation_issues.length) {
    console.log("")
    console.log("validation issues:")
    for (const issue of summary.validation_issues) console.log(`- ${formatIssue(issue)}`)
  }
  if (summary.compile_issues.length) {
    console.log("")
    console.log("compiler issues:")
    for (const issue of summary.compile_issues) {
      console.log(`- ${issue.field_path} [${issue.code}] ${issue.message}`)
    }
  }
}

function createMockScenario() {
  const scope = { ...PHASE_1_DEFAULT_SCOPE }
  const questionnaire = createQuestionnaire({
    sleeve: "STOCKS",
    allowedDataInputs: ["alpaca_equity_ohlcv"],
  })
  return {
    scope,
    idea: createIdea(scope, "STOCKS"),
    questionnaire,
    catalog: createMockCatalog(),
    modelExecution: createModelExecution("offline-mock"),
    payload: createMockPayload(),
  }
}

function createIdea(scope, sleeve) {
  return {
    schema_version: "research_lab.idea.v2",
    ...scope,
    idea_id: DEFAULT_IDEA_ID,
    title: "Walkthrough packet synthesis fixture",
    thesis: "Test whether a liquid large-cap momentum sleeve can survive regime flips without overfitting the sweep budget.",
    sleeve,
    tags: ["walkthrough", "talon", "packet"],
    params: {},
    reference_strategies: [{
      strategy_id: "regime_aware_momentum::stop_5_target_15",
      delta_note: "Use as lineage only; draft a new packet.",
    }],
    strategy_ref: {
      kind: "NONE",
      strategy_id: null,
      pending_spec_id: null,
      preset_id: null,
    },
    status: "READY",
    needs_spec: true,
    created_at: NOW,
    created_by: "walkthrough",
    source: "MANUAL",
    strategy_id: "",
    code_pending: false,
  }
}

function createQuestionnaire({ sleeve, allowedDataInputs }) {
  const benchmark = sleeve === "CRYPTO" ? "BTC" : "SPY"
  const universe = sleeve === "CRYPTO" ? ["BTC/USD", "ETH/USD"] : ["AAPL", "NVDA", "META", "AVGO"]
  return {
    render_mode: "ADVANCED",
    pattern_description: "Momentum with explicit regime filters, tight exits, and no invented data sources.",
    sleeve,
    trade_horizon: "DAYS",
    capital_tier: "SMALL",
    capital_custom_usd: null,
    strategy_relationship: {
      relationship: "ALONGSIDE",
      target_strategy_id: "regime_aware_momentum::stop_5_target_15",
      evidence_bar_modifier: "STANDARD",
    },
    kill_criteria_user: "Kill it if it cannot beat the sleeve benchmark after costs across the selected eras.",
    edge_family: "MOMENTUM",
    prior_work_refs: ["regime_aware_momentum::stop_5_target_15"],
    changes_from_refs: "Keep the thesis simple and prove the authoring packet plumbing before expanding the strategy.",
    universe_shape: "FIXED_LIST",
    universe_fixed_list: universe,
    regime_expectation: "MOST_CONDITIONS",
    universe_size_band: wrapped("3-6", "USER", "HIGH", "Operator selected a small liquid universe.", true),
    allowed_data_inputs: wrapped(allowedDataInputs, "CATALOG", "HIGH", "Only catalog-backed inputs are allowed for this walkthrough.", true),
    entry_confirmation: wrapped("price momentum confirmed by benchmark regime", "USER", "HIGH", "Operator wants concrete entry rules.", true),
    exit_logic: wrapped("5% stop, 15% target, time stop, and benchmark flip exit", "USER", "HIGH", "Operator accepted a conservative exit frame.", true),
    risk_profile: wrapped("balanced", "USER", "HIGH", "Operator accepted a balanced risk profile for first-pass validation.", true),
    benchmark: wrapped(benchmark, "USER", "HIGH", "Operator selected the sleeve benchmark.", true),
    era_validation_strategy: wrapped("recent mixed-regime plus forward confirmation stub", "USER", "HIGH", "Operator wants more than one tape slice.", true),
    era_weighting: wrapped("equal", "USER", "HIGH", "Operator accepted equal era weighting.", true),
    historical_window: wrapped({
      start_date: "2022-01-01",
      end_date: "2026-05-01",
      rationale: "Covers the recent mixed-rate regime and current market structure.",
      talon_tradeoff_notes: "Short enough for relevance, broad enough to catch recent drawdown behavior.",
    }, "USER", "HIGH", "Operator selected the validation window.", true),
    promotion_bar: wrapped("beat benchmark with controlled drawdown before paper promotion", "USER", "HIGH", "Operator set the evidence bar.", true),
    talon_exclusions: wrapped("Do not invent unavailable data, live readiness, or backtest results.", "USER", "HIGH", "Operator gave hard Talon boundaries.", true),
    field_presentations: fieldPresentations("ACCEPTED"),
  }
}

function createMockPayload() {
  return {
    assumptions: {
      items: [{
        field_path: "strategy_spec.entry_rules",
        assumption: "Medium-term momentum remains meaningful when guarded by a benchmark trend filter.",
        provenance: provenance("TALON_INFERENCE", "MEDIUM", "Mock payload assumption for packet walkthrough.", false),
        risk_if_wrong: "MEDIUM",
        resolution_needed: false,
      }],
    },
    era_benchmark_plan: {
      benchmark_id: "SPY",
      benchmark_rationale: "SPY is the fair broad-market benchmark for a stocks momentum sleeve.",
      eras: [
        {
          era_id: "recent_rate_cycle",
          label: "Recent rate-cycle tape",
          start_date: "2022-01-01",
          end_date: "2026-03-31",
          regime_tags: ["rates", "mega_cap_leadership", "volatility"],
          rationale: "Captures the recent tape this strategy is most likely to face.",
        },
        {
          era_id: "forward_confirmation_stub",
          label: "Forward confirmation stub",
          start_date: "2026-04-01",
          end_date: "2026-05-01",
          regime_tags: ["forward_confirmation"],
          rationale: "Keeps fresh data separate from the main tuning window.",
        },
      ],
      era_weighting_method: wrapped("equal", "TALON_INFERENCE", "MEDIUM", "Equal weighting is the least surprising first-pass default.", false),
    },
    strategy_spec: {
      strategy_family: "MOMENTUM",
      strategy_name: "Walkthrough momentum packet",
      strategy_id: wrapped("walkthrough_momentum_packet", "TALON_INFERENCE", "MEDIUM", "Mock Talon slug proposal.", false),
      sleeve: "CRYPTO",
      universe: wrapped({
        type: "FIXED",
        symbols: ["AAPL", "NVDA", "META", "AVGO"],
        screen_criteria: null,
        max_symbols: 4,
        rebalance_frequency: "weekly",
      }, "USER", "HIGH", "Operator supplied a fixed equity universe.", true),
      entry_rules: wrapped({
        description: "Enter the strongest liquid names when the benchmark trend is positive and relative strength confirms.",
        conditions: [
          {
            name: "benchmark_regime_filter",
            parameter: "spy_200d_trend",
            operator: "gte",
            threshold: 0,
            data_input_id: "price_ohlcv",
            compiler_support: "SUPPORTED",
          },
          {
            name: "relative_momentum_rank",
            parameter: "three_month_total_return_rank",
            operator: "lte",
            threshold: 2,
            data_input_id: "alpaca_equity_daily_ohlcv",
            compiler_support: "SUPPORTED",
          },
        ],
        confirmation_required: true,
        confirmation_description: "Require both benchmark trend and relative momentum confirmation.",
      }, "TALON_INFERENCE", "MEDIUM", "Mock Talon entry rules intentionally include data input aliases.", false),
      exit_rules: wrapped({
        stop_loss_pct: 5,
        target_pct: 15,
        time_stop_days: 10,
        trailing_stop: { enabled: false, trail_pct: null, activation_pct: null },
        custom_exits: [{
          name: "benchmark_flip",
          description: "Exit when the benchmark trend filter fails.",
          condition: "spy_200d_trend < 0",
          compiler_support: "SUPPORTED",
        }],
      }, "TUNABLE_DEFAULT", "MEDIUM", "Conservative first-pass exit defaults.", false),
      position_sizing: wrapped({
        method: "EQUAL_WEIGHT",
        base_size_pct: null,
        max_positions: 4,
        risk_per_trade_pct: null,
        custom_description: null,
      }, "TUNABLE_DEFAULT", "MEDIUM", "Equal weight is a simple first-pass sizing rule.", false),
      risk_limits: wrapped({
        max_portfolio_drawdown_pct: 12,
        max_single_position_loss_pct: 5,
        max_correlated_exposure_pct: 75,
        max_sector_concentration_pct: 70,
        circuit_breaker_rules: "Pause new entries when SPY closes below its 200-day average.",
      }, "TUNABLE_DEFAULT", "MEDIUM", "Risk guardrails are conservative defaults.", false),
      execution_constraints: wrapped({
        order_types: ["market", "limit"],
        no_trade_zones: "No entries during market halts or unresolved data-readiness incidents.",
        slippage_assumption_bps: 5,
        commission_model: "FLAT",
        commission_assumption_value: 0,
      }, "CATALOG", "HIGH", "Equity paper broker assumptions.", false),
    },
    sweep_bounds: {
      parameters: [
        {
          field_path: "strategy_spec.exit_rules.value.stop_loss_pct",
          min: 4,
          max: 6,
          step: 1,
          values: null,
          provenance: provenance("TUNABLE_DEFAULT", "MEDIUM", "Narrow stop sweep for first-pass validation.", false),
        },
        {
          field_path: "strategy_spec.exit_rules.value.target_pct",
          min: 12,
          max: 18,
          step: 3,
          values: null,
          provenance: provenance("TUNABLE_DEFAULT", "MEDIUM", "Narrow target sweep for first-pass validation.", false),
        },
      ],
      max_total_variants: 4,
      sweep_method: "GRID",
    },
    evidence_thresholds: {
      backtest: {
        min_trades: 30,
        min_win_rate_pct: 52,
        min_profit_factor: 1.2,
        min_sharpe: 1.2,
        max_drawdown_pct: 12,
        min_profitable_fold_pct: 60,
        additional: { min_excess_return_pct: 4 },
      },
      paper: paperThresholds(30, 10, 15, 8),
      live: {
        ...paperThresholds(90, 25, 45, 6),
        max_single_loss_usd: 250,
      },
    },
    trial_ledger_budget: {
      max_variants: 1,
      max_eras: 1,
      max_bench_runs: 1,
      estimated_compute_cost_usd: null,
      rationale: "Intentionally under-budgeted by the mock payload so the server normalization can be verified.",
    },
    multiple_comparisons_plan: {
      method: "NONE_V1_PLACEHOLDER",
      effective_trials_estimate: 1,
      adjusted_significance_level: null,
      notes: "Mock payload leaves final multiple-comparison enforcement to the ledger/compiler.",
      full_implementation_target: "FDR_BH",
    },
    portfolio_fit: {
      status: "WAIVED",
      deferred_until: null,
      existing_strategies: [],
      correlation_assessment: null,
      joint_drawdown_estimate: null,
      sleeve_budget_impact: null,
      capital_capacity_notes: null,
      marginal_value_notes: "",
    },
  }
}

function createMockCatalog() {
  return {
    schema_version: "research_lab.data_capability.v1",
    catalog_version: "walkthrough-data-catalog-2026-05-04",
    generated_at: NOW,
    doc: "Offline walkthrough catalog. No external calls.",
    capabilities: [
      {
        capability_id: "alpaca_equity_ohlcv",
        display_name: "Equity OHLCV (Alpaca)",
        category: "Price OHLCV",
        status: "AVAILABLE",
        sleeves: ["STOCKS"],
        asof_coverage: "2016-present",
        notes: "Mocked catalog-backed equity bars.",
      },
      {
        capability_id: "apewisdom_top100",
        display_name: "Ape Wisdom retail-attention rank",
        category: "Sentiment",
        status: "AVAILABLE",
        sleeves: ["STOCKS"],
        asof_coverage: "2024-present",
        notes: "Mocked retail-attention feed.",
      },
      {
        capability_id: "alpaca_crypto_ohlcv",
        display_name: "Crypto OHLCV (Alpaca)",
        category: "Price OHLCV",
        status: "PARTIAL",
        sleeves: ["CRYPTO"],
        asof_coverage: "2024-10-23-present",
        notes: "Mocked partial crypto bars.",
      },
    ],
  }
}

function defaultAllowedDataInputs(sleeve) {
  if (sleeve === "CRYPTO") return ["alpaca_crypto_ohlcv", "ccxt_binance_crypto_ohlcv"]
  if (sleeve === "OPTIONS") return ["alpaca_options_chain"]
  return ["alpaca_equity_ohlcv", "apewisdom_top100"]
}

function paperThresholds(minCalendarDays, minClosedTrades, minActiveExposureDays, maxDrawdownPct) {
  return {
    min_calendar_days: minCalendarDays,
    min_closed_trades: minClosedTrades,
    min_active_exposure_days: minActiveExposureDays,
    max_drawdown_pct: maxDrawdownPct,
    min_win_rate_pct: 52,
    min_profit_factor: 1.15,
    capital_tier_modifier: {
      tier: "SMALL",
      calendar_days_multiplier: 1,
      closed_trades_multiplier: 1,
      drawdown_tightening_pct: null,
    },
  }
}

function fieldPresentations(value) {
  return {
    universe_size_band: value,
    allowed_data_inputs: value,
    entry_confirmation: value,
    exit_logic: value,
    risk_profile: value,
    benchmark: value,
    era_validation_strategy: value,
    era_weighting: value,
    historical_window: value,
    promotion_bar: value,
    talon_exclusions: value,
  }
}

function wrapped(value, source, confidence, rationale, operatorConfirmed) {
  return {
    value,
    provenance: provenance(source, confidence, rationale, operatorConfirmed),
  }
}

function provenance(source, confidence, rationale, operatorConfirmed) {
  return {
    source,
    confidence,
    rationale,
    source_artifact_id: null,
    operator_confirmed: operatorConfirmed,
  }
}

function createModelExecution(modelId) {
  return {
    required_capabilities: {
      min_context_window_tokens: 64000,
      structured_output_required: true,
      reasoning_depth: "EXTENDED",
      notes: "Offline walkthrough exercises deterministic finalizer and validator plumbing only.",
    },
    actual_provider: "walkthrough",
    actual_model_id: modelId,
    actual_response_id: null,
    temperature: 0,
    seed: 1,
    max_tokens: null,
    timestamp: NOW,
  }
}

function extractValidationIssues(payload) {
  const direct = payload?.validation_issues
  if (Array.isArray(direct)) return direct
  const nested = payload?.payload?.validation_issues
  if (Array.isArray(nested)) return nested
  return []
}

function formatIssue(issue) {
  return `${String(issue.severity ?? "issue").toUpperCase()} ${issue.field_path ?? "packet"} [${issue.code ?? "UNKNOWN"}] ${issue.message ?? ""}`.trim()
}

function normalizeSleeve(value) {
  const sleeve = String(value).trim().toUpperCase()
  if (!["STOCKS", "CRYPTO", "OPTIONS"].includes(sleeve)) {
    throw new Error("--sleeve must be STOCKS, CRYPTO, or OPTIONS")
  }
  return sleeve
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "")
}

function printHelp() {
  console.log(`
Usage:
  npm run lab:packet-walkthrough
  npm run lab:packet-walkthrough:mock
  npm run lab:packet-walkthrough:live -- --base-url http://localhost:3000 --idea ${DEFAULT_IDEA_ID}

Modes:
  mock  Runs offline against the real packet finalizer/validator. No AI calls.
  live  Calls /clarify and /packets against a dev server or Vercel preview.

Options:
  --json                      Print machine-readable JSON.
  --base-url <url>            Live mode target. Default: http://localhost:3000
  --idea <idea_id>            Live mode idea. Default: ${DEFAULT_IDEA_ID}
  --sleeve <sleeve>           STOCKS, CRYPTO, or OPTIONS. Default: STOCKS
  --dry-run                   Live mode does not persist. Default.
  --persist                   Live mode persists the packet if the API succeeds.
  --user <id>                 Scope user_id. Default: ${PHASE_1_DEFAULT_SCOPE.user_id}
  --account <id>              Scope account_id. Default: ${PHASE_1_DEFAULT_SCOPE.account_id}
  --strategy-group <id>       Scope strategy_group_id. Default: ${PHASE_1_DEFAULT_SCOPE.strategy_group_id}
`.trim())
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
