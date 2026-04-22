# Bench Campaigns v2 — Producer Primer

> **Audience:** CODEX (backend / campaign-manifest producer)
> **Status:** Contract shape for the next wiring pass. Supersedes the `latest_run.run_stats` shape in `DATA_PRIMER.md`.
> **Authored:** 2026-04-21 · Claude (design) · following CODEX's feedback on the Campaign Detail iteration.
> **Design surface:** `Vires Capital v3.html` → Bench → Campaigns → any campaign detail.

---

## 1. Why this primer exists

The first Campaign Detail pass treated campaigns as "folders over bench runs" — nice grouping, no standard. The operator review said: **campaigns must be research cockpits, not research folders.** Every campaign detail page has to answer, in order:

1. What is this campaign trying to prove?
2. What baseline must it beat?
3. Who is winning right now?
4. Is that lead real or flimsy?
5. What changed since I last looked?
6. What family is producing the pressure?
7. What should we run next?

The prototype UI now renders answers to (1), (3), (5), (6), and partially (4). The backend contract needs to make (2) and a better (4) **first-class and mandatory**, not something the UI has to infer.

This primer defines the contract extensions that make that possible.

---

## 2. What changes at the contract level

Three net-new blocks on every `campaign_manifest`:

| Block | Purpose | Mandatory? |
|---|---|---|
| `baseline` + `baseline_performance` | What standard this campaign must beat. | **Yes** — every campaign. Use `baseline.kind: "NONE"` only when genuinely no baseline exists; that must be deliberate, not a missing field. |
| `leader_comparison_to_baseline` | Is the current leader actually beating the baseline? | Yes when a leader exists; omit or null otherwise. |
| `campaign_pressure` | One operator-summary sentence, backend-authored. | Yes. Load-bearing. |

One existing field gets tightened:

- `current_leader_candidate_id` — unchanged, but must reference a candidate whose `role` is `LEADER` (not `PROMOTED_REFERENCE`; the reference IS the baseline, not a leader).

One prototype-only field gets retired before it ships:

- `latest_run.run_stats` / `run_stats_status` — **do not implement.** The prototype uses it; v2 wiring reads from `campaign.baseline_performance` + `leader_comparison_to_baseline` instead.

Everything else on the existing manifest (`family_groups`, `candidates`, `change_log`, `recency_signals`, `latest_run` compact summary) stays exactly as it is.

---

## 3. The `baseline` block

### Shape

```jsonc
"baseline": {
  "kind": "PROMOTED_REFERENCE",        // enum, see below
  "candidate_id": "q076b_regime_aware_momentum_frozen_reference",
  "strategy_name":  "Regime-Aware Momentum",
  "strategy_id":    "REGIME_AWARE_MOMENTUM",
  "variant":        "5% stop · 15% target",
  "why":            "This is the current promoted stock reference. Any broader ETF-replacement challenger must beat this honestly before it earns promotion pressure."
}
```

### `baseline.kind` enum

| Value | Meaning |
|---|---|
| `PROMOTED_REFERENCE` | The baseline is a candidate already promoted to PAPER or LIVE. The strongest form of "must beat this." |
| `FROZEN_REFERENCE` | A frozen config that isn't yet promoted but has been explicitly blessed as the campaign's standard (e.g. an honest best-of-last-sweep). Weaker than PROMOTED_REFERENCE but still mandatory to beat. |
| `NONE` | No baseline exists yet. **Rare.** This is an honest state for brand-new campaigns that haven't even identified a first reference. UI shows "No baseline yet — what this campaign will compare against is still being chosen." |

If `kind: "NONE"`, every other field in the `baseline` block must be null, and `baseline_performance` must be null.

### Null-handling rules

- `candidate_id` must exist in `candidates[]` if `kind != "NONE"`.
- `strategy_name` + `strategy_id` are mandatory when `kind != "NONE"`. These let the UI show the baseline's human name without resolving the full candidate record.
- `variant` is mandatory when the baseline has parameterized variants; null otherwise.
- `why` is mandatory and load-bearing. The UI renders it in an italic serif callout. Write it like an honest operator sentence, not marketing copy.

---

## 4. The `baseline_performance` block

This replaces the prototype's `latest_run.run_stats` for the baseline candidate. It is the absolute-numbers story: "what the current standard does."

### Shape

