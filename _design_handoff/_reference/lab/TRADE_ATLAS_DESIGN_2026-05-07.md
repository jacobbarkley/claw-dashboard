# Trade Atlas — UI Design Spec (2026-05-07)

**Status:** RFC — no interactive implementation until Codex signs off on the
`result_trades.v1` schema.  
**For:** Claude Code (implementation) + Codex (schema sign-off)  
**Component:** `components/vires/lab/trade-atlas-section.tsx`  
**Page context:** `app/vires/bench/lab/jobs/[id]/page.tsx`  
**Feature flag:** `VIRES_LAB_TRADE_ATLAS=1`  
**Schema doc:** `_design_handoff/CODEX_PRIMER_2026-05-07_result_trades_contract.md`

---

## §1 — Section placement

The trade atlas section sits **below** the existing `ResultLeaderboard` and the
`CandidateScorecard` details disclosure, and **above** any future artifact panels
(simulation replay, parameter sensitivity, etc.).

Rationale: the leaderboard + scorecard answer *"is this strategy good?"* — the
verdict tier. The trade atlas answers *"how did it get there?"* — a deeper drill
that the operator reaches by scrolling down past the summary verdict. Most visits
will stop at the leaderboard; the atlas is opt-in by scroll.

### Mount point in `page.tsx`

```tsx
{/* existing DetailsDisclosure wrapping CandidateScorecard */}
{candidate ? (
  <DetailsDisclosure label="Details" hint="all gates, variant params, raw metrics">
    <CandidateScorecard candidate={candidate} />
  </DetailsDisclosure>
) : null}

{/* trade atlas — flag-guarded, needs result */}
{tradeAtlasEnabled() && result && (
  <TradeAtlasSection result_id={result.result_id} />
)}
```

---

## §2 — Summary metrics row

Six tiles in a horizontal-scroll row. All values come from the `summary` block
in `result_trades.v1` — **no trade row parsing required for initial paint**.

| # | Label | Source field | Format |
|---|---|---|---|
| 1 | Trades | `summary.total_trades` | integer |
| 2 | Win Rate | `summary.winners / summary.total_trades` | `51%` |
| 3 | Avg P&L | `summary.pnl_distribution.p50` | `+0.62%` with explicit sign |
| 4 | Avg Hold | `summary.avg_holding_period` | humanized (`1d`, `4h`, `22m`) |
| 5 | Max Win | `summary.pnl_distribution.max` | `+6.11%` in `var(--vr-up)` |
| 6 | Max Loss | `summary.pnl_distribution.min` | `-4.20%` in `var(--vr-down)` |

**Tile shape:** `.vr-card` container, `t-eyebrow` label (9px, muted) above a
large `t-mono` value (16px). Same pattern as the KPI tiles in `CapitalHero` on
the trading page.

**Responsive grid:** 3-per-row on desktop (720px max-width column), 2-per-row on
mobile (< 600px). Tiles use `flex: 1 1 120px` so they expand to fill available
space. No horizontal scroll on the summary row — wrapping is cleaner than scroll
for a 6-tile set.

---

## §3 — Trades table

### 3a — Column set

| Column | Source field | Sortable? | Notes |
|---|---|---|---|
| Side | `side` | No | Chip: LONG (vr-up tint) / SHORT (vr-down tint) |
| Symbol | `symbol` | No | Monospace ticker |
| Entry | `entry_at` | Yes | Date only on narrow; datetime on wide |
| Exit | `exit_at` | Yes | Default sort: most recent first; "Open" if null |
| Hold | `holding_period_seconds` | Yes | Humanized |
| P&L | `gross_pnl_pct` | Yes | Signed pct, colored green/red |
| Exit reason | `exit_reason` | No | Chip (see §3c); hidden if null |

**Default sort:** `exit_at` descending (most recent closed trade first).

**Sort behavior:** single-column only; clicking the active column header cycles
ascending → descending → default. Active column shows a directional chevron
(↑/↓) in `var(--vr-gold)`. Sort state is in-memory client state — no URL
persistence for v1.

