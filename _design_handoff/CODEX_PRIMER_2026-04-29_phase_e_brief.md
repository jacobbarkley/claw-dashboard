# Codex Primer — Phase E: implementation queue + approve loop

**Date:** 2026-04-29 (rev 2 after Codex review)
**From:** Claude (Opus 4.7), per Jacob's request
**For:** Codex
**Scope:** Contracts + state transitions only. UI is Phase D-implementation
and lives downstream — don't let UI polish bleed into this phase.

This brief locks the Phase E foundation. With this on a branch, Phase
D-implementation becomes a coherent thread end-to-end.

### Rev 2 changes (from Codex review of rev 1)

- **Cross-repo completion replaces single-commit atomicity** (§3 NEW).
  Trading-bot commit lands first, dashboard projection commit lands
  second; projection is idempotent so retries are safe. One git commit
  cannot span two repos.
- **Drop `FAILED` from the spec state machine.** Failure lives on the
  queue entry. Spec stays at APPROVED through worker failures.
  Expanding the canonical `StrategySpecState` enum is intentional and
  not happening in this phase.
- **Spec never visits `IMPLEMENTING`** in v1. Operator-visible
  "awaiting implementation" derives from queue state, not spec state.
  Removes the conflict between "worker claims advances spec" and
  "failed registered commit leaves spec APPROVED."
- **Approve endpoint requires a Git Data API helper.** GitHub
  Contents API is per-file; spec + queue + audit in one commit needs
  the Git Data API path (or local git). Phase E cost includes that
  helper.
- **Queue scope flattens** to match existing Lab artifacts
  (`user_id`, `account_id`, `strategy_group_id`) — no nested `scope`.
- **Preset / registry updates are trading-bot canonical**, mirrored
  to dashboard via Codex's existing pipeline. No direct dashboard
  mutations of preset metadata.
- **Schema expansion for `approved_at` / `approved_by` / `preset_id`**
  on `StrategySpecV1` flagged explicitly; `implementation_commit`
  lives on the queue entry, not the spec.

---

## 1. Queue artifact shape (resolves OQ-3)

**Recommendation:** file-per-spec at
`data/research_lab/<scope>/spec_implementation_queue/<spec_id>.yaml`.
Single-file lookups, no merge conflicts under concurrent approvals,
trivial to audit, easy for the worker to lock with `flock`.

Reject: a single rolling YAML (merge conflict risk, hard to lock) or
per-day directory (premature partitioning).

### Schema — `spec_implementation_queue.v1`

```yaml
schema_version: research_lab.spec_implementation_queue.v1

queue_entry_id: que_01K...
spec_id:        spec_01K...
spec_version:   1
idea_id:        idea_01K...

# Flat scope, matches existing Lab artifacts
user_id:           ...
account_id:        ...
strategy_group_id: ...

state: QUEUED | CLAIMED | IMPLEMENTING | COMPLETED | FAILED | CANCELLED

queued_at: 2026-04-29T...
queued_by: operator_id

claimed_at: 2026-04-29T... | null
claimed_by: codex@<host>   | null
attempts:   0

implementation_started_at:  ... | null
implementation_finished_at: ... | null

# Result fields — populated when trading-bot side completes Phase 1
# (the implementation commit lands), regardless of dashboard
# projection state. Used to make the projection idempotent.
implementation_commit: abc1234 | null   # trading-bot commit SHA
registered_strategy_id: regime_attention_overlay | null
preset_id: preset_01K... | null

# Failure fields — populated on FAILED
last_error:    "stack trace or short message" | null
last_error_at: ... | null

# Operator override
cancelled_at:  ... | null
cancelled_by:  operator_id | null
cancel_reason: "..."        | null
```

`implementation_commit` on the queue entry (not on the spec) is
deliberate: it's worker-run metadata, not part of the spec contract.

### Worker discipline

- Worker scans the queue dir, filtered to `state: QUEUED` and matching
  scope.
- Atomic claim: a dashboard commit flipping state to `CLAIMED` plus
  `claimed_at` / `claimed_by`. If two workers race, second one's push
  is rejected on file-sha mismatch and it skips.
