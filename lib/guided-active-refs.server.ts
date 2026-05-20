// Scope-based resolver for "what's the user's current ACTIVE Guided
// enrollment / open match proposal?" Closes the dashboard side of
// `GUIDED-T1-PREVIEW-ROUTE-DEHARDCODE` in the deferred-obligations ledger.
//
// Today the preview pages each held a hardcoded constant like
// `JACOB_PAPER_ACTIVE_ENROLLMENT_ID = "enrollment_jacob_paper_main_active"`.
// That forced URL surgery in any non-Jacob environment. This module moves
// that knowledge into one place keyed by scope, mirroring the existing
// `T1_INTERNAL_SCOPE` + `GUIDED_T1_SCOPE_EMAILS` pattern in
// `lib/guided-scope.server.ts`.
//
// T1 keeps a single-tuple lookup. T2/T3 replaces this with a real query
// against the user-state store that returns the current active enrollment
// + open proposal for the authenticated scope.

import "server-only"

import type { GuidedScope } from "@/components/vires/guided/types"

export class NoActiveGuidedRefsError extends Error {
  readonly scope: GuidedScope
  constructor(scope: GuidedScope) {
    super(
      `No active Guided refs registered for scope user=${scope.user_id} account=${scope.account_id} group=${scope.strategy_group_id}.`,
    )
    this.name = "NoActiveGuidedRefsError"
    this.scope = scope
  }
}

export interface ActiveGuidedRefs {
  activeEnrollmentId: string
  activeMatchProposalId: string
}

function scopeKey(scope: GuidedScope): string {
  return `${scope.user_id}|${scope.account_id}|${scope.strategy_group_id}`
}

// T1 single-tuple lookup. Mirrors the same internal scope tuple that
// `lib/guided-scope.server.ts::T1_INTERNAL_SCOPE` maps to from
// `GUIDED_T1_SCOPE_EMAILS`. When a second admitted scope is introduced
// (T2 multi-tenant), this static map gets replaced by a real read.
const T1_SCOPE_REF_MAP: ReadonlyMap<string, ActiveGuidedRefs> = new Map([
  [
    "jacob|paper_main|default",
    {
      activeEnrollmentId: "enrollment_jacob_paper_main_active",
      activeMatchProposalId: "proposal_jacob_paper_main_migration",
    },
  ],
])

export function resolveActiveGuidedRefs(scope: GuidedScope): ActiveGuidedRefs {
  const refs = T1_SCOPE_REF_MAP.get(scopeKey(scope))
  if (refs === undefined) throw new NoActiveGuidedRefsError(scope)
  return refs
}

export function resolveActiveEnrollmentId(scope: GuidedScope): string {
  return resolveActiveGuidedRefs(scope).activeEnrollmentId
}

export function resolveActiveMatchProposalId(scope: GuidedScope): string {
  return resolveActiveGuidedRefs(scope).activeMatchProposalId
}
