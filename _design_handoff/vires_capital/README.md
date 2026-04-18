# Handoff: Vires Capital

## Overview

Vires Capital is an algorithmic trading operator workbench — a single-operator surface for a strategy R&D pipeline that runs experiments ("runs") inside a bench system, promotes strategies to a paper/live trading book when they clear robustness gates, and monitors the resulting portfolio live.

The design covers four connected surfaces:

1. **Trading (home)** — account equity, live equity curve, sleeve allocation (Stocks / Options / Crypto), per-sleeve market value, watchlist, regime state.
2. **Bench** — strategy R&D: active experiments, promoted strategies, recent runs, robustness assessments across historical eras.
3. **Plateau Primer** — a standalone explainer on "parameter plateaus" vs "lucky peaks" in backtested optimization, built as a scroll-through narrative with three layout variations (A, B, C).
4. **Talon** — an embedded chat assistant accessed by clicking the sun/moon celestial in the Account Equity hero. Scoped to ask questions about the book, strategies, and regime.

The aesthetic is **observatory / voyager**: very dark near-black ground with a cream foreground, an amber-gold accent (`--vr-gold`), restrained serif+sans typography, subtle orbit rings and a starfield behind the hero, and a sun/moon celestial in the hero corner that shifts by time of day. No rounded pill chrome. No gradient slop. All numerics are tabular-figures, monospace-dimensioned but serif-humane.

## About the design files

Everything in `files/` is a **design reference**, not production code. The prototype is a static HTML shell with inline React+Babel scripts, keyed off a single JSON blob (`data.js` → `window.VIRES_DATA`) to fake realistic state. The goal of this handoff is to **recreate these designs inside the existing Vires codebase** (a Next.js app with `api/chat/route.ts` already wired up for Talon, per the prior iteration) using its established component patterns, styling approach, and data layer — not to lift the HTML directly.

If the target codebase does not yet have a settled UI framework, React + CSS variables (or Tailwind with a custom theme mapped to these tokens) is the natural fit; everything in the prototype was designed to port cleanly.

## Fidelity

**High-fidelity.** Every screen in this package is a pixel-level reference:

- Colors are final hex values (see `## Design Tokens`)
- Typography is final (Cormorant Garamond for display, IBM Plex Mono for numerics, Inter fallback for sans)
- Spacing, border widths, card patterns, hover behavior, animation timing are final
- Copy is close-to-final — some strings (e.g. "PAPER" mode indicator) are explicitly placeholders that the developer needs to wire to real state

Recreate the UI 1:1 using the target codebase's component library. The only deliberate approximations are synthetic time-series data (intraday upsampling, sleeve sparkline walks) which the real app should replace with actual database-backed series.

---

## Screens / Views

### 1. Trading (home) — `files/vires-trading.jsx` mounted by `files/Vires Capital v2.html`

**Purpose**: The operator lands here every morning. In one screen they need to know (a) what's the account worth and is it up or down today, (b) what's deployed across sleeves, (c) what signals are active.

**Layout**:
- Full-viewport dark background (`--vr-ink` = `#0a0a0c`)
- Fixed command strip at top (56px tall, full-width, border-bottom `--vr-line`)
- Single-column content, max-width 1200px, centered
- Section spacing: 32px between hero and sleeves, 24px between sleeves and equity chart

**Key components**:

