# Guided Slice — UX Stage 1 Handoff

**Date:** 2026-05-06
**From:** Claude
**For:** Codex + future build phases
**Stage:** UX Stage 1 (low-fi only) — feeds the Phase 0 contract-freeze handshake
**Companion:** `CLAUDE_REVIEW_2026-05-06_lab_two_mode_response_to_codex.md` (architecture lock + build plan)

## Purpose

Put pixel pressure on the locked contracts before Phase 0 freezes. Surface every field, projection, event, and copy element the user-facing UX needs, so Codex can disposition each as **ADD** (new field), **MAP** (existing field satisfies it), or **REJECT** (UI-local copy/state, not contract concern).

## Scope

Low-fi only. ASCII wireframes for the eleven surfaces in the internal Guided slice. No production UI. No backend wiring. No new product model — only contract pressure on the architecture already locked in Round 7.

If a UX requirement seems to imply a new product concept, it gets re-framed as contract pressure on existing concepts, not as a request to expand scope.

---

## Wireframe set

Mobile-first viewport assumed throughout (≈390px wide). Boxes describe what each surface renders. Field references (in `code style`) point to specific contract fields the surface needs — these become the contract-needs list at the end of this doc.

### S1 — Questionnaire intro

```
┌───────────────────────────────────────┐
│ ●● Guided                             │  ← internal-preview banner top of every
│                                       │     Guided screen during slice
│ ┌───────────────────────────────────┐ │
│ │ INTERNAL PREVIEW · PRE-ADMISSION  │ │  ← amber pill, hard-coded for slice
│ └───────────────────────────────────┘ │
│                                       │
│ Find a strategy that fits             │
│ how you want to invest                │
│                                       │
│ A few questions, ~2 minutes.          │
│ Your answers shape what we suggest.   │
│ Paper trading only — no real money    │
│ moves until you say so.               │
│                                       │
│         [ Start questionnaire ]       │
│                                       │
│ ─────────────────────────────────────  │
│                                       │
│ How this works                        │
│ • You answer 5 short questions        │
│ • We propose a strategy that fits     │
│ • You see the worst case before you   │
│   accept                              │
│ • Paper trading begins on accept      │
│                                       │
└───────────────────────────────────────┘
```

Surface needs: nothing user-specific yet. The internal-preview banner is hard-coded by environment flag (`UX_INTERNAL_PREVIEW=true`) and is global, not per-screen.

### S2 — Questionnaire questions (multi-step)

```
┌───────────────────────────────────────┐
│ ●● Guided · Question 2 of 5      [×]  │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ INTERNAL PREVIEW · PRE-ADMISSION  │ │
│ └───────────────────────────────────┘ │
│                                       │
│ How would you feel if your account    │
│ dropped 20% in a single month?        │
│                                       │
│ ○ I'd hold and wait it out            │
│ ● I'd be uncomfortable but stay       │
│ ○ I'd want to cut losses immediately  │
│ ○ I'd sell everything                 │
│                                       │
│ ─────────────────────────────────────  │
│                                       │
│ Why we ask: people often              │
│ overestimate their tolerance until    │
│ they see the number. This shapes      │
│ what we propose.                      │
│                                       │
│       [ Back ]      [ Next → ]        │
└───────────────────────────────────────┘
```

Question pattern repeats for: risk profile (conservative/balanced/risk-on), drawdown tolerance (this one), asset class preference, time horizon, capital + cadence.

Surface needs:
- Questionnaire definition is contract-versioned (`questionnaire.version`)
- Each answer maps to typed values that feed the matcher
- Progress indicator drives off `questionnaire.questions[].sequence`
- "Why we ask" copy is per-question, ships with questionnaire definition

### S3 — Match proposal preview

```
┌───────────────────────────────────────┐
│ ●● Guided · Your match           [×]  │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ INTERNAL PREVIEW · PRE-ADMISSION  │ │
│ └───────────────────────────────────┘ │
│                                       │
│ Steady Tide                           │  ← friendly_name
│ Tactical equity strategy              │  ← mandate-derived subtitle
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ WORST CASE WE'VE SEEN             │ │  ← the headline
│ │                                   │ │
│ │      − 8.9 %                      │ │  ← max_historical_drawdown
│ │   in any rolling period           │ │
│ │                                   │ │
│ │ This is the deepest drop the      │ │
│ │ strategy has experienced in our   │ │
│ │ testing. It could be worse.       │ │
│ └───────────────────────────────────┘ │
│                                       │
│ How it works                          │
│ ─────────────────                     │
│ Trades a small set of large-cap US    │  ← thesis_plaintext
│ stocks when momentum aligns with a    │
│ supportive market regime. Holds       │
│ each position up to 15 days, exits    │
│ on stop or target. Rest of your       │
│ capital parks in short-term Treasury  │
│ ETFs while waiting.                   │
│                                       │
│ Asset class · US equities             │  ← asset_class
│ Hold time · ~5–15 days per trade      │  ← holding_period
│ Trade rate · ~2–4 per month           │  ← trade_frequency_typical
│                                       │
│ ─────────────────────────────────────  │
│                                       │
│ Why this fits you                     │
│ ─────────────────                     │
│ • Conservative drawdown tolerance     │  ← winner_rationale.matched_tags[]
│ • US equities preference              │
│ • Multi-week holding horizon          │
│                                       │
│ ─────────────────────────────────────  │
│                                       │
│ ▸ Show technical details              │  ← collapsed by default
│                                       │
│  [ Decline ]  [ Maybe later ]  [ → ]  │
│                                       │
└───────────────────────────────────────┘
```

`Show technical details` expands to:

```
│ ▾ Hide technical details              │
│                                       │
│ Backing strategy                      │
│ regime_aware_momentum :: stop_5_target_15 │  ← backing_strategy_id
│ Manifest q076b...frozen_reference      │  ← execution_manifest_id ref
│ Strategy version v0.1                  │  ← library_entry_version
│ Matcher version v1.0                   │  ← matcher_version
│ Questionnaire version v1.0             │  ← questionnaire_version
│                                       │
│ Evidence shown                         │
│ ─────────────────                     │
│ Multi-era backtest                     │  ← evidence tier label
│ Sample · 4 yr / 247 trades             │
│ Regime coverage · CALM, VOLATILE       │
│ Broker realism · simulated fills       │
│ Fill realism · 5 bps slippage assumed  │
│ Last evaluated · 2026-04-11            │
│                                       │
│ Forward observation                    │
│ ─────────────────                     │
│ Shadow forward · 22 sessions           │
│ Paper forward · 0 sessions (this is   │
│   the first paper enrollment)         │  ← cold-start honesty
│                                       │
│ Other strategies considered            │
│ • BTC managed exposure — declined,     │
│   crypto preference not selected       │
│ • Defensive value proxy — declined,    │
│   sample size too small                │  ← candidates_considered[]
│                                       │
```

The technical-details expansion is the **transparency surface** — every decision visible. Not the polished copy.

### S4 — Disclosure acceptance

The high-stakes screen. Mobile-first, scannable in ≈30 seconds. See **Disclosure surface exploration** section below for the full rationale.

```
┌───────────────────────────────────────┐
│ ●● Guided · Read before accepting     │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ INTERNAL PREVIEW · PRE-ADMISSION  │ │
│ └───────────────────────────────────┘ │
│                                       │
│ You're about to enroll in             │
│ Steady Tide                           │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ THE WORST WE'VE SEEN                  │
│        − 8.9 %                        │  ← headline drawdown again
│   in any rolling period               │
│ It could be worse.                    │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ ⚠  THIS IS PAPER TRADING              │  ← paper/live distinction
│ No real money will move. We're        │
│ practicing with simulated capital.    │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ WHAT YOU'RE ACCEPTING                 │
│                                       │
│ • Steady Tide can buy and sell US     │
│   equities on your paper account      │
│ • Cash that isn't deployed parks in   │
│   short-term Treasury ETFs            │
│ • Each position has a 5% stop loss,   │
│   15% target, and ~15-day max hold    │
│ • You can pause or stop at any time   │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ WHAT WE DON'T PROMISE                 │
│                                       │
│ Past performance does not guarantee   │  ← not_guaranteed_copy
│ future results. The strategy could    │
│ lose money. The drawdown above is     │
│ what we've observed in testing —      │
│ real conditions could be worse.       │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ THE EVIDENCE                          │  ← 5-dimension surface
│                                       │
│ Freshness  · evaluated 2026-04-11     │
│ Sample     · 247 trades over 4 yrs    │
│ Regimes    · CALM + VOLATILE          │
│ Broker     · simulated fills          │
│ Fills      · 5 bps slippage assumed   │
│                                       │
│ Paper observation so far · 0 days     │  ← cold-start: tells the truth
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ ▸ Show full disclosures               │  ← expands to legal text
│                                       │
│ ☐ I've read the above. I understand   │  ← attestation
│   this is paper trading, the          │
│   strategy can lose money, and        │
│   past performance is not a           │
│   guarantee.                          │
│                                       │
│ [ Cancel ]              [ Accept → ]  │  ← Accept disabled until checkbox
│                                       │
└───────────────────────────────────────┘
```

Acceptance triggers `accept_match(proposal_id)`. Captures `disclosure_version_id`, attestation timestamp, scroll-to-end signal (UI-local), checkbox state.

### S5 — Broker connect (initial)

```
┌───────────────────────────────────────┐
│ ●● Guided · Connect your broker  [<]  │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ INTERNAL PREVIEW · PRE-ADMISSION  │ │
│ └───────────────────────────────────┘ │
│                                       │
│ Steady Tide is ready                  │
│ Connect a paper account to start.     │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │  ALPACA    Paper account          │ │
│ │  Connect via OAuth                │ │
│ │                       [ Connect ] │ │
│ └───────────────────────────────────┘ │
│                                       │
│ Other brokers coming. For now,        │
│ Alpaca paper is the only supported    │
│ broker for this strategy.             │
│                                       │
│ ─────────────────────────────────────  │
│                                       │
│ Why we connect                        │
│ • To run trades on your paper account │
│ • To read positions and balances      │
│ • To verify account compatibility     │
│                                       │
│ Read-only fallback: API key (advanced)│
│                                       │
└───────────────────────────────────────┘
```

### S6 — Broker pending check

```
┌───────────────────────────────────────┐
│ ●● Guided · Setting up...        [×]  │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ INTERNAL PREVIEW · PRE-ADMISSION  │ │
│ └───────────────────────────────────┘ │
│                                       │
│              ⠋                        │  ← spinner
│                                       │
│  Verifying your broker connection...  │
│                                       │
│  Status: ACCEPTED_PENDING_BROKER      │  ← hard rule: NOT "enrolled"
│                                       │
│  Checking:                            │
│  ✓ Connection authorized              │
│  ✓ Paper account exists               │
│  ⠋ Equity trading enabled             │
│  ○ Buying power adequate              │
│  ○ Capability matrix matches          │
│                                       │
│  This usually takes a few seconds.    │
│                                       │
│  [ Cancel ]                           │
│                                       │
└───────────────────────────────────────┘
```

After ~10 seconds without resolution: "Still working..." with retry option.

### S7 — Broker outcome (three states)

**S7a — `BROKER_RETRYABLE`**

