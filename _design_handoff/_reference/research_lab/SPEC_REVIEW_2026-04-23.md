# Research Lab — Spec Review (2026-04-23)

**Status:** Rev 3 — amended after Codex's Rev-2 P2 review (same day).
No remaining P1 blockers. Ready for implementation.
**Scope:** App-driven strategy research. From idea → bench campaign →
results → promotion candidate, with nightly autopilot and AI-assisted
reporting as later phases.
**Supersedes:** n/a (new surface).

**Rev 3 changes (post-Codex review, 2026-04-23):**

1. **Preallocated `job_id`.** Dashboard generates a ULID at submit time,
   includes it in the request file, returns it to the caller, and the
   worker uses it as the authoritative job-row primary key. Keeps
   `request_id` and `job_id` as distinct identifiers with room for
   future resubmit semantics. Fixes Codex Rev-2 P2.1.
2. **Honest store-outage degradation.** When the managed store is
   unreachable, the UI says "Live progress unavailable — the job is
   still running; results will appear on completion." No "last seen at"
   pretense. Jobs continue; cold artifacts still flow through the
   outbox. Fixes Codex Rev-2 P2.2.
3. **Cancel explicitly deferred from Phase 1a/1b.** `CANCELLED` state
   remains reserved in the state machine but is not exercised in 1a or
   1b. No `cancel_request.v1` contract, no `/api/research/cancels`
   route, no executor cancellation semantics. Moved to Phase 1c as the
   first follow-up slice once the happy path is proven. Fixes Codex
   Rev-2 P2.3.
4. **Phase 1a acceptance tests enumerated as §11.** Six required tests,
   including the Codex five plus idempotent-enqueue on duplicate
   request replay.

**Rev 2 changes (post-Codex review, 2026-04-23):**

1. **Hot state split from cold audit.** `jobs.db`, heartbeats, live job
   snapshots now explicitly live in a runtime (gitignored) state
   directory. Only terminal artifacts (final `result.v1`, `candidate.v1`,
   `morning_report.v1`, audit-log rollups, ideas, presets) get committed
   to git. Fixes Codex P1.1.
2. **Ingress + state channels are explicit.** New §2.9 names the two
   channels: **submit** via governed request files committed to the
   dashboard repo (same pattern as `/api/passport/workflow`); **live
   read** via a managed state store (Upstash Redis or Vercel KV) the
   worker publishes to and the dashboard reads from. No Vercel-to-WSL
   mutation. Fixes Codex P1.2.
3. **False atomicity claim removed.** SQLite is authoritative. The audit
   file trail is an outbox written idempotently by the worker after DB
   commit — recoverable from mid-write crashes. Fixes Codex P1.3.
4. **Promotion handoff adapter is a named artifact.** New `nomination.v1`
   artifact + backend-owned CLI. Dashboard Promote button POSTs through
   the same governed-request channel; no fork of existing promotion
   logic, no undocumented side effects. Fixes Codex P1.4.
5. **Phase 1 split into 1a / 1b.** Phase 1a = stocks-only E2E proof
   (beachhead). Phase 1b = crypto + options preset YAMLs + empty-state
   readiness wiring (no new worker code). Resolves Codex P2 scope
   inconsistency. Both 1a and 1b ship before Phase 2 starts.

**Locked decisions (Jacob, 2026-04-23):**

- Idea spec shape: shared header + per-sleeve typed body.
- Executor model: persistent job queue (SQLite, runtime dir) +
  git-backed cold audit for terminal artifacts only.
- Phase 1 preset library ships in two slices:
  - **Phase 1a:** stocks preset only (E2E proof).
  - **Phase 1b:** crypto + options preset YAMLs added + honest
    empty-state readiness wiring. Same worker, same contracts; just
    registry + UI additions.
- Idea capture: conversation-cued save ("save this idea") + manual YAML
  commits ship at Phase 2; dashboard UI form Phase 3.
- **Scope model:** three-level from day 0 — `user_id` + `account_id` +
  `strategy_group_id` on every contract and in filesystem paths. Phase 1
  defaults: `{user: "jacob", account: "paper_main", strategy_group:
  "default"}`.
- **Job retry:** auto-retry once on specific transient error codes
  (`heartbeat_timeout`, `upstream_data_fetch_failed`) with 5-min backoff.
  Every other failure is terminal until human intervention.
- **Promotion events:** research-lab promotions append to the same
  `state/rebuild_history/strategy_promotion_events.jsonl` as manual
  strategy-bank promotions, with an `origin` field
  (`"manual"` | `"research_lab"`) to distinguish.
- **Ingress + state channels:** submit via governed request files
  committed to the dashboard repo; live read via managed state store.
  Details in §2.9.
- **On-demand is first-class.** The research lab is runnable at will,
  any time of day — not just overnight. Autopilot (Phase 3) is *one
  additional submitter* into the same queue, not a replacement for the
  manual path. The on-demand surface shipped in Phase 1 persists across
  all phases. The worker cannot distinguish autopilot-submitted jobs
  from human-submitted ones.
- No hard blockers on phase transitions. Phases overlap where feasible.
- Scalable to options + crypto from day one, not stocks-only.

---

## 1. TL;DR architecture

```
  Dashboard (Vercel)                                     Trading bot host (WSL today, anything tomorrow)
  ------------------                                     ------------------------------------------------
  /vires/lab  UI
      │ submit
      ▼
  /api/research/requests ──commits request file──► dashboard-repo/requests/*.json (git, audit)
                                                         │
                                                         │ worker git-fetch poll (15s)
                                                         ▼
                                                   research-lab worker
                                                         │
                                                         ├─ Compiler (idea + preset → bench bundle)
                                                         ├─ LocalExecutor.run(bundle)
                                                         ├─ Summarizer → result.v1 (cold, git)
                                                         ├─ Candidate adapter → candidate.v1 (cold, git)
                                                         ├─ Nomination adapter (on Promote) → strategy-bank record
                                                         │
                                                         ├─ jobs.db (SQLite) — runtime, gitignored
                                                         └─ outbox writer: audit_log rollup → git (cold)
                                                         │
                                                         └── live-state publisher ──► managed store (Redis/KV)
                                                                                                       ▲
  /api/research/jobs/:id ◄──────────────────────────────── GET live state ────────────────────────────┘
  /api/research/results/:id ◄── GET cold artifact via dashboard mirror (git)

  Two channels, by design:
  • SUBMIT: governed request file, git-audit free, asynchronous poll.
  • LIVE READ: managed store (~15s freshness), no git involvement.
  Dashboard never mutates trading-bot state directly. No ad hoc JSON.
  No direct state picking through trading-bot internals.
```

Three surfaces, each with a real boundary:

- **Control plane (app).** Authors idea specs, submits campaign requests,
  views job status, views results, triggers promotion. Does not author
  bench artifacts directly.
- **Research engine (trading-bot).** Owns the idea → bundle compiler, the
  executor, the bench runner, the result summarizer, the promotion
  readiness adapter. Emits all canonical artifacts.
- **Contract layer (shared).** Versioned JSON/YAML schemas. The only way
  the two sides talk. Dashboard never reaches into trading-bot state.

---

## 2. Contracts

All contracts live in `docs/architecture-rebuild/` on the trading-bot side
with a `schema_version` field. Dashboard imports type definitions from a
generated TypeScript file (`lib/research-lab-contracts.ts`) that's updated
from the Python source of truth.

