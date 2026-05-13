// Production HTTP implementation of GuidedReadStore (T1.0e).
//
// Reads user-state projections from Codex's runtime over HTTP. While
// CODEX_PROJECTION_BASE_URL is unset (current Vercel production state) this
// store is not selected and production behavior is unchanged — the filesystem
// store handles dev reads, and prod throws GuidedUserStateUnavailableError.
// Setting the env var in the coordinated cutover activates this store.
//
// Sources of truth (vires-numeris):
//   - GUIDED_PROJECTION_ROUTE_PREFIX + GUIDED_PROJECTION_ROUTE_SEGMENTS:
//     src/openclaw_core/models/guided_command_service.py
//   - Projection payload shapes: src/openclaw_core/models/guided.py
//     (mirrored zod schemas live in lib/guided-data-source.schemas.ts)
//   - Error envelope shape: src/openclaw_core/services/guided_projection_service.py
//     (mirrored at lib/guided-projection.schemas.ts — projection-side
//     error_code enum, separate from the command-side enum)
//
// Drift between repos = silently broken reads. Route prefix and segment
// strings below are pinned. If Codex changes one, mirror it here in the same
// contract slice.

import "server-only"

import { randomUUID } from "node:crypto"
import type { z } from "zod"

import type {
  EnrollmentEventsView,
  GuidedEnrollment,
  GuidedEnrollmentView,
  GuidedMatchProposalView,
  GuidedScope,
} from "@/components/vires/guided/types"
import { mintGuidedCommandJwt } from "@/lib/guided-command-auth.server"
import {
  EnrollmentEventsViewSchema,
  GuidedEnrollmentSchema,
  GuidedEnrollmentViewSchema,
  GuidedMatchProposalViewSchema,
} from "@/lib/guided-data-source.schemas"
import {
  GuidedProjectionErrorEnvelopeSchema,
  type GuidedProjectionErrorEnvelope,
} from "@/lib/guided-projection.schemas"
import {
  GuidedArtifactInvalidError,
  GuidedArtifactMissingError,
  assertSafeGuidedId,
  type GuidedReadStore,
} from "@/lib/guided-read-store.server"
import { resolveCurrentAuthContext } from "@/lib/guided-scope.server"

// ─── Pinned constants (mirrors of vires-numeris contract) ───────────────────

// Pinned to GUIDED_PROJECTION_ROUTE_PREFIX in guided_command_service.py.
const GUIDED_PROJECTION_ROUTE_PREFIX = "/guided/v1/projections"
// Pinned to GUIDED_PROJECTION_ROUTE_SEGMENTS in guided_command_service.py.
// The fifth segment (questionnaires-in-progress) is intentionally omitted —
// the dashboard GuidedReadStore surface does not include a questionnaire-
// resume read today. T1.1 questionnaire persistence will add it.
const SEGMENT_MATCH_PROPOSAL_VIEW = "match-proposal-views"
const SEGMENT_ENROLLMENT = "enrollments"
const SEGMENT_ENROLLMENT_VIEW = "enrollment-views"
const SEGMENT_ENROLLMENT_EVENTS_VIEW = "enrollment-events"
// Pinned to GUIDED_COMMAND_AUTH_HEADER + GUIDED_COMMAND_AUTH_SCHEME.
const AUTH_HEADER = "Authorization"
const AUTH_SCHEME = "Bearer"
// Pinned to GUIDED_REQUEST_ID_HEADER.
const REQUEST_ID_HEADER = "X-Request-ID"

// ─── Error classes ──────────────────────────────────────────────────────────

// Distinct from the command-client classes so callers can branch on
// instanceof and render projection-specific UI (e.g. "no proposal yet"
// empty state vs. "service temporarily unavailable" error state).

export class ProjectionServiceUnreachableError extends Error {
  constructor(reason: string) {
    super(`Guided projection service unreachable: ${reason}`)
    this.name = "ProjectionServiceUnreachableError"
  }
}

