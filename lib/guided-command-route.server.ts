// Shared POST-handler helper for routes that thinly wrap a single Guided
// command. Each command-bound route (decline_match, pause_enrollment,
// stop_liquidate, etc.) follows the same shape:
//   1. parse JSON body
//   2. validate payload via a zod schema
//   3. resolve auth context (401 / 403 on failures)
//   4. mint an idempotency key
//   5. call postGuidedCommand(...)
//   6. map command-client errors to HTTP envelopes the UI understands
//
// This helper consolidates that shape so each route file stays focused on
// what's command-specific: the command name, payload schema, and the
// default next_path used when the runtime hasn't echoed one (or when the
// runtime is unreachable).

import "server-only"

import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"
import type { ZodSchema } from "zod"

import {
  CommandIdempotencyKeyError,
  CommandServiceErrorResponseError,
  CommandServiceMalformedResponseError,
  CommandServiceUnreachableError,
  postGuidedCommand,
  type GuidedCommandName,
} from "@/lib/guided-commands.server"
import {
  UnauthenticatedError,
  UnknownScopeIdentityError,
  resolveCurrentAuthContext,
} from "@/lib/guided-scope.server"

export interface CommandRouteOptions<P> {
  commandName: GuidedCommandName
  payloadSchema: ZodSchema<P>
  defaultNextPath: string
  // Optional shaper for the success body. Defaults to { ok: true, next_path }.
  shapeSuccess?: (result: Record<string, unknown>, defaultNextPath: string) => Record<string, unknown>
  // Optional shaper for the 503 body. Defaults to including next_path so the
  // UI can navigate even when the command service is unreachable.
  shapeUnreachable?: (
    payload: P,
    defaultNextPath: string,
    reason: string,
  ) => Record<string, unknown>
  // Optional override for whether an empty body is accepted (defaults applied).
  acceptEmptyBody?: boolean
}

export async function handleGuidedCommandRoute<P>(
  request: NextRequest,
  options: CommandRouteOptions<P>,
): Promise<Response> {
  let parsedBody: unknown
  try {
    parsedBody = await request.json()
  } catch {
    if (options.acceptEmptyBody) {
      parsedBody = {}
    } else {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 })
    }
  }

  const decoded = options.payloadSchema.safeParse(parsedBody)
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

  const idempotencyKey = `${options.commandName}:${randomUUID()}`

  try {
    const commandResult = await postGuidedCommand(options.commandName, {
      payload: payload as Record<string, unknown>,
      authContext,
      idempotencyKey,
    })
    const shapedSuccess = options.shapeSuccess
      ? options.shapeSuccess(commandResult.result as Record<string, unknown>, options.defaultNextPath)
      : { ok: true, next_path: options.defaultNextPath, result: commandResult.result }
    return NextResponse.json(shapedSuccess, { status: 200 })
  } catch (err) {
    if (err instanceof CommandServiceUnreachableError) {
      const body = options.shapeUnreachable
        ? options.shapeUnreachable(payload, options.defaultNextPath, err.message)
        : {
            error: "command_service_unreachable",
            reason: err.message,
            next_path: options.defaultNextPath,
          }
      return NextResponse.json(body, { status: 503 })
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
