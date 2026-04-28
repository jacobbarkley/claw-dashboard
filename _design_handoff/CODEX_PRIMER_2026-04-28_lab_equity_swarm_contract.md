# Codex primer — Lab equity swarm: data contract (2026-04-28, rev 2)

## Revision note

Rev 1 proposed inflating `selected_result` directly and overclaimed that
per-trade MTM was "already there." Codex pushed back; rev 2 reflects the
corrections. Summary of changes:

- Equity swarm lives in a **separate cold artifact**, not in
  `selected_result`. Referenced by path from the Lab result/candidate/
  manifest. Keeps the default leaderboard payload small; chart lazy-loads.
- Per-trade `mtm_curve` is **not** currently stored. Fold-level equity
  (`equity_dates`, `equity_curve_usd`, `trades`) does already live in
  `backtest/experiments/.../simulations/*.simulation_run.json` — but
  per-trade MTM needs derivation (bars + entry/exit/shares) or a
  simulator extension.
- Benchmark daily curve also needs derivation. Today's summaries
  carry benchmark *return*, not the daily series.
- Campaign-level view in v1 = render the leader / latest run only.
  Blind splicing across runs has overlap/comparability hazards;
  defer until we have explicit guardrails.
- Trade curves carry both `value_usd` and `value_pct` (rebased).
  USD-only is visually misleading when position sizes vary.

## What's needed

The Lab is getting a per-result equity-and-trade-swarm chart. It draws:

- **Two bold headline lines**: cumulative strategy P&L vs the campaign's
  declared benchmark (e.g. SPY for stock runs).
- **A swarm of thinner lines underneath**, one per individual trade.
  Each trade line is the trade's own per-day P&L curve from entry-date
  to exit-date. Completed Lab backtests have no true open trades; if a
  future live/in-progress artifact uses `status: "OPEN"`, it extends to
  `date_range.end` / `as_of_date`, not wall-clock "now."

Visual intent: see strategy-vs-benchmark instantly on the headline lines,
plus a visceral read of *how the strategy got there*.

## Artifact shape

New cold artifact, emitted per completed Lab result, mirrored to the
dashboard:

**Suggested artifact id:** `research_lab.equity_swarm.v1`
**Storage:** Lab cold tree, mirrored to the dashboard at the same repo-relative
path:
`data/research_lab/{user_id}/{account_id}/{strategy_group_id}/equity_swarm/equity_swarm_{result_id}.json`

This is intentionally *not* stored under `backtest/bench/results/...` for v1.
The dashboard already consumes Lab terminal artifacts from `data/research_lab`;
keeping the swarm there lets the existing mirror path publish it beside
`result.v1` and `candidate.v1`.

**Reference from the Lab result/candidate/manifest:**

```jsonc
// in the Lab result (NOT in selected_result), add:
{
  "equity_swarm_artifact": {
    "artifact_id": "research_lab.equity_swarm.v1",
    "artifact_type": "EQUITY_SWARM",
    "path": "data/research_lab/.../equity_swarm/equity_swarm_result_job_....json",
    "description": "Per-result strategy + benchmark + per-trade equity series."
  }
}

// in the Campaign candidate artifact_refs, mirror the lazy-load path:
{
  "artifact_refs": {
    "equity_swarm_path": "data/research_lab/.../equity_swarm/equity_swarm_result_job_....json",
    "equity_swarm_artifact_id": "research_lab.equity_swarm.v1"
  }
}
```

**Artifact body:**

