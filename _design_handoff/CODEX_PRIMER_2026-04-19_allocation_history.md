# Codex primer — `operator.allocation_history` + `operator.order_blotter`

**Date:** 2026-04-19
**Audience:** Codex (rebuild backend / `scripts/push-operator-feed.py` owner)
**Source of frontend ask:** Vires Capital design handoff 2026-04-19, ports landed in commits `<TBD>`
**Frontend status:** Implemented, shipping the **placeholder** state on every sleeve until these fields land. Once you wire the fields below, the populated UI takes over with no frontend change.

---

## What changed on the frontend

The Vires Trading sleeve sub-screens (Stocks, Options, Crypto) now mount two new cards per the design:

1. **`ActiveStrategy`** — wired to existing fields (`operator.strategy_bank.active`, `operator.strategy_bank.banked_strategies` for stocks; `operator.crypto_signals.managed_exposure` for crypto). No backend ask here. **One sub-feature is degraded though:** the *Regime Timeline* inside the expanded body reads `operator.allocation_history[sleeve].regimes`, so it shows the "no regime history yet" placeholder until field #1 below lands.

2. **`AllocationHistory`** — wraps a per-sleeve daily snapshot of what the sleeve held (Currently bar + Recent Orders). Renders the *AllocationPlaceholder* state on every sleeve today because both feed paths below are missing.

Component code:
- `components/vires/active-strategy.tsx`
- `components/vires/allocation-history.tsx`

Both already type the fields below as optional, so the frontend gracefully degrades to placeholders when fields are absent. Wiring the fields below populates the UI; no frontend follow-up required.

---

## Field 1 — `operator.allocation_history`

**Path:** `operator.allocation_history[sleeve_key]`
**Sleeve keys:** `"stocks"`, `"options"`, `"crypto"`

### Shape

```jsonc
{
  "operator": {
    "allocation_history": {
      "stocks": {
        "status": "available",       // "available" | "unavailable"
        "source": "trade_log",       // "trade_log" | "ladder_log" | other identifier — drives the LIVE · <SOURCE> pill
        "sleeveLabel": "Stocks sleeve",
        "reason": null,              // when status === "unavailable", a one-line operator-readable reason
        "symbols": [                 // every symbol that appears in series (incl. SGOV/cash anchors) — drives stacked-bar legend colors
          { "sym": "NVDA", "color": "#c8a968", "label": "NVDA" },
          { "sym": "META", "color": "#8fb4cf", "label": "META" },
          { "sym": "SGOV", "color": "#5f6a7a", "label": "SGOV" }
        ],
        "regimes": [                 // regime bands that overlay the timeline
          { "from": "2026-02-20", "to": "2026-03-13", "label": "RISK_OFF" },
          { "from": "2026-03-14", "to": "2026-03-31", "label": "RISK_ON" },
          { "from": "2026-04-01", "to": "2026-04-07", "label": "DEFENSIVE" },
          { "from": "2026-04-08", "to": "2026-04-17", "label": "RECOVERING" }
        ],
        "regimeTones": {             // optional human-readable map per regime label
          "RISK_OFF":   { "label": "Risk off",   "tone": "neg" },
          "RISK_ON":    { "label": "Risk on",    "tone": "pos" },
          "DEFENSIVE":  { "label": "Defensive",  "tone": "warn" },
          "RECOVERING": { "label": "Recovering", "tone": "neutral" }
        },
        "series": [                  // daily series — same cadence as equity_curve
          {
            "date": "2026-02-20",
            "weights": { "NVDA": 0, "META": 0, "AVGO": 0, "AAPL": 0, "COST": 0, "LLY": 0, "SGOV": 60 },
            "cash": 40,              // remaining % held in cash; weights + cash should sum to 100 within rounding
            "total": 1234.56         // optional: dollar value of the sleeve on that date
          }
          // … one entry per trading day, oldest → newest
        ]
      },
      "options": {
        "status": "unavailable",
        "reason": "No strategies deployed yet. Allocation history begins when the first variant is promoted from the Bench."
      },
      "crypto": {
        "status": "available",
        "source": "ladder_log",
        "sleeveLabel": "Crypto sleeve",
        "symbols": [
          { "sym": "BTCUSD", "color": "#c8a968", "label": "BTC" }
        ],
        "regimes": [
          { "from": "2026-03-20", "to": "2026-04-02", "label": "TIER_2" },
          { "from": "2026-04-03", "to": "2026-04-17", "label": "TIER_3" }
        ],
        "regimeTones": {
          "TIER_1": { "label": "Tier 1 · Risk on" },
          "TIER_2": { "label": "Tier 2 · Accumulate" },
          "TIER_3": { "label": "Tier 3 · Risk off" }
        },
        "series": [
          { "date": "2026-03-20", "weights": { "BTCUSD": 70 }, "cash": 30 }
          // …
        ]
      }
    }
  }
}
```

