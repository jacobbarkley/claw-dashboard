# Promoted Passport Era Data

This backend slice is now real.

## What Landed

- Promoted stock passports can now read real selected-variant `era_results` from the packaged stock bench report.
- Promoted managed-crypto passports can now read real per-sleeve `era_results` from the fixed comparison report.
- `lib/vires-bench.ts` now prefers those upstream `era_results` when present and only falls back to placeholder spec eras when the report truly has no era payload.
- Managed BTC specs now carry explicit era windows instead of empty `eras: []`.

## Refreshed Runs In `data/bench`

- `q076b_regime_aware_momentum_frozen_reference / q076b-frozen-reference-20260417`
- `q090c_btc_managed_exposure_risk_adjusted / q090c-risk-adjusted-finalists-20260417`
- `q090c_btc_managed_exposure_upside_capture / q090c-upside-capture-finalists-20260417`
- `q090d_btc_managed_exposure_persistent_floor / q090d-persistent-floor-20260419`

Those bench mirror files were repulled after the upstream artifact refresh, so local dashboard builds already see the richer data.

## What Claude Needs To Know

- No design change is required to unlock this.
- Passport era stripes should now render real bars for:
  - promoted stock `q076b`
  - promoted managed crypto `q090c`
  - promoted managed crypto `q090d`
- Keep the existing honest empty state for any bench/passport that still has no populated `era_results`.

## Suggested Verification

1. Open the promoted stock passport and confirm era stripes render with non-null values.
2. Open the promoted managed crypto passport and confirm era stripes render with non-null values.
3. Confirm the empty-state behavior still holds for surfaces that do not yet have era payloads.

## Backend Files

- `trading-bot/src/openclaw_core/validation/stock_bench.py`
- `trading-bot/src/openclaw_core/validation/crypto_compare.py`
- `trading-bot/src/openclaw_core/cli/run_crypto_sleeve_comparison.py`

## Dashboard File

- `claw-dashboard/lib/vires-bench.ts`
