// Server-only Guided artifact reader.
//
// Phase 6.1 reads only public/static artifacts from data/guided/. User-state
// artifacts (proposals, enrollments, views) ship in Phase 6.2 once Codex's
// mirror writes them. The two data classes use *different* resolvers so
// public/static fallback can never accidentally serve user-state from a
// stale path:
//
//  - resolvePublicStaticRoot()
//      Public/static read root (strategy library, questionnaire, disclosures).
//      GUIDED_LOCAL_REBUILD_PATH wins if set (dev override).
//      Otherwise GUIDED_DATA_DIR (default "data/guided").
//      Always returns a path.
//
//  - resolveUserStateRoot()
//      User-state read root (proposals, enrollments, views).
//      Reads GUIDED_LOCAL_REBUILD_PATH only.
//      Returns null when unset — callers fall back to labeled mock (preview)
//      or 404 (API). Never falls back to GUIDED_DATA_DIR. data/guided/
//      will never carry user-state by design.
//
// Read-time behavior:
//  - File missing: throw GuidedArtifactMissingError. Callers decide whether
//    to 404 (API routes) or fall back to a labeled mock (preview pages).
//  - JSON parse / shape mismatch: throw GuidedArtifactInvalidError so the
//    caller can render a clear failure rather than a silent partial.

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
  EnrollmentEventsViewSchema,
  GuidedEnrollmentSchema,
  GuidedEnrollmentViewSchema,
  GuidedMatchProposalViewSchema,
  QuestionnaireSchema,
  StrategyLibrarySchema,
} from "@/lib/guided-data-source.schemas"

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
      "User-state read attempted with no GUIDED_LOCAL_REBUILD_PATH configured. " +
        "Phase 6.2 is dev-mode only; production user-state store is T2/T3.",
    )
    this.name = "GuidedUserStateUnavailableError"
  }
}

// Phase 6.2 internal scope. Multi-tenant scope routing is T2/T3 — when it
// arrives, this constant becomes a per-request resolver.
export const PHASE_6_2_INTERNAL_SCOPE: GuidedScope = {
  user_id: "jacob",
  account_id: "paper_main",
  strategy_group_id: "default",
}

function scopePath(scope: GuidedScope): string {
  return path.join(scope.user_id, scope.account_id, scope.strategy_group_id)
}

const SAFE_ID = /^[a-zA-Z0-9_.-]+$/

function assertSafeId(label: string, value: string): void {
  if (!SAFE_ID.test(value)) {
    throw new GuidedUnsafeIdError(label, value)
  }
}

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

export function resolveUserStateRoot(): string | null {
  const localOverride = process.env.GUIDED_LOCAL_REBUILD_PATH
  if (!localOverride || localOverride.length === 0) return null
  return resolveAbsolute(localOverride)
}

async function readPublicStaticArtifact<T>(relativePath: string, schema: z.ZodType<T>): Promise<T> {
  return readJsonAt<T>(path.join(resolvePublicStaticRoot(), relativePath), schema)
}

async function readUserStateArtifact<T>(relativePath: string, schema: z.ZodType<T>): Promise<T> {
  const root = resolveUserStateRoot()
  if (root === null) throw new GuidedUserStateUnavailableError()
  return readJsonAt<T>(path.join(root, relativePath), schema)
}

async function readJsonAt<T>(fullPath: string, schema: z.ZodType<T>): Promise<T> {
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

// ─── Public/static reads ────────────────────────────────────────────────────

export function readStrategyLibrary(): Promise<StrategyLibrary> {
  return readPublicStaticArtifact<StrategyLibrary>("strategy_library.json", StrategyLibrarySchema)
}

export function readQuestionnaire(): Promise<Questionnaire> {
  return readPublicStaticArtifact<Questionnaire>("questionnaire.json", QuestionnaireSchema)
}

export function readDisclosureVersion(disclosureVersionId: string): Promise<DisclosureVersion> {
  assertSafeId("disclosure_version_id", disclosureVersionId)
  return readPublicStaticArtifact<DisclosureVersion>(
    path.join("disclosures", `${disclosureVersionId}.json`),
    DisclosureVersionSchema,
  )
}

// ─── User-state reads (Phase 6.2 — GUIDED_LOCAL_REBUILD_PATH only) ──────────

export function readGuidedMatchProposalView(
  proposalId: string,
  scope: GuidedScope = PHASE_6_2_INTERNAL_SCOPE,
): Promise<GuidedMatchProposalView> {
  assertSafeId("proposal_id", proposalId)
  return readUserStateArtifact<GuidedMatchProposalView>(
    path.join("views", scopePath(scope), "proposals", proposalId, "guided_match_proposal_view.json"),
    GuidedMatchProposalViewSchema,
  )
}

export function readGuidedEnrollment(
  enrollmentId: string,
  scope: GuidedScope = PHASE_6_2_INTERNAL_SCOPE,
): Promise<GuidedEnrollment> {
  assertSafeId("enrollment_id", enrollmentId)
  return readUserStateArtifact<GuidedEnrollment>(
    path.join("enrollments", scopePath(scope), `${enrollmentId}.json`),
    GuidedEnrollmentSchema,
  )
}

export function readGuidedEnrollmentView(
  enrollmentId: string,
  scope: GuidedScope = PHASE_6_2_INTERNAL_SCOPE,
): Promise<GuidedEnrollmentView> {
  assertSafeId("enrollment_id", enrollmentId)
  return readUserStateArtifact<GuidedEnrollmentView>(
    path.join("views", scopePath(scope), enrollmentId, "guided_enrollment_view.json"),
    GuidedEnrollmentViewSchema,
  )
}

export function readEnrollmentEventsView(
  enrollmentId: string,
  scope: GuidedScope = PHASE_6_2_INTERNAL_SCOPE,
): Promise<EnrollmentEventsView> {
  assertSafeId("enrollment_id", enrollmentId)
  return readUserStateArtifact<EnrollmentEventsView>(
    path.join("views", scopePath(scope), enrollmentId, "enrollment_events_view.json"),
    EnrollmentEventsViewSchema,
  )
}
