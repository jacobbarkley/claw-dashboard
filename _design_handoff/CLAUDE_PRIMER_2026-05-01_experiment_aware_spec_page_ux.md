# Claude UX primer — experiment-aware spec page

**Date:** 2026-05-01
**From:** Claude (Opus 4.7), per Jacob's request
**For:** Codex, before he commits to the experiment_plan contract shape
**Scope:** What the operator-facing spec/edit surface needs to do once
"strategy + how it will be judged" is one coupled object, and what
that implies for contract decisions Codex is about to make.

This is not a final design. It's the UX requirements doc that should
drive backend contract shape, so we don't end up with a flexible-looking
contract that can't actually drive chips, validation, or automation.

---

## §1 — The shift

Today the spec page asks one question: *"what's the strategy?"* — 9
fields about signal/entry/exit/risk/data. Submit, approve.

After: it asks two coupled questions — *"what's the strategy?"* and
*"how will it be judged?"* — and the operator can't answer one without
implicitly answering the other. The data this strategy needs (`required_data`
on the spec) is the same data the experiment plan classifies by status.
The acceptance criteria on the spec are an aggregated subset of evidence
thresholds in the plan. The strategy's universe defines which eras are
runnable.

The page becomes one form, two visibly coupled sections, with
cross-section indicators when they reference the same underlying thing.

---

## §2 — Page anatomy

```
─────────────────────────────────────────────────────────────
HEADER
  Idea title · sleeve · spec_id · vN
  Validity pill: ● Plan complete  /  ◐ Caveats: 2  /  ✗ Plan incomplete: 3
  ↑ click pill expands the issue list
─────────────────────────────────────────────────────────────
TALON CHAT PANEL                                  [unchanged]
  Multi-turn refinement, latest applyable proposal, Apply button.
  Talon's reply now describes BOTH spec and plan changes:
  "I tightened the entry rule and lowered min_trade_count to 5."
─────────────────────────────────────────────────────────────
SECTION 1 — STRATEGY
  signal_logic        [textarea]
  entry_rules         [textarea]
  exit_rules          [textarea]
  universe            [structured-ish]
  risk_model          [structured-ish]
  sweep_params        [structured-ish]
  required_data       [list]  ←─── coupled to plan §data_requirements
─────────────────────────────────────────────────────────────
SECTION 2 — EXPERIMENT PLAN
  Benchmark           [structured: symbol picker]
  Windows
    requested_start / requested_end       [date]
    fresh_data_required_from              [date, optional]
  Runnable eras       [structured: multi-select with status chips]
                                          ●AVAILABLE  ◐PARTIAL  ✗UNAVAILABLE
  Evidence thresholds [structured numbers]
    minimum_trade_count
    minimum_evaluated_trading_days
    (extensible)
  Data requirements   [structured rows, derived from required_data]
    capability_id  required  status  purpose
    apewisdom_top100  yes  AVAILABLE  attention signal
  Decisive verdict rules  [3 free-text fields]
    pass / inconclusive / fail
  Known limitations   [free-text array]
─────────────────────────────────────────────────────────────
ACTIONS
  [Save draft]   [Submit for approval]   [Cancel]
─────────────────────────────────────────────────────────────
```

The validity pill is the page-level summary of plan completeness +
internal consistency. Operators glance at it the way they glance at the
verdict on the run page. It must be a single boolean (`is_valid`) backed
by a structured reason list.

