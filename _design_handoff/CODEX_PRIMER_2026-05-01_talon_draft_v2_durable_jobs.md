# Codex Primer — Talon Draft v2: durable jobs + validation/repair loop

**Date:** 2026-05-01
**From:** Claude (Opus 4.7), per Jacob's request
**For:** Codex
**Scope:** Replace the synchronous `/api/research/specs/draft-with-talon`
endpoint with a durable async job pipeline. Live state lives in Vercel
KV (or equivalent); only terminal-state proposals + audit records get
persisted to GitHub. The UI polls a scoped job-poll endpoint and
renders state-aware copy. The existing sync endpoint stays alive as a
bridge until v2 is proven.

---

## §1 — Why this exists

The synchronous draft endpoint cracks at the predictable seams:

- **60s Vercel function ceiling.** Talon often takes longer; operator
  hits a 504, the request is gone, the bundle has nothing to fall
  back to. Even with prompt tightening and the JSON-string envelope,
  we're one schema bump away from the same wall.
- **Fragile UI dependency on env flags.** Today's `4676e5eb` regression
  proved that a client-bundle env-var gate isn't reliable infra.
  Removing the gate (Codex's `78405504`) was the right band-aid;
  durable state is the right structural answer.
- **No repair loop.** The model occasionally returns invalid
  proposals. Today we surface the failure to the operator. With a
  validation/repair pass, we can self-heal one step before bothering
  them.
- **No observability.** Today's drafts vanish into the void. With a
  job artifact, every attempt is auditable: which step it died on,
  how many tokens, which validation errors triggered a repair.

The pattern: **Talon proposes; deterministic code validates and
repairs; UI observes durable state.**

---

## §2 — `talon_draft_job.v1` schema

```ts
export interface TalonDraftJobV1 extends ScopeTriple {
  schema_version: "research_lab.talon_draft_job.v1"
  job_id: string                      // ulid (time-ordered, sortable)
  idea_id: string
  created_at: string                  // ISO
  updated_at: string                  // ISO
  state: TalonDraftJobState

  /** Surfaced to UI for "doing X" progress indicators. */
  current_step: TalonDraftJobStep | null
  steps_completed: TalonDraftJobStep[]

  /** Repair-loop accounting. Caps at MAX_REPAIR_ATTEMPTS (§7). */
  repair_attempts: number

  /** Optional intent the operator typed when starting the job
   *  (e.g., "make it more aggressive on entry"). Worker passes this
   *  to Talon as guidance; null when the operator just hit Draft. */
  intent_message?: string | null

  /** Final outcomes — only populated on terminal states. */
  proposal?: StrategySpecV1 | null
  assessment?: TalonDataReadinessAssessment | null
  validity_issues?: ExperimentPlanValidityIssue[] | null

  /** Failure / cancellation context. */
  error?: string | null
  error_code?: TalonDraftJobErrorCode | null
  cancelled_by?: string | null
  cancelled_at?: string | null

  /** Per-call audit. Non-load-bearing for UI; surfaces in the
   *  GitHub job-record artifact for replay/debugging. */
  model_calls?: TalonDraftJobModelCall[]
}

export type TalonDraftJobState =
  | "QUEUED"
  | "RUNNING"
  | "REPAIRING"
  | "READY"      // proposal + assessment.verdict === "PASS"
  | "WARN"       // proposal valid, partial data
  | "BLOCKED"    // proposal valid, required data missing
  | "FAILED"
  | "CANCELLED"

export type TalonDraftJobStep =
  | "load_context"           // idea + references + data catalog + experiment template
  | "draft_strategy_core"    // signal_logic, entry/exit, universe, risk
  | "draft_experiment_plan"  // benchmark, eras, thresholds, verdict rules
  | "data_readiness"         // deterministic check vs catalog
  | "validate_schema"        // zod + validateExperimentPlan
  | "repair"                 // re-prompt with validation errors
  | "persist"                // write final artifact to GitHub

export type TalonDraftJobErrorCode =
  | "ANTHROPIC_TIMEOUT"
  | "ANTHROPIC_RATE_LIMIT"
  | "ANTHROPIC_ERROR"
  | "VALIDATION_EXHAUSTED"   // hit MAX_REPAIR_ATTEMPTS
  | "DATA_CATALOG_MISSING"
  | "WORKER_TIMEOUT"         // hard 5min cap
  | "INTERNAL_ERROR"

export interface TalonDraftJobModelCall {
  step: TalonDraftJobStep
  attempt: number             // 0 for initial, 1+ for repairs
  tokens_in: number
  tokens_out: number
  latency_ms: number
  model: string               // e.g. "claude-opus-4-7"
  finish_reason?: string | null
}
```

Terminal states: `READY | WARN | BLOCKED | FAILED | CANCELLED`. The
UI stops polling once it sees one of these.

`BLOCKED` deserves a callout: the proposal *is* valid, but the data
catalog says we can't actually run it. We persist the proposal so
the operator can see what Talon drafted and either pick a different
data source or accept the block — but we never auto-promote it.

---

## §3 — KV key naming + multi-tenant scoping

ScopeTriple must be encoded in keys, not just in payloads. Worst-case
failure mode is one user observing another user's draft because the
poll endpoint forgot to scope-check.

```
talon_job:{user_id}:{job_id}              → JSON job artifact (the source of truth)
talon_job_active:{user_id}:{idea_id}       → currently-running job_id (single-active enforcement)
talon_job_idx:{user_id}:{idea_id}          → set of historical job_ids for this idea (audit)
```

- **Reads must scope-check at the API boundary**, even though the key
  itself is scoped — defense in depth. A poll request without a
  matching `user_id` returns 404 (not 403; we don't leak existence).
- **TTL policy:**
  - Active jobs (QUEUED/RUNNING/REPAIRING): no TTL, manually cleared
    when terminal.
  - Terminal jobs: 24h TTL in KV. The persistent record lives in
    GitHub (§9) — KV is the live-state store, not the audit store.
- **Cost note:** at ~10 jobs/day/user, Vercel KV's free tier is
  enough. Worth confirming during build, not blocking.

---

## §4 — POST `/api/research/specs/draft-jobs` (start endpoint)

```http
POST /api/research/specs/draft-jobs
Content-Type: application/json
{
  "idea_id": "idea_xxx",
  "scope": { "user_id": ..., "account_id": ..., "strategy_group_id": ... },
  "intent_message": "make it more aggressive on entry"  // optional
}
```

Behavior:

1. Resolve idea, verify scope match.
2. Read `talon_job_active:{user_id}:{idea_id}`. If a non-terminal
   job exists, return **409** with the existing `{ job_id, state }`
   — operator UI latches onto the existing job rather than spawning
   a parallel draft. (Idempotency on double-tap.)
3. Generate `job_id` (ulid for time-ordering).
4. Write `talon_job:{user_id}:{job_id}` with `state: "QUEUED"`,
   `current_step: null`, `repair_attempts: 0`, `created_at`,
   `updated_at`, `intent_message`.
5. Set `talon_job_active:{user_id}:{idea_id} = job_id`.
6. Append `job_id` to `talon_job_idx:{user_id}:{idea_id}`.
7. Enqueue worker (worker execution model is your call — see §13.1).
8. Return **202** `{ job_id, state: "QUEUED", poll_url: "/api/research/specs/draft-jobs/{job_id}" }`.

---

## §5 — GET `/api/research/specs/draft-jobs/[job_id]` (poll endpoint)

```http
GET /api/research/specs/draft-jobs/{job_id}
  ?user_id=...&account_id=...&strategy_group_id=...
```

Behavior:

1. Read `talon_job:{user_id}:{job_id}` — 404 if missing OR if any
   scope element fails to match.
2. Return the full `TalonDraftJobV1` artifact.
3. Headers: `Cache-Control: no-store`. Polling reads must always be
   fresh.

This endpoint is **read-only** — workers and cancellation paths
mutate state through their own writes. No risk of poll storms
corrupting state.

---

## §6 — State machine

```
                    ┌─────────────────────────────────────┐
                    ▼                                     │
         QUEUED ──────► RUNNING ────► READY (PASS)        │
            │              │     ├──► WARN (partial data) │
            │              │     ├──► BLOCKED (missing)   │
            │              │     ├──► REPAIRING ──────────┘ (worker re-enters RUNNING)
            │              │     │                          (max MAX_REPAIR_ATTEMPTS)
            │              │     │
            │              │     └──► FAILED
            │              │
            ▼              ▼
        CANCELLED      CANCELLED
       (pre-pickup)   (mid-flight)
```

- **Atomicity:** every transition is a CAS write in KV. Worker reads
  current state before each step; if it sees CANCELLED, it exits
  cleanly without further writes.
- **REPAIRING is a sub-state of RUNNING from the user's perspective**
  — UI shows distinct copy ("Repairing draft…") but it's still
  active work.
- **Terminal states are sticky.** No transitions out of READY, WARN,
  BLOCKED, FAILED, or CANCELLED.

---

## §7 — Repair-loop limits

- `MAX_REPAIR_ATTEMPTS = 2` (one initial draft + up to two repair
  passes). Reasoning: most validation issues are minor (missing
  required field, malformed enum); a single repair pass usually
  fixes them. Two attempts is the elbow before "the model genuinely
  doesn't get it."
- On each repair attempt, the worker re-prompts Talon with:
  - The previous proposal
  - The exact `validity_issues[]` from validateExperimentPlan
  - Any zod parse errors
  - Instruction: "fix these specific issues, change nothing else"
- If `repair_attempts >= MAX_REPAIR_ATTEMPTS` and validation still
  fails → `state: "FAILED"`, `error_code: "VALIDATION_EXHAUSTED"`.
  Surface the last validation errors in `error` so the operator
  knows why.

---

## §8 — Cancellation

```http
DELETE /api/research/specs/draft-jobs/{job_id}
  ?user_id=...&account_id=...&strategy_group_id=...
```

Behavior:

1. Look up job; verify scope. 404 on mismatch.
2. If state is terminal, return **409** with the current job
   artifact — can't cancel something already done.
3. Atomic CAS: `state ∈ {QUEUED, RUNNING, REPAIRING}` →
   `state: "CANCELLED"`, set `cancelled_at`, `cancelled_by`.
4. Clear `talon_job_active:{user_id}:{idea_id}`.
5. Return **200** with the updated job artifact.

The worker is responsible for checking the current state before each
step. If it sees CANCELLED mid-flight, it exits cleanly — no
half-written proposals, no orphan model calls reported. Workers must
not re-write state once they observe CANCELLED.

---

## §9 — Final GitHub artifact shape

When a job reaches **READY / WARN / BLOCKED**, the worker persists
two things to GitHub before flipping the KV record to terminal:

1. **The drafted spec** — same shape and path as today's sync
   drafts. Existing readers (spec-edit page, idea-thread, etc.)
   work without changes.

2. **A `talon_draft_job_record.v1`** at:
   ```
   data/research_lab/talon_jobs/{idea_id}/{job_id}.json
   ```
   Captures the full audit trail: every step, every model call,
   every repair attempt, the final assessment. Useful for:
   - Replaying drafts during prompt-engineering iterations
   - Debugging "why did it draft X?"
   - Cost analysis (token totals roll up)
   - Future training data for a fine-tuned drafting model

`FAILED` and `CANCELLED` jobs **don't** write the GitHub job-record
— they live in KV with the 24h TTL and disappear. We can revisit if
operators want to see "my last 10 cancelled drafts."

---

## §10 — UI behavior per state

| State | Button label | Sub-copy | Click action |
|-------|-------------|----------|--------------|
| (no job) | **Draft with Talon** | "Talon reads thesis + references, drafts a complete spec" | POST start |
| QUEUED | Queued… | "Talon will pick this up shortly" | (cancel link) |
| RUNNING | Drafting… | "{current_step} · {steps_completed.length}/{TOTAL_STEPS}" | (cancel link) |
| REPAIRING | Repairing draft… | "Talon is fixing validation issues (attempt {repair_attempts}/{MAX})" | (cancel link) |
| READY | **Review draft** | "Proposal ready · {assessment.verdict}" (gold treatment) | open spec edit |
| WARN | **Review draft (warnings)** | "Some data is only partially available" | open spec edit |
| BLOCKED | **Review draft (blocked)** | "Required data missing — can't run as-drafted" | open spec edit |
| FAILED | Try again | error message + error_code | POST start (new job) |
| CANCELLED | Draft with Talon | "Last draft was cancelled" | POST start (new job) |

**Polling cadence:**
- 2s while QUEUED, RUNNING, or REPAIRING
- If state unchanged for 30s, exponential backoff: 2s → 4s → 8s → cap at 10s
- Stop on terminal state
- **Hard 5-minute cap** — if still non-terminal at 5min, the worker
  itself sets `state: "FAILED"`, `error_code: "WORKER_TIMEOUT"`
  before the UI's cap fires. UI's role is just to surface what KV
  reports.

**The button never disappears.** That's the durable-job promise:
operator always sees *something* responsive, regardless of network,
flag state, or in-flight requests.

---

## §11 — Coexistence with the synchronous endpoint

- `/api/research/specs/draft-with-talon` (sync) stays alive,
  unchanged, as a bridge.
- v2 is the new path; sync is what existing inflight code paths
  fall back to.
- No deprecation timeline yet — wait until v2 has been live ≥7
  days without regression, then migrate the remaining callers.
- During the bridge window, the UI prefers v2 when available (POST
  job → poll), falling back to sync only if KV is unreachable
  (defensive, shouldn't happen in steady state).

This way, if v2 has a bad day during rollout, sync absorbs the
traffic and operators don't notice.

---

## §12 — Multi-tenant safety checklist

Per the standing multi-tenant law:

- [ ] `TalonDraftJobV1` extends `ScopeTriple` (user_id, account_id,
      strategy_group_id all required).
- [ ] All KV keys include `{user_id}` as a top-level prefix.
- [ ] POST validates scope against the resolved idea's scope before
      writing.
- [ ] GET 404s on any scope element mismatch (not 403 — don't leak
      existence).
- [ ] DELETE same.
- [ ] Worker never reads a job by ID alone — always reads the
      scoped key.
- [ ] No global indexes that span users (`talon_jobs_active` would
      be wrong; `talon_job_active:{user_id}:{idea_id}` is right).

---

## §13 — Open questions for you

1. **Worker execution model.** Vercel cron, Inngest, QStash,
   background fetch, edge runtime with long execution? The job
   contract is execution-model-agnostic — pick whatever you trust
   most for "starts within seconds, can run up to 5min, can be
   cancelled mid-flight." My uneducated lean is **Inngest** because
   it composes with Vercel and gives durable retry semantics for
   free, but you know better.

2. **KV provider.** Vercel KV (Upstash-backed) vs. plain Upstash
   Redis vs. Cloudflare KV. Functionally equivalent for this
   workload. Vercel KV is the path of least resistance unless
   you have a strong preference.

3. **Idempotency on start endpoint.** I propose 409 with the
   existing job_id when an active job exists. Acceptable, or do
   you want a different shape (e.g., 200 with the existing job,
   so the UI doesn't have to special-case 409)?

4. **`ANTHROPIC_BASE_URL` for AI Gateway.** When Gateway lands as a
   follow-up, it'd plug in via base-URL env var with no code
   change in the worker. Worth confirming when you scope Gateway
   work.

5. **Multi-step prompt strategy.** §7 implies one model call per
   "draft" step (core, experiment plan), then validation, then
   repair. Do you want each step as a separate Anthropic call (more
   model calls, smaller context per call) or one big call with
   structured-output sections (one call, larger context, harder to
   repair targetedly)? My lean is **separate calls** — easier to
   repair surgically, better latency on the cheap steps, observability
   per-step. But it doubles Anthropic spend per draft.

6. **Cancellation propagation latency.** Worker checks state at
   step boundaries. If the model call itself is in flight when
   CANCELLED arrives, do we abort the call (Anthropic supports
   request cancellation via AbortController) or let it complete
   and discard? I lean **abort to save tokens**, but the simplicity
   of "let it complete, write CANCELLED on next state read" is
   appealing if abort is fragile.

---

## §14 — Sequencing

1. **You:** Build the worker + KV + endpoints + state machine.
   Estimated multi-day piece.
2. **Me:** Build the UI polling component, state-aware button copy,
   cancellation affordance, idea-thread integration. Should land
   in parallel once the contract is firm.
3. **Both:** Smoke-test end-to-end with a real idea + parent
   reference + WARN-then-BLOCKED-then-PASS verdict cases.
4. **Me:** Migrate idea-thread "Draft with Talon" to v2; sync
   endpoint stays as fallback.
5. **You:** After ≥7 days clean v2, deprecate sync.

If anything in here doesn't match your model of how Vercel KV /
worker execution should compose, push back hardest on §3, §4, §13.1,
§13.5. Those are the structural spots where I'm guessing more than
I'd like.
