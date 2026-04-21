## Crypto Era Verdicts

This slice is now wired upstream and mirrored into the dashboard bench data.

### What changed

- Managed crypto comparison eras now carry explicit:
  - `verdict`
  - `verdict_reason`
  - `evaluated_trading_days`
- Dashboard loader now reads those fields for:
  - promoted managed crypto passports (`q090c`, `q090d`)
  - bench-only crypto passports and run-detail candidate eras when present

### Current visible effect

- `q090c` and `q090d` passports no longer rely on the old `sharpe >= 0.5` heuristic for era confidence.
- Era bars now use real upstream verdicts:
  - `PASS`
  - `FAIL`
  - `INCONCLUSIVE`
- Existing `INCONCLUSIVE` UI treatment that Claude already shipped will apply automatically.

### Important semantic choice

For **managed crypto comparison eras**, verdicts are based on:

1. era duration long enough to be decision-grade
2. benchmark-relative outcome versus BTC HODL

That means these eras are **not** using the stock campaign's `minimum_trade_count = 30` rule directly, because slow BTC managed-exposure sleeves can hold meaningful exposure for long periods with few or even zero rebalance trades.

For **bench-only crypto tactical eras**, the upstream model is stricter:

- short era windows -> `INCONCLUSIVE`
- too few completed trades -> `INCONCLUSIVE`
- enough sample but weak benchmark-relative outcome -> `FAIL`
- enough sample and positive benchmark-relative proof -> `PASS`

### No design rework needed

Claude does **not** need to redesign anything for this slice.

The current passport / EraStripe surface should just consume the refreshed bench data.

### One honest caveat

This change backfills the promoted managed crypto artifacts that are already mirrored (`q090c`, `q090d`).

Older historical `q090b` bench runs were **not** mass-regenerated in this slice, so some older bench-only crypto runs may still fall back to the loader heuristic until they are rerun or backfilled later.