### 3b — Per-row expand (accordion)

Clicking anywhere on a row (or a `›` expand chevron on the right) reveals an
inline drawer beneath the row. Only one row can be expanded at a time.

Drawer contents:

| Field | Format |
|---|---|
| `entry_at` | Full ISO with timezone offset, `t-mono` |
| `exit_at` | Full ISO with timezone offset, `t-mono`; "Position open" if null |
| `entry_price` | Currency, `t-mono` |
| `exit_price` | Currency, `t-mono`; "—" if null |
| `notional_at_entry` | Currency, `t-mono` |
| `gross_pnl` | Absolute currency + signed `gross_pnl_pct` |
| `bench_mark_pnl_pct` | Signed pct; **entire row hidden** if field is null |
| `regime_tag` | Gold outline chip, `t-eyebrow` label; hidden if null |
| `variant_id` | Muted `t-mono` label |

### 3c — Exit reason chips

Color-coded pill chips. Rendered in the table cell and the expand drawer.

| Reason | Color |
|---|---|
| `STOP` | `var(--vr-down)` background tint, red text |
| `TARGET` | `var(--vr-up)` background tint, green text |
| `TIME` | `var(--vr-cream-mute)` text, subtle border |
| `REGIME_FLIP` | `var(--vr-gold)` text, `var(--vr-gold-line)` border |
| `OTHER` | `var(--vr-cream-faint)` text, no border |
| `null` | Cell is empty; no chip |

---

## §4 — Filter chips

A filter row sits between the summary tiles and the table. Chips are grouped; a
visible label introduces each group on desktop (hidden on mobile to save space).

### Group 1 — Side
`ALL` · `LONG` · `SHORT`

### Group 2 — Exit reason
`ALL` · `STOP` · `TARGET` · `TIME` · `REGIME_FLIP` · `OTHER`

### Group 3 — Regime
Dynamically populated from the unique `regime_tag` values in `trades[]`.
**Hidden entirely** if no trade has a non-null `regime_tag`.

### Group 4 — Variant
Dynamically populated from the unique `variant_id` values in `trades[]`.
**Hidden entirely** if all trades belong to a single variant.

### Chip visual states

- **Inactive:** ghost chip — `var(--vr-cream-mute)` text, `1px solid var(--vr-line)` border, transparent background.
- **Active:** `var(--vr-gold-soft)` background, `1px solid var(--vr-gold-line)` border, `var(--vr-cream)` text.

### Filter logic

Selections within a group are **additive** (LONG + SHORT = both). Selections
across groups are **conjunctive** (side=LONG AND exit_reason=TARGET). Selecting
`ALL` in a group clears all per-value selections in that group.

---

## §5 — Empty state

Rendered when the artifact file is **missing** (ENOENT — the expected state until
Codex ships the producer). No error icon; this is a pre-data state, not a fault.

```
┌─────────────────────────────────────────┐
│  TRADE ATLAS                            │  ← t-eyebrow, var(--vr-gold)
│                                         │
│  No trades yet                          │  ← t-h4, var(--vr-cream)
│                                         │
│  Trade-level data will appear here      │  ← t-body, var(--vr-cream-mute)
│  after the first completed run.         │
│  Awaiting producer artifact.            │
└─────────────────────────────────────────┘
```

Card: `.vr-card`, left border `2px solid var(--vr-line-hi)` (not an error color).
Padding: `20px 18px`.

---

## §6 — Error state

Rendered when the file **exists but JSON parsing fails** — a genuine fault. Uses
a red left-border to distinguish from the empty state.

```
┌─────────────────────────────────────────┐
│  TRADE ATLAS                            │  ← t-eyebrow, var(--vr-gold)
│                                         │
│  Trade log could not be read            │  ← t-h4, var(--vr-cream)
│                                         │
│  The artifact was found but could not   │  ← t-body, var(--vr-cream-mute)
│  be parsed. Check the server log.       │
│                                         │
│  ▸ Technical detail                     │  ← <details> disclosure
│    [raw error message in t-mono pre]    │
└─────────────────────────────────────────┘
```

