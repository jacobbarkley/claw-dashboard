// Step 2 Supabase RLS spike implementation of GuidedReadStore. Reads a single
// projection — guided_enrollment_view — from the public.guided_enrollment_spike
// table over PostgREST with row-level security gated by a short-TTL JWT minted
// from the authenticated session.
//
// Selected when GUIDED_READ_STORE=supabase (set on Vercel Preview). The other
// three GuidedReadStore methods intentionally throw GuidedUserStateUnavailableError
// during the spike — only the active-enrollment read is proven end-to-end. The
// remaining preview pages catch that error and render the same configured-error
// UI they do today, so the spike adds the new path without regressing the
// rest of the surface.
//
// Auth shape (mirrored in lib/guided-supabase-jwt.server.ts):
//   - JWT sub  = authenticated session identifier (Jacob's email today; WorkOS
//                user id after Step 3) — the same value the seeded row's
//                user_sub column holds. RLS authorizes off (jwt ->> 'sub').
//   - Anon key = PostgREST API key. Required as the apikey header so the
//                request reaches the API at all; per-row auth comes from the
//                Bearer JWT, not from the anon key.
//
// Architectural debt: this path uses Supabase's legacy HS256 JWT secret as
// Current Key only because Supabase's new asymmetric JWT Signing Keys (ECC
// P-256) require minter-side signing infrastructure we don't have yet. When
// Supabase eventually revokes the legacy key, this minter breaks. Migration
// target: Supabase Auth as the issuer, or hand-rolled ES256. Tracked in
// docs/supabase-rls-spike.md.

import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type {
  EnrollmentEventsView,
  GuidedEnrollment,
  GuidedEnrollmentView,
  GuidedMatchProposalView,
  GuidedScope,
} from "@/components/vires/guided/types"
import { GuidedEnrollmentViewSchema } from "@/lib/guided-data-source.schemas"
import {
  GuidedArtifactInvalidError,
  GuidedArtifactMissingError,
  GuidedUserStateUnavailableError,
  assertSafeGuidedId,
  type GuidedReadStore,
} from "@/lib/guided-read-store.server"
import { resolveCurrentAuthContext } from "@/lib/guided-scope.server"
import { mintSupabaseJwt } from "@/lib/guided-supabase-jwt.server"

// Pinned to the table name created by Codex's PR #3 migration in vires-numeris
// (supabase/migrations/<step2>_guided_enrollment_spike.sql). Drift = silent
// read failure.
const SPIKE_TABLE = "guided_enrollment_spike"

// Caller-passed scope must match the authoritative scope from the session,
// same contract the projection store enforces. Catching mismatch here keeps
// the supabase store from minting a JWT for one identity and querying the
// table for another.
export class GuidedScopeAuthorityMismatchError extends Error {
  constructor(
    public readonly passedScope: GuidedScope,
    public readonly authoritativeScope: GuidedScope,
  ) {
    super(
      "Caller-passed scope does not match the authoritative scope from the " +
        "authenticated session.",
    )
    this.name = "GuidedScopeAuthorityMismatchError"
  }
}

// Misconfiguration class distinct from GuidedUserStateUnavailableError so we
// can tell "operator forgot SUPABASE_ANON_KEY" apart from "operator did not
// select supabase at all." Surfaces as a server error during the spike rather
// than a UI fallback — silent misconfiguration was the failure mode that
// motivated keeping these branches typed.
export class SupabaseStoreMisconfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SupabaseStoreMisconfiguredError"
  }
}

export class SupabaseStoreQueryError extends Error {
  constructor(
    public readonly tableName: string,
    public readonly cause: string,
  ) {
    super(`Supabase read on ${tableName} failed: ${cause}`)
    this.name = "SupabaseStoreQueryError"
  }
}

export class SupabaseGuidedReadStore implements GuidedReadStore {
  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {}

  // Construct from SUPABASE_URL + SUPABASE_ANON_KEY. Returns null when either
  // is unset so the factory can fall through to the next backend or throw
  // GuidedUserStateUnavailableError. Mirrors the .fromEnv() shape used by the
  // filesystem and projection stores.
  static fromEnv(): SupabaseGuidedReadStore | null {
    const url = process.env.SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY
    if (!url || url.length === 0) return null
    if (!anonKey || anonKey.length === 0) return null
    return new SupabaseGuidedReadStore(url.replace(/\/$/, ""), anonKey)
  }

