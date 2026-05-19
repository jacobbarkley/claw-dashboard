// POST handler for the Guided `decline_match` command (VIR-9).
//
// The client (components/vires/guided/decline-match-surface.tsx) submits
// here. We resolve auth/scope from the session, mint an idempotency key,
// then call postGuidedCommand("decline_match", ...) — which mints the
// scoped JWT and forwards to Codex's command service.
//
// `decline_match` is NOT in IRREVERSIBLE_GUIDED_COMMANDS — a user can
// re-match or re-questionnaire afterwards — but we still send an
// idempotency key so a double-click doesn't double-record the decline.

import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"

import {
  CommandIdempotencyKeyError,
  CommandServiceErrorResponseError,
  CommandServiceMalformedResponseError,
  CommandServiceUnreachableError,
  postGuidedCommand,
} from "@/lib/guided-commands.server"
import {
  DeclineMatchPayloadSchema,
  DeclineMatchResultSchema,
  type DeclineForwardPath,
} from "@/lib/guided-decline.schemas"
import {
  UnauthenticatedError,
  UnknownScopeIdentityError,
  resolveCurrentAuthContext,
} from "@/lib/guided-scope.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const FORWARD_PATH_NEXT: Record<DeclineForwardPath, string> = {
  request_re_questionnaire: "/vires/guided/preview/questionnaire",
  request_rematch_now: "/vires/guided/preview/match",
  maybe_later: "/vires/guided/preview",
}

export async function POST(request: NextRequest) {
  let parsedBody: unknown
  try {
    parsedBody = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const decoded = DeclineMatchPayloadSchema.safeParse(parsedBody)
  if (!decoded.success) {
    return NextResponse.json(
      { error: "invalid_payload", reason: decoded.error.flatten() },
      { status: 400 },
    )
  }
  const payload = decoded.data

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

  const idempotencyKey = `decline:${payload.proposal_id}:${randomUUID()}`

  try {
    const commandResult = await postGuidedCommand("decline_match", {
      payload,
      authContext,
      idempotencyKey,
    })
    const result = DeclineMatchResultSchema.safeParse(commandResult.result)
    if (!result.success) {
      // Runtime is the contract owner — until the result shape stabilizes,
      // surface a 502 here. The optimistic UI client falls back to the
      // forward_path the user requested.
      return NextResponse.json(
        {
          ok: true,
          forward_path: payload.forward_path,
          next_path: FORWARD_PATH_NEXT[payload.forward_path],
          warning: "result_shape_unverified",
        },
        { status: 200 },
      )
    }
    return NextResponse.json(
      {
        ok: true,
        decline_id: result.data.decline_id,
        forward_path: result.data.forward_path,
        next_path: result.data.next_path ?? FORWARD_PATH_NEXT[result.data.forward_path],
      },
      { status: 200 },
    )
  } catch (err) {
    if (err instanceof CommandServiceUnreachableError) {
      return NextResponse.json(
        {
          error: "command_service_unreachable",
          reason: err.message,
          forward_path: payload.forward_path,
          next_path: FORWARD_PATH_NEXT[payload.forward_path],
        },
        { status: 503 },
      )
    }
    if (err instanceof CommandServiceErrorResponseError) {
      return NextResponse.json(
        {
          error: "command_service_error",
          status: err.status,
          envelope: err.envelope,
        },
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