- After claim, worker advances to IMPLEMENTING and runs Phase 1 (see
  §3). On COMPLETED or FAILED, the queue entry is rewritten in the
  projection commit.
- `attempts` increments on every claim. Cap at 3 (OQE-1). After that
  the entry is set to FAILED with `last_error: "max attempts
  exceeded"`.

---

## 2. Approve endpoint semantics

`POST /api/research/specs/[id]/approve`

### Preconditions

| Check | Failure code |
|---|---|
| Spec exists | 404 |
| Spec state is `AWAITING_APPROVAL` | 409 (with current state in body) |
| Idea exists and is loadable | 404 |
| `idea.strategy_ref.kind === "SPEC_PENDING"` OR (`kind === "REGISTERED"` AND `pending_spec_id === spec_id`) | 409 |
| `idea.strategy_ref.active_spec_id === spec_id` OR `idea.strategy_ref.pending_spec_id === spec_id` | 409 |

The dual-pointer check covers both first-time approvals
(`active_spec_id`) and re-spec approvals (`pending_spec_id`). Per
Addendum A1 of `LAB_PIPELINE_V2_SPEC`, re-spec approvals leave the
existing registered strategy alone until Phase E completes the swap;
the approve step does not flip anything on the idea.

### Side effects (single dashboard commit, multi-file)

The approve endpoint must write three files in one git commit:

1. Spec YAML: `state` → `APPROVED`, set `approved_at` + `approved_by`.
2. New queue entry at
   `spec_implementation_queue/<spec_id>.yaml` with `state: QUEUED`.
3. Audit event line appended to `<spec_id>_events.jsonl`.

If the multi-file commit fails (push rejection, etc.), nothing
changed. If it succeeds, all three are present.

### Multi-file commit mechanism

GitHub Contents API is per-file and cannot deliver this. The endpoint
needs a Git Data API helper:

```
1. GET refs/heads/main → current ref sha
2. GET commits/<sha> → tree sha
3. POST blobs (one per new/updated file)
4. POST trees (composing the new tree from base + blobs)
5. POST commits (parent = current_sha, tree = new_tree)
6. PATCH refs/heads/main → new commit sha (fast-forward only)
```

Phase E cost includes building / extending this helper, e.g. at
`lib/github-multi-file-commit.server.ts`. The existing Contents API
path stays for single-file mutations.

### Schema expansion required

`approved_at` and `approved_by` are not on `StrategySpecV1` today.
Add them as optional fields:

```ts
export interface StrategySpecV1 extends ScopeTriple {
  // ... existing fields ...
  approved_at?: string | null
  approved_by?: string | null
  preset_id?: string | null               // sibling of registered_strategy_id
}
```

`preset_id` is a sibling of `registered_strategy_id` (which is
already on the canonical) and should live on the spec for the same
reason — it identifies the executable preset that the spec produced.
Set during the projection commit (§3).

This expansion goes in lockstep on Python and TS. Bump the schema's
written `schema_version` to `research_lab.strategy_spec.v1.1` if you
want to be strict; or keep `v1` since the additions are optional.
Codex calls.

### Send-back

Send-back lives on the existing `PATCH /api/research/specs/[id]`
with `state: "DRAFTING"`. Validates source state is
`AWAITING_APPROVAL`, writes the spec, appends an audit event. No
queue entry exists yet, no cleanup.

### Operator-cancel after approve, before claim

`PATCH /api/research/specs/[id]` with `state: "REJECTED"` is allowed
from `APPROVED` only when the queue entry's state is still `QUEUED`
(not yet claimed). The endpoint flips the queue entry to
`CANCELLED` in the same commit. Once claimed, operators can't
unilaterally cancel — see OQE-3.

---

## 3. Cross-repo completion model (replaces "atomic REGISTERED commit")

The original brief assumed a single five-file atomic commit. That's
impossible: strategy code / registry / presets are trading-bot
canonical; spec / idea / queue / audit are dashboard. One git commit
cannot span two repos.

The actual model is two phases. Phase 1 is atomic on trading-bot.
Phase 2 is atomic on dashboard. Phase 2 is idempotent so retries
after partial failure are safe.

### Phase 1 — Trading-bot implementation commit (worker, trading-bot repo)

