# DATA_PRIMER — Crypto sleeve · Tracked Assets

**Package:** `2026-04-19_crypto_tracked_assets/`
**Scope:** The Tracked Assets card on the Crypto sleeve. Single row today (BTCUSD); architecture allows for more symbols later.
**Feed reference:** `_reference/operator-feed.json` snapshot, `contract_version: 1`, `generated_at: 2026-04-19T21:55:59Z`.
**Principle this card upholds** (from `DIVERGENCE_LOG.md` seed entry): Tracked Assets is **market intent** — "what is the strategy about to do for the assets we care about." It is NOT a positions readout. Holding qty / market value / unrealized P&L live in the Open Positions card, not here.

---

## Data sources referenced by this card

Three feed sections feed this surface. No other sections read.

| Source section | Role | Read-only flag |
|---|---|---|
| `operator.crypto_signals.tracked_assets[]` | Canonical list of assets the crypto sleeve tracks (symbol, lane, tier state, target exposure, dry-run flag). Authoritative for "which symbols go here." | ✓ |
| `operator.crypto_signals.managed_exposure` | Strategy state for the **promoted** BTC Managed Exposure lane — current tier, full ladder, action intent, exposure %. Shared across all CORE-lane rows. | ✓ |
| `operator.crypto_signals.tsmom` | Strategy state for the **research-only** tactical 4H overlay — direction, signal strength, last cross. Currently all nulls (RESEARCH_ONLY). Shared across all rows that reference tactical overlay. | ✓ |
| `positions[]` (filtered by symbol) | Used **only** for `current_price` per tracked symbol. Holding-side fields on this object (qty, market_value, unrealized_pnl, change_today_pct) are **NOT read** by this card. | ✓ (one field only) |

---

## Card header

| Element | Source field | Semantic | Format |
|---|---|---|---|
| Card title copy "Tracked Assets" | *static* | n/a | Static string |
| Sleeve-scope regime chip | `operator.regime.vix_regime` + `operator.regime.hmm_regime` + `operator.regime.vix_level` | The broader-market regime context the crypto strategy is operating inside. Rendered so operators read the tier state against the backdrop, not in isolation. Codex confirmed for v1 inclusion. | Two-label chip, primary line `VIX 16.88 · Medium` (level + label), secondary line `HMM Calm`. Title-case the enums for display. |

---

## Per-row fields (BTC row)

The row represents one entry in `operator.crypto_signals.tracked_assets[]`. For v1 the array has a single entry (BTCUSD). The primer spec scales to N rows.

### Identity + market

| Element | Source field | Semantic | Format |
|---|---|---|---|
| Asset symbol | `operator.crypto_signals.tracked_assets[i].symbol` | The symbol this row represents. | Uppercase, e.g. `BTCUSD`. Strip `USD` suffix for display glyph optional — v1 renders full. |
| Lane label | `operator.crypto_signals.tracked_assets[i].lane` | Which strategy lane this asset belongs to inside the crypto sleeve. Today only `CORE` exists. | Title-case pill: `Core` |
| Market price | `positions[j].current_price` where `positions[j].symbol === tracked_assets[i].symbol` | Last seen market price for the asset. Uses the positions-side field because `tracked_assets[]` does not carry a price today. | Currency, precision scales to price magnitude. BTC: `$74,864.62` (2 decimals). Format must handle small-value assets later (e.g. `$0.0000412`). |
| Intraday change | `positions[j].change_today_pct` | % change since prior close, for the asset itself (not the portfolio). | Signed percent, 2 decimals. Green for positive, red for negative, muted zero. e.g. `−1.09%`. |

### Strategy state (the "market intent" payload — this is what replaces positions duplication)

