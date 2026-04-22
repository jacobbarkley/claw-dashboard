# Passport v2 — Combined Spec (Promotion Workflow + Trade History)

**Status:** Implementation spec. Combines Jacob's six design decisions, Codex's architectural refinements, and the trade-history extension into one authoritative document for the backend contract + frontend UX.
**Authored:** 2026-04-21 · Claude (design), after Codex's feasibility pass on the same-day primer.
**Supersedes:** `CODEX_PRIMER_promotion_workflow_2026-04-21.md` for implementation purposes (the primer stays as the conversation record).

---

## 1. What this spec covers

Two features that land in **one** passport contract revision:

1. **Campaign → Passport promotion pathway** — how a winning campaign candidate graduates into the production ledger, with a fully reversible demotion path.
2. **Passport trade history** — per-trade ledger that feeds two frontend views (allocation stream + per-symbol contribution).

Both extend the same passport object. Shipping them together is one revision, not two.

---

## 2. Core architectural decision — reuse, don't parallel

The graduation path hangs off the **existing strategy-bank / passport machinery** documented in `25-strategy-bank-and-promotion-contract.md` and implemented in `strategy_bank.py` + `evaluator.py` + `models.py`. Campaigns *nominate* into that control plane — they do not invent a parallel promotion ledger.

**Implication:** `strategy_bank` is the bridge. Campaign emits a promotion-ready nomination; the bank holds the passport slot; the operator confirms; the bank replaces or creates a record in the slot. Demotion is the inverse operation on the same slot.

This decision means the campaign manifest and the passport carry *pointers into* the strategy bank's control plane — they don't duplicate its state.

---

## 3. Jacob's six locked decisions (refined by Codex)

1. **Trigger — criteria-based auto-nomination, operator-confirmed promotion into a CONFIRMING stage.**
   Backend evaluates the existing stock validation gates per run. When all gates pass, state goes to `READY_TO_NOMINATE`. Operator confirms via UI → strategy bank creates or updates the passport record → the new record enters a `CONFIRMING` stage (in production-ledger monitoring, not yet paper-approved forever). A clean monitoring window later earns `PAPER_APPROVED`. The promote button reads as *"graduate into the production ledger"* — not *"fully approved for paper."* Fits the existing governed-selection model. *Refinement from Codex:* criteria-passing does NOT auto-fire promotion. The backend emits a nomination + a concrete target action; the operator pulls the lever.

2. **Identity — slot-based replacement, not destructive overwrite.**
   Every passport lives in a stable production slot identified by `passport_role_id`. A promotion that replaces an existing passport means "same role, new record" — the prior record is archived via `supersedes_record_id`, not overwritten. A promotion that occupies an empty role creates a new slot.

3. **Campaign aftermath — MONITORED, re-openable in place.**
   On promotion, the originating campaign transitions to `MONITORED`. If the promoted candidate subsequently fails on paper and the operator confirms demotion, the campaign re-opens in place — same `campaign_id`, history appended, not a fresh record.

4. **Baseline reshuffle — promoted becomes the new baseline; reverts on demotion.**
   After promotion confirmation, the campaign's `baseline.candidate_id` points at the newly promoted candidate. Operator override supported. On demotion, the baseline reverts to the last stable promoted reference (or `NONE` if none exists) — a demoted candidate is **not** silently left as the ratcheted baseline forever. The campaign is durable research memory, not a one-way escalator.

5. **UI surface — promotion readiness scorecard, then passport.**
   Campaign detail page shows a live readiness scorecard (per-gate pass/fail, overall status). When `overall_status === "READY_TO_NOMINATE"`, a promote button lights up. Confirming transitions the scorecard visually into the passport.

6. **Reversibility — operator-confirmed demotion, both sides update.**
   Backend raises `DEMOTION_RECOMMENDED` when paper monitoring trips pre-set thresholds; operator confirms via UI → transitions to `DEMOTION_CONFIRMED` → (a) passport record transitions to the explicit `DEMOTED` stage (do NOT reuse `RETIRED` — research is still alive), (b) originating campaign transitions from `MONITORED` → `CONVERGING` (if a real bench leader still exists) or `EXPLORING` (if not), (c) baseline reverts per decision #4, (d) change log records the reversal on both the passport and the campaign. Not auto-triggered from a noisy paper stretch.