```
┌───────────────────────────────────────┐
│ ●● Guided · Try again            [<]  │
│                                       │
│ Connection issue                      │
│                                       │
│ We couldn't reach Alpaca right now.   │
│ This is usually temporary.            │
│                                       │
│  Reason: API timeout                  │  ← broker_failure_detail
│  Source: Alpaca paper /v2/account     │
│  Time:   2026-05-06 16:42:11 ET       │
│                                       │
│       [ Try again ]   [ Cancel ]      │
│                                       │
└───────────────────────────────────────┘
```

`Try again` triggers `retry_broker_setup(enrollment_id)`.

**S7b — `BROKER_ACTION_REQUIRED`**

```
┌───────────────────────────────────────┐
│ ●● Guided · Your account needs you    │
│                                       │
│ One thing to fix                      │
│                                       │
│ Your Alpaca paper account doesn't     │
│ have day-trading buying power         │
│ enabled for this strategy.            │
│                                       │
│ ┌─ How to fix it ────────────────┐   │
│ │ 1. Open Alpaca dashboard       │   │
│ │ 2. Settings → Account          │   │
│ │ 3. Enable "Pattern Day Trader" │   │
│ │ 4. Come back here              │   │
│ └────────────────────────────────┘   │
│                                       │
│  [ Open Alpaca ]   [ I've fixed it ]  │
│                                       │
└───────────────────────────────────────┘
```

`I've fixed it` re-runs the capability check. Loops until pass or timeout.

**S7c — `BROKER_INELIGIBLE`**

```
┌───────────────────────────────────────┐
│ ●● Guided · Not the right fit         │
│                                       │
│ Steady Tide can't run on this account │
│                                       │
│ Your Alpaca account is cash-only,     │
│ but Steady Tide assumes margin        │
│ availability for short windows.       │
│                                       │
│ This isn't a problem with the         │
│ strategy or your account — they       │
│ just aren't compatible.               │
│                                       │
│ ─────────────────────────────────────  │
│                                       │
│ Two options:                          │
│                                       │
│   ┌───────────────────────────────┐   │
│   │ Find a different strategy     │   │
│   │ that fits this account        │   │
│   │                  [ Rematch ]  │   │
│   └───────────────────────────────┘   │
│                                       │
│   ┌───────────────────────────────┐   │
│   │ Connect a different broker    │   │
│   │ account                       │   │
│   │                 [ Reconnect ] │   │
│   └───────────────────────────────┘   │
│                                       │
└───────────────────────────────────────┘
```

`Rematch` triggers `request_rematch(user_id, source_failure_id=enrollment_id)` — generates a new `guided_match_proposal` carrying the failed enrollment as provenance.

### S8 — `ACCEPTED_PENDING_BROKER` short-window

This is the same surface as S6 but rendered inline on the home/sleeve view if the user navigates away during the check. Treated as a transient state, never persistent.

```
┌───────────────────────────────────────┐
│ Steady Tide                           │
│ ┌────────────────────────────────┐    │
│ │ INTERNAL PREVIEW               │    │
│ │ ⠋ Setting up your paper account│    │
│ │ This usually takes a few sec.  │    │
│ └────────────────────────────────┘    │
└───────────────────────────────────────┘
```

Hard copy rule: **never** says "enrolled" or "active" or "running" while in this state.

### S9 — `guided_enrollment.status = ACTIVE` (paper-running)

The hero of the running enrollment. Lives inside the existing Vires sleeve view, integrated rather than replacing. CANDIDATE badge visible.

```
┌───────────────────────────────────────┐
│ ●● Steady Tide                        │
│                                       │
│ ┌────────────────────────────────┐    │
│ │ INTERNAL PREVIEW · PRE-ADMISSION│   │  ← from CANDIDATE library entry
│ └────────────────────────────────┘    │
│                                       │
│ ┌────────────────────────────────┐    │
│ │ PAPER · RUNNING                │    │  ← enrollment.status = ACTIVE
│ │ Not validated. Not approved    │    │     copy clarifies what
│ │ for live capital.              │    │     ACTIVE means
│ └────────────────────────────────┘    │
│                                       │
│       $ 54,213.11                     │  ← current_value
│       + $ 142  ·  this week           │  ← period delta (from existing
│       + $ 18 unrealized               │     period-aware hero)
│                                       │
│ ────────────────────────────────────  │
│ [equity-curve sparkline + tf dropdown │
│  controls per existing SleeveSummary] │
│ ────────────────────────────────────  │
│                                       │
│ Holding                               │
│   AAPL · 5 shares · $1,427            │
│   NVDA · 7 shares · $1,440            │
│ Cash reserve                          │
│   SGOV · 511 shares · $51,325         │
│                                       │
│ Paper observation: 3 days             │  ← evidence cold-start tracker
│ ────────────────────────────────────  │
│                                       │
│ ▸ See evidence                        │  ← jumps to S10
│ ▸ Activity                            │  ← jumps to S11
│                                       │
│ ⋯ More                                │  ← pause / stop / upgrade
│                                       │
└───────────────────────────────────────┘
```

The `⋯ More` menu surfaces:
- Pause enrollment
- Stop (hold to close) / Stop (liquidate)
- Accept upgrade (if `UPGRADE_AVAILABLE` on backing strategy)
- Acknowledge notice (if NOTICE_ONLY disclosure pending)

Each routes to the corresponding governed command per Round 7 command list.

### S10 — Paper monitoring readback (deeper)

