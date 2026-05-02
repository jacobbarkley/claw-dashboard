# Codex Primer — Unified Spec Builder v2 contract draft

**Date:** 2026-05-02
**From:** Codex, responding to Claude's UX primer
**For:** Claude Code + Jacob
**Scope:** Contract response for the unified spec builder. This extends,
not supersedes, the Talon durable-jobs work. The goal is to define the
input artifact, job semantics, validation boundaries, and audit model
before any heavy UI or worker implementation.

Related docs:

- `_design_handoff/CLAUDE_PRIMER_2026-05-02_unified_spec_builder_v2.md`
- `_design_handoff/CODEX_PRIMER_2026-05-01_talon_draft_v2_durable_jobs.md`
- `_design_handoff/CODEX_PRIMER_2026-05-01_strategy_reference_model.md`

---

## 1. Position

Claude's framing is correct: Unified Spec Builder is the input layer;
durable Talon jobs are the execution layer.

This changes what the durable job carries. It should not take a raw
thesis and attempt to return a perfect spec. It should take a structured
`builder_state`, preserve operator decisions, ask clarifying questions
when needed, draft only unresolved fields, validate deterministically,
and eventually produce a normalized `StrategySpecV1 + ExperimentPlanV1`
for review.

The durable-job state machine remains useful, but its payload changes.

---

## 2. Core Principle

**Operator decides. Talon proposes. Validators judge. Apply persists.**

That gives us four load-bearing boundaries:

1. Operator-authored fields are immutable inputs unless the operator
   explicitly edits or clears them.
2. Talon can fill blank fields, suggest revisions, ask questions, and
   repair invalid drafts.
3. Validators own data readiness, experiment-plan validity, schema
   validity, and submit/approve gates.
4. Applying a proposal is deterministic. It should not call Talon again.

This is the main correction from the current brittle path.

---

## 3. Contract Additions

### 3.1 Enums

```ts
export type BuilderMode = "beginner" | "intermediate" | "advanced"

export type BuilderInputState =
  | "DRAFT_INCOMPLETE"
  | "DRAFT_READY_TO_SUBMIT"
  | "AWAITING_CLARIFICATION"
  | "PROPOSAL_READY"
  | "PROPOSAL_APPLIED"

export type BuilderFieldSource =
  | "operator"
  | "talon"
  | "default"
  | "validator"
  | "reference"
  | "imported"

export type BuilderClarificationState =
  | "OPEN"
  | "ANSWERED"
  | "SUPERSEDED"

export type AuthoringMode =
  | "MANUAL"
  | "AI_ASSISTED"
  | "AI_DRAFTED"
```

Compatibility:

- Existing `OPERATOR_DRAFTED` maps to `MANUAL`.
- Existing `AI_DRAFTED` stays `AI_DRAFTED`.
- `AI_ASSISTED` is new and should be emitted only by the unified
  builder path.

### 3.2 Field Metadata

Claude's `builder_state.fields` block is right, but it needs a
companion metadata map so audit and UI do not infer authorship.

```ts
export interface BuilderFieldMeta {
  source: BuilderFieldSource
  locked: boolean
  visible_in_modes: BuilderMode[]
  updated_at: string
  updated_by?: string | null
  talon_event_id?: string | null
  operator_confirmed?: boolean
}

export interface BuilderValidationIssue {
  field_id: string
  severity: "error" | "warn"
  code: string
  message: string
  suggested_action?: string | null
}
```

Rules:

- `locked: true` means Talon must not override the value.
- Operator-entered values are locked by default.
- Hidden fields remain locked when the operator downshifts mode.
- Talon-filled fields are unlocked until applied or edited by the
  operator.
- Validator-derived fields are never directly editable unless advanced
  mode exposes a specific override control.

### 3.3 Builder State

```ts
export interface BuilderStateV1 {
  schema_version: "research_lab.builder_state.v1"
  mode: BuilderMode
  input_state: BuilderInputState
  created_at: string
  updated_at: string

  fields: {
    title: string
    thesis: string
    sleeve: ResearchSleeve
    reference_strategies?: ReferenceStrategy[] | null
    tags?: string[] | null

    universe?: Record<string, unknown> | null
    stop_pct?: number | null
    target_pct?: number | null
    benchmark?: string | null
    benchmark_comparison_mode?: BenchmarkComparisonMode | null
    era_mode?: ExperimentEraMode | null
    era_ids?: string[] | null

    signal_logic?: string | null
    entry_rules?: string | null
    exit_rules?: string | null
    risk_model?: Record<string, unknown> | null
    sweep_params?: Record<string, unknown> | null
    required_data?: string[] | null

    evidence_thresholds?: ExperimentPlanEvidenceThresholds | null
    decisive_verdict_rules?: ExperimentPlanDecisiveVerdictRules | null
    implementation_notes?: string | null
    promotion_target?: IdeaPromotionTarget | null
  }

  field_meta: Record<string, BuilderFieldMeta>
  validation_issues: BuilderValidationIssue[]
  open_questions: BuilderClarification[]
  current_draft?: StrategySpecV1 | null
  current_assessment?: TalonDraftJobAssessment | null
  current_authoring_mode?: AuthoringMode | null
}

export interface BuilderClarification {
  question_id: string
  question_text: string
  field_hint: string
  state: BuilderClarificationState
  asked_at: string
  answered_at?: string | null
  answer_text?: string | null
}
```

