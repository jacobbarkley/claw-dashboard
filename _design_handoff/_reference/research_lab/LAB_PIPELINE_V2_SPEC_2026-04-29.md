# Lab Pipeline v2 — Idea-first strategy factory

**Status:** Phase A landed 2026-04-29 — see §12
**Date:** 2026-04-29
**Authors:** Jacob (intent), Codex (backend), Claude (frontend/UX)
**Supersedes (semantically):** the parts of `SPEC_REVIEW_2026-04-23.md`
and `SPEC_AMENDMENT_idea_to_campaign_rollup_2026-04-24.md` that treat
the Idea as a registered-strategy launcher.

This document is the alignment doc, not the implementation plan. It
locks the data model, the state machine, and the API split so that
parallel work on the dashboard and the backend doesn't restitch the
same seams in incompatible ways.

---

## 1. Why this exists

We shipped Idea v0 close to the existing codebase: it required a
registered `strategy_id`, allowed an independent `strategy_family`
field, and used a `code_pending: true` flag as a placeholder for
"strategy not yet written." That model has three structural failures:

1. **`strategy_id` and `strategy_family` are independent strings**, so
   they can desync. Toggling code-pending left a stale family pinned
   to the idea — the symptom that triggered this rewrite.
2. **`code_pending: true` is a dead-end flag.** No surface converts a
   code-pending idea into a real registered strategy. Code-pending
   ideas live in DRAFT purgatory.
3. **New ideas get nudged toward `regime_aware_momentum`** because
   that's the only mature registered strategy. The form pretends ideas
   are launchers when they're really proposals.

The mental model is wrong. The Idea is the **durable thesis container**,
not a registered-strategy launcher. The system — Talon, Codex, the lab
worker — owns turning it into something executable.

---

## 2. Mental model

```
Idea ──┬─ active_spec_id ──▶ StrategySpec ──▶ Registered Strategy ──▶ Job ──▶ Campaign ──▶ Passport / Playbook
       └─ history                  ▲                  ▲                                       │
                                   │                  │                                       │
                            (Talon or operator)   (Codex)                            (operator nominate /
                                                                                       system promote)
```

**Operator authors:** the Idea (and, if they want, the spec).
**System authors:** the StrategySpec (when AI-drafted), the Registered
Strategy module/preset, the Job, the Campaign, the Passport.

The operator should never have to know about preset YAML, registry
entries, bench manifests, or campaign manifests to make something new.

---

## 3. Locked decisions (Codex defaults, accepted 2026-04-29)

These are now the foundation. Changing one means revisiting the spec.

### LD-1 — Re-speccing forks the Spec, not the Idea

The **Idea** is the durable thesis container. The **StrategySpec** is
versioned. An Idea carries `active_spec_id`. Jobs, campaigns, and
passports reference an exact `spec_id` + `spec_version` so lineage is
unambiguous. Re-speccing the same idea produces a new spec; the prior
spec stays on disk and remains pointed at by old jobs.

### LD-2 — Talon is preferred, not required

Specs carry `authoring_mode: AI_DRAFTED | OPERATOR_DRAFTED`. Both
paths flow through Codex validation before reaching the registered
strategy step. Talon being deferred infrastructure does not block
Phase A–C; the operator can author specs by hand if needed.

### LD-3 — `strategy_family` is derived, not stored

Family is joined at read time from preset / registry metadata keyed on
`strategy_id`. The Idea YAML stops carrying `strategy_family`
entirely. Phase B migration strips the field.

### LD-4 — Migration mapping (deterministic)

| Existing idea state                              | New `strategy_ref.kind` | Notes |
|---|---|---|
| `code_pending: true` AND `params.spec` non-empty | `SPEC_PENDING`          | spec body becomes the seed for the StrategySpec artifact |
| `code_pending: true` AND `params.spec` empty     | `NONE` + `needs_spec: true` | operator intent flag; collapses to `kind: NONE` if we decide it's redundant |
| `code_pending: false` AND `strategy_id` registered | `REGISTERED`         | `active_spec_id` is null — this idea predates the spec model |
| `code_pending: false` AND `strategy_id` unknown  | flag for manual review  | should not exist in current data; gate the migration on zero matches |

`strategy_family` is dropped from every idea YAML during migration.

### LD-5 — API split