  // Spike covers only the guided_enrollment_view read. The remaining three
  // methods surface as "service not configured" so the other preview pages
  // render the same error state they already do under T1.0e cutover-prep,
  // rather than crashing or silently degrading.

  readGuidedMatchProposalView(): Promise<GuidedMatchProposalView> {
    return Promise.reject(new GuidedUserStateUnavailableError())
  }

  readGuidedEnrollment(): Promise<GuidedEnrollment> {
    return Promise.reject(new GuidedUserStateUnavailableError())
  }

  readEnrollmentEventsView(): Promise<EnrollmentEventsView> {
    return Promise.reject(new GuidedUserStateUnavailableError())
  }

  async readGuidedEnrollmentView(
    enrollmentId: string,
    scope: GuidedScope,
  ): Promise<GuidedEnrollmentView> {
    assertSafeGuidedId("enrollment_id", enrollmentId)

    const authContext = await resolveCurrentAuthContext()
    if (!scopesEqual(scope, authContext.scope)) {
      throw new GuidedScopeAuthorityMismatchError(scope, authContext.scope)
    }

    const jwt = await mintSupabaseJwt(authContext.subject)
    const client = this.createScopedClient(jwt)

    const scopeId = serializeScopeId(authContext.scope)
    assertSafeGuidedId("scope_id", scopeId)

    // Step 2 spike table schema: UNIQUE (user_sub, scope_id), no
    // enrollment_id column — the enrollment_id lives inside `payload`.
    // Filtering by scope_id alone is correct: RLS first narrows to the JWT
    // subject's rows, and the unique constraint guarantees at most one
    // row remains. We then verify the payload's enrollment_id matches the
    // caller's request as a post-fetch invariant — if a future spike row
    // ever pointed at a different enrollment, surface that as invalid
    // rather than silently returning the wrong projection.
    const { data, error } = await client
      .from(SPIKE_TABLE)
      .select("payload")
      .eq("scope_id", scopeId)
      .maybeSingle()

    if (error) {
      throw new SupabaseStoreQueryError(
        SPIKE_TABLE,
        `${error.code ?? "unknown"}: ${error.message}`,
      )
    }
    if (!data) {
      // RLS hides rows that belong to other subs by returning an empty result,
      // not an error — same code path as "row was never seeded." Both surface
      // to the page as the missing-artifact empty state.
      throw new GuidedArtifactMissingError(
        `${SPIKE_TABLE}(scope_id=${scopeId})`,
      )
    }

    const result = GuidedEnrollmentViewSchema.safeParse(data.payload)
    if (!result.success) {
      const previewIssues = result.error.issues
        .slice(0, 5)
        .map(i => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")
      const more =
        result.error.issues.length > 5
          ? ` (+${result.error.issues.length - 5} more)`
          : ""
      throw new GuidedArtifactInvalidError(
        `${SPIKE_TABLE}(scope_id=${scopeId})`,
        `${result.error.issues.length} validation issue(s): ${previewIssues}${more}`,
      )
    }
    const payloadEnrollmentId = result.data.enrollment?.enrollment_id ?? null
    if (payloadEnrollmentId !== enrollmentId) {
      throw new GuidedArtifactInvalidError(
        `${SPIKE_TABLE}(scope_id=${scopeId})`,
        `payload.enrollment.enrollment_id (${String(payloadEnrollmentId)}) does not match requested enrollment_id (${enrollmentId})`,
      )
    }
    return result.data
  }

  private createScopedClient(jwt: string): SupabaseClient {
    return createClient(this.url, this.anonKey, {
      global: {
        headers: { Authorization: `Bearer ${jwt}` },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }
}

// Pinned to the scope_id convention Codex's seed uses (user_id_account_id_strategy_group_id).
// The table column is opaque text; this function is the single source of the
// dashboard-side encoding so a producer-side rename surfaces as one diff, not
// scattered string concatenations across page reads.
function serializeScopeId(scope: GuidedScope): string {
  return `${scope.user_id}_${scope.account_id}_${scope.strategy_group_id}`
}

function scopesEqual(a: GuidedScope, b: GuidedScope): boolean {
  return (
    a.user_id === b.user_id &&
    a.account_id === b.account_id &&
    a.strategy_group_id === b.strategy_group_id
  )
}
