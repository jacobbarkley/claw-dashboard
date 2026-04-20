# DEGRADATION — Crypto sleeve · Tracked Assets

**Package:** `2026-04-19_crypto_tracked_assets/`
**Scope:** UX intent for every non-happy-path state of every element on the Tracked Assets card. Design owns intent; Code reports back failure-mode signals available on the backend.

Ownership split (per `_design_handoff_protocol.md` § DEGRADATION.md):
- **Design specs** *what the user should see and feel* when a field is missing, stale, loading, or errored.
- **Code reports back** which of these map cleanly to backend signals, and flags ones that need a contract addition or spec adjustment. Code's reply uses a `## Failure modes` subsection during package review.

---

## Card-level states

### Populated (happy path)
See `prototype/` States 1–3. No degradation needed.

### Loading (initial fetch in flight)
- Card frame + header copy render immediately (eyebrow, title, subtitle)
- Regime chip → skeleton block, chip-sized
- Row area → skeleton that hints at populated structure (symbol + state cluster + price on one line, three ladder rungs below, two stacked blocks for action + overlay)
- Shimmer: 1.6s ease, cream @ 6% over ink
- **Do NOT** render a spinner, "Loading…" text, or a partial row with some fields and some skeletons

### Error (fetch threw)
- Card frame + header copy preserved (minus regime chip — don't fake the chip's value when the feed is unavailable)
- Body: one-line error title ("Couldn't load tracked assets") + one-line muted-red copy
- v1 scope: no Retry button. Reload is the recovery path.
- **Do NOT** show stack trace, HTTP code, request ID, or "contact support"
- **Do NOT** red-border the card frame (reserved for per-row tier styling)

