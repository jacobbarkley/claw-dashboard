// accept_match command payload schema (VIR-16).
//
// Runtime resolves the open PENDING_ACCEPTANCE proposal via authenticated
// scope + proposal_id. Dashboard has proposal_id on the match view, so
// it's passed in the payload for explicit cross-check parity with the
// JWT scope claim.
//
// accept_match is in IRREVERSIBLE_GUIDED_COMMANDS — the shared route
// helper mints a per-call idempotency key with the command name prefix.

import "server-only"

import { z } from "zod"

export const AcceptMatchPayloadSchema = z.object({
  proposal_id: z.string().min(1),
  matched_library_entry_id: z.string().min(1),
  matched_library_entry_version: z.number().int().nonnegative(),
})
export type AcceptMatchPayload = z.infer<typeof AcceptMatchPayloadSchema>
