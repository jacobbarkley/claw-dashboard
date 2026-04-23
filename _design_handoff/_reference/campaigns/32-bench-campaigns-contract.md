# Bench Campaigns Contract

Status: DRAFT  
Date: 2026-04-20  
Owner: Codex  
Track: bench operator UX / research visibility

## Purpose

Give the Bench a first-class research layer above individual strategy passports.

Current surfaces are strong at answering:

- what one candidate did
- what is promoted
- what artifact belongs to which winner

They are weak at answering:

- what research programs are active right now
- what thesis each program is pursuing
- which candidate is currently leading inside that thesis
- what changed since yesterday

That missing layer is a **campaign**.

## Primary Job

The campaign surface is **live mission control**, not historical reporting.

The intended operator loop is:

- open chat with Claude / Codex / OpenClaw
- kick off remote bench testing
- open the app
- immediately see what is happening across all in-flight campaigns
- spot what to tweak next

That means the contract must optimize for:

- low-latency freshness
- multi-writer updates
- visible "what's the lever?" signals

## Core Framing

Use this split everywhere:

- **Production** tells us what deserves capital.
- **Bench** tells us what is competing to deserve capital.

Passports remain the evidence surface for one candidate.
Campaigns become the operating surface for a research program.

## Confirmed Disambiguations

### Campaign vs Strategy Family

In v1:

- **campaign = thesis**
- **strategy family = implementation approach**

Example:

- campaign: `ETF replacement momentum`
- families inside it:
  - `REGIME_AWARE_MOMENTUM`
  - `DYNAMIC_TECH_SCREEN`
  - future broader rotation families if we add them

This is intentional.

If we collapse campaign and family into one thing, we lose the ability to model:

- one thesis with multiple competing implementations
- one campaign where the leader shifts from one family to another

That multi-family competition is exactly what we want the Bench to make visible.

### Where Runs Fit

In v1:

- **runs belong to candidates**
- **campaigns aggregate candidate runs**

That means:

- one candidate can have many runs over time
- a campaign page can show:
  - latest run per candidate
  - recent runs across all candidates
  - leader changes driven by those runs

We do **not** need a separate primary "campaign run" object for v1.

If a broad sweep evaluated several candidates at once, that still resolves to:

- multiple candidate-level results
- one campaign-level change-log event summarizing what changed

## V1 Status Model

Do not over-engineer the enum yet.

V1 campaign statuses:

- `EXPLORING`
- `CONVERGING`
- `PROMOTED`

Optional later statuses:

- `PAUSED`
- `RETIRED`

Only add those once a real campaign actually needs them.

## Storage

### Canonical Paths

Checked-in campaign manifests live at:

- `/home/jacobbarkley/.openclaw/workspace/trading-bot/backtest/bench/campaigns/*.campaign_manifest.json`

Optional lightweight registry:

- `/home/jacobbarkley/.openclaw/workspace/trading-bot/backtest/bench/campaigns/campaign_registry.json`

This keeps campaign/operator memory close to the Bench, not hidden inside the
dashboard repo.

## Update Model

### Multi-writer

Any agent may update the same manifest:

- the user
- Claude
- Codex
- OpenClaw runtime automation

The UI should not care which writer moved the campaign forward.
It should care that the manifest shape is stable and fresh.

For auditability, the manifest should still expose:

- `updated_at`
- `updated_by`

And each change-log event should optionally carry:

- `actor`

### Low-latency updates

Campaign manifests should update on meaningful bench events:

- run finished
- leader changed
- candidate added
- promoted reference added

Prefer a write hook on run completion or promotion update over a nightly
aggregator.

The mental model should match operator-feed freshness:

- update within minutes when something meaningful changes
- do not wait for a next-day summary job

## Contract Shape

### Campaign Manifest

Each campaign manifest should carry:

- `schema_version`
- `campaign_id`
- `title`
- `sleeve`
- `objective`
- `benchmark_symbol`
- `status`
- `summary`
- `updated_at`
- `updated_by`
- `current_leader_candidate_id`
- `last_run_at`
- `last_meaningful_change_at`
- `last_meaningful_change`
- `promotion_target`
- `recency_signals`
- `family_groups`
- `candidates`
- `change_log`

