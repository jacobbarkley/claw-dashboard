# Phase D UX Prep — Operator spec authoring + idea thread

**Date:** 2026-04-29
**Status:** Design + static preview. Live wiring waits on Phase C.
**Author:** Claude (per Addendum A2 of LAB_PIPELINE_V2_SPEC)

This is the design reference for the operator-authored strategy spec
form and the seven-step thread that runs through the idea detail page.
A static preview ships at `/vires/bench/lab/spec-preview` so Jacob and
Codex can react to the visual + copy before the live surfaces wire up.

Nothing in this doc touches a live operator surface. The live idea
detail page changes in Phase D-implementation, which lands behind a
feature flag (`vires.lab.spec_authoring`) once Phase C's spec contract
is on disk.

---

## §1 — Goal

The operator should be able to walk an idea from "thesis on a napkin"
to "strategy nominated for production" along a single visible thread
on the idea detail page. The bench / preset / registry / manifest
plumbing stays hidden behind an Advanced disclosure.

The thread has seven states. Each state surfaces exactly the action
that moves the idea forward. No state requires the operator to know
how the system represents specs, jobs, campaigns, or passports
internally.

---

## §2 — The seven-step thread

Renders as a compact horizontal stepper at the top of the idea detail
page, with the active step's body rendered below.

| # | Step ID              | Label               | Active when                                                   | Body |
|---|---|---|---|---|
| 1 | `describe`           | Describe your idea  | Idea creation — before save                                    | Idea creation form (already exists). |
| 2 | `awaiting-spec`      | Awaiting strategy spec | `strategy_ref.kind: NONE` AND `needs_spec: true`            | Two actions: "Draft with Talon" (gated by Talon flag) + "Author spec yourself." |
| 3 | `spec-drafted`       | Spec in review      | `strategy_ref.kind: SPEC_PENDING`, spec state DRAFTING/AWAITING_APPROVAL | Spec form (this doc, §3). Submit for approval / approve / send back. |
| 4 | `awaiting-impl`      | Awaiting implementation | Spec state APPROVED or IMPLEMENTING                         | Status pill, no action. "Codex is building this. You'll see it here when it's runnable." |
| 5 | `ready-to-run`       | Ready to run in Lab | `strategy_ref.kind: REGISTERED`, no successful campaign yet   | Submit Lab job action (already exists in shell). |
| 6 | `campaign`           | Campaign rolled up  | Campaign manifest exists, acceptance criteria not yet met     | Campaign card + run-more-jobs action. |
| 7 | `ready-to-nominate`  | Ready to nominate   | Campaign acceptance criteria met                              | "Nominate for promotion" — passport flow. |

Steps 1, 5, and 7 already have live surfaces today (Idea creation,
Lab job submit, promotion target). Steps 2, 3, 4, 6 are new in Phase
D-implementation.

### Step ordering rule

A step is **reachable** when the idea's `strategy_ref` and spec state
satisfy its predicate. The stepper highlights the highest-numbered
reachable step. Earlier steps stay visible but inactive — they are
the trail. Steps that are skipped (e.g. an idea that goes straight
from REGISTERED to a successful campaign with no manual job submission
because Codex auto-runs the registered preset) are rendered as
"completed" pills with no body content.

### Re-spec branching

When a re-spec is in flight (`strategy_ref.pending_spec_id != null`),
steps 5/6/7 still render for the active spec, and a parallel "spec v2
drafting" badge appears on step 3. Operator can click the badge to
review/approve the new spec without leaving the thread of the active
strategy. (Per Addendum A1, the active strategy keeps running.)

---

## §3 — Operator-authored spec form

Renders inside step 3's body. Fields collected in three groups: core,
universe & data, advanced.

### Header

- Linked idea card: title + truncated thesis (~120 chars) + sleeve
  chip.
- Authoring mode chip pair: `AI_DRAFTED | OPERATOR_DRAFTED`. When
  AI_DRAFTED is active, the form prepends a "Talon drafted this —
  review and edit" banner. The fields and actions are the same.
- Spec state pill (DRAFTING / AWAITING_APPROVAL / etc.).

### Group A — Core (always visible)

- **Edge / signal logic** — large textarea. Plain language. "What's
  the edge in one paragraph?"
- **Entry rules** — textarea. "When does the strategy enter? Conditions,
  data, timing."
- **Exit rules** — textarea. "When does it exit? Stop loss, target,
  time decay, regime flip."
- **Risk model** — textarea. "How is each trade sized? Position
  sizing, max exposure, hedges."

### Group B — Universe & data (always visible)

- **Universe** — textarea. "What does this trade? Tickers, sectors,
  filters. Can be wide ('all SPY constituents > $1B mkt cap') or
  narrow ('BTC, ETH only')."
- **Required data** — chip multi-select with free-text "other"
  input. Pre-filled chips: Price OHLCV, Fundamentals, Options chain,
  Implied vol surface, Sentiment, Attention proxies, Macro, Crypto
  on-chain, Custom.
- **Benchmark** — dropdown: SPY, BTC, sleeve default, custom. When
  "custom" is selected, a free-text input appears below.

### Group C — Acceptance criteria (always visible, structured)

Three required fields, plus optional notes:

- **Min Sharpe** — number input (default 1.0).
- **Max drawdown** — percent input (default 20).
- **Min hit rate** — percent input (default 45).
- **Other criteria** — textarea, optional. "Anything else that has
  to be true before this ships."