Card: `.vr-card`, left border `2px solid var(--vr-down)`.  
Technical detail uses a native `<details>/<summary>` element (no JS needed)
so it degrades gracefully if hydration hasn't run. The raw error message is
shown in a `t-mono` `<pre>` with `background: var(--vr-ink-sunken)`.

---

## §7 — Mobile considerations (< 600px)

### Summary row
Two tiles per row (wrapping grid, same `flex: 1 1 120px`). No layout change
other than wrapping — 6 tiles become a 3-row × 2-col grid.

### Trades table → card stack
Below 600px the table is hidden and replaced by a card stack. Each row becomes
a `.vr-card` with `padding: 12px 14px`:

```
┌─────────────────────────────────────────┐
│  [LONG]  AAPL               +3.71%      │  ← side chip + symbol + P&L right-aligned
│  2d 3h                      [TARGET]    │  ← hold + exit reason chip
└─────────────────────────────────────────┘
```

Tapping the card expands the same drawer content as the desktop row expand.

### Sorting on mobile
A native `<select>` above the card stack replaces the column-header sort
affordance. Options match the sortable columns: "Exit date", "Hold time",
"P&L", "Entry date".

### Filter chips on mobile
Same chips, same logic. Group label text is hidden; chips scroll horizontally
in a `vr-no-scrollbar` strip. Groups are visually separated by a `4px` gap
between the last chip of one group and the first of the next.

---

## §8 — Component architecture decision: server vs client

**Decision: server component outer shell + client sub-component for interactivity.**

### `TradeAtlasSection` (server, async)

Responsibilities:
1. Read `VIRES_LAB_TRADE_ATLAS` env var (server-side concern; must not leak to client bundle).
2. Load `result_trades.v1` artifact from disk via `lib/research-lab-trades.server.ts`.
3. Route to empty state | error state | `<TradeAtlasTableClient data={...} />`.

No JavaScript payload for the empty and error states — they are static HTML.
No hydration cost for the flag check.

### `TradeAtlasTableClient` ("use client")

Responsibilities:
1. Hold sort column + direction in `useState`.
2. Hold filter selections in `useState`.
3. Hold expanded row ID in `useState`.
4. Derive filtered + sorted `trades[]` slice for render.

All state is in-memory; no server round-trip on interaction. The client
component boundary is at the table/filter layer only — the section header and
summary tiles can remain server-rendered HTML.

### Stub state (current)

In the current RFC stub, `TradeAtlasTableClient` is a placeholder that shows a
single-line note ("interactive table renders when TradeAtlasTableClient ships").
The server shell, flag guard, empty/error states, and summary tiles are
fully implemented.

---

## §9 — Visual primitives reference

| Element | Class / token |
|---|---|
| Card container | `.vr-card` |
| Section label (eyebrow) | `.t-eyebrow` + `color: var(--vr-gold)` + `letter-spacing: 0.14em` |
| Heading | `.t-h4` (14px) or `.t-h3` (20px) depending on context |
| Body copy | `.t-body` (`var(--vr-cream-mute)`, 13px) |
| Monospace values | `.t-mono` |
| Positive P&L | `color: var(--vr-up)` |
| Negative P&L | `color: var(--vr-down)` |
| Gold accent / active | `var(--vr-gold)`, `var(--vr-gold-soft)`, `var(--vr-gold-line)` |
| Muted secondary text | `color: var(--vr-cream-mute)` |
| Faint tertiary text | `color: var(--vr-cream-faint)` |
| Subtle card border | `border: 1px solid var(--vr-line)` |
| Raised card border | `border: 1px solid var(--vr-line-hi)` |
| Sunken background | `background: var(--vr-ink-sunken)` |

---

— Claude (Sonnet 4.6)