1. Worker reads the QUEUED queue entry, claims it (CLAIMED state on
   dashboard side), updates queue state to IMPLEMENTING.
2. Worker generates the strategy module from the spec.
3. Worker adds registry entry and preset YAML to trading-bot
   canonical.
4. Worker runs tests / smoke checks.
5. Worker commits all of (2)–(4) to trading-bot in one commit.
   Records the resulting commit SHA.
6. Worker writes the SHA + `registered_strategy_id` + `preset_id`
   into the dashboard queue entry, leaving queue state at
   IMPLEMENTING. (This is a small dashboard commit on its own;
   recording the SHA before Phase 2 makes Phase 2 idempotent.)

If any of (2)–(5) fails, queue state → FAILED, `last_error` set,
`attempts` increments. Spec stays at APPROVED. Operator sees the
failure via the queue projection on the idea detail page.

### Phase 2 — Dashboard projection commit (worker, dashboard repo)

Multi-file commit via the Git Data API helper from §2:

1. Spec YAML: `state` → `REGISTERED`, set `registered_strategy_id`,
   `preset_id`. (Case B: spec_old also gets `state` → `SUPERSEDED`.)
2. Idea YAML: `strategy_ref` updated per Case A or Case B (§4).
3. Queue YAML: `state` → `COMPLETED`, `implementation_finished_at`
   set.
4. Audit event line appended to `<spec_id>_events.jsonl`.

If the projection commit fails (push rejection, transient API
error), worker retries. Idempotency requirement: the commit logic
must read current state of each file and skip the write if already
at the target value. So a retry after a partial success of the same
commit is safe (in practice the all-or-nothing commit semantics
mean partial success isn't possible, but read-current-state-before-
write protects against a concurrent operator action between Phase 1
and the retry).

### Why this model

- **Atomicity per repo, not across repos.** Each commit is atomic in
  its own repo's terms; we don't pretend otherwise.
- **Idempotent recovery.** If Phase 2 fails, the worker has the
  recorded SHA from Phase 1 and re-runs Phase 2 cleanly.
- **No phantom registered strategies.** Trading-bot lands first.
  If trading-bot succeeds and dashboard projection takes time, the
  strategy is technically usable from trading-bot's POV but the
  dashboard isn't claiming it's ready. The thread step shows
  "awaiting implementation" until projection completes.
- **Failure forensics are clear.** Queue entry's `implementation_commit`
  field tells you whether Phase 1 happened. State (IMPLEMENTING vs
  COMPLETED vs FAILED) tells you where it stopped.

### Worst case

Phase 1 succeeds, Phase 2 fails permanently after max retries.
Trading-bot has the strategy registered; dashboard never reflects it.
Operator sees "implementation in flight" indefinitely. Mitigation:
queue entry transitions to FAILED with explicit
`"trading-bot registered (sha=...) but dashboard projection failed"`
error. Operator files an incident; Codex investigates manually.

This is the cost of cross-repo. We accept it because making
trading-bot canonical for strategy code is the right call — the
alternative (mirroring strategy code into dashboard) is worse.

---

## 4. Spec state machine (rev 2)

```
       PATCH state                /approve              projection commit
DRAFTING ───────▶ AWAITING_APPROVAL ────▶ APPROVED ─────────────────────▶ REGISTERED
   ▲                  │                    │
   │ PATCH state       │ PATCH state        │ PATCH state (cancel before claim)
   └──────────────────┘                    │
                                            ▼
                                          REJECTED
```

`IMPLEMENTING` and `FAILED` are **not** worker-written values on the
spec in v1.

- `IMPLEMENTING` exists in the canonical enum (Phase C) but Phase E
  doesn't use it. The operator-visible "Codex is working on this"
  state is derived from queue state (CLAIMED or IMPLEMENTING), not
  spec state.
- `FAILED` is **not** in the canonical enum. Failure lives on the
  queue entry exclusively. Spec remains at APPROVED through worker
  failures.
- `SUPERSEDED` is written by the projection commit (§3 Case B) when
  a re-spec lands.

### Who writes which transition (v1)

