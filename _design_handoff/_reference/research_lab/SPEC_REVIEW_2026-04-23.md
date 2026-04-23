# Research Lab — Spec Review (2026-04-23)

**Status:** Draft for Codex + Jacob review. Not implementation yet.
**Scope:** App-driven strategy research. From idea → bench campaign →
results → promotion candidate, with nightly autopilot and AI-assisted
reporting as later phases.
**Supersedes:** n/a (new surface).
**Locked decisions (Jacob, 2026-04-23):**

- Idea spec shape: shared header + per-sleeve typed body.
- Executor model: persistent job queue + git-backed audit log alongside.
- Phase 1 preset library: all three sleeves (stocks, crypto, options) on
  day one, with honest empty-state readiness for crypto/options until
  the backend adapters land.
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
  Dashboard (app)                      Trading bot (engine)
  ----------------                     --------------------
  /vires/lab  UI            ──POST──►  /api/research/*        ──write──►  request file (git)
                                                              ──enqueue─► jobs.db (SQLite)
                                                                            │
                                       research-lab worker ◄──poll────────┘
                                           │
                                           ├─ Compiler (idea → bench bundle)
                                           ├─ Executor.run(bundle)   (LocalExecutor in P1)
                                           ├─ Result summarizer
                                           └─ Promotion-readiness adapter
                                           │
                                           └──► artifacts (git) + SQLite state transitions
                                           │
                                           └──► audit_log.jsonl (append-only, git-tracked)

  Dashboard reads artifacts the same way it reads operator-feed.json:
  through a versioned contract. No ad hoc JSON. No direct state picking.
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

Source of truth lives in SQLite (`jobs.db`). A JSON mirror is emitted on
each state transition for git audit + dashboard consumption.

```jsonc
{
  "schema_version": "research_lab.job.v1",
  "job_id": "job_01HXXX...",
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

CANCELLED reachable from any non-terminal state (operator action).
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

Phase 1 ships three presets — one per sleeve. Adding a preset = adding a
YAML file + one entry in the mirrored index. No UI code change.

---

## 3. Filesystem layout

### Trading bot (authoritative)

```
~/.openclaw/workspace/trading-bot/
  data/research_lab/
    presets/                          # git-tracked YAML (scope-independent)
      stocks.momentum.stop_target.v1.yaml
      crypto.tsmom_4h.v1.yaml
      options.covered_call.v1.yaml
      _index.json                     # generated mirror
    <user_id>/<account_id>/<strategy_group_id>/
      ideas/                          # git-tracked YAML
        idea_01HXXX.yaml
      requests/                       # git-tracked JSON (audit)
        2026-04-23_req_01HXXX.json
      bundles/                        # git-tracked JSON (audit)
        bundle_01HXXX.json
      jobs.db                         # SQLite — source of truth
      jobs/                           # git-tracked JSON mirrors
        job_01HXXX.json               # snapshot per state transition
      results/                        # git-tracked JSON
        result_01HXXX.json
        result_01HXXX.raw/            # bench runner artifacts (leaderboard
                                      # files, validation reports, plateau
                                      # grids — existing shapes)
      candidates/                     # git-tracked JSON
        candidate_01HXXX.json
      reports/morning/
        2026-04-24.json
      audit_log.jsonl                 # append-only, git-tracked

    # Phase 1 default path resolves to:
    # data/research_lab/jacob/paper_main/default/...
  src/openclaw_core/research_lab/
    __init__.py
    compiler.py                       # idea + preset + sweep → bundle
    executor.py                       # Executor interface + LocalExecutor
    job_queue.py                      # SQLite wrapper
    summarizer.py                     # bench results → result.v1
    candidate_adapter.py              # result → promotion_readiness adapter
    morning_report.py                 # templated (P3) and AI-narrated (P4)
  bin/
    research_lab_worker.py            # long-running worker (Phase 1)
    research_lab_nightly.py           # cron entrypoint (Phase 3)
  tests/openclaw_core/research_lab/
    ...
```

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
- Commit the three Phase 1 presets.
- Ship the generated TypeScript contracts file.

### Phase 1 — manual submit loop end-to-end (Codex + Claude, ~2-3 sessions)

**Codex:**
- `research_lab.compiler` — validates + produces bundle.
- `research_lab.executor.LocalExecutor` — runs a bundle on the existing
  bench runner, emits artifacts.
- `research_lab.job_queue` — SQLite wrapper (schema below).
- `research_lab_worker.py` — polls queue, runs jobs, writes artifacts +
  state transitions + audit log.
- `research_lab.summarizer` + `candidate_adapter` — bench output →
  `result.v1` + `candidate.v1` via existing promotion readiness.
- `scripts/pull-research-lab.py` — mirror path.

**Claude:**
- `/vires/lab` route + home.
- Idea card (manual YAML ideas only in P1 — one seeded per sleeve).
- Campaign-submit form — preset dropdown + param sweep UI (bounded by
  preset schema) + thesis/notes + Submit.
- Job-status card — polls `/api/research/jobs/:id`, renders state
  machine with progress.
- Result leaderboard + candidate scorecard (reuses existing readiness
  scorecard component).
- Promote button — calls existing promotion workflow; no new logic.

**Acceptance:** Click Submit on a seeded stocks idea → job runs → result
renders with real metrics → candidate scorecard shows real gates → Promote
triggers the existing promotion flow. Then repeat for crypto (gate
scorecard empty-state honest) and options (scorecard empty-state honest).

**This surface is permanent.** The "Run now" flow Phase 1 ships is the
primary user path to the research lab, full stop. Phase 3's autopilot
adds a second *submitter* into the same queue; it does not replace the
on-demand surface. On-demand runs continue to work during market hours,
off hours, mid-session — whenever the user wants them.

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

## 5. Phase 1 "smallest strong first slice"

The minimum to prove the loop end-to-end, so everything else builds on
verified infrastructure:

1. **One seeded stocks idea** committed manually as YAML.
2. **One preset** (`stocks.momentum.stop_target.v1`) with a 3×3 sweep
   bound.
3. **Compiler** validates idea + preset + sweep → bundle.
4. **LocalExecutor** runs the bundle via the existing bench runner.
5. **Result + candidate** emitted.
6. **Dashboard submit form + job status card + result leaderboard.**
7. **Existing promotion flow** wired to the Promote button.

Before this slice, no crypto/options preset code is written. After this
slice passes a real end-to-end cycle, the crypto and options presets land
as fast-follows — same code path, just add YAML files + preset-schema
validation + wire the UI preset dropdown.

Rationale for stocks-first: the stocks promotion adapter is the only one
currently wired in the producer path. Crypto is code-complete-unwired;
options doesn't exist. Stocks-first lets the full loop (including the
Promote button) work with real gate data. Crypto/options follow with
honest empty-state readiness, which is fine — but we won't know if the
Promote-button code path works until one sleeve can actually promote.

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

### 6.8 Request file + job queue divergence

We chose job queue + audit log alongside. If the request file lands but
enqueue fails (or vice versa), the two surfaces disagree. Mitigation:
the dashboard's `POST /api/research/requests` is a single atomic action
on the trading-bot side — request file write + enqueue happen inside one
SQLite transaction (with the request-file write via `fsync` + rename).
Dashboard doesn't get a 200 until both have landed.

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
   with the full field definitions in §2 and the SQLite DDL.
2. **Codex:** registry audit — output a short markdown listing per-sleeve
   strategy families and their promotion-adapter status.
3. **Codex:** commit the three Phase 1 presets.
4. **Claude:** once contracts land, scaffold `/vires/lab` shell route
   and the generated TS import so Phase 1 UI work can proceed in parallel
   with Codex's worker implementation.

Phase 1 end-to-end should be achievable in 2-3 focused sessions across
Codex + Claude once Phase 0 contracts are locked.
