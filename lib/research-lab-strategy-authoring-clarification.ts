// Strategy Authoring clarification contract — frontend-side mirror of the
// shape Codex committed to in the 2026-05-04 alignment thread. Codex owns
// the canonical version; once the backend slice lands, these types should
// be re-exported from research-lab-contracts.ts and this file deleted (or
// left as a re-export so no callers need to change).
//
// Do not extend this contract here without coordinating — the frontend
// mocks against this exact shape so the swap-in is mechanical.

import type {
  AuthoringProvenance,
  StrategyAuthoringQuestionnaire,
} from "./research-lab-contracts"

export type ClarificationSeverity = "HIGH" | "MEDIUM" | "LOW"

export type ClarificationAnswerKind =
  | "FREE_TEXT"
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "NUMBER"
  | "RANGE"
  | "BOOLEAN"

export type ClarificationBlockingPolicy =
  | "BLOCKS_SYNTHESIS"
  | "CAN_USE_DEFAULT"
  | "CAN_PROCEED_UNKNOWN"

// section_key tracks which packet section a question informs. We use the
// existing packet field names; new sections introduced after this slice
// should be added here in lockstep.
export type StrategyAuthoringSectionKey =
  | "questionnaire"
  | "assumptions"
  | "data_readiness"
  | "era_benchmark_plan"
  | "strategy_spec"
  | "sweep_bounds"
  | "evidence_thresholds"
  | "trial_ledger_budget"
  | "multiple_comparisons_plan"
  | "adversarial_review"
  | "portfolio_fit"
  | "reproducibility_manifest"

export interface ClarificationOption {
  label: string
  value: unknown
  description?: string
}

export interface ClarificationProposedDefault {
  value: unknown
  rationale: string
  provenance_source: AuthoringProvenance["source"] extends infer S
    ? S extends "TALON_INFERENCE" | "TUNABLE_DEFAULT" | "REFERENCE" | "CATALOG"
      ? S
      : never
    : never
}

export interface ClarificationQuestion {
  id: string
  field_path: string
  section_key: StrategyAuthoringSectionKey
  question: string
  why_it_matters: string
  answer_kind: ClarificationAnswerKind
  options?: ClarificationOption[]
  proposed_default?: ClarificationProposedDefault | null
  allow_unknown: boolean
  severity: ClarificationSeverity
  blocking_policy: ClarificationBlockingPolicy
}

export type ClarificationStatus = "NEEDS_CLARIFICATION" | "READY_FOR_SYNTHESIS"

export interface ClarificationRequest {
  request_id: string
  status: ClarificationStatus
  questions: ClarificationQuestion[]
  can_proceed_without_answers: boolean
  missing_context_summary: string[]
}

// Operator-side answer envelope, posted back to /clarify on the second leg.
export type ClarificationAnswerStatus =
  | "ANSWERED"
  | "ACCEPTED_DEFAULT"
  | "MARKED_UNKNOWN"

export interface ClarificationAnswer {
  question_id: string
  status: ClarificationAnswerStatus
  value?: unknown
}

export interface ClarifyRequestBody {
  idea_id: string
  questionnaire: StrategyAuthoringQuestionnaire
  clarification_answers?: ClarificationAnswer[]
  request_id?: string
}

export interface ClarifyResponseBody {
  status: ClarificationStatus
  clarification_request: ClarificationRequest
  context_summary: string[]
}

// Frontend-owned mock — used by the preview route until Codex's endpoint
// lands. Returns a representative NEEDS_CLARIFICATION response covering
// every answer_kind so the UI can be visually checked end-to-end.
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
      proposed_default: {
        value: "10-25",
        rationale:
          "Default for a momentum-family strategy at SMALL capital tier with no explicit universe constraint.",
        provenance_source: "TUNABLE_DEFAULT",
      },
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
      proposed_default: {
        value: "SPY",
        rationale: "Broad equity benchmark, default for STOCKS sleeve.",
        provenance_source: "TUNABLE_DEFAULT",
      },
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
      proposed_default: {
        value: 30,
        rationale: "Standard for momentum-family, MEDIUM capital tier.",
        provenance_source: "TUNABLE_DEFAULT",
      },
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
      proposed_default: {
        value: { start: "2018-01-01", end: "2026-05-04" },
        rationale: "Default authoring window for STOCKS.",
        provenance_source: "TUNABLE_DEFAULT",
      },
      allow_unknown: true,
      severity: "MEDIUM",
      blocking_policy: "CAN_USE_DEFAULT",
    },
    {
      id: "q_data_inputs",
      field_path: "questionnaire.allowed_data_inputs",
      section_key: "data_readiness",
      question: "Which data feeds is Talon allowed to use?",
      why_it_matters:
        "Talon will only consider strategies whose required feeds are in this list. Adding feeds beyond what's catalog-backed forces NEEDS_MAPPING.",
      answer_kind: "MULTI_CHOICE",
      options: [
        { label: "alpaca_equity_daily_ohlcv", value: "alpaca_equity_daily_ohlcv" },
        { label: "alpaca_equity_intraday_ohlcv", value: "alpaca_equity_intraday_ohlcv" },
        { label: "options_chain_snapshots", value: "options_chain_snapshots" },
        { label: "wikipedia_pageviews", value: "wikipedia_pageviews" },
      ],
      proposed_default: {
        value: ["alpaca_equity_daily_ohlcv"],
        rationale: "Cheapest catalog default for STOCKS.",
        provenance_source: "CATALOG",
      },
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
      proposed_default: {
        value: false,
        rationale: "Conservative default; can be toggled on later.",
        provenance_source: "TUNABLE_DEFAULT",
      },
      allow_unknown: true,
      severity: "LOW",
      blocking_policy: "CAN_PROCEED_UNKNOWN",
    },
  ]

  const base: ClarifyResponseBody = {
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
    context_summary: [
      "Reference packet matched: regime_aware_momentum::stop_5_target_15",
      "Capital tier inferred: SMALL (no override provided)",
      "Data catalog: 12 feeds available; 4 deemed relevant for this idea family",
      "Failed-packet lessons applied: 3 prior overfitting incidents in momentum-on-stocks",
    ],
  }
  return { ...base, ...override }
}
