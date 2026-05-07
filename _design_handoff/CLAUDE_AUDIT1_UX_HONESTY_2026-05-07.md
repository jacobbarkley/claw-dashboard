# Audit 1 — UX Honesty Pass

**Date:** 2026-05-07
**From:** Claude
**For:** Codex + Jacob
**Scope:** Code-level honesty audit across the 7 Guided surfaces against the standing principles. Patch UI/copy/rendering issues that stay within the frozen contracts. Flag anything requiring backend/projection/seed changes for Codex.

## Verdict

**Code-level honesty: PASS with patches landed.** Eleven in-scope issues fixed in the dashboard. Two findings require backend/projection decisions and are flagged for Codex below.

## Patches landed (11)

| ID | Surface | Issue | Patch |
|---|---|---|---|
| F-S1.1 | S1+S2 questionnaire | Version label rendered `vv1` with canonical `version="v1"` | Replaced with `{questionnaire_id}.{version}` → `guided_onboarding.v1`. Matches the `proposal.questionnaire_version` shape. |
| F-S4.1 | S4 disclosure | Header "You're about to enroll" overclaims — acceptance creates `ACCEPTED_PENDING_BROKER`, not ACTIVE | Header reframed: "Start paper trading with X?" + sub-line "Accepting captures your consent and starts broker setup. Paper trading begins only after broker checks pass." |
| F-S5.1 | S5 broker pending | Hardcoded 5-step checklist invented sub-states the contract doesn't carry | Replaced with single honest "Checking broker capabilities…" tied to `broker_capabilities.status`. Removed dead `CheckRow` helper. |
| F-S5.5 | S8 ineligible | "Reconnect a different broker" button — only Alpaca supported today | Removed button. Only "Find a different match" remains as the actionable path. |
| F-S9.1 | S9 ACTIVE | No cold-start framing for low `paper_observation_days_count` | Added cold-start banner when days < 5: "Day zero — paper enrollment hasn't completed an observation period yet" / "X of 5 clean days. Numbers below are early signal, not a track record." |
| F-S9.2 | S9 ACTIVE | TACTICAL_PARTIAL mandate not visible from observed deployment | Added Deployment row showing `% in stocks · % in cash` with mandate label, computed from `current_value_usd - cash_value_usd`. Per Codex's seed (96% cash, 4% deployed), this exposes the partial-allocation reality on the surface. |
| F-S9.3a / F-S10.2 | S9 + S10 | `pending_user_actions` field on the view never rendered | Added `PendingUserActionsBanner` to `shared.tsx`. Renders on S9 + S10 when actions present. Action_type is humanized; due_at surfaced. |
| F-S10.1 | S10 monitoring | Same cold-start gap as F-S9.1 | Cold-start tracker now renders dashed border + explicit "Below 5-day threshold" copy when days < 5. |
| F-S11.1 | S11 events | `actionVerb` for SUPPORT_INTERVENTION hardcoded "Enrollment paused" | Now uses `e.reason_label ?? e.reason ?? "Support action"`. Same pattern as STATE_CHANGE. Per Codex's note that support_intervention is fixture-only break-glass; canonical seed reads "Internal preview support note" instead of always "paused". |
| F-S11.2 | S11 events | HOLDINGS_CHANGE branch rendered broker fills with same verb as strategy execution | Source-aware verb: when `source === "broker_confirmation"` and `kind === "HOLDINGS_CHANGE"`, render "Broker filled 5 SGOV" instead of "5 SGOV bought". Strategy execution stays "5 NVDA bought". CONSENT also now reads `reason_label` first. |
| F-S11.3 + F-S11.4 | S11 events | Times in UTC without indicator; no cold-start empty-state | Added "Times shown in UTC" footer. Empty-state copy distinguishes filter-empty ("No events match this filter") from history-empty ("Paper enrollment hasn't generated any events yet"). |

## Backend / projection findings flagged for Codex

These are not UI patches. They require contract or seed-data changes.

### F-S5.contract — Pending broker check granularity (low priority)