The overloaded PATCH endpoint is decomposed:

| Endpoint                                | Purpose                          | Phase |
|---|---|---|
| `PATCH  /api/research/ideas/[id]`       | Draft body only (title, thesis, sleeve, tags, params) | A |
| `POST   /api/research/ideas/[id]/transitions` | Status lifecycle (DRAFT↔READY↔SHELVED↔RETIRED, plus the code-pending guards) | A |
| `POST   /api/research/ideas/[id]/promotion`   | Promotion target assign / clear  | A |
| `DELETE /api/research/ideas/[id]`       | Hard delete (unchanged)          | A |
| `POST   /api/research/ideas/[id]/draft-spec`  | Kick off Talon or operator-authored spec | D |
| `POST   /api/research/specs/[id]/approve`     | Approve spec → enqueue for Codex implementation | E |

The `PATCH` endpoint stops accepting `status`, `promotion_target`,
`promote_to_campaign` after Phase A's split lands. Old-shape requests
get a 410 with a pointer to the new endpoint.

---

## 4. Schemas

### 4.1 Idea v2

```yaml
schema: research_lab.idea.v2

idea_id: idea_01K...
created_at: 2026-04-29T14:00:00Z
created_by: operator_id
scope:
  user_id: ...
  account_id: ...
  strategy_group_id: ...

# Operator-authored thesis content
title: "Ape Wisdom — retail-attention regime overlay"
thesis: "..."
sleeve: STOCKS
tags: [attention, retail-flow]
params: {}                  # operator-authored hints, no longer carries spec

# System-managed strategy reference (replaces strategy_id + strategy_family)
strategy_ref:
  kind: NONE | SPEC_PENDING | REGISTERED
  active_spec_id: spec_01K... | null     # set when kind is SPEC_PENDING or REGISTERED
  pending_spec_id: spec_01K... | null    # set during a re-spec — see Addendum A1
  strategy_id: regime_aware_momentum | null   # set when kind is REGISTERED
  preset_id: preset_01K... | null        # optional default executable preset

# Operator-managed lifecycle
status: DRAFT | READY | QUEUED | ACTIVE | SHELVED | RETIRED
needs_spec: true | false    # UX intent flag, only meaningful when kind is NONE

# Promotion intent (unchanged shape, semantically the same as v1)
promotion_target: { ... } | null
promote_to_campaign: true | false
```

**Removed fields:** `strategy_id` (top-level), `strategy_family`,
`code_pending`. Their information is reconstructed from
`strategy_ref.kind` + the joined preset metadata.

### 4.2 StrategySpec v1

```yaml
schema: research_lab.strategy_spec.v1

spec_id: spec_01K...
spec_version: 1
idea_id: idea_01K...
created_at: 2026-04-29T14:00:00Z

authoring_mode: AI_DRAFTED | OPERATOR_DRAFTED
authored_by: talon | operator_id

state: DRAFTING | AWAITING_APPROVAL | APPROVED | IMPLEMENTING | REGISTERED | REJECTED | SUPERSEDED

# Implementation contract — what Codex (or Talon) needs to build the strategy
signal_logic: "..."           # plain-language signal description
universe: { ... }             # ticker / asset universe definition
entry_rules: "..."
exit_rules: "..."
risk_model: { ... }           # sizing, stops, max exposure
sweep_params: { ... }         # parameters Codex should expose for backtests
required_data: [ ... ]        # data sources / providers
benchmark: SPY | BTC | ...
acceptance_criteria: { ... }  # what "passes" looks like (sharpe, dd, hit rate, etc.)
candidate_strategy_family: "regime_overlay"   # suggestion only, not authoritative
implementation_notes: "..."   # freeform handoff content for Codex

# Lineage
parent_spec_id: spec_01K... | null   # set when this spec is a re-spec of another
registered_strategy_id: regime_aware_momentum | null  # set when state is REGISTERED
```

Spec storage path:
`data/research_lab/<scope>/strategy_specs/spec_<id>.yaml`

### 4.3 StrategyRef state machine

```
                          (operator drafts spec)
                  ┌───────────────────────────────────┐
                  ▼                                   │
   NONE ──────▶  SPEC_PENDING ──────────────────▶ REGISTERED
       (operator              (Codex finishes
        kicks off              implementation
        spec draft)            + registers)

                  ▲                                   │
                  └───── (operator re-specs an ────── ┘
                          existing registered idea —
                          forks a new SPEC_PENDING)
```