export class ProjectionServiceErrorResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: GuidedProjectionErrorEnvelope,
  ) {
    super(
      `Guided projection service returned ${status}: ${envelope.error_code} — ${envelope.error_message}`,
    )
    this.name = "ProjectionServiceErrorResponseError"
  }
}

export class ProjectionServiceMalformedResponseError extends Error {
  constructor(public readonly status: number, reason: string) {
    super(
      `Guided projection service returned a malformed response (status ${status}): ${reason}`,
    )
    this.name = "ProjectionServiceMalformedResponseError"
  }
}

// Caller-passed scope is a typed convenience; the projection store mints its
// JWT from the authenticated session and treats that scope as authority.
// Mismatch between the two is a caller bug — surface it early as a typed
// error here rather than round-tripping a SCOPE_MISMATCH from vires-numeris.
export class GuidedScopeAuthorityMismatchError extends Error {
  constructor(
    public readonly passedScope: GuidedScope,
    public readonly authoritativeScope: GuidedScope,
  ) {
    super(
      "Caller-passed scope does not match the authoritative scope from the " +
        "authenticated session. Read the scope from resolveCurrentScope()/" +
        "resolveCurrentAuthContext() and pass it unchanged.",
    )
    this.name = "GuidedScopeAuthorityMismatchError"
  }
}

// ─── Implementation ────────────────────────────────────────────────────────

export class GuidedProjectionReadStore implements GuidedReadStore {
  constructor(private readonly baseUrl: string) {}

  // Construct from CODEX_PROJECTION_BASE_URL; return null when unset so the
  // caller can decide whether to fall back to the filesystem store or surface
  // GuidedUserStateUnavailableError. Mirrors FilesystemGuidedReadStore.fromEnv().
  //
  // Intentionally does NOT eager-read CODEX_COMMAND_JWT_HS256_SECRET — that is
  // read by mintGuidedCommandJwt on each call. Constructing the store does
  // not require an auth secret, matching the T1.0d lazy-init contract.
  static fromEnv(): GuidedProjectionReadStore | null {
    const baseUrl = process.env.CODEX_PROJECTION_BASE_URL
    if (!baseUrl || baseUrl.length === 0) return null
    return new GuidedProjectionReadStore(baseUrl.replace(/\/$/, ""))
  }

  readGuidedMatchProposalView(
    proposalId: string,
    scope: GuidedScope,
  ): Promise<GuidedMatchProposalView> {
    assertSafeGuidedId("proposal_id", proposalId)
    return this.readProjection(
      SEGMENT_MATCH_PROPOSAL_VIEW,
      proposalId,
      scope,
      GuidedMatchProposalViewSchema,
    )
  }

  readGuidedEnrollment(
    enrollmentId: string,
    scope: GuidedScope,
  ): Promise<GuidedEnrollment> {
    assertSafeGuidedId("enrollment_id", enrollmentId)
    return this.readProjection(
      SEGMENT_ENROLLMENT,
      enrollmentId,
      scope,
      GuidedEnrollmentSchema,
    )
  }

  readGuidedEnrollmentView(
    enrollmentId: string,
    scope: GuidedScope,
  ): Promise<GuidedEnrollmentView> {
    assertSafeGuidedId("enrollment_id", enrollmentId)
    return this.readProjection(
      SEGMENT_ENROLLMENT_VIEW,
      enrollmentId,
      scope,
      GuidedEnrollmentViewSchema,
    )
  }

  readEnrollmentEventsView(
    enrollmentId: string,
    scope: GuidedScope,
  ): Promise<EnrollmentEventsView> {
    assertSafeGuidedId("enrollment_id", enrollmentId)
    return this.readProjection(
      SEGMENT_ENROLLMENT_EVENTS_VIEW,
      enrollmentId,
      scope,
      EnrollmentEventsViewSchema,
    )
  }

