# Codex Bug Handoff — 2026-04-22

**Surfaced by:** running `register-from-manifest` then `refresh-passport-v2` from the Linux side to hydrate q090c / q090d into the strategy bank (Codex's WSL bridge was hanging; Claude ran it instead).

**Status of surrounding work:** registration itself succeeded cleanly. Bank now carries 5 records (3 stock + 2 crypto), crypto records are `runtime_selectable=false` as designed, `origin` block hydrates correctly on both crypto passports, dashboard mirror (`data/bench/runtime/strategy_bank.json`) is up to date. The bug below blocks the final step of the crypto-passport convergence: populating `trade_history`.

---

## Bug 1 — `refresh-passport-v2` fails with Pydantic date/string mismatch in crypto simulation-row builder

### Reproduction

From `~/.openclaw/workspace/trading-bot`:

```bash
PYTHONPATH=src .venv-rebuild/bin/python3 -m openclaw_core.cli.strategy_bank \
  refresh-passport-v2 \
  --actor claude \
  --note "post-hydration refresh for q090c/q090d"
```

### Error (tail)

```
File "…/src/openclaw_core/services/strategy_bank.py", line 1278,
  in _build_trade_history_from_record
    history = _build_trade_history_from_evidence(…)

File "…/src/openclaw_core/services/strategy_bank.py", line 1306,
  in _build_trade_history_from_evidence
    rows.extend(_trade_history_rows_for_simulation(simulation))

File "…/src/openclaw_core/services/strategy_bank.py", line 1367,
  in _trade_history_rows_for_simulation
    StrategyTradeHistoryRow(…)

pydantic_core._pydantic_core.ValidationError: 1 validation error for
  StrategyTradeHistoryRow
date
  Input should be a valid string
    [type=string_type, input_value=datetime.date(2022, 8, 2),
     input_type=date]
```

### Diagnosis

`_trade_history_rows_for_simulation` at `src/openclaw_core/services/strategy_bank.py:1367` passes the raw `datetime.date` object from simulation evidence into `StrategyTradeHistoryRow.date`, but that Pydantic model field is typed as `str` (matches the `passport_trade_history.v1` contract shape shipped in the primer).

### Suggested fix

Coerce to ISO string at the row construction call site. One-line change of the pattern:

```python
StrategyTradeHistoryRow(
    date=row_date.isoformat() if isinstance(row_date, date) else str(row_date),
    …
)
```

Or loosen the Pydantic model with a validator that accepts `date | datetime | str`. Either works; the ISO-string-at-boundary approach matches the contract the dashboard already consumes (`row.date` read as string in `components/vires/passport-view.tsx` and `components/vires/trade-history-carousel.tsx`).

### What this unblocks

- Crypto passports will populate `trade_history.rows`, which lights up:
  - the Trade-history raw ledger table on the passport
  - the Allocation-stream + Symbol-contribution carousel Claude shipped in `trade-history-carousel.tsx`
- The crypto passport section skeleton is already honest (empty state renders when `trade_history` is null), so the fix is purely additive — no frontend change needed.

### Verification steps after fix

1. Rerun `refresh-passport-v2` from Linux side — no pydantic error.
2. Confirm `state/rebuild_latest/strategy_bank.json` on the trading-bot side now has non-null `trade_history.rows` for both crypto records.
3. Run `python3 scripts/pull-bench-data.py` from the dashboard to pick up the refreshed mirror.
4. Visit a crypto passport on the live dashboard; Trade-history section should render the carousel (slide 1: allocation stream; slide 2: symbol contribution) instead of the empty state.

---

## Bug 2 — Crypto records still emit empty `trade_history` after the Bug 1 fix

### Status

Bug 1 is landed (`codex/passport-v2-workflow @ 5a8c979`) and verified from the
Linux side. `refresh-passport-v2` now completes without the pydantic error.
Stock records in the bank populate trade_history cleanly (330 / 328 / 328
rows, dates as ISO strings). **Crypto records still have empty
`trade_history`** (`{}`, no `rows` key at all), so the dashboard's
Trade-history carousel still shows the honest empty state on q090c / q090d.

### What's on disk for crypto

Both records carry evidence metadata pointing to real files:

- `source_manifest_path` → exists
- `validation_report_path` → exists (`.../crypto_sleeve_comparison_report.json`)
- `experiment_config_path` → exists
- `campaign_summary_path` → null (crypto wasn't promoted via the campaign path)

The `crypto_sleeve_comparison_report.json` top-level keys look like:

```
generated_at, symbol, dataset_bar_count, daily_bar_count,
coverage_start, coverage_end, fee_bps_round_trip, slippage_bps_one_way,
benchmark, core_regime, graduated_core, tactical,
core_gated_tactical, graduated_core_tactical_overlay,
benchmark_baseline
```

That's a **sleeve-level comparison artifact**, not a per-event ledger. There
are no trade rows in this file — only aggregated sleeve stats.

### Diagnosis

The crypto bench run produced sleeve-comparison output, not a
simulation-rows artifact. The refresh-passport-v2 row builder finds no
simulation evidence to iterate → `trade_history.rows = []` → the bank's
normalization emits an empty-dict `trade_history` (observed: `{}` with no
`rows` key at all).

Two directions for the fix, both on Codex:

1. **Producer-side**: make the crypto bench also emit a simulation-rows
   artifact (per-event ledger), the way the stock bench does. Adapter then
   finds evidence to iterate and the carousel lights up on its own.
2. **Adapter-side lift**: recognize "crypto with only sleeve-comparison
   evidence" as an explicit state rather than a silent empty, e.g. write
   `trade_history = { "status": "SLEEVE_COMPARISON_ONLY", "rows": [] }`
   so the passport UI can render a slightly more specific empty-state copy.

Either is additive — the current frontend render is already honest, so no
blocking action there.

### Verification after fix

Same pattern as Bug 1:
1. Rerun `refresh-passport-v2` from Linux side.
2. Confirm `state/rebuild_latest/strategy_bank.json` has non-null
   `trade_history.rows` for both crypto records (or an explicit status
   field if going option 2).
3. `python3 scripts/pull-bench-data.py` from dashboard.
4. Crypto passport carousel populates.

---

## Bug 3 — Alpaca /v2/orders fetch can hiccup, silently drops Recent Orders

### Status

Mitigated, not fully solved. `scripts/push-operator-feed.py` now raises
`AlpacaFetchError` and exits 2 when Alpaca's `/v2/orders` returns None /
wrong shape, so the shell wrapper aborts before committing a feed with
an empty `order_blotter`. Landed on main at `6ca3d1a`.

### What this mitigates

Observed ~10% of 5-minute cron cycles shipping `order_blotter = {stocks: [], crypto: [], options: []}` despite healthy positions. Vercel occasionally
deployed one of those commits, causing the Recent Orders section of the
AllocationHistory card to disappear entirely on Stocks and Crypto until the
next successful cycle + Vercel redeploy. With the guard, those commits no
longer land on main — next successful cycle catches up within ≤5 min.

### What a proper fix looks like (Codex's lane)

Replace the hard-abort with something richer, ideally:

1. Short retry / backoff on `fetch_recent_orders_map` before giving up.
2. Per-subsystem freshness markers on the operator-feed so the frontend
   can render "stale" vs "fresh" instead of an ambiguous empty state.
3. Apply the same pattern to the other `alpaca_*_request` callers that
   currently swallow `None` (see `fetch_stock_return_20d_map`,
   `fetch_stock_snapshots`) — same class of silent-empty bug.

Until then, the hard-abort is the right conservative default.

### Verification after fix

Watch 30 minutes of cron commits (~6 cycles). All should have
`sum(len(v) for v in order_blotter.values()) > 0` unless the account
legitimately has zero fills in the retention window.

---

## Notes for Codex

- Registration path (`register-from-manifest`) is working end-to-end from the Linux side. If your WSL bridge stays flaky, Claude can keep running hydration jobs on your behalf — just flag which records to add.
- Stock records in the bank (`regime_aware_momentum::*`) currently don't carry `origin` / `paper_monitoring` / `trade_history` either. That's because they were registered via a different path before the v2 metadata existed. Once the pydantic fix lands, refreshing the whole bank should backfill them consistently — worth including in the same commit.
- `paper_monitoring` intentionally staying null on crypto is understood and respected on the frontend — honest empty state renders, no faking.
