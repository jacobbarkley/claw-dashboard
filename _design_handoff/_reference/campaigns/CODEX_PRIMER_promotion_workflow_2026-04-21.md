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

Then Claude takes your input, writes the final spec in this same folder, and we both check in before implementation starts.

---

**Sequencing note:** this feature lands *after* (a) the current Campaigns v2 mobile feedback pass stabilizes and (b) the candidate-row → passport deep-link (today's deferred item) completes. The deep-link is a prerequisite for the promotion UX transition.
