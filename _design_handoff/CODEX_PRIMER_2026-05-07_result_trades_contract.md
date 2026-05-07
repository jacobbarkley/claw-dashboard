# Codex Primer — `result_trades.v1`: trade atlas data contract (RFC, 2026-05-07)

**Date:** 2026-05-07  
**From:** Claude (Sonnet 4.6), per Jacob's request  
**For:** Codex  
**Scope:** Proposed schema for the per-result trade log artifact
(`research_lab.result_trades.v1`), tradeoffs, and open questions.  
**Status:** RFC — no producer code should be written until Codex reviews and
signs off on the open questions in §5. The dashboard stub (feature-flagged off)
is already in place and will activate once the artifact lands.

Dashboard UI design: `_design_handoff/_reference/lab/TRADE_ATLAS_DESIGN_2026-05-07.md`  
Stub renderer: `components/vires/lab/trade-atlas-section.tsx`  
Feature flag: `VIRES_LAB_TRADE_ATLAS=1`  
RFC branch: `claude/trade-atlas-design`

---

## §1 — What this is

The existing `equity_swarm.v1` artifact carries per-trade `mtm_curve` arrays
designed for the equity curve chart renderer. Those arrays are excellent for
visual continuity but are not designed for the operator to browse, filter, and
sort individual trades. The trade atlas section (below the result leaderboard on
the job detail page) needs:

- A **summary block** (trade count, win/loss split, avg hold, P&L distribution)
  that renders instantly without parsing all trade rows.
- A **sortable, filterable table** of individual trades.
- A **per-trade expand panel** with full metadata: entry/exit timestamps, regime
  tag, benchmark comparison, exit reason.

`result_trades.v1` is the artifact that backs that surface. It is a sibling
artifact (see §3) produced once per completed `result.v1`.

---

## §2 — Relationship to existing artifacts

| Artifact | Purpose | Trade rows? |
|---|---|---|
| `result.v1` | Variant metrics + plateau analysis | No |
| `equity_swarm.v1` | Chart-ready MTM curves | Yes — minimal fields, no regime, no exit_reason |
| `result_trades.v1` (proposed) | Operator-browsable trade log | Yes — full per-trade record |

`result_trades.v1` trades share `trade_id` with `equity_swarm.v1` trades so the
dashboard can cross-reference them (e.g., clicking a chart point expands the
matching atlas row). Neither artifact requires the other to be present; both
degrade gracefully.

---

## §3 — Tradeoff: array-on-result vs sibling artifact

Two options were evaluated:

### Option A — embed a `trades` array in `result.v1`

Simpler: one artifact, one read.

**Rejected** for three reasons:

1. **Hot-path penalty.** `result.v1` is loaded eagerly by every page that
   renders the leaderboard. A STOCKS run with 200+ trades adds 30–60 KB to a
   payload that the operator may be loading only to check the plateau verdict.
   The operator may never open the trade atlas on that visit.

2. **Schema coupling.** The trade log format will iterate faster than the core
   result contract — regime tags, multi-leg options fields, benchmark comparison
   — and each change would bump the result schema version.

3. **Mobile lazy-load.** The design calls for progressive hydration on narrow
   viewports: summary tiles render first, rows load on scroll. This requires the
   trade data to be a separate fetch anyway.

### Option B — sibling artifact, lazy-loaded ← recommended

- `result.v1` gains one pointer field: `result_trades_artifact?: ResultArtifactRef | null`
  (same type as the existing `equity_swarm_artifact` pointer — no new type needed).
- The dashboard loads the sibling only when the operator opens the trade atlas.
- File size is fully independent from the result payload.
- Schema evolves independently.

**File size at scale:** An equity run on 2 years of STOCKS daily data with 150
trades × 20 fields ≈ 25–40 KB minified. An OPTIONS run with defined-risk
spreads (4 legs per trade × 200 trades) could reach 80–120 KB. Keeping this off
the eager load path matters particularly on mobile.

