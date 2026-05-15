// Server-only Guided artifact reader — public-static reads + delegated user-state reads.
//
// Public/static artifacts (strategy library, questionnaire, disclosures) live
// in data/guided/ and are read here. They are versioned, curated, public
// content; they stay in git per the kickoff plan §2.9.
//
// User-state artifacts (proposals, enrollments, views, events) are read
// through a GuidedReadStore implementation selected at request time:
//   - FilesystemGuidedReadStore: dev/preview, GUIDED_LOCAL_REBUILD_PATH set.
//   - GuidedProjectionReadStore: production, T1.0e (HTTP to Codex's
//     projection endpoint). Not implemented in T1.0c.
//
// The exported function signatures and error classes are stable across the
// migration so the seven preview-page server components don't change when
// storage shape changes (kickoff plan §2.7).
//
// Sources of truth (vires-numeris):
//   - User-state JSON shapes: src/openclaw_core/models/guided.py + the
//     projection-parity validator at src/openclaw_core/models/guided_command_service.py
//     (validate_guided_projection_payload).
//   - HTTP projection routes: GUIDED_PROJECTION_ROUTE_PREFIX in
//     src/openclaw_core/models/guided_command_service.py — used by the
//     T1.0e projection store implementation.

import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"
import type { z } from "zod"

import type {
  DisclosureVersion,
  EnrollmentEventsView,
  GuidedEnrollment,
  GuidedEnrollmentView,
  GuidedMatchProposalView,
  GuidedScope,
  Questionnaire,
  StrategyLibrary,
} from "@/components/vires/guided/types"
import {
  DisclosureVersionSchema,
  QuestionnaireSchema,
  StrategyLibrarySchema,
} from "@/lib/guided-data-source.schemas"
import { FilesystemGuidedReadStore } from "@/lib/guided-read-store.filesystem.server"
import {
  GuidedProjectionReadStore,
  GuidedScopeAuthorityMismatchError,
  ProjectionServiceErrorResponseError,
  ProjectionServiceMalformedResponseError,
  ProjectionServiceUnreachableError,
} from "@/lib/guided-read-store.projection.server"
import {
  GuidedArtifactInvalidError,
  GuidedArtifactMissingError,
  GuidedUnsafeIdError,
  GuidedUserStateUnavailableError,
  assertSafeGuidedId,
  type GuidedReadStore,
} from "@/lib/guided-read-store.server"
import { SupabaseGuidedReadStore } from "@/lib/guided-read-store.supabase.server"

// Re-export error classes so preview pages import the seam, not the
// underlying store implementations. Pages branch on these by instanceof to
// render the right state — empty vs. service-error vs. caller bug.
export {
  GuidedArtifactInvalidError,
  GuidedArtifactMissingError,
  GuidedScopeAuthorityMismatchError,
  GuidedUnsafeIdError,
  GuidedUserStateUnavailableError,
  ProjectionServiceErrorResponseError,
  ProjectionServiceMalformedResponseError,
  ProjectionServiceUnreachableError,
}
export type { GuidedReadStore }

// T1.0d closed GUIDED-T1-HARDCODED-SCOPE-REMOVAL. Callers now pass an
// explicit GuidedScope obtained from resolveCurrentScope() (in
// lib/guided-scope.server.ts), which is the single authority for caller
// identity. This module no longer carries a default scope constant.

function resolveAbsolute(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
}

export function resolvePublicStaticRoot(): string {
  const localOverride = process.env.GUIDED_LOCAL_REBUILD_PATH
  if (localOverride && localOverride.length > 0) {
    return resolveAbsolute(localOverride)
  }
  const configured = process.env.GUIDED_DATA_DIR ?? "data/guided"
  return resolveAbsolute(configured)
}