**1a. Command strip (top nav)**
- Left: `ViresMark` logo (SVG, 22px square, gold stroke)
- Center: nav items `Trading · Bench · plateau` (italic/lighter weight on plateau — it's scaffolding that links to the primer; delete once the primer is inlined into Bench metric tooltips)
- Right: **mode pill** — reads `PAPER` in amber-gold with a pulsing gold dot. When flipped to real money, change string to `LIVE` and both colors to `--vr-up` (`#7fc29b`). Search `PAPER` in `vires-trading.jsx` — it's one block.
- Right-most: user avatar circle (32px, gold border)

**1b. Account Equity hero**
- Border: 1px `--vr-line`, subtle cream background `rgba(241,236,224,0.02)`, backdrop-filter blur so starfield shows through
- Padding: 32px
- Top row: eyebrow `ACCOUNT EQUITY` (letter-spacing 0.2em, uppercase, 10px, gold)
- Main value: **$85,495.77** in Cormorant Garamond weight 300, 64–72px, slightly tight tracking (-0.02em)
- Below value: today's delta (`+$60.05  +0.07%` in `--vr-up` green with ▲), base value pill `BASE $100,000.00`, total pnl pill `TOTAL -$14,504.23  -14.50%` in `--vr-down` red
- **Top-right corner of the hero**: hand-drawn SVG **celestial**
  - Daytime (6am–6pm local): warm-gold sun, corona pulse, core radial gradient, bright speck
  - Nighttime: waxing-gibbous moon, craters, terminator shadow, soft halo
  - Mouse-parallax tracks cursor position over the hero (subtle, ±6px translation)
  - Has a gold halo pulse on hover (indicates it's clickable)
  - **On click**: opens `TalonChat` (see Talon section)
- Behind the hero: **orbit rings** (3 concentric elliptical paths) + **Starfield** (count=18 particles, very slow Brownian drift, low opacity)

**1c. Equity curve card**
- Shows account equity over time
- Timeframe selector dropdown (top-right): `1D / 1W / 1M / 3M / 1Y / ALL`
- Dropdown value is **shared with sleeve sparklines** via `localStorage` key `vr.tf` and a `vr:tf-change` CustomEvent. Changing timeframe in one place updates all charts.
- Real data comes from `D.equityCurve` (~60 daily points). For timeframes shorter than 1M, data is **upsampled** to intraday using deterministic seeded Brownian-bridge noise (see `upsampleIntraday` helper). 1D shows just today's session (~78 points).
- Hover shows date (+ hour on intraday views) and exact value
- Period delta shown top-right (e.g. `-14.50%` red for ALL)
- Baseline at $100,000 drawn as dashed horizontal line when visible in range
- Line color: `--vr-gold` with a subtle glow underlay (thicker, low-opacity duplicate path)
- Area fill: gold-to-transparent vertical gradient, 18% top opacity

**1d. Sleeve cards (row of 3)**
- Stocks / Options / Crypto, equal-width, gap 16px
- Each: compact card showing total market value, today %, position count, "Open sleeve" link
- Colors per sleeve: `--vr-sleeve-stocks` (slate-blue), `--vr-sleeve-options` (dim cream), `--vr-sleeve-crypto` (amber)
- Clicking opens the sleeve sub-screen (see below)

**1e. Elevated Strategies + Market Regime**
- Two-column below sleeve cards
- Left: list of promoted strategies with metric pills
- Right: current market regime indicator (SPY trend, BTC regime, VIX)

---

### 2. Sleeve sub-screen (Stocks / Options / Crypto)

Reached by clicking a sleeve card on Trading.

**Layout**: single column, 16px gutter, max-width 1100px.

**Key components**:

**2a. Sleeve Summary hero**
- Colored accent border (tint per sleeve at 20% alpha)
- Dot + eyebrow `STOCKS` / `CRYPTO` / `OPTIONS` in sleeve color
- Big total market value, Cormorant 300, 36px
- Sub-row: today %, "unrealized" dollar amount

**2b. SleeveSparkline** (new, below the hero numbers)
- 64px-tall compact chart
- **Mode toggle** top-right: `RET` (cumulative return %) or `MV` (market value)
- **Timeframe dropdown** next to mode toggle — shares state with the main equity chart via `useSharedTimeframe()`
- Line colored per sleeve (stocks slate, crypto amber), area gradient underneath
- Dashed zero line when RET crosses zero
- Hover scrubber with crosshair, date, and value
- Per-sleeve curves are **derived deterministically** from the account `equityCurve`:
  - Seeded noise per sleeve (stocks seed 7919, crypto 4421)
  - Crypto amplification 2.1×, stocks 1.05×
  - MV is scaled so the final point equals the sleeve hero value exactly — no drift between the two numbers on screen
- **Options special-case**: dashed flat line + eyebrow `NO DATA · AWAITING PROMOTION` (nothing deployed in options yet)

**2c. Watchlist**
- Qualified universe with status pills: `MOMENTUM LONG` (gold), `REGIME GATE` (warn), neutral
- Per-row: ticker, trigger, note, and either stop/target (if in position) or last price + 20-day momentum %

**2d. Crypto signal cards** (crypto sleeve only)
- `BTC 4H TSMOM` state card: signal (ARMED / DISARMED), current bar, direction, last cross, signal strength bar
- `Managed Exposure` ladder: Tier 1 / 2 / 3 with current active tier highlighted

---

### 3. Bench — `files/vires-bench.jsx`

**Purpose**: the strategy R&D cockpit. Where experiments are designed, run, and promoted.

**Key components**:
- Top: KPI strip (promoted count, in-progress runs, queued, avg run time)
- **Promoted Strategies** table: name, sleeve, era-sharpe, promotion date, status pill, passport link
- **Recent Runs** list: run id, strategy name, status (SUCCEEDED / PARTIAL / FAILED), evaluated / total, winner, primary metric, click for detail
- **Era Robustness Matrix**: grid of strategies × historical eras, each cell is a mini-sparkline or sharpe cell, tonal-color-coded (green for >1, neutral near 1, red for <0)
- Floating `Expanded lifecycle` link → `vires-lifecycle.jsx`

### 3a. Passport detail — `files/vires-passport.jsx`
- A full strategy detail page. Cover card with name + sleeve + status, era matrix, param table, diagnostic plots, promotion history.

### 3b. Run detail — `files/vires-run-detail.jsx`
- Single-run view. Objective, parameter grid scanned, winner, leaderboard, plateau visualization.

### 3c. Lifecycle — `files/vires-lifecycle.jsx`
- Expanded view of a strategy's lifecycle: idea → bench → promotion → live → retirement.

---

### 4. Plateau Primer — `files/Primer 04 - Parameter Stability.html`

Standalone single-page narrative explainer. Three layout variations were explored (A table, B topographic contours, C thumbnails) — **B is the primary direction**, A and C live as "also considered" thumbnails.

**Structure** (scroll-through):
1. Eyebrow `PRIMER · 04 / PARAMETER STABILITY`, title, subtitle
2. Hero visualization: parameter heatmap with topographic contour overlay showing "plateau" vs "lucky peak" regions
3. Narrative body: what a plateau is, why it's the thing we want, how we detect it
4. Side-by-side thumbnails: "Isolated lucky peak" vs "Broad plateau" (still to do per v2 roadmap)
5. Sidebar / related: links back to Bench metrics

Data: `files/primer-stability-data.js` (synthetic parameter grid + contour lines)

---

### 5. Talon chat modal/sheet — `files/vires-talon.jsx`

**Entry point**: clicking the sun/moon celestial in the Account Equity hero.

**Desktop**: centered modal, 520px wide, 560px tall.
**Mobile (≤640px)**: bottom sheet, full width, 85vh, with a grab handle at top.

**Layout**:
- Top bar: Talon avatar (small celestial SVG, same one as hero), title `Talon`, subtitle `Analyst · Vires`, close X
- Scroll area: message list. User bubbles right-aligned (cream on dark), Talon bubbles left-aligned (slightly lighter dark on dark, gold left-border).
- Above composer: **suggested prompts** (3 pills, gold hairline border). Scoped to the Vires context:
  - "What's driving today's equity move?"
  - "Are any strategies degrading in recent eras?"
  - "Summarize bench promotions pending review."
  - "Is market regime favoring any sleeve right now?"
- Composer: textarea, gold submit button (arrow icon), ⌘+Enter to send
- Typing indicator: 3 gold dots, staggered fade

**Wiring**:
- Currently calls `window.claude.complete()` — sandbox helper. **In production, route to `api/chat/route.ts`** (already set up for Talon in the existing Next.js codebase, carried over from the ClawBoy iteration). Keep the name "Talon" — the system prompt is already written for that persona.

---

## Interactions & Behavior

### Navigation
- Command strip nav items set `page` state. `Trading` and `Bench` swap the body. `plateau` is an `<a href>` to the primer HTML — in the real app this becomes a route.
- Sleeve cards on Trading navigate into sleeve sub-screens via local component state. Back is a breadcrumb `← Trading` at the top of the sub-screen.

### Shared timeframe
- Hook `useSharedTimeframe()` reads/writes `localStorage['vr.tf']` and broadcasts `vr:tf-change` CustomEvents.
- Both `EquityChart` and every `SleeveSparkline` subscribe. Change one dropdown → all update in lockstep.
- In production, this should be a small app-level store (Zustand, React Context, whatever the codebase uses).

### Celestial click → Talon
- Click or Enter/Space on the celestial button opens `TalonChat` as an overlay.
- The celestial itself has `aria-label="Open Talon chat"` and tabindex=0.
- Close via X, ESC key, or backdrop click.

### Equity chart timeframe dropdown
- Click dropdown → menu opens below, click a timeframe → dropdown closes, chart re-renders
- Outside-click dismisses
- Keyboard: arrow keys cycle, Enter selects, ESC closes

### Hover states
- All cards: no visible state on hover (intentional — the design is quiet). Only interactive inline items (pills, rows, links) hover-highlight.
- Watchlist rows: background brightens to `rgba(241,236,224,0.03)` on hover
- Pills: no hover change
- Buttons: opacity increases to 1.0 from 0.9 on hover

### Animations
- **AnimatedNumber** (shared): counts up from 0 to target over ~900ms, eased
- **Starfield**: requestAnimationFrame loop, Brownian drift, alpha pulse — very slow (~15s cycle), low cost
- **Orbit rings**: pure CSS, two layered `animation: orbit-rotate 240s linear infinite`, one CW one CCW
- **Celestial pulse**: 4s ease-in-out alternate on the corona
- **Mode pill dot**: 1.4s pulse (opacity 0.5 → 1)
- **Typing indicator**: 3 dots, 0.4s stagger

### Responsive
- **Mobile pass is DONE** on the Plateau primer and Talon chat.
- **Trading and Bench have not been mobile-optimized** — that's still TODO for the target codebase.
- Expected breakpoint: 768px tablet, 640px phone.

---

## State Management

Local component state (`useState`) is sufficient everywhere in the prototype. In production:

- **Account data, positions, equity curve**: fetch from backend (the `window.VIRES_DATA` shape in `data.js` is a reasonable API contract — extracted from the real `operator-feed.json`).
- **Timeframe selection**: shared via hook. Move to Context / store.
- **Talon chat history**: local to the modal is fine; consider persisting to `localStorage` so refresh doesn't lose context.
- **Bench runs / passports**: fetch by id.
- **Identity variant (Champagne / Obsidian / Auto)**: stored in `localStorage` via the Tweaks panel. Move this to a user preference setting.

---

## Design Tokens

All in `files/vires.css`.

### Colors

```css
--vr-ink:         #0a0a0c;   /* page background */
--vr-ink-raised: #121216;    /* cards / raised surfaces */
--vr-ink-deep:   #060608;    /* deepest wells */
--vr-cream:       #f1ece0;   /* primary text */
--vr-cream-dim:   #c9c3b4;   /* secondary text */
--vr-cream-mute:  #8b8678;   /* tertiary / labels */
--vr-cream-faint: #5a5648;   /* disabled / dividers */
--vr-line:        rgba(241, 236, 224, 0.08);
--vr-line-hi:     rgba(241, 236, 224, 0.16);

--vr-gold:        #c8a968;   /* primary accent */
--vr-gold-bright: #e4c483;
--vr-gold-dim:    #8a7646;

--vr-up:          #7fc29b;   /* positive / live */
--vr-down:        #d97a6b;   /* negative */
--vr-warn:        #d4a85c;

--vr-sleeve-stocks:  #8faac6;  /* slate-blue */
--vr-sleeve-options: #b8ad95;  /* dim cream */
--vr-sleeve-crypto:  #c8a968;  /* amber (same as gold) */
```

Obsidian variant shifts cream cooler and gold to silver-blue — see `vires.css` `[data-vr-theme="obsidian"]` block.

### Typography

```css
--ff-display: 'Cormorant Garamond', 'Times New Roman', serif;  /* hero numbers, h1/h2 */
--ff-sans:    'Inter', system-ui, sans-serif;                  /* body, UI */
--ff-mono:    'IBM Plex Mono', monospace;                      /* tickers, inline code */
--ff-num:     'Cormorant Garamond', serif;                     /* tabular numerics in displays */
```

Scale (see `.t-display`, `.t-h1`, `.t-h2`, `.t-h3`, `.t-body`, `.t-label`, `.t-eyebrow`, `.t-num`, `.t-ticker` in `vires.css`):
- Display: Cormorant 300, 64–96px, tracking -0.02em
- H1: Cormorant 400, 32px
- H2: Cormorant 400, 22px
- H3: Inter 500, 16px
- Body: Inter 400, 14px, line-height 1.6
- Label: Inter 400, 11px, `--vr-cream-mute`
- Eyebrow: Inter 500, 10px, letter-spacing 0.2em, uppercase
- Numerics: `--ff-num`, tabular-nums feature-setting
- Ticker: IBM Plex Mono 500, variable size

### Spacing
Hand-placed; follows a 4px base grid. Card padding 18–22px. Section gaps 14–32px. No formal Tailwind-like scale.

### Border radius
- Cards: 0 (crisp) or 3px (pills/buttons)
- No rounded-2xl anywhere — design is hard-edged

### Shadows
- Cards: no shadow. Separation is via 1px `--vr-line` borders only.
- Dropdowns / modals: `0 12px 28px rgba(0,0,0,0.45)`

### Border styles
- All internal dividers: `1px solid var(--vr-line)`
- Emphasized dividers (table headers): `1px solid var(--vr-line-hi)`

---

## Assets

- **Fonts**: Google Fonts — Cormorant Garamond (300, 400, 500), Inter (400, 500, 600), IBM Plex Mono (400, 500). Referenced via `<link>` in `Vires Capital v2.html`.
- **Icons**: All icons are hand-drawn inline SVG (sun, moon, orbit rings, celestial, ViresMark logo, chart glyphs, nav icons). No icon library. Paths live in `vires-shared.jsx` (`ViresMark`, `Celestial`, `OrbitRing`, `Starfield`) and inline within each component.
- **No raster images.**

---

## Files

In `files/`:

**Entry points**
- `Vires Capital v2.html` — main prototype shell. Mounts the React tree.
- `Vires Capital.html` — earlier version kept for reference only. Can be deleted if you want.
- `Primer 04 - Parameter Stability.html` — standalone primer.

**Design system / shared**
- `vires.css` — tokens, typography, card patterns, animations. **Start here.**
- `vires-shared.jsx` — `AnimatedNumber`, `EquityDisplay`, `OrbitRing`, `Starfield`, `ViresMark` logo, formatters (`fmtCurrency`, `fmtNum`, `toneOf`, `toneColor`).

**Pages & components**
- `vires-trading.jsx` — command strip, home hero, equity chart, sleeve cards, sleeve sub-screen (includes `SleeveSparkline`, `SleeveSummary`, `Watchlist`, `CryptoTSMOM`, `CryptoExposure`). This is the biggest file; ~1300 lines.
- `vires-bench.jsx` — bench page.
- `vires-passport.jsx` — strategy passport detail.
- `vires-run-detail.jsx` — single-run detail.
- `vires-lifecycle.jsx` — expanded lifecycle view.
- `vires-talon.jsx` — Talon chat modal/sheet.

**Data**
- `data.js` — `window.VIRES_DATA`, extracted from `operator-feed.json`. Shape is close to the intended production API.
- `operator-feed.json` — the source feed it was extracted from.
- `primer-stability-data.js` — primer's parameter grid + contour data.
- `primer-stability-shared.jsx`, `primer-stability-views.jsx` — primer internals.

**Archive / reference**
- Files prefixed `bench-`, `trading-`, `ticket-`, `queue-`, `chat-`, `operator-`, `agent-`, `tickets.json`, `queue.json`, `trading.json`, `globals.css`, `page.tsx`, `layout.tsx`, `nav.tsx`, `api/` — **from the previous ClawBoy Next.js app**. Kept for reference while porting (especially `api/chat/route.ts` which is already Talon-aware) but not part of the prototype itself.

---

## Open TODOs (known, roadmap)

Carried over from the design iterations:

1. **Primer 05** — next primer in the series (topic TBD). Tomorrow.
2. **Contrast thumbnails** on Primer 04 — "Isolated lucky peak" vs "Broad plateau" side-by-side visualization.
3. **Inline "what is this?" popovers** on each Bench metric card, linking to the Plateau primer. Once done, the top-level `plateau` nav item gets deleted (it's scaffolding).
4. **1D slice panel** when a cell in the era robustness matrix is clicked.
5. **Mobile pass** on Trading and Bench pages.
6. **Talon in production**: wire to `api/chat/route.ts`, swap `window.claude.complete()` out.
7. **Mode indicator**: when flipping to real capital, change `PAPER` → `LIVE` in `vires-trading.jsx` and both colors from `--vr-gold` back to `--vr-up`.