**Indexing for filter UX:** At Phase 1 scale the dashboard's filter chips
(side / exit_reason / regime / variant) operate on the in-memory `trades` array.
If a result ever exceeds ~2 000 trades, pre-built counts in the `summary` block
let the filter chips render aggregate labels without parsing rows. The contract
is forward-compatible; no indexing change needed now.

---

## §4 — Proposed schema

### Storage path

```
data/research_lab/{user_id}/{account_id}/{strategy_group_id}/result_trades/result_trades_{result_id}.json
```

Consistent with the `equity_swarm` naming convention (`equity_swarm_{result_id}.json`
lives one directory up). The `result_trades_` file prefix avoids collision with
any other artifact type that might land in the same directory later.

### Pointer field on `result.v1`

```jsonc
// Add to ResultV1 — uses the existing ResultArtifactRef type, no new type needed.
{
  "result_trades_artifact": {
    "artifact_id": "research_lab.result_trades.v1",
    "artifact_type": "RESULT_TRADES",
    "path": "data/research_lab/jacob/paper_main/default/result_trades/result_trades_{result_id}.json",
    "description": "Per-trade log for the trade atlas section."
  }
}
```

**Open question Q4 — see §5.** Codex may prefer a flat `result_trades_path`
string (mirroring how some internal helpers read `equity_swarm_artifact.path`)
over the nested `ResultArtifactRef` object. Dashboard can adapt to either.

### Artifact body

```jsonc
{
  "schema_version": "research_lab.result_trades.v1",
  "result_id": "result_job_01KQ...",
  "job_id":    "job_01KQ...",
  "idea_id":   "idea_01KQ...",
  "generated_at": "2026-05-07T14:00:00Z",

  // scope triple (mirrors result.v1 pattern)
  "user_id":           "jacob",
  "account_id":        "paper_main",
  "strategy_group_id": "default",

  // ── summary block ──────────────────────────────────────────────────────────
  // Pre-computed by producer. The atlas overview row renders from this block
  // alone — no parsing of trades[] required for the initial paint.
  "summary": {
    "total_trades":         87,
    "winners":              51,    // gross_pnl > 0
    "losers":               36,    // gross_pnl <= 0
    "avg_holding_period":   86400, // seconds (arithmetic mean across all trades)
    "pnl_distribution": {
      "p25": -0.41,   // gross_pnl_pct at the 25th percentile
      "p50":  0.62,
      "p75":  1.83,
      "min": -4.20,
      "max":  6.11
    }
  },

  // ── per-trade rows ─────────────────────────────────────────────────────────
  "trades": [
    {
      "trade_id":             "trade_0001",        // stable within artifact; matches equity_swarm.v1 trade_id
      "result_id":            "result_job_01KQ...",
      "variant_id":           "stop_5_target_15",
      "idea_id":              "idea_01KQ...",

      // scope triple on every row — enables future cross-scope analytics
      "user_id":              "jacob",
      "account_id":           "paper_main",
      "strategy_group_id":    "default",

      "sleeve":               "STOCKS",            // "STOCKS" | "CRYPTO" | "OPTIONS"
      "side":                 "LONG",              // "LONG" | "SHORT"
      "symbol":               "AAPL",              // display label; not a join key

      // timing
      "entry_at":             "2026-01-15T09:30:00-05:00",  // ISO-8601 with tz
      "exit_at":              "2026-02-03T16:00:00-05:00",  // null if position is open
      "holding_period_seconds": 1641000,

      // pricing (see Q1 for size field)
      "entry_price":          184.22,
      "exit_price":           191.05,   // null if open
      "size":                 125,      // numeric quantity; unit declared by size_unit
      "size_unit":            "shares", // "shares" | "contracts" | "units" — see §5 Q1

      "notional_at_entry":    23027.50, // entry_price × size (or notional equivalent for multi-leg)
      "gross_pnl":            853.75,   // realized; for open positions, MTM as-of generated_at
      "gross_pnl_pct":        3.71,     // gross_pnl / notional_at_entry × 100

      "bench_mark_pnl_pct":   1.42,     // optional — benchmark return over same entry→exit window; see Q3

      "regime_tag":           "trending_up", // optional free-form string from regime model; null if no regime
      "exit_reason":          "TARGET"       // "STOP" | "TARGET" | "TIME" | "REGIME_FLIP" | "OTHER" | null
    }
    // ... more trades ...
  ]
}
```

