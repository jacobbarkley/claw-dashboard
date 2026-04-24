# Spec Amendment — idea → campaign rollup (2026-04-24)

**Status:** LOCKED — Codex signed off, merged into `SPEC_REVIEW_2026-04-23.md` §12.
This file is preserved for commit-history context; the authoritative
version now lives in the main spec.

Rev 2 adopted all of Codex's P1/P2 findings. Q6 resolved with option (b)
plus the "no nomination until promotion_target exists" rule.
**Trigger:** After Jacob observed that Lab jobs live at
`/vires/bench/lab/jobs` but never surface inside a campaign card, we
need to wire the rollup.

**Rev 2 locks (post-Codex review):**

1. **`promote_to_campaign` semantics clarified.** The flag doesn't
   materialize an empty campaign; it means "force rollup on the first
   DONE Lab job for this idea, bypassing the evidence/volume
   thresholds." No pre-job empty-campaign shape is needed. Fixes P1.
2. **Readiness trigger tightened.** Changed from `!= EMPTY_STATE` (which
   would include BLOCKED and fire on the first DONE stocks job) to
   `overall_status ∈ { READY_TO_NOMINATE, MONITORED }` — meaningfully
   competitive only. Fixes P1. Stocks with BLOCKED gates now falls back
   to the volume threshold (N=3). Crypto/options continue to fall back
   to volume since their adapter status keeps readiness at EMPTY_STATE.
3. **Volume threshold tightened.** N=3 **unique DONE `job_id`s**. FAILED
   jobs don't count. Retries on the same `job_id` don't double-count.
4. **Family comparability rule.** Campaign = container; family =
   comparable leaderboard unit. Each family has its own leader. No
   cross-family leader claims (no campaign-wide gold "leader family"
   highlight) unless presets are explicitly marked comparable. Fixes P2.
5. **Idea → campaign status mapping on lifecycle changes** added to §7.
6. **Nomination provenance** widened to log
   `candidate_id + origin_job_id + idea_id`, not just `candidate_id`.

---

## 1. The gap this closes

Today, Lab and Campaigns are parallel surfaces:

- **Lab** (new, per SPEC_REVIEW_2026-04-23) owns authoring: idea →
  campaign_request → job → result → candidate → nomination.
- **Campaigns** (existing Bench surface) owns long-lived research
  pressure: each `campaign_manifest.v2` tracks competing candidates,
  baseline performance, a 9-gate readiness scorecard, a change log,
  and promotion_events.