The contract today is `BrokerCapabilitySnapshot.status: NOT_CHECKED | CHECKING | VERIFIED | FAILED`. Single state, no sub-step structure. Phase 6 dashboard pending UI is now an honest single-step "Checking broker capabilities…" because the contract doesn't carry sub-state.

If a richer "Connection authorized ✓ · Paper account exists ✓ · Equity trading enabled ⠋ · Buying power adequate ○" UX is wanted, the contract needs structured sub-checks — e.g.:

```python
class BrokerCapabilityCheckStep(OCBaseModel):
    step: Literal["connection", "paper_account", "equity_trading", "buying_power", "capability_match"]
    status: Literal["pending", "running", "ok", "failed"]
    detail: str | None
    started_at: datetime | None
    completed_at: datetime | None

class BrokerCapabilitySnapshot(OCBaseModel):
    ...
    checks: list[BrokerCapabilityCheckStep] = Field(default_factory=list)
```

**Verdict:** not blocking. The honest single-step works fine. Surface this as a v2 enhancement if/when broker check latency justifies a step-by-step progress UX.

### F-S9.3 — Cash-reserve identification hardcoded to SGOV symbol

`active-enrollment-surface.tsx` filters `holdings.filter(h => h.symbol !== "SGOV")` to separate active holdings from cash reserve. This hardcodes "SGOV is cash" semantics in the UI. If the strategy ever uses TLT, BIL, or any other Treasury ETF as cash equivalent, the filter breaks silently.

**Two options for Codex:**

1. Add a `is_cash_reserve: bool` flag on `GuidedHoldingView` so the projection layer decides which holdings are cash-equivalent.
2. Extend `GuidedHoldingView.asset_type` to a union that includes `"CASH_EQUIVALENT"` alongside `"EQUITY"`, etc.

Option 1 is simpler and doesn't change the asset_type taxonomy. The projection knows which symbol the strategy treats as cash reserve via the execution manifest.

**Verdict:** not blocking the slice. Today only SGOV is used. Worth fixing before any strategy in the library uses a different cash-equivalent.

## Standing principles audit (not findings, just confirmation)

| Principle | Surface check | Status |
|---|---|---|
| Wall phrase: only promoted strategies enter guided | `library_entry.status = CANDIDATE` rendered loud on S9 hero block | ✓ |
| Vocabulary rule: enrollment ≠ sandbox | "Paper · running" copy on S9, "enrollment" never used for sandbox | ✓ |
| Evidence as typology, not strength score | EvidenceCard renders 5 axes (freshness, sample size, regime coverage, broker realism, fill realism) separately on S4 + S10. Never collapsed. | ✓ |
| PII/secrets separation | Only public/static artifacts in `data/guided/`. User-state via `GUIDED_LOCAL_REBUILD_PATH` only. | ✓ |
| Idempotency | `disclosure.required_attestation_text` rendered as the consent text + checkbox-gated Accept. `idempotency_key` shape (`user:action:proposal_id:session`) carried in `DisclosureAcceptanceSnapshot`. UI doesn't fabricate; backend command layer enforces. | ✓ |
| Exit clarity | Pause/stop-hold-to-close/stop-liquidate not yet surfaced in UI. State machine on enrollment includes them; no surface yet because Phase 6.2 only walks proposal → ACTIVE. Will land when an exit-action surface is built. | Deferred to next slice |
| Order/event completeness | All 7 source lanes in S11. Source-aware filter UI. user_notified flag rendered for OPERATOR events. audit_visibility filter respects USER_VISIBLE only. | ✓ |
| Mandate-fit | TACTICAL_PARTIAL surfaced on S4 + S10 + S9 (deployment % shows the partial allocation in actual capital usage). | ✓ |
| CANDIDATE for plumbing, ACTIVE for public | InternalPreviewBanner rides every preview route. S9 hero declares "library entry is CANDIDATE; not validated." | ✓ |

## Jacob's mobile/visual checklist

Walk these against `next dev` with `GUIDED_LOCAL_REBUILD_PATH` set. The Mock fallback badge should NOT appear on any of the seven preview routes; if it does, the helper or seed is misconfigured.