| Element | Source field | Semantic | Format |
|---|---|---|---|
| Current tier state | `operator.crypto_signals.tracked_assets[i].state` *(row-scoped read for extensibility; contract guarantees parity with `operator.crypto_signals.managed_exposure.current_state`, which is the lane-level source)* | Which regime tier the strategy has the asset in **right now**. Three values: `RISK_ON` / `ACCUMULATE` / `RISK_OFF`. In a healthy feed the row value equals the lane value; if they ever differ, treat the row data as stale and fall back to `managed_exposure.current_state`. | State badge. Styling token per state — RISK_ON green, ACCUMULATE amber, RISK_OFF red/muted. Label as `Risk On` / `Accumulate` / `Risk Off`. |
| Current tier label | `operator.crypto_signals.tracked_assets[i].tier_label` | Human-readable tier name. `"Tier 1"` / `"Tier 2"` / `"Tier 3"`. Pair with state for legibility (`Tier 3 · Risk Off`). | Plain string, kept close to the state badge. |
| Target exposure at current tier | `operator.crypto_signals.tracked_assets[i].target_exposure_pct` | The % of the crypto sleeve the strategy wants deployed into this asset given the current tier. v1 sample: `0.0` (RISK_OFF). | Percent, 0 decimals. e.g. `0%`, `70%`, `80%`. |
| Tier ladder (all three tiers) | `operator.crypto_signals.managed_exposure.ladder[]` — for each ladder item render `label`, `state`, `exposure_pct`, `note`, `active` | The full regime → exposure mapping. Operators read this to see *where we are and what's above/below us*. Replaces the "distance to trigger" framing: the ladder shows the structure directly. | Three-row mini-ladder. Active tier highlighted (`active === true`). Each row: `Tier N · <state label> · <exposure_pct>%` with `note` as secondary text. |
| Strategy action intent | `operator.crypto_signals.managed_exposure.action` | What the strategy is about to do at the next rebalance. `BUY` / `SELL` / `HOLD`. | Action pill. v1 copy: `Next: Buy` / `Next: Sell` / `Next: Hold`. Icon optional. |
| Target notional at action | `operator.crypto_signals.managed_exposure.target_notional_usd` | The strategy's notional dollar target for the active tier. Denominator semantics (sleeve-relative vs. equity-relative) are not asserted by the producer — see open question #2 in NOTES.md. v1 copy stays agnostic. | Currency, 0 decimals. e.g. `$855`. Pair with neutral framing — no `of X%` subtext until denominator is confirmed. |
| Execution flag | `operator.crypto_signals.tracked_assets[i].status` (cross-reference `operator.crypto_signals.managed_exposure.last_report_status`) | Whether this is live paper, dry-run, or other execution mode. v1 value: `DRY_RUN`. | Muted micro-label on the row, e.g. `Dry run`. Suppress when `LIVE` (no label needed — absence of flag = live). |

### Tactical overlay (research-only right now — renders as empty state)

| Element | Source field | Semantic | Format |
|---|---|---|---|
| Overlay status | `operator.crypto_signals.tsmom.status` | Whether the tactical overlay is promoted or research-only. v1 value: `RESEARCH_ONLY`. | Status pill when non-PROMOTED. Copy: `Tactical overlay — research only`. |
| Overlay direction | `operator.crypto_signals.tsmom.direction` | When promoted: `LONG` / `FLAT`. When research-only: `null`. | Hidden when null. Populated UI deferred to when overlay promotes. |
| Overlay signal strength | `operator.crypto_signals.tsmom.signal_strength_pct` | When promoted: numeric strength of current tactical cross. v1 value: `null`. | Hidden when null. |
| Overlay last cross | `operator.crypto_signals.tsmom.last_cross_at` | When promoted: timestamp of most recent direction change. v1 value: `null`. | Hidden when null. |
| Overlay explanatory note | `operator.crypto_signals.tsmom.note` | Human-readable reason the overlay isn't live. v1 value: *"The 4H tactical overlay remains bench-only until a dedicated 4H execution manifest is promoted."* | Secondary text inside the overlay empty-state block. Verbatim. |

