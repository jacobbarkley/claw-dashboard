# Codex backend follow-up — bench sync + passport era status

**Date:** 2026-04-20  
**Author:** Codex  
**Audience:** Claude / dashboard-side integration  
**Purpose:** Close the loop on the latest backend pass so the Vires redesign can move without guessing.

---

## What shipped

### 1. Bench mirror refresh is now environment-aware

`scripts/pull-bench-data.py` now accepts path overrides through environment variables:

- `TRADING_BOT_BENCH_RESULTS`
- `TRADING_BOT_BENCH_SPECS`
- `TRADING_BOT_BENCH_MANIFESTS`
- `TRADING_BOT_REBUILD_LATEST`
- `DASHBOARD_BENCH_DATA`

This matters because Codex/Claude are sometimes working from Windows repo mirrors while the canonical artifacts live under WSL. We can now point the pull adapter at the real trading-bot artifact tree without editing the script.

### 2. Bench data mirror was refreshed from the live WSL artifact tree

The dashboard bench mirror now includes:

- `q090d_btc_managed_exposure_persistent_floor`
- current runtime `execution_manifest.json`
- refreshed `index.json`
- refreshed `latest_by_bench/*`

In plain English: the dashboard-side `data/bench/` mirror can now see the newer managed-crypto promotion instead of being stuck on older `q090c`-only bench data.

### 3. Operator-feed work from the earlier pass is still the source of truth for live sleeve surfaces

Already live from the prior backend pass:

- market-hours `push-operator-feed` cadence
- `operator.order_blotter`
- `operator.allocation_history`

So the live Trading sleeve surfaces should continue reading current operator-feed truth first; this bench sync mainly helps the deeper bench / passport / manifest surfaces stay aligned with reality.

---

## What is now available to the dashboard

### Bench / manifest sync

These should now exist in `data/bench/`:

- `data/bench/manifests/q090d_btc_managed_exposure_persistent_floor.execution_manifest.json`
- `data/bench/specs/q090d_btc_managed_exposure_persistent_floor.bench_spec.json`
- `data/bench/runs/q090d_btc_managed_exposure_persistent_floor/q090d-persistent-floor-20260419/...`
- `data/bench/runtime/execution_manifest.json`

### No required frontend changes for that sync

If Claude’s current components already read:

- `data/bench/index.json`
- `data/bench/manifests/*`
- `data/bench/runtime/execution_manifest.json`

then they should simply become more accurate after the refreshed data lands. No special-case UI patch is required just to support `q090d`.

---

## Honest status on `passport.era_results`

This is the important truth: **the dashboard adapter is ready, but the current promoted artifacts still do not fully publish per-era performance for every passport path.**

### What already works

`q090b` bench-only crypto already has real era data.

That path can legitimately populate:

- `passport.eras[].sharpe`
- `passport.eras[].ret`
- `passport.eras[].pass`

### What does **not** yet have publishable era rows

#### Stock promoted passport (`q076b`)

Current packaged stock sources provide aggregate winner metrics, but the published stock bench artifacts do **not** currently carry a full per-era matrix for the selected promoted variant.

So for now:

- keep the current placeholder / “Awaiting era data” state
- do **not** synthesize fake era Sharpe values from aggregate metrics

#### Managed crypto promoted passports (`q090c`, `q090d`)

The fixed managed-exposure comparison reports currently publish:

- full-period summary metrics
- benchmark deltas
- detailed regime reports

but **not** a clean published `era_results[]` contract for the promoted sleeve rows.

So for now:

- keep the current era placeholder state for managed-crypto passports
- do **not** derive pseudo-era stripes from full-period comparisons

---

## What Claude should do on the UI side

### Required

Nothing is required immediately for the bench sync itself.

### Recommended

Treat the current passport era stripe behavior as correct:

- show real era bars when the payload has real era values
- otherwise keep the honest placeholder / dotted baseline

### Optional polish

If Claude wants one copy improvement, the placeholder copy can become slightly more explicit:

- “Awaiting era data”
- or “Era robustness pending upstream artifact enrichment”

That is optional. No UI restructure is needed.

---

## What remains a backend follow-up

If we want promoted stock + managed-crypto passports to light up fully, the upstream trading-bot packaging layer needs to publish real per-era results into the canonical bench artifacts.

That is not a dashboard wiring problem. It is an upstream artifact-contract enrichment task.

---

## Short version

- bench mirror sync is now more reliable
- `q090d` is now visible in the dashboard bench data path
- live operator surfaces still rely on operator-feed
- promoted passport era stripes are **still honestly blocked upstream**
- Claude should keep the placeholder state where era data is absent, not fake it
