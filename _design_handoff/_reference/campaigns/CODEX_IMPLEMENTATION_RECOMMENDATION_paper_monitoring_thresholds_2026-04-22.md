# Codex Implementation Handoff — Paper Monitoring Thresholds (2026-04-22)

Purpose: translate the already-locked paper-monitoring threshold
contract into a concrete backend shipping plan before editing
`strategy_bank.py`.

Source of truth:
- [`PAPER_MONITORING_THRESHOLDS_PROPOSAL_2026-04-22.md`](./PAPER_MONITORING_THRESHOLDS_PROPOSAL_2026-04-22.md)
- dashboard `main` commit: `7e8f5c7`

This note is **subordinate** to the source contract above.

- If this note and the source doc ever disagree, the source doc wins.
- Do not edit threshold values or behavior decisions here first.
- This file exists only to say where the code changes go, how the logic
  should be translated, and which tests should pin it.

Locked values from the source doc:
- stocks: `target_days=21`, `threshold_pct=4.0`, `window_days=5`
- crypto: `target_days=14`, `threshold_pct=10.0`, `window_days=5`
- demotion: asymmetric downside only
- `AT_RISK`: symmetric, implicit half-threshold, no streak
- per-passport override: backend-supported, UI-hidden in v1

---

## 1. Current code touchpoints

Primary backend file:
- `vires-numeris/src/openclaw_core/services/strategy_bank.py`

Relevant sections today:
- constants:
  - `DEFAULT_PAPER_MONITORING_TARGET_DAYS`
  - `DEFAULT_PAPER_MONITORING_THRESHOLD_PCT`
  - `DEFAULT_PAPER_MONITORING_WINDOW_DAYS`
  - `MIN_DEMOTION_RECOMMENDATION_BREACHES`
- confirmation seed path:
  - `StrategyBankRuntime.confirm_promotion_from_campaign()`
- refresh logic:
  - `_refresh_paper_monitoring_state()`
- deviation math:
  - `_project_expected_return_pct()`
  - `_series_tracking_deviations()`

Model file:
- `vires-numeris/src/openclaw_core/models/strategy_bank.py`

No schema expansion is required for v1. The current model already carries:
- `window.target_days`
- `tracking.threshold_pct`
- `tracking.window_days`
- `tracking.tracking_deviation_pct`

Test file:
- `vires-numeris/tests/openclaw_core/test_strategy_bank.py`

Existing tests to update rather than delete:
- `test_strategy_bank_confirm_promotion_creates_confirming_record`
- `test_strategy_bank_refresh_passport_v2_promotes_confirming_record_to_paper_approved`
- `test_strategy_bank_refresh_passport_v2_recommends_demotion_when_tracking_breaks`

---

## 2. Confirmed semantics from the current code

These are already true and should stay true:

1. `tracking_deviation_pct` is cumulative since monitoring start.
   - It is computed as:
     - `actual_return_pct - expected_return_pct`
   - Current source:
     - `strategy_bank.py`, `_refresh_paper_monitoring_state()`
2. The streak logic is driven off the trailing values returned by
   `_series_tracking_deviations()`, not off single-day returns.
3. Monitoring decisions are only decision-grade when the source is
   `ACCOUNT_PORTFOLIO_HISTORY`.
4. Fallback `STRATEGY_POSITION_BOOK_MARKET_VALUE` remains contextual only
   and should not auto-demote or auto-approve.

---

## 3. Recommended defaults shape

Replace the scalar constants with a sleeve-keyed defaults map.

Suggested shape:

```python
PAPER_MONITORING_DEFAULTS = {
    "STOCKS": {
        "target_days": 21,
        "threshold_pct": 4.0,
        "window_days": 5,
    },
    "CRYPTO": {
        "target_days": 14,
        "threshold_pct": 10.0,
        "window_days": 5,
    },
}

DEFAULT_PAPER_MONITORING_DEFAULT = PAPER_MONITORING_DEFAULTS["STOCKS"]
```

Reasoning:
- stocks is the safest fallback
- options stays intentionally absent until a live paper slot exists
- unknown sleeves should fall back explicitly, not crash

Recommended helper layer:

