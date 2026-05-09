// Server-only thin client for Codex's Guided command service. Browser
// clients MUST NOT import from this file — UI submits to dashboard route
// handlers / server actions, and only those server-side handlers call the
// functions below. CODEX_COMMAND_BASE_URL and CODEX_COMMAND_JWT_HS256_SECRET
// are server-only env vars; never NEXT_PUBLIC_*.
//
// T1.0d shipped the auth handoff: every postGuidedCommand call mints a
// per-request short-lived JWT (lib/guided-command-auth.server.ts) and
// passes it as the Bearer token. The static CODEX_COMMAND_BEARER_TOKEN
// from the T1.0c skeleton is gone — it was placeholder transport, not a
// scoped handoff. CODEX_COMMAND_BASE_URL stays unset until a real Codex
// command endpoint exists, so postGuidedCommand still throws
// CommandServiceUnreachableError immediately in production.
//
// Sources of truth (vires-numeris):
//   - command names: src/openclaw_core/models/guided.py (GuidedCommandType)
//   - route / error / header / irreversible-command constants:
//     src/openclaw_core/models/guided_command_service.py
//
// If a command is added on the runtime side, the GuidedCommandName literal
// below MUST be updated in the same contract slice. Drift between the two
// repos becomes silently broken commands; treat the runtime + dashboard
// mirror as one logical contract.

import "server-only"

import { randomUUID } from "node:crypto"

import type { GuidedScope } from "@/components/vires/guided/types"
import {
  CommandJwtMisconfiguredError,
  mintGuidedCommandJwt,
} from "@/lib/guided-command-auth.server"
import {
  GuidedCommandErrorEnvelopeSchema,
  GuidedCommandSuccessEnvelopeSchema,
  type GuidedCommandErrorEnvelope,
} from "@/lib/guided-commands.schemas"

// ─── Pinned constants (mirrors of vires-numeris contract) ───────────────────

// Pinned to GUIDED_COMMAND_ROUTE_PREFIX in guided_command_service.py.
const GUIDED_COMMAND_ROUTE_PREFIX = "/guided/v1/commands"
// Pinned to GUIDED_COMMAND_AUTH_HEADER + GUIDED_COMMAND_AUTH_SCHEME.
const AUTH_HEADER = "Authorization"
const AUTH_SCHEME = "Bearer"
// Pinned to GUIDED_REQUEST_ID_HEADER / GUIDED_CORRELATION_ID_HEADER.
const REQUEST_ID_HEADER = "X-Request-ID"
const CORRELATION_ID_HEADER = "X-Correlation-ID"
// Pydantic min_length=8 on idempotency_key in GuidedCommandServiceRequest.
const IDEMPOTENCY_KEY_MIN_LENGTH = 8

// ─── Mirrored types from the Guided runtime contract ───────────────────────

export type GuidedCommandName =
  | "submit_questionnaire"
  | "save_questionnaire_progress"
  | "accept_match"
  | "decline_match"
  | "accept_disclosure"
  | "request_rematch"
  | "request_re_questionnaire"
  | "start_enrollment"
  | "pause_enrollment"
  | "resume_enrollment"
  | "retry_broker_setup"
  | "stop_hold_to_close"
  | "stop_liquidate"
  | "accept_upgrade"
  | "acknowledge_notice"
  | "reaffirm_consent"

export type IrreversibleGuidedCommandName =
  | "accept_match"
  | "accept_disclosure"
  | "start_enrollment"
  | "stop_hold_to_close"
  | "stop_liquidate"
  | "accept_upgrade"
  | "acknowledge_notice"
  | "reaffirm_consent"

const IRREVERSIBLE_GUIDED_COMMANDS: ReadonlySet<GuidedCommandName> = new Set<GuidedCommandName>([
  "accept_match",
  "accept_disclosure",
  "start_enrollment",
  "stop_hold_to_close",
  "stop_liquidate",
  "accept_upgrade",
  "acknowledge_notice",
  "reaffirm_consent",
])

// ─── Error classes ──────────────────────────────────────────────────────────

export class CommandServiceUnreachableError extends Error {
  constructor(reason: string) {
    super(`Guided command service unreachable: ${reason}`)
    this.name = "CommandServiceUnreachableError"
  }
}