Cross-section indicators are subtle — when an operator edits
`required_data` in §Strategy, a small marker appears next to the
matching row in §Plan §data_requirements ("status pending — recheck
catalog"). When `universe` changes sleeve coverage, the eras section
gets a "recalibrate" hint. The point isn't elaborate plumbing — it's
*never letting the two sections silently disagree*.

---

## §3 — Key operator states

### State A — Talon-drafted, fresh

Operator just clicked "Draft with Talon" and landed on the spec edit
page. Both sections are populated by Talon. Validity pill is one of:

- **Green ● Plan complete** — Talon emitted a structurally valid plan
  whose data requirements all map to AVAILABLE catalog entries. Operator
  can submit immediately if they trust the draft.
- **Gold ◐ Caveats: N** — Plan structurally valid but at least one
  data requirement is PARTIAL/MISSING, or `known_limitations` is
  non-empty. Operator should read before approving.
- **Red ✗ Plan incomplete: N** — Talon couldn't emit a complete plan
  (e.g., couldn't pick a sensible era). Spec lands in DRAFTING but
  blocked from submit until operator fills the gaps.

### State B — Talon revising

Operator chats with Talon. Each revision proposal now mutates *both*
spec and plan. The chat reply must describe both changes explicitly.
Apply mechanics unchanged. Validity pill recomputes on Apply.

If Talon proposes a change that breaks plan validity (e.g., switches
to data the catalog doesn't have), Talon's proposal is BLOCKED with the
reason — same pattern as today's data-readiness BLOCKED.

### State C — Operator direct-editing

Operator edits a field directly. Validity pill recomputes on blur (or
debounced). When the operator changes a structured field that
cross-references another section, the cross-section indicator fires.

### State D — Submit-for-approval

Click triggers server-side validation. If invalid, the page shows
inline errors anchored to specific fields with the reason string —
not a banner. Operator fixes in place. State stays DRAFTING until
validation passes. Once passing, transitions to AWAITING_APPROVAL.

### State E — Approve

The idea page's Approve panel shows a compact recap of spec + plan
together. Approve is a final confirmation, never first discovery of
incompleteness. By contract, approve only runs against AWAITING_APPROVAL
specs which already passed submit validation, so the only failure path
left is "the catalog drifted between submit and approve" — same edge
case Codex already handles for data readiness.

---

## §4 — Contract requirements derived from UX

These are the fields the UI specifically needs to drive chips,
warnings, validation, and automation. Every one is a UX-led
constraint on the data model, not a backend convenience.

### Top-level computed status (drives the validity pill)

```
is_valid: boolean
validity_reasons: ValidityIssue[]
  field_id: string         # "windows.requested_start" / "data_requirements[2].status"
  severity: "error" | "warn"
  message: string          # operator-readable, not stack-trace-y
```

The UI mounts inline errors anchored by `field_id`. Codex's submit
validation should populate `validity_reasons` deterministically; the
client doesn't re-derive validity, it renders.

### Eras (drives the era multi-select with status chips)

```
runnable_eras: EraRef[]
  era_id: string
  label: string             # "2024 selloff"
  date_range: { start, end }
  status: "AVAILABLE" | "INCOMPLETE_DATA" | "UNAVAILABLE"
  reason?: string           # explains INCOMPLETE_DATA / UNAVAILABLE
```

Picked eras land in `eras.required_era_ids: string[]`. UI never invents
era labels — Codex's catalog is the source.

### Data requirements (drives the per-row data status table)

```
data_requirements: DataRequirement[]
  capability_id: string
  required: boolean
  status: "AVAILABLE" | "PARTIAL" | "MISSING"
  status_at_draft: same shape (frozen at draft time, used to detect drift)
  purpose?: string          # short free-text, "attention signal"
```

UI renders these as a table with status chips. When `status` differs
from `status_at_draft`, the row gets a "catalog drifted" marker.

### Evidence thresholds (structured numbers — never free text)

```
evidence_thresholds:
  minimum_trade_count: number
  minimum_evaluated_trading_days: number
  # extensible — new keys are fine, but each must be a typed number
  # so the run page can compare against actual values and emit
  # "below floor" chips.
```

UI renders these as numeric inputs with sensible defaults. The Run
Anatomy panel on the job page already wants these — once the plan
exists, the panel reads from the plan, not from runner defaults.

### Windows (structured ISO dates)

```
windows:
  requested_start: ISO date
  requested_end: ISO date
  fresh_data_required_from?: ISO date
```

Three dates, all ISO. The UI computes "config window days" and "fresh
tape window days" client-side. No `window_label: string` field —
that becomes ambiguous and unvalidatable.

### Free text — kept narrow and labelled

```
decisive_verdict_rules:
  pass: string
  inconclusive: string
  fail: string
known_limitations: string[]
```

These are explicitly free text because they're operator-narrative.
Three-categories-of-verdict-rules is the smallest structure that still
lets the run page render "passes the pass criterion: ..." next to the
verdict. `known_limitations` is an array, not one big text blob, so
the page can render each as a bullet.

### Anti-patterns to avoid

- **One big `experiment_plan_text` free-text field.** Looks flexible,
  can't drive anything.
- **Window mode as a string** (`"single" | "multi"`) with no enumeration
  of which eras. Forces UI to infer.
- **`evidence_threshold: string`** like "at least 5 trades over 20 days."
  Can't compare numerically.
- **Validity as a thrown exception.** UI needs structured reasons, not
  a 500.

---

## §5 — What stays stable

Don't touch:

- Talon chat panel UX (chat bubbles, latest-applyable Apply button,
  WARN callout, conversation localStorage).
- Submit-for-approval / Save-draft button shape and behavior.
- Idea page state machine (DRAFTING → AWAITING_APPROVAL → APPROVED).
- The optimistic UI work — datastore-agnostic, keeps working.
- Approve / send-back / send-back-to-DRAFTING flows on the idea page.
- The `key={spec_id}:{spec_version}` form remount pattern after Talon
  Apply.

What grows:

- `StrategySpecForm` (today: 9 fields) — adds the §Plan section. May
  warrant a split into `<StrategySection />` + `<ExperimentPlanSection />`
  for readability, but visually it's one form.
- `specToFormValues` / `formValuesToPatch` — handle the plan fields.
- `TalonChatPanel` — the chat message rendering needs to surface what
  changed in the plan, not just the spec. Probably a small "Changes"
  block in proposed-revision bubbles ("spec: tightened entry · plan:
  lowered min trade count to 5").
- The run page's `RunAnatomyPanel` — once the plan ships, it pulls
  windows + thresholds from the plan instead of inferring.

---

## §6 — Structured vs free text — Codex's checklist

For each field below, if you're tempted to make it free text, the UI
loses the corresponding capability. Don't.

| Field | Must be structured | UI capability lost if free text |
|-------|--------------------|--------------------------------|
| `is_valid` | yes | green/red pill |
| `validity_reasons` | yes | inline anchored errors |
| `runnable_eras[].status` | yes | era status chips |
| `data_requirements[].status` | yes | per-row WARN/BLOCKED chip |
| `evidence_thresholds.*` | yes (numbers) | "below floor" comparison on run page |
| `windows.*` | yes (ISO dates) | day-count math, Run Anatomy panel |
| `benchmark.symbol` | string OK for v1 | (future: validated against catalog) |
| `decisive_verdict_rules.{pass,inconclusive,fail}` | free text fine | none — narrative by design |
| `known_limitations` | string array, not blob | one bullet per limitation |

---

## §7 — What I'm not asking for (yet)

- A full multi-era comparison surface. The plan's `eras` field
  enumerates *which* eras to test; the comparison view is a separate
  page-level decision (the deferred Campaign Atlas question).
- Live recalibration of plan validity as the operator types. On-blur
  is fine for v1.
- Plan versioning independent of spec versioning. Until we have a
  reason, plan version == spec version.
- Promotion-of-plan-only changes. If the plan is wrong, that's a
  spec revision; we don't need a separate "edit just the plan" flow.

---

## §8 — What I'd want from Codex's contract

Land these and the UX writes itself:

1. `experiment_plan` lives on `StrategySpecV1` (embedded) — sibling
   `ExperimentPlanV1` is fine too if you have a reason, but embedded
   keeps the load + edit path simpler.
2. The structured fields above, named as above (or close — bikeshed
   welcome).
3. A `validate(spec, plan, catalog) -> { is_valid, validity_reasons }`
   helper exported from the same module the dashboard imports for
   loading specs. This is the SAME function the submit endpoint runs;
   the form calls it client-side on blur for the validity pill.
4. Talon drafting + revision endpoints emit both spec + plan in one
   structured response. The chat reply mentions plan changes
   explicitly.
5. Approve endpoint hard-stops on `is_valid === false`. Submit endpoint
   transitions DRAFTING → AWAITING_APPROVAL only when valid.

Once these land I can wire the new sections + validity pill + cross-
section indicators in a single dashboard pass. The Talon chat panel
update is small; the form expansion is the real work.

— Claude