### `/vires/guided/preview/questionnaire`
- [ ] Intro page renders title + 5-question count
- [ ] "Start questionnaire (5 questions) →" button works
- [ ] Each question shows "Why we ask:" copy
- [ ] Version label reads "guided_onboarding.v1" (NOT "vv1")
- [ ] Walk through all 5 questions, see "Answers captured for the match" complete state
- [ ] Mobile: question text wraps cleanly, answer buttons full-width

### `/vires/guided/preview/match`
- [ ] Drawdown big number reads "−8.9%" with period label below
- [ ] mandate_subtitle visible under friendly_name
- [ ] "Why this fits you" lists matched_tags (canonical seed: balanced_risk, conservative_drawdown, multi_week_horizon, paper_internal, us_equities)
- [ ] "Show technical details" expansion shows backing strategy + considered candidates + 5-axis evidence
- [ ] Decline / Maybe later / Continue buttons render distinctly
- [ ] Mobile: drawdown big number doesn't crowd the eyebrow; bullets wrap cleanly

### `/vires/guided/preview/disclosure`
- [ ] Header reads "Start paper trading with Steady Tide?" (NOT "You're about to enroll")
- [ ] Sub-line about consent + broker setup visible
- [ ] Drawdown big number prominent
- [ ] Paper/live distinction in gold-accent block, unmissable
- [ ] "What you're accepting" 4 bullets visible
- [ ] Strategy mandate section: TACTICAL_PARTIAL eyebrow + paragraph explaining partial allocation
- [ ] "What we don't promise" copy visible
- [ ] 5-axis evidence cards visible (compact mode)
- [ ] "Show full disclosures" expansion works
- [ ] Attestation checkbox required to enable Accept button
- [ ] Footer shows disclosure_version_id + classification
- [ ] Mobile: long copy wraps, attestation checkbox is tappable

### `/vires/guided/preview/broker`
- [ ] State picker at top has 5 buttons: Connect / Pending / Retryable / Action req'd / Ineligible
- [ ] **Connect:** "Steady Tide is ready" hero, Alpaca connect card
- [ ] **Pending:** "Verifying broker connection…" — single honest checking row with `broker_capabilities.status · CHECKING`. NO multi-step fake checklist. Footer: "Not enrolled yet…"
- [ ] **Retryable:** "Connection issue" + remediation steps if any + Try again button
- [ ] **Action req'd:** "Your account needs you" + numbered remediation steps + "Open Alpaca" external link + "I've fixed it" button
- [ ] **Ineligible:** "Not the right fit" + ONLY "Find a different match" button (no "Reconnect a different broker")
- [ ] All 4 failure variants show reason_code + state + reason in monospace block
- [ ] Mobile: state picker scrolls horizontally without crowding

### `/vires/guided/preview/active`
- [ ] Hero block: "Paper · running" + "Not validated. Not approved for live capital. The library entry is CANDIDATE"
- [ ] **Cold-start banner visible** with canonical seed (paper_observation_days_count = 0): "Day zero — paper enrollment hasn't completed an observation period yet"
- [ ] Total value rendered as `formatUsd` ($50,012)
- [ ] Realized + Unrealized + paper · 0d period label
- [ ] **Deployment row** visible: "4% in stocks · 96% in cash (mandate: tactical partial)" — proves mandate-fit lands on the surface
- [ ] Holdings list (active stocks only, not SGOV)
- [ ] Cash reserve list (SGOV)
- [ ] Audit footer with enrollment.status / backing_strategy_state / library_entry.status / disclosure_state / paper_observation
- [ ] Mobile: hero block readable, deployment row wraps, holdings rows don't truncate

### `/vires/guided/preview/monitoring`
- [ ] "Evidence — never one number" eyebrow visible
- [ ] Evidence grouped by tier (BENCH_MULTI_ERA on canonical seed)
- [ ] "Live observation: None" empty state visible (no LIVE_OBSERVED tier seeded)
- [ ] **Cold-start tracker dashed border** when days < 5 + "Below 5-day threshold" copy
- [ ] Stat row: Paper observation 0 days · Realized P&L · Unrealized P&L
- [ ] Strategy mandate block (gold accent) with TACTICAL_PARTIAL + paragraph
- [ ] Backing strategy block with state / record / manifest / params hash