### `recency_signals`

This block exists so the UI can show not just "what is true now" but also
"what is stale and worth poking."

Recommended v1 fields:

- `last_leader_change_at`
- `leader_stability_sessions`
- `runner_up_candidate_id`
- `runner_up_gap`
- `last_param_sweep_at`
- `days_since_param_sweep`

Recommended `runner_up_gap` shape:

- `metric`
- `value`
- `summary`

Example:

- metric: `SHARPE`
- value: `0.10`
- summary: `Runner-up is within 0.10 Sharpe of the leader`

### `family_groups`

Each family group is descriptive, not a separate runtime object:

- `family_id`
- `title`
- `summary`

This lets the UI say:

- what implementation styles are being tested in this thesis

without pretending families are the same thing as campaigns.

### `candidates`

Each candidate entry should carry:

- `candidate_id`
- `title`
- `family_id`
- `role`
- `artifact_kind`
- `artifact_refs`
- `latest_run`
- `notes`

#### `role`

V1 candidate roles:

- `LEADER`
- `CHALLENGER`
- `PROMOTED_REFERENCE`

These are intentionally lighter-weight than a second large status machine.

#### `artifact_kind`

Supported v1 kinds:

- `BENCH_CAMPAIGN_VARIANT`
- `BENCH_RESULT_BUNDLE`
- `EXECUTION_MANIFEST`

This gives the dashboard a stable branching point for how to deep-link the
candidate.

#### `artifact_refs`

Artifact refs are path-based and explicit. Use whatever subset applies:

- `campaign_config_path`
- `campaign_summary_path`
- `execution_manifest_path`
- `bench_result_bundle_path`
- `bench_report_path`

### `latest_run`

Each candidate keeps a normalized latest-run summary:

- `run_id`
- `completed_at`
- `summary`
- `result_summary_path`

This is intentionally compact.

The candidate passport remains the deeper evidence surface for metrics,
plateaus, eras, and assumptions.

### `change_log`

This is a **first-class v1 field**, not a follow-up.

Each event carries:

- `at`
- `kind`
- `title`
- `detail`
- `actor`
- `candidate_id`
- `from_candidate_id`
- `to_candidate_id`

Not every event needs every candidate reference.

Example kinds:

- `CANDIDATE_ADDED`
- `LEADER_CHANGED`
- `PROMOTION_REFERENCE_ADDED`
- `BENCHMARK_UPDATED`
- `CANDIDATE_RETIRED`

The point is not the enum.
The point is that the Bench stops being a static snapshot and becomes an
operator timeline.

## Dashboard Expectations

The dashboard should be able to render:

### Campaign Index

One card per campaign with:

- title
- sleeve
- status
- current leader
- last meaningful change
- last run time
- leader stability
- runner-up gap

### Campaign Detail

For one campaign:

- thesis summary
- current leader card
- candidate leaderboard
- recent runs
- change-log timeline
- lever signals:
  - leader stability
  - time since last leader change
  - time since last parameter sweep
  - runner-up gap

### Candidate Deep Link

Each candidate should deep-link into its existing evidence surface:

- passport
- run detail
- promoted manifest
- or benchmark report, depending on artifact kind

## V1 Scope Boundary

V1 should **not** backfill old campaign history just to populate the UI.

Start with checked-in manifests for the campaigns we actually care about now.

That means:

- honest current state
- operator-maintained change logs
- no invented timeline history

## Example Interpretation Note

`Forward-looking six fixed stock momentum` is **not automatically a top-level
campaign**.

If it is a narrower expression inside the broader `ETF replacement momentum`
thesis, it should first appear as:

- a family lane
- or a candidate cluster

Only promote it to a standalone campaign if we decide it represents a distinct
research mandate rather than just a tighter implementation.

That distinction is important.
Otherwise every strong candidate becomes a fake top-level research program.

## Recommended Build Order

1. Check in the campaign manifests and registry.
2. Render a campaign index page in the dashboard.
3. Render a campaign detail page using existing candidate evidence surfaces.
4. Add the recency / lever signals to keep the view operational.
5. Keep promoted passport era enrichment as a parallel track.

Campaigns and promoted era data are related, but one should not block the
other.
