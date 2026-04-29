# Codex Primer — Phase E: implementation queue + approve loop

**Date:** 2026-04-29
**From:** Claude (Opus 4.7), per Jacob's request
**For:** Codex
**Scope:** Contracts + state transitions only. UI is Phase D-implementation
and lives downstream — don't let UI polish bleed into this phase.

This brief locks the Phase E foundation. With this on a branch, Phase
D-implementation becomes a coherent thread end-to-end (operator
authors a spec → approves → Codex builds → strategy registers → idea
runnable in Lab). Without it, Phase D-implementation is a UX dead-end.

---

## 1. Queue artifact shape (resolves OQ-3)

**Recommendation:** file-per-spec at
`data/research_lab/<scope>/spec_implementation_queue/<spec_id>.yaml`.
Single-file lookups, no merge conflicts under concurrent approvals,
trivial to audit, easy for the worker to lock with `flock`.

Reject options: a single rolling YAML (merge conflict risk, hard to
lock) or per-day directory (premature partitioning).

### Schema — `spec_implementation_queue.v1`

```yaml
schema: research_lab.spec_implementation_queue.v1

queue_entry_id: que_01K...        # ULID, distinct from spec_id
spec_id:        spec_01K...
spec_version:   1
idea_id:        idea_01K...
scope:          { user_id, account_id, strategy_group_id }

state:          QUEUED | CLAIMED | IMPLEMENTING | COMPLETED | FAILED | CANCELLED

queued_at:      2026-04-29T...
queued_by:      operator_id      # who hit /approve

claimed_at:     2026-04-29T... | null
claimed_by:     codex@<host>     | null   # worker identity
attempts:       0

# Set when state advances past CLAIMED
implementation_started_at: ... | null
implementation_finished_at: ... | null

# Result fields — populated on COMPLETED
registered_strategy_id: regime_attention_overlay | null
preset_id:              preset_01K... | null
implementation_commit:  abc1234 | null   # the commit that landed the
                                         # strategy module + registry

# Failure fields — populated on FAILED
last_error:     "stack trace or short message" | null
last_error_at:  ... | null

# Operator override
cancelled_at:   ... | null
cancelled_by:   operator_id | null
cancel_reason:  "..."        | null
```

### Worker discipline

- Worker scans `spec_implementation_queue/*.yaml` filtered to `state:
  QUEUED`.
- Atomic claim: `git commit` flipping state to `CLAIMED` + filling
  `claimed_at` / `claimed_by`. If two workers race, second one's
  commit fails on push (sha mismatch on the file) and it skips.
- After claim, worker proceeds to IMPLEMENTING and does the actual
  build. On COMPLETED or FAILED, worker writes the same file again.
- `attempts` increments on every claim. Cap at 3 (TBD); after that
  state moves to FAILED with `last_error: "max attempts exceeded"`.

---

## 2. Approve endpoint semantics

`POST /api/research/specs/[id]/approve`

### Preconditions

| Check | Failure code |
|---|---|
| Spec exists | 404 |
| Spec state is `AWAITING_APPROVAL` | 409 (with current state in body) |
| Idea exists and is loadable | 404 |
| `idea.strategy_ref.kind === "SPEC_PENDING"` | 409 |
| `idea.strategy_ref.active_spec_id === spec_id` OR `idea.strategy_ref.pending_spec_id === spec_id` | 409 |

The dual-pointer check on the last row covers both new-spec
approvals (`active_spec_id`) and re-spec approvals
(`pending_spec_id`). Per Addendum A1 of `LAB_PIPELINE_V2_SPEC`,
re-spec approvals leave the existing registered strategy alone until
Phase E completes the swap; the approve step does not yet flip
anything on the idea.

### Side effects (atomic, one commit)

1. Spec YAML: `state` → `APPROVED`, set `approved_at` + `approved_by`.
2. New queue entry written at
   `spec_implementation_queue/<spec_id>.yaml` with `state: QUEUED`,
   `queued_at`, `queued_by`.
3. Audit event appended (see §5).

If any of the three fails, all roll back. The endpoint returns:

```json
{
  "ok": true,
  "spec": { ...updated spec },
  "queue_entry": { ...new queue entry }
}
```

### Send-back is the inverse, but **not** in `/approve`

Send-back lives on the existing `PATCH /api/research/specs/[id]`
with `state: "DRAFTING"` in the body. It validates the source state
is `AWAITING_APPROVAL`, writes the spec, appends an audit event. No
queue entry exists yet, so nothing else to clean up.

### Operator-cancel after approve

`PATCH /api/research/specs/[id]` with `state: "REJECTED"` is allowed
from `APPROVED` only when the queue entry's state is still `QUEUED`
(not yet claimed by a worker). The endpoint flips the queue entry
to `CANCELLED` in the same commit. Once claimed, operators can't
unilaterally cancel — they file a request that the worker honors at
its next checkpoint (TBD; not blocking for v1, just don't lock the
operator out).