### `/vires/guided/preview/events`
- [ ] "Activity" eyebrow + "Every action in one place" header
- [ ] Filter row: All / Strategy / Protective / Cash mgmt / Broker / Manual / Support / System (8 buttons)
- [ ] **All 7 lanes render distinctly:**
  - CONSENT/manual_action → "you" actor, gold accent for user-initiated (good color)
  - STATE_CHANGE/system → "System" actor (per F4 fix: actor_type=SYSTEM)
  - SUPPORT_INTERVENTION/support_intervention → "Support · operator_jacob", gold accent, user notified · yes badge
  - HOLDINGS_CHANGE/strategy_execution → "Steady Tide" actor, "X NVDA bought"
  - HOLDINGS_CHANGE/portfolio_action → "Steady Tide (stewardship)" actor, "X AVGO sold" with reason "Protective exit"
  - HOLDINGS_CHANGE/cash_management → "Cash management" actor, "X SGOV bought"
  - HOLDINGS_CHANGE/broker_confirmation → "Broker" actor, **"Broker filled X SGOV"** (per F-S11.2 source-aware verb, not just "X SGOV bought")
- [ ] Filter chips work: tap "Support" → only support_intervention rows visible; tap "All" → all 7 lanes back
- [ ] Empty-state when filter has no matches
- [ ] "Times shown in UTC" footer visible
- [ ] Mobile: row metadata footer wraps to 2-3 lines without overflow

## Out-of-scope items deferred to next slice

These were intentionally not addressed in Audit 1 because they're outside the smallest vertical slice scope:

1. **Exit-action surface** (pause / stop-hold-to-close / stop-liquidate). Contract has the state machine; no preview route built yet.
2. **Match acceptance write path.** Continue button on S3 doesn't yet POST to `accept_match` command. Phase 7 / next slice.
3. **Disclosure acceptance write path.** Accept button on S4 doesn't yet POST to start the enrollment. Same.
4. **Notification delivery adapter.** `notification_intent` events are emitted by the runtime but no in-app, email, or push delivery exists. T2 per the Phase 6 plan.
5. **Operator-only event view.** `audit_visibility=INTERNAL_ONLY` events filtered out for now. An operator-facing surface that shows them would be a separate route, not for the user-facing slice.

## Verification

- `npx tsc --noEmit -p .` clean (exit 0)
- `npm run build` clean — zero errors, zero warnings
- All 7 Guided preview routes still register dynamic, all 7 API routes still register dynamic
- No new dependencies. Every patch stays within the frozen contracts.

## Files modified

```
components/vires/guided/questionnaire-surface.tsx     (F-S1.1)
components/vires/guided/disclosure-surface.tsx        (F-S4.1)
components/vires/guided/broker-flow-surface.tsx       (F-S5.1, F-S5.5)
components/vires/guided/active-enrollment-surface.tsx (F-S9.1, F-S9.2, F-S9.3a)
components/vires/guided/monitoring-surface.tsx        (F-S10.1, F-S10.2)
components/vires/guided/event-history-surface.tsx     (F-S11.1, F-S11.2, F-S11.3, F-S11.4)
components/vires/guided/shared.tsx                    (PendingUserActionsBanner added)
```

## Audit 1 status

Code-level pass: **DONE.** Visual/mobile pass on Jacob's checklist: **PENDING.** Backend/projection items (F-S5.contract optional, F-S9.3 worth doing before second strategy with non-SGOV cash equivalent): **flagged for Codex.**

After visual pass + (optionally) Codex's two backend follow-ups, Audit 1 closes and we're at the gate before T1 work begins (mandate-fit decision for `regime_aware_momentum::stop_5_target_15`, marketing/App Store non-flattening review, legal/disclosure validation, audit_visibility default, match-decline UX flow, etc.).