These surfaces don't talk. Submit ten Lab jobs for the same idea and
they all render at `/vires/bench/lab/jobs` — none of them roll up into
a campaign card. That's inconsistent with the operator's mental model
("I've been testing Idea X across twelve sweeps — show me the
leaderboard, the readiness, the history") and wastes the existing
Campaigns UI which already renders exactly that view.

---

## 2. The rollup concept

**An idea is the natural campaign container.** When Lab jobs run
against an idea, their candidates roll up into a campaign manifest
keyed to that idea. Same data, two lenses:

- **Lab** is authoring-first: "I ran this, what happened."
- **Campaigns** is research-pressure-first: "which candidates are
  competing for promotion, how close are they to the gates."

The unifier is `idea_id`, already present on
`campaign_request.v1 → bench_bundle.v1 → job.v1 → result.v1 → candidate.v1`.

---

## 3. The rollup trigger (threshold, not always-on)

Per Jacob's call: campaigns spin up **only once an idea passes a
threshold** — not on every Lab submission. This keeps casual
experiments out of the Campaigns surface while still catching any idea
that's attracting real research pressure.

**Trigger set — ANY of these flips an idea into a campaign:**

1. **Explicit operator flag** (idea.v1 `promote_to_campaign: true`).
   Doesn't materialize an empty campaign on its own — it means "force
   rollup on the first DONE Lab job for this idea, bypassing the
   evidence/volume thresholds." Producer waits for the first DONE
   job, then creates the campaign on that sync. (Rev 2 correction:
   the flag was previously described as materializing the campaign
   immediately, which couldn't work since `benchmark`, `first_job_id`,
   and `evaluation_window` only exist after a job runs.)
2. **Evidence threshold — meaningfully competitive candidate.** A Lab
   job against this idea reaches `DONE` with
   `candidate.readiness.overall_status ∈ { READY_TO_NOMINATE, MONITORED }`.
   BLOCKED is intentionally excluded: BLOCKED means "gates scored but
   some failed" — real information, but not enough signal to claim
   campaign-worthy research pressure. (Stocks-BLOCKED falls back to
   the volume threshold. Crypto with EMPTY_STATE readiness, and
   options where the adapter is NOT_IMPLEMENTED, always fall back to
   volume.)
3. **Volume threshold.** N=3 **unique DONE `job_id`s** for this
   `idea_id`. FAILED jobs don't count. RETRY_QUEUED → DONE on the same
   `job_id` counts once. Covers iteration on a preset whose adapter
   doesn't yet produce competitive readiness.

Before the trigger, the idea lives only in Lab. After the trigger, the
producer maintains the campaign in lockstep with subsequent Lab jobs.
Promotion is one-directional: once a campaign exists for an idea, it
persists; no auto-demotion back to "Lab-only."

---

## 4. Contract additions

Small, backwards-compatible. All optional fields.

### 4.1 `idea.v1` — add `promote_to_campaign`

```yaml
promote_to_campaign: true   # optional; defaults false
```

When set, the producer creates the campaign on the **first DONE Lab
job** for this idea, regardless of evidence/volume thresholds. Does
NOT create an empty campaign on flag-flip alone — the first job still
needs to materialize so the campaign has a benchmark, an
evaluation_window, and a first_job_id to carry.

### 4.2 `campaign_manifest.v2` — add `origin`

Opt-in block that names the Lab idea backing the campaign. Lets UI
surfaces (and any future governance checks) distinguish Lab-spawned
campaigns from the curated bench campaigns Codex authors directly.

```jsonc
"origin": {
  "kind": "LAB_IDEA",              // LAB_IDEA | BENCH_MANUAL | ...
  "idea_id": "idea_01H...",
  "first_job_id": "job_01H...",    // the job that crossed the threshold
  "created_at": "2026-04-24T..."
}
```

Existing Bench-authored campaigns omit this block; the old UI paths
continue to work unchanged.

### 4.3 `candidate.v1` — add `origin_job_id`

Already carries `idea_id` and `result_id`. Add:

```jsonc
"origin_job_id": "job_01H..."
```

Lets the campaign's candidate leaderboard deep-link each row back to
its Lab job detail view. Optional; non-Lab campaigns leave it null.

### 4.4 Close the Lab-output ↔ Campaign-input data gaps

Framing: **Lab and Campaigns are stages of one system, not two systems
that need a translator.** A Lab-produced `result.v1` / `candidate.v1`
should carry every field the existing Campaigns UI already renders, so
the rollup producer can assemble a full-shape campaign manifest with no
derivation, inference, or "—" placeholders.

Current gaps between what Lab emits and what Campaigns render:

**a) Benchmark performance is thin.** `result.v1.benchmark` today
carries `{ symbol, total_return_pct, sharpe_ratio }`. Campaigns'
`baseline_performance` block renders Calmar, Sortino, Max DD, and a
per-era pass/fail strip. Without those, a Lab-spawned campaign's
baseline table renders mostly "—" and the era stripe is absent.

Grow `result.v1.benchmark` to match:

```jsonc
"benchmark": {
  "symbol": "SPY",
  "total_return_pct": 80.45,
  "sharpe_ratio": 1.12,
  "sortino_ratio": 1.54,
  "calmar_ratio": 1.34,
  "max_drawdown_pct": -13.40,
  "eras": [
    { "label": "2023 H1", "sharpe": 0.94, "ret": 12.1, "pass": true },
    { "label": "2023 H2", "sharpe": 1.18, "ret": 18.6, "pass": true },
    ...
  ],
  "eras_passed": 5,
  "eras_total": 6
}
```

Same shape the existing bench producer emits for benchmark rows on
curated campaigns — so Campaigns' render code needs zero changes.

**b) Evaluation window is implicit.** Campaigns show "Period Oct 2025
– Apr 2026 · 142 days" prominently. The bundle's `base_experiment`
knows this, but `result.v1` doesn't explicitly echo it. Add:

```jsonc
"evaluation_window": {
  "from": "2025-10-07",
  "to": "2026-04-22",
  "days": 142
}
```

Top-level on `result.v1`. Populated by the executor from the bench run.