### Empty (`operator.crypto_signals.tracked_assets` is `[]`)
- Card frame preserved at normal height (don't collapse)
- Header fully rendered — regime chip stays (it's sleeve-scope, not row-scope)
- Body: "No tracked assets" title + explanatory copy naming promotion as the path to population
- **Do NOT** show a CTA or illustration

### Field missing (`operator.crypto_signals` is undefined or null)
- Treat as Empty state (above). The entire crypto-signals surface is absent — safest fallback is "no tracked assets" copy, not an error.

---

## Per-field degradation

### Regime chip · header

| Field | State | UX intent |
|---|---|---|
| `operator.regime` entire object | missing / null | **Omit the chip entirely.** Header compresses. Better than faking regime. |
| `operator.regime.vix_level` | null but object present | Render primary line as `VIX — · Medium` (em-dash for the numeric, preserve the regime label) |
| `operator.regime.vix_regime` | null | Primary line renders as `VIX 16.88` only (drop the regime label) |
| `operator.regime.hmm_regime` | null | Omit the secondary line. Chip becomes one-line. |
| `operator.regime.populated` | `false` | Treat whole chip as missing — omit |

### Row · Identity

| Field | State | UX intent |
|---|---|---|
| `tracked_assets[i].symbol` | null / empty string | Row doesn't render. Without a symbol the row has no identity. Log upstream. |
| `tracked_assets[i].lane` | null | Lane pill omitted. Row still renders. |
| `tracked_assets[i].lane` | value we don't have styling for (future lane, e.g. `OVERLAY`) | Render with neutral cream-mute pill + title-cased raw value |

### Row · Market price

| Field | State | UX intent |
|---|---|---|
| matching `positions[j].current_price` | missing (symbol not in positions) | Price slot renders `—` (em-dash, muted cream). Intraday change row suppressed. |
| `positions[j].current_price` | null | Same as missing — `—` + suppress change |
| `positions[j].current_price` | zero | Render `$0.00` literally (zero is real). Do NOT collapse to `—` for zero. |
| `positions[j].change_today_pct` | null | Change row suppressed. Price still renders. |
| `positions[j].change_today_pct` | zero | `+0.00% today` in muted cream (flat styling, not up/down) |

### Row · Strategy state

| Field | State | UX intent |
|---|---|---|
| `tracked_assets[i].state` | null but row present | State badge omitted. Tier label omitted. Target exposure line shows `Target exposure —`. Ladder still renders but with no active rung highlighted. Row degrades visibly without crashing. |
| `tracked_assets[i].state` | value not in `{RISK_ON, ACCUMULATE, RISK_OFF}` | Render as neutral cream badge with the raw value title-cased. Don't assume colors for unknown states. |
| `tracked_assets[i].tier_label` | null | Tier label text omitted; state badge still renders |
| `tracked_assets[i].target_exposure_pct` | null | `Target exposure —` |
| `managed_exposure.ladder` | missing / empty array | Ladder section omitted entirely. Row still renders with state badge + action. Ladder is the richest visual but not load-bearing. |
| `managed_exposure.ladder[k].active` | all `false` | Ladder renders with no active highlight. Check `tracked_assets[i].state` as the fallback active marker — find the rung whose `state` matches. |
| `managed_exposure.ladder[k].exposure_pct` | null | Rung renders `— exposure`, tier label stays |
| `managed_exposure.ladder[k].note` | null / empty | Note line omitted; rung height shrinks |

### Row · Action

| Field | State | UX intent |
|---|---|---|
| `managed_exposure.action` | null | Entire action row omitted. Strategy has no pending action to surface. |
| `managed_exposure.action` | value not in `{BUY, SELL, HOLD}` | Render the raw value title-cased in neutral pill styling |
| `managed_exposure.target_notional_usd` | null | Action verb renders, notional slot shows `—` |
| `managed_exposure.target_notional_usd` | zero | `$0` (zero is real) |
| `tracked_assets[i].status` | `"LIVE"` | Dry-run indicator omitted |
| `tracked_assets[i].status` | `"DRY_RUN"` | Amber pulsing dot + "Dry run" label |
| `tracked_assets[i].status` | other value (e.g. `"PAUSED"`) | Render raw value title-cased in muted pill styling, no pulse |
| `tracked_assets[i].status` | null | Omit indicator |

### Row · Tactical overlay

| Field combination | UX intent |
|---|---|
| `tsmom.status === "RESEARCH_ONLY"` | **Render the research-only empty block** (dashed border, "Research only" gold pill, verbatim `tsmom.note`). This is a *designed-in* empty state, not a degradation. See prototype State 1. |
| `tsmom.status === "PROMOTED"` | *v2 scope — not covered by this package.* Populated overlay UI deferred to when the tactical 4H manifest is promoted. When that happens, a new handoff package specs the populated state. |
| `tsmom` object missing entirely | Omit the overlay block. Row still renders. No empty-state messaging for an absent overlay — the absence is the state. |
| `tsmom.note` | null when `status === "RESEARCH_ONLY"` | Render a generic fallback: "Tactical overlay not currently live." Prefer the feed's note when present. |
| `tsmom.status` value not in enum | Omit the overlay block. Don't guess. |

---

## Failure modes for Code to confirm

These are the detection rules Design is betting on. Code replies with a `## Failure modes` subsection identifying which map cleanly to backend signals and which need adjustment.

1. **Research-only overlay detection.** Primer + prototype use `tsmom.status === "RESEARCH_ONLY"` as the canonical check. Codex confirmed this in primer review (`DATA_PRIMER.md` open-question #4). Marking here for completeness — Code, please reconfirm at implementation time that the field is stable and that `"RESEARCH_ONLY"` is the literal string value, not a case variant.

2. **Loading vs. error vs. empty disambiguation at the card level.** Design specs three distinct states. Code's fetch layer needs to be able to signal them independently:
   - Loading: request in flight
   - Error: request threw or returned non-2xx
   - Empty: request succeeded, `operator.crypto_signals.tracked_assets` is `[]`
   If the current architecture doesn't distinguish error from empty (e.g. both return empty arrays), flag that and we'll spec a stale-cache-fallback behavior instead.

3. **Stale feed handling.** Design has NOT specced a "stale" state — the protocol allows for it in principle but this package doesn't require it. If Code has a stale-feed signal it wants surfaced (e.g. feed older than N minutes), flag back and we'll spec a v2 treatment. Until then, stale renders as populated (trust the cache).

4. **"Symbol not in positions" handling for market price.** Today the mapping is deterministic because `tracked_assets[]` is derived *from* crypto positions (see `DATA_PRIMER.md` dependency #2). Once that changes and tracked assets can be unheld, Code needs to detect the no-positions-match case and render the em-dash per State 7. Not blocking v1; flagged for the contract-addition handoff.

5. **`managed_exposure` vs. `tracked_assets[i]` field drift.** If Code detects a row where `tracked_assets[i].state !== managed_exposure.current_state` for a CORE-lane row, the row should render using `managed_exposure.current_state` as the lane-level source and log the divergence upstream (producer bug). Protocol per `DATA_PRIMER.md`.

---

*Exhaustive intent spec. Code is not expected to build every state from scratch — only to ensure the shipped implementation matches this document for each state that fires in production, and to flag states that can't be detected.*
