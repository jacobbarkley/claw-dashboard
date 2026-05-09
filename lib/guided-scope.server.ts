// Server-only scope resolver. Maps an authenticated session to a
// GuidedScope tuple. Replaces the PHASE_6_2_INTERNAL_SCOPE constant from
// T1.0c — that constant is no longer the permanent default path; every
// user-state read or write derives scope from the authenticated session.
//
// T1: single allowed identity (Jacob). The mapping is explicit and
// hardcoded:
//
//   { user_id: "jacob", account_id: "paper_main", strategy_group_id: "default" }
//
// T2: this resolver becomes the seam for multi-tenant scope. The signature
// stays the same; the implementation looks up scope from a per-user
// directory or the same private store backing the runtime.
//
// Sources of truth:
//   - GuidedScope shape: vires-numeris/src/openclaw_core/models/guided.py
//   - Session shape: lib/auth.server.ts (GuidedAuthSession wrapper)

import "server-only"

import type { GuidedScope } from "@/components/vires/guided/types"
import { getGuidedAuthSession, type GuidedAuthSession } from "@/lib/auth.server"

export class UnauthenticatedError extends Error {
  constructor() {
    super("No authenticated session. Sign in is required for user-state Guided routes.")
    this.name = "UnauthenticatedError"
  }
}

export class UnknownScopeIdentityError extends Error {
  constructor(public readonly identity: string) {
    super(
      `No GuidedScope mapping for identity ${identity}. T1 only maps the allowlisted internal identity.`,
    )
    this.name = "UnknownScopeIdentityError"
  }
}

// T1 internal identity → scope mapping. Two lookup keys (email + GitHub
// login) for the single allowed identity, since GitHub may not always
// surface a verified email on the OAuth profile.
const T1_INTERNAL_SCOPE: GuidedScope = {
  user_id: "jacob",
  account_id: "paper_main",
  strategy_group_id: "default",
}
const T1_INTERNAL_EMAIL_KEYS = (process.env.AUTH_ALLOWED_EMAILS ?? "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)
const T1_INTERNAL_GH_LOGIN_KEYS = (process.env.AUTH_ALLOWED_GITHUB_LOGINS ?? "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

// Resolve the active scope. Throws UnauthenticatedError when no session
// exists; throws UnknownScopeIdentityError when the session belongs to an
// identity that has no scope mapping (defensive — the auth allowlist should
// already prevent this, but the resolver is the second line of defense).
export async function resolveCurrentScope(): Promise<GuidedScope> {
  const { scope } = await resolveCurrentAuthContext()
  return scope
}

// Full auth context for write paths. Read paths only need the scope; write
// paths additionally need actor info for audit logging on the runtime side
// (the JWT carries actor as claims, body never does — body actor would be
// untrusted hint per the merged contract).
export interface GuidedAuthContext {
  scope: GuidedScope
  actorType: "USER" | "OPERATOR" | "SYSTEM"
  actorId: string
  subject: string
}

export async function resolveCurrentAuthContext(): Promise<GuidedAuthContext> {
  const session = await getGuidedAuthSession()
  if (!session) throw new UnauthenticatedError()
  const scope = scopeForSession(session)
  // T1: only USER actors. OPERATOR / SYSTEM actors come in T2 with
  // operator-mode UX and the system-action automation surface.
  const actorId = scope.user_id
  const subject = (session.email ?? session.guidedGhLogin ?? scope.user_id).toLowerCase()
  return { scope, actorType: "USER", actorId, subject }
}

function scopeForSession(session: GuidedAuthSession): GuidedScope {
  const email = (session.email ?? "").toLowerCase()
  const ghLogin = (session.guidedGhLogin ?? "").toLowerCase()
  if (email && T1_INTERNAL_EMAIL_KEYS.includes(email)) return T1_INTERNAL_SCOPE
  if (ghLogin && T1_INTERNAL_GH_LOGIN_KEYS.includes(ghLogin)) return T1_INTERNAL_SCOPE
  throw new UnknownScopeIdentityError(email || ghLogin || "<unknown>")
}
