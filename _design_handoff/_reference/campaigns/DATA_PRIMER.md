# Bench Campaigns — Data Primer

**Contract:** `backtest/bench/campaigns/*.campaign_manifest.json` + `campaign_registry.json`
**Schema versions:** `bench_campaign_registry.v1`, `bench_campaign_manifest.v1`
**Mirrored in project:** `vires-campaigns-data.js` (verbatim from `_reference/campaigns/`)

---

## Field usage map — index page only

Every field below is read straight from the manifest. Nothing is derived beyond relative-time formatting and a candidate-count-per-family rollup.

### Registry (`campaign_registry.json`)

| Field | Used where |
|---|---|
| `schema_version` | Not rendered (validation only) |
| `generated_at` | Masthead "Updated Xm ago" |
| `campaigns[]` | Iterated to render one card per entry |
| `campaigns[].campaign_id` | React key + detail-page routing |
| `campaigns[].title` | Card title |
| `campaigns[].sleeve` | Sleeve chip (lowercased) |
| `campaigns[].status` | Status pill + masthead counters |
| `campaigns[].manifest_path` | Not rendered on index (reserved for future lazy-load) |

### Campaign manifest — header

| Field | Used where |
|---|---|
| `campaign_id` | Card routing |
| `title` | Card title (serif h3) |
| `sleeve` | Sleeve chip |
| `benchmark_symbol` | Card header: "vs {SYMBOL}" |
| `status` | Card status pill |
| `summary` | Card lede copy (body, under title) |
| `updated_at` | Card footer: "Updated Xm ago" |
| `updated_by` | Card footer byline |
| `current_leader_candidate_id` | Resolves the "Current leader / Baseline to beat" row |
| `last_run_at` | Lever cell: "Last run" |
| `objective` | Detail stub only (not index) |
| `promotion_target` | Deferred to detail page |
| `last_meaningful_change_at` | Not on index (latest `change_log` entry is used instead) |
| `last_meaningful_change` | Not on index (redundant with latest change-log entry) |

### `recency_signals`

| Field | Used where | Null behavior |
|---|---|---|
| `last_leader_change_at` | Lever cell sub-line: "changed {rel}" | Renders no sub-line if null |
| `leader_stability_sessions` | Lever cell primary value | Must be present; v1 assumes integer ≥ 0 |
| `runner_up_candidate_id` | Resolves "Runner-up: {title}" inside the gap band | Band omits the runner-up line if null |
| `runner_up_gap.metric` | Right-aligned inline tag when value is quantified | — |
| `runner_up_gap.value` | When non-null → quantified; when null → "not yet quantified" marker | **Null is expected**. Honest copy in `.summary` is the design surface. |
| `runner_up_gap.summary` | Italic serif prose. The load-bearing honest sentence. | Must be present for the band to render meaningfully |
| `last_param_sweep_at` | Lever cell: "Param sweep" → relative time | Renders "—" if null |
| `days_since_param_sweep` | Lever cell sub-line: "{N}d since" | Sub-line omitted if null |

### `family_groups`

| Field | Used where |
|---|---|
| `family_id` | Matching key for candidate rollup |
| `title` | Chip label |
| `summary` | Deferred to detail page |

Only families with `count > 0` get chips. Candidate count = `candidates.filter(c => c.family_id === f.family_id).length`.

### `candidates`

Used on the index only to:
- resolve the leader (by `current_leader_candidate_id`) for the "Current leader / Baseline to beat" row,
- resolve the runner-up (by `runner_up_candidate_id`) for the gap band footnote,
- count candidates per family for the chip strip,
- show total candidate count in the 2×2 lever grid.

| Field | Used where | Notes |
|---|---|---|
| `candidate_id` | Leader row ticker footnote (small mono text) | — |
| `title` | Leader row primary, runner-up footnote | — |
| `family_id` | Family rollup | — |
| `role` | Drives `RoleTag` component — **this is the contract-critical field** | See role table below |
| `artifact_kind` | Deferred to detail page (candidate deep-link) | — |
| `artifact_refs.*` | Deferred to detail page | Path strings — never rendered as URLs without validation |
| `latest_run.*` | Deferred to detail page | `run_id: null` and `completed_at: null` are valid (challenger with no fresh run) |
| `notes[]` | Deferred to detail page | — |

### `role` enum — how the UI reads it

