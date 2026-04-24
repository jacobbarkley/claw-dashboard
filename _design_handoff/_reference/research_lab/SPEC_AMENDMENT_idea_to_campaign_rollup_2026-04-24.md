# Spec Amendment — idea → campaign rollup (2026-04-24)

**Status:** Draft for Codex review. Extends
`SPEC_REVIEW_2026-04-23.md`; nothing here contradicts the Phase 0–1 locks.
**Trigger:** After Jacob observed that Lab jobs live at
`/vires/bench/lab/jobs` but never surface inside a campaign card, we
need to wire the rollup.

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

**Proposed trigger set — ANY of these flips an idea into a campaign:**

1. **Explicit operator flag.** The idea spec grows a
   `promote_to_campaign: bool` field. Defaults false. When set true,
   producer creates the campaign immediately.
2. **Evidence threshold.** A Lab job against this idea reaches `DONE`
   with `candidate.readiness.overall_status !== "EMPTY_STATE"` — i.e.
   a real readiness scorecard was computed. One real candidate is
   enough pressure to deserve a campaign view.
3. **Volume threshold.** `N` (default 3) DONE Lab jobs accumulate
   against the idea regardless of readiness. Covers the case where an
   operator is iterating on a preset that doesn't yet have readiness
   wiring (e.g. crypto today, options forever-ish).

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

When set, the producer creates the campaign on its next sync regardless
of evidence/volume thresholds.

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

Proposal: **one family per preset_id**. Rationale: a preset defines
the bounded param surface (strategy family + param_schema). Different
presets sweep different parts of that surface. Treating each preset as
a family mirrors the existing "family of competing candidates" shape.
The preset's `display_name` becomes the family title.

If an operator runs jobs across multiple presets under the same idea,
each preset adds a new family. The first preset's family is the
default leader family (gold highlight) until a competing family
produces a winner.

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

## 7. Open questions for alignment

1. **Volume threshold value.** Proposed N = 3 DONE jobs. Low enough to
   catch genuine research activity, high enough to skip one-off pokes.
   Reasonable or tune?
2. **Readiness threshold.** Proposed: any DONE job with
   `candidate.readiness.overall_status !== "EMPTY_STATE"`. That means
   crypto today (adapter wired but EMPTY_STATE when no gates score) and
   options always (NOT_IMPLEMENTED) will NEVER satisfy this trigger,
   falling back to volume-threshold (N=3). Correct behavior?
3. **Cross-idea campaigns.** What if two ideas produce candidates that
   belong in the same campaign (e.g. ETF Replacement Momentum has
   multiple ideas converging on one research question)? Out of scope
   for this amendment — handled by the existing bench manual-authoring
   path. Lab-spawned campaigns are 1:1 with ideas.
4. **Campaign → idea demotion.** Deliberately excluded. A campaign
   created from a Lab idea persists even if the idea is SHELVED or
   RETIRED. The campaign's status reflects that (eg. PROMOTED_MONITORED
   or DECOMMISSIONED), not the idea's lifecycle.
5. **Nomination from a Lab-spawned campaign.** The existing nomination
   flow (PromotionReadinessCard → CONFIRM_PROMOTION → strategy bank)
   should just work because the campaign carries the same
   `promotion_readiness` block. The only new requirement: when the
   nomination event is logged to `strategy_promotion_events.jsonl`,
   `origin` should read `"research_lab"` (per SPEC_REVIEW §2.6
   promotion events log) and carry the originating `candidate_id`.

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
