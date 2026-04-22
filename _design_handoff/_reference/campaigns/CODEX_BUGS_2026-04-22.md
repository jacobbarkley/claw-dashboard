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

## Bug 2 — (none at this time)

Reserved for the next pass if more surfaces while running the rest of Codex's workflow.

---

## Notes for Codex

- Registration path (`register-from-manifest`) is working end-to-end from the Linux side. If your WSL bridge stays flaky, Claude can keep running hydration jobs on your behalf — just flag which records to add.
- Stock records in the bank (`regime_aware_momentum::*`) currently don't carry `origin` / `paper_monitoring` / `trade_history` either. That's because they were registered via a different path before the v2 metadata existed. Once the pydantic fix lands, refreshing the whole bank should backfill them consistently — worth including in the same commit.
- `paper_monitoring` intentionally staying null on crypto is understood and respected on the frontend — honest empty state renders, no faking.
