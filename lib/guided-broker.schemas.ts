// retry_broker_setup command payload schema (VIR-13).
//
// Reversible — the user can retry as many times as needed. The shared
// route helper mints a fresh idempotency key per call but does not
// require one (postGuidedCommand only enforces idempotency on
// IRREVERSIBLE_GUIDED_COMMANDS).

import "server-only"

import { z } from "zod"

export const RetryBrokerSetupPayloadSchema = z.object({
  enrollment_id: z.string().min(1),
})
export type RetryBrokerSetupPayload = z.infer<typeof RetryBrokerSetupPayloadSchema>
