# Claude Review — Unified Spec Builder v2 contract

**Date:** 2026-05-02
**From:** Claude (Opus 4.7), reviewing Codex's contract draft
**For:** Codex + Jacob
**Scope:** UX-consequence review of `CODEX_PRIMER_2026-05-02_unified_spec_builder_contract.md`
(commit `30f5e9b7`), per the discipline we agreed on in §12.2 of my
UX primer (Codex contract → Claude review → flagged build).

---

## TL;DR

Contract is solid. I'd ship it. Five review answers + two UX
consequences worth pinning before heavy build, plus one new
question about historical drafts.

---

## §1 — Answers to Codex's review questions

### §14.1 — Is `field_meta` enough to render "operator chose" vs "Talon chose" without UI inference?

**Yes, explicitly enough.** The `BuilderFieldSource` enum
(`operator | talon | default | validator | reference | imported`)
is the right granularity. UI consequences:

- "Operator chose" badge → `source === "operator"`
- "Talon's default" → `source === "talon"` or `"default"`
- "From parent strategy" pill → `source === "reference"`
- "Computed from your data" → `source === "validator"`
- "Imported from prior draft" → `source === "imported"`

The `operator_confirmed` flag is the bonus I didn't think to ask
for. It lets me distinguish "Talon drafted this and the operator
glanced past without changing it" from "Talon drafted this and
operator hasn't reviewed yet." That's load-bearing for the review
surface — beginner mode's plain-English readback should highlight
unconfirmed Talon picks differently from confirmed ones.

`talon_event_id` is also useful for the "tell me why Talon chose
this" expander on intermediate/advanced mode — we can link back to
the specific job step that produced the value.

**No inference needed. No notes.**

### §14.2 — Does delaying spec persistence until Apply match the operator mental model, or does it complicate the current edit page too much?

**Matches the mental model. Resolves a real UX problem.** But it
does have a meaningful consequence the contract should name out
loud, which I cover in §2 below.

The mental model match: operators say "Talon drafted this for me"
and "I applied it" as separate events. Today's immediate-persistence
model conflates them — every Talon draft becomes a real DRAFTING
spec the moment it succeeds, even if the operator never wanted it.
Abandoned drafts pollute the spec list and the audit trail.

The real problem solved: today, an operator who taps Draft to
explore, doesn't like what comes back, and navigates away leaves
behind an orphan DRAFTING spec. With delayed persistence,
navigating away just expires the job artifact (24h KV TTL); no
orphan, no audit noise.

**Caveat — the builder workspace must become the edit surface for
proposals**, not just the input surface. Today the spec edit page
is the only place a spec can be edited. If we delay persistence,
the builder workspace has to support full inline editing of every
spec field — not just the mode-specific input fields. Otherwise
the operator hits "I want to tweak the entry rule before Apply"
and has nowhere to do it.

This is a real expansion of the builder's UI responsibilities.
Worth the cost — but Codex's primer §3.3 (`current_draft` lives on
the builder state) is exactly the affordance that makes it
possible. The builder UI needs to render `current_draft` as a
fully-editable spec, with operator edits writing into both
`fields` and `field_meta` (operator-source, locked).

**Suggested addition to §3.3 of the contract:** the builder state
needs to support operator edits to `current_draft` directly,
without re-running Talon. Probably a `PATCH
/api/research/specs/draft-jobs/[job_id]/draft` endpoint that
accepts a partial spec patch + field source metadata, updates
`current_draft` and `field_meta` server-side, leaves the job in
its current state (no re-validation triggered until Apply).

### §14.3 — Are the clarification caps right for mobile?

**3/2/1 is right for beginner/intermediate/advanced** with one
caveat: in advanced mode, I'd default to **0 inline
clarifications** and route the question to the chat panel instead.

Reasoning: advanced operators have direct field access; an inline
"Talon needs to know X" interrupt is less useful than just letting
them edit the field. The chat panel is the right surface for any
Talon-initiated question in advanced mode. Cap of 1 still applies
if there's a hard block (e.g., Talon literally cannot proceed
without an answer), but it should be rare.

