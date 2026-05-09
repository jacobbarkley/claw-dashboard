// Dev/preview filesystem implementation of GuidedReadStore. Reads JSON
// artifacts produced by the Guided runtime under GUIDED_LOCAL_REBUILD_PATH.
// Production reads come from GuidedProjectionReadStore (T1.0e); this
// implementation stays in dev for the read loop that doesn't require a
// running Codex command/projection service.

import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"
import type { z } from "zod"

import type {
  EnrollmentEventsView,
  GuidedEnrollment,
  GuidedEnrollmentView,
  GuidedMatchProposalView,
  GuidedScope,
} from "@/components/vires/guided/types"
import {
  EnrollmentEventsViewSchema,
  GuidedEnrollmentSchema,
  GuidedEnrollmentViewSchema,
  GuidedMatchProposalViewSchema,
} from "@/lib/guided-data-source.schemas"
import {
  GuidedArtifactInvalidError,
  GuidedArtifactMissingError,
  assertSafeGuidedId,
  type GuidedReadStore,
} from "@/lib/guided-read-store.server"

export class FilesystemGuidedReadStore implements GuidedReadStore {
  constructor(private readonly userStateRoot: string) {}

  // Construct from GUIDED_LOCAL_REBUILD_PATH; return null when unset so the
  // caller can decide whether to fall back to the projection store or surface
  // GuidedUserStateUnavailableError.
  static fromEnv(): FilesystemGuidedReadStore | null {
    const localOverride = process.env.GUIDED_LOCAL_REBUILD_PATH
    if (!localOverride || localOverride.length === 0) return null
    return new FilesystemGuidedReadStore(resolveAbsolute(localOverride))
  }

  readGuidedMatchProposalView(
    proposalId: string,
    scope: GuidedScope,
  ): Promise<GuidedMatchProposalView> {
    assertSafeGuidedId("proposal_id", proposalId)
    return this.readJson(
      path.join(
        "views",
        scopePath(scope),
        "proposals",
        proposalId,
        "guided_match_proposal_view.json",
      ),
      GuidedMatchProposalViewSchema,
    )
  }

  readGuidedEnrollment(
    enrollmentId: string,
    scope: GuidedScope,
  ): Promise<GuidedEnrollment> {
    assertSafeGuidedId("enrollment_id", enrollmentId)
    return this.readJson(
      path.join("enrollments", scopePath(scope), `${enrollmentId}.json`),
      GuidedEnrollmentSchema,
    )
  }

  readGuidedEnrollmentView(
    enrollmentId: string,
    scope: GuidedScope,
  ): Promise<GuidedEnrollmentView> {
    assertSafeGuidedId("enrollment_id", enrollmentId)
    return this.readJson(
      path.join("views", scopePath(scope), enrollmentId, "guided_enrollment_view.json"),
      GuidedEnrollmentViewSchema,
    )
  }

  readEnrollmentEventsView(
    enrollmentId: string,
    scope: GuidedScope,
  ): Promise<EnrollmentEventsView> {
    assertSafeGuidedId("enrollment_id", enrollmentId)
    return this.readJson(
      path.join("views", scopePath(scope), enrollmentId, "enrollment_events_view.json"),
      EnrollmentEventsViewSchema,
    )
  }

  private async readJson<T>(relativePath: string, schema: z.ZodType<T>): Promise<T> {
    const fullPath = path.join(this.userStateRoot, relativePath)
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
}

function scopePath(scope: GuidedScope): string {
  return path.join(scope.user_id, scope.account_id, scope.strategy_group_id)
}

function resolveAbsolute(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
}
