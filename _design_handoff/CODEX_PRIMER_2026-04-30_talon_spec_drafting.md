# Codex Primer — Talon spec-drafting endpoint

**Date:** 2026-04-30
**From:** Claude (Opus 4.7), per Jacob's request
**For:** Codex
**Scope:** Net-new dashboard endpoint that lets Talon turn an idea's
thesis into a `StrategySpecV1` draft. UI side is already in place behind
a disabled "Draft with Talon" button on the awaiting-spec body of the
seven-step idea thread.

This is not Talon V2 or autonomous strategy code generation. The output is
exactly the same shape an operator hand-authors today — a DRAFTING spec —
and the operator still reviews, edits, and submits it for approval. Talon
is just the first 80% of the typing.

---

## §1 — Why this is unblocked

Phase D-implementation shipped 2026-04-30 with the awaiting-spec body
already rendering a "Draft with Talon" action row, disabled. The form
contract is finalized. The form already shows a "Talon drafted this —
review and edit" banner whenever `authoring_mode === "AI_DRAFTED"`.

`@ai-sdk/anthropic` + `streamText`/`generateText` are already in the
dashboard's dependency tree (see `app/api/chat/route.ts`). The Anthropic
API key is already in Vercel env. Nothing infrastructural is missing.

The general Talon assistant chat (`/api/chat`) is parked on a deploy
smoke test, but **that path is independent**. This new endpoint is
single-shot generation, not a streaming chat, and shares only the SDK
import + key.

---

## §2 — Endpoint contract

`POST /api/research/specs/draft-with-talon`

### Request body

```ts
{
  idea_id: string                 // required
  scope?: ScopeTriple             // defaults to PHASE_1_DEFAULT_SCOPE
  authored_by?: string            // defaults to "jacob"
  override_thesis?: string | null // optional — let operator augment thesis
                                  // before drafting without editing the idea
}
```

### Response (200)

```ts
{
  ok: true
  spec: StrategySpecV1            // freshly persisted, state DRAFTING
  idea: IdeaArtifact              // updated with strategy_ref pointer
  commit_sha: string | null       // from commitDashboardFiles
}
```

### Failure modes

- `400` — body invalid or required fields missing
- `404` — idea not found
- `409` — idea cannot accept a new spec (already at SPEC_PENDING with a
  different active spec, or REGISTERED with a different pending spec).
  Same precondition logic as `POST /api/research/specs`.
- `502` — Talon failed (Anthropic API error, malformed JSON output,
  schema validation failure). Body includes a `talon_error` field with
  the underlying detail. **Important**: a 502 must NOT leave a half-
  written spec on disk.
- `503` — Anthropic API key missing in env

### Idempotency

Calling twice with the same `idea_id` is **not** idempotent — each call
generates a new spec_id and a new draft. The endpoint is meant for
"give me a starting point" semantics, not "regenerate this exact spec."
Operator-driven retries are by design.

If the idea already has an active spec when called: same 409 behavior as
operator-author. We don't auto-create a re-spec from a Talon draft —
the operator triggers a re-spec explicitly.

---

## §3 — Talon prompt strategy

Use `generateText` (not `streamText`) with a JSON-mode-style prompt.
We need structured output that round-trips through `formValuesToPatch` in
`components/vires/lab/spec-form-mapping.ts`.

### Recommended approach — structured tool call

Define a single tool the model must call: `propose_strategy_spec`. The
tool's input schema is the spec field set we collect in the form (flat
shape, not the canonical record-shape). The tool returns no useful
output — its purpose is to force the model into the schema. Server-side,
parse the tool's input, run it through `formValuesToPatch` against an
empty spec base, and persist via `commitDashboardFiles`.

```ts
const tools = {
  propose_strategy_spec: {
    description: "Propose a draft strategy spec for the operator to review.",
    parameters: z.object({
      signal_logic: z.string().min(40),
      entry_rules: z.string().min(20),
      exit_rules: z.string().min(20),
      risk_model: z.string().min(20),
      universe: z.string().min(10),
      required_data: z.array(z.enum([
        "Price OHLCV", "Fundamentals", "Options chain",
        "Implied vol surface", "Sentiment", "Attention proxies",
        "Macro", "Crypto on-chain",
      ])),
      benchmark: z.enum(["SPY", "BTC", "sleeve-default"]).or(z.string()),
      acceptance_criteria: z.object({
        min_sharpe: z.number().min(0),
        max_drawdown_pct: z.number().min(0).max(100),
        min_hit_rate_pct: z.number().min(0).max(100),
        other: z.string().optional(),
      }),
      candidate_strategy_family: z.string().optional(),
      sweep_params: z.string().optional(),
      implementation_notes: z.string().optional(),
    }),
  },
}
```

