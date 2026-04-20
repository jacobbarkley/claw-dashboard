# UX_CHECKLIST — Crypto sleeve · Tracked Assets

**Package:** `2026-04-19_crypto_tracked_assets/`
**Scope:** The Tracked Assets card. Line-item parity check against `prototype/index.html` (ground truth). Every visible element, across every state, with what it shows and — critically — what it does **not** show.

Read order: Code implements `prototype/` as pixels, then walks this checklist line by line against the shipped build before merging. Any row where "Shows" is implemented without its "Does NOT show" constraint respected is a handoff failure — log it.

---

## State 1 · Populated · Risk Off (current feed snapshot)

### Card chrome

| Element | Shows | Does NOT show |
|---|---|---|
| Card frame | `vr-card` surface — ink background @ 62%, 1px line border, 6px radius | no sleeve-colored border, no glow, no hero gradient (this is a secondary card, not a hero) |
| Eyebrow copy | `TRACKED ASSETS` (uppercase, tracked, cream-mute) | no sleeve name, no asset count |
| Title copy | "Market intent · Crypto sleeve" | no dollar total, no position count — this is not a summary card |
| Subtitle copy | "What the strategy is about to do for the assets we track." | no timestamp, no "last updated," no fetch-status text |
| Regime chip (header right) | `VIX 16.88 · Medium` primary line + `HMM Calm` secondary line | no VIX change, no intraday regime direction, no link out — it's context, not interactive |

### BTC row · Identity + market

| Element | Shows | Does NOT show |
|---|---|---|
| Symbol | `BTCUSD` — mono 18px, 0.04em tracking, cream | no icon, no logo, no "Bitcoin" long-name |
| Lane pill | `Core` — purple-tinted pill (`--vr-sleeve-crypto`) | no lane strategy name, no "Managed Exposure" — lane is the category, not the strategy |
| Market price | `$74,864.62` — mono 18px, right-aligned, from `positions[].current_price` | **NOT** user's holding qty. **NOT** user's market value. **NOT** cost basis. **NOT** unrealized P&L. |
| Intraday change | `−1.09% today` — muted-red (`--vr-down`), mono, from `positions[].change_today_pct` | **NOT** user's P&L change. This is the asset's move against prior close, not the portfolio's move. |

### BTC row · Strategy state

| Element | Shows | Does NOT show |
|---|---|---|
| State badge | `Risk Off` — muted-red, uppercase, tracked, 10px | no ticker-tape blink, no icon, no tooltip popover (state is self-explanatory with the ladder below) |
| Tier label | `Tier 3` — cream-dim, 11px | no "(current)" or "(active)" — redundant with the badge's semantic |
| Target exposure | `Target exposure 0%` — cream-mute label + mono cream-dim number | **NOT** current deployed exposure (`managed_exposure.current_exposure_pct`); that's the implementation fact, target is the intent. Keep clean separation. |
| Tier 1 rung (inactive) | `Tier 1 · 80% · Constructive regime` — muted line border, cream-mute copy | no interactivity, no "view evidence," no promotion-stage metadata |
| Tier 2 rung (inactive) | `Tier 2 · 70% · Neutral regime` — muted styling | same as above |
| Tier 3 rung (active) | `Tier 3 · Active · 0% · Risk-off` — red accent rule on top, red-tinted border, full-color copy | no action verb inside the rung (action lives below) |

### BTC row · Action

| Element | Shows | Does NOT show |
|---|---|---|
| "Next action" eyebrow | Uppercase, tracked, cream-mute | no timestamp of when the action will execute (not on the feed) |
| Action verb | `Buy` — green-tinted pill border when `action === "BUY"` | no trade count, no fill status |
| Action notional | `$855` — mono 14px, cream | **NOT** a target price. **NOT** a strike. **NOT** total sleeve value. This is the *delta* the strategy wants to put through on this asset. |
| Dry-run indicator | Pulsing amber dot + "Dry run" | **NOT** when `status === "LIVE"` — absence of indicator = live execution |

### BTC row · Tactical overlay (research-only empty state)

