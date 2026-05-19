// Decline-match command payload + result schemas.
//
// This is the dashboard-side mirror of the `decline_match` command on
// Codex's command service. The runtime side definition lives in
// vires-numeris (src/openclaw_core/models/guided_command_service.py). The
// shape here is a proposed contract for the first VIR-9 scaffold PR:
// Codex reacts via [codex] PR comment if anything needs to change.
//
// Open-ended note is capped at 500 chars to match the static artifact
// constraint and to keep telemetry queryable without paragraph soup.
//
// Question/answer keys are intentionally untyped enums so the decline
// question bank can grow without contract bumps. Telemetry consumers
// group by question_key+answer_key; new keys arrive additively.

import "server-only"

import { z } from "zod"

export const DeclineResponseSchema = z.object({
  question_key: z.string().min(1).max(64),
  answer_option_id: z.string().min(1).max(64),
})
export type DeclineResponse = z.infer<typeof DeclineResponseSchema>

export const DeclineForwardPathSchema = z.enum([
  "request_re_questionnaire",
  "request_rematch_now",
  "maybe_later",
])
export type DeclineForwardPath = z.infer<typeof DeclineForwardPathSchema>

export const DeclineMatchPayloadSchema = z.object({
  proposal_id: z.string().min(1),
  responses: z.array(DeclineResponseSchema).max(32).default([]),
  open_ended_note: z.string().max(500).nullable().default(null),
  forward_path: DeclineForwardPathSchema,
  opt_in_notify_when_library_grows: z.boolean().default(false),
})
export type DeclineMatchPayload = z.infer<typeof DeclineMatchPayloadSchema>

// Result shape returned via postGuidedCommand's success envelope `result`.
// Runtime is free to add fields — this is the minimum the dashboard reads.
export const DeclineMatchResultSchema = z.object({
  decline_id: z.string().min(1),
  forward_path: DeclineForwardPathSchema,
  next_path: z.string().nullable().default(null),
})
export type DeclineMatchResult = z.infer<typeof DeclineMatchResultSchema>

// ─── Maybe-later (save questionnaire progress) ─────────────────────────────
//
// Surfaced here for adjacency. The "Maybe later" path on the match surface
// is decline-with-forward_path=maybe_later (above). A standalone
// "Maybe later" without a decline (e.g. user bounces from the match page
// without declining) uses `save_questionnaire_progress` — the contract is
// minimal: the runtime owns the questionnaire snapshot under user scope.

export const SaveQuestionnaireProgressPayloadSchema = z.object({
  reason: z.enum(["maybe_later_from_match"]).default("maybe_later_from_match"),
})
export type SaveQuestionnaireProgressPayload = z.infer<typeof SaveQuestionnaireProgressPayloadSchema>
