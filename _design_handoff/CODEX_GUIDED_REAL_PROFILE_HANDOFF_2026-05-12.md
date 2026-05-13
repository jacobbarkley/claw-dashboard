# Codex Handoff — Guided Real Jacob Profile

**Date:** 2026-05-12  
**Dashboard branch context:** `t10e-projection-read-store-skeleton` / PR #13  
**Backend branch context:** `codex/guided-t1e-backend` / vires-numeris PR #2  
**Backend owner:** Codex  
**Dashboard owner:** Claude

## What changed in backend

Codex added a real-account Guided projection materializer in
`vires-numeris`:

```bash
cd /home/jacobbarkley/.openclaw/workspace/trading-bot
PYTHONPATH=src .venv-rebuild/bin/python3 -m openclaw_core.cli.guided materialize-jacob-paper-profile
```

It reads the current rebuild artifacts:

- `state/rebuild_latest/broker_snapshot.json`
- `state/rebuild_latest/position_book.json`
- `state/rebuild_latest/active_strategy.json`

It writes a Guided read projection for Jacob's existing paper account:

- scope: `jacob / paper_main / default`
- email identity: `jacobbarkley95@gmail.com`
- proposal id: `proposal_jacob_paper_main_migration`
- enrollment id: `enrollment_jacob_paper_main_active`
- backing record id: `regime_aware_momentum::stop_5_target_15`
- disclosure state: `NOTICE_PENDING`

This is intentionally not the smoke fixture
`enrollment_entry_zero_active`. The old seed id remains only as a
preview/mock smoke artifact.

## Current real projection contents

At the time of materialization from local rebuild artifacts:

- portfolio value: `85833.88`
- cash: `29237.67`
- strategy holdings:
  - `AAPL` — `STRATEGY_POSITION`
  - `AVGO` — `STRATEGY_POSITION`
  - `NVDA` — `STRATEGY_POSITION`
- cash reserve:
  - `SGOV` — `CASH_RESERVE`
- same-paper-account but not Guided-managed:
  - `BTCUSD` — `OTHER`

The `OTHER` holding is deliberate: Guided T1.0e is a STOCKS enrollment,
but Jacob asked to see what the Alpaca paper account is actually doing.
The projection can show BTCUSD as account context without implying that
Steady Tide manages crypto.

## Dashboard implications

PR #13 can keep its projection transport shape. The backend endpoint is
still:

```text
GET /guided/v1/projections/enrollment-views/<enrollment_id>
```

For the cutover UI, switch active readback away from the Phase 6.2 seed
constant:

```ts
const PHASE_6_2_ACTIVE_ENROLLMENT_ID = "enrollment_entry_zero_active"
```

to the real internal profile id:

```ts
const JACOB_REAL_ACTIVE_ENROLLMENT_ID = "enrollment_jacob_paper_main_active"
```

Longer term, do not make this a permanent hardcoded route contract.
Jacob's request is to use the magic-link account as the primary entry
point into his trading profile. The dashboard should grow a normal Vires
hub path that resolves "my active Guided enrollment" for the signed-in
scope instead of requiring `/vires/guided/preview/active` URL surgery.

## UX notes

- `disclosure_state: "NOTICE_PENDING"` is expected for the migrated
  account. It means the account was internally linked from existing
  paper runtime state; it does not mean Jacob clicked a fresh production
  enrollment/disclosure flow in the new UI.
- `enrollment.status: "ACTIVE"` is also expected. The paper account is
  already active in the rebuild runtime, so Guided readback should show
  the real state rather than forcing a fake cold start.
- If the active surface currently filters holdings to
  `STRATEGY_POSITION` and `CASH_RESERVE`, BTCUSD may not appear. That is
  acceptable for the first cutover, but the next account-profile UI pass
  should include an "other account positions" treatment so Jacob can
  inspect the full Alpaca paper context.
- Avoid `MockFallbackBadge` on production once `CODEX_PROJECTION_BASE_URL`
  is set. Missing real enrollment should render an honest empty state,
  not a mock fallback.

## Contract drifts still queued for cutover

- Add or split projection error codes so
  `PROJECTION_NOT_FOUND` and `UNKNOWN_PROJECTION` are decoded explicitly
  in the dashboard.
- Enforce `X-Request-ID` echo parity on projection 2xx responses. The
  backend now echoes it.
- Rotate the production HS256 secret before setting production
  `CODEX_PROJECTION_BASE_URL`. The prior smoke secret was throwaway.

## Verification already run by Codex

```bash
PYTHONPATH=src .venv-rebuild/bin/python3 -m pytest -s \
  tests/openclaw_core/test_guided_real_profile.py \
  tests/openclaw_core/test_guided_command_service.py::test_guided_http_projection_adapter_reads_scoped_private_projection \
  --tb=short
```

Result: `4 passed`.

Codex also validated the materialized local projection through the shared
projection payload validator:

```text
guided_enrollment_view.v1 enrollment_jacob_paper_main_active 5 85833.88
```