- `NONE → SPEC_PENDING`: operator hits "Draft strategy spec" (Talon)
  or "Author spec manually."
- `SPEC_PENDING → REGISTERED`: spec is approved AND Codex's
  registration job lands. Both required.
- `REGISTERED → SPEC_PENDING`: re-spec — creates a new spec_id with
  `parent_spec_id` set; the prior spec is marked `SUPERSEDED`. The
  Idea's `active_spec_id` repoints. The previously registered
  `strategy_id` is *not* unregistered (old jobs/campaigns still
  reference it).

Status (`DRAFT/READY/...`) is orthogonal to `strategy_ref.kind`.
Cross-product gates:

- READY requires `kind === REGISTERED`.
- QUEUED / ACTIVE require `kind === REGISTERED`.
- DRAFT / SHELVED / RETIRED accept any `kind`.

---

## 5. Phased build plan

### Phase A — API split + schema lock (no UX changes) ✓ Landed 2026-04-29
- Land Idea v2 type definitions (TypeScript + backend models).
- Decompose PATCH into PATCH (body) + transitions/promotion endpoints.
- Existing PATCH continues to work in compat mode for one deploy
  cycle, then 410s on the legacy fields.
- Idea v2 ↔ v1 read adapter so the dashboard keeps rendering during
  migration.

### Phase B — Idea schema migration (mechanical)
- One-shot migration script that rewrites every idea YAML to v2 per
  the LD-4 mapping table.
- Migration is committed as a single PR with a dry-run output for
  Jacob to eyeball before merge.
- After merge: `strategy_family` no longer appears on disk anywhere.
- Read-time family join in `loadIdeaById` and the detail page.

### Phase C — StrategySpec artifact
- `strategy_spec.v1` schema lands.
- Spec read/write helpers in `lib/research-lab-specs.server.ts`.
- New API endpoints for spec CRUD (no UX yet, just contract).
- Idea detail page gets a read-only "Strategy spec" panel with empty
  state.

### Phase D — Spec authoring surfaces
- Operator-authored spec form (always available — does not block on
  Talon).
- Talon drafting loop wired in if/when Talon is unblocked. Until then
  the "Draft with Talon" button is hidden behind a feature flag.
- Spec approval action.

### Phase E — Codex implementation loop
- Approved spec triggers a Codex job (mechanism TBD — likely a queue
  artifact at `data/research_lab/spec_implementation_queue/`).
- Codex completes implementation, registers the strategy, and PATCHes
  the spec to `REGISTERED` + the Idea's `active_spec_id` and
  `strategy_ref.strategy_id`.
- Idea automatically becomes runnable in Lab.

