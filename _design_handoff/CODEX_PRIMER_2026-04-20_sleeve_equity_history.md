# Codex primer — `sleeve_equity_history`

**Date:** 2026-04-20  
**Audience:** Claude / dashboard-side integration + audit  
**Status:** Wired in the canonical repo on branch `codex/sleeve-equity-history`

## What landed

The Trading sleeve sparkline now has a real backend history source:

- new top-level feed field: `sleeve_equity_history`
- current Trading sleeve hero sparkline now reads only real history from that
  field
- if the field is absent, the card renders an honest placeholder rather than a
  synthetic curve

Canonical implementation files:

- `/home/jacobbarkley/claude/claw-dashboard/scripts/push-operator-feed.py`
- `/home/jacobbarkley/claude/claw-dashboard/components/vires/sleeve-views.tsx`
- `/home/jacobbarkley/.openclaw/workspace/trading-bot/docs/architecture-rebuild/13-operator-feed-contract.md`

## Feed shape

Top-level path:

```jsonc
{
  "sleeve_equity_history": {
    "stocks": {
      "status": "available",
      "source": "position_book_daily_latest",
      "sleeveLabel": "Stocks sleeve",
      "benchmark_symbol": "SPY",
      "reason": null,
      "series": [
        { "date": "2026-04-13", "market_value": 10344.52 }
      ]
    },
    "crypto": {
      "status": "available",
      "source": "position_book_daily_latest",
      "sleeveLabel": "Crypto sleeve",
      "benchmark_symbol": "BTC/USD",
      "reason": null,
      "series": [
        { "date": "2026-04-20", "market_value": 860.07 }
      ]
    },
    "options": {
      "status": "available",
      "source": "position_book_daily_latest",
      "sleeveLabel": "Options sleeve",
      "benchmark_symbol": "SPY",
      "reason": null,
      "series": [
        { "date": "2026-04-20", "market_value": 0.0 }
      ]
    }
  }
}
```

## How it is derived

Primary source:

- latest `position_book.json` snapshot per trading date from:
  - `/home/jacobbarkley/.openclaw/workspace/trading-bot/state/rebuild/*/*/position_book.json`
  - `/home/jacobbarkley/.openclaw/workspace/trading-bot/state/rebuild_latest/position_book.json`

Derivation rule:

- keep the latest available `position_book.json` per `trading_date`
- sum `market_value_usd` for `OPEN` entries by asset type:
  - `EQUITY -> stocks`
  - `CRYPTO -> crypto`
  - `OPTION(S) -> options`
- then anchor the newest point to the live normalized `positions` total so the
  sparkline agrees with the sleeve hero even when the most recent broker mark
  is slightly newer than the latest rebuild snapshot

## Important semantics

This is **live sleeve market-value history**, not a retroactive strategy
attribution engine.

That means:

- `stocks` includes all open equity capital in the live sleeve right now,
  including `SGOV`
- `crypto` includes open BTC capital in the live sleeve right now, including
  manual BTC
- a sleeve with a real daily zero-value series still counts as available
  history; absence only means no daily ledger series has been captured yet

Also important:

- historical dates come from real `position_book` snapshots
- if the current `as_of_date` has no same-day ledger snapshot but prior history
  exists, the feed may append a live-book-anchored latest point so the Trading
  hero and sparkline stay aligned
- example: we are not backfilling missing middle dates with synthetic values

## Frontend status

No extra frontend plumbing is required for Trading:

- the sleeve hero sparkline already reads `sleeve_equity_history`
- `MV` uses the real daily market-value marks
- `RET` uses the real series too; when a sleeve is very new, the chart now
  duplicates the first real point instead of falling back to fake modeled data
- if a sleeve later goes flat but still has history, the sparkline still shows
  history instead of incorrectly claiming “no data”

## What Claude may want to verify

1. `/vires/trading/stocks`
   - hero sparkline should now read as real history rather than the modeled
     walk
2. `/vires/trading/crypto`
   - hero sparkline should show the sparse real BTC sleeve history
3. `/vires/trading/options`
   - should show a flat real-history state rather than a synthetic placeholder

## What remains later

This does **not** yet solve:

- full passport-side sleeve-vs-benchmark history
- strategy-attributed-only sleeve history
- benchmark overlay for the Trading sparkline
- per-era enrichment for promoted passports

If you want to build on this next, the natural follow-up is:

- extend `sleeve_equity_history` with benchmark series and/or provenance labels
- then light up the passport future-slot from the same contract
