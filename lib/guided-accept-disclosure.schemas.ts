// accept_disclosure command payload schema (VIR-12).
//
// The runtime resolves the open PENDING_ACCEPTANCE proposal via the
// authenticated scope + disclosure_version_id, so the dashboard does not
// have to carry proposal_id on the props of S4 disclosure-surface.
//
// accept_disclosure is in IRREVERSIBLE_GUIDED_COMMANDS — the shared route
// helper mints a per-call idempotency key with the command name as prefix.

import "server-only"

import { z } from "zod"

export const AcceptDisclosurePayloadSchema = z.object({
  disclosure_version_id: z.string().min(1),
  library_entry_id: z.string().min(1),
  library_entry_version: z.number().int().nonnegative(),
})
export type AcceptDisclosurePayload = z.infer<typeof AcceptDisclosurePayloadSchema>