### 2.1 Strategy idea spec — `idea.v1`

Shared header + per-sleeve typed body. Stored as YAML for diffability.

```yaml
schema_version: "research_lab.idea.v1"
idea_id: "idea_01HXXX..."          # ULID, reverse-timestamp-sortable
user_id: "jacob"
account_id: "paper_main"
strategy_group_id: "default"
title: "Large-cap momentum with SPY regime gate"
thesis: |
  Free-text rationale. Why this idea is worth testing.
  What edge is it supposed to capture.
sleeve: "STOCKS"                    # STOCKS | CRYPTO | OPTIONS
strategy_family: "regime_aware_momentum"   # MUST match an entry in the
                                    # strategy registry (no freeform)
tags: ["momentum", "regime"]
status: "DRAFT"                     # DRAFT | READY | QUEUED | ACTIVE |
                                    # SHELVED | RETIRED
created_at: "2026-04-23T14:22:11Z"
created_by: "jacob"                 # actor_id
source: "CONVERSATION"              # CONVERSATION | MANUAL | IMPORTED
provenance:
  conversation_id: null             # Optional — link to chat session
  commit_sha: null                  # Optional — commit that saved it
  notes: null
params:                             # Per-sleeve typed — see below
  ...
```

Sleeve-typed `params` block:

```yaml
# STOCKS
params:
  universe: ["AAPL", "MSFT", ...]  # or a named universe ref
  stop_pct: 0.05
  target_pct: 0.15
  entry_filter: "20d_momentum_positive"
  regime_gate: "spy_above_200dma"

# CRYPTO
params:
  symbol: "BTC-USD"
  timeframe: "4H"
  tsmom_lookback: 96
  vol_filter: "realized_20bar"
  tier_ladder: "graduated"

# OPTIONS
params:
  underlying: "SPY"
  strategy: "covered_call"          # covered_call | protective_put |
                                    # vertical_spread | ...
  iv_rank_min: 0.40
  dte_range: [21, 45]
  strike_rule: "delta_0.30"
```

The strategy registry (existing, trading-bot-owned) is the authority on
what `strategy_family` values are valid per sleeve and what params they
accept. The compiler (§2.3) validates against it.

### 2.2 Research campaign request — `campaign_request.v1`

Emitted by the dashboard when the user clicks Submit. Stored as JSON,
git-tracked, and enqueued in the job queue.

```jsonc
{
  "schema_version": "research_lab.campaign_request.v1",
  "request_id": "req_01HXXX...",
  "job_id": "job_01HXXX...",             // PREALLOCATED by the submitter.
                                          // Worker uses this as the job-row
                                          // primary key. One request, one
                                          // job — if a future resubmit
                                          // spawns a new job, it carries a
                                          // new request_id + job_id pair.
  "user_id": "jacob",
  "account_id": "paper_main",
  "strategy_group_id": "default",
  "idea_id": "idea_01HXXX...",
  "actor": "jacob",
  "submitted_at": "2026-04-23T14:30:00Z",
  "submitted_by": "USER_ONDEMAND",        // USER_ONDEMAND | AUTOPILOT_NIGHTLY |
                                           // API | AI_TRIAGE
  "preset_id": "stocks.momentum.stop_target.v1",
  "param_sweep": {
    "stop_pct":   [0.03, 0.05, 0.07],
    "target_pct": [0.10, 0.15, 0.20]
  },
  "cost_model": "system_default",
  "execution_intent": "FULL_CAMPAIGN",     // DRY_RUN | FULL_CAMPAIGN
  "priority": "NORMAL",                    // NORMAL | HIGH | LOW
  "notes": "First pass — baseline sweep."
}
```

Preset IDs are pulled from the preset library (§2.8). The sweep shape is
bounded by the preset — the UI cannot submit arbitrary parameter names.

