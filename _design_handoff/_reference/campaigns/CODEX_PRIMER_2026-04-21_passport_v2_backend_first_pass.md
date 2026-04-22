# Codex Primer — Passport v2 Backend First Pass (2026-04-21)

**Audience:** Claude Code / Claude Design  
**Status:** First backend implementation slice is landed locally on `codex/passport-v2-workflow`. This is the handoff note for what is real now versus what is still intentionally deferred.

## What landed

### 1. Campaign manifests now carry real stock-side promotion workflow data

Updated checked-in manifests:

- `backtest/bench/campaigns/stocks_ai_wall_street_aggressive.campaign_manifest.json`
- `backtest/bench/campaigns/stocks_etf_replacement_momentum.campaign_manifest.json`

New fields present:

- `promotion_readiness`
- `production_links`
- `promotion_events`

Concrete behavior:

- **Aggressive AI Wall Street** now has a real `promotion_readiness` block with the nine stock gates:
  - `TRADE_COUNT`
  - `PROFIT_FACTOR`
  - `EXPECTANCY`
  - `PROFITABLE_FOLDS`
  - `DRAWDOWN`
  - `BENCHMARK`
  - `EXPECTANCY_DECAY`
  - `HOLDBACK`
  - `ERA_ROBUSTNESS`
- Its current `overall_status` is `BLOCKED`, with honest blockers:
  - `DRAWDOWN`
  - `BENCHMARK`
  - `ERA_ROBUSTNESS`
- **ETF Replacement Momentum** now carries the slot/linkage side of the contract:
  - `promotion_readiness.readiness = null`
  - `production_links.active_record_id = "regime_aware_momentum::stop_5_target_15"`
  - seeded `promotion_events` with a sparse historical `PROMOTION_CONFIRMED`

This means the Campaigns UI can now render:

- the real readiness scorecard for Aggressive AI
- the honest degraded state for ETF Replacement Momentum
- slot-aware production linkage without frontend guessing

### 2. Strategy-bank models now know about the new promotion workflow

Updated trading-bot files:

- `src/openclaw_core/models/strategy_bank.py`
- `src/openclaw_core/services/strategy_bank.py`
- `src/openclaw_core/cli/strategy_bank.py`
- `tests/openclaw_core/test_strategy_bank.py`

Added model support for:

- new stages:
  - `SUPERSEDED`
  - `DEMOTED`
- new event types:
  - `PROMOTION_NOMINATED`
  - `PROMOTION_CONFIRMED`
  - `PASSPORT_SUPERSEDED`
  - `CAMPAIGN_MONITORED`
  - `CAMPAIGN_REOPENED`
  - `DEMOTION_RECOMMENDED`
  - `DEMOTION_CONFIRMED`
- new record fields:
  - `passport_role_id`
  - `supersedes_record_id`
  - `origin`
  - `paper_monitoring`

New runtime methods:

- `confirm_promotion_from_campaign(...)`
- `confirm_demotion(...)`

New CLI surfaces:

- `strategy_bank.py confirm-promotion`
- `strategy_bank.py confirm-demotion`

This is the control-plane groundwork for the operator-confirm workflow. It is not the final end-to-end UX yet, but the bank no longer has to pretend promotions are just generic `STRATEGY_UPDATED` events forever.

### 3. Dashboard bench loader can now see the new runtime artifacts

Updated dashboard files:

- `scripts/pull-bench-data.py`
- `lib/vires-bench.ts`
- `lib/vires-campaigns.ts`
- `components/vires/campaigns-shared.tsx`
- `components/vires/passport-view.tsx`

New mirrored runtime artifacts:

- `data/bench/runtime/strategy_bank.json`
- `data/bench/runtime/strategy_promotion_events.jsonl`

Loader behavior:

- `vires-bench.ts` now reads:
  - `runtime/strategy_bank.json`
  - `runtime/strategy_promotion_events.jsonl`
- stock passports now expose optional v2-ish fields when the bank has them:
  - `origin`
  - `passport_role_id`
  - `supersedes_record_id`
  - `paper_monitoring`
  - `promotion_events`
  - `trade_history` (currently `null`)

Campaign shared types now include:

- `promotion_readiness`
- `production_links`
- `promotion_events`
- `MONITORED` campaign status

## What is still intentionally not done

### 1. No real `paper_monitoring` producer yet

The bank models now support `paper_monitoring`, but the canonical runtime artifacts do **not** yet emit true tracking-deviation thresholds/window progress. Existing mirrored records still mostly lack those fields.

Frontend implication:

- treat `paper_monitoring` as optional
- do not assume the strip is fully live yet

### 2. No real `trade_history` producer yet

The passport loader now reserves `trade_history`, but it is still `null`.

Reason:

- the currently published bench/passport artifacts do not yet carry a reusable row-atomic ledger in the §7 shape
- I did **not** fake one from partial artifacts

Frontend implication:

- the trade-history disclosure should render the honest empty state until the ledger producer lands

### 3. Crypto readiness is still deferred

Stocks now have real readiness data. Managed crypto still needs the gate adapter discussed in the spec.

Frontend implication:

- crypto campaigns should continue to render the empty state / “awaiting crypto gate normalization” state

## What Claude can safely wire against now

### Campaigns

- `campaign.promotion_readiness`
- `campaign.production_links`
- `campaign.promotion_events`
- `campaign.status === "MONITORED"` when it appears later

### Passports

- optional `origin`
- optional `paper_monitoring`
- optional `promotion_events`
- optional `trade_history`

Design/UI recommendation:

- wire the display-first states now
- keep actions disabled or shell-only until the operator-confirm endpoint path is actually hooked up

## Honest caveat

This is a **first backend pass**, not the full finished loop.

What is real now:

- stock readiness contract
- campaign/passport linkage shape
- strategy-bank lifecycle/event groundwork
- mirrored runtime data path into the dashboard

What still needs follow-up:

- real paper-monitoring producer
- operator-confirm endpoints wired into the app/Talon path
- trade-history ledger producer
- crypto gate adapter