### Field-level semantics

| Field | Type | Required | Semantic |
|---|---|---|---|
| `status` | `"available" \| "unavailable"` | Yes | Drives placeholder vs populated path. If `unavailable`, frontend renders the dashed-frame placeholder with the `reason` line. |
| `source` | `string \| null` | When `available` | Origin of the data. Frontend renders `LIVE · TRADE LOG`, `LIVE · LADDER LOG`, or `LIVE · FEED` based on this string. Add new values freely; unknown values fall back to `LIVE · FEED`. |
| `sleeveLabel` | `string \| null` | When `available` | Display label for the card title. Falls back to a generic per-sleeve label (`"Stocks sleeve"` etc.) if null. |
| `reason` | `string \| null` | When `unavailable` | One-line copy explaining why no history yet. Renders inside the placeholder. |
| `symbols[]` | `Array<{sym, color, label}>` | When `available` | Every symbol that appears in `series.weights`. Color drives the stacked-bar legend tint. Frontend tolerates a missing color (defaults to neutral grey). |
| `regimes[]` | `Array<{from, to, label}>` | Optional | Date-range bands overlaying the timeline. Used today by `ActiveStrategy`'s Regime Timeline (most-recent-first display). Future use in `AllocationHistory.StreamChart` (deferred per design). |
| `regimeTones` | `Record<label, {label, tone}>` | Optional | Map from raw regime enum (`"RISK_OFF"`) to human label (`"Risk off"`). If absent, frontend titlecases the raw enum. |
| `series[]` | `Array<{date, weights, cash, total?}>` | When `available` | Daily snapshots. `weights` keys should match `symbols[].sym`. `cash` is remainder %. `weights + cash` should sum to 100 (within ±1% rounding). Order: oldest → newest. |

### Production cadence + retention

- **Cadence:** Daily, EOD. Same trading-day cadence as `equity_curve`.
- **Retention:** Match what the design assumes — 60+ trading days back at minimum, longer if cheap. Frontend will filter to whatever `series` length you ship.
- **Initial population:** When a sleeve first receives a strategy, start with `status: "available"` and a single-day `series` entry. The frontend's "Currently" panel works from one day; the timeline gets denser over time.

---

## Field 2 — `operator.order_blotter`

**Path:** `operator.order_blotter[sleeve_key]`

### Shape

```jsonc
{
  "operator": {
    "order_blotter": {
      "stocks": [
        {
          "date": "2026-03-16",
          "side": "BUY",                    // "BUY" | "SELL"
          "sym": "NVDA",
          "qty": 12,
          "price": 188.43,                  // per-share fill price, USD
          "note": "Regime: Risk on · initial rotation"   // optional, one-line operator note
        },
        { "date": "2026-04-01", "side": "SELL", "sym": "META", "qty": 14, "price": 461.33, "note": "Regime: Defensive · exit trigger" }
      ],
      "crypto": [
        {
          "date": "2026-03-20",
          "side": "BUY",
          "sym": "BTCUSD",
          "qty": 0.742,
          "price": 94200.00,
          "usd": 69896.40,                  // BTC-only: USD notional of the fill
          "note": "Ladder promoted · 70% target"
        }
      ],
      "options": []
    }
  }
}
```