`submitted_by` is metadata only — the worker does not branch on it. It
exists so we can filter the job log (e.g., "show me only user-submitted
runs from this week") and so the morning report can attribute which
jobs came from autopilot vs on-demand.

### 2.3 Compiled bench input bundle — `bench_bundle.v1`

Output of the compiler. The ONLY thing the bench runner actually ingests.
This is the artifact that enforces "app doesn't author backend truth."

```jsonc
{
  "schema_version": "research_lab.bench_bundle.v1",
  "bundle_id": "bundle_01HXXX...",
  "request_id": "req_01HXXX...",
  "idea_id": "idea_01HXXX...",
  "user_id": "jacob",
  "account_id": "paper_main",
  "strategy_group_id": "default",
  "generated_at": "2026-04-23T14:30:12Z",
  "compiler_version": "1.0.0",
  "bench_manifest": {
    // This is the existing bench campaign_manifest.v2 shape.
    // The compiler's job is to produce it correctly.
    "schema_version": "bench_campaign_manifest.v2",
    ...
  },
  "validation": {
    "compiler_checks_passed": true,
    "strategy_family_valid": true,
    "param_sweep_bounded": true,
    "universe_resolved": true
  }
}
```

### 2.4 Research job / run status — `job.v1`

**Source of truth lives in SQLite** (`jobs.db`) in the runtime state
directory (gitignored). The worker publishes a live snapshot to the
managed state store (§2.9) on every state transition and on every
heartbeat. No git commits happen during `RUNNING` — that's the whole
point of the hot/cold split.

Terminal-state snapshots (`DONE`, `FAILED`, `CANCELLED`) are written
once to the cold git-tracked path `jobs/<job_id>.final.json`, driven by
the outbox writer (§6.8). Intermediate states never touch git.

```jsonc
{
  "schema_version": "research_lab.job.v1",
  "job_id": "job_01HXXX...",           // preallocated by submitter in the
                                        // campaign_request; worker treats
                                        // this as the authoritative row key
  "user_id": "jacob",
  "account_id": "paper_main",
  "strategy_group_id": "default",
  "request_id": "req_01HXXX...",
  "bundle_id": "bundle_01HXXX...",     // null until compile done
  "state": "RUNNING",                   // see state machine below
  "executor_id": "local:wsl-1",
  "created_at": "2026-04-23T14:30:00Z",
  "started_at": "2026-04-23T14:30:14Z",
  "finished_at": null,
  "heartbeat_at": "2026-04-23T14:32:05Z",
  "progress": {
    "variants_complete": 4,
    "variants_total": 9,
    "phase": "grid_sweep"              // compile | grid_sweep | validate | summarize
  },
  "retry_count": 0,                     // 0 on first attempt; 1 after a retry
  "retry_eligible_after": null,         // ISO ts when backoff expires (RETRY_QUEUED only)
  "result_id": null,                    // set on DONE
  "error": null,                        // free-text (set on FAILED)
  "error_code": null                    // typed — see retry policy below
}
```

**State machine:**
```
QUEUED → COMPILING → COMPILE_FAILED (terminal)
              ↓
           RUNNING → POST_PROCESSING → DONE
              ↓              ↓
           FAILED         FAILED
              ↓
         (if retryable and retry_count == 0)
              ↓
         RETRY_QUEUED --[5-min backoff]--> QUEUED
              ↓
         (else terminal)

CANCELLED — reserved state; NOT exercised in Phase 1a or 1b.
            Added in Phase 1c (first follow-up slice after happy path
            is proven). No cancel_request.v1 contract, no cancel
            route, no executor cancellation semantics defined yet.
```

Heartbeat convention: worker writes `heartbeat_at` every 30s during
`RUNNING`. A stale heartbeat (>5min) marks the job `FAILED` with
`error_code: "heartbeat_timeout"` on the next supervisor poll.

**Retry policy** (locked):
- Retryable `error_code`s: `heartbeat_timeout`,
  `upstream_data_fetch_failed`. Extend this list only by spec update.
- On retryable FAILED and `retry_count == 0`: transition to
  `RETRY_QUEUED` with `retry_eligible_after = now + 5min`, then the
  supervisor promotes it back to `QUEUED` when the backoff expires and
  increments `retry_count`.
- Max one retry. A second failure is terminal regardless of code.
- All non-retryable codes are immediately terminal.

### 2.5 Campaign result summary — `result.v1`

```jsonc
{
  "schema_version": "research_lab.result.v1",
  "result_id": "result_01HXXX...",
  "job_id": "job_01HXXX...",
  "idea_id": "idea_01HXXX...",
  "user_id": "jacob",
  "account_id": "paper_main",
  "strategy_group_id": "default",
  "sleeve": "STOCKS",
  "completed_at": "2026-04-23T15:02:44Z",
  "variants": [
    {
      "variant_id": "stop_5_target_15",
      "params": { "stop_pct": 0.05, "target_pct": 0.15 },
      "metrics": {
        "total_return_pct": 90.5,
        "sharpe_ratio": 1.93,
        "sortino_ratio": 3.17,
        "calmar_ratio": 2.55,
        "max_drawdown_pct": -8.89,
        "win_rate_pct": 62.0,
        "profit_factor": 2.12,
        "trades": 163
      },
      "era_scores": [1.68, 2.11, 1.41, 2.34, 1.89, 2.02],
      "rank": 1,
      "winner": true
    },
    ...
  ],
  "plateau_analysis": "STABLE",         // STABLE | LUCKY_PEAK | MIXED |
                                        // INSUFFICIENT_EVIDENCE
  "plateau_spread": 0.44,               // metric-unit spread across top quartile
  "benchmark": {
    "symbol": "SPY",
    "total_return_pct": 80.45,
    "sharpe_ratio": 1.12
  },
  "interpretation_summary": null        // AI-filled in Phase 4; empty earlier
}
```

### 2.6 Promotion candidate summary — `candidate.v1`

This is the bridge to the existing promotion-readiness producer. The
research lab does NOT reimplement gate logic — it hands the result to the
existing `promotion_readiness.py` adapter and records what comes back.

```jsonc
{
  "schema_version": "research_lab.candidate.v1",
  "candidate_id": "candidate_01HXXX...",
  "result_id": "result_01HXXX...",
  "idea_id": "idea_01HXXX...",
  "user_id": "jacob",
  "account_id": "paper_main",
  "strategy_group_id": "default",
  "sleeve": "STOCKS",
  "strategy_id": "regime_aware_momentum::stop_5_target_15",
  "evaluated_at": "2026-04-23T15:02:50Z",
  "adapter_status": "WIRED",            // WIRED | CODE_COMPLETE_UNWIRED |
                                        // NOT_IMPLEMENTED
  "readiness": {
    "overall_status": "READY_TO_NOMINATE",  // READY_TO_NOMINATE |
                                            // MONITORED | BLOCKED |
                                            // EMPTY_STATE
    "gates": [
      { "id": "frozen_confirmation", "status": "PASS", "detail": "..." },
      { "id": "era_robustness",      "status": "PASS", "detail": "..." },
      ...
    ]
  },
  "promotion_event_id": null,           // set after Promote; matches the
                                        // id of the appended row in the
                                        // shared promotion events log
  "nomination_uri": null                // set when user clicks Promote
}
```

For sleeves whose adapter isn't wired yet (crypto code-complete-unwired,
options not-implemented), `readiness.overall_status = "EMPTY_STATE"` and
the UI renders the honest empty-state scorecard.

**Promotion event log (shared with manual strategy bank):**
When a candidate is promoted, the candidate adapter appends a row to
`state/rebuild_history/strategy_promotion_events.jsonl` with:

```jsonc
{
  "event_id": "prom_01HXXX...",
  "ts": "...",
  "strategy_id": "...",
  "origin": "research_lab",             // "manual" | "research_lab"
  "origin_ref": {                       // present only when origin == research_lab
    "candidate_id": "candidate_01HXXX...",
    "idea_id": "idea_01HXXX...",
    "result_id": "result_01HXXX..."
  },
  "actor": "jacob",
  ...existing promotion-event fields...
}
```

One log, one source of truth for every promotion in the system. Manual
strategy-bank promotions get `origin: "manual"` and no `origin_ref`.

### 2.6a Promotion handoff — `nomination.v1`

Named artifact that bridges the research lab to the existing promotion
machinery. The dashboard's "Promote" button does NOT reach into the
strategy bank directly; it submits a nomination request through the
same governed-request channel as campaign requests, and the backend
adapter materializes the strategy-bank record + promotion event + any
required bank-schema fields. This is the fix for the "Promote button —
calls existing promotion flow" gap Codex flagged.

```jsonc
{
  "schema_version": "research_lab.nomination.v1",
  "nomination_id": "nom_01HXXX...",
  "user_id": "jacob",
  "account_id": "paper_main",
  "strategy_group_id": "default",
  "candidate_id": "candidate_01HXXX...",
  "result_id": "result_01HXXX...",
  "submitted_at": "2026-04-23T15:10:00Z",
  "actor": "jacob",
  "submitted_by": "USER_ONDEMAND",
  "identity_resolution": {
    "mode": "NEW_RECORD",             // NEW_RECORD | REPLACE_EXISTING
    "replaces_record_id": null,       // set only when mode == REPLACE_EXISTING
    "resolution_rule": "no_existing_role_holder"  // or: "supersedes_<record_id>_in_role_<role_id>"
  },
  "materialized_bank_record": {
    // The strategy-bank record shape — sleeve, runtime_contract,
    // passport_role_id, active_record_ids, performance_summary, etc.
    // The adapter fills this from candidate.v1 + result.v1 + the existing
    // promotion_readiness output. The shape MUST match what the strategy
    // bank already expects — no new fields here.
    ...
  },
  "campaign_state_on_promotion": {
    "campaign_status_after": "MONITORED",  // per campaign-to-passport
                                           // workflow decision (2026-04-21)
    "baseline_reshuffle": "PROMOTED_REFERENCE"  // baseline moves to the
                                                // promoted candidate
  },
  "promotion_event_id": null,           // populated after append
  "state": "PENDING"                    // PENDING | APPLIED | REJECTED
}
```

**Backend adapter:**
`openclaw_core.services.research_lab.nomination_adapter` takes a
`nomination.v1`, resolves identity, materializes the bank record,
appends the promotion event to the shared log, and updates the existing
strategy bank file. The adapter is the ONLY place the research lab
mutates strategy-bank state. No other code path in the research lab
writes to the bank.

**CLI entry point:**
```
python -m openclaw_core.cli.research_lab promote-candidate \
  --candidate-id <id> --actor <actor> [--dry-run]
```

**Dashboard flow:**
1. User clicks Promote on the candidate scorecard.
2. Dashboard submits a nomination request (governed request file in the
   dashboard repo — same channel as campaign requests).