```jsonc
"baseline_performance": {
  "evaluation_window": {
    "start":        "2022-01-01",   // required
    "end":          "2024-11-30",   // required
    "trading_days": 797             // optional int
  },

  "eras": [
    { "label": "2023 H1", "pass": true },
    { "label": "2023 H2", "pass": true },
    { "label": "2024 H1", "pass": true },
    { "label": "2024 H2", "pass": true }
  ],
  "eras_passed":             4,
  "eras_total":              4,

  "total_return_pct":        90.50,
  "benchmark_return_pct":    80.45,   // on the SAME window
  "excess_return_pct":       10.05,

  "max_drawdown_pct":         -8.89,   // negative by convention
  "benchmark_max_drawdown_pct":-13.40,

  "sharpe":          1.93,
  "benchmark_sharpe":1.12,
  "sortino":         3.17,
  "calmar":          2.55,

  "profit_factor": 2.12,
  "win_rate_pct":  61.96,
  "trades":        163,

  "source": {
    "kind":          "PASSPORT",    // "PASSPORT" | "RESULT_BUNDLE" | "CHECKED_IN"
    "passport_id":   "ram_stop5_tgt15",
    "bundle_path":   null,
    "generated_at":  "2026-04-17T20:30:00-04:00"
  }
}
```

### Which fields are mandatory

**Load-bearing (UI treats absence as a data-quality problem):**

- `evaluation_window.start` + `evaluation_window.end`
- `total_return_pct`, `benchmark_return_pct`, `excess_return_pct`
- `max_drawdown_pct`
- `sharpe`
- `trades`
- `source.kind` + `source.generated_at`

**Optional (UI renders em-dash if absent):**

- `evaluation_window.trading_days`
- `benchmark_max_drawdown_pct`, `benchmark_sharpe`, `sortino`, `calmar`
- `profit_factor`, `win_rate_pct`
- `eras` (but if present, `eras_passed` and `eras_total` must both be set)

### Computation rules

1. **Same-window benchmark.** `benchmark_return_pct`, `benchmark_sharpe`, `benchmark_max_drawdown_pct` must be computed on the exact `evaluation_window`. No full-history-vs-windowed-candidate mismatches.
2. **Sign conventions.** Drawdowns are negative. Excess is `candidate − benchmark` (signed). Percentages are percent, not decimal (`90.50`, not `0.9050`).
3. **Era labels** must match the benchmark era-sweep labels (`"2023 H1"`, `"2023 H2"`, `"2024 H1"`, `"2024 H2"`, etc.) so the UI can cross-reference era sweeps across campaigns.
4. **`source.kind`** tells the UI where the numbers came from. `PASSPORT` means a normalized passport object already carries these stats (just mirror them). `RESULT_BUNDLE` means the stats were extracted from a bench result bundle JSON. `CHECKED_IN` means they came from a hand-curated manifest file in the repo.

---

## 5. The `leader_comparison_to_baseline` block

This is the "are we beating it?" story. Lighter than `baseline_performance` because the UI pairs it visually with the baseline block.

### Shape

```jsonc
"leader_comparison_to_baseline": {
  "leader_candidate_id":    "q085_dynamic_tech_top6.stop_5_target_15",
  "evaluation_window":      { "start": "2023-01-01", "end": "2024-11-30", "trading_days": 500 },

  "return_delta_pct":       null,   // leader_total_return − baseline_total_return, signed
  "excess_delta_pct":       null,   // leader_excess − baseline_excess
  "sharpe_delta":           null,
  "drawdown_delta_pct":     null,   // leader_maxDD − baseline_maxDD; positive = shallower
  "eras_pass_delta":        null,   // (leader_eras_passed) − (baseline_eras_passed)

  "status":                 "INSUFFICIENT_EVIDENCE",   // enum, see below
  "summary":                "Leader result bundle hasn't been normalized into the campaign manifest yet; gap cannot be quantified honestly."
}
```

### `status` enum

| Value | Meaning | UI treatment |
|---|---|---|
| `AHEAD` | Leader beats baseline on every load-bearing dimension (return, Sharpe, drawdown not worse, eras not worse). | Gold accent. "Leader is clearly ahead." |
| `MIXED` | Leader wins on some dimensions, loses or ties on others. | Neutral. "Leader is ahead on X, behind on Y." |
| `NOT_YET_AHEAD` | Leader is clearly behind the baseline on the load-bearing dimensions. | Muted. "Leader has not beaten the baseline yet." |
| `INSUFFICIENT_EVIDENCE` | Deltas cannot be computed (missing numbers, window mismatch, no fresh run). | Italic serif honest copy. "Gap not yet quantified — needs fresh runs." |

