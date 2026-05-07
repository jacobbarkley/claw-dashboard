# Audit 1 — Visual Walk Findings

**Date:** 2026-05-07
**From:** Claude (after Jacob's full visual walk against `next dev` with `GUIDED_LOCAL_REBUILD_PATH` set)
**For:** Codex + Jacob
**Companion to:** `CLAUDE_AUDIT1_UX_HONESTY_2026-05-07.md` (code-level pass) + `CLAUDE_PHASE6_2_LANDED_2026-05-07.md` (Phase 6.2 wiring)

## Verdict

**Visual pass: 14 issues patched in dashboard, 6 flagged for Codex / T1 / T2.** All seven Guided surfaces walk end-to-end with real Codex seed data, no Mock fallback badges, navigation graph closes without dead-ends.

## Patched in dashboard this session (14)

| ID | Surface | Issue | Patch |
|---|---|---|---|
| F-Quest.complete-deadend | S1+S2 | Stuck on Complete page with only "Edit answers"; no path forward | Added "See match →" CTA on Complete; added "← All Guided previews" back-link in `PreviewPageShell` so every surface has it |
| F-S3.inert-buttons | S3 match | Continue / Maybe later / Decline had no `onClick` | Wired as navigation links: Continue → S4, Decline → questionnaire, Maybe later → index. "Preview only · clicks navigate, no commands run" hint added |
| F-S4.enroll-overclaim | S4 disclosure | Header "You're about to enroll" overclaimed (acceptance creates `ACCEPTED_PENDING_BROKER`, not ACTIVE) | Reframed: "Start paper trading with X?" + sub-line "Accepting captures your consent and starts broker setup. Paper trading begins only after broker checks pass." |
| F-S4.cancel-and-accept | S4 disclosure | Cancel + Accept buttons inert | Cancel → S3, Accept (when attested) → S5–S8 broker |
| F-S5.fake-checklist | S5 pending | Hardcoded 5-step checklist invented sub-states the contract didn't carry | Replaced with single honest snapshot tied to `broker_capabilities.status` |
| F-S5.5.reconnect-different-broker | S8 ineligible | "Reconnect a different broker" button — only Alpaca supported today | Removed; only "Find a different match" remains |
| F-S5.connect-skip | S5 connect | Connect button jumped straight to ACTIVE, skipping 4 of 5 broker variants | Connect now switches picker to Pending state in-page; Pending has explicit "Simulate VERIFIED → ACTIVE" button to advance |
| F-S5.pending-confusion | S5 pending | "Verifying broker connection…" headline + spinner-style icon implied ongoing process; user waited 1+ min expecting state change | Reframed as "Broker capability check" with explicit "Preview shows the CHECKING snapshot only. In production this resolves to VERIFIED / BROKER_RETRYABLE / BROKER_ACTION_REQUIRED / BROKER_INELIGIBLE within seconds. Use the picker above to view those outcomes." |
| F-S5.mobile-picker-scroll | S5–S8 | State picker `overflow: auto` failed to scroll on mobile widths | Switched to `flexWrap: wrap` — picker now wraps to multiple rows naturally instead of relying on horizontal swipe |
| F-S5.action-buttons-inert | S5–S8 | Try again / I've fixed it / Find a different match all inert | Wired: Try again → S9 ACTIVE, I've fixed it → S9 ACTIVE, Find a different match → questionnaire |
| F-S9.no-onward-nav | S9 ACTIVE | Linear walkthrough dead-ended at S9; only back-link out | Added breadcrumb buttons at footer: "View paper monitoring →" + "View event history →" |
| F-S10.no-onward-nav | S10 monitoring | Same gap as S9 | Added breadcrumb buttons: "← Back to enrollment" + "View event history →" |
| F-S11.filter-labels | S11 events | "Protective" was engineer-speak — Jacob asked what it meant vs "Strategy" | Renamed: Strategy → Entries, Protective → Exits, Cash mgmt → Cash. Support / Manual / Broker / System unchanged |
| F-S11.action-verbs | S11 events | SUPPORT_INTERVENTION hardcoded "Enrollment paused"; broker_confirmation rendered identically to strategy_execution | reason_label preferred for SUPPORT_INTERVENTION/CONSENT/STATE_CHANGE; HOLDINGS_CHANGE source-aware verb ("Broker filled X" vs "X bought"); UTC indicator added; cold-start vs filter-empty empty-states distinguished |

## Flagged for Codex (contract / matcher / seed)

### F-Q.asset-class-multi-sleeve-implication (contract decision)
**Surface:** S1+S2 questionnaire question 3 ("Which sleeve do you want to practice with first?")
**Issue:** "First" implies you can add another sleeve later, but the user has no signal that's possible. Architecture today is one-enrollment-at-a-time; multi-strategy = N enrollments + future per-user allocation layer (T2/T3); options needs the three contract gaps already memo'd.
**Question:** Should the questionnaire signal "you can add another strategy after this one" so the "first" framing has meaning, or stay silent and add the affordance elsewhere when multi-enrollment lands?

### F-Q.capital-cadence-confusion (contract decision)
**Surface:** S1+S2 questionnaire question 5 ("How do you want to fund paper practice?")
**Issue:** Both answer options route to the same `paper_internal` matcher tag, doing zero match-discrimination work. Codex's own `why_we_ask` admits it's forward-looking ("This helps future allocation logic without moving real money in v1"). Alpaca paper is a fixed $100K bucket — user has no funding decision to make in v1. Today the question actively confuses users while doing nothing useful.
**Three options:** drop the question for v1; reframe for live-funding-someday clarity; skip conditionally based on environment.

### F-S3.match-honesty-gap (CRITICAL — contract + matcher work)
**Surface:** S3 match preview
**Issue:** Jacob answered `long_term` (months or longer) for time horizon. Steady Tide's coverage_tag is `multi_week_horizon` — they don't intersect. The matcher still returned Steady Tide because it's the only library entry and `allow_candidate_entries=True` mode forces a winner. Codex's matcher scores by tag intersection but has no minimum-fit threshold. The proposal contract has no "match_quality_score" or "mismatched_answer_keys" field.
**The S3 UI today only shows "Why this fits you" — there's no "Why this might not fit you" section because the contract has nowhere for that data to live.**
**Two pieces needed:**
1. **Matcher behavior:** below some minimum tag-overlap threshold, return a no-match outcome (e.g. `MatchResult.NO_FIT`) rather than force a winner. Especially urgent before second library entry lands.
2. **Proposal contract:** add `mismatched_answer_keys: list[str]` (or similar) so the SELECTED match can transparently say "you said long_term but this strategy is multi_week — proceed knowing this." Today's contract has rejection_reason for REJECTED candidates but no equivalent for "selected with compromises."

### F-S5.openalpaca-link (seed data)
**Surface:** S7 broker action required
**Issue:** Codex's seed sets `broker_capabilities.external_link` to a placeholder URL (`broker.example/settings` or similar) rather than the real Alpaca paper dashboard.
**Fix:** Update seed to point at real Alpaca paper dashboard URL, e.g. `https://app.alpaca.markets/paper/dashboard/overview` for `BROKER_ACTION_REQUIRED` variant. Cannot patch in dashboard — this is seed content owned by `bin/rebuild_guided.py seed-phase6-internal`.

## T1 work (pre-public-launch, deferred but locked)

### F-S3.decline-flow
**Issue:** Decline button restarts the questionnaire from scratch. Real users would expect: "why did you decline?" + show similar strategies in the neighborhood + ask "what would have made it satisfactory."
**Architecture:** Already flagged in Codex's Phase 6 plan as T1: "Match-decline UX flow (re-questionnaire vs next-best vs ask-what-was-wrong) — before any user gets a first match." This finding reinforces the priority. Jacob's specific design framing is the one to use.

### F-S3.maybe-later-persistence
**Issue:** Maybe later just bounces to index without saving the in-flight questionnaire answers. Real users would expect: pick up where they left off later.
**Architecture:** Today no in-flight persistence layer exists — answers live in React state only. Needs a new artifact (`questionnaire_in_progress.v1` or session-state). Belongs in T1 with the decline flow since both shape the matcher entry path.

## T2 work (post-launch, ≤90 days)

### F-S11.live-updates
**Issue:** Events list is a static read at request time. Jacob: "we just need to make sure this is always a continuously live, fresh, and updating list."
**Architecture:** Real-time/polling/SSE for the events view is T2 work — same tier as `notification_intent` delivery adapter. Today's read pattern is correct for Phase 6.2 scope (one read per page render); polling/streaming lands when it's user-facing.

## Polish (next-slice)

### F-S9.cold-start-prominence
**Issue:** "Day zero — paper enrollment hasn't completed an observation period yet" cold-start callout is visible but small. Jacob: "I see it is a little small but I see it."
**Fix:** Visual polish pass after Audit 1 closes — bump font size or accent color on the cold-start banner. Honesty content is correct; only prominence needs work.

## Mobile

Tested in Chrome devtools (iPhone 12 Pro). Width fits cleanly. The one specific mobile issue (state picker scroll) was patched. General visual polish for mobile lands with the broader visual polish pass.

## Trading homepage placement — PRODUCT DIRECTION (Jacob 2026-05-07)

Captured for the post-Audit-1 product roadmap. **Not** a finding from this walk, but a direction note worth holding onto.

**Concept:**
- Elegant ribbon at the top of the trading homepage.
- Click ribbon → full guided onboarding slides down and becomes the new home base.
- Swipe back up to dismiss.
- Only shown to users who haven't completed the questionnaire / aren't yet enrolled.

**Post-completion behavior:**
- Ribbon converts to "your guided strategy summary" — current enrollment state, deployment, P&L summary.
- Inside the ribbon: option to re-run onboarding (would supersede current proposal/enrollment per Round 4 versioning rules).
- Or expand to full state view.

**Implications worth flagging:**
- Touches the trading homepage shell — not a Guided-isolated change.
- The "swipe down to enter onboarding / swipe up to dismiss" gesture pairs with the existing app-wide swipe nav (per memory: body-swipes Home/Stocks/Options/Crypto live).
- "Re-run onboarding" is a write path that needs the command layer (`request_re_questionnaire`) + supersedes-prior-proposal handling. Not Phase 6.2 scope, but useful to design intentionally rather than retrofit.

This belongs in T1/T2 product roadmap, designed alongside the decline-flow and maybe-later-persistence work since all three shape the entry path to Guided.

## Files modified this session

```
components/vires/guided/shared.tsx                    (back-link + PendingUserActionsBanner)
components/vires/guided/questionnaire-surface.tsx     (Complete state CTA + version label)
components/vires/guided/match-proposal-surface.tsx    (button nav + preview hint)
components/vires/guided/disclosure-surface.tsx        (header copy + button nav)
components/vires/guided/broker-flow-surface.tsx       (Connect → Pending in-page; Pending honest snapshot copy; picker wraps; action buttons nav; Ineligible cleanup)
components/vires/guided/active-enrollment-surface.tsx (cold-start banner + deployment row + breadcrumb nav)
components/vires/guided/monitoring-surface.tsx        (cold-start dashed border + pending actions banner + breadcrumb nav)
components/vires/guided/event-history-surface.tsx     (filter label cleanup + source-aware verbs + UTC indicator + walkthrough closer)
```

## Verification

- `npx tsc --noEmit -p .` clean (exit 0)
- `npm run build` clean (zero errors, zero warnings)
- All 7 preview routes still register dynamic; all 7 API routes still register dynamic
- Live-read smoke against Codex's seed continues to pass

## Audit 1 close path

To close Audit 1:
1. **Codex** picks up F-S3.match-honesty-gap (matcher min-fit threshold + proposal contract extension) — this is the one architecturally critical finding from the visual walk.
2. **Codex** decides on F-Q.asset-class-multi-sleeve-implication and F-Q.capital-cadence-confusion — both are contract-shape questions, not UI patches.
3. **Codex** updates seed for F-S5.openalpaca-link with real Alpaca paper dashboard URL.
4. **Jacob** stays with the T1 list (decline flow, maybe-later persistence, mandate-fit gate decision for entry zero).

After Codex's three items land and the dashboard absorbs the contract changes, Audit 1 closes and we're at the gate before T1 work begins. The T2/visual-polish/product-direction items continue on their own tracks.