### Group D — Advanced (collapsed by default)

Disclosed under an "Advanced — implementation hints" toggle:

- **Candidate strategy family** — text input. "Suggest a name. Codex
  may rename to fit the registry."
- **Sweep parameters** — textarea. "Which knobs should Codex expose
  for backtests? List them with rough ranges."
- **Implementation notes** — large textarea. "Anything else for
  Codex / Talon. Edge cases, data quirks, references."

### Actions

Three buttons at the bottom of the form, right-aligned:

- **Cancel** — returns to idea detail without saving.
- **Save draft** — persists with spec state DRAFTING. Operator can
  return and edit later. Other operators see the spec but can't
  approve.
- **Submit for approval** — persists with spec state
  AWAITING_APPROVAL. The approve / send-back action surfaces appear.

### Validation

- All Group A and B core fields required to submit for approval.
  Save draft has no validation — even an empty form persists.
- Group C numeric fields validated client-side: 0 ≤ Sharpe, 0 ≤ DD ≤
  100, 0 ≤ hit rate ≤ 100.
- Group D fully optional.

---

## §4 — InfoBubble copy

Reuse the InfoBubble component pattern from
`equity-curve-swarm.tsx:533`. Copy attached to each step heading on
the thread:

| Step | InfoBubble copy |
|---|---|
| `awaiting-spec` | "A spec turns your thesis into something Codex can build. You can draft it yourself or hand the start to Talon." |
| `spec-drafted` | "Refine the rules until they read like a real strategy. Once submitted, the system asks you to approve before Codex starts implementing." |
| `awaiting-impl` | "Codex builds the strategy module from the approved spec, registers it, and adds tests. This usually takes a single Codex session." |
| `ready-to-run` | "The strategy is registered and runnable. A Lab job runs it against the configured universe and produces an equity swarm." |
| `campaign` | "When a Lab job finishes successfully, the system rolls it up into a campaign. Run more jobs across regimes before nominating." |
| `ready-to-nominate` | "Acceptance criteria met. Nominating moves this onto the passport — the system handles identity, audit, and the strategy bank update." |

Copy lives in the preview component as a single `STEP_INFO` map so
it's edited in one place.

---

## §5 — Live wiring plan (Phase D-implementation, after Phase C)

Phase D-prep ends with the preview shipped. Live wiring is a separate
PR with these touchpoints:

1. **Idea detail page** (`app/vires/bench/lab/ideas/[id]/page.tsx`):
   compute `currentStep` from `strategy_ref` + spec state + campaign
   state. Render `<IdeaThreadStepper>` at the top, pass `idea` and
   `currentStep`. Body content swaps based on step.
2. **Awaiting-spec actions**: Wire the "Author spec yourself" button
   to `POST /api/research/specs` (live since Phase C, commit
   `183139c`) with `{ idea_id, authoring_mode: "OPERATOR_DRAFTED" }`.
   Server creates a spec in DRAFTING state and returns the spec_id;
   client redirects to the spec edit surface. A future ergonomic
   wrapper `POST /api/research/ideas/[id]/draft-spec` is optional —
   the bare POST works.
3. **Spec edit surface**: New route
   `/vires/bench/lab/ideas/[id]/spec/edit`. Hosts the form built in
   §3, wired to `PATCH /api/research/specs/[id]` for body edits
   (live since Phase C). Submission to AWAITING_APPROVAL goes through
   the same PATCH with `state: "AWAITING_APPROVAL"` in the body. The
   approve / send-back actions on the awaiting-approval surface need
   a dedicated `POST /api/research/specs/[id]/approve` endpoint —
   pending, see §6.
4. **Talon-drafted path**: Hidden until Talon is unblocked. When
   Talon flag is on, the "Draft with Talon" button hits a Talon
   endpoint that returns a draft spec, then redirects to the same
   spec edit surface with `authoring_mode: AI_DRAFTED`.

Feature flag: `vires.lab.spec_authoring`. Default off. Read from
operator-feed or a build-time env var (TBD with Codex).

---

## §6 — What's out of scope for Phase D-prep

- Live API endpoints `/api/research/ideas/[id]/draft-spec` (optional
  ergonomic wrapper) and `/api/research/specs/[id]/approve` — still
  pending. The CRUD surface for `/api/research/specs` and
  `/api/research/specs/[id]` (GET/PATCH/DELETE) **landed in Phase C**
  on commit `183139c` and is no longer Codex pending work.
- Talon integration — deferred until Talon is unblocked.
- Sweep parameter structured editing (we do textarea now, structured
  later if operator demand emerges).
- Multi-operator collaboration / spec ownership / locking — single-
  operator phase.
- Spec versioning UX beyond the "spec v2 drafting" badge in the
  re-spec section. The full diff view between spec_old and spec_new
  is a future enhancement.

---

## §7 — Preview route

Lives at `/vires/bench/lab/spec-preview`. Mounts a single page with:

- A scrubber bar at the top — chips for each of the seven steps —
  that lets the operator click between thread states to see how the
  surface evolves.
- The mock idea header (Ape Wisdom — retail-attention regime overlay).
- The `<IdeaThreadStepper>` rendering current step + reachable trail.
- The body content swap per step.
- For step 3, an authoring-mode toggle to compare AI_DRAFTED vs
  OPERATOR_DRAFTED rendering.

The preview is unflagged because it's a parallel preview surface, not
a live operator surface modification. It compiles with the rest of the
app and is reachable to anyone who knows the URL.
