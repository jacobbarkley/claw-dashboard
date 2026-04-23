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

## Bug 4 — `_crypto_comparison_entry_for_manifest` defined twice in strategy_bank.py after merge

### Status

Blocks the post-main `refresh-passport-v2` run Codex asked Claude to perform.
Without this fix, crypto readiness scorecards stay empty even though the
producer code is technically on trading-bot main.

### Reproduction

From `~/.openclaw/workspace/trading-bot` (on main at `07da58e`):

```bash
PYTHONPATH=src .venv-rebuild/bin/python3 -m openclaw_core.cli.strategy_bank \
  refresh-passport-v2 \
  --actor codex \
  --note "post-main crypto readiness refresh"
```

### Error (tail)

```
File ".../src/openclaw_core/services/strategy_bank.py", line 993,
  in _build_crypto_performance_summary_from_manifest_report
    entry = _crypto_comparison_entry_for_manifest(manifest_payload, report_payload)
TypeError: _crypto_comparison_entry_for_manifest() takes 0 positional arguments but 2 were given
```

### Diagnosis

Two definitions of the same function in `src/openclaw_core/services/strategy_bank.py`:

- **Line 1052** — positional signature `(manifest_payload, report_payload)`, returns `dict[str, object] | None`.
- **Line 1515** — keyword-only signature `(*, manifest_payload, report)`, returns `CryptoSleeveComparisonEntry | None`.

Python evaluates top-down so the second definition shadows the first. The
call at line 993 passes positionally → TypeError.

Likely a merge collision across the three stacked branches
(`promotion-readiness-passports` / `strategy-bank-schema-alignment` /
`passport-historical-backfill`). Without a runtime pytest pass this slipped
through — exactly what `pytest tests/openclaw_core/test_strategy_bank.py::test_refresh_passport_v2_*`
would have caught.

### Suggested fix

Two options depending on which signature is canonical:

1. **Pick one, delete the other.** If the keyword-only version at 1515 is
   canonical, update the call at 993 to use kwargs, then delete 1052. If the
   positional version at 1052 is canonical, update the kwargs call at 1509
   to positional, then delete 1515.
2. **Merge them.** If both are doing real work on different data shapes (the
   return types differ: `dict` vs typed `CryptoSleeveComparisonEntry`),
   collapse into a single function and update both call sites.

Verify with `pytest tests/openclaw_core/test_strategy_bank.py` then rerun
`refresh-passport-v2`.

### What this unblocks

- `refresh-passport-v2` completes cleanly
- runtime strategy bank picks up the new readiness code
- crypto q090c / q090d records get non-null `promotion_readiness`
- dashboard crypto campaigns stop rendering the empty-state readiness
  scorecard

### Operational follow-up

Once Bug 4 is fixed, Claude can rerun the refresh + bench mirror pull:

```bash
cd ~/.openclaw/workspace/trading-bot
PYTHONPATH=src .venv-rebuild/bin/python3 -m openclaw_core.cli.strategy_bank \
  refresh-passport-v2 --actor codex --note "post-Bug4 crypto readiness refresh"

cd ~/claude/claw-dashboard
python3 scripts/pull-bench-data.py
```

---

## Bug 5 — pytest regression suite + test-side-effect pushes to dashboard main — CLOSED

### Status

**CLOSED on trading-bot `codex/bug5-test-isolation-readiness @ 8c1e532`.**
Verified from Linux side on 2026-04-23:

```
collected 31 items
============================== 31 passed in 1.55s ==============================
```

Zero pushes to claw-dashboard main during the test run — Class B isolation
fix verified holding across the full suite, not just the earlier spot check.

Journey of the bug across the day:
- `9aabe1e` (first attempt) — 4 of 8 remaining failures; Class B closed.
- `9889f8a` (local-only, never reached origin) — had a syntax error at
  `strategy_bank.py:2083` (extra indent on `deviations.append(...)`), so
  nothing could be tested. Also wasn't actually on origin because of a
  race between parallel commit + push.
- `8c1e532` — syntax fixed, push actually verified against origin SHA, all
  31 tests green.

All failure categories below are now green. Keeping the detail sections
as historical record of what this slice covered.