### Field-level semantics

| Field | Type | Required | Semantic |
|---|---|---|---|
| `date` | `string (YYYY-MM-DD)` | Yes | Fill date. Frontend formats as `MAR 16` etc. |
| `side` | `"BUY" \| "SELL"` | Yes | Drives row color (green/red) and label. |
| `sym` | `string` | Yes | Asset symbol. Special-case display: `"BTCUSD"` renders as `"BTC"`. |
| `qty` | `number` | Yes | Share count for equities, asset count for crypto (e.g. `0.742` BTC). |
| `price` | `number` | Yes | Per-unit fill price in USD. |
| `usd` | `number \| null` | When `sym === "BTCUSD"` | Total USD notional of the fill. Required for crypto rows because the frontend renders USD-primary for crypto. Optional for equities. |
| `note` | `string \| null` | Optional | Short operator note (regime context, fill rationale). Renders in muted line under the symbol. |

### Order + dedup

- **Order:** Chronological, oldest → newest. Frontend reverses for display (most-recent-first).
- **Dedup:** Each fill exactly once. If broker emits partial fills under the same `order_id`, aggregate to a single blotter entry per dedup key (your call on the dedup key — `order_id` is the natural one).
- **Retention:** Match `allocation_history.series` retention — last 60+ trading days minimum.

### Empty state

If a sleeve has no fills yet, ship `[]` (empty array). The frontend hides the Recent Orders section entirely when empty, no special copy needed.

---

## Reference data

The full structurally-realistic shape is in the design package at:
- `~/claude/claw-dashboard/_design_handoff/vires_capital/files/data.js`
  - Lines 342–535: `allocationHistory` (synthetic generator + final shape)
  - Lines 537–567: `orderBlotter` (per-sleeve sample fills)

That file is the canonical reference for any ambiguity — it represents what the design renders today and is the contract the frontend was built against.

---

## What happens on the frontend when this lands

No frontend code change required. The instant `operator.allocation_history.stocks.status === "available"` (etc.) appears on the feed:

- **Stocks sleeve sub-screen:** AllocationHistory card swaps from placeholder to populated (Currently bar + legend + Recent Orders). ActiveStrategy's expanded Regime Timeline populates from `regimes[]` reverse-sorted.
- **Crypto sleeve sub-screen:** Same swap. ActiveStrategy's Regime Timeline gets populated when `crypto`'s `regimes[]` is present.
- **Options sleeve sub-screen:** Renders placeholder until options has a promoted strategy and starts populating its own series. Frontend handles `status: "unavailable"` with the placeholder + reason copy.

Test path: regenerate `data/operator-feed.json` with the fields above, hit `/vires/trading/stocks` (or `/crypto`), confirm placeholder swaps to populated.

---

## Out of scope for this primer

- **`StreamChart`** — design defines a stacked %-area component but the current `AllocationHistory` wrapper doesn't mount it (deferred per the v2 design). When/if it ships, the data shape above already supports it (`series[]` weights are exactly what it consumes).
- **`RegimeTimeline` as a top-level block in AllocationHistory** — also defined, also not currently mounted in the wrapper. Same situation.

Both can light up later from the same `allocation_history` payload — no contract change needed.

---

## Questions / blockers

If anything in the shape is hard to produce from the rebuild's current state (e.g. `regime_tones` not naturally available, or `weights` need a different key than per-symbol), flag back and we can adapt the frontend reader. Don't reshape the contract unilaterally — drop me a note and we sync.

— Code (Claude Opus, dashboard-side)