| Role | Visual treatment on index |
|---|---|
| `LEADER` | Outlined gold "LEADING" pill; eyebrow "Current leader" |
| `CHALLENGER` | Not rendered on index (reserved for detail) |
| `PROMOTED_REFERENCE` | Filled gold "BASELINE" tag; eyebrow "Baseline to beat"; row gets a faint gold tint |

The index shows the candidate referenced by `current_leader_candidate_id`. That candidate's `role` — not the campaign `status` — decides whether this is a "baseline to beat" card or a "leader" card. This matters: `CONVERGING` with a `PROMOTED_REFERENCE` leader and `CONVERGING` with a `LEADER` leader should read differently, and they do.

### `change_log`

| Field | Used where |
|---|---|
| `at` | Row relative-time stamp |
| `kind` | Icon + label (see kind table) |
| `title` | Row body copy |
| `detail` | Deferred to detail page |
| `actor` | Deferred to detail page |
| `candidate_id` / `from_candidate_id` / `to_candidate_id` | Deferred to detail page |

Index shows **only the most recent** change-log entry per campaign. The full timeline is a detail-page concern.

### `change_log[].kind` enum

| Kind | Icon | Label |
|---|---|---|
| `LEADER_CHANGED` | swap arrow | Leader changed |
| `PROMOTION_REFERENCE_ADDED` | star | Reference promoted |
| `CANDIDATE_ADDED` | plus | Candidate added |
| `BENCHMARK_UPDATED` | ringed dot | Benchmark updated |
| `CANDIDATE_RETIRED` | x | Candidate retired |

Unknown kind → fallback renders a neutral dot and the raw kind lowercased. Confirmed in code.

## Fields visible in the contract but not yet surfaced anywhere

- `promotion_target` — will live on detail page (memo-style framing for the thesis).
- `family_groups[].summary` — will appear inside each family lane on the detail page.
- `candidates[].notes` — will appear on the candidate rows in the detail leaderboard.
- All `candidates[].artifact_refs` path fields — will drive the "Open passport / run / report" deep-links on detail.
- `change_log[].detail` / `actor` / candidate references — will render in the detail timeline.

Nothing is silently dropped. If the backend adds fields, they'll be honored when detail ships.

---

## v2 extension — `latest_run.run_stats` (NEW, producer-dep)

> ### ⚠️ DEPRECATED before implementation
>
> This section's shape is **superseded** by the v2 campaign-level contract — see `PRIMER_v2_campaign_contract.md` in this folder.
>
> CODEX's feedback (see `NOTES.md`, 2026-04-21 entry) asked for the performance numbers to live at the **campaign level**, not per-candidate, and split into two separate blocks:
>
> - `campaign.baseline_performance` — what the campaign must beat.
> - `campaign.leader_comparison_to_baseline` — is the leader actually beating it, on what dimensions.
>
> Plus a first-class `campaign.campaign_pressure` operator sentence.
>
> The section below is retained so the prototype code (which still reads `latest_run.run_stats` for the Frozen Reference leader card) is documented. **Do not wire a backend to this shape.** Wire to `PRIMER_v2_campaign_contract.md`.
>
> The prototype will be migrated to the v2 shape in the next design pass.

---

### Legacy shape (prototype-only — not the contract)

### Why it exists

Operators viewing a campaign want to answer "how is the leader actually performing on the bench" **without** deep-linking into the passport UI. The contract's compact `latest_run` doesn't carry those numbers. The choice was between:

- **(A)** Cross-reference the passport by `candidate_id` (only works when a passport exists — the q085 dynamic-tech candidates have result bundles but no passport)
- **(B)** Normalize a compact stats summary directly into the campaign manifest

We went with (B) as an **optional** field. If it's absent, the UI degrades to an honest empty state.

### Shape

```jsonc
"latest_run": {
  "run_id": "...",                    // existing
  "completed_at": "...",              // existing
  "summary": "...",                   // existing
  "result_summary_path": "...",       // existing
  "run_stats": { ... } | null,        // NEW
  "run_stats_status": "INDEXED"       // NEW: enum
                     | "NOT_INDEXED"
                     | "NO_RUN"
                     | null
}
```

### `run_stats` object