3. Worker picks up the request, runs the nomination adapter, writes the
   resulting `nomination.v1` artifact with `state: APPLIED` and the
   populated `promotion_event_id`.
4. Dashboard reads the final artifact + the updated strategy-bank state
   on next poll.

**Why this matters:** without this named adapter, the Promote button
either forks promotion logic (bad) or reaches into strategy-bank
internals (also bad). The adapter is the translation layer; the
strategy bank's existing contracts stay untouched.

### 2.7 Morning report summary — `morning_report.v1`

Generated by the nightly autopilot (Phase 3 templated, Phase 4 AI-narrated).
Dashboard renders as a card; Telegram delivers a condensed version.

```jsonc
{
  "schema_version": "research_lab.morning_report.v1",
  "report_id": "report_2026-04-24",
  "user_id": "jacob",
  "account_id": "paper_main",
  "strategy_group_id": "default",
  "generated_at": "2026-04-24T06:00:00-04:00",
  "window": { "from": "2026-04-23T20:00:00-04:00", "to": "2026-04-24T06:00:00-04:00" },
  "jobs_run": 3,
  "by_sleeve": {
    "stocks":  { "jobs": 2, "candidates": 1, "promotions_proposed": 1 },
    "crypto":  { "jobs": 1, "candidates": 0, "promotions_proposed": 0 },
    "options": { "jobs": 0, "candidates": 0, "promotions_proposed": 0 }
  },
  "promotions_proposed": [ { candidate_id, idea_title, sleeve, headline_metric } ],
  "strong_not_promoted": [ { ... , blocker_gate } ],
  "interesting_findings": [ { kind, detail, evidence_link } ],
  "postmortems": [ { job_id, reason, remediation_hint } ],
  "narrative": {                      // AI-filled in Phase 4; templated prose earlier
    "opener": "3 campaigns ran overnight...",
    "per_sleeve": { "stocks": "...", "crypto": "...", "options": "..." }
  }
}
```

### 2.8 Preset library — `preset.v1`

Static (git-tracked) catalog of "what the UI can submit." Lives in
trading-bot at `data/research_lab/presets/*.yaml`. Dashboard reads via a
mirrored index.

```yaml
schema_version: "research_lab.preset.v1"
preset_id: "stocks.momentum.stop_target.v1"
display_name: "Stocks · Momentum · Stop/Target sweep"
sleeve: "STOCKS"
strategy_family: "regime_aware_momentum"
description: "SPY-gated large-cap momentum, sweep stop and target."
param_schema:
  stop_pct:   { type: "enum_decimal", options: [0.03, 0.05, 0.07, 0.10] }
  target_pct: { type: "enum_decimal", options: [0.10, 0.15, 0.20, 0.30] }
  universe:   { type: "named_universe", default: "large_cap_6" }
bounds:
  max_sweep_size: 16
  max_era_windows: 6
  max_wallclock_minutes: 30
```

Phase 1 ships three presets — one per sleeve (1a delivers stocks; 1b
adds crypto + options). Adding a preset = adding a YAML file + one
entry in the mirrored index. No UI code change.

### 2.9 Ingress + state channels

The dashboard (Vercel) and the worker (trading-bot host, today WSL,
tomorrow possibly a cloud box) cannot trust each other's filesystem.
Two explicit channels, each with a narrow purpose:

#### 2.9.1 Submit channel — governed request files

**Purpose:** how the dashboard asks the worker to do something (submit
campaign, submit nomination — cancel deferred to Phase 1c).

**Mechanics:**
- Dashboard `POST /api/research/requests` (and `/nominations`) writes a
  request file to the dashboard repo under
  `data/research_lab/<user>/<account>/<group>/requests/inbox/`.
  `/cancels` is explicitly not shipped in Phase 1a/1b (see §2.4 state
  machine — cancel lands in Phase 1c).
- Dashboard generates `job_id` (ULID) at submit time, writes it into
  the request file, and returns `{commit_sha, request_id, job_id}` to
  the caller.
- Dashboard commits the file via the GitHub App token already used by
  the push scripts.
- Worker runs a git-fetch poll every ~15s on the dashboard repo, picks
  up new request files, validates, and enqueues into SQLite using the
  preallocated `job_id` as the row primary key. Enqueue is idempotent
  on `(request_id, job_id)` — a duplicate file (git reprocessing,
  worker restart mid-move) does not create a second row.
- After successful enqueue, the worker moves the request file to
  `requests/processed/` via a worker-side commit.

**Why files-in-git:** auditability is free. Every request is timestamped,
attributed, and reviewable in git log. Matches the existing
`/api/passport/workflow` governed-request fallback pattern, so no new
infra for Phase 1a.

**Submit latency:** ~15-30s from click to enqueue. Acceptable — this is
a research tool, not a trading gateway. The user sees a "submitted,
waiting to enqueue" state in the UI via the live-read channel.

#### 2.9.2 Live-read channel — managed state store

**Purpose:** how the dashboard renders live job status, progress,
heartbeats, and the current snapshot of the SQLite queue.

**Mechanics:**
- Worker publishes state snapshots to a managed key-value store on
  every state transition and every 30s heartbeat.
- Key format: `research_lab:<user>:<account>:<group>:job:<job_id>`
  (value = latest `job.v1` JSON) and
  `research_lab:<user>:<account>:<group>:queue` (value = compact queue
  index).
