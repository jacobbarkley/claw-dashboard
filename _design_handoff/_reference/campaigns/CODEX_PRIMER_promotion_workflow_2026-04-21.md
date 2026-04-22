# Codex Primer — Campaign → Passport Promotion Workflow

**Audience:** Codex (backend / campaign-manifest producer)
**Authored:** 2026-04-21 · Claude (design) · after Jacob locked the six design decisions
**Goal of this primer:** get Codex's backend-shape input and pushback, then Claude writes the final spec.

---

## 1. Why this exists

Bench Campaigns (research cockpit) and Passports (production ledger) are two parallel surfaces today with no formal graduation path. This workflow closes that gap: a winning campaign candidate graduates into a passport, and a failing passport can be demoted back into its originating campaign.

---

## 2. What Jacob locked (six decisions — don't re-litigate)

1. **Trigger — criteria-based.** Promotes when candidate (a) beats benchmark, (b) scores high on the existing in-production KPIs, (c) is robust across eras. **Reuse the promotion criteria that already govern today's live passports** (q076b, q090c, q090d) as the starting point. Fine-tune only if campaign→passport surfaces gaps.

2. **Identity — context-dependent.**
   - Unique new strategy → brand-new passport.
   - Variation/improvement of an existing promoted strategy → **replaces** that passport (don't duplicate).
   - Decision rule: does this candidate supersede an existing passport's role, or occupy a role no one holds?

3. **Campaign aftermath — monitored, re-openable.** Campaign stays open in a `MONITORED` state after promotion (option to close on operator request). **Must be re-openable** — if the promoted candidate fails on paper, Jacob goes back to the campaign to iterate. The campaign is the research venue; the passport is the production ledger; both stay alive across the graduation.

4. **Baseline reshuffle — yes, with override.** Promoted candidate becomes the new `baseline.kind: PROMOTED_REFERENCE` for the campaign. Ratchet. Operator can override situationally.

5. **UI surface — readiness scorecard.** Current "Promotion target" callout evolves into a live readiness scorecard: per-gate pass/fail, green-checked as criteria pass, promote button lights only when all conditions met. Scorecard transitions visually into the passport on promotion.

6. **Reversibility — fully.** Promotion is NOT a one-way door. Underperforming paper passport → demote back to originating campaign. Not auto-retire.

---

## 3. What we need from Codex (your lane)

The UX is Claude's; the data contract, automation logic, and state transitions are yours.

### 3A. Promotion criteria exposure

- What are the gates governing today's in-production strategies? We need them listed so the scorecard can render them.
- Are they currently evaluated per-run on campaign candidates, or only at promotion time? If the latter, we need them on **every** candidate so the scorecard updates continuously.
- Proposed data shape (your call to refine):

```jsonc
"readiness": {
  "gates": [
    {
      "gate_id": "BENCHMARK_BEAT",
      "label":   "Beats benchmark",
      "status":  "PASS" | "FAIL" | "PENDING",
      "value":   10.05,       // optional — what metric actually measured
      "threshold": 0.0,       // optional — what it had to beat
      "summary": "10.05% excess vs SPY on the 797-day window."
    },
    // ... one per gate
  ],
  "overall_status":  "READY_TO_PROMOTE" | "BLOCKED" | "PARTIAL",
  "blockers":        ["ERA_ROBUSTNESS"],   // gate_ids still failing
  "as_of":           "2026-04-21T…"
}
```

### 3B. Trigger mechanics

- When all gates pass, does promotion **auto-fire** or is it operator-gated (auto-nominate + manual confirm)?
  - Jacob's lean: criteria-passing is the trigger, operator confirmation is the safety net.
  - Your backend-feasibility pushback welcome.
- What event emits when promotion fires? Does it regenerate the passport manifest (`manifest.provenance: CHECKED_IN`), or does an existing `promote_candidate` script already do this?

### 3C. Campaign ↔ passport linkage

- Proposal: passport carries `origin_campaign_id`, campaign manifest carries `promoted_candidates[]` (or similar).
- How do you want to wire the bidirectional link cleanly?
- In the "replace" case (decision #2 — variation of existing promoted strategy replaces its passport), how do you handle the replaced passport's lifecycle artifacts? Archive, overwrite in place, or version history?

### 3D. `MONITORED` campaign state

- New status value needed on `campaign.status` — `MONITORED` or `PROMOTED_MONITORED`. Your naming call.
- Transition: `CONVERGING → MONITORED` fires on promotion event, I assume — confirm.
- Re-open path (decision #3): when a monitored campaign is re-opened after a paper failure, what does "re-opened" mean mechanically?
  - Status reverts to `EXPLORING` / `CONVERGING`, existing candidates stay, new runs land?
  - Fresh `campaign_id`, or same campaign with a reset cursor?

### 3E. Demotion path (decision #6)

- What triggers demotion? Quantified threshold the producer monitors (e.g., tracking deviation > 0.5% over N days), or operator judgment via the UI?
  - Today's `paperDays` / `paperTarget` mechanics suggest a window-based quantifier exists — is that where demotion criteria would live?
- Event + state writes on demotion: what updates on (a) the passport and (b) the originating campaign?

---

## 4. Scope — what's NOT in v1

- Live P&L driving promotion (promotion stays bench-criteria-based, not paper-P&L-based).
- Cross-campaign arbitration (if two campaigns clear gates simultaneously, that's separate design work).
- Complex operator override rules beyond `confirm promotion`, `demote from paper`, `re-open campaign`.

---

## 5. What we want from you in the next pass

1. **Your take on the six decisions** — any you'd push back on from a backend-feasibility angle?
2. **Proposed data contract shape** for the readiness scorecard (fields + events). Refine §3A.
3. **Your preferred answer to each open question** in §3B–3E.
4. **Anything we didn't think of** — your backend view sees things the design side can't.
5. **Your take on §6 below** — the passport trade-history extension that lands in the same contract revision.

Then Claude takes your input, writes the final spec in this same folder, and we both check in before implementation starts.

---

## 6. Adjacent feature — passport trade history + allocation views

### Why it's in this primer

Once you're already extending the passport contract for promotion readiness (§3A), this is the natural moment to also add trade-history data. Operator-side gap: passports today show stats, era results, gates, lifecycle — but not *what the strategy actually did*. No symbol-level detail, no allocation pattern, no sense of "was this one lucky pick or broad participation." Locked 2026-04-21 by Jacob.

### Proposal — one data source, multiple views

Add one new field to the passport contract: `trade_history`. The frontend derives two views from it (allocation stream chart + per-symbol contribution bar), presented as a swipeable carousel on mobile so the operator can A/B which view is more useful over time. One data shape, not two, so we can add a third view later (drawdown-by-position, holding-period distribution, etc.) without another contract revision.

### Data shape (refined with Codex 2026-04-21)

```jsonc
"trade_history": {
  "schema_version": "passport_trade_history.v1",
  "weight_basis":   "POST_EVENT_TOTAL_PORTFOLIO",
  "cash_model":     "RESIDUAL",
  "rows": [
    {
      "date":         "2023-01-12",
      "event_id":     "2023-01-12-rebalance-01",
      "event_type":   "REBALANCE" | "TRADE",        // enum extensible
      "symbol":       "NVDA",
      "side":         "BUY" | "SELL",
      "weight_after": 0.17,                         // portfolio weight AFTER this event (0..1)
      "price":        162.40,                       // execution price
      "notional":     15000,                        // dollar size, optional
      "pnl_realized": null                          // SELL / REBALANCE-out only, optional
    }
    // ... one row per symbol whose weight changed
  ]
}
```

### Shape notes

- **Metadata wrapper:** semantics live on the envelope (`weight_basis`, `cash_model`), not inferred per-row. Lets us add variants (long/short, options net-notional) later without a breaking change.
- **`weight_basis: "POST_EVENT_TOTAL_PORTFOLIO"`:** the `weight_after` on each row is the portfolio weight as of immediately after this row's event. Deterministic stream reconstruction.
- **`cash_model: "RESIDUAL"`:** cash = `1 − sum(symbol weights)`. No synthetic CASH rows emitted. Contract explicitly declares this so future long/short or options sleeves can ship a different `cash_model` without ambiguity.
- **Row granularity:** one row per *symbol whose weight changed* during an event. Rebalances share an `event_id` so the frontend can group them visually — the ledger stays row-atomic, the human meaning of "this was one rebalance" is preserved via the shared id.
- **`event_type` is extensible.** Starting with `REBALANCE | TRADE`; add `DIVIDEND`, `STOP_HIT`, `TARGET_HIT`, `CORPORATE_ACTION` as real signals surface.
- **`pnl_realized` optional.** If emitted we use it for the contribution-bar view; otherwise frontend derives from buy/sell price deltas.
- **Size-wise benign today.** Stocks passports with monthly/quarterly rebalance ≈ low hundreds of rows. Managed-crypto daily ≈ manageable. Fine to ship inline on the passport.

### Lazy-load trigger

Ship inline now. Move to lazy-load when a passport approaches **~2,500 rows** — the first strategies likely to hit that are future 4H crypto or options, not today's stock/managed-crypto families. Earlier trigger than the original 10k — cheaper to design the lazy path up front than to retrofit it once a passport actually bloats.

### Why not ship pre-aggregated streams

You could emit `allocation_stream: [{date, holdings: {...}}]` directly. Rejected because:

- **Duplicates data.** Trade events and the stream encode the same information.
- **Brittle to new views.** Adding a third or fourth view ("holding-period distribution," "turnover over time") would need another contract revision.
- **Frontend iteration is cheap** when the raw ledger is available.

### Frontend plan

- Expandable disclosure on the passport page (default collapsed, mobile-first)
- On expand: horizontal scroll-snap carousel with two views
  - **Allocation stream:** stacked-area of per-symbol weight over time
  - **Symbol contribution:** horizontal bars sorted by realized P&L
- Page dots + swipe or tap to move between
- When the operator picks a winner over time, retire the other view

### Sequencing

Lands with the promotion-readiness contract revision (§3A). One revision to the passport object, not two.

### Questions (resolved by Codex 2026-04-21)

- ~~**Turnover ceiling.**~~ Resolved: ship inline now, lazy-load trigger at ~2,500 rows. Realistic bloat comes from future 4H crypto / options, not today's families.
- ~~**Cash position.**~~ Resolved: infer cash (`RESIDUAL`) for v1, declared explicitly in the `cash_model` field so non-cash variants can ship their own model later.
- ~~**Rebalance semantics.**~~ Resolved: one row per symbol whose weight changed, all sharing an `event_id` + `event_type: "REBALANCE"` so the frontend can group cleanly without losing the atomic ledger.

---

**Sequencing note:** this feature lands *after* (a) the current Campaigns v2 mobile feedback pass stabilizes and (b) the candidate-row → passport deep-link (today's deferred item) completes. The deep-link is a prerequisite for the promotion UX transition.
