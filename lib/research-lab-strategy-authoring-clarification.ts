// Strategy Authoring clarification — small re-export + UI helpers.
//
// Codex shipped the canonical contract in research-lab-contracts.ts
// (07bcd7b1). This file used to mirror those types as a frontend mock;
// the mirror is gone, only the mock factory + endpoint helpers remain
// so the preview route still works end-to-end without backend.

import type {
  ClarificationAnswer,
  ClarificationAnswerAction,
  ClarificationAnswerKind,
  ClarificationBlockingPolicy,
  ClarificationOption,
  ClarificationProposedDefault,
  ClarificationQuestion,
  ClarificationRequest,
  ClarificationRequestStatus,
  ClarificationSeverity,
  ProvenanceSource,
  StrategyAuthoringContextPacket,
  StrategyAuthoringQuestionnaire,
  StrategyAuthoringSectionKey,
} from "./research-lab-contracts"

export type {
  ClarificationAnswer,
  ClarificationAnswerAction,
  ClarificationAnswerKind,
  ClarificationBlockingPolicy,
  ClarificationOption,
  ClarificationProposedDefault,
  ClarificationQuestion,
  ClarificationRequest,
  ClarificationRequestStatus,
  ClarificationSeverity,
  StrategyAuthoringSectionKey,
}

// Server-shape for /clarify responses. Matches the JSON wrapper produced
// by app/api/research/strategy-authoring/packets/clarify/route.ts.
export interface ClarifyResponseBody {
  ok: boolean
  status: ClarificationRequestStatus
  clarification_request: ClarificationRequest
  context_packet: StrategyAuthoringContextPacket
  response_id: string | null
}

export interface ClarifyRequestBody {
  idea_id: string
  scope: { user_id: string; account_id: string; strategy_group_id: string }
  questionnaire: StrategyAuthoringQuestionnaire
  clarification_answers?: ClarificationAnswer[]
}