```
┌───────────────────────────────────────┐
│ ●● Steady Tide · Evidence       [<]   │
│                                       │
│ ┌────────────────────────────────┐    │
│ │ INTERNAL PREVIEW · PRE-ADMISSION│   │
│ └────────────────────────────────┘    │
│                                       │
│ Backtest evidence                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ Tier: BENCH_MULTI_ERA                 │
│                                       │
│ Freshness  · evaluated 2026-04-11     │  ← 5-axis evidence display
│             ⚠ 25 days ago             │     never collapsed
│ Sample     · 247 trades, 4 yrs        │
│ Regimes    · CALM ✓  VOLATILE ✓       │
│             RECOVERY ⚠ thin           │
│ Broker     · simulated fills          │
│ Fills      · 5 bps slippage           │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ Forward observation                   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ Shadow forward                        │
│   22 sessions · 2026-04-15 → today    │
│   No fills · live signals only        │
│                                       │
│ Paper forward (this enrollment)       │
│   3 sessions                          │  ← cold-start, honest
│   8 fills · 0 stops · 1 take-profit   │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ Live observation                      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ None. This strategy has not been      │
│ run with real money.                  │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ Strategy mandate                      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ TACTICAL_PARTIAL                      │  ← mandate field
│                                       │
│ Steady Tide is not a full equity      │  ← mandate-derived copy
│ allocator. It deploys 5–30% of your   │
│ stock allotment based on regime, and  │
│ parks the rest in short-term Treasury │
│ ETFs while waiting.                   │
│                                       │
│ This is intentional. The strategy is  │
│ a tactical participation strategy,    │
│ not an attempt to be fully invested.  │
│                                       │
│                                       │
└───────────────────────────────────────┘
```

The mandate disclosure block above is what closes the "starter strategy ≠ starter product" gap from Codex's main concern. It's the contract enforcing honest framing.

### S11 — Unified event/history surface

```
┌───────────────────────────────────────┐
│ ●● Steady Tide · Activity        [<]  │
│                                       │
│ ┌────────────────────────────────┐    │
│ │ INTERNAL PREVIEW · PRE-ADMISSION│   │
│ └────────────────────────────────┘    │
│                                       │
│ Filter:  [ All ▾ ]  [ Last 7d ▾ ]     │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ Today · 2026-05-06                    │
│                                       │
│ ⏱  11:45 AM   AAPL bought             │
│    5 shares at $321.37 (paper)        │
│    Triggered by  Steady Tide          │
│    Reason  Momentum signal · regime   │
│            CALM                       │
│    Source  rebuild execution_report   │
│    Actor   SYSTEM                     │
│                                       │
│ ⏱  08:00 AM   AVGO sold               │
│    3 shares at $456.20 (paper)        │
│    Triggered by  Steady Tide          │
│    Reason  Holding period ended       │  ← portfolio_action
│    Source  portfolio_action_report    │
│    Actor   SYSTEM                     │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ Yesterday · 2026-05-05                │
│                                       │
│ ⏱  01:15 PM   $200 parked in SGOV     │
│    Triggered by  cash management      │  ← cash_management
│    Reason  Idle capital reserve       │
│    Actor   SYSTEM                     │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ 2026-05-03                            │
│                                       │
│ ⏱  09:30 AM   Paper enrollment        │
│             ACTIVE                     │  ← lifecycle event
│    Triggered by  you                  │
│    Reason  Match accepted             │
│    Actor   USER                       │
│                                       │
│ ⏱  09:29 AM   Disclosure accepted     │  ← attestation event
│    Version v1.0                       │
│    Actor   USER                       │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│ [ Load older ]                        │
│                                       │
└───────────────────────────────────────┘
```

Every row carries the same skeleton: timestamp · what happened · triggered by (strategy/cash management/user/support/system) · reason · source (where the event came from in the rebuild) · actor (USER / OPERATOR / SYSTEM).

When `support_intervention` events appear, they read like:

```
│ ⏱  04:13 PM   Enrollment paused       │
│    Triggered by  Support              │  ← actor: OPERATOR
│    Reason  Compliance review          │
│    By      operator id @op_3          │
│    You were notified  yes             │  ← user_notified flag
│                                       │
```

Critical: support actions never look like user actions. The visual skeleton for actor is consistent; the actor label is what changes.

---

## Copy risk notes

Five copy guardrails that the slice cannot violate. These are loud in the wireframes above; this section makes them explicit so reviewers can grep against them.

### CR1 — Two ACTIVEs

`enrollment.status = ACTIVE` ≠ `library_entry.status = ACTIVE`.

- Enrollment ACTIVE means: "your paper trading is running."
- Library ACTIVE means: "this strategy has cleared the 6-gate admission and is publicly available."

For the slice, every library entry is `CANDIDATE`. So enrollment ACTIVE happens against a CANDIDATE library entry. The UI must distinguish.

**Always allowed:**
- "Paper running"
- "Active paper enrollment"
- "Setting up your paper account"

**Never allowed (during the slice):**
- "Strategy validated"
- "Approved for live"
- "Successfully tested"
- "Ready for real money"
- Anything that implies the strategy is publicly available

S9's hero block (`PAPER · RUNNING / Not validated. Not approved for live capital.`) is the canonical copy treatment.

### CR2 — CANDIDATE non-public

CANDIDATE library entries:
- Surface only with explicit `INTERNAL PREVIEW · PRE-ADMISSION` badge
- Never appear in any public matcher run
- Never carry copy like "available," "recommended," "validated," or "approved"
- Are visible only when the dashboard is in internal/dev/admin mode (`UX_INTERNAL_PREVIEW=true` or equivalent flag)

**Always allowed (with badge):**
- "Internal preview"
- "Pre-admission"
- "Test enrollment"

**Never allowed:**
- "Available strategy"
- "Recommended for you"
- "Validated"
- "Approved"

The amber CANDIDATE pill is the constant visual reminder. It rides every screen the slice exposes.

### CR3 — Paper-running ≠ validated

The copy must not let "your paper enrollment is running" drift into "this strategy works." Three weeks of clean paper P&L is not validation.

**Always allowed:**
- "Paper trading"
- "Practice with simulated capital"
- "Observation in progress"

