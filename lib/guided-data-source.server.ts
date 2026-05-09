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
  GuidedArtifactInvalidError,
  GuidedArtifactMissingError,
  GuidedUnsafeIdError,
  GuidedUserStateUnavailableError,
  assertSafeGuidedId,
  type GuidedReadStore,
} from "@/lib/guided-read-store.server"

// Re-export error classes so the seven preview pages keep their existing
// imports working through the read-seam refactor.
export {
  GuidedArtifactInvalidError,
  GuidedArtifactMissingError,
  GuidedUnsafeIdError,
  GuidedUserStateUnavailableError,
}
export type { GuidedReadStore }

// PHASE_6_2_INTERNAL_SCOPE was removed at T1.0d. Callers must derive
// scope from the authenticated session via lib/guided-scope.server.ts
// (resolveCurrentScope) and pass it explicitly into the read helpers
// below. This closes GUIDED-T1-HARDCODED-SCOPE-REMOVAL (T1 sub) — no
// permanent default-scope fallback exists in production code.

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

// Resolve the user-state read store at request time. T1.0c ships only the
// filesystem implementation; the projection (HTTP) implementation lands at
// T1.0e. When neither store is reachable, throw GuidedUserStateUnavailableError
// so callers can render the labeled mock fallback (preview pages) or 503 (API).
function resolveUserStateStore(): GuidedReadStore {
  const filesystem = FilesystemGuidedReadStore.fromEnv()
  if (filesystem !== null) return filesystem
  // Future (T1.0e): if process.env.CODEX_PROJECTION_BASE_URL is set, return
  // GuidedProjectionReadStore.fromEnv() here.
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
//
// Scope is required explicitly. Callers resolve scope from the authenticated
// session via resolveCurrentScope() and pass it in. There is no default
// fallback — an unauthenticated caller never gets a real read. Per
// GUIDED-T1-HARDCODED-SCOPE-REMOVAL closure (T1 sub).

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