### Phase F — Promotion path
- The successful-job → campaign → passport flow becomes an explicit
  operator surface (this is the §11 PASSPORT_V2_SPEC build plan,
  pulled into v2's scope).
- "Nominate for promotion" action on the campaign detail page.
- System owns readiness, identity resolution, audit trail, strategy
  bank updates.

Phases A–C are foundation. D–F are surface. Codex and Claude can
parallelize within a phase but should not get more than one phase out
of sync.

---

## 6. UX principle (operator-facing)

The operator should see a single coherent thread on the idea detail
page:

1. "Describe your idea." → Idea creation form.
2. "Awaiting strategy spec." → empty spec panel + draft action.
3. "Spec drafted. Review and approve." → spec edit + approve.
4. "Awaiting implementation by Codex." → status pill, no action.
5. "Ready to run in Lab." → Lab Job action surfaces.
6. "Campaign created from successful run." → campaign link surfaces.
7. "Ready to nominate for production." → passport promotion action.

Bench plumbing (preset YAML, registry entries, manifest paths) lives
behind an "Advanced / debug" disclosure. Default view is the seven
steps above.

---

## 7. What we keep

- Vires visual identity (cream / gold, serif italic, mono accents).
- The Idea page and lifecycle popover UX shells.
- YAML persistence + GitHub Contents API path.
- Preset `_index.json` contract (now joined-at-read for family).
- Research Lab worker / cron architecture.
- Campaign rollup mechanism.
- Trade Atlas component (still mountable on jobs/campaigns once they
  produce equity-swarm artifacts).
- InfoBubble pattern + show-don't-tell sweep.

This is a **semantic re-stitching**, not a UI rebuild.

---

## 8. What we drop

- `code_pending: true` flag on ideas. Replaced by
  `strategy_ref.kind: NONE | SPEC_PENDING`.
- `strategy_family` field on ideas. Joined at read.
- Top-level `strategy_id` on ideas. Lives inside `strategy_ref`.
- The overloaded PATCH endpoint shape (status/promotion_target/draft
  fields on one route).

---

## 9. Open questions for v1 (deferred)

These are flagged but **not** blocking the v0 alignment. They get
answered as Phases A–F land.

- **OQ-1.** Should `needs_spec: true` collapse into `kind: NONE`? It's
  an intent flag with no mechanical purpose today; if no UX surface
  needs to distinguish "no spec yet, abandoned" from "no spec yet,
  deliberately," drop it.
- **OQ-2.** Spec approval workflow: single-approver (operator) or
  two-step (Talon validates → operator approves)?
- **OQ-3.** Codex implementation queue artifact shape: file-per-job
  in a queue dir, or a single rolling YAML? Same question as the
  research lab worker queue; defer to Codex.
- **OQ-4.** **RESOLVED 2026-04-29** — see Addendum A1. When a
  REGISTERED idea is re-specced, the idea stays REGISTERED and the
  existing runnable strategy stays active. The new spec is tracked via
  `strategy_ref.pending_spec_id` until it registers and swaps in.
- **OQ-5.** Sleeve transitions: can an operator change sleeve on an
  idea after a spec is drafted? Probably no — a sleeve change should
  fork into a new idea. Confirm in Phase B.

---

## 10. Out of scope (v0)

- Talon's internal architecture, prompt design, or chat surface.
- Codex's implementation pipeline internals (how a spec becomes code).
- Multi-tenant scoping changes — keep the existing `user_id /
  account_id / strategy_group_id` triple.
- Bench / campaign / passport schema rewrites — only the *connections*
  between them and the Idea/Spec model are in scope.
- The trading dashboard. Lab v2 work does not touch
  `components/trading-dashboard.tsx` or the operator feed.

---

## 11. Sign-off checklist (before Phase A starts)

- [x] Jacob accepted LD-1 through LD-5 as locked (2026-04-29).
- [x] Codex ran the LD-4 dry-run audit (2026-04-29) — every existing
      idea YAML maps mechanically, zero unknown `strategy_id` cases.
- [x] OQ-4 resolved — see Addendum A1. OQ-1, OQ-2, OQ-3, OQ-5 remain
      deferred and non-blocking.
- [x] Phase A ownership decided — see Addendum A2. Codex leads.
      Claude supports with focused review, dashboard consumer audit,
      and Phase D UX prep only.

---

## Addendum A1 — OQ-4 lock: re-spec on REGISTERED ideas

**Locked:** 2026-04-29

When a REGISTERED idea is re-specced, the idea remains REGISTERED and
keeps its current runnable strategy active. The new spec is tracked as
`pending_spec_id`. The idea does **not** flip back to SPEC_PENDING —
that would break READY/QUEUED/ACTIVE status gates and cut operator
continuity for jobs and campaigns already in flight.

### Shape during re-spec

```yaml
strategy_ref:
  kind: REGISTERED
  active_spec_id: spec_old
  pending_spec_id: spec_new | null
  strategy_id: existing_strategy
  preset_id: existing_preset
```

### Spec lineage is bidirectional

- New spec carries `parent_spec_id: spec_old`.
- Idea carries `pending_spec_id: spec_new`.
- Old jobs and campaigns keep referencing `spec_old`.
- Current strategy remains runnable while v2 is being implemented.

### Swap on successful registration of `spec_new`

- `spec_old.state` → `SUPERSEDED`
- `spec_new.state` → `REGISTERED`
- `idea.strategy_ref.active_spec_id` → `spec_new`
- `idea.strategy_ref.pending_spec_id` → `null`
- `idea.strategy_ref.strategy_id` → registered strategy id of `spec_new`
- `idea.strategy_ref.preset_id` → registered preset id of `spec_new`

The swap is atomic from the operator's perspective: a single PATCH
from Codex's implementation completion path. Until that PATCH lands,
`spec_old` is the runnable spec.

### Invariants

- `strategy_ref.kind === REGISTERED` is preserved across the entire
  re-spec lifecycle.
- `pending_spec_id` is only meaningful when `kind === REGISTERED`. On
  `kind === SPEC_PENDING` the in-progress spec lives in
  `active_spec_id` directly; there is no "pending" alongside it.
- An idea has at most one `pending_spec_id` at a time. A second
  re-spec attempt while one is in flight either replaces the pending
  spec (operator-confirmed) or 409s — Codex chooses in Phase E.

---

## Addendum A2 — Phase A ownership

**Decided:** 2026-04-29

Phase A spans the TypeScript contract in this repo, the Python
readers/writers in trading-bot, the migration / read adapter pair, and
the future producer path (lab worker, spec implementation queue). The
data model has to land in lockstep on both sides.

### Ownership split

- **Codex leads Phase A.** Owns the canonical Idea v2 + StrategySpec
  v1 schema across TS and Python, the API endpoint decomposition, the
  v1↔v2 read adapter, and the Phase B migration script.
- **Claude supports.** Available for focused review when Codex spawns
  it (type-level review, dashboard consumer audit, UX consumer impact
  check), and works Phase D UX prep in parallel — operator-authored
  spec form mockups and copy — since that's pure UX with no Phase A
  schema dependency.

### Why this split

A single producer/consumer mismatch in the foundational schema would
re-create the exact class of bug this rewrite exists to fix
(`strategy_id` / `strategy_family` desync). Codex sitting on both
sides during Phase A makes that mismatch impossible. Claude reviewing
diffs in narrow passes catches structural problems earlier than Claude
authoring the same code single-threaded — today's session was the
proof point.

### Hand-off discipline

- Codex tags Claude into review with a diff + a question, not the
  whole repo.
- Claude does not author Phase A code without an explicit Codex
  request.
- Phase D UX work Claude does in parallel ships behind a feature flag
  until Phase C's spec contract lands.

---

## §12 — Phase A landing record

**Landed:** 2026-04-29

### Commits

| Repo         | Commit    | Scope |
|---|---|---|
| trading-bot  | `8ba3ec1` | IdeaV2, StrategyRefV2, StrategySpecV1 types + v1→v2 normalization + worker/rollup compatibility |
| claw-dashboard | `2e854ad` | idea.v2 YAML write path, draft-edit PATCH split from `/transitions` and `/promotion`, `strategy_family` derived from preset metadata, non-registered ideas blocked from campaign submission |
| claw-dashboard | `3984d62` | live Ape Wisdom smoke — operator toggle of code-pending wrote v2 YAML to disk |

### Verification

- Trading-bot Research Lab tests: **66 passed**
- Trading-bot Python import smoke: **passed**
- Trading-bot worker parsed live v2 Ape Wisdom artifact from
  dashboard origin/main: **passed**
- Dashboard `npx tsc --noEmit`: **passed**
- Dashboard `npm run build`: **passed**
- Live `/transitions` probe confirmed new deployment before PATCH
- Live PATCH returned commit `3984d62`

### Bug closure

- **`strategy_family` desync bug is dead on disk.** Ape Wisdom YAML
  is now `research_lab.idea.v2` with `strategy_ref.kind: NONE`, no
  top-level `strategy_family`, `strategy_id`, or `code_pending`.
- Class of bug eliminated: `strategy_id` and `strategy_family` can no
  longer desync because family is derived from preset metadata, not
  persisted on the idea.

### What's now true

- Idea v2 schema is the on-disk shape for any idea touched after
  2026-04-29. Untouched v1 YAMLs are normalized at read time by the
  v1→v2 adapter on both sides.
- Operator lifecycle moves go through `/transitions`. Promotion
  intent goes through `/promotion`. Body PATCH is draft edits only.
- Phase B (mechanical migration of remaining v1 YAMLs) is no longer
  blocking — the read adapter makes it cosmetic. Run when convenient.
- Phase C (StrategySpec artifact) and Phase D (UX prep) are
  unblocked.

### Sign-off

§11 pre-Phase-A checklist is fully closed. Phase A itself has
shipped, been smoke-tested live, and is operating in production.