---

## 4. The `promotion_readiness` block (campaign manifest extension)

Lives on the **campaign manifest**. Describes how close each campaign is to producing a graduation.

```jsonc
"promotion_readiness": {
  "schema_version":       "campaign_promotion_readiness.v1",
  "origin_candidate_id":  "q085_dynamic_tech_top6.stop_5_target_15",
  "passport_role_id":     "STOCKS_AGGRESSIVE_AI",         // stable slot identifier
  "target_action":        "CREATE_NEW" | "REPLACE_EXISTING",
  "supersedes_record_id": "q076b_regime_aware_momentum_frozen_reference" | null,

  "readiness": {
    "gates": [
      {
        "gate_id":     "BENCHMARK",
        "label":       "Beats benchmark",
        "status":      "PASS" | "FAIL" | "PENDING" | "INCONCLUSIVE",
        "source_kind": "VALIDATION_GATE" | "BENCH_AGGREGATE",
        "value":       10.05,        // optional — metric actually measured
        "threshold":   0.0,          // optional — what it had to beat
        "summary":     "10.05% excess vs SPY on the 797-day window."
      },
      {
        "gate_id":     "ERA_ROBUSTNESS",
        "label":       "Era sweep",
        "status":      "FAIL",
        "source_kind": "BENCH_AGGREGATE",
        "value":       2,
        "threshold":   4,
        "summary":     "Passes 2 of 4 eras. Needs all four to clear promotion."
      }
      // ... one entry per gate
    ],
    "overall_status": "READY_TO_NOMINATE" | "BLOCKED" | "PARTIAL",
    "blockers":       ["ERA_ROBUSTNESS"],   // gate_ids still failing
    "as_of":          "2026-04-21T21:06:56-04:00"
  }
}
```

**Emission cadence:** Backend emits `promotion_readiness` on every campaign refresh / run completion — not only at promotion time. Keeps the frontend scorecard live.

**Field notes:**

- **`source_kind`** distinguishes a gate computed by the single-window validation engine (`VALIDATION_GATE` — sourced from `evaluator.py` / `models.py`) from one derived by campaign-level aggregation across bench/passport era results (`BENCH_AGGREGATE`). Keeps the frontend honest about where a number came from; different sources have different refresh cadences.
- **`status: "INCONCLUSIVE"`** is a legitimate fourth state. `PASS | FAIL | PENDING` alone is too thin for the real data (e.g., not enough samples to commit to a pass/fail). Frontend renders it distinctly from PENDING — "we have data, but it's ambiguous," not "no data yet."
- **`passport_role_id`** names a stable production slot (e.g. `STOCKS_AGGRESSIVE_AI`, `STOCKS_BROAD_MOMENTUM`, `CRYPTO_MANAGED_EXPOSURE`). One slot → one active passport record at a time.
- **`target_action: "REPLACE_EXISTING"`** requires `supersedes_record_id` pointing at the record being retired.
- Frontend renders: per-gate PASS/FAIL/PENDING/INCONCLUSIVE scorecard with InfoPops on gate labels; promote button wires to an operator-confirm flow when `overall_status === "READY_TO_NOMINATE"`.

### 4.1 Stock validation gates (ships first)

Sourced from `evaluator.py` + `models.py` in the trading-bot repo. These are the canonical set; the backend emits one readiness gate per row below, plus the campaign-level aggregate.

