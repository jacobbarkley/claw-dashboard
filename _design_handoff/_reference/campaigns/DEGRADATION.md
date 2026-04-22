# Bench Campaigns — Degradation Matrix

Per Rev-3 protocol: every field that can be null, missing, or backend-deferred needs an explicit rendering rule.

---

## Rule 1 — `runner_up_gap.value: null` (the load-bearing case)

**Real examples from the shipped manifests:**

- Aggressive AI Wall Street — `value: null`, `metric: QUALITY_GATE_STATUS`, `summary: "Leader and runner-up are still clustered in exploratory territory; neither has earned promotion pressure yet."`
- ETF Replacement Momentum — `value: null`, `metric: READINESS`, `summary: "The promoted frozen reference is still the clear baseline; broader challengers are present but need fresh runs before the gap can be quantified honestly."`

**Rendering rule:**
- When `value` is null → right-aligned tag reads "not yet quantified" (eyebrow-styled, muted).
- `summary` renders as italic serif prose (Cormorant Garamond, `var(--fs-micro)`, `color: var(--vr-cream-dim)`).
- Never render `—`, `N/A`, `pending`, or a zero.

**Rendering rule (future quantified case):**
- `value` non-null → numeric value in `t-num` style, followed by a small uppercase `metric` tag.
- `summary` still renders as italic serif prose beneath; both live together.

## Rule 2 — Entire `runner_up_gap` missing

- Band does not render at all. Neutral expected state if recency_signals doesn't include the field.

## Rule 3 — `runner_up_candidate_id: null` (but `runner_up_gap` present)

- Gap band renders with its eyebrow, `summary`, and quantified/unquantified state.
- The "Runner-up: {title}" footnote is simply omitted.

## Rule 4 — `last_leader_change_at: null`

- Lever cell "Leader stability" still renders (using `leader_stability_sessions`).
- Sub-line "changed {rel}" is omitted.

## Rule 5 — `leader_stability_sessions: 0` or missing

- Value shows "0 sessions" when 0.
- When missing, cell falls back to "—"; consider whether this is an intended signal or a backend bug.

## Rule 6 — `last_param_sweep_at: null` / `days_since_param_sweep: null`

- Primary value renders "—".
- Sub-line omitted.
- Operator reads this as "no sweep logged yet," not "never swept" — that's accurate for v1.

## Rule 7 — `last_run_at: null`

- Lever cell "Last run" renders "—".
- If this stays null for more than a day, it's a staleness signal operators should catch from other cues (leader stability sessions staying low, change_log empty).

## Rule 8 — Empty `change_log: []`

- The latest-change preview block is omitted entirely from the card.
- No "No activity yet" placeholder — absence of a timeline is itself the signal. Scope footnote card at page bottom already frames this.

## Rule 9 — Unknown `change_log[].kind`

- Icon: neutral cream dot.
- Label: raw kind string lowercased (underscores → spaces).
- Does not throw. Forward-compatible with any enum addition.

## Rule 10 — `current_leader_candidate_id` refers to a missing candidate

- Leader row block is omitted.
- Card still renders with summary + lever grid + gap band + families + change log.
- This is a data-quality red flag but doesn't break the UI.

## Rule 11 — `current_leader_candidate_id: null`

- Same as Rule 10 — leader row omitted.
- Acceptable for a brand-new campaign with candidates but no declared leader yet.

## Rule 12 — `family_groups: []` or no candidates in any family

- "Families in play" chip strip is omitted entirely.
- Lever grid "Candidates" cell still shows the count; sub-line reads "0 families".

## Rule 13 — `candidates: []`

- Leader row: omitted.
- Lever grid "Candidates" cell: 0 · 0 families.
- Runner-up gap band: still renders if present in `recency_signals` (the contract allows describing a future gap before candidates land — though unlikely).
- Change-log: still renders if present.

## Rule 14 — `PROMOTED_REFERENCE` present but not referenced as leader

- The promoted reference is simply a candidate like any other on the index (not surfaced on the card at all unless it IS the leader).
- This is fine for v1: the detail page will show all candidates including the promoted reference in its own tier row.

## Rule 15 — `updated_at` / `updated_by` missing

- Footer omits the "Updated Xm ago · by X" line.
- The change-log preview still carries its own relative time.

## Rule 16 — Multiple writers updating simultaneously

- Latest `updated_at` + latest `updated_by` wins; UI shows whoever last wrote.
- No actor-specific styling. This is intentional per contract: "the UI should not care which writer moved the campaign forward."

## Rule 17 — `schema_version` mismatch

- Not surfaced to operators. Log to console; design assumes `bench_campaign_manifest.v1`. When v2 ships, we rev this file alongside the shape diff.

## Rule 18 — Freshness staleness (implicit)

- `relTime()` formats: `just now`, `Nm ago`, `Nh ago`, `Nd ago`, `Nw ago`, `Nmo ago`.
- No color-coded staleness threshold in v1. If operators ask for "turn the lever cell amber when > 7d," that's a future enhancement tied to per-field thresholds the contract doesn't specify yet.

## Backend-deferred fields (acknowledged gaps)

Three lever fields the primer flagged as backend-deferred:

1. `leader_stability_sessions` — already emitted by both shipped manifests. Works today.
2. `runner_up_gap.value` — intentionally null in both shipped manifests. Working-as-designed.
3. `days_since_param_sweep` — emitted in both. Works today.

None are breaking the index. When real quantified gaps start appearing, Rule 1's quantified branch takes over automatically — no UI change needed.
