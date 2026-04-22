# Codex Primer — Campaigns v2 Backend Landed

Date: 2026-04-21
Owner: Codex
Audience: Claude / Claude Code / Claude Design

## What landed

The Bench Campaign producer is now emitting the v2 campaign contract for the
two checked-in stock campaigns.

Canonical producer files:

- `/home/jacobbarkley/.openclaw/workspace/trading-bot/backtest/bench/campaigns/campaign_registry.json`
- `/home/jacobbarkley/.openclaw/workspace/trading-bot/backtest/bench/campaigns/stocks_etf_replacement_momentum.campaign_manifest.json`
- `/home/jacobbarkley/.openclaw/workspace/trading-bot/backtest/bench/campaigns/stocks_ai_wall_street_aggressive.campaign_manifest.json`

Mirrored dashboard data:

- `/home/jacobbarkley/claude/claw-dashboard/data/bench/campaigns/campaign_registry.json`
- `/home/jacobbarkley/claude/claw-dashboard/data/bench/campaigns/stocks_etf_replacement_momentum.campaign_manifest.json`
- `/home/jacobbarkley/claude/claw-dashboard/data/bench/campaigns/stocks_ai_wall_street_aggressive.campaign_manifest.json`

## v2 blocks now present

Both manifests now carry:

- `baseline`
- `baseline_performance`
- `campaign_pressure`

The aggressive AI campaign also carries:

- `leader_comparison_to_baseline`

The ETF campaign intentionally leaves:

- `leader_comparison_to_baseline = null`

because there is no separate leader yet beyond the promoted reference.

## Important semantic changes

### ETF Replacement Momentum

- `current_leader_candidate_id` is now `null`
- the promoted `q076b` reference remains in `candidates[]` as
  `PROMOTED_REFERENCE`
- this campaign is now a true "baseline without a separate leader" case

### Aggressive AI Wall Street

- the campaign now includes the promoted stock reference (`q076b`) as a real
  `PROMOTED_REFERENCE` candidate
- the aggressive thesis still has `Dynamic Top 6` as `LEADER`
- `leader_comparison_to_baseline.status = "INSUFFICIENT_EVIDENCE"`
- `campaign_pressure.status = "LEADER_NOT_YET_QUALITY_GATED"`

## UI compatibility patch that also landed

The dashboard now supports baseline-only campaigns without waiting for another
frontend refactor.

Files:

- `/home/jacobbarkley/claude/claw-dashboard/components/vires/campaigns-index.tsx`
- `/home/jacobbarkley/claude/claw-dashboard/components/vires/campaigns-detail.tsx`

Behavior:

- if `current_leader_candidate_id` is null but `baseline.candidate_id` points
  to a real candidate, the top card renders from the baseline candidate
- this keeps ETF Replacement Momentum visible and honest under the v2 contract

## Sync path that landed

Local bench pull now copies campaign registry + manifests from trading-bot into
dashboard bench data.

File:

- `/home/jacobbarkley/claude/claw-dashboard/scripts/pull-bench-data.py`

New copied targets:

- `data/bench/campaigns/campaign_registry.json`
- `data/bench/campaigns/*.campaign_manifest.json`

## Verification

- `python3 scripts/pull-bench-data.py` ran successfully in the dashboard repo
- `npm run build` passed in the dashboard repo

## What Claude can rely on now

- campaign detail can read `campaign_pressure.summary` as the first operator
  sentence under the title
- ETF can be treated as a baseline-first campaign with no separate leader yet
- Aggressive AI can render a real promoted baseline plus an honest
  `INSUFFICIENT_EVIDENCE` comparison block
- no per-candidate `latest_run.run_stats` wiring should be extended further;
  v2 campaign-level blocks are now the producer truth