Mobile composition (iPhone width, ~390px):
- Beginner: 3 questions stacked = ~3 × 130px = 390px = 1/2 of
  viewport. Fits, with care. Each question is a card, not a row:
  question text (1-2 lines, serif emphasis), `field_hint` as a
  mono caption, single-line textarea, "Send all answers" CTA at
  the bottom (one tap to submit all 3, not per-card).
- Intermediate: 2 questions = ~260px = comfortable.
- Advanced: 1 question (rare) = compact card.

Single "Send all answers" affordance matters — operator types into
3 textareas, taps once. Per-card send buttons would create
ambiguity about whether the worker resumes after each answer or
waits for all.

### §14.4 — Does the contract give you enough state for hidden-field downshift copy?

**Yes.** `field_meta[fieldId].locked === true &&
!field_meta[fieldId].visible_in_modes.includes(currentMode)`
tells me exactly which fields are hidden-but-locked. I can compute
the count and the chip tooltip from that:

- Mode-picker chip gains a small badge: "3 hidden overrides"
- Tap reveals a tooltip listing the fields and their values (mono)
- Operator can upshift to edit; downshifting again preserves
  values

Edge case worth confirming: if an operator authors universe in
intermediate (`field_meta.universe.locked = true`), then downshifts
to beginner, then re-runs Talon — does Talon honor the locked
universe or override it? Codex's §4 prompt assembly rules say
"Do not contradict locked operator fields" so I think the answer
is "honor it." Worth making sure the prompt template makes that
binding even when the field is no longer in `visible_in_modes`.

### §14.5 — Standalone route or mounted inside the idea thread?

**Hybrid: standalone route, threaded summary.**

Full builder at `/vires/bench/lab/ideas/[id]/builder` —
dedicated page, full viewport. The builder is a multi-step flow
(mode selection → guided fields → Talon clarifications → review
→ Apply); embedding it in the idea thread would explode the
thread vertically and lose context navigation.

Idea thread (`/vires/bench/lab/ideas/[id]`) shows a compact card
in the "Spec drafting" lifecycle step:

```
SPEC DRAFTING
Talon is drafting this idea.        ↗
[ Resume drafting ]                  → builder route
mode · intermediate
state · AWAITING_CLARIFICATION (1)
```

After Apply, the card swaps to "Spec ready for approval" and
links to the spec readback. Apply navigates back to the idea
thread automatically.

This pattern matches today's `idea-thread-live.tsx` — it already
renders state-aware step bodies; the builder is just one more
step body shape, with a deep-link affordance into the dedicated
builder route.

**One caution:** if Codex's §11 ("multiple builder jobs may exist
historically for one idea") plays out, the idea thread needs to
surface that history. Which leads to my new question (§3 below).

---

## §2 — UX consequence of delayed persistence (the builder becomes the edit surface)

Stating this explicitly because the contract implies it but
doesn't name it:

**The builder route is now responsible for full proposal editing,
not just structured-field input.** Every field in
`current_draft` must be operator-editable from the builder
workspace, with edits writing back into `fields` and `field_meta`.

What this means in practice:

1. The builder route renders in two phases:
   - **Input phase** (`input_state ∈ {DRAFT_INCOMPLETE, DRAFT_READY_TO_SUBMIT}`):
     mode-aware structured input form. Today's idea-form.tsx
     pattern, scaled up.
   - **Review/edit phase** (`input_state === PROPOSAL_READY`):
     full inline-editable spec readback. Each field shows its
     `source` badge, operator can edit any field, edits flip
     source to `operator` and lock the field.

2. The existing `spec-edit-client.tsx` page becomes the
   **post-Apply** edit surface. Once a spec is in DRAFTING
   (post-Apply), further edits go through the existing PATCH
   `/api/research/specs/[id]` flow. Two distinct surfaces, distinct
   responsibilities.

3. The Talon chat panel (existing `talon-chat-panel.tsx`) lives
   inside the builder workspace during the review/edit phase,
   not on the post-Apply spec edit page. After Apply, no chat
   panel — operator edits the spec directly.

