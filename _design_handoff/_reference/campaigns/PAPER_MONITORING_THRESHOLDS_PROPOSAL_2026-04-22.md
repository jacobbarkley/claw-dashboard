# Paper Monitoring — per-sleeve threshold proposal (2026-04-22)

**Purpose.** Closes the final Passport v2 §12 item. Codex paused before
hard-coding threshold values because they directly govern demotion
sensitivity; this doc is a starting proposal for Jacob to review, edit,
or swap entirely. Final numbers become defaults in `strategy_bank.py`,
per-passport override stays available for one-off tuning.

Relevant contract (from spec §5):

```jsonc
"tracking": {
  "tracking_deviation_pct": 0.12,
  "threshold_pct":          0.50,
  "window_days":            5
}
```

The trigger logic is: `tracking_deviation_pct` exceeds `threshold_pct`
for `window_days` consecutive measurement days → `DEMOTION_RECOMMENDED`.

---

## Before the numbers — one open question for Codex

`tracking_deviation_pct` is described as "realized-vs-modeled return
divergence." The proposal below assumes this is **cumulative over the
window**, not a single-day value. (Single-day deviation for a stock
sleeve with ~1% daily vol would trip any threshold ≤ 1% routinely on
noise alone.) If Codex's implementation is single-day, the threshold
values below need to be divided by roughly √window_days.

Quick one-line confirm before coding, please.

---

## Proposal

| Sleeve   | threshold_pct | window_days | direction  | rationale                                                                 |
|----------|--------------:|------------:|------------|---------------------------------------------------------------------------|
| Stocks   |          4.0% |          21 | asymmetric | momentum strat, 21 trading days ≈ 1 month, ~30% of natural 1σ drift band  |
| Crypto   |         10.0% |          14 | asymmetric | BTC daily vol ~4%, 14-day cumulative ~15% 1σ, catch structural breakdown  |
| Options  |           TBD |         TBD | TBD        | no paper slot active yet; defer until options goes live                   |

**Direction: asymmetric.** Only demote when *actual < modeled*. A
strategy that's over-performing its backtest isn't structurally broken —
it may just be catching a favorable regime the backtest underweighted.
The AT_RISK informational state (earlier in the status enum) can fire
symmetrically for "something's diverging in either direction, eyeball
it," but the demotion gate fires only on the downside.

### Why these specific numbers

**Stocks — threshold 4%, window 21:**
- Stock sleeve ≈ 6 names, daily vol ~1%, 21-day 1σ ≈ √21 × 1% ≈ 4.6%.
- A 4% *downside* cumulative gap over 21 days means the strategy is
  underperforming its backtest by roughly 1σ of its own natural drift —
  not yet alarming on its own, but combined with the sustained
  requirement (it has to stay below for the full window) it's a signal
  of structural drift rather than a drawdown.
- 21 days is roughly one trading month — long enough to ride out a
  single bad week, short enough that a real regime shift gets flagged
  inside a quarter.

**Crypto — threshold 10%, window 14:**
- BTC daily vol ~3-5% depending on regime. 14-day 1σ ≈ 14%.
- 10% downside deviation over 14 days is ~0.7σ of natural drift —
  slightly more permissive on absolute terms than stocks (harder to
  distinguish signal from noise in crypto) but stricter proportionally.
- 14 days is the typical timeframe over which BTC regime flips show up
  in our 4H tactical overlay; if the strategy is structurally wrong,
  it'll be visible in that window.

**Options — TBD.**
- Options P&L is gamma- and theta-dominated in ways the simple
  return-divergence metric doesn't capture well. Revisit when the first
  options strategy hits paper.

### What this means in practice

- Stock strategy is 2% behind its backtest after 21 days → AT_RISK
  flag, no action required. 4% behind → DEMOTION_RECOMMENDED, operator
  confirms (or overrides) in the passport UI.
- Crypto strategy is 7% behind after 14 days → AT_RISK. 10% behind →
  DEMOTION_RECOMMENDED.
- Neither direction fires on "I'm ahead of the backtest."

---

## Open questions for Jacob

1. **Window length.** 21 days for stocks, 14 for crypto feel right to
   me but you've watched more of these runs. Faster? Slower?
2. **Asymmetric demotion.** Fine as proposed, or do you want the
   demotion gate to fire both-directions (e.g., massive upside
   divergence is suspicious too)?
3. **AT_RISK threshold.** Proposal is implicit: AT_RISK = deviation is
   half of the demotion threshold (i.e., 2% for stocks, 5% for crypto).
   Or do you want a separate configurable second tier?
4. **Operator override.** The contract allows `threshold_pct` to be
   per-passport. Do you want a UI affordance to tune it on a single
   passport, or is sleeve-default-only enough for v1?

---

## After alignment — Codex's implementation checklist

1. Add sleeve-keyed defaults to `strategy_bank.py` (something like
   `PAPER_MONITORING_DEFAULTS = {"stocks": {...}, "crypto": {...}}`).
2. Populate passport `tracking.threshold_pct` + `tracking.window_days`
   from the sleeve default on passport creation; keep per-passport
   override path.
3. If `tracking_deviation_pct` is currently single-day, decide whether
   to add a cumulative computation OR divide the thresholds above. The
   proposal assumes cumulative.
4. Regression test: passport in `CONFIRMING` stage for a sleeve with
   known thresholds emits `AT_RISK` at 50%-of-threshold and
   `DEMOTION_RECOMMENDED` at 100% sustained.

---

**This doc is a draft for Jacob to edit. Nothing lands in `strategy_bank.py`
until these numbers are confirmed.**
