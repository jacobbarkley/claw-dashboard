import { NextResponse } from "next/server"

import {
  GuidedArtifactInvalidError,
  GuidedArtifactMissingError,
  readQuestionnaire,
} from "@/lib/guided-data-source.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const questionnaire = await readQuestionnaire()
    return NextResponse.json(questionnaire)
  } catch (err) {
    if (err instanceof GuidedArtifactMissingError) {
      return NextResponse.json(
        { error: "questionnaire_not_found", artifact: err.artifactPath },
        { status: 404 },
      )
    }
    if (err instanceof GuidedArtifactInvalidError) {
      return NextResponse.json(
        { error: "questionnaire_invalid", artifact: err.artifactPath, reason: err.reason },
        { status: 502 },
      )
    }
    throw err
  }
}