export class CommandServiceMisconfiguredError extends Error {
  constructor(reason: string) {
    super(`Guided command service misconfigured: ${reason}`)
    this.name = "CommandServiceMisconfiguredError"
  }
}

export class CommandIdempotencyKeyError extends Error {
  constructor(public readonly commandName: GuidedCommandName, public readonly reason: string) {
    super(`Idempotency key for ${commandName} is invalid: ${reason}`)
    this.name = "CommandIdempotencyKeyError"
  }
}

export class CommandServiceErrorResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: GuidedCommandErrorEnvelope,
  ) {
    super(
      `Guided command service returned ${status}: ${envelope.error_code} — ${envelope.error_message}`,
    )
    this.name = "CommandServiceErrorResponseError"
  }
}

export class CommandServiceMalformedResponseError extends Error {
  constructor(public readonly status: number, reason: string) {
    super(`Guided command service returned a malformed response (status ${status}): ${reason}`)
    this.name = "CommandServiceMalformedResponseError"
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface PostGuidedCommandArgs {
  payload?: Record<string, unknown>
  scope: GuidedScope
  actor: {
    type: "USER" | "OPERATOR" | "SYSTEM"
    id: string
    subject: string
  }
  idempotencyKey?: string
  correlationId?: string
}

export interface PostGuidedCommandResult<TResult> {
  requestId: string
  correlationId: string | null
  result: TResult
}

// POST a Guided command to Codex's command service.
//
// In T1.0d this still throws CommandServiceUnreachableError because no
// production Codex command endpoint exists yet (CODEX_COMMAND_BASE_URL is
// unset). When a deployed endpoint lands, only env vars change — the
// shape, guardrails, and JWT minting all stay.
//
// Guardrails enforced client-side BEFORE fetch (matching the runtime side):
//   - CommandServiceUnreachableError if CODEX_COMMAND_BASE_URL unset.
//   - CommandServiceMisconfiguredError if CODEX_COMMAND_JWT_HS256_SECRET is
//     unset / too short. We never POST without a signed scoped handoff.
//   - CommandIdempotencyKeyError if name is in IRREVERSIBLE_GUIDED_COMMANDS
//     and idempotencyKey is missing or shorter than 8 chars (matches Pydantic).
//
// Auth handoff:
//   - Mints a per-request HS256 JWT with iss=claw-dashboard,
//     aud=vires-numeris-guided-command-service, exp=iat+60s, jti, and
//     claims { scope, actor }. See lib/guided-command-auth.server.ts for
//     the full claim shape and the Codex verifier expectation.
//   - Body scope is sent as a typed convenience hint. The runtime treats
//     it as untrusted and rejects mismatch against the JWT scope claim.
//
// On non-2xx response: parses the typed error envelope and throws
// CommandServiceErrorResponseError carrying the structured envelope. Callers
// render UI by error_code, never by parsing error_message.
//
// On malformed envelope (success or error): throws
// CommandServiceMalformedResponseError. The runtime contract guarantees a
// valid envelope on every response; a malformed response is a contract
// violation worth surfacing distinctly. The same error fires on 2xx if the
// X-Request-ID response header is missing, doesn't match the outgoing
// request id, or doesn't match the body's echoed request_id field — the
// header is the contract source of truth and drift is contract-level wrong.
//
// On network-layer failure once the URL is set (DNS / connect refused /
// TLS / mid-handshake abort / etc.): throws CommandServiceUnreachableError
// with the underlying fetch failure message. Callers branch on
// instanceof to render retry UI rather than swallowing a raw TypeError.
export async function postGuidedCommand<TResult = Record<string, unknown>>(
  name: GuidedCommandName,
  args: PostGuidedCommandArgs,
): Promise<PostGuidedCommandResult<TResult>> {
  const baseUrl = process.env.CODEX_COMMAND_BASE_URL
  if (!baseUrl || baseUrl.length === 0) {
    throw new CommandServiceUnreachableError(
      "CODEX_COMMAND_BASE_URL is not set. T1.0d: no production Codex command endpoint exists yet — wiring lands when the endpoint is deployed.",
    )
  }

  if (IRREVERSIBLE_GUIDED_COMMANDS.has(name)) {
    if (!args.idempotencyKey || args.idempotencyKey.length < IDEMPOTENCY_KEY_MIN_LENGTH) {
      throw new CommandIdempotencyKeyError(
        name,
        `Irreversible commands require an idempotency_key of length >= ${IDEMPOTENCY_KEY_MIN_LENGTH}.`,
      )
    }
  }

  let bearerJwt: string
  try {
    bearerJwt = await mintGuidedCommandJwt({
      scope: args.scope,
      actorType: args.actor.type,
      actorId: args.actor.id,
      subject: args.actor.subject,
    })
  } catch (err) {
    if (err instanceof CommandJwtMisconfiguredError) {
      throw new CommandServiceMisconfiguredError(err.message)
    }
    throw err
  }

  const requestId = randomUUID()
  const url = `${baseUrl.replace(/\/$/, "")}${GUIDED_COMMAND_ROUTE_PREFIX}/${name}`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    [AUTH_HEADER]: `${AUTH_SCHEME} ${bearerJwt}`,
    [REQUEST_ID_HEADER]: requestId,
  }
  if (args.correlationId) {
    headers[CORRELATION_ID_HEADER] = args.correlationId
  }

  const body = JSON.stringify({
    scope: args.scope,
    payload: args.payload ?? {},
    ...(args.idempotencyKey ? { idempotency_key: args.idempotencyKey } : {}),
  })

  let response: Response
  try {
    response = await fetch(url, { method: "POST", headers, body })
  } catch (err) {
    // Network-layer failure (DNS, connect, TLS, mid-handshake abort, etc.).
    // Surface this in the command-client error taxonomy rather than letting
    // a raw TypeError leak to callers — they branch on instanceof to render
    // retry / error UI.
    throw new CommandServiceUnreachableError(
      `fetch to ${url} failed: ${(err as Error).message}`,
    )
  }
  const rawText = await response.text()
  let parsedJson: unknown
  try {
    parsedJson = rawText.length > 0 ? JSON.parse(rawText) : {}
  } catch (err) {
    throw new CommandServiceMalformedResponseError(
      response.status,
      `Non-JSON response: ${(err as Error).message}`,
    )
  }

  if (!response.ok) {
    const decoded = GuidedCommandErrorEnvelopeSchema.safeParse(parsedJson)
    if (!decoded.success) {
      throw new CommandServiceMalformedResponseError(
        response.status,
        `Error envelope failed validation: ${decoded.error.message}`,
      )
    }
    throw new CommandServiceErrorResponseError(response.status, decoded.data)
  }

  const decoded = GuidedCommandSuccessEnvelopeSchema.safeParse(parsedJson)
  if (!decoded.success) {
    throw new CommandServiceMalformedResponseError(
      response.status,
      `Success envelope failed validation: ${decoded.error.message}`,
    )
  }

  // Enforce — not just document — that the X-Request-ID response header is
  // canonical. Per vires-numeris's GuidedCommandSuccessEnvelope docstring,
  // the response header is the contract source of truth; the body request_id
  // field is for client cross-check parity only. On 2xx the runtime always
  // emits the header (it built it from the inbound X-Request-ID we sent),
  // so absence or drift is a contract violation worth surfacing as a
  // malformed response rather than silently trusting the body field.
  const responseRequestIdHeader = response.headers.get(REQUEST_ID_HEADER)
  if (!responseRequestIdHeader) {
    throw new CommandServiceMalformedResponseError(
      response.status,
      `Missing required ${REQUEST_ID_HEADER} response header on 2xx.`,
    )
  }
  if (responseRequestIdHeader !== requestId) {
    throw new CommandServiceMalformedResponseError(
      response.status,
      `${REQUEST_ID_HEADER} response header (${responseRequestIdHeader}) does not match outgoing request id (${requestId}).`,
    )
  }
  if (decoded.data.request_id !== responseRequestIdHeader) {
    throw new CommandServiceMalformedResponseError(
      response.status,
      `Body request_id (${decoded.data.request_id}) does not match canonical ${REQUEST_ID_HEADER} header (${responseRequestIdHeader}).`,
    )
  }

  return {
    requestId: responseRequestIdHeader,
    correlationId: decoded.data.correlation_id ?? null,
    result: decoded.data.result as TResult,
  }
}
