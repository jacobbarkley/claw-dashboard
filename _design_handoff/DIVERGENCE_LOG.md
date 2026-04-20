# Divergence Log — Claude Design ↔ Claude Code

Living record of moments where the implementation drifted from the
design prototype, and the resolution. Both Claude Design and Claude
Code read this file before any handoff and append to it when a
divergence is found or fixed.

The goal isn't to assign blame — it's to compound learning. Each
entry teaches the next handoff how to avoid the same drift.

---

## Format

```
### YYYY-MM-DD — <feature or surface> — <one-line summary>

**Prototype intent:** what the design specified
**Shipped state:** what landed in production
**Which is correct + why:** the truth + the reasoning
**Resolution:** (commit SHA if fixed, or "queued for handoff <N>")
**Lesson:** (optional — generalizable rule for future handoffs)
```

---

## Entries

### 2026-04-19 — Crypto sleeve · Tracked Assets — BTC row showed user holding instead of market price

**Prototype intent:** The Tracked Assets card on the Crypto sleeve is a
watchlist of crypto the strategy may allocate to. For BTC it shows the
current market price + distance to managed-exposure tier triggers +
distance to tactical add triggers — the things that determine whether
the strategy will move size.

**Shipped state:** The card rendered the user's existing BTCUSD position
(symbol, market value) — duplicating what the Open Positions card
already shows above it.

**Which is correct + why:** The prototype. The watchlist's job is
"what is the market doing for things we care about" — it surfaces
intent and trigger distance. Showing the user's holding qty here is
redundant with Open Positions and adds no information.

**Resolution:** Queued for the next Claude Design package — full
reshape of the crypto Tracked Assets card with the trigger-distance
philosophy.

**Lesson:** When two surfaces could plausibly show the same data, ask
*what is each surface for*. Watchlist = market intent. Positions =
what you own. Don't duplicate; differentiate by purpose.

---

<!-- Append new entries above this line -->
