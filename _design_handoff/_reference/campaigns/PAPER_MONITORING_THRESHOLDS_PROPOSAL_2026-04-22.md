# Paper Monitoring — per-sleeve threshold proposal (2026-04-22, v2)

**Purpose.** Closes the final Passport v2 §12 item. Locks the behavior
contract + starting values for per-sleeve paper-monitoring demotion.

**History.** v1 of this doc (by Claude) conflated two different time
dimensions. Codex's review cleared that up against the actual code in
`strategy_bank.py`. This version reflects the three-way agreement.

---

## Contract (confirmed against code)

```jsonc
"paper_monitoring": {
  "window": {
    "target_days":   21,   // total monitoring horizon — how long the
                           // CONFIRMING stage runs before clean close
    "elapsed_days":  4,
    "remaining_days": 17
  },
  "tracking": {
    "tracking_deviation_pct": 0.12,  // CUMULATIVE since monitoring start
                                     // (confirmed at strategy_bank.py:1721)
    "threshold_pct":          4.00,  // demotion trigger
    "window_days":            5      // breach-streak window — consecutive
                                     // days at-or-above threshold to raise
                                     // DEMOTION_RECOMMENDED
  }
}
```

**Two distinct time dimensions. Don't collapse them:**

- `window.target_days` — total monitoring horizon. A clean close at
  `elapsed_days ≥ target_days` with no threshold trips → stage transitions
  to `PAPER_APPROVED`.
- `tracking.window_days` — breach-streak gate. Number of consecutive days
  the cumulative deviation must sit at-or-worse-than threshold before the
  recommendation fires. Shorter than `target_days` on purpose: once a
  structural breakdown starts, you want to react within a week, not wait
  another full monitoring horizon.

---

## Locked values (v1)

| Sleeve   | target_days | threshold_pct | window_days | direction  |
|----------|------------:|--------------:|------------:|------------|
| Stocks   |          21 |          4.0% |           5 | asymmetric |
| Crypto   |          14 |         10.0% |           5 | asymmetric |
| Options  |         TBD |           TBD |         TBD | TBD        |

### Rationale per axis

**target_days — total monitoring horizon.**
- Stocks: 21 trading days ≈ one trading month. Long enough for a single
  bad week to average out; short enough that a real regime shift gets
  flagged inside a quarter.
- Crypto: 14 calendar days. BTC regime flips cycle faster than stocks;
  14 days is typical for the 4H tactical overlay to register a shift.

**threshold_pct — cumulative deviation trigger.**
- Stocks: 4%. Daily vol ~1%, natural 1σ drift over 21 days ≈ 4.6%.
  A sustained 4% underperformance across the horizon is roughly 1σ of
  the sleeve's own drift — a credible structural signal.
- Crypto: 10%. BTC daily vol ~3–5%, 14-day 1σ drift ≈ 14%. 10% is ~0.7σ
  — slightly more permissive in absolute terms (crypto is noisier), but
  still strict enough that "down 10% of cumulative backtest-modeled
  return" is a meaningful departure, not noise.

**window_days — breach-streak gate.**
- 5 days for both sleeves. Cumulative deviation can oscillate above and
  below the threshold in single days; requiring 5 consecutive reinforces
  the "sustained" half of "sustained structural underperformance" before
  the operator sees a DEMOTION_RECOMMENDED chip.
- 5 is a balance: short enough to react within a week of a real breakdown,
  long enough to filter single-day market shock days.

**direction — asymmetric.**
- Only demote when `tracking_deviation_pct ≤ -threshold_pct` (actual
  cumulative return is worse than modeled by ≥ threshold). Over-performance
  is not a demotion signal — it may just be a favorable regime the
  backtest underweighted.

**AT_RISK — implicit half-threshold (not a separate knob).**
- `AT_RISK` fires when cumulative deviation crosses 50% of `threshold_pct`
  (2% for stocks, 5% for crypto), without a streak requirement.
- No separate configurable tier in v1. Avoids config sprawl. Operator
  reads the chip as "eyeball this, not time to act yet."

**per-passport override — backend-only in v1.**
- Contract already supports per-passport `threshold_pct` / `window_days`.
- UI to edit them stays hidden until we've watched the sleeve-default
  behavior in production and know whether per-passport tuning earns its
  complexity. Backend path preserved so v2 can expose it without a
  contract change.

---

## Behavior contract changes required (Codex's honest flag)

The current code doesn't match this spec text yet. Before plugging values
in, the behavior itself needs to be coded:

1. **`tracking.window_days` as a streak gate, not a general window.**
   Current code fires `DEMOTION_RECOMMENDED` after a short streak of
   breaches. That's already directionally right; confirm that streak
   length is read from `tracking.window_days` (not hardcoded) and that
   the semantics are "N consecutive measurement days at-or-above
   threshold," not "any breach in last N days."
2. **`AT_RISK` at half-threshold.**
   Current code uses the same threshold for AT_RISK and DEMOTION. Change
   AT_RISK to fire at `abs(tracking_deviation_pct) >= threshold_pct / 2`
   without a streak requirement. DEMOTION stays at full threshold + streak.
3. **Asymmetric demotion.**
   Demotion fires only when `tracking_deviation_pct <= -threshold_pct`
   (not `abs(...)`). AT_RISK stays symmetric (either direction triggers
   the "eyeball this" chip).
4. **Per-sleeve defaults.**
   Add `PAPER_MONITORING_DEFAULTS` (or similar) keyed by sleeve. New
   passports pull `target_days` / `threshold_pct` / `window_days` from
   sleeve defaults at creation. Per-passport override path preserved.

---

## Test cases to pin before shipping

1. Stocks passport, 21-day horizon, cumulative deviation -1.8% sustained
   → status stays `ACTIVE`.
2. Stocks passport, cumulative deviation -2.2% for 1 day → status flips
   to `AT_RISK` (half-threshold crossed, no streak required).
3. Stocks passport, cumulative deviation -4.1% for 4 consecutive days
   → status stays `AT_RISK` (streak insufficient).
4. Stocks passport, cumulative deviation -4.1% for 5 consecutive days
   → `recommendation.status = DEMOTION_RECOMMENDED`.
5. Stocks passport, cumulative deviation **+4.5%** for 5 consecutive days
   → status flips to `AT_RISK` (symmetric half-threshold), but
   `recommendation.status` stays null (asymmetric demotion).
6. Stocks passport reaches `elapsed_days >= target_days` with no
   DEMOTION_RECOMMENDED trip → `status = COMPLETED`, stage transitions
   to `PAPER_APPROVED`.
7. Crypto variant of test 4 with -10.1% × 5 days → `DEMOTION_RECOMMENDED`.
8. Defaults test: new stocks passport picks up `target_days=21,
   threshold_pct=4.0, window_days=5` from sleeve defaults; crypto picks
   up `target_days=14, threshold_pct=10.0, window_days=5`.
9. Override test: passport with explicit `threshold_pct=6.0` overrides
   the sleeve default while keeping everything else from the default.

---

## Options — deferred

No paper slot active for options. Revisit when the first options
strategy hits paper. Options P&L is gamma- and theta-dominated in ways
the simple return-divergence metric doesn't capture well, so the thresholds
here likely won't map cleanly.

---

**Status:** behavior contract + values locked between Jacob + Codex +
Claude on 2026-04-22. Codex to implement next against the 4 contract
changes + 9 test cases above.