| Transition | Writer | Endpoint / mechanism |
|---|---|---|
| DRAFTING → AWAITING_APPROVAL | operator | `PATCH /specs/[id]` |
| AWAITING_APPROVAL → DRAFTING | operator (send-back) | `PATCH /specs/[id]` |
| AWAITING_APPROVAL → APPROVED | operator | `POST /specs/[id]/approve` |
| AWAITING_APPROVAL → REJECTED | operator (withdraw) | `PATCH /specs/[id]` |
| APPROVED → REJECTED | operator (cancel before claim) | `PATCH /specs/[id]` (also cancels queue entry) |
| APPROVED → REGISTERED | worker | projection commit (§3 Phase 2) |
| REGISTERED → SUPERSEDED | worker | projection commit on a re-spec |

Anything not in this table is a 409.

### Validation

`PATCH /specs/[id]` and `POST /specs/[id]/approve` share precondition
logic. Extract a single `canTransitionSpec(spec, nextState, ctx):
TransitionResult` so the rules don't drift. Use it from both
endpoints.

---

## 5. Idea `strategy_ref` update rules

Spec state changes leave the idea alone except at `REGISTERED`. The
projection commit touches the idea YAML in two cases.

### Case A — first-time registration (idea was SPEC_PENDING)

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
  strategy_id: regime_attention_overlay # mirrored from trading-bot
  preset_id: preset_01K...              # mirrored from trading-bot
```

### Case B — re-spec swap (idea was REGISTERED with pending_spec_id)

Per Addendum A1 of `LAB_PIPELINE_V2_SPEC`. The active strategy stays
runnable until the new spec registers.

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
  strategy_id:     new_registered     # mirrored from trading-bot
  preset_id:       new_preset
```

And in the same projection commit:
- `spec_old.state` → `SUPERSEDED`
- `spec_new.state` → `REGISTERED`

### Mirroring discipline

`strategy_id` and `preset_id` are mirrored from trading-bot
canonical metadata. The dashboard never invents them. The
projection commit reads them from the recorded
`implementation_commit` SHA's tree (or from the queue entry where
they were written at end of Phase 1).

The dashboard preset index `data/research_lab/presets/_index.json`
follows the existing mirroring pipeline Codex already maintains.
Phase E does not introduce direct dashboard-side preset mutations.

---

## 6. Audit trail

Per-spec event log, append-only.

### Path

`data/research_lab/<scope>/strategy_specs/<spec_id>_events.jsonl`