  private async readProjection<T>(
    segment: string,
    recordId: string,
    passedScope: GuidedScope,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const authContext = await resolveCurrentAuthContext()
    if (!scopesEqual(passedScope, authContext.scope)) {
      throw new GuidedScopeAuthorityMismatchError(passedScope, authContext.scope)
    }

    const jwt = await mintGuidedCommandJwt({
      scope: authContext.scope,
      actorType: authContext.actorType,
      actorId: authContext.actorId,
      subject: authContext.subject,
    })

    const requestId = randomUUID()
    const url = `${this.baseUrl}${GUIDED_PROJECTION_ROUTE_PREFIX}/${segment}/${encodeURIComponent(recordId)}`
    const headers: Record<string, string> = {
      Accept: "application/json",
      [AUTH_HEADER]: `${AUTH_SCHEME} ${jwt}`,
      [REQUEST_ID_HEADER]: requestId,
    }

    let response: Response
    try {
      response = await fetch(url, { method: "GET", headers })
    } catch (err) {
      // Network-layer failure (DNS, connect, TLS, mid-handshake abort).
      // Surface as ProjectionServiceUnreachableError so callers branch on
      // instanceof rather than catching a raw TypeError.
      throw new ProjectionServiceUnreachableError(
        `fetch to ${url} failed: ${(err as Error).message}`,
      )
    }

    const rawText = await response.text()

    if (!response.ok) {
      // Decode the error envelope before branching. 404 carries
      // PROJECTION_NOT_FOUND (the user-facing "no record yet" case →
      // GuidedArtifactMissingError) or UNKNOWN_PROJECTION (bad URL segment
      // → contract bug, surface as ProjectionServiceErrorResponseError so
      // the page treats it as a service-level fault rather than missing
      // user state). Decoding for both lets the dashboard distinguish
      // intentionally-absent records from contract drift instead of
      // collapsing every 404 into "missing".
      let parsed: unknown
      try {
        parsed = rawText.length > 0 ? JSON.parse(rawText) : {}
      } catch (err) {
        throw new ProjectionServiceMalformedResponseError(
          response.status,
          `Non-JSON error body: ${(err as Error).message}`,
        )
      }
      const decoded = GuidedProjectionErrorEnvelopeSchema.safeParse(parsed)
      if (!decoded.success) {
        throw new ProjectionServiceMalformedResponseError(
          response.status,
          `Error envelope failed validation: ${decoded.error.message}`,
        )
      }
      if (response.status === 404 && decoded.data.error_code === "PROJECTION_NOT_FOUND") {
        // Map "no projection record" to the same error class the filesystem
        // store throws for ENOENT, so preview pages branch on a single
        // GuidedArtifactMissingError signal regardless of store backend.
        throw new GuidedArtifactMissingError(url)
      }
      throw new ProjectionServiceErrorResponseError(response.status, decoded.data)
    }

    let parsedJson: unknown
    try {
      parsedJson = rawText.length > 0 ? JSON.parse(rawText) : null
    } catch (err) {
      throw new ProjectionServiceMalformedResponseError(
        response.status,
        `Non-JSON success body: ${(err as Error).message}`,
      )
    }

    // Enforce X-Request-ID echo on 2xx. vires-numeris projection service
    // includes the request id in response_headers when the inbound header
    // is set, so absence or drift on a 2xx is a contract violation worth
    // surfacing as a malformed response rather than silently trusting the
    // body. Pinned mirror of the command-client behavior.
    const responseRequestIdHeader = response.headers.get(REQUEST_ID_HEADER)
    if (!responseRequestIdHeader) {
      throw new ProjectionServiceMalformedResponseError(
        response.status,
        `Missing required ${REQUEST_ID_HEADER} response header on 2xx.`,
      )
    }
    if (responseRequestIdHeader !== requestId) {
      throw new ProjectionServiceMalformedResponseError(
        response.status,
        `${REQUEST_ID_HEADER} response header (${responseRequestIdHeader}) does not match outgoing request id (${requestId}).`,
      )
    }

    const result = schema.safeParse(parsedJson)
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
        url,
        `${result.error.issues.length} validation issue(s): ${previewIssues}${more}`,
      )
    }
    return result.data
  }
}

function scopesEqual(a: GuidedScope, b: GuidedScope): boolean {
  return (
    a.user_id === b.user_id &&
    a.account_id === b.account_id &&
    a.strategy_group_id === b.strategy_group_id
  )
}
