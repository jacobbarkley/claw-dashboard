# NOTES — Crypto sleeve · Tracked Assets

**Package:** `2026-04-19_crypto_tracked_assets/`
**Version:** v1 (no preceding package)

---

## Intent

The Tracked Assets card is the crypto sleeve's **market-intent surface**: it answers the operator's question "what is the strategy about to do for the assets we care about?" This is the first package to address the drift captured in `DIVERGENCE_LOG.md` 2026-04-19, where the original implementation conflated Tracked Assets with the user's holdings. The fix is structural, not cosmetic — the card now surfaces tier state, the full exposure ladder, and the pending action, with strict separation from holding-side fields (which live in Open Positions).

The design follows **Path A** (confirmed with Codex in primer review): ladder + current tier + action is a richer answer to "what is the strategy doing" than a single "distance to next trigger" number would be, and requires no new operator feed fields.

---

## Open questions for Code / Codex

1. **`target_notional_usd` denominator.** Codex confirmed in primer review that the producer passes this through without asserting whether the figure is sleeve-relative or equity-relative. v1 prototype uses agnostic copy ("target notional for the active tier"). **Question for Codex:** please confirm sizing semantics so v2 can amend the primer with precise framing. This is the only item blocking a clean v2 copy revision; ship v1 without it.

2. **Action verb enum.** Feed snapshot shows `managed_exposure.action` values `BUY`, `SELL`. Prototype State 2 renders a `HOLD` variant (target reached, no action needed). **Question for Code:** is `HOLD` a real value on this enum, or does the strategy surface a null action instead when no rebalance is needed? If `HOLD` is not possible, I'll rework State 2's action row to either omit the action (→ degradation path) or render `—`.

3. **Ladder read direction.** Prototype renders Tier 1 → Tier 2 → Tier 3 left-to-right (risk-on on the left, risk-off on the right). If operators read tier ladders the other way in other parts of the dashboard, flag and I'll flip.

4. **`tsmom.status === "RESEARCH_ONLY"` detection rule.** Confirmed in primer review. Reconfirm at implementation time that the field value is exactly the string `"RESEARCH_ONLY"` (not case variants) and stable. Fallback if ever nulled: treat overlay as absent entirely (see `DEGRADATION.md`).

5. **Regime chip source consistency.** Chip reads `operator.regime.vix_level`, `operator.regime.vix_regime`, `operator.regime.hmm_regime`. If another surface in the dashboard reads the same regime object and formats differently, flag so we can standardize treatment across the app (title-cased enum, VIX level with 2-decimal precision).

---

## Backend contract dependencies

Fields needed from Codex that are not on the current feed. None are v1 blockers; listed here so they compound correctly when the next surface needs them.

### Future contract additions (non-blocking for v1)

1. **`operator.crypto_signals.tracked_assets[i].current_price`** (or equivalent).
   **Why needed:** When crypto tracking expands beyond BTCUSD to symbols the user doesn't hold, `positions[]` won't carry their prices. Today, `tracked_assets[]` is derived from crypto positions (Codex confirmed this from `scripts/push-operator-feed.py:489` — `[item for item in positions if item.get('asset_type') == 'CRYPTO']`), which means "what we track" is definitionally "what we hold." That's the structural root of the original BTC drift, and it forecloses a true watchlist.
   **Proposed shape:** Each entry in `tracked_assets[]` gains a `current_price` field sourced from the same market-data pipeline that populates `strategy_universe[i].current_price`.
   **Gate for UI ship:** Prototype State 7 (`—` em-dash for the price slot) is designed for this state but is not shipped until the field lands. Until then, the card renders only held tracked assets (v1 behavior is correct).

2. **Separate source for `tracked_assets[]`** (producer refactor).
   **Why needed:** Same root cause as above, treated architecturally. Today the watchlist can't contain anything the strategy isn't already holding.
   **Proposed shape:** Producer synthesizes `tracked_assets[]` from the strategy's *allowed universe* (`managed_exposure.strategy_parameters` or equivalent), not from `positions`. Existing holding fields (`market_value`, `qty`) become optional per entry and are only populated when `symbol` also appears in `positions`.
   **Coupled with:** Field addition #1. Ship together.

3. **`managed_exposure.distance_to_next_tier_pct`** (optional — Path B fallback).
   **Why this is optional:** Path A (ladder + current tier + action) resolves the market-intent question without this field. Adding a numeric distance-to-trigger would enrich, not replace, the ladder. Deferred pending operator demand; not in scope for v1.

### Non-dependencies (flagging to prevent invention)

- Anything positions-shaped on `tracked_assets[]` is intentionally not read by this card. Do not add holding-side fields to the contract on this card's behalf — if positions-side fields are needed somewhere, they belong on the Open Positions card and come from `positions[]`.

---

## Deferrals (explicitly out of scope for this package)

- **Populated tactical overlay UI.** When `tsmom.status === "PROMOTED"`, the overlay block needs a different visual — direction, signal strength, last cross. Specced in a future package when promotion lands.
- **Retry button on error state.** v1 error state is read-only; reload is the recovery path. A retry-capable error row is v2 scope.
- **Multi-asset rows.** v1 only renders 1-N rows with uniform shape — today there's only BTCUSD. Crypto universe expansion (ETH, etc.) triggers the contract-addition dependencies above; until then, the rendering code is architected for N rows but only exercises one.
- **Stale feed treatment.** Design hasn't specced a "stale" state. If Code reports a stale signal in the `## Failure modes` reply, we spec it in v2.
- **Inline interactions on the ladder.** No hover tooltips on inactive rungs, no click-to-view-evidence. The ladder is an information surface, not a control.
- **Regime chip interactivity.** v1 chip is static. If operators want it to link to a regime detail surface, spec in a future package.

---

## Divergence log housekeeping (at ship time)

Per protocol review exchange 2026-04-19: amend the existing BTC divergence-log entry's **Resolution** line at ship time to reflect that the reshape took the interpretive route (Path A — ladder + action + tier framing), **not** the literal "distance to trigger" framing originally suggested. The log doing its job — closing the loop on what actually shipped versus what was proposed. Codex is aware; I'll append the Resolution line via divergence-log update after the commit SHA is available.

---

## Package contents summary

| File | Purpose |
|---|---|
| `prototype/index.html` | Ground-truth artifact. All 7 states render on one scrollable canvas. |
| `DATA_PRIMER.md` | Field-level data contract per element. Codex signed off on field paths before prototype commit. |
| `UX_CHECKLIST.md` | Line-item parity check. "Shows" + "Does NOT show" columns for every element, every state. |
| `DEGRADATION.md` | UX intent per empty / loading / error / per-field null case. Includes "failure modes for Code to confirm" subsection per protocol. |
| `NOTES.md` | This file. Intent, open questions, dependencies, deferrals. |

---

*End of package. Ready for Code review.*