**Never allowed:**
- "Track record"
- "Proven strategy"
- "Performance history" (when only paper days exist; backtest evidence is separate)

The disclosure surface (S4) explicitly addresses this with the `⚠ THIS IS PAPER TRADING` block + the "What we don't promise" section.

### CR4 — Evidence typology, not performance promise

Evidence must always render the five dimensions orthogonally. Never collapse to a single number.

**Always allowed:**
- "247 trades over 4 years"
- "Last evaluated 2026-04-11"
- "Regime coverage: CALM, VOLATILE"

**Never allowed:**
- "Average return: +X%/year" (no aggregate as headline)
- "Sharpe 1.93" alone (the number out of context)
- "+X% backtest performance" (single-number framing)

The drawdown headline IS allowed because it's the worst case, framed as a worst case, with explicit "it could be worse" copy. That's not performance promise — it's drawdown disclosure, which is the opposite kind of communication.

### CR5 — Mandate disclosure (TACTICAL_PARTIAL vs full allocator)

The mandate field on the library entry drives copy. For Steady Tide as TACTICAL_PARTIAL, the surface must say so explicitly.

**Always allowed (for TACTICAL_PARTIAL):**
- "Tactical equity strategy"
- "Deploys 5–30% based on regime"
- "Parks remaining capital in short-term Treasury ETFs"
- "Not a full equity allocator"

**Never allowed (without a full-allocator mandate):**
- "Manages your stock sleeve"
- "Full stock allocation"
- "Replaces your equity exposure"

S10's mandate block is the canonical treatment. The mandate field on the contract drives the copy; the mandate-fit gate decides whether the strategy ships as TACTICAL_PARTIAL or behind a full-allocator wrapper.

---

## Disclosure surface exploration

### Goal

Mobile-first, scannable in ≈30 seconds. Legally defensible. Honest about evidence.

### Visual hierarchy (top to bottom)

1. **Strategy name** (1 line)
2. **Drawdown headline** (huge number, "the worst we've seen", "it could be worse" qualifier)
3. **Paper/live distinction** (warning box, unmissable)
4. **What you're accepting** (bulleted, plain language)
5. **What we don't promise** (not-guaranteed boilerplate, plain English)
6. **Evidence dimensions** (5 fields, never collapsed)
7. **Cold-start observation** ("Paper observation so far · 0 days")
8. **Show full disclosures** expansion (legal-team copy)
9. **Attestation checkbox** ("I've read the above…")
10. **Accept button** (disabled until checkbox checked)

### Read-time enforcement (UI-local)

- Accept button stays disabled until:
  - The user scrolls to the attestation checkbox (proxy for read-completion)
  - The checkbox is checked
  - (Optional T1) A minimum read time elapses (e.g., 15 seconds) — track but don't enforce in slice

### Required elements (driven by `disclosure_version` contract)

Every disclosure version contains:
- `thesis_plaintext` — paragraph
- `drawdown_headline_pct` + `drawdown_headline_period_label`
- `paper_live_distinction_copy` — fixed format with strategy-specific substitutions
- `not_guaranteed_copy` — boilerplate, may vary by jurisdiction (T_Q)
- `what_you_accept_bullets[]` — what the strategy can/cannot do
- `evidence_summary` — 5-dimension snapshot at publish time
- `technical_details_payload` — collapsed expansion content
- `required_attestation_text` — exact attestation wording

These are not invented per-render. They live in the disclosure_version artifact, immutable per version. Changing copy = new version (with `change_classification`).

### Optional expansion

`Show full disclosures` reveals:
- Full backtest details (returns, Sharpe, etc. — but in context, not as headline)
- Strategy parameters (entry signal, exit rules, position sizing math)
- Regulatory boilerplate (jurisdiction-specific)
- "Other strategies considered" rationale

Expansion content is not the headline; the disclosure surface above stands alone for the 30-second read.

---

## Event-history requirements

### Provenance fields per event

Every event row in the history surface (S11) must show:

| Field | Source | Required |
|---|---|---|
| `timestamp` | event.timestamp | yes |
| Action verb | derived from event.kind + event.affected_holdings | yes |
| Symbol(s) | event.affected_holdings[] | when applicable |
| Triggered by | derived from event.kind: "Steady Tide" / "cash management" / "you" / "Support" / "system" | yes |
| Reason | event.reason (prettified) | yes |
| Source | event.source (e.g., "rebuild execution_report") | yes |
| Actor | event.actor (USER / OPERATOR / SYSTEM) | yes |
| Actor ID | event.actor_id | when actor ≠ SYSTEM-default |
| User notified | event.user_notified | when actor = OPERATOR |
| Audit visibility | event.audit_visibility | metadata, controls render |

### Differentiation by kind

The visual skeleton stays consistent. The actor label and reason copy change per kind:

| `event.kind` | Triggered-by label | Example reason copy |
|---|---|---|
| `strategy_entry` | "Steady Tide" | "Momentum signal · regime CALM" |
| `strategy_exit` | "Steady Tide" | "Profit target reached" |
| `protective_exit` | "Steady Tide" | "Holding period ended" / "Stop loss triggered" |
| `cash_park` | "cash management" | "Idle capital reserve" |
| `cash_unpark` | "cash management" | "Capital released for trade" |
| `broker_confirmation` | (system) | "Order filled at $321.37" |
| `manual_action` | "you" / operator name | freeform |
| `support_intervention` | "Support" + operator id | reason_code + freeform |
| `system_event` | "system" | e.g., "Broker capability changed" |

The "actor" axis (USER / OPERATOR / SYSTEM) drives the visual differentiation; user-initiated actions look distinctly different from operator-initiated and system-initiated actions, but the *fields* are the same.

### Filtering and sorting