```python
def _paper_monitoring_defaults_for_sleeve(sleeve: str | None) -> dict[str, float | int]:
    normalized = str(sleeve or "").upper()
    return PAPER_MONITORING_DEFAULTS.get(normalized, DEFAULT_PAPER_MONITORING_DEFAULT)


def _resolved_paper_monitoring_config(
    *,
    sleeve: str | None,
    monitoring: StrategyPaperMonitoring | None,
) -> tuple[int, float, int]:
    ...
```

This keeps per-passport overrides additive:
- if the record already carries `target_days`, `threshold_pct`, or
  `window_days`, preserve them
- otherwise fill from sleeve defaults

---

## 4. Required behavior changes

The source contract lists four required behavior changes. I agree with
those four. I am also calling out one implementation choice the source
doc implies but does not spell out explicitly: completion precedence.

### 4.1 Sleeve defaults, not global scalars

Change:
- seed `paper_monitoring.window.target_days`
- seed `paper_monitoring.tracking.threshold_pct`
- seed `paper_monitoring.tracking.window_days`

Where:
- `confirm_promotion_from_campaign()`
- any other future promotion path that instantiates `StrategyPaperMonitoring`

Recommendation:
- do not rewrite existing explicit values on refresh
- only backfill missing values from sleeve defaults during refresh

### 4.2 Demotion streak uses full `window_days`

Current issue:
- code still gates demotion via:
  - `MIN_DEMOTION_RECOMMENDATION_BREACHES`
  - `min(MIN_DEMOTION_RECOMMENDATION_BREACHES, max(window_days, 1))`
- that means a 5-day window can still demote after 3 days

Change:
- remove `MIN_DEMOTION_RECOMMENDATION_BREACHES`
- demotion threshold becomes:
  - `trailing_breaches >= max(window_days, 1)`

That matches the locked contract:
- 5 consecutive breach days means 5, not 3

### 4.3 `AT_RISK` becomes half-threshold and symmetric

Current issue:
- `AT_RISK` uses the same downside threshold as demotion

Change:
- compute:

```python
at_risk_threshold_pct = threshold_pct / 2.0
```

- `AT_RISK` when:

```python
tracking_deviation_pct is not None and abs(tracking_deviation_pct) >= at_risk_threshold_pct
```

- no streak requirement

Meaning:
- stocks: `2.0%`
- crypto: `5.0%`

### 4.4 Demotion stays asymmetric

Demotion should only consider downside breaches:

```python
deviation <= -threshold_pct
```

Do not use `abs(deviation)` for demotion.

### 4.5 Recommended completion precedence

The source contract explicitly says:
- `target_days` is the total monitoring horizon before clean close
- `AT_RISK` is informational

To make the code behave that way, my recommendation is:

1. `DEMOTION_RECOMMENDED`
2. `COMPLETED`
3. `AT_RISK`
4. `ACTIVE`

Why I’m recommending this:
- if `AT_RISK` stays above `COMPLETED`, a passport can get stuck in an
  informational warning forever and never graduate cleanly

Practical interpretation:
- once `elapsed_days >= target_days`, and there is no demotion
  recommendation on this refresh, allow `COMPLETED`
- `AT_RISK` remains informational during the monitoring window, not a
  blocker to ever closing the window

This is not a redefinition of the contract. It is my recommended code
interpretation of the clean-close behavior already described in the
source doc.

---

## 5. Suggested edit plan

### File: `src/openclaw_core/services/strategy_bank.py`

1. Replace scalar defaults with sleeve defaults map.
2. Add helper(s) to resolve defaults by sleeve with override preservation.
3. Update `confirm_promotion_from_campaign()` to seed monitoring from
   sleeve defaults.
4. Update `_refresh_paper_monitoring_state()` to:
   - resolve sleeve-aware defaults
   - compute `at_risk_threshold_pct`
   - use full `window_days` for breach streak
   - use downside-only logic for demotion
   - apply the recommended status precedence above
5. Keep decision-grade gating exactly as-is:
   - no auto-demotion from contextual fallback source

### File: `src/openclaw_core/models/strategy_bank.py`

No schema changes required.