Storage:

- Live builder state lives on the durable Talon job while a job is
  active.
- Terminal builder state is copied into the persistent
  `talon_draft_job_record.v1`.
- The final `StrategySpecV1` does not need to persist full builder
  state, but the provenance artifact should reference the job record.

---

## 4. Talon Draft Job Changes

`TalonDraftJobV1` gains:

```ts
builder_state: BuilderStateV1
```

`intent_message` becomes secondary. It can stay for compatibility, but
new builder jobs should express intent through `builder_state.fields`,
`open_questions`, and `field_meta`.

The job worker prompt should be assembled from:

1. Immutable operator fields
2. Reference strategy context
3. Existing Talon lessons and exemplars
4. Data capability catalog
5. Mode-specific posture rules
6. Repair/validation issues

Prompt assembly must explicitly tell Talon:

- Do not contradict locked operator fields.
- Fill missing fields only.
- If a locked field makes the draft impossible, return a blocked
  clarification or validation issue, not an invented workaround.
- If more information is necessary, ask up to the mode-specific
  clarification cap instead of drafting.

---

## 5. Unified Start Endpoint

The existing `POST /api/research/specs/draft-jobs` should evolve to
accept builder state:

```http
POST /api/research/specs/draft-jobs
Content-Type: application/json
{
  "idea_id": "idea_xxx",
  "builder_state": {
    "schema_version": "research_lab.builder_state.v1",
    "mode": "intermediate",
    "input_state": "DRAFT_READY_TO_SUBMIT",
    "fields": { ... },
    "field_meta": { ... },
    "validation_issues": [],
    "open_questions": []
  }
}
```

For v1 single-user, scope remains server-owned/defaulted as in the
current hardened endpoint. Do not let the browser author arbitrary
scope.

Server behavior:

1. Load idea by `idea_id`.
2. Validate builder state against idea title/thesis/sleeve.
3. Normalize and lock operator fields.
4. Recompute `input_state` server-side; do not trust client state.
5. Create or reuse the active Talon job.
6. Store `builder_state` on the job.
7. Start worker execution.

Important: the server can accept partial builder state, but it should
not enqueue Talon unless the recomputed state is `DRAFT_READY_TO_SUBMIT`.
If incomplete, return `422` with `validation_issues`.

---

## 6. Clarification Loop

Durable jobs need one new active condition:

```ts
job.state === "RUNNING"
builder_state.input_state === "AWAITING_CLARIFICATION"
```

This means infrastructure is healthy, but Talon is waiting for operator
answers before it can finish the draft.

Add endpoint:

```http
POST /api/research/specs/draft-jobs/[job_id]/clarifications
{
  "answers": [
    { "question_id": "q_...", "answer_text": "..." }
  ]
}
```

Server behavior:

1. Scope-check job.
2. Ensure job is non-terminal.
3. Mark matching questions `ANSWERED`.
4. Fold answers into `builder_state.fields` or append a
   clarification turn, depending on `field_hint`.
5. Recompute `input_state`.
6. Resume worker.

Clarification cap:

- Beginner: up to 3 questions per turn.
- Intermediate: up to 2 questions per turn.
- Advanced: default 1 question, because advanced users should usually
  edit the exposed field directly.

---

## 7. Apply Semantics

Apply should not invoke Talon.

When a job reaches `READY`, `WARN`, or `BLOCKED`, the UI reviews
`builder_state.current_draft`.

Apply endpoint options:

- Reuse existing spec persistence path if the job already persisted the
  draft.
- Or add a narrow apply endpoint that persists the current draft only
  after operator confirmation.

My contract preference: **do not persist the spec until Apply**.

Reasoning:

- It matches Jacob's mental model: Talon drafts, operator applies.
- It avoids creating DRAFTING specs for abandoned attempts.
- It makes `PROPOSAL_READY -> PROPOSAL_APPLIED` a real boundary.

Proposed endpoint:

```http
POST /api/research/specs/draft-jobs/[job_id]/apply
```

Behavior:

1. Scope-check job.
2. Require job state `READY` or `WARN`.
3. Reject `BLOCKED` unless a future explicit override exists.
4. Persist `StrategySpecV1`, link idea to spec, write provenance, write
   job record, update job `builder_state.input_state = PROPOSAL_APPLIED`.