For the slice, minimal filters:
- All / Strategy / Cash management / Manual / Support
- Last 24h / 7d / 30d / All

Default sort: most recent first. Pagination via "Load older."

### Audit visibility default

The slice assumes `audit_visibility=USER_VISIBLE` for all events. T1 work locks the actual default for production (per the open T1 question on operator override visibility default).

INTERNAL_ONLY events do not render in the user-facing history but are present in the contract.

---

## Contract needs from UX (for Phase 0 freeze handshake)

For each item: Codex dispositions as **ADD** (new contract field), **MAP** (existing field satisfies it, document mapping), or **REJECT** (UI-local copy/state, not contract concern). Phase 0 freezes only after every item has a disposition.

### Library entry — `strategy_library.v1`

**N1 — `friendly_name`**
- UX surface: S3 match preview (heading), S9 enrollment hero, S11 event history "triggered by"
- Needed field/state/event: short consumer-facing name (≤32 chars)
- Why the UI needs it: the technical strategy id (`regime_aware_momentum::stop_5_target_15`) is unfit for any consumer surface
- Suggested source contract: `strategy_library.v1` (`library_entry.friendly_name`)
- Type: contract data

**N2 — `thesis_plaintext`**
- UX surface: S3 "How it works" block, S4 disclosure surface
- Needed field/state/event: plain-language paragraph describing what the strategy does, jargon-free, ≤120 words
- Why the UI needs it: consumer must understand what they're enrolling in
- Suggested source contract: `strategy_library.v1` and/or `disclosure_version` (likely on disclosure_version since it's versioned content)
- Type: contract data

**N3 — `mandate_subtitle`**
- UX surface: S3 below friendly_name, S10 mandate block
- Needed field/state/event: short copy derived from mandate enum (e.g., `TACTICAL_PARTIAL` → "Tactical equity strategy")
- Why the UI needs it: mandate field on its own is an enum; UI needs presentable text
- Suggested source contract: `strategy_library.v1.mandate_subtitle` (paired with `mandate` enum) OR a derivation map
- Type: contract data (preferred — avoids UI inventing copy)

**N4 — `mandate_disclosure_paragraph`**
- UX surface: S10 mandate block (the full paragraph explaining tactical partial deployment, etc.)
- Needed field/state/event: full mandate-explanation copy, paragraph length, written by operator/product team
- Why the UI needs it: closes the "starter strategy ≠ starter product" honesty gap explicitly on the read surface
- Suggested source contract: `disclosure_version.mandate_disclosure` (versions with the disclosure)
- Type: contract data

**N5 — `holding_period_typical_label`**
- UX surface: S3 metadata row
- Needed: human-readable hold time ("~5–15 days per trade")
- Suggested: `strategy_library.v1.holding_period_typical_label`
- Type: contract data

**N6 — `trade_frequency_typical_label`**
- UX surface: S3 metadata row
- Needed: "~2–4 per month"
- Suggested: `strategy_library.v1.trade_frequency_typical_label`
- Type: contract data

**N7 — `asset_class_label`**
- UX surface: S3, S4
- Needed: "US equities" (consumer-facing label, not enum)
- Suggested: `strategy_library.v1.asset_class_label`
- Type: contract data

**N8 — `library_entry.status` enum: CANDIDATE | ACTIVE | PAUSED | DEPRECATED | RETIRED**
- UX surface: every screen (drives the CANDIDATE banner)
- Already specced in Round 7 — confirming for completeness
- Suggested: `strategy_library.v1.status`
- Type: contract data

### Match proposal — `guided_match_proposal.v1`

**N9 — `winner_rationale.matched_tags[]`**
- UX surface: S3 "Why this fits you" bullets
- Needed: list of human-readable reasons keyed off questionnaire answers
- Why: consumer must see why the matcher chose this — auditability + trust
- Suggested: `guided_match_proposal.v1.winner_rationale.matched_tags`
- Type: contract data (matcher-version-stable copy, not freeform)

**N10 — `candidates_considered[]` with rejection_reason_label**
- UX surface: S3 technical details expansion ("Other strategies considered")
- Needed: list of candidates the matcher considered + why each was rejected (in human language)
- Why: transparency surface; closes the rules-first auditability requirement
- Suggested: `guided_match_proposal.v1.candidates_considered[].rejection_reason_label`
- Type: contract data

**N11 — `proposal.expires_at`**
- UX surface: implicit (a stale proposal becomes EXPIRED state, but the user might also see "this match expires in 24h" copy)
- Needed: timestamp for when the proposal becomes stale
- Suggested: `guided_match_proposal.v1.expires_at`
- Type: contract data

**N12 — `source_failure_id`**
- UX surface: S7c "Two options" section (when shown after a BROKER_INELIGIBLE)
- Needed: the failed enrollment id that triggered this proposal — provenance
- Already specced Round 7 — confirming
- Suggested: `guided_match_proposal.v1.source_failure_id`
- Type: contract data

### Disclosure version — `disclosure_version`

**N13 — `disclosure_version.change_classification: MATERIAL | NOTICE_ONLY | COSMETIC`**
- UX surface: drives whether re-acceptance is forced, notice is shown, or change is silent
- Already specced Round 5/6/7 — confirming, must be in Phase 0 explicitly
- Suggested: `disclosure_version.change_classification`
- Type: contract data

**N14 — `disclosure_version.consent_expires_at` / `reaffirmation_due_at`**
- UX surface: drives the `acknowledge_notice` and `reaffirm_consent` command UIs
- Already specced Round 5/6/7 — confirming
- Suggested: `disclosure_version.consent_expires_at` / `reaffirmation_due_at`
- Type: contract data

**N15 — `disclosure_version.drawdown_headline_pct` + `drawdown_headline_period_label`**
- UX surface: S3 worst-case block, S4 worst-case block
- Needed: the percentage AND the period it's measured over ("in any rolling period" / "in any 12 months" — phrasing matters legally)
- Suggested: `disclosure_version.drawdown_headline_pct` + `drawdown_headline_period_label`
- Type: contract data

**N16 — `disclosure_version.what_you_accept_bullets[]`**
- UX surface: S4 "What you're accepting" block
- Needed: structured bulleted list of what the strategy is permitted to do
- Suggested: `disclosure_version.what_you_accept_bullets`
- Type: contract data

**N17 — `disclosure_version.not_guaranteed_copy`**
- UX surface: S4 "What we don't promise"
- Needed: boilerplate language that may vary by jurisdiction (T_Q for jurisdiction logic)
- Suggested: `disclosure_version.not_guaranteed_copy`
- Type: contract data

**N18 — `disclosure_version.required_attestation_text`**
- UX surface: S4 attestation checkbox
- Needed: exact wording the user attests to
- Suggested: `disclosure_version.required_attestation_text`
- Type: contract data

**N19 — `disclosure_version.evidence_summary` (5 dimensions)**
- UX surface: S4 evidence block, S10 evidence display
- Needed: typed snapshot of the 5 dimensions at disclosure publish time:
  - `freshness.last_evaluated_at`, `freshness.data_window_end`
  - `sample_size.trade_count`, `sample_size.years_observed`
  - `regime_coverage[]` — list of regimes with strength label
  - `broker_realism.label` (e.g., "simulated fills")
  - `fill_realism.label` + parameters (e.g., "5 bps slippage assumed")
- Suggested: `disclosure_version.evidence_summary` (typed object, 5 axes)
- Type: contract data

**N20 — `disclosure_version.technical_details_payload`**
- UX surface: S3 / S4 expansion content
- Needed: structured technical detail surface (params, full backtest stats, manifest refs)
- Suggested: `disclosure_version.technical_details_payload`
- Type: contract data

### Enrollment — `guided_enrollment.v1`

**N21 — `enrollment.status` enum (full)**
- UX surface: drives every state-aware copy block in S6/S7/S8/S9
- Values: `ACCEPTED_PENDING_BROKER | BROKER_RETRYABLE | BROKER_ACTION_REQUIRED | BROKER_INELIGIBLE | ACTIVE | PAUSED | STOPPED_HOLD | STOPPED_LIQUIDATED | TERMINATED | UPGRADE_AVAILABLE | UNDER_REVIEW`
- Already specced — confirming the full enum
- Suggested: `guided_enrollment.v1.status`
- Type: contract data

**N22 — `enrollment.broker_failure_detail`**
- UX surface: S7a (terse), S7b (action guidance with link)
- Needed: structured failure-explanation field that drives the per-failure UI
  - `reason_code: API_TIMEOUT | INSUFFICIENT_BUYING_POWER | NOT_PDT_ENABLED | CASH_ONLY_ACCOUNT | …`
  - `human_label`
  - `remediation_steps[]` (when ACTION_REQUIRED)
  - `external_link` (e.g., Alpaca settings deep-link)
- Suggested: `guided_enrollment.v1.broker_failure_detail`
- Type: contract data (rebuild emits structured failure types)

**N23 — `enrollment.backing_strategy_state`**
- UX surface: S9 `⋯ More` menu (drives whether "Accept upgrade" is enabled)
- Needed: projection of backing-strategy state onto enrollment: `UPGRADE_AVAILABLE | UNDER_REVIEW | DEPRECATED | FORCED_EXIT_PENDING | NO_LONGER_SUPPORTED | NORMAL`
- Already specced Round 7 — confirming
- Suggested: `guided_enrollment.v1.backing_strategy_state` (read model projection from backing_strategy state)
- Type: projection data

**N24 — `enrollment.disclosure_state`**
- UX surface: S9 `⋯ More` menu (drives "Acknowledge notice" / "Reaffirm consent")
- Needed: state derived from `disclosure_version.change_classification` + `consent_expires_at`:
  - `NORMAL | NOTICE_PENDING | REAFFIRMATION_DUE | RE_ACCEPTANCE_REQUIRED`
- Suggested: `guided_enrollment.v1.disclosure_state` (read model projection)
- Type: projection data

### Read model / paper monitoring projection — new

**N25 — Read model object: `guided_enrollment_view`**
- UX surface: S9 (live values), S10 (evidence display)
- Needed: projection that combines:
  - current paper values (positions + cash)
  - `evidence_summary` (5 axes, current as-of)
  - `paper_observation_days_count`
  - `cumulative_paper_pnl_realized`
  - `cumulative_paper_pnl_unrealized`
  - `recent_events[]` (preview for the home view)
  - `pending_user_actions[]` (e.g., notice acknowledgments due)
- Why: the slice's monitoring readback needs a single projection to read; assembling client-side from raw artifacts is the failure mode the read/write split exists to prevent
- Suggested: new contract artifact `guided_enrollment_view.v1` (projection, regenerated by rebuild)
- Type: projection data (READ MODEL, per Round 7)

### Event history — unified

**N26 — Unified event/history projection: `enrollment_events_view`**
- UX surface: S11
- Needed: queryable event stream scoped to a single enrollment, with all kinds (strategy_entry, strategy_exit, protective_exit, cash_park, cash_unpark, broker_confirmation, manual_action, support_intervention, system_event), filtered by `audit_visibility=USER_VISIBLE` for the user-facing render
- Each event row needs: `timestamp, kind, affected_holdings, reason, source, actor, actor_id, user_notified, enrollment_id, strategy_id, audit_visibility`
- Why: the protective-sells dashboard bug we just fixed — elevated to architectural constraint per the standing principle order/event completeness
- Suggested: new contract artifact `enrollment_events_view.v1` (projection)
- Type: projection data

**N27 — `event.kind` enum (full slice set)**
- Suggested: `strategy_entry | strategy_exit | protective_exit | cash_park | cash_unpark | broker_confirmation | manual_action | support_intervention | system_event | enrollment_lifecycle (state transitions)`
- Type: contract data

**N28 — `event.reason_label` (prettified)**
- UX surface: S11 reason copy
- Needed: human-readable reason on every event, prettified by source (the existing `prettify_order_note` work in dashboard)
- Suggested: contract carries the raw `reason_code` + freeform `reason_text`; the projection layer prettifies into `reason_label` for the view
- Type: split — contract carries raw; projection holds prettified

### Questionnaire — versioned definition

**N29 — Questionnaire definition contract**
- UX surface: S2 questionnaire screens
- Needed: versioned questionnaire definition with:
  - `questionnaire.version`
  - `questions[]` ordered list, each with:
    - `key` (stable identifier)
    - `text`
    - `why_we_ask_text`
    - `answer_options[]` typed (with internal mapping value)
- Suggested: new contract `questionnaire.v1` (lives alongside the matcher)
- Type: contract data

**N30 — Questionnaire answers snapshot on proposal**
- UX surface: implicit (drives matcher rationale)
- Needed: answers stored on the proposal so the rationale is reproducible
- Suggested: `guided_match_proposal.v1.questionnaire_answers_snapshot` (versioned with questionnaire.version reference)
- Type: contract data

### Internal-preview environment flag

**N31 — `UX_INTERNAL_PREVIEW` environment flag**
- UX surface: drives the amber CANDIDATE banner everywhere
- Needed: env-driven toggle, not user-toggleable
- Why: hard rule — CANDIDATE must be visibly non-public. The flag is set in dev/internal builds; production builds with this off would never have CANDIDATE entries reach the matcher anyway, but the flag is the second line of defense.
- Suggested: env var or build-time flag (UI-local infrastructure; document in build config)
- Type: UI-local infrastructure (REJECT as contract concern, but document for the build)

### Other UI-local items (documented for Codex to confirm REJECT)

**N32 — Read-time enforcement on disclosure (S4)**
- UI-local UX state (scroll-to-end + checkbox), not contract data
- Suggested disposition: REJECT

**N33 — Filter selection state on event history (S11)**
- UI-local
- Suggested disposition: REJECT

**N34 — Sparkline timeframe state (already shared via TimeframeContext per existing dashboard)**
- UI-local, existing infrastructure
- Suggested disposition: REJECT

**N35 — Polling cadence for paper monitoring projection**
- Operational concern, not contract concern
- Suggested disposition: REJECT (deployment-time decision)

---

## Open UX questions for product/legal (T1 track, not slice-blocking)

These surfaced from the wireframing but route to T1 tracks rather than blocking Phase 0:

- **`audit_visibility` default** — already known T1 question; the slice assumes USER_VISIBLE. Wireframes assume operator-initiated events surface to the user with `Support` actor label; if T1 chooses INTERNAL_ONLY default, the rendering changes.
- **Disclosure read-time minimum** — slice doesn't enforce; T1 may add (e.g., 15 sec minimum scroll-and-read).
- **Match expiration policy** — `proposal.expires_at` exists in contract; UX policy for "this match expires in 24h" warning is a T1 product decision.
- **Mandate enum lock** — slice uses `TACTICAL_PARTIAL` / `FULL_ALLOCATOR` / `CORE_SATELLITE` / `OVERLAY` illustratively; the actual enum lock is T1.
- **Jurisdictional disclosure variants** — `not_guaranteed_copy` may need per-jurisdiction variants; T_Q counsel.
- **Onboarding placement of CANDIDATE banner** — for the slice it's hard-coded prominent; production placement (when nothing is CANDIDATE) is N/A.
- **Localization** — all copy assumed English; localization is post-launch.

---

## Stage 2 sketch (what comes after the freeze handshake)

After Phase 0 freezes:
- High-fidelity comps in the existing Vires Capital design system (gradients, typography, ambient particles, swipe nav)
- Static `/vires/guided/...preview` routes with mocked data shaped against frozen contracts
- Mock data fixtures: one CANDIDATE library entry, one questionnaire definition, one match proposal, one disclosure version, one enrollment, the full event fixture (strategy entry + protective exit + cash management + broker confirmation + lifecycle)
- The dashboard build runs in parallel with Codex's Phase 1–5 backend work; Phase 6 wires mocks → real projections

---

## Summary for Codex

**31 contract needs** to disposition (N1–N31) before Phase 0 freezes:
- 8 on `strategy_library.v1` (N1–N8)
- 4 on `guided_match_proposal.v1` (N9–N12)
- 8 on `disclosure_version` (N13–N20)
- 4 on `guided_enrollment.v1` (N21–N24)
- 2 new projection contracts (`guided_enrollment_view.v1`, `enrollment_events_view.v1`) (N25–N26)
- 2 on event/projection schema (N27–N28)
- 2 on questionnaire contract (N29–N30)
- 1 environment flag (N31)
- 4 explicitly UI-local with suggested REJECT disposition (N32–N35)

**5 copy guardrails** (CR1–CR5) that the slice and Audit 1 enforce.

**Disclosure surface** structure locked at the wireframe level; copy authored per disclosure version.

**Event history** unified by skeleton; differentiated by actor + reason; backed by `enrollment_events_view.v1` projection.

No new architecture introduced. All contract pressure resolves into existing concepts from the locked Round 7 architecture or into clearly UI-local concerns.

When Codex returns the dispositions, that's the input for the freeze handshake. Phase 0 contracts then freeze, and Stage 2 (hi-fi comps + mocked preview routes) begins.
