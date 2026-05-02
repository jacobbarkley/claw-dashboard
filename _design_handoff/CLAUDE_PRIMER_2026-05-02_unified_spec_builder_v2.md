# Claude Primer — Unified Spec Builder v2

**Date:** 2026-05-02
**From:** Claude (Opus 4.7), per Jacob's request
**For:** Codex (contract owner) + Jacob (operator + final UX call)
**Scope:** UX primer for the unified spec-authoring builder that
replaces today's bifurcated "Operator-drafted vs AI-drafted" model.
Defines mode layering (beginner / intermediate / advanced),
operator flow, field-by-field responsibility (operator / Talon /
validator), state surfaces, and mobile-first composition.

**Relationship to other primers:**
- **Extends** `CODEX_PRIMER_2026-05-01_talon_draft_v2_durable_jobs.md`
  (durable Talon job artifact stays the execution path; this primer
  is the input layer that feeds it).
- **Composes with** `CODEX_PRIMER_2026-05-01_strategy_reference_model.md`
  (reference picker is shared across modes — beginner sees it as the
  primary lineage signal, advanced sees it alongside delta notes).
- **Demotes**, doesn't delete, the `authoring_mode` field — see §9.

---

## §1 — Why we're collapsing the two modes

Today's spec authoring has two visible paths:

1. **Operator-drafted** — operator opens a blank spec and fills every
   structured field manually.
2. **AI-drafted (Talon)** — operator hits "Draft with Talon," gets a
   full draft back, then edits.

This bifurcation is artificial. Both paths land on the same
`StrategySpecV1` contract. Both surface the same form. The only real
difference is *who filled the fields the first time*.

What the bifurcation actually cost us:

- **Two surfaces to maintain** for the same contract. Today's
  regression (the disappearing chat panel after `4676e5eb`) was
  partly a casualty of trying to unify the two surfaces post-hoc
  with read-only mode chips and an env-flagged chat panel.
- **Wrong mental model for the operator.** The real axis isn't
  "did a human or AI start this" — it's **"how much guidance do
  you want right now."** A senior researcher tweaking sweep ranges
  and a beginner sketching a thesis are both "operator-authoring,"
  but they need radically different surfaces.
- **Talon shoehorned into a one-shot pattern.** The current sync
  draft endpoint expects "thesis goes in, complete spec comes
  out." That's brittle. Talon does its best work as a guided
  collaborator: filling defaults the operator can override,
  asking clarifying questions when the input is vague, repairing
  validation errors deterministically.

The unified builder reframes the problem: **one workspace, three
modes of guidance, one canonical contract.** Operators select how
much help they want. The system collects structured choices, plain
notes, and Talon clarifications. Deterministic validators decide
runnable / incomplete / blocked / ready.

---

## §2 — Mode layering