---

## §5 — Open questions for Codex

> Please answer these inline or in a reply before writing any producer code.
> Tag each answer with the question ID (Q1–Q5).

### Q1 — `size` field and sleeve variance ⬅ CRITICAL

`size_shares` is natural for STOCKS but wrong for OPTIONS (contracts) and CRYPTO
(fractional units). Three options:

| Option | Fields | Tradeoff |
|---|---|---|
| A | `size` (float) only; unit implicit from `sleeve` | Simple but loses self-documentation per row |
| B | Three fields: `size_shares`, `size_contracts`, `size_units` — exactly one non-null | Self-documenting but sparse; more fields to maintain |
| C | `size` (numeric) + `size_unit` ("shares" \| "contracts" \| "units") | Explicit, extensible, one field to render |

**Recommendation: option C.** The schema above uses this. The dashboard uses
`size_unit` to format the column header dynamically ("Size (shares)" /
"Size (contracts)" / "Size (units)"). Confirm or redirect.

### Q2 — `exit_at` null semantics

For a completed backtest every trade should be closed (`exit_at` non-null). If
this artifact is also used for live/paper sessions, `exit_at` will be null for
open positions. Should `exit_reason` be `null` or an `"OPEN"` sentinel for those
rows?

**Proposal: `null`** — the display layer treats `exit_at === null` as the "open"
indicator and hides the exit_reason chip. No sentinel value needed. Confirm.

### Q3 — `bench_mark_pnl_pct` derivation cost

This field requires aligning the benchmark's daily returns over the trade's
`entry_at` → `exit_at` window. Is that derivable from data already in the
pipeline (e.g., the benchmark curve already in `equity_swarm.v1`), or does it
require a new data join?

If expensive or unavailable at Phase 1, **omit the field entirely** and the
dashboard will not render the benchmark comparison column. Mark it
`bench_mark_pnl_pct?: number | null` so a `null` or missing field is always a
valid state.

### Q4 — Pointer field on `result.v1` ⬅ CRITICAL

Two pointer styles are in use today:

- `equity_swarm_artifact: ResultArtifactRef` — nested object with `path`, `artifact_id`, `artifact_type`, `description`
- Internal helpers that read `.path` from that object

For `result_trades_artifact`, the schema above follows the `ResultArtifactRef`
pattern. If the pipeline already has a simpler `result_trades_path: string | null`
pattern that the existing read helpers handle, that is equally fine — the dashboard
loader can adapt. Confirm which is preferred before the pointer field lands in
`result.v1`.

### Q5 — Producer timing

Should `result_trades.v1` be produced in the same post-processing step as
`equity_swarm.v1` (reading simulation data once), or as a separate lightweight
step?

**Strong preference: co-produce with equity_swarm** in the same pass so
simulation data is read once. The trade rows largely duplicate data already
extracted for equity_swarm — adding per-trade `regime_tag` and `exit_reason`
enrichment in the same loop is minimal overhead.

---

## §6 — TypeScript RFC types (dashboard-side)

RFC-only types live in `lib/research-lab-trades.server.ts`, clearly annotated
as pending Codex sign-off. They will **not** be merged into
`lib/research-lab-contracts.ts` until this primer is signed off and the
canonical document `33-research-lab-contracts.md` is updated to declare the
new schema.

The stub renderer (`components/vires/lab/trade-atlas-section.tsx`) renders the
honest empty state today — the file is guarded by `VIRES_LAB_TRADE_ATLAS=1`,
which is off in production. No visual change on any live page until the flag
is enabled.

---

— Claude (Sonnet 4.6)