---

## 3. Spec state machine (authoritative)

```
       PATCH state                /approve              worker claims
DRAFTING ───────▶ AWAITING_APPROVAL ────▶ APPROVED ────▶ IMPLEMENTING
   ▲                  │                                       │
   │ PATCH state       │ PATCH state (operator withdraws)      │ worker writes
   └──────────────────┘                                        │
                                                               ▼
                                                         REGISTERED
                                                           (or FAILED)
```

### Who writes which transition

| Transition | Writer | Endpoint / mechanism |
|---|---|---|
| DRAFTING → AWAITING_APPROVAL | operator | `PATCH /specs/[id]` |
| AWAITING_APPROVAL → DRAFTING | operator (send-back) | `PATCH /specs/[id]` |
| AWAITING_APPROVAL → APPROVED | operator | `POST /specs/[id]/approve` |
| AWAITING_APPROVAL → REJECTED | operator (withdraw) | `PATCH /specs/[id]` |
| APPROVED → IMPLEMENTING | worker | atomic claim commit |
| APPROVED → REJECTED | operator (cancel before claim) | `PATCH /specs/[id]` + queue cancel |
| IMPLEMENTING → REGISTERED | worker | atomic completion commit |
| IMPLEMENTING → FAILED | worker | failure commit |
| REGISTERED → SUPERSEDED | system | re-spec swap (Addendum A1) |

Anything not in this table is a 409. The spec state machine is
forward-only with two narrow back-edges (send-back, withdraw).

### Validation duplication

Both endpoints (`PATCH /specs/[id]` and `POST /specs/[id]/approve`)
need the same precondition logic. Extract it into a single
`canTransitionSpec(spec, nextState, context): TransitionResult` so
the rules don't drift.

---

## 4. Idea `strategy_ref` update rules

Spec state changes mostly leave the idea alone. Only **REGISTERED**
moves the idea, and the move is one of two cases:

### Case A — first-time registration (idea was SPEC_PENDING)

Worker's REGISTERED commit also patches the idea YAML:

```yaml
# Before
strategy_ref:
  kind: SPEC_PENDING
  active_spec_id: spec_01K...
  strategy_id: null
  preset_id: null

# After
strategy_ref:
  kind: REGISTERED
  active_spec_id: spec_01K...           # unchanged
  strategy_id: regime_attention_overlay # newly registered
  preset_id: preset_01K...              # newly registered
```

### Case B — re-spec swap (idea was REGISTERED with pending_spec_id)

Per Addendum A1 of `LAB_PIPELINE_V2_SPEC`. The active strategy stays
runnable up until the new spec registers. Worker's REGISTERED commit
performs the atomic swap:

```yaml
# Before
strategy_ref:
  kind: REGISTERED
  active_spec_id:  spec_old
  pending_spec_id: spec_new
  strategy_id:     existing_strategy
  preset_id:       existing_preset

# After
strategy_ref:
  kind: REGISTERED
  active_spec_id:  spec_new           # was pending
  pending_spec_id: null               # cleared
  strategy_id:     new_registered     # registered from spec_new
  preset_id:       new_preset
```

And, in the same commit:
- `spec_old.state` → `SUPERSEDED`
- `spec_new.state` → `REGISTERED`

### Atomicity contract

The worker's REGISTERED commit must touch up to five files in one
atomic operation:

1. `data/research_lab/<scope>/strategy_specs/<spec_id>.yaml` — state
   → REGISTERED + result pointers
2. `data/research_lab/<scope>/ideas/<idea_id>.yaml` — strategy_ref
   updated per Case A or B
3. `data/research_lab/presets/_index.json` — new strategy /
   preset entries
4. `<strategy_module_path>` — the actual strategy code
5. `data/research_lab/<scope>/spec_implementation_queue/<spec_id>.yaml`
   — state → COMPLETED

For Case B, item 1 is two specs (spec_new → REGISTERED, spec_old →
SUPERSEDED).

If the commit fails (push rejection, test failure, etc.): worker
leaves the queue entry at IMPLEMENTING with `last_error` filled and
schedules a retry. `attempts` increments. The spec state stays at
APPROVED (never moved forward) so the operator's view is consistent
with disk truth.

---

## 5. Audit trail

Per-spec event log, append-only.

### Path

`data/research_lab/<scope>/strategy_specs/<spec_id>_events.jsonl`

JSONL, one event per line. Avoids unbounded array growth in the YAML
itself and stays cheap to tail.

### Event schema