```jsonc
{
  "schema_version": "research_lab.equity_swarm.v1",
  "result_id": "...",                      // ties back to the Lab result
  "run_id": "...",
  "campaign_id": "...",
  "source_variant_id": "stop_5_target_15",  // winning variant only
  "source_fold": "holdback",                // v1 uses the held-out fold only
  "source_simulation_path": "backtest/experiments/.../holdback.simulation_run.json",
  "source_dataset_path": "backtest/experiments/.../historical_dataset.json",
  "generated_at": "2026-04-28T03:14:22-04:00",
  "starting_capital_usd": 100000.00,        // shared rebase point
  "currency": "USD",
  "date_range": {
    "start": "2026-01-02",
    "end":   "2026-04-25",
    "as_of_date": "2026-04-25"
  },

  "strategy_curve": [
    { "date": "2026-01-02", "value_usd": 100000.00, "value_pct": 0.00 },
    { "date": "2026-01-03", "value_usd": 100240.51, "value_pct": 0.24 },
    // ... daily ...
  ],

  "benchmark": {
    "symbol": "SPY",
    "label":  "SPY",
    "curve": [
      { "date": "2026-01-02", "value_usd": 100000.00, "value_pct": 0.00 },
      { "date": "2026-01-03", "value_usd": 100130.22, "value_pct": 0.13 },
      // ... daily, same start/end as strategy_curve ...
    ]
  },

  "trades": [
    {
      "trade_id":   "trade_0001",           // synthetic, stable within artifact
      "symbol":     "AAPL",
      "entry_date": "2026-01-15",
      "exit_date":  "2026-02-03",            // null if still open
      "entry_price": 184.22,
      "exit_price":  191.05,                  // null if still open
      "shares":      125,
      "notional_usd_at_entry": 23027.50,
      "pnl_usd":     683.00,                  // realized; for open, MTM as-of date_range.end
      "pnl_pct":     2.97,                    // pnl_usd / notional_usd_at_entry
      "status":      "CLOSED",                // "OPEN" | "CLOSED"
      "mtm_curve": [
        { "date": "2026-01-15", "value_usd": 0.00,    "value_pct": 0.00 },
        { "date": "2026-01-16", "value_usd": -42.10,  "value_pct": -0.18 },
        { "date": "2026-01-17", "value_usd": 88.40,   "value_pct": 0.38 },
        // ... per-day from entry through exit (or date_range.end if open) ...
        { "date": "2026-02-03", "value_usd": 683.00,  "value_pct": 2.97 }
      ]
    }
  ]
}
```

### Field notes

- **`value_pct` everywhere** is the rebased percent vs `starting_capital_usd`
  for the headline curves, and vs `notional_usd_at_entry` for trade curves.
  This is the lens we need so a $5K winner on a $50K position doesn't
  visually drown a $200 winner on a $2K position.
- **`value_usd`** stays alongside it — chart will toggle USD ↔ percent.
  Both are honest; they answer different questions.
- All dates ISO `YYYY-MM-DD`, calendar dates only, single timezone (ET assumed).
- `strategy_curve`, `benchmark.curve`, and `mtm_curve` arrays must use the
  same trading-day grid (no need to fill weekends/holidays).

### Fallback path if per-trade MTM derivation is too expensive

If reconstructing per-trade per-day MTM (from bars + shares + entry/exit)
is genuinely cost-prohibitive at scale, drop `mtm_curve` and the chart
falls back to drawing each trade as a diagonal from `(entry_date, 0)` to
`(exit_date, pnl_pct)`. Less informative — loses the within-trade journey
— but acceptable as a v1.

Default ask: emit `mtm_curve`. Only fall back if there's a real cost
problem.

## v1 scope — single result only, no campaign rollup

Per-campaign view in v1 renders the **leader / latest run's winning
variant, holdback fold** equity swarm only. We do NOT attempt to splice
equity curves across folds or multiple runs of the campaign yet —
overlapping windows, incomparable presets, and rebase-anchor mismatches
all need guardrails before that's safe.

Campaign rollup is a v2 conversation. The artifact shape above is
per-result and doesn't presuppose how rollup might eventually work.

## Frontend side

`components/vires/lab/` — new `<EquityCurveSwarm />` component, mounted
into the per-campaign Lab view. Built against this exact mock shape now;
flips to live by lazy-loading the referenced artifact path the moment a
real one lands.

Component prop API is library-agnostic so we can swap Recharts → Visx
later without touching the parent:

```ts
<EquityCurveSwarm
  data={equitySwarmV1}
  scaleMode="usd" | "pct"
  onTradeSelect={(trade) => ...}
/>
```

— Claude
