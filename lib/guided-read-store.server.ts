// Provider-neutral read seam in front of Phase 6 user-state reads. Sits
// behind the stable lib/guided-data-source.server.ts exports so server
// components don't change when the storage layer changes.
//
// Implementations:
//   - FilesystemGuidedReadStore — dev/preview, JSON files under
//     GUIDED_LOCAL_REBUILD_PATH. Phase 6.2 read loop.
//   - GuidedProjectionReadStore — production, T1.0e. HTTP to Codex's
//     projection endpoint (vires-numeris /guided/v1/projections/<segment>/<id>).
//
// The interface methods take typed (id, scope) tuples and return typed
// projections matching the dashboard's existing zod schemas. No path
// strings, no SQL fragments, no DB driver types appear in this surface —
// the Postgres adapter (or whatever store backs the projections) lives
// strictly inside Codex's runtime, behind the HTTP boundary.

import "server-only"

import type {
  EnrollmentEventsView,
  GuidedEnrollment,
  GuidedEnrollmentView,
  GuidedMatchProposalView,
  GuidedScope,
} from "@/components/vires/guided/types"

export interface GuidedReadStore {
  readGuidedMatchProposalView(
    proposalId: string,
    scope: GuidedScope,
  ): Promise<GuidedMatchProposalView>
  readGuidedEnrollment(
    enrollmentId: string,
    scope: GuidedScope,
  ): Promise<GuidedEnrollment>
  readGuidedEnrollmentView(
    enrollmentId: string,
    scope: GuidedScope,
  ): Promise<GuidedEnrollmentView>
  readEnrollmentEventsView(
    enrollmentId: string,
    scope: GuidedScope,
  ): Promise<EnrollmentEventsView>
}

// Implementations throw the error classes below. Callers (server components,
// route handlers) discriminate on `instanceof` to render the right surface
// (mock fallback / not-found / hard error).

export class GuidedArtifactMissingError extends Error {
  constructor(public readonly artifactPath: string) {
    super(`Guided artifact missing: ${artifactPath}`)
    this.name = "GuidedArtifactMissingError"
  }
}

export class GuidedArtifactInvalidError extends Error {
  constructor(public readonly artifactPath: string, public readonly reason: string) {
    super(`Guided artifact invalid (${artifactPath}): ${reason}`)
    this.name = "GuidedArtifactInvalidError"
  }
}

export class GuidedUnsafeIdError extends Error {
  constructor(
    public readonly label: string,
    public readonly value: string,
  ) {
    super(`${label} contains characters outside [a-zA-Z0-9_.-]`)
    this.name = "GuidedUnsafeIdError"
  }
}

export class GuidedUserStateUnavailableError extends Error {
  constructor() {
    super(
      "User-state read attempted with no reachable Guided store. " +
        "Filesystem mode requires GUIDED_LOCAL_REBUILD_PATH; " +
        "projection mode (T1.0e) requires CODEX_PROJECTION_BASE_URL.",
    )
    this.name = "GuidedUserStateUnavailableError"
  }
}

const SAFE_ID = /^[a-zA-Z0-9_.-]+$/

// Shared id-safety check used by every read-store implementation. Centralized
// here so the regex (and the error class) can't drift between impls.
export function assertSafeGuidedId(label: string, value: string): void {
  if (!SAFE_ID.test(value)) {
    throw new GuidedUnsafeIdError(label, value)
  }
}