Three modes, all writing the same `StrategySpecV1 + ExperimentPlanV1`
contract. The mode is a **UI choice**, not a contract field. (The
durable job's `builder_state.mode` carries it for replay; the
persisted spec doesn't need to know.)

### Beginner mode

**Mental model:** "I have an idea. Tell me if it's any good."

The operator describes a thesis in plain language, optionally picks
parent strategies to derive from, picks a sleeve, and gets out of
Talon's way. Talon drafts everything else with sensible defaults
and surfaces *only* what the operator must decide.

**Default for:** new operators, fast iteration, ideas where the
operator doesn't have strong opinions on universe / thresholds /
era selection.

### Intermediate mode

**Mental model:** "I know my universe and my risk knobs. You handle
the entry/exit logic."

The operator picks a universe (from chips: top-of-the-rack
universes, sector ETFs, current holdings, custom ticker list), sets
stop / target percentages, picks a benchmark from chips, decides
single-era vs multi-era. Talon drafts signal / entry / exit logic
and recommends evidence thresholds the operator can edit.

**Default for:** the bulk of operators most of the time. Familiar
research framing. Compact.

### Advanced mode

**Mental model:** "I want every knob. Talon is on call when I ask."

Full spec form: signal logic, entry/exit rules, universe, sweep
ranges, data requirements catalog, regime tags, custom comparison
modes, parent-strategy delta notes, implementation notes. Talon
appears as a chat assistant the operator invokes when they want
clarification on a field — not as an auto-filler.

**Default for:** experienced researchers iterating on a known
strategy family, sweep-tuning, deliberate parameter exploration.

### Mode selection + switching

- Mode picker sits at the top of the builder, three-chip toggle.
- Default to **Intermediate** for first-time operators (we don't
  yet know their preference). Persist last-used-mode per user
  scope after that.
- Mid-flow upgrade (beginner → intermediate → advanced): preserves
  every existing value, exposes more knobs. No data loss.
- Mid-flow downgrade (advanced → intermediate → beginner): warns
  "your overrides will be hidden but kept — switch back up to
  edit them." Preserves the underlying spec; just hides exposed
  fields. **Never strips data.**
- Talon's clarification questions adapt to mode (see §6).

---

## §3 — Field inventory per mode

Each field has a responsibility owner:

- **operator** — operator picks directly. Surfaced in mode UI.
- **talon** — Talon fills automatically; operator may not see it
  unless mode exposes it.
- **validator** — deterministic check; not authored by either
  side, computed from other fields + the data catalog.

| Field | Beginner | Intermediate | Advanced |
|-------|----------|--------------|----------|
| Title | operator | operator | operator |
| Thesis | operator | operator | operator |
| Sleeve | operator | operator | operator |
| Reference strategies (0–2) | operator | operator | operator |
| Tags | operator (optional) | operator | operator |
| Signal logic | talon (hidden) | talon (editable) | operator |
| Entry rules | talon (hidden) | talon (editable) | operator |
| Exit rules | talon (hidden) | talon (editable) | operator |
| Universe | talon (hidden) | operator (chip menu) | operator (full) |
| Stop % | talon (hidden) | operator | operator |
| Target % | talon (hidden) | operator | operator |
| Benchmark symbol | talon picks SPY default | operator (chips + custom) | operator |
| Benchmark comparison mode | "both" default | operator (3 chips) | operator |
| Era mode (single/multi) | talon picks single recent | operator | operator |
| Era IDs | talon picks | talon picks, editable | operator |
| Evidence thresholds | talon defaults | talon defaults, editable | operator |
| Decisive verdict rules | talon drafts | talon drafts, editable | operator |
| Risk model | talon (hidden) | talon (editable) | operator |
| Sweep params | not exposed | not exposed | operator |
| Data requirements | validator derives | validator derives + edit | operator |
| Required data symbols | validator derives | validator derives + edit | operator |
| Implementation notes | not exposed | operator (optional) | operator |
| Acceptance criteria (other) | not exposed | not exposed | operator |
| Promotion target slot | not exposed | operator (optional) | operator |
| Reference delta notes | inline with reference picker | inline | inline |

A few notes on this matrix:

- **Hidden ≠ unset.** Talon writes those fields; the persisted spec
  has real values; the operator just isn't asked to look at them
  unless they upgrade mode.
- **Validator-derived fields** (data requirements, required data
  symbols) come from the data-readiness catalog check, not from the
  operator or Talon. Both sides see them as outputs, not inputs.
- **Era picking** is interesting because it's mode-sensitive in
  *what's exposed* but the underlying field is the same. Beginner
  gets "Talon picked the most recent runnable era for you";
  intermediate gets "single-era / multi-era" radio + Talon's pick;
  advanced gets the full era picker with status chips.

---

## §4 — Operator flow

Single primary path, mode-aware at each step.

```
1. Title + thesis
2. Sleeve
3. Reference strategies (0–2 picker, optional delta note per parent)
4. [Mode picker — defaults to Intermediate]
5. Mode-specific guided fields
   ├─ Beginner: nothing further; Talon takes it
   ├─ Intermediate: universe, stop/target, benchmark, era mode
   └─ Advanced: full structured form
6. Submit to draft job
   ├─ Job runs through pipeline (load_context → draft_strategy_core
   │  → draft_experiment_plan → data_readiness → validate_schema)
   ├─ If clarifications needed, Talon surfaces them inline (see §6)
   └─ If repair needed, durable-job loop handles it
7. Operator reviews the canonical proposal (full readback, mode-aware)
8. Operator either:
   ├─ Applies the proposal (spec lands in DRAFTING)
   ├─ Asks Talon to change X (revision turn — back to step 6)
   └─ Switches mode to expose more fields and edit directly
9. Submit for approval (validator confirms experiment plan validity)
10. Approved spec routes into Phase E implementation queue
```

**Key behaviors:**

- The flow is one path, not three. Mode controls *what's exposed at
  each step*, not whether the step exists.
- Steps 6–8 are the durable Talon job's polling loop — operator sees
  state-aware copy ("Drafting…", "Repairing…", "Ready for review").
- Mid-flow mode switching is allowed at any step except after final
  submit-for-approval (that's a state transition, not a builder
  state).
- "Apply" is reversible until submit-for-approval. Operator can
  re-run Talon with different intent any number of times.

---

## §5 — State surfaces per mode

Beyond the durable-job states (QUEUED / RUNNING / REPAIRING /
READY / WARN / BLOCKED / FAILED / CANCELLED), the builder has its
own input-layer states. These describe the **builder's idea of
completeness**, not the spec's lifecycle:

- **DRAFT_INCOMPLETE** — required mode-specific fields not yet
  filled. Submit button disabled.
- **DRAFT_READY_TO_SUBMIT** — all mode-required fields filled;
  builder can dispatch a draft job.
- **AWAITING_CLARIFICATION** — Talon returned a clarifying question
  set; operator needs to answer before the job advances.
- **PROPOSAL_READY** — durable job returned READY/WARN/BLOCKED;
  operator is reviewing.
- **PROPOSAL_APPLIED** — operator accepted the proposal; spec is
  now in DRAFTING state and editable directly (no further job
  needed unless operator re-runs).

Mode affects what "incomplete" means:

| Mode | Required for `DRAFT_READY_TO_SUBMIT` |
|------|--------------------------------------|
| Beginner | title + thesis + sleeve |
| Intermediate | beginner fields + universe + stop% + target% + era mode |
| Advanced | beginner fields + signal_logic + entry_rules + exit_rules + universe + benchmark + decisive_verdict_rules |

Validation messages should be mode-appropriate:
- Beginner: "Tell Talon what your idea is" (one error at a time, plain language)
- Intermediate: "Pick a universe before drafting" (per-field guidance)
- Advanced: standard form-validation chips beside fields

---

## §6 — Talon's role in each mode

Same Talon, three postures:

### Beginner — Talon as proxy author

- Talon drafts the entire structured spec from thesis + references.
- If thesis is too vague to draft confidently, Talon returns up to
  **3 inline clarifying questions**. Examples:
  - "Long-only or long/short?"
  - "Daily bars or intraday?"
  - "Should this skip earnings windows?"
- Operator answers in a single textarea (one paragraph, free-form).
  Talon re-drafts with answers folded in.
- Operator never sees signal_logic / entry_rules / exit_rules text
  unless they upgrade mode.
- Review surface is a **plain-English readback** of what Talon
  decided ("This strategy buys X when Y, exits at Z. Tested on the
  past 12 months of A. Passes if Sharpe > 1.0 and drawdown < 8%.").

### Intermediate — Talon as collaborator

- Operator fills the visible knobs (universe, risk %, benchmark,
  era mode).
- Talon drafts the prose fields (signal_logic, entry_rules,
  exit_rules) and recommends evidence thresholds + verdict rules.
- All Talon-drafted fields are visible and editable.
- Talon's reasoning ("I picked these thresholds because…") is
  available as a per-field expand, not always-on.
- Clarifying questions are still on the table but rarer.

### Advanced — Talon as on-call assistant

- Talon doesn't auto-fill anything beyond what reference strategies
  contribute (delta-note seeds the prompt for any field the
  operator chooses to delegate).
- Operator can highlight a field and ask Talon "make this more
  aggressive" / "what's a sensible default here?" / "translate
  this entry rule into prose."
- The chat panel is always available but never takes initiative.
- Evidence thresholds + verdict rules are operator-authored;
  Talon may still validate them at submit time.

---

## §7 — Mobile-first composition

The spec form is the most field-dense surface in the app. Mobile
composition matters more here than anywhere else.

**Beginner mode** is the easiest — three required fields plus
references plus a thesis textarea. Should fit comfortably on one
screen with the mode picker at the top, "Draft with Talon" CTA at
the bottom. The post-draft review screen needs care: the
plain-English readback wants serif body type, generous line height,
and section dividers (hairline rules) so the operator can scan it
in 10 seconds before tapping Apply or asking for revisions.

**Intermediate mode** introduces ~5 additional fields. Pattern:
sectioned cards with sticky section headers, one decision per card.
Universe picker should be a chip-grid (top-of-the-rack universes
visible) with a "custom tickers" expander. Stop/target as a paired
input with semantic suffix labels ("%" mono). Era mode as a
two-chip toggle.

**Advanced mode** is the only place where a long scroll is
acceptable, and even there we should use:
- Collapsible sections (defaulting open for most-edited fields,
  collapsed for rarely-touched like sweep params)
- Sticky save/submit affordance at the bottom (same pattern as
  the trading sleeve hero)
- Section-jump anchor menu at the top for thumb navigation
- No multi-column layouts on mobile width — everything stacks

**Cross-mode patterns:**
- Talon clarifying questions appear as **inline cards above the
  related field**, not as a modal or a separate page. Operator
  answers without losing context.
- Validation errors anchor to the field with `field_id` (already
  the convention in `validateExperimentPlan`).
- The mode-switcher chips are sticky at the top of the builder
  scroll; operator can upshift to expose a knob mid-flow without
  scrolling away.

---

## §8 — Empty / blocked / ready (per-mode UI variants)

The durable job's verdict states need mode-aware copy.

### READY (PASS)

- **Beginner:** "Talon drafted a complete strategy from your idea.
  Tap Apply to start editing, or ask Talon to change something."
  → primary CTA: "Apply this draft" (gold). Secondary: "Ask Talon
  to revise."
- **Intermediate:** "Draft ready. Review the highlighted choices
  and apply when you're satisfied." → same CTAs, but the readback
  highlights the fields Talon chose vs the fields the operator
  chose.
- **Advanced:** "Draft validated. Open spec to edit." → operator
  expectation is that they'll keep editing; the builder is just
  a vehicle to land in DRAFTING.

### WARN

- **Beginner:** "Talon drafted this, but some of the data it picked
  isn't fully available." → callout names the partial capability
  in plain English. Apply still allowed.
- **Intermediate:** Same callout but with "edit data requirements"
  link.
- **Advanced:** Standard warning chip on the data requirements row.

### BLOCKED

This is the hardest UX. BLOCKED isn't an error — it's Talon
catching a real problem we'd otherwise discover at runtime. Should
read as "good news, we caught this," not "your idea failed."

- **Beginner:** "Talon found a problem before drafting could
  finish: this strategy needs *implied volatility surfaces*, which
  we don't have yet. You can either change the idea, ask Talon to
  draft without it, or add the data source to the wishlist." →
  three plain-language CTAs. Never a red error treatment.
- **Intermediate:** Same framing, but the field that triggered the
  block is highlighted gold (not red) so the operator can edit
  around it.
- **Advanced:** Standard block chip on the field, with the catalog
  reason inline.

### FAILED / CANCELLED

- Standard error treatment: "Try again" CTA. The error message
  itself is mode-agnostic — these are infrastructure-level
  failures, not domain-level.

---

## §9 — `authoring_mode` demotion

Per Codex's note: keep the field as audit metadata, demote it from
workflow-driver. Derive from the durable job's event history:

```ts
type AuthoringMode =
  | "MANUAL"        // No Talon draft or revision events in job history
  | "AI_ASSISTED"   // Talon clarified or transformed some fields
  | "AI_DRAFTED"    // Talon generated the initial full normalized draft
  // Future: "AI_REPAIRED" if repair pass was the dominant signal
```

Migration of existing `OPERATOR_DRAFTED | AI_DRAFTED` values:
- `OPERATOR_DRAFTED` → `MANUAL`
- `AI_DRAFTED` → `AI_DRAFTED` (unchanged label)
- New `AI_ASSISTED` value applies only to specs authored under the
  unified builder going forward.

The form/UI should not display this field as a chip toggle anymore
(per Codex's `4676e5eb` change — already done). It can appear as a
small audit badge on the spec readback ("Drafted by Talon" / "Talon
assisted on 4 fields" / "Manually authored").

---

## §10 — `builder_state` on the durable job

The durable Talon job artifact (per yesterday's primer) gains a
`builder_state` block to carry the operator's structured choices
into the worker's prompt assembly:

```ts
interface BuilderState {
  mode: "beginner" | "intermediate" | "advanced"
  // Operator-authored fields, captured at job-start time. Worker
  // treats these as immutable inputs; Talon must not contradict
  // them. Anything not present is Talon-fillable.
  fields: {
    title: string
    thesis: string
    sleeve: ResearchSleeve
    reference_strategies?: ReferenceStrategy[]
    tags?: string[]
    universe?: Record<string, unknown>      // intermediate+
    stop_pct?: number                       // intermediate+
    target_pct?: number                     // intermediate+
    benchmark?: string                      // intermediate+
    benchmark_comparison_mode?: BenchmarkComparisonMode
    era_mode?: ExperimentEraMode
    era_ids?: string[]                      // advanced (or intermediate edit)
    signal_logic?: string                   // advanced
    entry_rules?: string                    // advanced
    exit_rules?: string                     // advanced
    risk_model?: Record<string, unknown>    // advanced
    sweep_params?: Record<string, unknown>  // advanced
    evidence_thresholds?: ExperimentPlanEvidenceThresholds
    decisive_verdict_rules?: ExperimentPlanDecisiveVerdictRules
    implementation_notes?: string
  }
  // Unresolved questions Talon raised. Each entry blocks job
  // completion until the operator answers. Operator answers
  // append to fields above OR to a separate clarification turn.
  open_questions?: BuilderClarification[]
  // Latest converged-but-not-yet-applied normalized draft. Worker
  // updates this on each iteration. UI reads it for the review
  // surface.
  current_draft?: StrategySpecV1 | null
  // Builder-layer state, distinct from job state machine.
  input_state: BuilderInputState
}

interface BuilderClarification {
  question_id: string
  question_text: string                  // plain language, beginner-friendly
  field_hint: string                     // which field this resolves
  asked_at: string
  answered_at?: string | null
  answer_text?: string | null
}

type BuilderInputState =
  | "DRAFT_INCOMPLETE"
  | "DRAFT_READY_TO_SUBMIT"
  | "AWAITING_CLARIFICATION"
  | "PROPOSAL_READY"
  | "PROPOSAL_APPLIED"
```

Worker behavior:
- Reads `builder_state.fields` as immutable inputs.
- Drafts only the fields not present in `fields`.
- If thesis is vague enough that drafting requires guesses, returns
  `open_questions` instead of drafting; job state stays
  `RUNNING` but `input_state` becomes `AWAITING_CLARIFICATION`.
- After validation passes, writes the normalized spec to
  `current_draft`; UI reads it for the review surface.

---

## §11 — Open questions for Codex

1. **Default mode for first-time operators** — I propose
   Intermediate. Reasoning: beginner is "I have an idea but no
   opinions," and most operators arriving for the first time
   probably *do* have at least universe/risk opinions. Intermediate
   is the sweet spot. Push back if you want a different default,
   or want to surface a "What's your experience level?" splash
   first (I lean against — adds friction).

2. **Mode persistence scope** — last-used mode persisted per user
   scope, or per idea? My read: per user scope (carries across
   ideas). Per-idea persistence is also defensible (each idea has
   its own complexity). Worth picking before I build the persistence
   layer.

3. **Talon clarification cap** — I proposed 3 inline clarifying
   questions per turn in beginner mode. Is 3 the right number, or
   should it be 1-at-a-time to reduce overwhelm? Trade-off: 1-at-a-
   time means more roundtrips; 3-at-once means more cognitive load.
   I lean 3 because they appear inline (not modal) and the operator
   can answer in one paragraph.

4. **Mid-flow mode-down behavior** — I proposed "preserve, hide" so
   data is never lost. Confirm this matches the contract you'd
   build. Worry: if intermediate operator wrote a custom universe,
   downshifts to beginner, then re-runs Talon, does Talon honor the
   hidden universe or override it? My lean: honor it (immutable in
   `builder_state.fields`).

5. **Validation messaging surface** — should mode-specific
   validation copy live in this primer (front-end concern) or in
   the contract layer (so all clients render the same thing)? I
   lean front-end concern, contract just emits the field_id +
   severity.

6. **Reference strategies × mode interaction** — does beginner
   mode show the delta-note textarea per reference, or hide it
   under a "tell Talon what should differ" expander? I lean
   inline (one textarea per reference), but it adds visual weight
   to a mode that's supposed to be minimal. Worth a UX call.

7. **"Talon assisted on N fields" audit badge** — does the audit
   metadata distinguish between "Talon drafted these and operator
   accepted unchanged" vs "Talon drafted, operator edited"? Both
   are AI_ASSISTED today; future granularity might be useful but
   shouldn't block v1.

---

## §12 — Sequencing

Per Codex's queue:

1. **Codex:** Take this primer + the durable-jobs primer + the
   strategy-reference primer, draft the v1 contract for
   `builder_state`, the unified POST/draft-jobs body shape, and
   the worker-side prompt assembly that respects mode-specific
   immutable fields.
2. **Claude (me):** Review Codex's contract against this primer
   for UX consequences before any heavy build. Specifically: does
   the contract surface enough state to render the per-mode UI
   without the dashboard inferring things?
3. **Claude:** Build the unified builder UI behind a flag.
   Beginner mode first (smallest surface), then intermediate, then
   advanced. The existing spec edit page stays alive as a bridge
   until the builder is feature-complete.
4. **Both:** Smoke-test end-to-end with one beginner-mode idea +
   one intermediate-mode idea + one advanced-mode idea, including
   clarification turns and BLOCKED-then-fixed paths.
5. **Claude:** Migrate the new-idea form to dispatch builder jobs
   instead of the legacy spec-author flow.
6. **Codex:** Deprecate the sync `/api/research/specs/draft-with-talon`
   endpoint after ≥7 days clean unified-builder runtime.

---

If anything in here doesn't match your model of how `builder_state`
should compose with the durable job, push back hardest on §3, §10,
and §11. Those are the structural spots where I'm guessing more
than I'd like.