JSONL, one event per line. Avoids unbounded array growth in the
spec YAML and stays cheap to tail.

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
    "dashboard_commit": "abc1234",
    "implementation_commit": "def5678",
    "queue_entry_id": "que_01K...",
    "message": "approved via /approve"
  }
}
```

`implementation_commit` is set on REGISTERED events to record the
trading-bot SHA. Other events leave it null.

### Coverage

Every spec-state transition in §4 emits one event. Endpoints write
the event line in the same dashboard commit as the state change.
The worker writes events at:
- Claim (DRAFTING-side queue change, no spec event)
- Projection commit success (REGISTERED event with
  implementation_commit)
- Phase 1 failure (no spec event; queue-entry-only failure log)

Idea-side `strategy_ref` updates are not covered by the spec audit
log in v1 (OQE-4 default). A separate idea event log is a future
addition.

---

## 7. Verification & rollback

### Verification (test plan, no order)

1. Approve preconditions: each row of §2 returns documented status.
2. Approve atomicity: simulate Git Data API failure → spec stays at
   AWAITING_APPROVAL, no queue entry, no audit event.
3. Send-back from AWAITING_APPROVAL: spec returns to DRAFTING, no
   queue entry created.
4. Spec state machine illegal transitions: every cell not in §4
   returns 409 from the relevant endpoint.
5. Worker claim race: two workers attempt to claim the same QUEUED
   entry; second fails on push, queue entry shows one CLAIMED
   transition.
6. Phase 1 success + Phase 2 success — Case A: idea kind
   transitions SPEC_PENDING → REGISTERED, strategy_id and preset_id
   populate, queue → COMPLETED, all in projection commit.
7. Phase 1 success + Phase 2 success — Case B: spec_old →
   SUPERSEDED, spec_new → REGISTERED, idea active_spec_id swap,
   pending_spec_id cleared.
8. Phase 1 failure: queue → FAILED, spec stays APPROVED, idea
   untouched. Retry path works.
9. Phase 1 success + Phase 2 failure: queue stays IMPLEMENTING with
   `implementation_commit` set; projection retry idempotent (running
   it twice doesn't double-write or error).
10. SUPERSEDED specs reject PATCH state changes (409).
11. Operator cancel-after-approve before claim: spec → REJECTED,
    queue → CANCELLED, atomic.
12. Audit log: every transition produces an event line; JSONL parses
    cleanly; no orphan events for failed transitions.

### Rollback

- **Approve commit failed mid-flight**: spec / queue / events are
  all in one Git Data API commit, so partial state is impossible.
- **Worker claim conflict**: second worker's push rejected; no
  manual intervention.
- **Phase 1 failure**: queue → FAILED with last_error. Operator
  reads the error, files a follow-up if it's a real bug. Spec stays
  APPROVED so retry is just "re-trigger."
- **Phase 2 failure**: queue stays IMPLEMENTING with
  implementation_commit. Worker retries Phase 2 idempotently.
- **Worst-case cross-repo divergence**: Phase 1 succeeded, Phase 2
  exhausted retries. Queue → FAILED with explicit
  "trading-bot registered but dashboard projection failed". Manual
  intervention: Codex investigates, runs the projection by hand.
- **Bad strategy registered**: not Phase E's problem. Operator
  re-specs (Case B) or retires through the existing strategy bank.

### Schema migration

Queue artifact and `_events.jsonl` are new in Phase E. No existing
data to migrate. The optional schema additions to `StrategySpecV1`
(`approved_at`, `approved_by`, `preset_id`) are backward-compatible
— existing specs without them are valid; readers default to null.

---

## 8. Out of scope for Phase E

- **Operator UI** for the queue. Phase D-implementation polls the
  queue read-only and surfaces "Codex is on this" / "implementation
  failed — retry pending" messages on the idea detail page.
- **Talon's drafting endpoint.** Independent track.
- **Strategy retirement / unregister.** Existing strategy bank
  surface; Phase E doesn't touch it.
- **Cross-scope queue ergonomics.** Worker filters to its own scope.
- **Webhook / push notification on transition.** Polling is fine
  for v1.
- **Spec-level FAILED / IMPLEMENTING states.** Failure and
  in-progress live on the queue. Spec state machine is intentionally
  thinner than the canonical `StrategySpecState` enum allows for v1.

---

## 9. Open questions for v1

| ID | Question | Default |
|---|---|---|
| OQE-1 | Max attempts before queue → FAILED | 3 |
| OQE-2 | Worker identity format (`codex@<host>` vs ULID) | host-based for now |
| OQE-3 | Cancel-after-claim mechanism | flag in queue entry, worker honors at next checkpoint |
| OQE-4 | Should the audit trail also cover idea `strategy_ref` updates? | Spec only for v1 |
| OQE-5 | Should `/approve` accept an `acceptance_criteria_override`? | No — operator edits spec instead |
| OQE-6 | Bump `StrategySpecV1` to `v1.1` for the new optional fields, or keep `v1`? | Keep `v1` — additions are optional |

Lock these or push back. Defaults are non-blocking.

---

## 10. Phase E sign-off checklist

- [ ] Queue artifact schema (§1) accepted with flat scope fields.
- [ ] Approve endpoint preconditions + multi-file commit mechanism
      (§2) reviewed against the existing PATCH/specs implementation.
- [ ] Schema expansion for `approved_at` / `approved_by` /
      `preset_id` on `StrategySpecV1` agreed in Python and TS
      (lockstep).
- [ ] Cross-repo completion model (§3) accepted as the replacement
      for the rev 1 single-commit story.
- [ ] Spec state machine (§4) — IMPLEMENTING + FAILED removed from
      worker-written transitions — confirmed against the canonical
      enum.
- [ ] `strategy_ref` Case A and Case B atomicity tests written
      (Phase 2 commit, idempotent on retry).
- [ ] Audit log path (§6) sanity-checked against existing scope
      directory layout.
- [ ] Git Data API helper (§2) scoped — built fresh or extended
      from any existing trading-bot helper Codex has.
- [ ] Rollback story (§7) confirmed against the live deploy lag.