| Gate ID | Source kind | What it measures |
|---|---|---|
| `TRADE_COUNT` | VALIDATION_GATE | Minimum trade count in the eval window. |
| `PROFIT_FACTOR` | VALIDATION_GATE | Gross profit ÷ gross loss. |
| `EXPECTANCY` | VALIDATION_GATE | Average P&L per trade. |
| `PROFITABLE_FOLDS` | VALIDATION_GATE | Share of era-folds with positive net P&L. |
| `DRAWDOWN` | VALIDATION_GATE | Max drawdown ≤ bound. |
| `BENCHMARK` | VALIDATION_GATE | Excess return vs benchmark (SPY / QQQ / sleeve default). |
| `EXPECTANCY_DECAY` | VALIDATION_GATE | Forward-period expectancy vs training expectancy. |
| `HOLDBACK` | VALIDATION_GATE | Out-of-sample holdback window result. |
| `ERA_ROBUSTNESS` | BENCH_AGGREGATE | Per-era pass count across the bench era matrix. Campaign-level rollup. |

### 4.2 Crypto gate adapter (ships later)

Managed crypto emits verdicts + reasons today via `crypto_compare.py` / `crypto_bench.py` — not the structured `gate_statuses` block stocks produce. Codex adds a crypto gate adapter that normalizes those verdicts into the same row shape (same `gate_id` / `status` / `source_kind` / `summary` contract) before crypto campaigns can render a readiness scorecard. Frontend tolerates `readiness: null` (renders *"Crypto gate normalization pending"* empty state) until the adapter lands.

### 4.3 Bidirectional production linkage

Readiness alone doesn't close the loop between a campaign and its promoted passport. Both sides carry explicit pointers:

**On the passport / strategy-bank record:**
```jsonc
"origin": {
  "campaign_id":   "stocks_ai_wall_street_aggressive",
  "candidate_id":  "q085_dynamic_tech_top6.stop_5_target_15",
  "run_id":        "2026-04-14-dynamic-top6",
  "passport_role_id":     "STOCKS_AGGRESSIVE_AI",
  "supersedes_record_id": "q076b_regime_aware_momentum_frozen_reference" | null
}
```

**On the campaign manifest:**
```jsonc
"production_links": {
  "active_record_id":   "q085_dynamic_tech_top6.20260422" | null,  // the passport record currently in production for this campaign
  "passport_role_id":   "STOCKS_AGGRESSIVE_AI",                    // the slot this campaign feeds
  "history": [
    {
      "record_id":       "q076b_regime_aware_momentum_frozen_reference",
      "stage":           "SUPERSEDED",
      "at":              "2026-04-22T16:00:00-04:00",
      "event":           "PASSPORT_SUPERSEDED"
    }
  ]
}
```

Slot-based replacement means *"same `passport_role_id`, new record, prior record marked `SUPERSEDED`."* Never destructive overwrite. `history[]` lets the campaign display its full promotion lineage.

---

## 5. The `paper_monitoring` block (passport extension)

Lives on the **passport**. Tracks in-monitoring-window performance, demotion-watch, and the trigger for `DEMOTION_RECOMMENDED`. Applies to passport records in the `CONFIRMING` stage and continues past `PAPER_APPROVED` (paper-approved records keep being watched).

**Important:** this block replaces the existing `paperDays` / `paperTarget` display stubs on passport manifests. Those fields were display-only without backend truth; the spec formalizes them into a real monitoring contract.

**Relationship to passport stage:**
- **CONFIRMING stage** — `paper_monitoring.status` typically starts `ACTIVE`. A clean window (elapsed_days ≥ target_days, no threshold trips) closes with `status: "COMPLETED"` → backend transitions the passport stage to `PAPER_APPROVED`.
- **PAPER_APPROVED stage** — `paper_monitoring.status` stays live (still `ACTIVE` or `AT_RISK`). Can trip `DEMOTION_RECOMMENDED` at any point; operator confirms to demote.
- **DEMOTED stage** — `paper_monitoring` freezes with its last state. Record is archived for audit.