Post-3327036 runtime verification. Claude ran `pytest tests/openclaw_core/test_strategy_bank.py` from the Linux side (which Codex couldn't do from his WSL-broken desktop). Two distinct classes of problem surfaced: real test regressions and test isolation leakage.

### Class A — 8 of 31 test_strategy_bank.py tests fail on main @ 3327036

```
8 failed, 23 passed in 18.45s

FAILED test_strategy_bank_registers_campaign_winner_and_selects_active
FAILED test_strategy_bank_confirm_promotion_creates_confirming_record
FAILED test_strategy_bank_registers_crypto_manifest_as_passive_record
FAILED test_crypto_comparison_entry_helpers_do_not_shadow_each_other
FAILED test_strategy_bank_refresh_passport_v2_backfills_crypto_trade_history_from_state_changes
FAILED test_trade_history_rows_preserve_symbol_weight_across_overlapping_round_trips
FAILED test_strategy_bank_refresh_passport_v2_applies_crypto_defaults_for_confirming_record
FAILED test_strategy_bank_cli_registers_and_shows_active
```

Three of these are directly attributable to the threshold wiring work or its merge neighbors:

- `test_strategy_bank_refresh_passport_v2_applies_crypto_defaults_for_confirming_record` — the threshold-defaults test Codex wrote for this slice is failing. Primary diagnostic target.
- `test_crypto_comparison_entry_helpers_do_not_shadow_each_other` — the regression Codex added for Bug 4 is failing. Suggests the shadowing is back, or the test setup drifted.
- `test_strategy_bank_confirm_promotion_creates_confirming_record` — the CONFIRMING-stage creation path, which is exactly what paper_monitoring depends on. Must pass before thresholds can be observed end-to-end.

The other five are from earlier slices (trade_history rows, crypto backfill, CLI registration) and may have drifted without anyone catching them. Full stack traces are reproducible with:

```bash
cd ~/.openclaw/workspace/trading-bot
PYTHONPATH=src .venv-rebuild/bin/python3 -m pytest tests/openclaw_core/test_strategy_bank.py --tb=long
```

**Before fixing:** confirm it's really 3327036 that regressed these by running the same suite on 85b9422 (immediately prior). If they were already failing, Claude's earlier review passes missed them — which is also worth knowing.

### Class B — pytest triggered a real push to claw-dashboard main

During the first test run, one test fired the production push-operator-feed flow and actually committed + pushed to dashboard main. The commit is on record as `3ea95a3` on `claw-dashboard @ main`:

```
Wrote operator-feed.json -> /home/jacobbarkley/claude/claw-dashboard/data/operator-feed.json
Canonical operator feed ready: data/operator-feed.json
[main 3ea95a3] data: operator feed update 2026-04-22
 1 file changed, 11 insertions(+), 11 deletions(-)
To github.com:jacobbarkley/claw-dashboard.git
   7608923..3ea95a3  main -> main
```

Same class of bug as the Discord incident pollution from 2026-04-16, but different fan-out. The conftest autouse fixture that patches `send_rebuild_incident_alert_once` doesn't cover `push-operator-feed.py`. The content happens to be benign (identical shape to a normal 5-min cron push) but it SHOULDN'T be happening.

**Suggested isolation layer:**
- Extend the conftest autouse fixture to patch the test path that invokes the operator-feed push shell wrapper. Or detect `PYTEST_CURRENT_TEST` inside `push-operator-feed.py` / its shell wrapper and no-op the `git commit` / `git push` steps when set (mirroring the incident-sender gate).
- The refresh-passport-v2 CLI appears to be invoking the push as a post-step side effect. If that's legitimate in production but never desirable under tests, the environment gate is cleanest.

### What this unblocks

- End-to-end trust that thresholds actually apply to a confirming record.
- Ability for Claude to run pytest on his Linux side as a verification backstop for future Codex slices without polluting git history.

### Verification after fix

```bash
PYTHONPATH=src .venv-rebuild/bin/python3 -m pytest tests/openclaw_core/test_strategy_bank.py
# expect: 31 passed
```

Then check git log on claw-dashboard main — no new `data: operator feed update` commits should appear during the test run (only cron-driven ones at 5-min intervals).

---

## Bug 5 — 4 remaining failures after `9aabe1e` (tails relayed from Linux pytest run)

Run: `cd ~/.openclaw/workspace/trading-bot && PYTHONPATH=src .venv-rebuild/bin/python3 -m pytest tests/openclaw_core/test_strategy_bank.py --tb=long`

Summary: `4 failed, 27 passed in 1.42s`

Grouped by root cause below.

### 5.1 — `trade_history` not populated on the CONFIRM_PROMOTION path (2 failures)

Both `test_strategy_bank_registers_campaign_winner_and_selects_active` and `test_strategy_bank_confirm_promotion_creates_confirming_record` fail at the same assertion: they register/confirm a campaign winner, read back the record, and expect `record.trade_history is not None`. It is None.

```
AssertionError: assert None is not None
 +  where None = PromotedStrategyRecord(record_id='regime_aware_momentum::winner', ...).trade_history
tests/openclaw_core/test_strategy_bank.py:445
tests/openclaw_core/test_strategy_bank.py:535
```

Both paths run: `_write_campaign_fixture(repo_root)` → `runtime.confirm_promotion_from_campaign(...)`. The fixture writes a campaign with simulation rows; the path is supposed to derive trade_history from that evidence during the CONFIRM_PROMOTION write. Something in the registration→confirmation wiring skips the trade_history build for campaign-fixture evidence. Likely adjacent to `_build_trade_history_from_record` / the CONFIRM_PROMOTION path in `strategy_bank.py`.

### 5.2 — stale enum in one simulation fixture (1 failure)

`test_trade_history_rows_preserve_symbol_weight_across_overlapping_round_trips` fails at `SimulationRun.model_validate(...)` — the test fixture uses `exit_reason="TARGET_HIT"` which isn't a valid enum value.

```
pydantic_core._pydantic_core.ValidationError: 2 validation errors for SimulationRun
trades.0.exit_reason
  Input should be 'STOP', 'TARGET', 'TIME_STOP' or 'WINDOW_END'
    [type=literal_error, input_value='TARGET_HIT', input_type=str]
trades.1.exit_reason
  Input should be 'STOP', 'TARGET', 'TIME_STOP' or 'WINDOW_END'
    [type=literal_error, input_value='TARGET_HIT', input_type=str]
tests/openclaw_core/test_strategy_bank.py:870
```

Trivial fixture fix: `TARGET_HIT` → `TARGET` on both trades in the fixture literal at `test_strategy_bank.py:870`.

### 5.3 — crypto CONFIRMING record's streak-breach detection doesn't fire (1 failure)

`test_strategy_bank_refresh_passport_v2_applies_crypto_defaults_for_confirming_record` — the test sets up a CONFIRMING crypto record with an equity curve that drops 100000 → 89500 over 5 consecutive days (roughly -10.5% cumulative, which is past the 10.0% crypto threshold sustained for the full 5-day `window_days`). It then asserts status transitions to `DEMOTION_RECOMMENDED`. It stays `ACTIVE`.

```
assert refreshed_record.paper_monitoring.window.target_days == 14
assert refreshed_record.paper_monitoring.tracking.threshold_pct == 10.0
assert refreshed_record.paper_monitoring.tracking.window_days == 5
# All three above PASS — defaults are wired correctly.

assert refreshed_record.paper_monitoring.status == "DEMOTION_RECOMMENDED"
AssertionError: assert 'ACTIVE' == 'DEMOTION_RECOMMENDED'
  - DEMOTION_RECOMMENDED
  + ACTIVE
tests/openclaw_core/test_strategy_bank.py:1706
```

This is the core threshold semantics. The defaults are picked up correctly (`target_days=14`, `threshold_pct=10.0`, `window_days=5` all assert fine). What doesn't fire is the streak-detection logic that should transition `ACTIVE → DEMOTION_RECOMMENDED` after `window_days` consecutive measurement days at-or-worse-than threshold.

Candidate root causes (Claude's guesses, not authoritative):
- The streak counter may only consider daily deltas, not cumulative deviation against the monitoring-start baseline.
- The streak may be cleared by an intermediate day if daily-change is flat/positive even while cumulative deviation stays at-or-below threshold.
- The threshold comparison may be symmetric/absolute (`abs(dev) >= threshold`) but the deviation is being computed differently than assumed.

This one is the material remaining gap — 5.1 and 5.2 are wiring/fixture cleanup. 5.3 means the threshold contract Codex + Jacob + Claude locked doesn't yet manifest in runtime behavior.

### Verification after fix

```bash
PYTHONPATH=src .venv-rebuild/bin/python3 -m pytest tests/openclaw_core/test_strategy_bank.py
# expect: 31 passed
```

Claude reruns refresh-passport-v2 + pull-bench-data.py after the next commit lands on main.

---

## Bug 5 — `9889f8a` follow-up attempt blocked (2 issues)

### 1. The commit isn't on origin

Codex's message claims the follow-up landed as `9889f8a` on `codex/bug5-test-isolation-readiness`. The remote branch still points at `9aabe1e`:

```
$ git ls-remote origin refs/heads/codex/bug5-test-isolation-readiness
9aabe1e309c5a58350f74937dd3058a8326ffc25    refs/heads/codex/bug5-test-isolation-readiness
```

The HTTPS push almost certainly failed silently again (same class as the
dashboard push issue on `codex/promotion-readiness-passports` earlier). Codex
should check `git push` output on his side — if it didn't print "pushed"
confirmation, the commit is local-only.

### 2. The local copy of `9889f8a` has a syntax error

(The commit object is in Claude's local object DB from an earlier fetch, so
the content is testable even without the push landing. But the content
itself is broken.)

`src/openclaw_core/services/strategy_bank.py:2083` — extra 2-space indent:

```python
   2078    actual = ((equity / start_equity) - 1) * 100
   2079    expected = _project_expected_return_pct(
   2080        annualized_return_pct=annualized_return_pct,
   2081        elapsed_days=index,
   2082    )
   2083      deviations.append(round(actual - expected, 4) if expected is not None else None)
#         ^^ should be 8 spaces, has 10
   2084 return deviations
```

`pytest` can't even collect the suite — the module fails to import:

```
IndentationError: unexpected indent
  File ".../strategy_bank.py", line 2083
    deviations.append(round(actual - expected, 4) if expected is not None else None)
```

### Ownership note on review process

Codex claimed "Meitner caught one real risk in my first monitoring fallback.
I fixed it. Second review came back with no findings." The review pass
clearly didn't run `python3 -c "import openclaw_core.services.strategy_bank"`
or any lint — a single dedent would have caught this.

Until Codex can run pytest locally, the minimum honest review bar should be:
`PYTHONPATH=src .venv-rebuild/bin/python3 -c "from openclaw_core.services.strategy_bank import StrategyBankRuntime"`
before claiming a review is clean. That's a one-liner that would have
blocked this push.

### Required next step from Codex

1. Fix the indent at `strategy_bank.py:2083` (one character-width dedent).
2. Actually push — `git push origin codex/bug5-test-isolation-readiness`
   and verify the "To github.com:..." line prints a new SHA for that branch,
   not "Everything up-to-date."
3. Confirm with: `git ls-remote origin refs/heads/codex/bug5-test-isolation-readiness`
   — should return `9889f8a...` (or whatever the new SHA is after the
   indent fix) instead of `9aabe1e...`.

Claude reruns pytest against a genuinely-on-origin commit as soon as that
lands. The 4 remaining failures from 9aabe1e (1 stale enum in fixture
which Codex said he already updated, 2 trade_history null assertions, 1
DEMOTION_RECOMMENDED streak-detection) are what the next test run will
actually exercise.

---

## Notes for Codex

- Registration path (`register-from-manifest`) is working end-to-end from the Linux side. If your WSL bridge stays flaky, Claude can keep running hydration jobs on your behalf — just flag which records to add.
- Stock records in the bank (`regime_aware_momentum::*`) currently don't carry `origin` / `paper_monitoring` / `trade_history` either. That's because they were registered via a different path before the v2 metadata existed. Once the pydantic fix lands, refreshing the whole bank should backfill them consistently — worth including in the same commit.
- `paper_monitoring` intentionally staying null on crypto is understood and respected on the frontend — honest empty state renders, no faking.
