# Claw Dashboard — Claude Session Primer

This file is loaded automatically by every Claude session that runs in this
repo. Keep it current.

Last updated: 2026-04-09

## What this is

The Vercel-hosted operator surface for the ClawBoy trading system. Next.js +
Tailwind + shadcn/ui. Auto-deploys on push to main.

Live URL: https://claw-dashboard.vercel.app (or jacobbarkley.vercel.app)

## One rule above all others

This app is a thin operator surface, NOT a second source of truth. It reads
one file (`data/operator-feed.json`) via `/api/trading`. It does not invent
trading logic, reach into legacy pipeline artifacts, or create ad hoc JSON
contracts. If a field you need doesn't exist in the operator feed, the fix
belongs in the rebuild repo's `push-operator-feed.py` and
`13-operator-feed-contract.md`, not in page-local logic here.

## Data flow

```
rebuild typed core (trading-bot/state/rebuild_latest/*.json)
        |
  push-operator-feed.py  (rebuild adapter, lives in THIS repo under scripts/)
        |
  data/operator-feed.json  (single artifact, contract_version "1")
        |
  app/api/trading/route.ts  (reads operator-feed.json, falls back to trading.json)
        |
  components/trading-dashboard.tsx  (display only)
```

## Ownership

- **Claude (Opus)** owns this repo's visual/UX work, especially
  `components/trading-dashboard.tsx` and `app/globals.css`
- **Codex** owns the operator feed producer (`scripts/push-operator-feed.py`)
  and the feed contract definition (in the trading-bot rebuild docs)
- **Do not** make visual changes to `trading-dashboard.tsx` from Codex
  sessions without coordinating — merge conflicts are likely

## Current state (2026-04-09)

- The trading page reads from the rebuild operator feed
- The operator feed has `source_context.mode = "override"` (demo/preview)
- The preview banner handles this with human-readable copy + technical
  disclosure
- To regenerate canonical production feed:
  `bash scripts/prepare-production-operator-feed.sh`
- Production must only ship feeds where `source_context.mode = "canonical"`

## Operator feed trusted sections

These sections are phase-1 operator truth (from 13-operator-feed-contract.md):
- `source_context` — canonical vs preview
- `account` — Alpaca account state
- `positions` — current positions
- `pipeline_status` — verdict, chain health
- `operator` — mode, checkpoint05, plan, research, regime, approval

Transitional sections (legacy continuity, not rebuild truth):
- `kpis`, `daily_performance`, `equity_curve`, `watchlist`,
  `exit_candidates`, `options`, `hedges`, `bps`

## Operator modes (standardized labels)

- `SHADOW` — current mode, produce artifacts, no trades
- `AUTONOMOUS_PAPER` — paper target, auto-submit after checkpoint 05
- `DECISION_SUPPORT` — live-capital target, human approval required
- `LIVE_AUTONOMOUS` — future only, out of scope

## Trading page structure

Main component: `components/trading-dashboard.tsx` (~2800 lines)

Key sections top to bottom:
1. `CommandStrip` — sticky header: mode chip, checkpoint/plan chips, refresh
2. Preview banner — only renders when `source_context.mode !== "canonical"`
3. `OperatorOverview` — 4 horizontal-scroll cards (promotion, plan,
   approval queue, research/regime) inside a hero container
4. `CapitalHero` — deployed capital, today's P&L, account metrics
5. Charts — `EquityCurve` + `DailyPnlChart`
6. `PerformanceGrid` — KPI tiles
7. `PositionsList` + `ExitCandidatesPanel`
8. `QualifiedSetups` — watchlist
9. `OptionsSection` — options/BPS/hedges tabs

## Design direction

- Mobile-first (Jacob uses this primarily on phone)
- Dark theme with the existing visual mood (gradients, purple accents)
- Progressive disclosure — headlines + disclosures, not walls of text
- Human copy, not engineer tokens (use `humanizeSuppression()` etc.)
- No symbol spam — show symbols once per card, not 4 times
- Cards scroll horizontally on mobile, 2-col grid on desktop

## Dashboard data scripts

- `scripts/push-operator-feed.py` — generates operator-feed.json from
  rebuild artifacts + legacy continuity data
- `scripts/push-operator-feed.sh` — wrapper that commits + pushes
- `scripts/push-dashboard-data.sh` — pushes tickets.json + queue.json
- `scripts/prepare-production-operator-feed.sh` — regenerates canonical
  feed and verifies source_context.mode before continuing
- `scripts/parse-tickets.py` — regenerates tickets.json from TICKET-*.md
- `scripts/check-mojibake.py` — pre-commit guard, blocks commits that carry
  known UTF-8→cp1252 round-trip byte sequences (em-dash, middle-dot, etc.).
  Wired via `.githooks/pre-commit`; `npm install` activates `core.hooksPath`
  via the `prepare` script. Fix offenders with ftfy — the script prints the
  exact one-liner.

## Queued UI work

- Q-075: Vercel approval buttons (after Q-073 Telegram transport is proven)
- New trading-page card: current promoted strategy + banked promoted
  strategies, sourced from `operator.strategy_bank` in `data/operator-feed.json`
  and showing active selection, promotion stage, key validation metrics, notes,
  and other banked variants available for selection
- Further visual refinement based on Jacob's mobile feedback
- Eventually: mode-control display panel (display-only first, then
  governed request UI per doc 16)

## What NOT to do

- No second dashboard truth or alternate JSON contracts
- No direct legacy-state coupling from the frontend
- No silent production deploy with preview/demo feed data
- No new backend flows just to make the UI easier
- No changes to trading logic, promotion logic, or approval semantics