```jsonc
{
  "period": {
    "start":        "YYYY-MM-DD",
    "end":          "YYYY-MM-DD",
    "trading_days": 797            // int, optional
  },
  "eras": [
    { "label": "2023 H1", "pass": true },
    { "label": "2023 H2", "pass": true }
  ],
  "eras_passed":               4,      // int, derivable from eras but emit explicitly
  "eras_total":                4,

  "total_return_pct":          90.50,   // candidate total return, percent
  "benchmark_return_pct":      80.45,   // matched-window benchmark return
  "excess_return_pct":         10.05,   // candidate - benchmark

  "max_drawdown_pct":         -8.89,    // negative by convention
  "benchmark_max_drawdown_pct":-13.40,

  "sharpe":          1.93,
  "benchmark_sharpe":1.12,
  "sortino":         3.17,
  "calmar":          2.55,

  "profit_factor": 2.12,
  "win_rate_pct":  61.96,
  "trades":        163
}
```

All individual metric fields are **independently optional**. The UI renders an em-dash for any missing field; a missing `period` falls back to "—"; a missing `eras` array simply omits the era strip. This is deliberate — the producer should emit whatever is cheap and skip what isn't.

### `run_stats_status` enum

| Status | Meaning | UI behavior |
|---|---|---|
| `INDEXED` | `run_stats` object is populated | Full stats table renders |
| `NOT_INDEXED` | A run exists (`run_id` and `result_summary_path` set), but stats haven't been normalized into the campaign manifest yet | Compact copy: "Result bundle exists — stats not yet normalized into the manifest." Shows the `result_summary_path` ticker. |
| `NO_RUN` | No run under this manifest (`run_id: null`) | "No run yet under this manifest." |
| `null` / missing | Treated as unknown — UI falls through to best-effort | Prefer explicit status |

### Honest-data contract

- If `run_stats_status` is `INDEXED`, `run_stats` **must** be a non-null object.
- If `run_stats_status` is `NOT_INDEXED` or `NO_RUN`, `run_stats` **must** be null.
- The UI never invents numbers. Absent fields stay absent.

### Current coverage (prototype dataset)

| Candidate | Status | Notes |
|---|---|---|
| `q076b_regime_aware_momentum_frozen_reference` | `INDEXED` | Mirrored verbatim from passport `ram_stop5_tgt15` in `data.js` |
| `q085_dynamic_tech_top6.stop_5_target_15` | `NOT_INDEXED` | Result bundle at `backtest/campaigns/q085_dynamic_tech_top6/results/...`. Real numbers still live there. |
| `q085_dynamic_tech_top8.stop_5_target_15` | `NOT_INDEXED` | Same shape. |
| `q085_momentum_dynamic_tech_screen.stop_5_target_15` | `NOT_INDEXED` | Same shape. |
| `q085_clite_monthly_top12.stop_5_target_15` | `NO_RUN` | C-lite challenger, no manifest run yet. |
| `q085_clite_v2_monthly_top12.stop_5_target_15` | `NO_RUN` | Same. |

### Producer checklist

When `run_stats` wiring lands in the campaign-manifest generator:

1. On every successful campaign run, after packaging the result bundle, compute the compact summary and write it into `latest_run.run_stats`.
2. Set `run_stats_status: "INDEXED"` only when all the load-bearing fields (`total_return_pct`, `benchmark_return_pct`, `max_drawdown_pct`, `sharpe`, `trades`) are populated.
3. If any of those are unavailable, prefer `NOT_INDEXED` and leave `run_stats: null` rather than emitting a half-populated object.
4. Era labels must match the benchmark's era-sweep labels (e.g. `"2023 H1"`, `"2023 H2"`) so the UI can cross-reference era sweeps across campaigns.
5. Benchmark fields (`benchmark_return_pct`, `benchmark_sharpe`, `benchmark_max_drawdown_pct`) should be computed on the **same window** as the candidate fields — no full-history-vs-windowed-candidate mismatches.

### What the UI shows (condensed)

**Campaign-level leader card** — full table, two-row grid:
- Row 1: Total return · Excess vs benchmark · Max drawdown (candidate + benchmark)
- Row 2: Sharpe (+ benchmark) · Calmar/Sortino · Trades + win rate

**Per-candidate row** — compact grid, same numbers in a denser 3×2:
- Total return · Excess vs bench · Max DD
- Sharpe · Win rate + PF · Trades + period

Empty states are explicit copy, not hidden.
