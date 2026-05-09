// Server-only Guided scope resolver (T1.0d).
//
// Phase 6.2 closes GUIDED-T1-HARDCODED-SCOPE-REMOVAL by retiring the
// PHASE_6_2_INTERNAL_SCOPE constant that previously sat at every
// user-state read site. From T1.0d forward:
//
//   1. The Auth.js session is the only authority for caller identity.
//      Body-supplied scope (e.g. inside a command request) is treated as
//      an untrusted hint and is overridden by the value resolved here.
//   2. The scope is derived from the verified email allowlist. The
//      mapping is intentionally explicit and lives in env so production
//      can swap users without a code change.
//   3. Two failure modes are surfaced as distinct error classes so the
//      UI can render the right state:
//        - UnauthenticatedError      → redirect to /signin?from=<path>
//        - UnknownScopeIdentityError → render labeled MockFallbackBadge
//
// The single internal allowlisted email maps to the existing Phase 6.2
// scope (jacob / paper_main / default) so on-disk artifacts and the
// runtime command service do not need to be re-keyed in this PR. T2
// brings real multi-tenant scope routing.

import "server-only"

import type { GuidedScope } from "@/components/vires/guided/types"
import { getGuidedAuthSession, type GuidedAuthSession } from "@/lib/auth.server"

export class UnauthenticatedError extends Error {
  constructor() {
    super("No authenticated session.")
    this.name = "UnauthenticatedError"
  }
}

export class UnknownScopeIdentityError extends Error {
  readonly email: string
  constructor(email: string) {
    super(`Authenticated email '${email}' has no Guided scope mapping.`)
    this.name = "UnknownScopeIdentityError"
    this.email = email
  }
}

const T1_INTERNAL_SCOPE: GuidedScope = {
  user_id: "jacob",
  account_id: "paper_main",
  strategy_group_id: "default",
}

function readInternalAllowlist(): Set<string> {
  const raw = process.env.AUTH_ALLOWED_EMAILS ?? ""
  return new Set(
    raw
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0),
  )
}

function mapEmailToScope(email: string): GuidedScope | null {
  const internal = readInternalAllowlist()
  if (internal.has(email.toLowerCase())) return T1_INTERNAL_SCOPE
  return null
}

export async function resolveCurrentScope(): Promise<GuidedScope> {
  const session = await requireSession()
  const scope = mapEmailToScope(session.email)
  if (scope === null) throw new UnknownScopeIdentityError(session.email)
  return scope
}

export type ActorType = "user"

export interface GuidedAuthContext {
  scope: GuidedScope
  actorType: ActorType
  actorId: string
  subject: string
}

export async function resolveCurrentAuthContext(): Promise<GuidedAuthContext> {
  const session = await requireSession()
  const scope = mapEmailToScope(session.email)
  if (scope === null) throw new UnknownScopeIdentityError(session.email)
  return {
    scope,
    actorType: "user",
    actorId: session.email,
    subject: session.email,
  }
}

async function requireSession(): Promise<GuidedAuthSession> {
  const session = await getGuidedAuthSession()
  if (session === null) throw new UnauthenticatedError()
  return session
}