### Rules

- **`INSUFFICIENT_EVIDENCE` is a first-class state**, not a fallback. Every numeric delta field in the block must be `null` when status is `INSUFFICIENT_EVIDENCE`. The UI renders the `summary` prose instead.
- **Windows must match.** When status is `AHEAD`, `MIXED`, or `NOT_YET_AHEAD`, the leader's `evaluation_window` must overlap the baseline's `evaluation_window` enough to be honest. If not, emit `INSUFFICIENT_EVIDENCE` — do NOT emit deltas on mismatched windows.
- **`summary` is mandatory for every status**, including `AHEAD`. It's one honest operator sentence. Write it like the existing `runner_up_gap.summary` strings.
- **Delta sign conventions.** Positive means "leader is better" for every delta. That means `drawdown_delta_pct` is flipped from raw subtraction: `baseline_maxDD − leader_maxDD` (baseline −13, leader −8 → delta `+5`, positive = shallower DD = leader better).
- If `baseline.kind: "NONE"`, the entire `leader_comparison_to_baseline` block must be null. Nothing to compare against.

---

## 6. The `campaign_pressure` field

One short, backend-authored operator sentence. Load-bearing.

### Shape

```jsonc
"campaign_pressure": {
  "status":  "BASELINE_CLEARLY_AHEAD",   // enum, see below
  "summary": "The promoted frozen reference is still the clear baseline; broader challengers are present but need fresh runs before the gap can be quantified honestly.",
  "as_of":   "2026-04-20T21:55:00-04:00"
}
```

### `status` enum

| Value | Meaning |
|---|---|
| `BASELINE_CLEARLY_AHEAD` | Baseline is the standard and nothing in research is pressuring it yet. |
| `CHALLENGER_WITHIN_STRIKING_DISTANCE` | A challenger is materially close on the load-bearing dimensions. Not yet ahead, but visibly pressuring. |
| `LEADER_NOT_YET_QUALITY_GATED` | A challenger has become the internal leader but still fails at least one quality gate (era sweep, Sharpe, drawdown). Leader in bench, not in promotion. |
| `LEADER_APPROACHING_PROMOTION` | Leader is beating the baseline AND passing quality gates. Promotion review is warranted. |
| `NEEDS_FRESH_RUNS` | No meaningful comparison possible until new runs land. Used when data is stale or absent. |
| `EXPLORATORY` | Campaign is genuinely early; no clear leader, no meaningful pressure yet. |

### Rules

- `summary` is mandatory. One sentence, conversational operator tone, NOT marketing.
- `as_of` is mandatory. Lets the UI show "last assessed Xh ago" freshness.
- The status enum is the backend's opinion, not the UI's inference. The UI does NOT compute this from deltas — it renders what the backend says.
- If the UI can see stale `as_of` (older than ~48h for active campaigns), it will render a freshness badge. The backend should re-emit this block whenever new runs land.

---

## 7. Worked example — `stocks_etf_replacement_momentum`

The campaign the operator loved as the canonical model. Here is what the v2 contract looks like for this campaign, mirroring the real passport numbers.