```jsonc
"paper_monitoring": {
  "schema_version":  "passport_paper_monitoring.v1",
  "status":          "ACTIVE" | "AT_RISK" | "DEMOTION_RECOMMENDED" | "COMPLETED",
  "window": {
    "start":         "2026-04-17T20:30:00-04:00",
    "target_days":   21,           // if the strategy is in a fixed paper window
    "elapsed_days":  4,
    "remaining_days": 17
  },
  "tracking": {
    "tracking_deviation_pct": 0.12,  // realized-vs-modeled return divergence
    "threshold_pct":          0.50,  // operator-set demotion trigger
    "window_days":            5       // consecutive days above threshold to raise
  },
  "recommendation": {
    "status":  "DEMOTION_RECOMMENDED" | null,
    "raised_at": "2026-04-22T16:00:00-04:00" | null,
    "reason":    "Tracking deviation exceeded 0.5% on 3 of last 5 days." | null
  }
}
```

Renders on the passport as a compact strip: window progress bar + tracking deviation value + demotion chip when recommendation is non-null. Demote button wires to operator-confirm flow.

---

## 6. The `promotion_events` ledger

Lives on **both** the campaign manifest and the passport (same event, dual-referenced for audit clarity). Append-only.

**Extends the existing strategy-bank event plane.** Today's bank emits `STRATEGY_REGISTERED | STRATEGY_UPDATED | STRATEGY_SELECTED | STRATEGY_DESELECTED`. The seven new event types below are additive — they integrate into the same event log, not a parallel ledger.

```jsonc
"promotion_events": [
  {
    "event_id":             "2026-04-21-nominate-01",
    "event_type":           "PROMOTION_NOMINATED",
    "at":                   "2026-04-21T21:55:00-04:00",
    "actor":                "codex",                          // who raised the event
    "campaign_id":          "stocks_ai_wall_street_aggressive",
    "candidate_id":         "q085_dynamic_tech_top6.stop_5_target_15",
    "passport_role_id":     "STOCKS_AGGRESSIVE_AI",
    "target_action":        "CREATE_NEW",
    "supersedes_record_id": null,
    "notes":                "All gates passed. Awaiting operator confirmation."
  }
]
```

**Event types (starting enum):**

| Event | Raised by | Meaning |
|---|---|---|
| `PROMOTION_NOMINATED` | backend (Codex) | Readiness gates passed; operator can promote. |
| `PROMOTION_CONFIRMED` | operator (via UI) | Operator confirmed the nomination. Strategy bank commits the slot. |
| `PASSPORT_SUPERSEDED` | backend | An older record in the same slot was archived. Emitted on `REPLACE_EXISTING`. |
| `CAMPAIGN_MONITORED` | backend | Campaign state transitioned to `MONITORED` after a confirmed promotion. |
| `CAMPAIGN_REOPENED` | backend | Monitored campaign re-opened after a demotion confirmation. History appended, same `campaign_id`. |
| `DEMOTION_RECOMMENDED` | backend | Paper monitoring tripped thresholds. Operator can demote. |
| `DEMOTION_CONFIRMED` | operator | Operator confirmed the demotion. Passport slot vacated, originating campaign re-opened. |

Extensible — new event types are additive (unknown types render as raw kind on the frontend, no crash).

---

## 7. The `trade_history` block (passport extension)

*Same shape as CODEX_PRIMER §6, locked 2026-04-21 with Codex's refinements.*

```jsonc
"trade_history": {
  "schema_version": "passport_trade_history.v1",
  "weight_basis":   "POST_EVENT_TOTAL_PORTFOLIO",
  "cash_model":     "RESIDUAL",
  "rows": [
    {
      "date":         "2023-01-12",
      "event_id":     "2023-01-12-rebalance-01",
      "event_type":   "REBALANCE" | "TRADE",   // enum extensible
      "symbol":       "NVDA",
      "side":         "BUY" | "SELL",
      "weight_after": 0.17,                    // portfolio weight AFTER this event
      "price":        162.40,
      "notional":     15000,                   // optional
      "pnl_realized": null                     // SELL / REBALANCE-out only, optional
    }
  ]
}
```

**Semantics:**

