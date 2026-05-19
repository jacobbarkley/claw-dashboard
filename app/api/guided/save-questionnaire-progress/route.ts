// POST handler for the Guided `save_questionnaire_progress` command.
//
// This is the standalone "Maybe later" path on the match surface — user
// bails without declining, and we want to preserve their questionnaire
// answers so they can resume. The questionnaire snapshot itself lives on
// the runtime side (under user scope); this handler just forwards the
// command. See concurrent ledger row: GUIDED-T1-QUESTIONNAIRE-PERSISTENCE.

import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"

import {
  CommandIdempotencyKeyError,
  CommandServiceErrorResponseError,
  CommandServiceMalformedResponseError,
  CommandServiceUnreachableError,
  postGuidedCommand,
} from "@/lib/guided-commands.server"
import { SaveQuestionnaireProgressPayloadSchema } from "@/lib/guided-decline.schemas"
import {
  UnauthenticatedError,
  UnknownScopeIdentityError,
  resolveCurrentAuthContext,
} from "@/lib/guided-scope.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAYBE_LATER_NEXT_PATH = "/vires/guided/preview"

export async function POST(request: NextRequest) {
  let parsedBody: unknown
  try {
    parsedBody = await request.json()
  } catch {
    // Empty body is OK for this command — defaults apply.
    parsedBody = {}
  }

  const decoded = SaveQuestionnaireProgressPayloadSchema.safeParse(parsedBody)
  if (!decoded.success) {
    return NextResponse.json(
      { error: "invalid_payload", reason: decoded.error.flatten() },
      { status: 400 },
    )
  }

  let authContext
  try {
    authContext = await resolveCurrentAuthContext()
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
    }
    if (err instanceof UnknownScopeIdentityError) {
      return NextResponse.json(
        { error: "unknown_scope_identity", email: err.email },
        { status: 403 },
      )
    }
    throw err
  }

  const idempotencyKey = `qprog:${authContext.subject}:${randomUUID()}`

  try {
    await postGuidedCommand("save_questionnaire_progress", {
      payload: decoded.data,
      authContext,
      idempotencyKey,
    })
    return NextResponse.json(
      { ok: true, next_path: MAYBE_LATER_NEXT_PATH },
      { status: 200 },
    )
  } catch (err) {
    if (err instanceof CommandServiceUnreachableError) {
      return NextResponse.json(
        {
          error: "command_service_unreachable",
          reason: err.message,
          next_path: MAYBE_LATER_NEXT_PATH,
        },
        { status: 503 },
      )
    }
    if (err instanceof CommandServiceErrorResponseError) {
      return NextResponse.json(
        { error: "command_service_error", status: err.status, envelope: err.envelope },
        { status: err.status },
      )
    }
    if (err instanceof CommandServiceMalformedResponseError) {
      return NextResponse.json(
        { error: "command_service_malformed_response", reason: err.message },
        { status: 502 },
      )
    }
    if (err instanceof CommandIdempotencyKeyError) {
      return NextResponse.json(
        { error: "idempotency_key_error", reason: err.message },
        { status: 500 },
      )
    }
    throw err
  }
}
