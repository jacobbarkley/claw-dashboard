// Zod mirrors of Codex's projection-service HTTP error envelope. The
// projection endpoint emits the same envelope *shape* as the command
// service, but a different error_code enum — it has its own codes
// (`PROJECTION_NOT_FOUND`, `UNKNOWN_PROJECTION`) and re-uses two
// command-side codes (`AUTHENTICATION_REQUIRED`, `INVALID_REQUEST`).
// Splitting per-service keeps the two contracts independently evolvable
// and lets the dashboard branch on projection-specific codes without
// stretching the command enum.
//
// Source of truth (vires-numeris):
//   - src/openclaw_core/services/guided_projection_service.py
//     emits AUTHENTICATION_REQUIRED, INVALID_REQUEST,
//     PROJECTION_NOT_FOUND, UNKNOWN_PROJECTION via
//     GuidedCommandErrorEnvelope.
//
// Success-side response: projection reads return the raw projection
// payload (no envelope wrap), validated against the existing zod
// schemas in `lib/guided-data-source.schemas.ts`. There is no
// projection success envelope.

import "server-only"

import { z } from "zod"

export const GuidedProjectionErrorCodeSchema = z.enum([
  "AUTHENTICATION_REQUIRED",
  "INVALID_REQUEST",
  "PROJECTION_NOT_FOUND",
  "UNKNOWN_PROJECTION",
])
export type GuidedProjectionErrorCode = z.infer<typeof GuidedProjectionErrorCodeSchema>

export const GuidedProjectionErrorEnvelopeSchema = z.object({
  error_code: GuidedProjectionErrorCodeSchema,
  error_message: z.string(),
  retriable: z.boolean(),
  fields: z.record(z.string(), z.string()).nullable().optional(),
})
export type GuidedProjectionErrorEnvelope = z.infer<typeof GuidedProjectionErrorEnvelopeSchema>