Force-call via the model's `toolChoice: { type: "tool", toolName: "propose_strategy_spec" }`.

### System prompt

Short and load-bearing. No conversational preamble; this is one-shot.

```
You are Talon's spec-drafting mode. Convert the operator's plain-language
trading thesis into a StrategySpecV1 draft. Output via the
propose_strategy_spec tool. Leave fields plausible-but-conservative —
the operator reviews everything before approval.

Sleeve: {idea.sleeve}
Title: {idea.title}
Thesis: {idea.thesis}
{override_thesis ? "Operator augmentation: " + override_thesis : ""}

Constraints:
- signal_logic: 1–2 paragraphs, the edge in plain English
- entry/exit: concrete conditions, not aspirations
- risk_model: per-trade sizing + portfolio caps
- acceptance_criteria.min_sharpe: default 1.0 unless thesis suggests
  otherwise
- acceptance_criteria.max_drawdown_pct: default 20
- acceptance_criteria.min_hit_rate_pct: default 45
- candidate_strategy_family: snake_case, suggest a name; Codex may rename
- Do not invent backtest results or claim historical performance
```

### Model

Default `claude-sonnet-4-6` for spec quality. Haiku is fine for cost but
the structured outputs we want are dense — sonnet earns the spend.
Configurable via `TALON_SPEC_DRAFTING_MODEL` env var, default sonnet.

### Token / time budget

- `maxDuration = 60` (Vercel serverless cap; spec drafting is heavier
  than chat, may need the headroom)
- `temperature: 0.4` — enough variance to feel drafty, low enough to
  hit schema reliably

---

## §4 — Persistence flow

1. Validate request body, normalize scope.
2. Load idea via `loadIdeaById`. 404 if missing.
3. Run the same `linkIdeaToSpec` precondition check that
   `POST /api/research/specs` runs (in `app/api/research/specs/route.ts`).
   409 on mismatch — no Talon call wasted.
4. Call Talon with the prompt above. If the SDK throws or the tool call
   doesn't fire / fails Zod validation → 502 with diagnostic. **Nothing
   committed yet.**
5. Construct the canonical `StrategySpecV1`:
   - `spec_id`: `spec_${ulid()}`
   - `state`: `DRAFTING`
   - `authoring_mode`: `AI_DRAFTED`
   - `authored_by`: from request, default `"jacob"`
   - `created_at`: now
   - `signal_logic` / `entry_rules` / `exit_rules`: from tool output
   - `universe` / `risk_model` / `sweep_params`: wrap as `{ description: <text> }`
     so the form-mapping round-trip works (the existing
     `setRecordDescription` pattern in `spec-form-mapping.ts`)
   - `required_data`: flatten chips array
   - `benchmark`: resolve enum vs custom string
   - `acceptance_criteria`: `{ min_sharpe, max_drawdown, min_hit_rate, other? }`
     (note key names — `max_drawdown` not `max_drawdown_pct`, matching
     `formValuesToPatch`)
   - All other optional fields per existing contract
