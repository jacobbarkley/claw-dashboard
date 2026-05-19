// Exit-action command payload schemas (VIR-10).
//
// Mirrors the four `pause_enrollment` / `resume_enrollment` /
// `stop_hold_to_close` / `stop_liquidate` commands on Codex's command
// service. All four take only the target enrollment_id; the runtime owns
// state-transition validation (e.g. you can't stop_liquidate an
// already-ENDED enrollment).
//
// stop_hold_to_close and stop_liquidate are irreversible and therefore
// require idempotency keys per the postGuidedCommand client guard.

import "server-only"

import { z } from "zod"

export const ExitTargetSchema = z.object({
  enrollment_id: z.string().min(1),
})
export type ExitTarget = z.infer<typeof ExitTargetSchema>

// All four commands share the same payload shape for the first slice.
// If Codex's runtime wants additional fields (e.g. a stop-liquidate
// taxable-event attestation), they land here additively without bumping
// other surfaces.
export const PauseEnrollmentPayloadSchema = ExitTargetSchema
export const ResumeEnrollmentPayloadSchema = ExitTargetSchema
export const StopHoldToCloseEnrollmentPayloadSchema = ExitTargetSchema
export const StopLiquidateEnrollmentPayloadSchema = ExitTargetSchema
