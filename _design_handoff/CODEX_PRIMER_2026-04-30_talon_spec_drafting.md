# Codex Primer — Talon spec-drafting endpoint

**Date:** 2026-04-30 (rev 2 after Jacob's data-readiness pushback)
**From:** Claude (Opus 4.7), per Jacob's request
**For:** Codex
**Scope:** Net-new dashboard endpoint that lets Talon turn an idea's
thesis into a `StrategySpecV1` draft, **gated by a data-readiness verdict
so we never persist specs that depend on data we can't actually feed**.
UI side is already in place behind a disabled "Draft with Talon" button
on the awaiting-spec body of the seven-step idea thread.

This is not Talon V2 or autonomous strategy code generation. The output is
exactly the same shape an operator hand-authors today — a DRAFTING spec —
and the operator still reviews, edits, and submits it for approval. Talon
is just the first 80% of the typing, with one hard rule: **don't draft
plumbing that can't run**.

### Rev 2 changes

- New §3a — **Data-readiness contract**. Talon must classify each draft
  against a versioned data-capability catalog and return one of
  `PASS | WARN | BLOCKED`. BLOCKED returns 422, persists nothing, and
  surfaces the missing source to the operator.
- §2 response/failure now includes the `data_readiness` block + the new
  422 data-unavailable failure mode.
- §3 prompt strategy gains the catalog injection + a second tool
  (`assess_data_readiness`) that runs after `propose_strategy_spec`.
- §4 persistence flow branches on the verdict; WARN stamps warnings
  into `implementation_notes`.
- §6 carves out: thin-thesis drafts are still allowed (Talon can produce
  a sparse spec from a vague idea); **unavailable-data drafts are not**
  (a thesis that requires data we don't have must block or warn).

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

### Response (200) — PASS or WARN

```ts
{
  ok: true
  spec: StrategySpecV1            // freshly persisted, state DRAFTING
  idea: IdeaArtifact              // updated with strategy_ref pointer
  commit_sha: string | null       // from commitDashboardFiles
  data_readiness: {
    verdict: "PASS" | "WARN"
    catalog_version: string       // e.g. "research_lab.data_capability.v1"
    requirements: Array<{
      requested: string           // chip label or freeform identifier
      status: "AVAILABLE" | "PARTIAL" | "MISSING"
      source?: string | null      // capability id when AVAILABLE/PARTIAL
      notes?: string | null
    }>
    warnings: string[]            // empty when PASS
  }
}
```

### Response (422) — BLOCKED

```ts
{
  ok: false
  error: "data_unavailable"
  data_readiness: {
    verdict: "BLOCKED"
    catalog_version: string
    requirements: Array<{ requested, status: "MISSING", ... }>
    blocking_summary: string      // operator-facing one-line: "Strategy
                                  // requires implied vol surface, not yet
                                  // wired in our data layer."
    suggested_action: string      // "Add an IV surface connector or
                                  // re-thesis without options surface
                                  // dependency."
  }
  // No spec persisted, no idea mutation.
}
```

### Failure modes

- `400` — body invalid or required fields missing
- `404` — idea not found
- `409` — idea cannot accept a new spec (already at SPEC_PENDING with a
  different active spec, or REGISTERED with a different pending spec).
  Same precondition logic as `POST /api/research/specs`.
- `422` — **data_unavailable**: Talon's data-readiness verdict was
  BLOCKED. Body shape per §3a. Persists nothing.
- `502` — Talon failed (Anthropic API error, malformed JSON output,
  schema validation failure on either tool). Body includes a
  `talon_error` field with the underlying detail. **Important**: a 502
  must NOT leave a half-written spec on disk.
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

### Recommended approach — two structured tool calls

Define two tools the model must call **in sequence**:
`propose_strategy_spec` first, then `assess_data_readiness`. Both have
no useful return; their purpose is to force the model into the schema.
Server-side, parse the tool inputs, post-process the readiness verdict
per §3a, then either persist or 422.

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

Schema for the second tool is in §3a. Force the model to emit both via
`toolChoice` configured for the AI SDK's multi-step pattern (one
required call, then a follow-up call after the first lands). If the
SDK's tool-routing makes a strict ordering hard, an alternative is to
issue two sequential `generateText` calls with different
`toolChoice` values, sharing the same system prompt + the proposal
output appended for the second call.

### System prompt

Short and load-bearing. No conversational preamble; this is one-shot.

```
You are Talon's spec-drafting mode. Convert the operator's plain-language
trading thesis into a StrategySpecV1 draft. Then assess whether the data
the strategy depends on is actually available in our infrastructure.

Step 1 — call propose_strategy_spec with a complete draft. Leave fields
plausible-but-conservative; the operator reviews everything.

Step 2 — call assess_data_readiness with a verdict per §contract:
  PASS    every required_data entry is AVAILABLE in the catalog
  WARN    at least one entry is PARTIAL (functional but caveated)
  BLOCKED at least one CORE entry is MISSING (no AVAILABLE/PARTIAL match)

CORE means: data the signal_logic / entry_rules / exit_rules directly
references. Optional/nice-to-have data is not core. When unsure, treat
as core (fail closed).

Sleeve: {idea.sleeve}
Title: {idea.title}
Thesis: {idea.thesis}
{override_thesis ? "Operator augmentation: " + override_thesis : ""}

Data capability catalog ({catalog_version}):
{catalog table — category, status, notes per row}

Constraints on the spec:
- signal_logic: 1–2 paragraphs, the edge in plain English
- entry/exit: concrete conditions, not aspirations
- risk_model: per-trade sizing + portfolio caps
- acceptance_criteria.min_sharpe: default 1.0 unless thesis suggests
  otherwise
- acceptance_criteria.max_drawdown_pct: default 20
- acceptance_criteria.min_hit_rate_pct: default 45
- candidate_strategy_family: snake_case, suggest a name; Codex may rename
- Do not invent backtest results or claim historical performance
- A thin or vague thesis is fine — produce a sparse-but-valid spec.
- A thesis that requires data the catalog does not list as AVAILABLE
  or PARTIAL must result in BLOCKED, with blocking_summary +
  suggested_action populated. Do not draft fantasy plumbing.
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

---

## §3a — Data-readiness contract

The hard rule: **a spec that depends on data we cannot supply does not
get persisted.** Talon assesses each requirement against a versioned
catalog and returns a verdict.

### The catalog

Lives at `data/research_lab/data_capability_catalog.json`. Schema
`research_lab.data_capability.v1`. Claude curates an initial version
from what is known to exist; Codex confirms accuracy and owns updates
as new connectors come online.

```ts
interface DataCapabilityV1 {
  capability_id: string           // "alpaca_equity_ohlcv", "wikipedia_pageviews"
  display_name: string            // "Equity OHLCV (Alpaca)"
  category: "Price OHLCV" | "Fundamentals" | "Options chain"
          | "Implied vol surface" | "Sentiment" | "Attention proxies"
          | "Macro" | "Crypto on-chain" | "Custom"
  status: "AVAILABLE" | "PARTIAL" | "PLANNED" | "UNAVAILABLE"
  sleeves: ResearchSleeve[]       // which sleeves can use this
  asof_coverage?: string | null   // "2018-present", "2024-10-23-present"
  notes?: string | null           // "free tier", "manual CSV ingest", etc.
}

interface DataCapabilityCatalogV1 {
  schema_version: "research_lab.data_capability.v1"
  catalog_version: string         // "2026-04-30.1" — bump on every change
  generated_at: string
  capabilities: DataCapabilityV1[]
}
```

Initial seed I'd ship in this PR (Codex tightens):

| capability_id | category | status | notes |
|---|---|---|---|
| `alpaca_equity_ohlcv` | Price OHLCV | AVAILABLE | daily + intraday, 2016+ |
| `alpaca_crypto_ohlcv` | Price OHLCV | AVAILABLE | BTC/ETH from 2024-10-23 |
| `ccxt_binance_crypto_ohlcv` | Price OHLCV | PARTIAL | research-only via ccxt; not in execution path |
| `alpaca_options_chain` | Options chain | AVAILABLE | live chain |
| `iv_surface_constructed` | Implied vol surface | UNAVAILABLE | requires extra build |
| `wikipedia_pageviews` | Attention proxies | AVAILABLE | research-tier |
| `gdelt_full` | Attention proxies | AVAILABLE | research-tier |
| `google_trends` | Attention proxies | PARTIAL | sample-rate noisy |
| `apewisdom_top100` | Sentiment | AVAILABLE | retail attention rank |
| `reddit_wsb_velocity` | Sentiment | PARTIAL | manual scrape, no SLA |
| `fundamentals_basic` | Fundamentals | PARTIAL | mkt cap + ADV via Alpaca only |
| `crypto_onchain` | Crypto on-chain | UNAVAILABLE | no connector |
| `macro_fred_subset` | Macro | PARTIAL | hand-pulled FRED series |

### How Talon uses it

The catalog (just the `category`, `status`, `notes` projection — no
internal IDs) gets injected into the system prompt as a structured
table. Talon's job is to map each `required_data` chip selection (and
any free-text "other" entries) onto a catalog entry, then emit a
verdict.

### Second tool — `assess_data_readiness`

After `propose_strategy_spec` fires, force a second tool call to
`assess_data_readiness` with this schema:

```ts
{
  verdict: "PASS" | "WARN" | "BLOCKED",
  requirements: Array<{
    requested: string,           // exact chip or "other" string
    status: "AVAILABLE" | "PARTIAL" | "MISSING",
    matched_capability?: string, // capability_id from catalog or null
    notes?: string,              // why PARTIAL/MISSING
  }>,
  blocking_summary?: string,     // required when verdict === BLOCKED
  suggested_action?: string,     // required when verdict === BLOCKED
  warnings?: string[],           // required when verdict === WARN, ≥1 entry
}
```

### Verdict semantics

- **PASS** — every required_data entry maps to AVAILABLE. Persist clean.
- **WARN** — at least one entry maps to PARTIAL (e.g. `reddit_wsb_velocity`
  is "manual scrape, no SLA"). Persist the spec **and** stamp
  `implementation_notes` with a "Data-readiness warnings:" prefix
  followed by the warning list. Operator sees the warnings inline.
- **BLOCKED** — at least one *core* required_data entry maps to MISSING
  (no AVAILABLE or PARTIAL match in the catalog). Return 422, persist
  nothing. The 422 body's `blocking_summary` and `suggested_action`
  surface in the operator UI as honest feedback.

### What counts as "core" required data

Talon decides at draft-time, not in code. The model is instructed: any
data category that the strategy's signal_logic / entry_rules / exit_rules
*directly references* is core. A nice-to-have like "we could also use
sentiment" is not core. If the model is unsure, default to core (fail
closed).

This is a judgment call we can tighten over time with feedback. v1
trusts Talon's classification.

### Server-side enforcement

The endpoint must NOT trust the model's verdict naively. Server logic
post-Talon:

1. Re-resolve every `requirements[].matched_capability` against the
   catalog. If any AVAILABLE/PARTIAL claim doesn't actually map to a
   real capability, downgrade that requirement to MISSING.
2. Recompute the verdict from the corrected requirements. If the
   server's recomputed verdict is stricter than the model's
   (e.g. model said WARN but server sees a real MISSING), use the
   server's verdict.
3. Log discrepancies. A model that systematically over-claims
   availability is a quality signal worth tracking.

The catalog is the source of truth; Talon is hinting at the mapping.

### Operator override (v2, not v1)

Out of scope for v1. If an operator wants to BLOCKED-override (e.g. "I
have a CSV I'll hand-feed"), v1 says: edit the thesis to remove the
unavailable dependency, then re-draft. v2 can add a `force_persist=true`
flag with WARN treatment.

---

## §4 — Persistence flow

1. Validate request body, normalize scope.
2. Load idea via `loadIdeaById`. 404 if missing.
3. Run the same `linkIdeaToSpec` precondition check that
   `POST /api/research/specs` runs (in `app/api/research/specs/route.ts`).
   409 on mismatch — no Talon call wasted.
4. Load the data-capability catalog (§3a). If missing or schema-invalid,
   503 with a clear "data capability catalog not available" message —
   we will not draft without the source of truth.
5. Call Talon with both tools forced (`propose_strategy_spec` then
   `assess_data_readiness`). If the SDK throws, either tool fails Zod
   validation, or `assess_data_readiness` doesn't fire → 502 with
   diagnostic. **Nothing committed yet.**
6. Server-side post-process the data-readiness verdict per §3a
   (re-resolve matched_capability against the catalog, downgrade
   over-claims, recompute final verdict).
7. **Branch on final verdict:**
   - **BLOCKED** → return 422 with the `data_unavailable` body shape
     from §2. Persist nothing. Idea unchanged. Done.
   - **WARN** → continue to step 8, but stamp `implementation_notes`
     with a `"Data-readiness warnings:\n- …\n- …"` prefix. If
     `implementation_notes` already has content from the model,
     concatenate (warnings first, blank line, then model notes).
   - **PASS** → continue to step 8 unchanged.
8. Construct the canonical `StrategySpecV1`:
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
   - `implementation_notes`: per step 7 (WARN-prefixed if applicable)
   - All other optional fields per existing contract
9. Call the same `linkIdeaToSpec` from `app/api/research/specs/route.ts`
   (factor it out of route.ts into `app/api/research/specs/_shared.ts`
   first — currently it's a private function inside the POST handler).
10. Persist via `commitDashboardFiles`: spec YAML + idea YAML + the
    provenance file (TSD-3) in one commit, message
    `research lab: Talon-drafted strategy spec ${spec_id}`.
11. Return 200 with the persisted spec + idea + the `data_readiness`
    block (verdict PASS or WARN).

### Provenance file

Per TSD-3 (now locked default-yes): write
`data/research_lab/<scope>/strategy_specs/<spec_id>_provenance.json`
alongside the spec YAML in the same atomic commit. Shape:

```ts
{
  schema_version: "research_lab.spec_provenance.v1",
  spec_id: string,
  generated_at: string,
  model: string,                  // e.g. "claude-sonnet-4-6"
  catalog_version: string,
  data_readiness: { verdict, requirements, ... },  // full §3a block
  prompt_version: string,         // bump when system prompt changes
  // Raw model output kept for debugging spec-quality drift
  raw_proposal: { ...tool input },
  raw_assessment: { ...tool input },
}
```

Provenance files are read-only after creation. Useful when a
later-rejected spec turns out to be a drafting-quality issue we want
to diagnose.

---

## §5 — Frontend wiring (Claude owns)

Once Codex ships the endpoint, frontend changes are small and isolated
to `components/vires/lab/idea-thread-live.tsx::AwaitingSpecBody`:

1. Add a `talonAvailable` prop (defaulted from `process.env.NEXT_PUBLIC_TALON_DRAFTING_ENABLED === "1"`).
2. When `talonAvailable`, the "Draft with Talon" row's `disabled` flips
   to `false` and `onClick` calls
   `POST /api/research/specs/draft-with-talon` with the idea_id.
3. Branch on response:
   - **200 PASS** → redirect to `/spec/edit?spec_id=${response.spec.spec_id}`.
     Same surface the operator-author path lands on.
   - **200 WARN** → redirect to `/spec/edit?spec_id=…` AND set a session
     flag (`localStorage[`talon-warn:${spec_id}`] = JSON.stringify(warnings)`)
     so the spec edit page can render a yellow callout above the form
     summarizing the readiness warnings on first load. Op can dismiss it.
   - **422 data_unavailable** → render a new `<DataUnavailableCard>` in
     place of the redirect. Shows `blocking_summary`, `suggested_action`,
     and the missing requirements list. The "Author the spec yourself"
     row stays visible — the operator can still hand-author one that
     uses different data.
   - **502 / 503 / other** → render the existing `ErrorLine` with the
     `talon_error` detail. "Author the spec yourself" stays visible.
4. While the call is in flight, both action rows show a rotating
   "Talon is drafting…" busy state (~15–30s). Suggested rotation:
   "Reading your thesis…" → "Proposing signal logic…" →
   "Checking data availability…" — the last one signals the readiness
   step is real, not cosmetic.

The form already shows the AI_DRAFTED banner; no form changes needed.
The yellow WARN callout is a small new component on the spec edit page.

---

## §6 — Operator UX details

- **Thin thesis vs unavailable data — different rules.** A vague thesis
  ("retail sentiment edge") is allowed; Talon produces a sparse-but-
  valid spec the operator tightens in the form. A thesis that depends
  on data we don't have ("trade based on implied vol surface skew")
  must BLOCK — operator sees what's missing and re-thinks. We never
  draft fantasy plumbing.
- **WARN callout copy** on the spec edit page should read like:
  > Talon flagged data gaps before drafting:
  > - `reddit_wsb_velocity` — manual scrape, no SLA
  > - `google_trends` — sample-rate noisy
  >
  > Spec persisted with these caveats stamped into implementation
  > notes. Edit if you want to change the data dependencies before
  > submitting.
- **BLOCKED card copy** on the awaiting-spec body should read like:
  > Talon couldn't draft this — required data isn't wired in yet.
  >
  > Missing: implied vol surface
  >
  > Suggested next step: add an IV surface connector, or re-thesis
  > without options surface dependency.
  >
  > [Author the spec yourself anyway →]
- **Loading state on the awaiting-spec card matters.** 15–30s is a long
  time without feedback. Rotate the inline progress message every ~5s
  so the data-readiness check feels intentional, not stuck.
- **The spec edit page after drafting is identical to the operator-
  author path.** Same form, same actions. The only visual differentiators
  are the AI_DRAFTED banner above the form (already exists) and the
  optional WARN callout on first load.
- **Operator can absolutely re-draft.** If they don't like Talon's
  output, "Cancel" returns them to the idea page where they can hit
  "Draft with Talon" again (creates a fresh spec_id) or "Author yourself."
  Cleanup of the abandoned draft is whatever the existing DELETE
  /api/research/specs/[id] flow does for DRAFTING specs (it works).
- **BLOCKED specs do not consume a spec_id slot on the idea.** The 422
  is a clean refusal. Operator can re-thesis the idea (edit thesis,
  retry) without any state cleanup.

---

## §7 — Verification & test plan

### Unit / integration

1. Happy path PASS: known idea + thesis using AVAILABLE data → spec
   persisted, idea linked, `data_readiness.verdict === "PASS"`,
   response shape correct.
2. Happy path WARN: thesis using one PARTIAL source → spec persisted,
   `implementation_notes` prefixed with `"Data-readiness warnings:"`,
   `data_readiness.verdict === "WARN"`, warnings array populated.
3. BLOCKED: thesis explicitly requiring an UNAVAILABLE capability
   (e.g. "trade implied vol surface skew") → 422
   `error: "data_unavailable"`, no spec on disk, no idea mutation,
   `blocking_summary` + `suggested_action` populated.
4. Server-side verdict override: mock Talon to claim
   `matched_capability: "fictional_capability_id"` with status
   AVAILABLE → server downgrades to MISSING, recomputes verdict to
   BLOCKED, returns 422.
5. Catalog missing: rename catalog file → 503 with clear message; no
   Talon call attempted.
6. Talon timeout: mock Anthropic SDK to throw → 502, no spec on disk,
   no idea mutation.
7. Talon malformed: mock to return either tool call that fails Zod → 502,
   same no-side-effects guarantee.
8. Idea precondition fail (already SPEC_PENDING): 409, no Talon call.
9. Concurrent calls on the same idea: second one 409s if the first
   already linked the idea. (Race-condition tolerance is acceptable —
   one of them wins.)
10. Provenance file written atomically with spec/idea YAML in the same
    commit (PASS and WARN paths only).

### Manual smoke

1. Set `TALON_SPEC_DRAFTING_ENABLED=1` and the frontend flag locally.
2. **PASS path**: Ape Wisdom idea (sentiment + attention proxies, both
   AVAILABLE) → "Draft with Talon" → spec edit surface lands with
   prefilled fields, AI_DRAFTED banner, no WARN callout.
3. **WARN path**: a fabricated idea whose thesis explicitly leans on
   `reddit_wsb_velocity` (PARTIAL) → "Draft with Talon" → spec edit
   surface lands with WARN callout above the form. `implementation_notes`
   in the persisted YAML has the `Data-readiness warnings:` prefix.
4. **BLOCKED path**: a fabricated idea whose thesis demands implied vol
   surface skew → "Draft with Talon" → DataUnavailableCard renders on
   the awaiting-spec body with the blocking summary and suggested
   action. No spec written to disk.
5. Save draft, edit a field, re-save — verify round-trip through the
   form-mapping is clean (no description-key duplication, etc.).
6. Submit for approval → approve → check the audit trail records
   `authored_by: jacob` and `authoring_mode: AI_DRAFTED` distinctly.

### Acceptance for shipping

- 502 path tested with at least one real Anthropic-side error (revoke
  the key briefly in dev, hit the endpoint, confirm clean failure).
- 422 BLOCKED path tested with a real thesis that demands UNAVAILABLE
  data; verify zero on-disk state.
- One PASS-verdict Talon-drafted spec walked all the way through to
  APPROVED with no hand-edit needed (proves baseline quality).
- One WARN-verdict Talon-drafted spec walked through with the warnings
  preserved in implementation_notes (proves the WARN persistence path).
- One PASS-verdict spec walked through with significant operator
  edits (proves the round-trip).

---

## §8 — Open questions for v1

| ID | Question | Default |
|---|---|---|
| TSD-1 | Stream the drafting progress to the client? | No — single-shot generateText, ~15s budget. Stream is a v2 nicety. |
| TSD-2 | Should Talon refuse to draft for ideas with empty/sparse theses? | No — the model produces a thinner spec, operator decides. **Distinct from data-readiness**: thin thesis ≠ unavailable data. The latter still BLOCKS per §3a. |
| TSD-3 | Persist the raw Talon prompt + completion as provenance? | **LOCKED yes** — write to `data/research_lab/<scope>/strategy_specs/<spec_id>_provenance.json` alongside the spec YAML in the same atomic commit. Useful for debugging spec quality drift and auditing data-readiness verdicts. |
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

- [ ] Endpoint route + request validation matches §2 (including the new
      422 data_unavailable shape).
- [ ] Two-tool structured output approach (§3) accepted, or alternative
      proposed for forcing both `propose_strategy_spec` and
      `assess_data_readiness` in one call.
- [ ] **Data capability catalog v1** (§3a) — Codex reviews the seed
      table and confirms accuracy. Ownership: dashboard repo authors
      the file; Codex updates as new connectors come online.
- [ ] Server-side verdict re-resolution (§3a) — if Talon over-claims a
      capability, server downgrades. Catalog is source of truth.
- [ ] `linkIdeaToSpec` factored out of `route.ts` into `_shared.ts`
      (small refactor, both endpoints share the precondition logic).
- [ ] Persistence flow (§4) leaves zero on-disk state on 422 BLOCKED
      and on 502 Talon failure.
- [ ] Provenance file (TSD-3, locked default-yes) written atomically
      with the spec+idea commit on PASS/WARN paths.
- [ ] Vercel env vars: `ANTHROPIC_API_KEY` confirmed present;
      `TALON_SPEC_DRAFTING_MODEL` optional default set.

Once the eight checks above land, Claude flips
`NEXT_PUBLIC_TALON_DRAFTING_ENABLED=1` on prod and the "Draft with
Talon" button goes live with the data-readiness gate enforced.