**This overlay sub-block is the key empty-state test for the package.** Full DEGRADATION spec lives in `DEGRADATION.md`; detection rule proposed there is `tsmom.status === "RESEARCH_ONLY"` + null direction/strength, pending Code's confirmation of the failure-mode signal.

---

## Does NOT read (explicit non-fields)

Calling these out because they are the most likely accidental reads given the divergence-log seed entry. **None of the following may enter this card.**

| Field | Why it must not appear here | Where it lives instead |
|---|---|---|
| `positions[j].qty` | User holding quantity. Reading this reproduces the exact drift `DIVERGENCE_LOG.md` 2026-04-19 closed. | Open Positions card. |
| `positions[j].market_value` | User holding market value. Same drift risk. | Open Positions card. |
| `positions[j].unrealized_pnl` / `unrealized_pct` | User P&L. Tracked Assets is market-intent, not performance. | Open Positions card. |
| `positions[j].entry_price` | User cost basis. Strictly positions-side. | Open Positions card. |
| `operator.crypto_signals.tracked_assets[i].market_value` | **Present on the feed but holding-side.** Do not route. The field existing on `tracked_assets[]` is a feed-shape coincidence; it describes the user's holding of the tracked asset, not the asset itself. | Open Positions card. |
| `operator.crypto_signals.tracked_assets[i].qty` | Same as above — present, holding-side, do not route. | Open Positions card. |
| `account.crypto_deployed` | Account-level aggregate. Wrong scope for a per-asset row. | Portfolio / account summary surface. |
| `account.equity` / `total_pnl` / any other `account.*` | Account-level. Not per-asset. | Portfolio / account summary surface. |
| `kpis.*` | Trade-outcome metrics, all trades. Not per-asset. | KPIs / performance surface. |

---

## Dependencies & open questions

*Full list in `NOTES.md` — summarized here for primer review:*

1. **Market price for unowned tracked assets.** When the tracked universe expands beyond BTCUSD to symbols we don't currently hold, `positions[]` won't carry those rows, and `tracked_assets[]` has no `current_price`. Not a v1 blocker (only BTC today, and it is held), but a future contract addition is needed. Logged under "Future contract additions" in `NOTES.md`.
2. **`tracked_assets[]` is currently derived from crypto positions** — Codex confirmed via the producer source. Today `tracked_assets[]` is literally `[item for item in positions if asset_type == 'CRYPTO']`, which means "what we track" is definitionally "what we hold." This is the structural root of the original BTC drift. Path A works around it cleanly with the framing we chose, but for a true watchlist (assets the strategy may allocate to but doesn't yet hold) the producer needs a separate source. Compounds with the unowned-asset price gap above. Flagged in `NOTES.md` → Backend contract dependencies.
3. **`target_notional_usd` denominator.** Codex confirmed the producer passes this through from `crypto_execution_plan.target_notional_usd` and does not assert whether the figure is sleeve-relative or equity-relative. v1 copy stays agnostic ("notional dollar target for the active tier"). Open question routed to Codex in `NOTES.md` → Open questions. On confirmation, primer amended in v2 with the precise framing.
4. **Overlay detection rule — confirmed.** `tsmom.status === "RESEARCH_ONLY"` is the canonical check for the research-only empty state. Codex confirmed this aligns with how Code will key off the same field, and is more precise than `promoted === false` for future paused / deprecated states. Tracked in `DEGRADATION.md`.
5. **Tier-state cross-reference — confirmed.** `managed_exposure.current_state` is the lane-level source; `tracked_assets[i].state` is a row-mirror. Primer reads row-scoped for forward extensibility; if they ever diverge in production, treat the row value as stale and fall back to the lane value. Divergence would be a producer bug, not a UI disambiguation problem.

---

*Primer for Code/Codex review before Design commits pixels. Field paths above are the contract for this package.*