- **Envelope fields** (`weight_basis`, `cash_model`) declare semantics once. Avoid per-row inference drift.
- **`weight_after`** is the portfolio weight after this row's event. Deterministic allocation-stream reconstruction.
- **`cash_model: "RESIDUAL"`** = cash is `1 − sum(symbol weights)`. No synthetic CASH rows. Long/short + options sleeves ship with a different `cash_model` when they land.
- **Rebalance grouping:** one row per symbol whose weight changed, sharing an `event_id` + `event_type: "REBALANCE"`. Frontend groups visually by event_id, ledger stays row-atomic.
- **Inline now, lazy-load later.** Today's stocks + managed-crypto passports sit in the low hundreds of rows. Lazy-load path gets designed when a passport approaches ~2,500 rows (first likely hit: future 4H crypto or options).

**Frontend rendering:**

- Expandable disclosure on the passport page (default collapsed)
- Horizontal scroll-snap carousel with two views + page dots
  - **Allocation stream:** stacked-area of per-symbol weight over time
  - **Symbol contribution:** horizontal bars sorted by realized P&L
- Swipe or tap to move between; operator picks a winner over time, then retire the other view

---

## 8. State machine

### Campaign states

```
EXPLORING ──┐
            │
CONVERGING ─┤─── (PROMOTION_CONFIRMED) ──▶ MONITORED
            │                                  │
            │                                  │  (DEMOTION_CONFIRMED)
            │                                  ▼
            │     ┌───── if real leader still ─▶ CONVERGING
            │     │      exists on bench
            │     │
            │     ├───── if no leader ─────────▶ EXPLORING
            └──◀──┘   (same campaign_id, history appended — CAMPAIGN_REOPENED)
```

**Key invariants:**
- `campaign_id` never changes across demotion + re-open. The campaign is durable research memory.
- Baseline reverts per §3 decision #4 on demotion. Not ratcheted forever.

### Passport record states (via strategy bank)

```
(none)          ──(PROMOTION_CONFIRMED, CREATE_NEW)──────────────▶  CONFIRMING
PAPER_APPROVED  ──(PROMOTION_CONFIRMED, REPLACE_EXISTING)────────▶  SUPERSEDED
                                                                    (new CONFIRMING takes slot)
CONFIRMING      ──(paper_monitoring.status = COMPLETED cleanly)──▶  PAPER_APPROVED
CONFIRMING      ──(DEMOTION_CONFIRMED)───────────────────────────▶  DEMOTED
PAPER_APPROVED  ──(DEMOTION_CONFIRMED)───────────────────────────▶  DEMOTED
```

**Stage meanings:**
- **`CONFIRMING`** — promotion just confirmed, record in production ledger but still in monitoring window. Not yet fully paper-approved.
- **`PAPER_APPROVED`** — monitoring window cleared cleanly. Record is the active production reference for its slot. Still monitored; can still be demoted.
- **`SUPERSEDED`** — a newer `CONFIRMING` record replaced this one in the same slot. Archived for audit.
- **`DEMOTED`** — operator confirmed removal from production. Archived for audit. Distinct from `RETIRED` — a demoted record is still *alive as research input*; the campaign feeds off that signal to iterate.

Superseded and demoted records are never deleted. They remain queryable for audit and lineage.

---

## 9. Sleeve readiness — stocks first, crypto adapter later

**Stocks** (Aggressive AI Wall Street, ETF Replacement Momentum, future stock campaigns): readiness block ships immediately. Gate semantics align with `evaluator.py`'s stock validation logic.

**Managed crypto** (BTC 4H TSMOM, BTC Managed Exposure variants): has strong verdict/report data but not the normalized gate block stocks have. Codex adds a crypto gate adapter in a follow-up pass before crypto campaigns use `promotion_readiness`. Frontend tolerates `readiness: null` with an "awaiting crypto gate normalization" empty state — honest, not fake.

**Options** (future): gate shape TBD; introduced alongside the first options campaign.

---

## 10. Frontend UX summary

**On campaign detail page (new surfaces):**

1. Promotion readiness scorecard — replaces current "Promotion target" callout. Per-gate PASS / FAIL / PENDING with InfoPops explaining gate semantics. Overall status chip. Promote button (lit when `READY_TO_NOMINATE`, wired to operator-confirm modal).
2. `MONITORED` status pill variant — distinct from EXPLORING / CONVERGING / PROMOTED. Shown on campaign cards in index + at the top of the detail page.