```jsonc
{
  "schema_version": "bench_campaign_manifest.v2",
  "campaign_id":    "stocks_etf_replacement_momentum",
  "title":          "ETF Replacement Momentum",
  "sleeve":         "STOCKS",
  "benchmark_symbol": "SPY",
  "status":         "CONVERGING",
  "objective":      "Build a serious-retail stock sleeve that can plausibly replace a passive broad-equity allocation instead of just screenshotting one hot niche run.",
  "summary":        "...",
  "promotion_target": "...",
  "updated_at":     "2026-04-20T21:55:00-04:00",
  "updated_by":     "codex",

  "baseline": {
    "kind":          "PROMOTED_REFERENCE",
    "candidate_id":  "q076b_regime_aware_momentum_frozen_reference",
    "strategy_name": "Regime-Aware Momentum",
    "strategy_id":   "REGIME_AWARE_MOMENTUM",
    "variant":       "5% stop · 15% target",
    "why":           "Current promoted stock reference and the baseline every broader ETF-replacement challenger must beat honestly."
  },

  "baseline_performance": {
    "evaluation_window": { "start": "2022-01-01", "end": "2024-11-30", "trading_days": 797 },
    "eras": [
      { "label": "2023 H1", "pass": true },
      { "label": "2023 H2", "pass": true },
      { "label": "2024 H1", "pass": true },
      { "label": "2024 H2", "pass": true }
    ],
    "eras_passed": 4,
    "eras_total":  4,
    "total_return_pct":          90.50,
    "benchmark_return_pct":      80.45,
    "excess_return_pct":         10.05,
    "max_drawdown_pct":          -8.89,
    "benchmark_max_drawdown_pct":-13.40,
    "sharpe":          1.93,
    "benchmark_sharpe":1.12,
    "sortino":         3.17,
    "calmar":          2.55,
    "profit_factor":   2.12,
    "win_rate_pct":    61.96,
    "trades":          163,
    "source": {
      "kind":         "PASSPORT",
      "passport_id":  "ram_stop5_tgt15",
      "bundle_path":  null,
      "generated_at": "2026-04-17T20:30:00-04:00"
    }
  },

  "current_leader_candidate_id": null,

  "leader_comparison_to_baseline": null,

  "campaign_pressure": {
    "status":  "BASELINE_CLEARLY_AHEAD",
    "summary": "The promoted frozen reference is still the clear baseline; broader challengers are present but need fresh runs before the gap can be quantified honestly.",
    "as_of":   "2026-04-20T21:55:00-04:00"
  },

  "recency_signals":  { /* unchanged */ },
  "family_groups":    [ /* unchanged */ ],
  "candidates":       [ /* unchanged — latest_run stays compact */ ],
  "change_log":       [ /* unchanged */ ]
}
```

Note `current_leader_candidate_id: null` — for this campaign the baseline IS the reference, there's no separate leader yet. That's a clean state.

---

## 8. Worked example — `stocks_ai_wall_street_aggressive`

A campaign WITH a leader that is NOT yet beating the baseline.

```jsonc
{
  "campaign_id": "stocks_ai_wall_street_aggressive",
  "title":       "Aggressive AI Wall Street",
  "sleeve":      "STOCKS",
  "benchmark_symbol": "QQQ",
  "status":      "EXPLORING",
  // ...

  "baseline": {
    "kind":          "PROMOTED_REFERENCE",
    "candidate_id":  "q076b_regime_aware_momentum_frozen_reference",
    "strategy_name": "Regime-Aware Momentum",
    "strategy_id":   "REGIME_AWARE_MOMENTUM",
    "variant":       "5% stop · 15% target",
    "why":           "Every aggressive AI challenger must beat the promoted stock reference honestly before it earns promotion pressure of its own."
  },

  "baseline_performance": { /* mirrored from the promoted reference passport */ },

  "current_leader_candidate_id": "q085_dynamic_tech_top6.stop_5_target_15",

  "leader_comparison_to_baseline": {
    "leader_candidate_id": "q085_dynamic_tech_top6.stop_5_target_15",
    "evaluation_window":   { "start": "2023-01-01", "end": "2024-11-30", "trading_days": 500 },

    "return_delta_pct":   null,
    "excess_delta_pct":   null,
    "sharpe_delta":       null,
    "drawdown_delta_pct": null,
    "eras_pass_delta":    null,

    "status":  "INSUFFICIENT_EVIDENCE",
    "summary": "Dynamic Top 6's current result bundle hasn't been normalized for cross-window comparison against the frozen reference. The gap is real, but the honest value hasn't been computed yet."
  },

  "campaign_pressure": {
    "status":  "LEADER_NOT_YET_QUALITY_GATED",
    "summary": "Dynamic Top 6 leads internally but still fails the era sweep. Leader in bench, not in promotion.",
    "as_of":   "2026-04-20T21:55:00-04:00"
  },

  // ... rest unchanged
}
```

This shape lets the UI say honest things without inventing deltas.

---

## 9. Schema-version bump

- Current: `bench_campaign_manifest.v1`
- New: `bench_campaign_manifest.v2`

The v2 adds the three blocks above. v1 manifests can be migrated by:

1. Setting `baseline.kind: "NONE"` and `baseline_performance: null` — then filling in real values campaign-by-campaign.
2. Computing `leader_comparison_to_baseline` only for campaigns that already have a leader AND a reference. Otherwise null.
3. Emitting `campaign_pressure` with `status: "EXPLORATORY"` and an honest summary for every campaign on first migration. This avoids a silent gap.

