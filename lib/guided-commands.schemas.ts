// Zod mirrors of Codex's command/projection HTTP envelopes. Used by
// lib/guided-commands.server.ts to decode responses from Codex's command
// service. Kept separate from lib/guided-data-source.schemas.ts so the
// read-projection contract and the command-service transport contract
// don't bleed into each other.
//
// Sources of truth (vires-numeris):
//   - GuidedCommandErrorCode + envelope shapes:
//     src/openclaw_core/models/guided_command_service.py
//   - X-Request-ID header is the contract source of truth for the per-call
//     request id; the success-envelope body field echoes it for cross-check
//     parity only (see GuidedCommandSuccessEnvelope docstring upstream).

import "server-only"

import { z } from "zod"

export const GuidedCommandErrorCodeSchema = z.enum([
  "AUTHENTICATION_REQUIRED",
  "SCOPE_MISMATCH",
  "UNKNOWN_COMMAND",
  "INVALID_REQUEST",
  "IDEMPOTENCY_KEY_REQUIRED",
  "COMMAND_NOT_IMPLEMENTED",
])
export type GuidedCommandErrorCode = z.infer<typeof GuidedCommandErrorCodeSchema>

export const GuidedCommandErrorEnvelopeSchema = z.object({
  error_code: GuidedCommandErrorCodeSchema,
  error_message: z.string(),
  retriable: z.boolean(),
  fields: z.record(z.string(), z.string()).nullable().optional(),
})
export type GuidedCommandErrorEnvelope = z.infer<typeof GuidedCommandErrorEnvelopeSchema>

export const GuidedCommandSuccessEnvelopeSchema = z.object({
  status: z.literal("ok"),
  request_id: z.string(),
  correlation_id: z.string().nullable().optional(),
  result: z.record(z.string(), z.unknown()).default({}),
})
export type GuidedCommandSuccessEnvelope = z.infer<typeof GuidedCommandSuccessEnvelopeSchema>