Optional non-blocking cleanup:
- tighten field descriptions for `threshold_pct` and `window_days`
  so they explicitly say:
  - threshold is cumulative
  - window is consecutive-day breach streak

### File: `tests/openclaw_core/test_strategy_bank.py`

Update existing tests plus add the minimum missing cases below.

---

## 6. Exact pytest recommendation

Minimum test floor: keep Claude’s 9 and do not shrink it.

### Update existing tests

1. `test_strategy_bank_confirm_promotion_creates_confirming_record`
   - assert stock defaults seed as:
     - `target_days == 21`
     - `threshold_pct == 4.0`
     - `window_days == 5`

2. `test_strategy_bank_refresh_passport_v2_promotes_confirming_record_to_paper_approved`
   - keep, but make sure completion still wins when no demotion recommendation fired

3. `test_strategy_bank_refresh_passport_v2_recommends_demotion_when_tracking_breaks`
   - update fixture so breach streak proves the full 5-day rule, not the old 3-day shortcut

### Add these exact tests

4. `test_strategy_bank_confirm_promotion_applies_crypto_paper_monitoring_defaults`
   - create a crypto confirming record
   - assert `14 / 10.0 / 5`

5. `test_strategy_bank_refresh_passport_v2_marks_at_risk_on_downside_half_threshold`
   - stocks case
   - cumulative deviation crosses `-2.0%`
   - no demotion recommendation

6. `test_strategy_bank_refresh_passport_v2_marks_at_risk_on_upside_half_threshold`
   - stocks case
   - cumulative deviation crosses `+2.0%`
   - `AT_RISK`, but no demotion recommendation

7. `test_strategy_bank_refresh_passport_v2_requires_full_window_days_before_demotion`
   - 4 consecutive stock breach days at `<= -4.0%`
   - status should remain `AT_RISK`

8. `test_strategy_bank_refresh_passport_v2_recommends_demotion_after_five_stock_breach_days`
   - 5 consecutive stock breach days at `<= -4.0%`
   - `DEMOTION_RECOMMENDED`

9. `test_strategy_bank_refresh_passport_v2_recommends_demotion_after_five_crypto_breach_days`
   - 5 consecutive crypto breach days at `<= -10.0%`
   - `DEMOTION_RECOMMENDED`

10. `test_strategy_bank_refresh_passport_v2_completion_beats_at_risk_after_target_days`
   - horizon reached
   - deviation may still meet `AT_RISK`
   - no demotion recommendation
   - expect `COMPLETED` and `PAPER_APPROVED`

11. `test_strategy_bank_confirm_promotion_preserves_explicit_paper_monitoring_override`
   - inject per-passport `threshold_pct=6.0`
   - assert sleeve default is not reapplied over it

If we want to stay closer to exactly nine tests, then fold crypto defaults
into an existing crypto confirmation test and fold completion precedence
into the current approval test. But I would rather expand than compress.

---

## 7. Rollout order

Recommended sequence:

1. Land behavior + defaults in `strategy_bank.py`
2. Update/add tests
3. Run `refresh-passport-v2` from Linux
4. Pull bench data into dashboard mirror
5. Spot-check one stock passport and one crypto passport

Why:
- the thresholds only matter once runtime refresh recomputes monitoring
- dashboard work should be zero or near-zero if backend fields stay stable

---

## 8. Honest risk notes

1. Crypto paper monitoring is still less mature than stocks.
   - thresholds can be set now
   - but crypto still lacks the same sleeve-aware paper tracking depth as
     mature stock promotion flows

2. Completion precedence is the easiest place to accidentally ship the
   wrong behavior.
   - If implemented as `AT_RISK` before `COMPLETED`, the locked contract
     will not behave the way Jacob and Claude described it.

3. Options should stay deferred.
   - do not add placeholder numbers just to make the defaults dict look
     complete

---

## 9. Recommendation

This is ready to code next.

If I were implementing immediately after this note, I would:
- edit `strategy_bank.py` first
- update the three existing paper-monitoring tests
- add the five or six missing threshold tests
- only then rerun `refresh-passport-v2`

That keeps the behavior contract pinned before live runtime artifacts are
regenerated.
