import { NextResponse } from "next/server"

import {
  GuidedArtifactInvalidError,
  GuidedArtifactMissingError,
  GuidedUnsafeIdError,
  GuidedUserStateUnavailableError,
  readGuidedEnrollment,
} from "@/lib/guided-data-source.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await context.params
  try {
    const enrollment = await readGuidedEnrollment(enrollmentId)
    return NextResponse.json(enrollment)
  } catch (err) {
    if (err instanceof GuidedUnsafeIdError) {
      return NextResponse.json(
        { error: "invalid_enrollment_id", field: err.label, value: err.value, reason: err.message },
        { status: 400 },
      )
    }
    if (err instanceof GuidedUserStateUnavailableError) {
      return NextResponse.json({ error: "user_state_unavailable", reason: err.message }, { status: 503 })
    }
    if (err instanceof GuidedArtifactMissingError) {
      return NextResponse.json(
        { error: "enrollment_not_found", artifact: err.artifactPath },
        { status: 404 },
      )
    }
    if (err instanceof GuidedArtifactInvalidError) {
      return NextResponse.json(
        { error: "enrollment_invalid", artifact: err.artifactPath, reason: err.reason },
        { status: 502 },
      )
    }
    throw err
  }
}
