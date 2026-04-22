# Bench Campaigns — Notes & Feedback Log

This is an append-only log of design decisions, operator feedback, and contract-shape changes tied to the Bench Campaigns surface. Most recent first.

---

## 2026-04-21 — CODEX feedback on Campaign Detail iteration

**Context:** After the first Campaign Detail round (leader card + lever strip + family leaderboard + change log), the operator noted the design was "good but conveying activity, not standards." They asked for meaningful stats. Claude added a `run_stats` block under each `latest_run` and populated numbers for the q076b Frozen Reference from its passport.

CODEX reviewed and gave the following feedback, which **supersedes** the `run_stats`-on-`latest_run` shape.

### Accepted — becomes canonical

1. **The ETF Replacement Momentum detail layout is the canonical model.** Every campaign detail page must answer, in order:
   1. What is this campaign trying to prove?
   2. What baseline must it beat?
   3. Who is winning right now?
   4. Is that lead real or flimsy?
   5. What changed since I last looked?
   6. What family is producing the pressure?
   7. What should we run next?

2. **Campaigns are a research cockpit, not a report.** UI density, recency signals, and lever-shell framing should all reinforce "participate in bench testing," not "browse runs."

3. **Baseline is mandatory, not decorative.** Every campaign must carry a `baseline` block with a non-empty `baseline_performance`. If truly no baseline exists, the contract allows `baseline.kind: "NONE"` but that must be a deliberate, explicit state — not a missing field.

4. **Two separate performance stories.** Split what used to be one `run_stats` block into:
   - `baseline_performance` — what the campaign must beat (absolute numbers).
   - `leader_comparison_to_baseline` — is the leader beating it, and on what dimensions (deltas + status enum).

5. **`campaign_pressure`** — a short backend-authored operator-summary sentence, first-class on the contract. Examples:
   - "baseline still clearly ahead"
   - "challenger within striking distance"
   - "leader not yet quality-gated"
   - "needs fresh runs before gap can be quantified"
   This is load-bearing and is NOT inferred by the frontend.

6. **First-class on the contract (confirmed):**
   - `baseline` + `baseline_performance`
   - `current_leader` + `runner_up` + `runner_up_gap`
   - `leader_comparison_to_baseline`
   - `campaign_pressure`
   - `leader_stability_sessions`
   - `last_run_at` / `last_meaningful_change_at` / `last_param_sweep_at`
   - `families` + `candidates_by_family`
   - `change_log`

7. **Stays optional / deferred:**
   - Per-candidate deep-links into passports.
   - Lever action wiring (tweak buttons, "run new sweep" buttons).
   - Automated "what to try next" suggestions.
   - Quantified `runner_up_gap.value` when data isn't honest yet. `"Not yet quantified"` remains a valid, designed-for state.

### Retired — DO NOT ship to backend as-is

- The `latest_run.run_stats` / `run_stats_status` shape introduced in the previous pass is **deprecated** before it reaches production. The UI prototype still renders it for the leader card, but the contract CODEX will wire is `campaign.baseline_performance` + `campaign.leader_comparison_to_baseline`, not per-candidate stats on every row.
- The NOT_INDEXED / NO_RUN / INDEXED enum was useful for the prototype (honest-data during design). It should NOT appear in the v2 contract. The new contract uses `baseline.kind: "PROMOTED_REFERENCE" | "FROZEN_REFERENCE" | "NONE"` + presence/absence of `leader_comparison_to_baseline` instead.

### Notes for Claude (design follow-up)

- When CODEX's v2 contract lands, the Campaign Detail page needs re-wiring:
  - Leader card's "Bench performance" block → read from `campaign.baseline_performance`, re-labeled "Baseline performance · what this campaign must beat."
  - Add a new "Leader vs baseline" block above or beside the baseline block → read from `campaign.leader_comparison_to_baseline`. Show deltas, the status enum (`AHEAD | MIXED | NOT_YET_AHEAD | INSUFFICIENT_EVIDENCE`).
  - Add `campaign_pressure` as an italic serif callout under the title. This is the load-bearing operator sentence — treat it like the `runner_up_gap.summary` copy style already in use.
  - Per-candidate compact stats grid can go — the v2 contract doesn't carry per-candidate stats. Keep the candidate row lean (title, role tag, run_id, summary) and deep-link to the passport for numbers.

- The `run_stats` prototype stays in the file for one more design cycle so we can screenshot the final shape next to the new shape. Then delete.

---

## Earlier entries

(none — this is the first entry for `campaigns/NOTES.md`)