6. Call the same `linkIdeaToSpec` from `app/api/research/specs/route.ts`
   (factor it out of route.ts into `app/api/research/specs/_shared.ts`
   first — currently it's a private function inside the POST handler).
7. Persist via `commitDashboardFiles`: spec YAML + idea YAML in one
   commit, message `research lab: Talon-drafted strategy spec ${spec_id}`.
8. Return 200 with the persisted spec + idea.

---

## §5 — Frontend wiring (Claude owns)

Once Codex ships the endpoint, frontend changes are small and isolated
to `components/vires/lab/idea-thread-live.tsx::AwaitingSpecBody`:

1. Add a `talonAvailable` prop (defaulted from `process.env.NEXT_PUBLIC_TALON_DRAFTING_ENABLED === "1"`).
2. When `talonAvailable`, the "Draft with Talon" row's `disabled` flips
   to `false` and `onClick` calls
   `POST /api/research/specs/draft-with-talon` with the idea_id, then
   redirects to `/spec/edit?spec_id=${response.spec.spec_id}` — same
   surface the operator-author path lands on.
3. While the call is in flight, both action rows show a "Talon is
   drafting…" busy state. Talon spec generation can take 15–30s.
4. On 502 or other failure, render the existing `ErrorLine` with the
   `talon_error` detail, and DO NOT hide the "Author the spec yourself"
   row — the operator should still have an out.

The form already shows the AI_DRAFTED banner; no form changes needed.

---

## §6 — Operator UX details

- **Loading state on the awaiting-spec card matters.** 15–30s is a long
  time without feedback. The "Draft with Talon" button should show an
  inline progress message ("Reading your thesis… proposing signal
  logic…") that rotates roughly every 5s. Pure cosmetic but the
  difference between feeling AI-fast and feeling broken.
- **The spec edit page after drafting is identical to the operator-
  author path.** Same form, same actions. The only visual differentiator
  is the AI_DRAFTED banner above the form, which already exists.
- **Operator can absolutely re-draft.** If they don't like Talon's
  output, "Cancel" returns them to the idea page where they can hit
  "Draft with Talon" again (creates a fresh spec_id) or "Author yourself."
  Cleanup of the abandoned draft is whatever the existing DELETE
  /api/research/specs/[id] flow does for DRAFTING specs (it works).

---

## §7 — Verification & test plan

### Unit / integration

1. Happy path: known idea, mock Talon to return a valid tool call →
   spec persisted, idea linked, response shape correct.
2. Talon timeout: mock Anthropic SDK to throw → 502, no spec on disk,
   no idea mutation.
3. Talon malformed: mock to return tool call that fails Zod → 502, same
   no-side-effects guarantee.
4. Idea precondition fail (already SPEC_PENDING): 409, no Talon call.
5. Concurrent calls on the same idea: second one 409s if the first
   already linked the idea. (Race-condition tolerance is acceptable —
   one of them wins.)

### Manual smoke

1. Set `TALON_SPEC_DRAFTING_ENABLED=1` and the frontend flag locally.
2. Walk the Ape Wisdom idea → "Draft with Talon" → verify the spec edit
   surface lands with prefilled fields + AI_DRAFTED banner.
3. Save draft, edit a field, re-save — verify round-trip through the
   form-mapping is clean (no description-key duplication, etc.).
4. Submit for approval → approve → check the audit trail records
   `authored_by: jacob` and `authoring_mode: AI_DRAFTED` distinctly.

### Acceptance for shipping

- 502 path tested with at least one real Anthropic-side error (revoke
  the key briefly in dev, hit the endpoint, confirm clean failure).
- One real Talon-drafted spec walked all the way through to APPROVED
  with no hand-edit needed (proves baseline quality).
- One real Talon-drafted spec walked through with significant operator
  edits (proves the round-trip).

---

## §8 — Open questions for v1

| ID | Question | Default |
|---|---|---|
| TSD-1 | Stream the drafting progress to the client? | No — single-shot generateText, ~15s budget. Stream is a v2 nicety. |
| TSD-2 | Should Talon refuse to draft for ideas with empty/sparse theses? | No — the model just produces a thinner spec. Operator decides. |
| TSD-3 | Persist the raw Talon prompt + completion as provenance? | Yes — write to `data/research_lab/<scope>/strategy_specs/<spec_id>_provenance.json` alongside the spec YAML. Useful for debugging spec quality drift. |
| TSD-4 | Rate-limit per operator? | No — single-operator phase, trust the human. |
| TSD-5 | Allow operator to pass a "style" hint (terse / verbose / aggressive / conservative)? | v2. Default voice is fine for now. |

---

## §9 — Out of scope

- Talon's general chat (`/api/chat`) deploy smoke. Independent track.
- Multi-turn conversational spec authoring ("Talon, tighten the entry
  rules"). v2.
- Auto-generated sweep parameters as structured grids. The form takes
  prose for now; structured sweep editing is a future enhancement that
  hits the form before Talon needs to know about it.
- Talon writing the strategy module from a spec. That's the Codex
  worker's job (Phase E v2 autonomous generation). Phase D-impl + this
  endpoint cover *thesis → spec*. Spec → strategy module remains a
  manual Codex session.

---

## §10 — Codex sign-off checklist

- [ ] Endpoint route + request validation matches §2.
- [ ] Tool-call structured output approach (§3) accepted, or alternative
      proposed.
- [ ] `linkIdeaToSpec` factored out of `route.ts` into `_shared.ts`
      (small refactor, both endpoints share the precondition logic).
- [ ] Persistence flow (§4) leaves zero on-disk state when Talon fails.
- [ ] Provenance file approach (TSD-3) acceptable, or push back.
- [ ] Vercel env vars: `ANTHROPIC_API_KEY` confirmed present;
      `TALON_SPEC_DRAFTING_MODEL` optional default set.

Once the four checks above land, Claude flips
`NEXT_PUBLIC_TALON_DRAFTING_ENABLED=1` on prod and the "Draft with
Talon" button goes live.