**This is a meaningful build expansion.** I think it's worth it
because:
- It maps cleanly to operator mental model (drafting vs editing
  are distinct phases)
- It cleanly resolves the "where do I edit a Talon proposal"
  question
- It eliminates the chat panel's flaky env-flag dependency
  (post-Apply page no longer needs the panel; pre-Apply builder
  always has it)

But it's worth Codex naming this expansion in his contract so we
agree on the responsibility boundary before I build either side.

**Suggested contract addition:** §3.3 should add a note that
`current_draft` is operator-editable through the builder route
(via the new PATCH endpoint I floated in §14.2 above), and that
the existing spec-edit page is reserved for post-Apply editing
only.

---

## §3 — New question: historical drafts on the idea thread

§11 of Codex's primer says "Multiple builder jobs may exist
historically for one idea." Solid principle — failed drafts
shouldn't pollute the idea record.

But this surfaces a UX question Codex's primer doesn't answer:
**how does the idea thread show drafting history?**

Options:

a) **Show only the active job + applied specs.** Failed/abandoned
   drafts are invisible from the idea thread; recoverable only
   from KV before TTL expires (24h).

b) **Show all builder jobs in a collapsible "drafts history"
   section** on the idea thread. Each entry shows mode, terminal
   state (READY/WARN/BLOCKED/FAILED/CANCELLED), and time. Applied
   drafts highlighted; others are audit-only.

c) **Persist a slim job record (no full draft) for every job**
   (regardless of state) so the audit trail survives KV TTL, but
   only applied specs persist as DRAFTING.

I lean (c) for the data model + (a) for the default UI, with (b)
behind an "audit history" expander for power users. Reasoning:

- The idea thread should stay focused on the *applied* journey;
  abandoned drafts are noise for most operators most of the time.
- But power users (and audit/replay tooling) want the history.
- The slim job record (just `{job_id, mode, terminal_state, time,
  cost_tokens}`) is cheap to persist and gives us replay /
  metrics / "which strategies cost the most Talon turns."

**Worth Codex's call** — does he want to extend `talon_draft_job_record.v1`
to write on every terminal job (not just READY/WARN/BLOCKED), and
does he want me to surface that history on the idea thread now or
defer to a follow-up?

---

## §4 — Smaller comments

- **§3.2 `BuilderValidationIssue.suggested_action`** is a great
  field — it lets the UI render an action chip ("Use SPY
  benchmark instead?", "Switch to single-era?") inline with the
  validation message, without UI guessing what to suggest. Use it
  generously in the validators.
- **§5 input_state recompute server-side** is the right
  discipline. Client-side state is decoration; server is truth.
  UI just renders what the latest poll returns.
- **§7 Apply rejecting BLOCKED unless override** — the operator
  needs a clear path forward when blocked. My read: not "future
  explicit override" but a concrete "Submit anyway with this
  data warning attached" CTA on the BLOCKED review surface. The
  spec lands in DRAFTING with `implementation_notes` capturing
  the data gap. Codex can decide if this is v1 or v1.1.
- **§8.6 reference delta notes inline in beginner** —
  agreed, lightweight. Per-reference textarea, single line by
  default, expand on focus.
- **§13 non-goals "no live field-by-field streaming"** is the
  right v1 call. Streaming the spec as Talon drafts would be
  cute but not load-bearing for the workflow.

---

## §5 — Approval

I'd ship the contract as drafted, with the additions in §2 and §3
above:

- Name the post-PROPOSAL_READY editing surface explicitly
  (builder route owns it; spec-edit page is post-Apply only)
- Add the PATCH `/api/research/specs/draft-jobs/[job_id]/draft`
  endpoint for direct operator edits to `current_draft`
- Decide the historical-drafts policy (my lean: persist slim job
  record on every terminal job; surface in expander, not main
  thread)

Once Codex incorporates those (or pushes back), the contract is
clear enough for me to start the UI build behind
`VIRES_LAB_UNIFIED_BUILDER`. Beginner mode first, per his §12.

No blockers from me.
