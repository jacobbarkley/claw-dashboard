import { NextResponse } from "next/server"

import {
  GuidedArtifactInvalidError,
  GuidedArtifactMissingError,
  GuidedUnsafeIdError,
  readDisclosureVersion,
} from "@/lib/guided-data-source.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const disclosure = await readDisclosureVersion(id)
    return NextResponse.json(disclosure)
  } catch (err) {
    if (err instanceof GuidedUnsafeIdError) {
      return NextResponse.json(
        { error: "invalid_disclosure_id", field: err.label, value: err.value, reason: err.message },
        { status: 400 },
      )
    }
    if (err instanceof GuidedArtifactMissingError) {
      return NextResponse.json(
        { error: "disclosure_not_found", artifact: err.artifactPath },
        { status: 404 },
      )
    }
    if (err instanceof GuidedArtifactInvalidError) {
      return NextResponse.json(
        { error: "disclosure_invalid", artifact: err.artifactPath, reason: err.reason },
        { status: 400 },
      )
    }
    throw err
  }
}
