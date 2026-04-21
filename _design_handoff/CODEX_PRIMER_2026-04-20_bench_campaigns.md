# Codex primer - Bench Campaigns

**Date:** 2026-04-20  
**Audience:** Claude Design / Claude Code  
**Status:** Backend contract drafted; example manifests checked in

## What this surface is

Bench Campaigns is the missing research layer above passports.

Primary job:

- live mission control for in-flight bench work
- not just a historical report archive

Use this framing in the product:

- **Production** = what deserves capital
- **Bench** = what is competing to deserve capital

Passports stay the evidence surface for one candidate.
Campaigns become the operating surface for a research program.

## Important naming rule

Do **not** call this surface a "primer" in the actual app.

Use names like:

- `Campaigns`
- `Bench Campaigns`
- `Research Programs`

`Primer` is only the internal handoff label.

## Confirmed product semantics

### Campaign vs family

- **campaign = thesis**
- **family = implementation approach**

Example:

- campaign: `ETF Replacement Momentum`
- families inside it:
  - `REGIME_AWARE_MOMENTUM`
  - `STRATEGY_ALIGNED_COMPOSITE_SCREEN`

This matters because one thesis can have several competing families.

### Runs

- runs belong to candidates
- campaign pages aggregate recent runs across candidates

So the page should feel like:

- one research program
- many candidate strategies
- each candidate with its own latest run state

### Statuses

V1 campaign statuses are intentionally small:

- `EXPLORING`
- `CONVERGING`
- `PROMOTED`

Please do **not** design around a giant status taxonomy yet.

### Change log

The change log is a first-class part of v1, not a follow-up.

Without it, the campaign page is just a static snapshot.
With it, the Bench becomes something the user can stay current with.

### Multi-writer and freshness

Any agent may move the campaign forward:

- user
- Claude
- Codex
- OpenClaw automation

The UI should not care who wrote the last update.
It should care that the shape is stable and fresh.

Also: this surface should update within minutes of meaningful bench activity,
not on a next-day batch.

Treat it more like operator-feed freshness than an archival report.

## Canonical backend paths

Contract doc:

- `/home/jacobbarkley/.openclaw/workspace/trading-bot/docs/architecture-rebuild/32-bench-campaigns-contract.md`

Registry:

- `/home/jacobbarkley/.openclaw/workspace/trading-bot/backtest/bench/campaigns/campaign_registry.json`

Example manifests:

- `/home/jacobbarkley/.openclaw/workspace/trading-bot/backtest/bench/campaigns/stocks_ai_wall_street_aggressive.campaign_manifest.json`
- `/home/jacobbarkley/.openclaw/workspace/trading-bot/backtest/bench/campaigns/stocks_etf_replacement_momentum.campaign_manifest.json`

## What the app should show

## 1. Campaign Index

This is the first visual unlock.

One card per campaign showing:

- title
- sleeve
- status
- current leader
- short summary
- last meaningful change
- last run time
- leader stability
- runner-up gap

The user should be able to open the app and instantly answer:

- what are we actively researching right now?
- which programs are getting warmer?
- what changed since yesterday?

## 2. Campaign Detail

Inside one campaign, show:

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

This should feel like a research desk, not a social feed.

## 3. Candidate deep links

Each candidate row/card should deep-link to its existing evidence surface:

- passport
- run detail
- promoted manifest
- bench report

Do not reinvent the candidate evidence surface here.
Campaigns organize it.

## Design direction

Tone:

- premium
- operational
- serious-retail / prosumer
- calm and trustworthy

Avoid:

- leaderboard hype
- social-trading energy
- creator-marketplace aesthetics
- making "current leader" feel like "guaranteed winner"

The right feeling is:

- research desk
- investment memo board
- strategy operating system

## Important UX distinction

Visually distinguish:

- `LEADER`
- `CHALLENGER`
- `PROMOTED_REFERENCE`

That distinction matters.

A promoted reference is not just another challenger.
It is the current baseline the rest of the campaign is trying to beat.

## The "what's the lever?" requirement

This matters a lot.

When the user opens a campaign, they should be able to think:

- what should we tweak next?
- is the leader stale?
- is the runner-up close?
- has this thesis gone cold?

So the design should visibly support:

- `last_run_at`
- `last_leader_change_at`
- `leader_stability_sessions`
- `runner_up_gap`
- `days_since_param_sweep`

These do not need to feel hyper-quant.
They just need to make staleness and pressure obvious.

## Change-log examples worth designing for

- leader changed from A to B
- promoted reference added
- benchmark widened from SPY to QQQ or vice versa
- candidate retired
- new candidate added

If you only design a static card grid, the Bench will still feel too dead.

## About the user's "six fixed stock momentum" idea

Treat this carefully.

It is **not automatically** a top-level campaign.

If it is really a narrower implementation inside the broader ETF-replacement
thesis, it should appear as:

- a family lane
- or a candidate cluster

Only elevate it to its own campaign if we decide it is a distinct research
mandate, not just a stronger implementation inside the ETF-replacement story.

That nuance is part of the product value.

## Suggested build order

1. Campaign index page
2. Campaign detail page
3. Change-log timeline treatment

My recommendation:

- tonight's realistic scope is the index first
- detail page and richer timeline can follow right after

## Honest data rule

Do not fake campaign history.

If a campaign only has checked-in current state plus a few logged changes, that
is still better than inventing a synthetic history chart.

This surface should feel alive because it is truthful, not because it is busy.