**On passport page (new surfaces):**

1. Paper monitoring strip — window progress, tracking deviation value, demotion-recommended chip when active. Demote button wires to operator-confirm flow.
2. Trade history disclosure — expandable carousel (allocation stream + symbol contribution views).
3. "Return to campaign" action — visible when a demotion event has been raised or confirmed. Deep-links to the originating campaign in its re-opened state.

**Navigation wiring:**

- Campaign detail → candidate row → passport page (when passport exists — already shipped).
- Passport page → originating campaign (new — shipped with `promotion_events` ledger).
- Campaign detail's change log shows local promotion events; passport shows the mirrored view.

---

## 11. Implementation sequencing

### Backend (Codex)
1. Define the `promotion_readiness` block on the campaign manifest producer. Ship for stocks first.
2. Emit the `PROMOTION_NOMINATED` event when a campaign's readiness overall_status flips to `READY_TO_NOMINATE`.
3. Add the operator-confirm endpoint that transitions `PROMOTION_NOMINATED → PROMOTION_CONFIRMED`. Hooks into `strategy_bank.py` to commit or replace the slot.
4. Emit `PASSPORT_SUPERSEDED` + `CAMPAIGN_MONITORED` as derived events on the bank-write.
5. Add `paper_monitoring` to passports. Compute tracking deviation per bar. Raise `DEMOTION_RECOMMENDED` when thresholds trip.
6. Add operator-confirm demotion endpoint. Emit `DEMOTION_CONFIRMED` + `CAMPAIGN_REOPENED`.
7. Add `trade_history` to passports (stocks first, then managed crypto). Shape per §7.
8. Crypto gate adapter: normalize managed-crypto verdicts into the same gate shape. Unblocks crypto `promotion_readiness`.

### Frontend (Claude)
1. Readiness scorecard component — replaces the "Promotion target" callout. Reads `promotion_readiness.readiness.gates`.
2. Promote-confirm modal — triggers when operator taps the promote button. Writes back to the operator-confirm endpoint.
3. MONITORED status pill variant — in `campaigns-shared.tsx` `StatusPillCampaign` + index card.
4. Paper monitoring strip — new component on the passport page (below the verdict strip).
5. Demote-confirm action + return-to-campaign deep-link — on the passport page.
6. Trade history disclosure + carousel — on the passport page. Two derived views from raw `trade_history.rows`.

### Sequencing dependencies
- Readiness scorecard shipment can land **before** the promote-confirm flow (display-only first).
- Paper monitoring strip can land **before** demotion-confirm flow (read-only state first).
- Trade history is independent — can land in parallel with any of the above.
- Crypto gate adapter unblocks the full cross-sleeve readiness scorecard. Before it ships, stocks work; crypto shows empty state.

---

## 12. Open items that remain for implementation

- **Specific gate list for stocks.** Codex defines which gates are in the canonical set (benchmark beat, era robustness, max drawdown bound, min trade count, etc.). Spec accommodates any set via the `gates[]` array.
- **Paper-monitoring thresholds per sleeve.** Tracking deviation thresholds likely differ for stocks vs managed crypto. Default per-sleeve, operator-adjustable in a future iteration.
- **Historical state backfill.** Existing passports (q076b, q090c, q090d) will need their `promotion_events` ledger populated with synthetic historical events (e.g., their original promotion). Or we could seed them with `PROMOTION_CONFIRMED` at their `generated_at` and leave the ledger sparse.
- **Strategy bank schema.** This spec assumes `strategy_bank.py` can record slots keyed by `passport_role_id` and flip records between ACTIVE / SUPERSEDED / DEMOTED. If the existing bank uses different state names, we align to whatever's already there.

---

**This spec is the implementation canon.** The earlier primer (`CODEX_PRIMER_promotion_workflow_2026-04-21.md`) stays as the conversation record but does not drive implementation after this doc lands.