**c) Promotion-target identity is missing from Lab artifacts.**
Campaigns' `promotion_readiness` block carries `passport_role_id`,
`target_action` (`CREATE_NEW` / `REPLACE_EXISTING`), and
`supersedes_record_id`. These wire the Nominate button to the correct
strategy-bank slot. If Lab skips them, a Lab-spawned campaign renders
the readiness scorecard fine but the Nominate button either disables
or picks the wrong slot.

**Proposed home: optional `promotion_target` block on `idea.v1`.** The
operator commits at idea-authoring time to the slot this idea's
eventual winner should occupy:

```yaml
promotion_target:
  passport_role_id: "STOCKS_BROAD_MOMENTUM"
  target_action: "REPLACE_EXISTING"        # or CREATE_NEW
  supersedes_record_id: "regime_aware_momentum::stop_5_target_15"  # only with REPLACE_EXISTING
```

When present, the rollup producer copies these onto the campaign's
`promotion_readiness` block verbatim. When absent, the campaign
renders readiness without the nomination wire — Nominate button stays
disabled with copy like "Pick a promotion slot to enable nomination"
(new honest-empty-state). A follow-on "assign slot" action on the
campaign detail page lets the operator fill it in later; see §7 Q6
for sequencing.

---

## 5. Producer work (Codex)

New or extended module: `openclaw_core.research_lab.campaign_rollup`
(naming tentative — Codex's call).

**Responsibilities:**

1. **Watch for trigger.** On each DONE job (or on idea-flag flip),
   evaluate the three trigger conditions for that job's `idea_id`.
   If any fires and no campaign exists for that idea yet, create one.
2. **Create campaign.** Materialize a `campaign_manifest.v2` keyed to
   the idea. Sensible defaults:
   - `campaign_id`: derived, e.g. `lab_{idea_id_slug}`
   - `title`: idea's title (or display_name)
   - `objective`: idea's thesis
   - `sleeve`: idea.sleeve
   - `benchmark_symbol`: preset's benchmark (stocks→SPY, crypto→BTC-USD,
     etc. — already known from the first bundle)
   - `origin.kind: "LAB_IDEA"` with idea_id + first_job_id
   - Empty family_groups/candidates at creation; populated on sync.
3. **Sync on every Lab job transition.** On each DONE, append the
   candidate to the appropriate family group (see §5.1 below) and
   recompute leaderboard + baseline_performance +
   promotion_readiness as the existing producer does.