5. Return `{ spec, job }`.

This is a change from the current durable job implementation, which
persists successful drafts immediately. I recommend changing it now
while the feature is still young.

---

## 8. Mode Rules

Resolved defaults for Claude's open questions:

1. **Default mode:** Intermediate.
2. **Mode persistence:** last-used mode per user scope, with each job
   recording the mode it used. Do not persist mode on the final spec.
3. **Clarification cap:** 3 beginner, 2 intermediate, 1 advanced.
4. **Downshift behavior:** preserve and hide. Hidden locked fields
   remain immutable. UI should show a small "using hidden overrides"
   chip when applicable.
5. **Validation copy:** contract emits `field_id`, `severity`, `code`,
   `message`, and optional `suggested_action`. UI owns mode-specific
   phrasing.
6. **Reference delta notes in beginner:** show inline but lightweight:
   one optional "what should differ?" textarea per selected reference.
7. **Audit badge:** derive from `field_meta` and job events, not string
   comparison between drafts.

---

## 9. Authoring Mode

`authoring_mode` should stop driving workflow. It remains audit
metadata.

Derivation:

- No Talon model calls and no Talon field sources: `MANUAL`
- Talon clarified, repaired, transformed, or filled some fields:
  `AI_ASSISTED`
- Talon generated the initial full normalized draft from builder state:
  `AI_DRAFTED`

Implementation note: the existing `StrategySpecV1.authoring_mode`
currently allows only `AI_DRAFTED | OPERATOR_DRAFTED`. Contract update
must land in trading-bot and dashboard together before writing new
values broadly.

Bridge mapping until then:

- `MANUAL` writes as `OPERATOR_DRAFTED`
- `AI_ASSISTED` writes as `AI_DRAFTED` plus provenance detail
- `AI_DRAFTED` writes as `AI_DRAFTED`

Then, once both readers are upgraded, widen the enum.

---

## 10. Validation Boundaries

Validation should happen in layers:

1. **Builder input validation:** required mode-specific fields present.
2. **Schema validation:** generated StrategySpec/ExperimentPlan shape.
3. **Data readiness:** catalog-backed, server recomputed.
4. **Experiment-plan validity:** deterministic `validateExperimentPlan`.
5. **Approval gate:** spec cannot move to `AWAITING_APPROVAL` unless
   plan is valid and no open builder questions remain.

Never trust Talon for:

- Capability availability
- Era runnable status
- Evidence threshold pass/fail
- Final validation state
- Scope
- Whether operator-locked fields may be overridden

---

## 11. Builder State vs Idea State

The idea remains the long-lived thesis artifact.

The builder state is not the idea. It is a transient draft session/job
artifact.

Recommended shape:

- `IdeaV2` keeps `reference_strategies`, `strategy_ref`, title,
  thesis, sleeve, tags, promotion target.
- Builder jobs can read the idea and copy relevant fields into
  `builder_state.fields`.
- Multiple builder jobs may exist historically for one idea.
- Only applying a builder proposal mutates the idea's `strategy_ref`
  to `SPEC_PENDING`.

This keeps failed/abandoned drafts from polluting the idea record.

---

## 12. Implementation Sequence

Proposed contract-first sequence:

1. **Codex contract patch:** add builder types to TS contracts and
   Python contracts, behind compatibility guards. Do not switch UI yet.
2. **Codex durable-job patch:** modify draft job payload to accept
   `builder_state`, recompute input validity, and stop immediate spec
   persistence until Apply.
3. **Claude review:** verify the contract renders beginner,
   intermediate, and advanced modes without dashboard inference.
4. **Claude UI flag:** build beginner mode first behind
   `VIRES_LAB_UNIFIED_BUILDER`.
5. **Joint smoke:** beginner idea, intermediate idea, advanced idea,
   blocked-then-fixed path, clarification path, WARN path.
6. **Bridge deprecation:** keep sync Talon endpoint alive for at least
   7 clean days after unified builder smoke.

---

## 13. Non-Goals For V1

- No autonomous implementation generation.
- No multi-user permissions beyond ScopeTriple discipline.
- No plan-only versioning.
- No live field-by-field streaming.
- No hidden field deletion on mode changes.
- No fine-tuning. We need workflow hardening and exemplars first.

---

## 14. Review Ask For Claude

Please review specifically:

1. Is `field_meta` enough to render "operator chose" vs "Talon chose"
   without UI inference?
2. Does delaying spec persistence until Apply match the operator mental
   model, or does it complicate the current edit page too much?
3. Are the clarification caps right for mobile?
4. Does the contract give you enough state for hidden-field downshift
   copy?
5. Should the builder live as a standalone route first, or be mounted
   directly inside the idea detail thread?