| Element | Shows | Does NOT show |
|---|---|---|
| Overlay container | Dashed border (`--vr-line-hi`), no fill — distinct from populated data | no skeleton shimmer (this is *not* loading — it's structurally empty) |
| Overlay label | `Tactical overlay · 4H TSMOM` | no "Empty" label — the copy itself does the work |
| Status pill | `Research only` — gold-tinted, accent color | no "Coming soon," no CTA, no "View bench" — not actionable from this card |
| Explanatory copy | Verbatim from `tsmom.note` | no made-up explanation, no inferred ETA, no "we're working on it" — only the feed's own note |

---

## State 2 · Populated · Risk On (variant)

Same element map as State 1. Color and state values change:

| Element | Shows | Does NOT show |
|---|---|---|
| State badge | `Risk On` — muted-green (`--vr-up`) | no exclamation, no trending-up icon — it's a tier state, not a celebration |
| Tier 1 rung active | Green accent rule on top, green-tinted border | no "+80%" framing — it's a target level, not a delta |
| Action verb | `Hold` — neutral cream-dim styling | *(see NOTES open question about HOLD verb availability)* |
| Action notional | `$0` when action is HOLD | no dash/em-dash — zero is a real value here, not missing data |

## State 3 · Populated · Accumulate (variant)

| Element | Shows | Does NOT show |
|---|---|---|
| State badge | `Accumulate` — amber (`--vr-warn`) | no "neutral" label — Accumulate is the enum, use the enum |
| Tier 2 rung active | Amber accent rule, amber-tinted border | no "interpolating between tiers" — tiers are discrete |
| Intraday change flat | `+0.00% today` cream-mute | no "unchanged" / "flat" label — the number is the signal |

---

## State 4 · Empty · No tracked assets

| Element | Shows | Does NOT show |
|---|---|---|
| Card frame | Preserved at normal height | **NOT** collapsed — don't reflow the sleeve when crypto is idle |
| Header (all elements) | Present, including regime chip | regime chip still shows; it's sleeve-context, not row-context |
| Empty body | "No tracked assets" title + one-line explanatory copy | no CTA, no "Add asset" button (operators don't add tracked assets from this surface), no illustration |

## State 5 · Loading

| Element | Shows | Does NOT show |
|---|---|---|
| Card frame + header | Fully rendered immediately | no spinner in the header, no "Loading…" text — skeleton in body is the signal |
| Regime chip | Skeleton (chip-sized rectangle) | no half-rendered regime values — don't show stale values during initial load |
| Row content | Skeleton blocks matching the populated layout's structure (symbol, state cluster, price, three ladder rungs, action, overlay) | **NOT** a single full-row block — skeleton structure should hint at the populated layout |
| Shimmer animation | 1.6s ease, cream at 6% over ink background | no pulsing dot, no rotating spinner — shimmer only |

## State 6 · Error

| Element | Shows | Does NOT show |
|---|---|---|
| Card frame + header | Preserved | no red border on the card itself — reserved for per-row tier styling |
| Regime chip | **Omitted** when feed is fully unavailable | no stale chip values — if the feed didn't return, we don't fake the regime |
| Error title | "Couldn't load tracked assets" | no stack trace, no HTTP code, no "Retry" button (v1; retry-capable error lives in v2 scope) |
| Error copy | Muted-red, one line, tells operator the rest of the sleeve still renders from cache | no technical detail, no request ID, no "contact support" |

## State 7 · Future shape preview (tracked-but-unheld)

*Not a live state. Rendered at reduced opacity and gated behind the "future — not current feed shape" label.*

| Element | Shows | Does NOT show |
|---|---|---|
| Price slot | `—` em-dash in muted cream | **NOT** a skeleton (skeleton = loading, not structurally absent). Em-dash = this field is not in the contract for this row. |
| Intraday change row | **Omitted entirely** when price is unknown | no `—%` — if there's no price, there's no move to report |
| Everything else | Identical to populated row | — |

---

## Cross-surface parity notes

These are the drift risks against *adjacent* cards. Check during review:

| Adjacent card | Risk | Mitigation |
|---|---|---|
| Open Positions · BTC row | Could duplicate market price + change | Open Positions shows **qty + market value + unrealized P&L**. Tracked Assets shows **market price + tier state + action**. No field overlap except symbol. |
| Sleeve summary card | Could duplicate `current_exposure_pct` | Sleeve summary shows *sleeve-level* dollar totals. Tracked Assets shows *per-asset* target exposure %. Different denominators, different scopes. |
| Regime surface (if it exists elsewhere) | Regime chip could duplicate | Chip is scoped to this card's header for local context. It does NOT replace a dedicated regime surface if one exists. |

---

*Checklist is a contract. If Code ships an element whose "Does NOT show" column is violated, append to `DIVERGENCE_LOG.md` — don't silently correct.*