4. **Change log entries.** Each sync appends a ChangeLogEvent so the
   campaign history reflects the Lab origin honestly (`kind: "lab_run"`
   or similar — specific enum is Codex's call).

### 5.1 Family groups under Lab-spawned campaigns

**One family per preset_id.** A preset defines the bounded param
surface (strategy family + param_schema + base_experiment envelope).
Different presets sweep different parts of that surface. Each preset
becomes a family; the preset's `display_name` becomes the family
title; a family's candidates are the Lab jobs that ran against that
preset.

**Comparability rule (Rev 2 lock):** campaign = container, family =
comparable leaderboard unit. **Each family has its own leader.** There
is **no campaign-wide "leader family" gold highlight** on Lab-spawned
campaigns by default — different presets can change date-window
geometry, evidence quality, and cost-model assumptions, which makes
cross-family winner claims apples-to-oranges.

A cross-family leader claim only renders when presets are explicitly
marked comparable. Options for how "comparable" is expressed (Codex's
call):

- `preset.v1.comparable_with: [preset_id_a, preset_id_b]` — symmetric
  explicit pairing. Presets that share evaluation window + cost model
  + universe can declare mutual comparability.
- Or: a `comparability_group: "string"` key on each preset; presets
  sharing a group are comparable.

Until comparability is declared, the UI treats each family as its own
leaderboard. The bench-authored campaigns Codex curates directly
(Aggressive AI Wall Street, etc.) are unaffected — their comparability
is implicit in how the author structured them.

---

## 6. Dashboard work (Claude)

Small and deterministic once contracts land.

**Read-side:**
- Extend `lib/vires-campaigns.ts` CampaignManifest type with the
  optional `origin` block.
- On `/vires/bench/campaigns/{campaign_id}`, render a "Lab origin"
  chip + idea deep-link when `origin.kind === "LAB_IDEA"`.
- On each candidate row in the leaderboard, when `origin_job_id`
  is present, render a "View job" chevron linking to
  `/vires/bench/lab/jobs/{origin_job_id}`.
- On `/vires/bench/lab/ideas/{idea}`, surface a "View campaign" deep
  link once the idea has one.
- On the Lab job detail page, when the job's idea has a campaign,
  add "View campaign" as a secondary affordance.

**Write-side:**
- Lab idea-submit form grows a "Promote to campaign immediately"
  checkbox (maps to `promote_to_campaign` on idea.v1). Off by default.

---

## 7. Open questions — resolved in Rev 2 (post-Codex review)

1. **Volume threshold value.** LOCKED at N=3 **unique DONE `job_id`s**.
   FAILED jobs don't count. Retries on the same `job_id` don't
   double-count. (Codex: "N = 3 is fine if it means 3 unique DONE
   job_ids.")
2. **Readiness threshold.** LOCKED at **meaningfully competitive only**
   — `overall_status ∈ { READY_TO_NOMINATE, MONITORED }`. BLOCKED is
   intentionally excluded so "first DONE stocks job" doesn't auto-
   create a campaign. Falls back to the N=3 volume threshold for
   BLOCKED / EMPTY_STATE / NOT_IMPLEMENTED cases. (Codex: "first
   meaningfully competitive candidate creates campaign.")
3. **Cross-idea campaigns.** Out of scope for this amendment. Lab-
   spawned campaigns are 1:1 with ideas. Bench-authored campaigns
   continue to be the escape hatch for research questions that span
   multiple ideas.
4. **Campaign status mapping on idea lifecycle transitions.** No
   campaign auto-demotion; campaigns persist independently. But when
   the idea's `status` changes to SHELVED or RETIRED, the campaign
   gets a corresponding status annotation so the UI reads honestly:
   - idea.status `SHELVED` → campaign.status `MONITORED` (no active
     research; prior candidates preserved for reference)
   - idea.status `RETIRED` → campaign.status `DECOMMISSIONED`
     (campaign is a historical record)
   - idea.status `ACTIVE / READY / QUEUED` → campaign.status driven
     by the normal producer rules (EXPLORING / CONVERGING / …)

   Producer emits a ChangeLogEvent when the mapping fires so the
   campaign's change log shows when and why its status shifted.
5. **Nomination provenance.** LOCKED — when a Lab-spawned candidate is
   nominated via the existing CONFIRM_PROMOTION flow, the promotion
   event logged to `state/rebuild_history/strategy_promotion_events.jsonl`
   carries `origin: "research_lab"` AND the full triple of origin
   identifiers: `candidate_id + origin_job_id + idea_id`. Lets any
   future audit trace a bank record back through the full Lab chain.
6. **Deferred promotion-slot assignment.** LOCKED as option (b).
   §4.4(c) keeps `promotion_target` as an OPTIONAL block on idea.v1.
   When it's absent at idea-authoring time, an "Assign promotion slot"
   action on the campaign detail page lets the operator fill in the
   three fields post-hoc and writes them back to the idea spec.
   Subsequent rollups preserve the assignment.

   **Hard rule:** no nomination fires until `promotion_target` is
   set — either at idea authoring OR via the campaign's "Assign
   promotion slot" action. Nominate button renders disabled with
   honest copy ("Assign a promotion slot to enable nomination") in
   the meantime. Prevents a Lab-spawned campaign from silently
   nominating into the wrong strategy-bank slot.

---

## 8. Sequencing

1. Codex reviews this amendment, pushes back on any of §7's calls.
2. Lock the trigger thresholds + `origin` block shape.
3. Codex ships the producer + contract additions as one tight slice.
4. Claude wires the deep-links + Lab-origin chip + submit-form flag.
5. Verify end-to-end with the existing smoke-test Lab jobs: resubmit a
   short_window stocks idea, watch it cross the volume threshold on the
   third DONE, confirm a campaign auto-materializes at
   `/vires/bench/campaigns/lab_{idea_id}` with the three candidates
   rolled up.

---

## 9. Definition of done

- One ideas submits jobs → crosses threshold → campaign auto-created.
- Campaign carries `origin.kind = LAB_IDEA` and the idea_id.
- Campaign's candidate leaderboard shows each Lab job as a candidate
  with `origin_job_id` wired to a "View job" link.
- Idea detail page and Lab job detail page both carry a "View campaign"
  link once the rollup exists.
- Submit form's "Promote to campaign immediately" flag shortcuts the
  trigger.
- No regressions to existing Bench-authored campaigns (AI Wall Street,
  ETF Replacement Momentum render unchanged; their manifests have no
  `origin` block).