// Resolve the user-state read store at request time. Selection precedence:
//   1. GUIDED_READ_STORE=supabase → SupabaseGuidedReadStore (Step 2 RLS spike;
//      requires SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_JWT_SECRET).
//      This branch supersedes the others on Vercel Preview during the spike
//      and is intended to graduate to the production backend after Step 3
//      (WorkOS auth) lands and HS256 → ES256 migration is resolved.
//   2. CODEX_PROJECTION_BASE_URL set → GuidedProjectionReadStore (T1.0e skeleton
//      — pre-supabase production cutover path, kept so Codex's projection
//      endpoint remains available as a fallback if the Supabase spike is
//      paused).
//   3. GUIDED_LOCAL_REBUILD_PATH set → FilesystemGuidedReadStore (dev/preview).
//   4. None set → throw GuidedUserStateUnavailableError so callers render the
//      configured-error empty state.
//
// The supabase branch is explicit (string equality, not "any non-empty") so
// future values like "supabase-direct" or "supabase-rest" can be added without
// silently grabbing partially-configured environments.
function resolveUserStateStore(): GuidedReadStore {
  if (process.env.GUIDED_READ_STORE === "supabase") {
    const supabase = SupabaseGuidedReadStore.fromEnv()
    if (supabase !== null) return supabase
    // Flag flipped but credentials missing — surface as the same configured-
    // error UI the rest of the cascade uses, not as a silent fall-through.
    throw new GuidedUserStateUnavailableError()
  }
  const projection = GuidedProjectionReadStore.fromEnv()
  if (projection !== null) return projection
  const filesystem = FilesystemGuidedReadStore.fromEnv()
  if (filesystem !== null) return filesystem
  throw new GuidedUserStateUnavailableError()
}

async function readPublicStaticArtifact<T>(
  relativePath: string,
  schema: z.ZodType<T>,
): Promise<T> {
  return readPublicStaticJson<T>(path.join(resolvePublicStaticRoot(), relativePath), schema)
}

async function readPublicStaticJson<T>(fullPath: string, schema: z.ZodType<T>): Promise<T> {
  let raw: string
  try {
    raw = await readFile(fullPath, "utf8")
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") throw new GuidedArtifactMissingError(fullPath)
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new GuidedArtifactInvalidError(fullPath, `JSON parse failed: ${(err as Error).message}`)
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    const previewIssues = result.error.issues
      .slice(0, 5)
      .map(i => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ")
    const more = result.error.issues.length > 5 ? ` (+${result.error.issues.length - 5} more)` : ""
    throw new GuidedArtifactInvalidError(
      fullPath,
      `${result.error.issues.length} validation issue(s): ${previewIssues}${more}`,
    )
  }
  return result.data
}

// ─── Public/static reads (data/guided/) ─────────────────────────────────────

export function readStrategyLibrary(): Promise<StrategyLibrary> {
  return readPublicStaticArtifact<StrategyLibrary>("strategy_library.json", StrategyLibrarySchema)
}

export function readQuestionnaire(): Promise<Questionnaire> {
  return readPublicStaticArtifact<Questionnaire>("questionnaire.json", QuestionnaireSchema)
}

export function readDisclosureVersion(disclosureVersionId: string): Promise<DisclosureVersion> {
  assertSafeGuidedId("disclosure_version_id", disclosureVersionId)
  return readPublicStaticArtifact<DisclosureVersion>(
    path.join("disclosures", `${disclosureVersionId}.json`),
    DisclosureVersionSchema,
  )
}

// ─── User-state reads (delegated to GuidedReadStore) ────────────────────────

export function readGuidedMatchProposalView(
  proposalId: string,
  scope: GuidedScope,
): Promise<GuidedMatchProposalView> {
  return resolveUserStateStore().readGuidedMatchProposalView(proposalId, scope)
}

export function readGuidedEnrollment(
  enrollmentId: string,
  scope: GuidedScope,
): Promise<GuidedEnrollment> {
  return resolveUserStateStore().readGuidedEnrollment(enrollmentId, scope)
}

export function readGuidedEnrollmentView(
  enrollmentId: string,
  scope: GuidedScope,
): Promise<GuidedEnrollmentView> {
  return resolveUserStateStore().readGuidedEnrollmentView(enrollmentId, scope)
}

export function readEnrollmentEventsView(
  enrollmentId: string,
  scope: GuidedScope,
): Promise<EnrollmentEventsView> {
  return resolveUserStateStore().readEnrollmentEventsView(enrollmentId, scope)
}