- Dashboard `GET /api/research/jobs/:id` reads from the store (server-
  side, with the store's read token); the app then polls that endpoint.

**Store choice:** Upstash Redis (free tier, generous read limits) or
Vercel KV. Jacob's call. Default assumption: **Upstash Redis** — the
free tier covers single-user volume by a wide margin. Cost scales
gracefully to multi-tenant.

**Why not git:** heartbeats and progress updates shouldn't create
commits. A one-user research session generates 100+ state transitions
per night; as a commit stream that's both noisy and slow. The store is
the right substrate for hot state.

**Fallback if store unreachable:** the worker continues writing to
SQLite (authoritative). Jobs keep running; cold artifacts continue to
flow through the outbox on terminal states, so historical views stay
correct. The dashboard's live-progress surface degrades honestly — no
"last seen at" pretense (we don't persist a durable last-live snapshot
anywhere the dashboard can reach without the store).

UI copy on outage: "Live progress unavailable — the job is still
running; results will appear on completion. Refresh once live state
recovers." On store recovery, the publisher's next transition/heartbeat
write repopulates the store and live progress resumes seamlessly.

#### 2.9.3 Cold mirror — final artifacts only

**Purpose:** long-term record of completed research. Historical views
in the dashboard.

**Mechanics:**
- On terminal state, the outbox writer commits the final
  `job.v1.final.json`, `result.v1.json`, `candidate.v1.json`, and any
  other terminal artifacts to the trading-bot repo under the scope path.
- `scripts/pull-research-lab.py` (dashboard side) mirrors the subset
  the app needs into the dashboard repo on a separate cron.
- Dashboard historical views (`/api/research/results/:id`,
  `/api/research/reports/morning/:date`) read from the dashboard-side
  mirror — the same pattern `data/bench/` already uses.

**Latency:** minutes, not seconds. That's fine — historical views don't
need sub-second freshness.

#### 2.9.4 Channel summary

| Purpose | Channel | Freshness | Substrate | Who writes | Who reads |
|---|---|---|---|---|---|
| Submit campaign / nomination (cancel deferred to 1c) | Governed request file | 15-30s to enqueue | Git (dashboard repo) | Dashboard API route | Worker (git-fetch poll) |
| Live job status / heartbeat / progress | Managed state store | 15-30s | Upstash Redis (default) | Worker | Dashboard API route |
| Historical artifacts (results, reports) | Cold mirror | Minutes | Git (both repos) | Outbox writer | Dashboard API route |

---

## 3. Filesystem layout

### Trading bot (authoritative)

Split into two trees by lifecycle: **cold** (git-tracked, authored +
terminal artifacts) and **hot** (runtime, gitignored, mutable).

**Cold tree — git-tracked:**
```
~/.openclaw/workspace/trading-bot/
  data/research_lab/
    presets/                          # authored YAML (scope-independent)
      stocks.momentum.stop_target.v1.yaml   # Phase 1a
      crypto.tsmom_4h.v1.yaml               # Phase 1b
      options.covered_call.v1.yaml          # Phase 1b
      _index.json                     # generated, git-tracked
    <user_id>/<account_id>/<strategy_group_id>/
      ideas/                          # authored YAML
        idea_01HXXX.yaml
      bundles/                        # compiler output, written once
        bundle_01HXXX.json
      jobs/                           # TERMINAL snapshots only — never
        job_01HXXX.final.json         # intermediate. Written by outbox
                                      # writer after DB commit of
                                      # DONE/FAILED/CANCELLED.
      results/                        # terminal
        result_01HXXX.json
        result_01HXXX.raw/            # bench runner artifacts (leaderboard
                                      # files, validation reports, plateau
                                      # grids)
      candidates/                     # terminal
        candidate_01HXXX.json
      nominations/                    # terminal (one per Promote action)
        nomination_01HXXX.json
      reports/morning/
        2026-04-24.json
      audit_log.jsonl                 # rollup — written periodically by
                                      # outbox writer, NOT append-per-event

    # Phase 1 default path resolves to:
    # data/research_lab/jacob/paper_main/default/...
  src/openclaw_core/research_lab/
    __init__.py
    compiler.py                       # idea + preset + sweep → bundle
    executor.py                       # Executor interface + LocalExecutor
    job_queue.py                      # SQLite wrapper
    state_publisher.py                # writes hot snapshots to managed store
    outbox_writer.py                  # derives cold artifacts from DB
    summarizer.py                     # bench results → result.v1
    candidate_adapter.py              # result → promotion_readiness
    nomination_adapter.py             # candidate → strategy-bank record
    morning_report.py                 # templated (P3) / AI-narrated (P4)
  bin/
    research_lab_worker.py            # long-running worker (Phase 1)
    research_lab_nightly.py           # cron entrypoint (Phase 3)
  tests/openclaw_core/research_lab/
    ...
  .gitignore                          # asserts state/research_lab/ stays out
```

**Hot tree — runtime, gitignored:**
```
~/.openclaw/workspace/trading-bot/
  state/research_lab/                 # ENTIRE tree gitignored
    <user_id>/<account_id>/<strategy_group_id>/
      jobs.db                         # SQLite — authoritative queue +
                                      # in-flight job state
      jobs/                           # per-job live snapshots (hot mirror
        job_01HXXX.current.json       # of DB; rewritten on every
                                      # transition; published to store)
      logs/
        worker.log
```

Rationale: the cold tree is history; the hot tree is the running system.
Git commits during `RUNNING` are forbidden by construction — the hot
tree is gitignored at the repo root. The outbox writer (§6.8) is the
only path from hot to cold, and it runs on terminal-state triggers +
periodic audit-log rollups.

### Dashboard (mirror + control plane)

```
~/claude/claw-dashboard/
  data/research_lab/
    <user_id>/<account_id>/<strategy_group_id>/
      index.json                      # summarized, app-optimized index
      # Mirrors of what the app needs to render:
      ideas.json                      # flattened list
      jobs/                           # one JSON per job (mirror)
      results/
      candidates/
      reports/morning/
    presets/
      _index.json

    # Dashboard Phase 1 default: data/research_lab/jacob/paper_main/default/...
  app/
    api/research/
      route.ts                        # GET index, health
      ideas/route.ts                  # GET list, POST submit (request file)
      requests/route.ts               # POST submit campaign request
      jobs/[id]/route.ts              # GET detail (polled)
      results/[id]/route.ts
      candidates/[id]/route.ts
      candidates/[id]/promote/route.ts   # POST — triggers existing promotion
      reports/morning/[date]/route.ts
    vires/lab/                        # new route
      page.tsx
      ideas/page.tsx
      ideas/[id]/page.tsx
      new-campaign/[idea]/page.tsx    # preset + sweep UI → Submit
      jobs/[id]/page.tsx              # live status
      reports/page.tsx
  components/vires/
    lab/
      lab-home.tsx
      idea-card.tsx
      campaign-submit-form.tsx
      job-status-card.tsx
      result-leaderboard.tsx
      candidate-scorecard.tsx         # reuses existing readiness-scorecard
      morning-report-card.tsx
  lib/research-lab-contracts.ts       # generated from Python source
```

**Push/mirror pattern** (Phase 1):

- Trading-bot worker writes authoritative artifacts under
  `data/research_lab/<user_id>/<account_id>/<strategy_group_id>/` and
  commits them.
- A `scripts/pull-research-lab.py` script (dashboard side, analogous to
  `pull-bench-data.py`) copies the subset the app needs into the
  dashboard repo. Runs on the worker's push path so mirror lag is
  seconds, not minutes.
- `index.json` is the summarized, app-optimized shape the dashboard
  reads first — same pattern as `operator-feed.json`.

---

## 4. Phased build order

Phases are sequenced for *logical dependency*, not calendar time. No hard
blockers between phases; work on the next phase can start as soon as the
previous one has an agreed contract.

### Phase 0 — contracts + registry audit (Codex, ~1 session)

- Write all schemas in §2 into `docs/architecture-rebuild/33-research-lab-contracts.md`.
- Audit the existing strategy registry — enumerate what's registered per
  sleeve, which have promotion adapters wired, which are code-complete-
  unwired, which don't exist.
- Commit the Phase 1a stocks preset only.
- Ship the generated TypeScript contracts file.
- Wire the `state/research_lab/` path into `.gitignore` so the hot tree
  cannot accidentally be committed.
- Choose and provision the managed state store (default: Upstash Redis
  free tier). Capture the read/write tokens in the dashboard's Vercel
  env + the worker's local env.

### Phase 1a — stocks-only E2E proof (Codex + Claude, ~2 sessions)

The beachhead. Proves submit → compile → run → result → promote works
end-to-end with one sleeve and one preset. No crypto, no options, no
autopilot. Phase 1b is the immediate follow-on, not a deferred backlog
item.

**Codex:**
- `research_lab.compiler` — validates + produces `bench_bundle.v1`.
- `research_lab.executor.LocalExecutor` — runs a bundle on the existing
  bench runner, emits artifacts.
- `research_lab.job_queue` — SQLite wrapper (hot tree).
- `research_lab.state_publisher` — writes `job.v1` snapshots to the
  managed state store on transitions + heartbeats.
- `research_lab.outbox_writer` — derives cold artifacts from DB after
  terminal state; idempotent, resumable (see §6.8).
- `research_lab_worker.py` — long-running: git-fetches dashboard repo
  for new request files (submit channel), processes the SQLite queue,
  runs jobs, publishes live state, writes terminal cold artifacts.
- `research_lab.summarizer` + `candidate_adapter` — bench output →
  `result.v1` + `candidate.v1`.
- `research_lab.nomination_adapter` — `candidate.v1` → strategy-bank
  record + promotion event (per §2.6a).
- CLIs: `promote-candidate`, `submit-campaign` (for local testing).
- `scripts/pull-research-lab.py` — cold-mirror path into dashboard repo.

**Claude:**
- `/vires/lab` route + home.
- Idea card (manual YAML idea committed in advance — one seeded stocks
  idea is enough for 1a).
- Campaign-submit form — preset dropdown (stocks only in 1a) + param-
  sweep UI (bounded by preset schema) + thesis/notes + Submit.
- `/api/research/requests` route — generates a ULID for `job_id`,
  writes a governed request file to the dashboard repo (with the
  preallocated `job_id` embedded), commits, returns
  `{commit_sha, request_id, job_id}` to the caller. Dashboard
  immediately begins polling live state by `job_id`.
- Job-status card — polls `/api/research/jobs/:id` (managed-store read)
  and renders state machine with progress.
- Result leaderboard + candidate scorecard (reuses existing readiness
  scorecard component).
- Promote button — submits a nomination request through the governed
  request channel. No direct strategy-bank access.

**Acceptance (1a):** Click Submit on the seeded stocks idea → request
file is committed to dashboard repo → worker picks it up within ~30s →
job transitions QUEUED → COMPILING → RUNNING (with live progress in the
UI from the managed store) → POST_PROCESSING → DONE → result renders
with real metrics → candidate scorecard shows real gates → Promote
submits a nomination → worker runs nomination adapter → strategy-bank
gets a new record → promotion event appended to shared log → UI reflects
the promoted candidate.

### Phase 1b — crypto + options presets + empty-state readiness (~1 session)

Same worker, same contracts. No new engine code.

**Codex:**
- Commit `crypto.tsmom_4h.v1.yaml` and `options.covered_call.v1.yaml`
  preset files.
- Extend the preset index.
- Confirm the candidate adapter emits `adapter_status: WIRED |
  CODE_COMPLETE_UNWIRED | NOT_IMPLEMENTED` correctly per sleeve.

**Claude:**
- Preset dropdown now shows all three sleeves.
- Candidate scorecard renders the honest `EMPTY_STATE` when
  `adapter_status != WIRED`, with copy that names the gap (e.g., "Crypto
  readiness adapter is code-complete but not yet wired into the producer
  path — promotion requires manual review for this sleeve").
- Small "adapter status" chip on each result card indicating which
  sleeves can auto-promote vs. require manual review.

**Acceptance (1b):** Submit a crypto idea → runs cleanly → result
renders → candidate scorecard shows honest empty-state with named gap
→ Promote button disabled with explanatory tooltip. Same for options.

**This surface (1a + 1b) is permanent.** The "Run now" flow is the
primary user path to the research lab, full stop. Phase 3's autopilot
adds a second *submitter* into the same queue; it does not replace the
on-demand surface. On-demand runs continue to work during market hours,
off hours, mid-session — whenever the user wants them.

### Phase 1c — cancel (first follow-up after happy path, ~1 session)

Deferred from 1a/1b to keep the beachhead brutally tight. Lands once
submit/run/observe/summarize/nominate/promote is proven in production.

**Codex:**
- New `cancel_request.v1` contract (small — `request_id`, `job_id`,
  `actor`, `reason`).
- `/api/research/cancels` submit channel route (same governed-request
  pattern).
- `LocalExecutor.cancel(job_id)` — SIGTERM the running bench
  subprocess; worker catches, transitions the job to `CANCELLED`,
  writes a terminal snapshot via the outbox.
- Partial-artifact handling: any `result_<id>.raw/` dir from an
  interrupted run is preserved but marked incomplete — no `result.v1`
  summary emitted.
- Cancel interacts with retry by disabling it: a `CANCELLED` job is
  never eligible for auto-retry regardless of how it was terminated.

**Claude:**
- Cancel button on the job-status card; disabled on terminal states.
- Honest "cancelled at <ts> by <actor>" copy on the terminal view.

**Acceptance (1c):** Click Cancel on a RUNNING job → request file
commits → worker receives → SIGTERM fires → job transitions to
CANCELLED within the heartbeat window → UI reflects the terminal state
→ no stray artifacts in the cold tree.

### Phase 2 — idea bank (Codex + Claude, ~1-2 sessions)

**Codex:**
- `research_lab.idea_bank` module — list/get/mark-READY/SHELVE.
- Conversation-capture entry point — a CLI
  `openclaw_core.cli.idea_capture save-idea --from-file <yaml>` that
  Claude calls when Jacob explicitly says "save this idea."
- Status transitions via CLI.

**Claude:**
- Idea bank list view on `/vires/lab/ideas` with filter by sleeve, tag,
  status.
- "Save this idea" conversation cue handling — drop the YAML file,
  invoke the CLI, confirm the resulting `idea_id` back to Jacob.
- Launch-from-idea link on each idea card → campaign-submit form.

### Phase 3 — deterministic nightly autopilot (Codex + OpenClaw, ~1-2 sessions)

Autopilot is **additive**. It shares the queue, worker, executor, and
contracts with the on-demand path from Phase 1. Nothing about Phase 3
deprecates or modifies the on-demand flow. The worker cannot tell the
difference between an autopilot-submitted and a user-submitted job —
only `submitted_by` metadata distinguishes them for filtering.

**Codex:**
- `research_lab_nightly.py` — cron entrypoint that submits campaign
  requests with `submitted_by: AUTOPILOT_NIGHTLY`.
- Deterministic pick rule: take up to N `READY`-status ideas, oldest-
  first, that haven't been run in > K days and whose sleeve has a wired
  adapter. Autopilot never submits `priority: HIGH` — user-submitted
  on-demand jobs always outrank nightly ones when the queue has both.
- Generate `morning_report.v1` — templated prose, no AI yet.

**OpenClaw:**
- Cron schedule at 02:00 ET (matches YouTube story agent precedent).
- Telegram delivery of the condensed morning report.

**Claude:**
- Morning-report card on `/vires/lab` home.
- Report archive under `/vires/lab/reports`.
- A persistent "Run now" surface on every idea card — visible and
  usable in daytime, not gated to any window. Same form as Phase 1;
  distinction between autopilot and on-demand runs is surfaced in the
  job list via a small origin chip ("you" vs "autopilot").

### Phase 4 — AI triage + narration (Codex, ~2 sessions)

Layer AI on top of the existing deterministic shell. AI is additive —
removing it would leave a working system. It never sees gate results
until after they're computed.

- Idea triage: LLM proposes top N candidates from the bank. Deterministic
  fallback picks if LLM is unavailable or disagrees with itself.
- Param-space proposal: LLM proposes a grid within the preset's bounds.
  Bounds are non-negotiable — the LLM cannot exceed them.
- Plateau/lucky-peak narration: LLM describes the verdict the summarizer
  already computed. It narrates, it does not decide.
- Morning-report prose: LLM writes the narrative sections; the numeric
  summary is deterministic.
- **Evidence-quality gate:** before AI prose is rendered, the summarizer
  rates the evidence (strong / mixed / thin). Thin evidence shows the
  honest empty state, not polished prose.

---

## 5. Phase 1a beachhead — "smallest strong first slice"

This section is now aligned with the Phase 1a/1b split in §4. The Phase
1a slice is the beachhead: the minimum to prove the loop E2E before
widening to the other sleeves.

1. **One seeded stocks idea** committed manually as YAML.
2. **One preset** (`stocks.momentum.stop_target.v1`) with a 3×3 sweep
   bound.
3. **Compiler** validates idea + preset + sweep → bundle.
4. **LocalExecutor** runs the bundle via the existing bench runner.
5. **State publisher** writes live `job.v1` snapshots to the managed
   store on every transition + heartbeat.
6. **Outbox writer** commits terminal artifacts to the cold tree after
   DB commit of `DONE`.
7. **Result + candidate + (on Promote) nomination** emitted.
8. **Dashboard submit form, job status card (reads from store), result
   leaderboard, candidate scorecard, Promote button (submits nomination
   through governed request channel).**

Rationale for stocks-first: the stocks promotion adapter is the only
one currently wired in the producer path. Crypto is code-complete-
unwired; options doesn't exist. Stocks-first lets the Promote path
actually exercise the nomination adapter with real gate data — we won't
know the end-to-end loop works until at least one sleeve can actually
promote.

Phase 1b (crypto + options preset YAMLs + honest empty-state readiness
scorecards + adapter-status chips) ships **immediately after** 1a
passes. It's not a deferred backlog item — it's the second half of
Phase 1, adding zero new engine code.

---

## 6. Risks / anti-patterns (push-back)

### 6.1 Compiler drifting into a "smart" engine

The compiler's job is validation + translation. The moment it starts
"helpfully" adjusting params, adding universe members, or synthesizing
strategies, it's become a second source of truth. Keep it dumb. If the
idea + preset + sweep don't validate, fail the compile and return an
explicit error — don't massage.

### 6.2 Idea bank devolving into a dumping ground

Every conversation where we spitball a strategy turns into an idea, and
the bank becomes noise. Mitigation: `status: DRAFT | READY | ...`. Only
`READY` ideas are eligible for nightly autopilot. The conversation-capture
default is `DRAFT` — promotion to `READY` is an explicit action.

### 6.3 Job queue concurrency → double-runs

Multiple workers + a non-atomic pick = same job run twice. Mitigation:
SQLite `BEGIN IMMEDIATE` on pick, state transition to `COMPILING` before
release. Single-worker in Phase 1 keeps the blast radius small; multi-
worker introduces only if needed.

### 6.4 Scope fields ignored in practice

We bake `user_id` + `account_id` + `strategy_group_id` into paths and
contracts, but a lazy write uses the default constants and it silently
works for one user forever. When we multi-tenant later, half the code
assumes singleton. Mitigation: one integration test from day 1 that
runs two distinct scopes (e.g., `jacob/paper_main/default` and
`jacob/paper_main/test_group`) and verifies isolation — no leakage of
ideas/jobs/artifacts across them. No PII or real auth required.

### 6.5 Options/crypto empty-state becoming permanent

If the Phase 1 ship includes all three presets but only stocks shows real
readiness, the crypto/options empty-states can become load-bearing — we
quietly never wire the adapters. Mitigation: a visible "adapter status:
WIRED / CODE_COMPLETE_UNWIRED / NOT_IMPLEMENTED" chip on every candidate
card, and a queue item to close the unwired state for each sleeve.

### 6.6 AI prose hiding weak evidence

Phase 4 risk. Mitigation baked into §4: evidence-quality gate in the
summarizer runs BEFORE AI narration. Thin evidence = honest empty state,
no prose. AI is never allowed to manufacture confidence that wasn't there
in the numbers.

### 6.7 Dashboard inventing fields

Oldest hazard. Mitigation: the existing CLAUDE.md rule ("dashboard is a
thin operator surface, not a second source of truth") extends cleanly to
research-lab artifacts. Code review guards: any new frontend type must be
imported from `lib/research-lab-contracts.ts`, which is generated. No
frontend-only types for backend concepts.

### 6.8 Request file ↔ job queue ↔ audit log divergence

**Rev 2 fix (Codex P1.3).** The earlier draft claimed a single atomic
action covered "request file write + SQLite enqueue." That claim is
not achievable — SQLite can atomically own the queue; `fsync`+rename
can atomically own a file write; nothing atomically covers both. The
corrected model:

**SQLite is authoritative for every state the research lab cares about:**
the queue, in-flight job state, heartbeats, retry counters. Every other
persistent surface (request file in dashboard repo, cold artifact in
trading-bot repo, audit log rollup) is an **outbox-derived projection**
of DB state, written by an idempotent writer that runs after each DB
transaction commits.

**Submit-side divergence mitigation:**
- Dashboard writes request file to dashboard repo → commits → returns
  commit SHA to the caller. The file is an input, not a state snapshot.
- Worker's git-fetch poll sees the new request file, reads it, runs an
  enqueue transaction in SQLite. If SQLite commits, the worker moves
  the request file to `requests/processed/` (or marks it processed via
  a marker file — pick one).
- If the worker crashes between SQLite commit and the processed-marker
  move: on restart, the worker sees the request file is present AND a
  matching row exists in the DB → it resumes by moving the file (no
  duplicate enqueue). This is idempotent because enqueue uses the
  request_id as a UNIQUE key; a re-enqueue attempt no-ops.
- If the worker crashes between receiving the file and the SQLite
  commit: the request file is still in the inbox; on restart, the
  worker re-processes it from scratch. No partial state.

**Cold-artifact-side divergence mitigation (outbox pattern):**
- On every DB state transition to a terminal state (`DONE`, `FAILED`,
  `CANCELLED`), the transaction inserts a row into an `outbox` table in
  the same SQLite DB. Same transaction = atomic with the state
  transition.
- A separate outbox-writer task reads unprocessed outbox rows, writes
  the corresponding cold artifact (e.g., `job_<id>.final.json`,
  `result_<id>.json`), commits the git tree, and marks the outbox row
  `done` — all idempotent.
- Crash recovery: on restart the writer processes any `pending` outbox
  rows, re-derives the cold artifact from current DB state, and writes
  it. Re-writing an already-present file with the same content is a
  no-op via `rename` semantics.

**Live-state-side divergence (managed store):**
- The state publisher is fire-and-forget best-effort. A store-write
  failure logs a warning but does NOT fail the DB transaction. Dashboard
  just sees stale live data; historical views remain correct because
  they read cold artifacts via the mirror, not the store.

**What this buys us:** SQLite is the single source of truth. Every other
surface is a derived projection, writable idempotently. No two-phase
commit claim; no partial-state corruption on crash.

### 6.9 Hot tree accidentally committed to git

If `state/research_lab/` isn't in `.gitignore` from day 0, a `git add .`
will sweep `jobs.db` and every live job snapshot into a commit. Repos
get bloated fast; per-transition git writes during `RUNNING` defeat the
entire hot/cold split. Mitigation: Phase 0 commits a `.gitignore` entry
for `state/research_lab/` alongside the contracts doc. Also add a
pre-commit check (extend the existing dashboard mojibake pre-commit, or
add a simple `git-check-attr` rule trading-bot side) that refuses to
commit anything under `state/`.

---

## 7. What I'd specifically push back on in the primer

### 7.1 "Bounded templates / presets, not freeform manifest authoring"

Agree, but the spec should make "template" precise: a **registered
strategy family + a bounded param schema**. Not a UI-layer shortcut,
not a user-authored thing. Added to §2.8 explicitly.

### 7.2 Executor abstraction

Primer says "beyond one local machine." I'd push to the *cheap* form of
that: define `Executor` interface (run_bundle, cancel, heartbeat); ship
`LocalExecutor` only; remote/distributed drops in later with no contract
change. Don't build remote now. Captured in §3.

### 7.3 Idea capture heuristics

Primer doesn't specify capture mechanism. Explicitly baked into this
spec: conversation-cued capture requires a **literal cue** ("save this
idea"), not heuristic inference from context. Heuristic capture would
fill the bank with half-ideas and make the dumping-ground risk worse.

### 7.4 Morning report "bad things happened with things that ran poorly"

Jacob's original phrasing. The spec formalizes this as `postmortems` with
a `remediation_hint` field. The hint is deterministic or AI-assisted
depending on phase, but there's always a field for it so failed jobs
don't just disappear.

### 7.5 Workspace scoping now vs later

Primer said "multi-tenant-ready." Jacob confirmed thick scoping from day
0 (filesystem + contract). §3 reflects this. Cheap to do now, expensive
to retrofit.

---

## 8. Open questions

**Resolved (Jacob, 2026-04-23)** — moved into Locked Decisions at the top:

- ~~Workspace granularity~~ → three-level scope (`user_id` + `account_id`
  + `strategy_group_id`).
- ~~Job retry policy~~ → auto-retry once on specific transient codes.
- ~~Promotion events log~~ → same shared log with `origin` field.

**Still open (lower-stakes, defaults proposed):**

1. **Artifact retention.** Results and bundles are git-tracked, so
   forever by default. Do we keep them forever, or rotate to cold storage
   after N days? **Default: keep forever** (research reproducibility).
   Revisit only if the repo gets unwieldy.

2. **Cross-sleeve ideas.** An idea could eventually combine sleeves (e.g.,
   "stocks rotation + crypto tactical overlay"). Spec today assumes one
   sleeve per idea. Explicitly out of scope for Phase 1-4; revisit when
   it actually comes up.

3. **Telegram delivery scope for morning report.** Condensed (counts +
   headline candidate) or full-prose? **Default: condensed with a
   dashboard deep-link.** Full prose is noisy on phone.

---

## 9. Ownership summary

| Thing | Owner |
|---|---|
| Contract schemas (§2) | Codex |
| Strategy registry | Codex (existing) |
| Compiler | Codex |
| Executor interface + LocalExecutor | Codex |
| Job queue (SQLite) | Codex |
| Research lab worker + nightly | Codex |
| Summarizer + candidate adapter | Codex |
| Morning-report templating (P3) / AI narration (P4) | Codex |
| Mirror script | Codex |
| Dashboard `/vires/lab` UI + components | Claude |
| `/api/research/*` routes | Claude |
| Generated contracts TS file | Codex emits Python source; Claude imports |
| Cron scheduling + Telegram delivery | OpenClaw |
| Conversation-capture CLI call | Claude invokes, Codex CLI |

---

## 10. Next actions

If this spec review is accepted as the direction:

1. **Codex:** draft `docs/architecture-rebuild/33-research-lab-contracts.md`
   with the full field definitions in §2 and the SQLite DDL (including
   the `outbox` table).
2. **Codex:** registry audit — output a short markdown listing per-sleeve
   strategy families and their promotion-adapter status.
3. **Codex:** commit the Phase 1a stocks preset.
4. **Codex:** wire `state/research_lab/` into `.gitignore` and provision
   the managed state store (Upstash Redis default).
5. **Claude:** once contracts land, scaffold `/vires/lab` shell route
   and the generated TS import so Phase 1a UI work can proceed in
   parallel with Codex's worker implementation.

Phase 1a end-to-end should be achievable in ~2 focused sessions across
Codex + Claude once Phase 0 contracts are locked. Phase 1b follows
immediately (~1 session). Phase 1c (cancel) lands as the first
post-happy-path slice.

---

## 11. Phase 1a acceptance tests (required)

Six tests that MUST pass before Phase 1a is called done. These prove
the infrastructure is actually crash-safe, not just green on the happy
path. Codex's five original asks plus one on idempotent enqueue.

### 11.1 request_id / job_id correlation

- Submit a campaign request via the dashboard API.
- Verify the returned `{commit_sha, request_id, job_id}` matches what
  ends up in the DB row and in every downstream artifact
  (`bundle.v1.request_id`, `job.v1.request_id`, `result.v1.job_id`,
  `candidate.v1.result_id → result.v1.job_id → job.v1.request_id`).
- Verify the dashboard can poll live state from the store using the
  returned `job_id` before the worker has actually picked up the
  request (expected: "queued / not yet enqueued" state from the
  publisher's initial write, or empty with a honest "not yet
  materialized" tombstone).

### 11.2 Outbox crash recovery

- Start a job, let it reach `POST_PROCESSING`.
- Kill the worker mid-transition (between DB commit of terminal state
  and outbox writer completing the cold artifacts).
- Restart the worker.
- Verify: outbox rows are re-processed, `result.v1.json`,
  `candidate.v1.json`, and `job.v1.final.json` all land in the cold
  tree exactly once, no duplicate git commits, SQLite state matches
  on-disk artifacts.

### 11.3 Managed-store outage behavior

- Block the worker's Redis/KV endpoint (e.g., firewall rule).
- Submit a job, let it run to completion.
- Verify: job runs to `DONE` in SQLite, cold artifacts land in the cold
  tree via the outbox, and dashboard historical views render correctly.
- Verify: dashboard's live-status surface renders the honest "live
  progress unavailable" state without errors.
- Unblock the store; submit a second job; verify live progress resumes.

### 11.4 Two-scope isolation

- Create a second scope alongside the default: `jacob/paper_main/
  test_group`.
- Submit a job into each scope.
- Verify: ideas, jobs, results, candidates, cold artifacts, and store
  keys are all scoped — nothing from `default` appears in `test_group`
  listings or vice versa.
- Verify: both scopes can run concurrently without interference.

### 11.5 Nomination dry-run against real strategy-bank schema

- Run a stocks campaign to DONE with a winner candidate.
- Submit a nomination request with `--dry-run` equivalent (flag on the
  nomination artifact, or a read-only adapter mode).
- Verify: the materialized bank record matches the current strategy-
  bank schema exactly (no extra fields, no missing required fields).
- Verify: no actual write happens to the bank file or promotion log.

### 11.6 Duplicate request replay / idempotent enqueue

- Submit a campaign request.
- Simulate duplicate delivery: replay the same request file (e.g., via
  a force-push that re-introduces the file, or via worker restart that
  re-reads the inbox).
- Verify: a second row is NOT created in the jobs table
  (`(request_id, job_id)` UNIQUE key enforcement).
- Verify: the worker's second processing of the file is a no-op that
  leaves the file in `processed/` as before — no error, no duplicate
  cold artifacts, no duplicate store entries.

Running all six as part of the Phase 1a CI smoke is the bar.