```json
{
  "event_id": "evt_01K...",
  "spec_id": "spec_01K...",
  "ts": "2026-04-29T...",
  "actor_kind": "operator | worker | system",
  "actor_id": "operator_id_or_worker_host",
  "transition": { "from": "AWAITING_APPROVAL", "to": "APPROVED" },
  "context": {
    "commit_sha": "abc1234",
    "message": "approved via /api/research/specs/[id]/approve",
    "queue_entry_id": "que_01K..."
  }
}
```

### Coverage

Every transition in §3 emits one event. The endpoints write the
event in the same commit as the state change (one git commit, two
files). The worker writes events when it claims (CLAIMED), starts
(IMPLEMENTING), completes (REGISTERED), or fails (FAILED).

### Reading

A future read endpoint surfaces the timeline on the idea detail
page. Phase D-implementation can stub this to show only the latest
event; full timeline is post-Phase-E polish.

---

## 6. Verification & rollback

### Verification (test plan, no order)

1. Approve endpoint preconditions: each row of the §2 table returns
   the documented status code.
2. Approve endpoint atomicity: simulate queue write failure → spec
   stays at AWAITING_APPROVAL, no queue entry, no audit event.
3. Send-back from AWAITING_APPROVAL: spec returns to DRAFTING, no
   queue entry created.
4. Spec state machine illegal transitions: every cell not listed in
   §3 returns 409 from the relevant endpoint.
5. Worker claim race: two workers attempt to claim the same QUEUED
   entry; second fails on push, queue entry shows one CLAIMED
   transition.
6. REGISTERED commit Case A: idea kind transitions SPEC_PENDING →
   REGISTERED, strategy_id and preset_id populate, queue entry →
   COMPLETED, all in one commit.
7. REGISTERED commit Case B (re-spec swap): spec_old → SUPERSEDED,
   spec_new → REGISTERED, idea active_spec_id swap, pending_spec_id
   cleared, all atomic.
8. SUPERSEDED specs are read-only via PATCH (returns 409 on any
   state change).
9. Operator cancel-after-approve before claim: spec → REJECTED,
   queue entry → CANCELLED, atomic.
10. Audit log: every transition produces an event line, JSONL parses
    cleanly, no orphan events for failed transitions.

### Rollback

- **Approve commit failed mid-flight**: the spec / queue / events
  files are all in one commit, so partial state is impossible. If
  the commit didn't push, nothing changed.
- **Worker claim conflict**: the second worker's push is rejected;
  no manual intervention.
- **Worker REGISTERED commit fails**: queue entry stays IMPLEMENTING
  with `last_error`, spec stays APPROVED. Operator sees "Codex hit a
  problem — retry queued" via the read-time queue projection.
- **Bad strategy registered**: not Phase E's problem to roll back.
  The operator's recourse is re-spec (Case B above) or manual
  retirement of the strategy through the existing strategy bank
  surface. Phase E does not introduce a "uncomission a registered
  strategy" path.
- **Schema migration**: queue artifact and events files are new in
  Phase E. No existing data to migrate.

---

## 7. Out of scope for Phase E

- **Operator UI** for the queue. Phase D-implementation polls the
  queue read-only and surfaces "Codex is on this" / "implementation
  failed — retry pending" messages on the idea detail page. No
  operator-writable surface for queue entries.
- **Talon's drafting endpoint**. Independent track.
- **Strategy retirement / unregister**. The strategy bank already
  has its own surface; Phase E doesn't touch it.
- **Cross-scope queue ergonomics** (claiming entries from a different
  scope). The worker filters to its own scope.
- **Webhook / push notification on transition**. Polling is fine for
  v1; webhooks are a future ergonomic win.

---

## 8. Open questions for v1

| ID | Question | Default |
|---|---|---|
| OQE-1 | Max attempts before FAILED | 3 |
| OQE-2 | Worker identity format (`codex@<host>` vs ULID) | host-based for now |
| OQE-3 | Cancel-after-claim mechanism | flag in queue entry, worker honors at next checkpoint |
| OQE-4 | Should the audit trail also cover idea `strategy_ref` updates, or only spec transitions? | Spec only for v1; idea log is a future addition |
| OQE-5 | Should `/approve` accept an `acceptance_criteria_override` body for last-second tweaks? | No — operator edits the spec instead |

Lock these or push back as you see fit. Defaults are non-blocking.

---

## 9. Phase E sign-off checklist

- [ ] Queue artifact schema (§1) accepted as-is or with revisions.
- [ ] Approve endpoint preconditions + atomicity contract (§2)
      reviewed against the existing PATCH/specs implementation.
- [ ] Spec state machine (§3) matches what's already permitted in
      the PATCH endpoint; if there's drift, surface it before merge.
- [ ] `strategy_ref` Case A and Case B atomicity tests written.
- [ ] Audit log path (§5) sanity-checked against the existing scope
      directory layout.
- [ ] Rollback story (§6) confirmed against the live deploy lag —
      any operator-visible state must reflect what the next pull
      will produce, not optimistic local state.