The UI should tolerate v1 manifests during migration by treating absent v2 fields as explicit null / "not yet assessed" states. This is graceful degradation, not an error.

---

## 10. What the UI will do with this

For each block the producer emits, the UI has a specific render target:

| Producer block | UI surface |
|---|---|
| `baseline` + `baseline.why` | Top of Campaign Detail: "Baseline to beat" card header + italic serif `why` callout. |
| `baseline_performance` | Full stats table inside the baseline card (period, era strip, 2×3 metric grid). Labeled "Baseline performance · what this campaign must beat." |
| `leader_comparison_to_baseline` | New "Leader vs baseline" block, placed between the baseline card and the lever strip. Deltas rendered with signed +/− and colored by `signColor`. Status chip on the right. Summary prose below. |
| `campaign_pressure.summary` | Italic serif callout directly under the campaign title. **This is the first thing the operator reads after the title.** |
| `campaign_pressure.status` | Status chip at top-right of detail page, next to the existing campaign-status pill. |
| Everything else | Renders exactly as it does today. |

The new blocks compose with the existing `family_groups` / `candidates` / `change_log` / `recency_signals` sections — nothing downstream has to change.

---

## 11. Checklist for the backend wire

1. ☐ Bump `schema_version` to `bench_campaign_manifest.v2` on every emitted manifest.
2. ☐ Add `baseline` block to every campaign. Never omit. Use `kind: "NONE"` only when genuinely no baseline exists and back it up with an honest `summary` on `campaign_pressure`.
3. ☐ Add `baseline_performance` block whenever `baseline.kind != "NONE"`. Mirror from the promoted passport where possible, otherwise compute from the result bundle.
4. ☐ Compute `leader_comparison_to_baseline` whenever `current_leader_candidate_id` is set AND `baseline.kind != "NONE"` AND windows overlap. Otherwise `INSUFFICIENT_EVIDENCE` with an honest summary.
5. ☐ Emit `campaign_pressure` on every manifest. Update `as_of` whenever a campaign-level event lands (new run, leader change, promotion reference swap).
6. ☐ Re-emit the manifest on every meaningful event so `as_of` stays fresh.
7. ☐ Leave `latest_run` compact. Do NOT add `run_stats` there — that shape is deprecated.
8. ☐ Validate: if `baseline.kind != "NONE"` and `baseline_performance.sharpe` is null, fail loudly. That's a data-quality problem, not a UI state.

---

## 12. Questions CODEX should flag back

If the answer to any of these is "not yet," that's fine — just emit `INSUFFICIENT_EVIDENCE` / `NEEDS_FRESH_RUNS` and we'll iterate:

- How do we identify "the promoted reference" for a campaign when the reference isn't explicitly checked into the campaign manifest? (Today q076b is referenced directly; for campaigns where the operator hasn't picked a reference yet, is there a default? Or does `baseline.kind: "NONE"` apply?)
- For campaigns that benchmark against a different index than the promoted reference (e.g. aggressive AI benchmarks vs QQQ but the reference runs vs SPY), do we still show the SPY-window baseline? My read: yes, with an honest `why` sentence explaining the benchmark mismatch. UI can handle it.
- Are there campaigns today where `baseline.kind: "FROZEN_REFERENCE"` applies rather than `PROMOTED_REFERENCE`? If not, we can ship without `FROZEN_REFERENCE` in v2 and add it when it shows up.

---

## 13. What Claude will do next (design side)

After CODEX wires v2:

1. Update `vires-campaigns-data.js` to mirror the v2 shape (real values for ETF campaign, honest null / `INSUFFICIENT_EVIDENCE` for the aggressive AI campaign).
2. Replace the `latest_run.run_stats` UI wiring with the new `campaign.baseline_performance` wiring.
3. Add the "Leader vs baseline" block.
4. Add the `campaign_pressure` operator sentence under the campaign title.
5. Retire the per-candidate compact stats grid (the v2 contract doesn't carry per-candidate stats; candidate rows stay lean and deep-link to passports when ready).
6. Update `DATA_PRIMER.md` to point at this primer as canonical and remove the deprecated `latest_run.run_stats` section.

---

**End of primer.** Ping design when the contract lands in a dev manifest; I'll migrate the prototype in the same pass.