// Frontend-owned mock — used by the preview route to render the screen
// without touching the live endpoint. Returns a representative
// NEEDS_CLARIFICATION response covering every answer_kind so the UI
// can be visually checked end-to-end.
export function mockClarifyResponse(
  override?: Partial<ClarifyResponseBody>,
): ClarifyResponseBody {
  const baseQuestions: ClarificationQuestion[] = [
    {
      id: "q_universe_size",
      field_path: "questionnaire.universe_size_band",
      section_key: "strategy_spec",
      question: "How many tickers should this strategy hold at once?",
      why_it_matters:
        "Universe size sets capacity, diversification, and how aggressively Talon can screen. A 6-stock sleeve and a 200-stock screen are different strategies.",
      answer_kind: "SINGLE_CHOICE",
      options: [
        { label: "Small (3-6)", value: "3-6", description: "Concentrated; RAM-style" },
        { label: "Medium (10-25)", value: "10-25", description: "Balanced; good for diversification" },
        { label: "Broad (50-200)", value: "50-200", description: "Screen-driven; needs strong filter" },
        { label: "Whole sleeve", value: "all", description: "Universe is the entire sleeve" },
      ],
      proposed_default: defaultFor(
        "10-25",
        "Default for a momentum-family strategy at SMALL capital tier with no explicit universe constraint.",
        "TUNABLE_DEFAULT",
      ),
      allow_unknown: false,
      severity: "HIGH",
      blocking_policy: "BLOCKS_SYNTHESIS",
    },
    {
      id: "q_benchmark",
      field_path: "questionnaire.benchmark",
      section_key: "era_benchmark_plan",
      question: "What benchmark should this strategy be measured against?",
      why_it_matters:
        "Era plan and adversarial review both depend on the benchmark. SPY is fine for broad-market stocks; sector strategies usually want a sector ETF.",
      answer_kind: "FREE_TEXT",
      options: [],
      proposed_default: defaultFor(
        "SPY",
        "Broad equity benchmark, default for STOCKS sleeve.",
        "TUNABLE_DEFAULT",
      ),
      allow_unknown: false,
      severity: "HIGH",
      blocking_policy: "CAN_USE_DEFAULT",
    },
    {
      id: "q_min_trades",
      field_path: "evidence_thresholds.backtest.min_trades",
      section_key: "evidence_thresholds",
      question: "Minimum closed trades before a backtest counts as evidence?",
      why_it_matters:
        "Lower thresholds let small samples promote; higher thresholds slow learning. Default is per edge family + capital tier.",
      answer_kind: "NUMBER",
      options: [],
      proposed_default: defaultFor(
        30,
        "Standard for momentum-family, MEDIUM capital tier.",
        "TUNABLE_DEFAULT",
      ),
      allow_unknown: true,
      severity: "MEDIUM",
      blocking_policy: "CAN_USE_DEFAULT",
    },
    {
      id: "q_validation_window",
      field_path: "questionnaire.historical_window",
      section_key: "era_benchmark_plan",
      question: "What date range should backtests cover?",
      why_it_matters:
        "Window shapes which regimes the strategy must survive. Wider windows reduce overfit risk but trade specificity.",
      answer_kind: "RANGE",
      options: [],
      proposed_default: defaultFor(
        { start: "2018-01-01", end: "2026-05-04" },
        "Default authoring window for STOCKS.",
        "TUNABLE_DEFAULT",
      ),
      allow_unknown: true,
      severity: "MEDIUM",
      blocking_policy: "CAN_USE_DEFAULT",
    },
    {
      id: "q_data_inputs",
      field_path: "questionnaire.allowed_data_inputs",
      section_key: "strategy_spec",
      question: "Which data feeds is Talon allowed to use?",
      why_it_matters:
        "Talon will only consider strategies whose required feeds are in this list. Adding feeds beyond what's catalog-backed forces NEEDS_MAPPING.",
      answer_kind: "MULTI_CHOICE",
      options: [
        { label: "alpaca_equity_ohlcv", value: "alpaca_equity_ohlcv" },
        { label: "alpaca_options_chain", value: "alpaca_options_chain" },
        { label: "alpaca_crypto_ohlcv", value: "alpaca_crypto_ohlcv" },
        { label: "wikipedia_pageviews", value: "wikipedia_pageviews" },
      ],
      proposed_default: defaultFor(
        ["alpaca_equity_ohlcv"],
        "Cheapest catalog default for STOCKS.",
        "CATALOG",
      ),
      allow_unknown: false,
      severity: "MEDIUM",
      blocking_policy: "CAN_USE_DEFAULT",
    },
    {
      id: "q_short_allowed",
      field_path: "strategy_spec.execution_constraints.shorts_allowed",
      section_key: "strategy_spec",
      question: "Are short positions allowed?",
      why_it_matters:
        "Changes capital model, hedge logic, and downstream borrow availability checks. Default is false in PAPER tier.",
      answer_kind: "BOOLEAN",
      options: [],
      proposed_default: defaultFor(
        false,
        "Conservative default; can be toggled on later.",
        "TUNABLE_DEFAULT",
      ),
      allow_unknown: true,
      severity: "LOW",
      blocking_policy: "CAN_PROCEED_UNKNOWN",
    },
  ]

  const base: ClarifyResponseBody = {
    ok: true,
    status: "NEEDS_CLARIFICATION",
    clarification_request: {
      request_id: "req_mock_01KQR_clarify_demo",
      status: "NEEDS_CLARIFICATION",
      questions: baseQuestions,
      can_proceed_without_answers: false,
      missing_context_summary: [
        "Universe size band not provided in questionnaire — Talon needs this before scoping.",
        "Benchmark left at default — confirm or override before adversarial review.",
        "No explicit short-side preference — assuming long-only.",
      ],
    },
    context_packet: mockContextPacket(),
    response_id: null,
  }
  return { ...base, ...override }
}

function defaultFor(
  value: unknown,
  rationale: string,
  source: ProvenanceSource,
): ClarificationProposedDefault {
  return { value, rationale, provenance_source: source }
}

function mockContextPacket(): StrategyAuthoringContextPacket {
  // Minimal stub — preview route only consumes
  // missing_context_candidates for now; the full shape is here so the
  // type-check remains honest if other consumers pull from it later.
  return {
    schema_version: "research_lab.strategy_authoring_context_packet.v1",
    generated_at: new Date().toISOString(),
    idea: {
      idea_id: "idea_mock_01KQR_demo",
      title: "test x I I (mock)",
      thesis: "Mock thesis used in the clarification preview.",
      sleeve: "STOCKS",
      tags: [],
      reference_strategies: [],
      created_by: "jacob",
    },
    questionnaire: {} as StrategyAuthoringQuestionnaire,
    data_catalog: [],
    talon_lessons: "(mock — no lessons file loaded)",
    reference_context: "(mock — reference packet matched: regime_aware_momentum::stop_5_target_15)",
    failed_packet_summary: "(mock — 3 prior overfitting incidents in momentum-on-stocks)",
    missing_context_candidates: [
      "Reference packet matched: regime_aware_momentum::stop_5_target_15",
      "Capital tier inferred: SMALL (no override provided)",
      "Data catalog: 12 feeds available; 4 deemed relevant for this idea family",
    ],
  }
}

export function clarifyEndpointPath(): string {
  return "/api/research/strategy-authoring/packets/clarify"
}
