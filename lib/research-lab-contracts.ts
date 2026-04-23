// Research Lab — TypeScript contracts stub.
//
// This file is a placeholder. The canonical types live in the trading-bot
// repo under src/openclaw_core/research_lab/schemas.py (or equivalent) and
// are generated into this file by Codex's Phase 0 delivery.
//
// Until that delivery lands, every research-lab surface imports from this
// stub and renders an honest empty state. Do NOT invent fields here —
// the spec review explicitly names the dashboard as a thin surface, not a
// second source of truth.
//
// Contract source of truth: SPEC_REVIEW_2026-04-23.md §2.

// Opaque scope triple. All artifacts carry this.
export type ScopedId = {
  user_id: string
  account_id: string
  strategy_group_id: string
}

// Sleeve tag matches the rest of Vires (uppercased in research-lab contracts).
export type ResearchSleeve = "STOCKS" | "CRYPTO" | "OPTIONS"

// Status tokens referenced by the UI even before the producer is wired.
export type IdeaStatus =
  | "DRAFT"
  | "READY"
  | "QUEUED"
  | "ACTIVE"
  | "SHELVED"
  | "RETIRED"

export type JobState =
  | "QUEUED"
  | "COMPILING"
  | "COMPILE_FAILED"
  | "RUNNING"
  | "POST_PROCESSING"
  | "DONE"
  | "FAILED"
  | "RETRY_QUEUED"
  | "CANCELLED" // reserved; not exercised in Phase 1a/1b

export type ReadinessOverallStatus =
  | "READY_TO_NOMINATE"
  | "MONITORED"
  | "BLOCKED"
  | "EMPTY_STATE"

export type AdapterStatus =
  | "WIRED"
  | "CODE_COMPLETE_UNWIRED"
  | "NOT_IMPLEMENTED"

// Phase-0 placeholder: the real contract lands via Codex's generator.
// This type is intentionally imprecise so nothing downstream pretends to
// know a shape that isn't validated yet.
export type ResearchLabPlaceholder = {
  schema_version: string
  __contract_status: "phase_0_stub_awaiting_codex"
}

export const CONTRACT_STATUS = "phase_0_stub_awaiting_codex" as const
