# Claude Design ↔ Claude Code — Handoff Protocol

**Audience:** Claude Design (the prototype-building instance) and
Claude Code (the production-shipping instance in `~/claude/claw-dashboard`).
Both sides read this file at the start of every handoff and must follow it.

**Canonical location:** This file lives at
`_design_handoff/HANDOFF_PROTOCOL.md` in the production repo
(`~/claude/claw-dashboard`). That copy is source of truth. Working
copies kept elsewhere (e.g. at the root of the design project for
session-start re-reading) are convenience mirrors only — if wording
ever drifts, the production repo wins. Either side may propose
edits, but the canonical file is updated through Jacob.

**Why this exists:** Prototypes have been landing in production with
small but meaningful drift — a card surfaced the user's holding instead
of market-trigger distance, an empty state collapsed to nothing instead
of degrading gracefully, a metric was reframed in implementation in a way
the prototype never sanctioned. None of these were laziness on either
side. They were *protocol gaps*. This document closes them.

The contract has two halves: **how a package ships** (Design → Code) and
**how drift is recorded** (both sides → `DIVERGENCE_LOG.md`).

---

## Part 1 — Package structure

Every handoff lives in its own dated, feature-scoped folder under
`_design_handoff/`:

```
_design_handoff/
  YYYY-MM-DD_<feature_slug>/
    prototype/              ← the runnable design artifact
    DATA_PRIMER.md          ← field-level data contract per element
    UX_CHECKLIST.md         ← parity items + "what it's NOT showing"
    DEGRADATION.md          ← empty / loading / error per element
    NOTES.md                ← (optional) intent, open questions, deferrals
```

Naming: `2026-04-19_crypto_tracked_assets/`,
`2026-04-22_passport_redesign/`. Date = day Design finalizes the package,
not the day Code lands it.

Each package is **immutable once shipped**. If something needs to change,
ship `_v2/` rather than editing in place — Code may have already started
on the original.

---

## Part 2 — What goes in each file

### `prototype/`

The prototype is the **ground truth**. Not the design intent in a doc, not
a screenshot — the actual runnable artifact. Code reads pixels, copy,
spacing, interaction states, and motion from this directly.

Ship the smallest runnable thing that demonstrates the surface end-to-end:

- A self-contained React/HTML page, or a Figma export with all states
  exported as inspectable layers
- All states represented: populated, empty, loading, error, edge
  (very long copy, very small numbers, negative values)
- Real-shape mock data inline — no `lorem ipsum`, no `123.45` placeholders
  where the real value would be `$0.0000412`
- Interactions wired (hover, tap, dropdown open, modal open) so Code
  can see motion and z-index, not guess

If the prototype renders one state and the spec says "and there's also
an empty state that looks like X" — the empty state must also be rendered
in the prototype. Spec text is not a substitute for a visible state.

### `DATA_PRIMER.md`

Field-level map from each visible element to the source field on the
operator feed (`data/operator-feed.json`). Required because most drift
comes from one side reading "trigger distance" and the other reading
"current holding qty" when both could plausibly answer "what number goes
here?"

Per element, three things:

1. **Source field** — exact JSON path, e.g.
   `operator.crypto_signals.btc.distance_to_tier_trigger_pct`
2. **Semantic** — one sentence describing what the number *means* in
   operator language, not engineer tokens
3. **Format** — units, precision, sign convention, threshold colors

If a needed field doesn't exist in the operator feed, **say so explicitly
and stop**. Do not invent it. Do not have Code derive it from adjacent
fields. The contract change belongs in
`scripts/push-operator-feed.py` and the rebuild's
`13-operator-feed-contract.md` — not in page-local logic. Flag it in
`NOTES.md` as a blocking dependency.

### `UX_CHECKLIST.md`

A line-item list of every visible element on every state, each marked
with what it **is** showing and — critically — what it is **not**
showing. The "not showing" column is the one that prevents drift; it
makes Design's intent legible to Code in the place Code is most likely
to deviate.

Format:

```
| Element                     | Shows                              | Does NOT show                       |
|-----------------------------|------------------------------------|-------------------------------------|
| Tracked Assets · BTC row    | market price + trigger distance    | user's BTC holding qty or value     |
| Open Positions · BTC row    | holding qty + unrealized P&L       | trigger distance (lives in TA card) |
```

When two cards could plausibly show overlapping data, the "Does NOT
show" column on each disambiguates intent. This is the single
highest-leverage line item in the package.

### `DEGRADATION.md`

For every element, the explicit fallback when the source field is
`null`, `undefined`, an empty array, or stale beyond a threshold.
This is **not** Code's judgment call — it is part of the design contract,
because graceful degradation is a design problem (what does the user
see and feel) before it is an engineering one.

Per element, four states:

- **Populated** — happy path (covered by the prototype)
- **Empty** — field exists but has no data (e.g. era robustness with
  all sharpe values null → render *what* exactly: muted "No era data
  yet" line? collapsed card? skeleton row?)
- **Loading** — initial fetch in flight
- **Error** — fetch threw

If degradation is "same as populated, just with `—` in the value slot,"
say that. If degradation is "hide the entire card," say that. If it's
"show the populated layout but in muted color with a tooltip
explaining staleness," say that. The point is that Code doesn't have
to guess.

**Ownership split (clarified after the protocol's first review):**
Design owns the *UX intent* per state — what the user should see and
feel when a field is missing, stale, loading, or errored. Code owns
*reporting back the actual failure-mode signals* available on the
backend — e.g. "stale-by-X-minutes is not a distinct signal yet, the
field just goes null after the snapshot ages out." If Design specs a
state that doesn't have a corresponding signal Code can detect, that's
a small back-and-forth during package review, not a blocker. Code adds
a `## Failure modes` subsection to its package-review reply listing
which `DEGRADATION.md` states map cleanly to backend signals and which
need spec adjustment or a new field on the operator feed.

### `NOTES.md` (optional for v1, required for v2+)

Anything that doesn't fit cleanly above:

- Intent / motivation (one paragraph — why this surface, why now)
- Open questions Code should flag back rather than resolving silently
- Deferrals (things in the prototype that are explicitly out of scope
  for this package and queued for a future one)
- Backend contract dependencies (fields needed from Codex that don't
  yet exist on the operator feed)

**For revision packages (`_v2/`, `_v3/`, etc.) `NOTES.md` is required
and must lead with a `## Changes since vN` section.** Diff-style
summary of what moved relative to the previous package: which elements
changed, which copy was rewritten, which states were added or removed,
which data fields swapped sources. Code should not have to pixel-diff
v1 against v2 to figure out what actually changed. If the diff is
trivially small, say so explicitly rather than omitting the section
("Changes since v1: copy on the empty-state line only — `'No era data
yet'` → `'Era data not in this snapshot'`. No layout, data, or state
changes.").

---

## Part 3 — The divergence log

`_design_handoff/DIVERGENCE_LOG.md` is a living record at the root of
the handoff folder, separate from any individual package. It is the
**learning loop**: every time implementation drifted from prototype,
the entry teaches the next handoff how to avoid the same drift.

### When to append

- Design notices Code shipped something that doesn't match the package
  → append entry, link the resolution
- Code notices the package is internally ambiguous, missing degradation
  spec, or has a data primer that doesn't match an existing operator
  feed field → append entry, raise back to Design
- Either side discovers an in-production bug that traces back to a
  handoff gap (not a runtime bug, a *spec* gap) → append entry

### Format

```
### YYYY-MM-DD — <feature or surface> — <one-line summary>

**Prototype intent:** what the design specified
**Shipped state:** what landed in production
**Which is correct + why:** the truth + the reasoning
**Resolution:** (commit SHA if fixed, or "queued for handoff <N>")
**Lesson:** (optional — generalizable rule for future handoffs)
```

The seed entry (BTC tracked assets) is already in the log as an example.
Read the existing entries before starting any new package — patterns
repeat, and the log is how we stop them from repeating.

The log is **not for blame**. It is for compounding learning. Entries
are factual, short, and forward-looking. The "Lesson" line is the
payoff: if it's general enough to apply to the next handoff, it goes
there; if it's specific to this one feature, omit it.

---

## Part 4 — Roles and responsibilities

**Claude Design owns:**
- Visual direction, copy, interaction, motion, layout
- The prototype itself (ground truth)
- `DATA_PRIMER.md` — what each element means in operator language
- `UX_CHECKLIST.md` — including the "does NOT show" column
- `DEGRADATION.md` — what every empty / loading / error state looks like
- Flagging missing operator feed fields up front, not trickling them in

**Claude Code owns:**
- Reading the prototype as ground truth and matching it
- Wiring elements to the exact fields named in `DATA_PRIMER.md`
- Implementing every state in `DEGRADATION.md` — not improvising fallbacks
- Flagging back to Design when a package is ambiguous *before* shipping
- Appending to `DIVERGENCE_LOG.md` when drift is discovered post-ship

**Both own:**
- Reading `DIVERGENCE_LOG.md` before starting a new package
- Treating the log as a contract, not a postmortem

---

## Part 5 — Practical workflow

1. **Design assembles the package** in its own dated folder, copies the
   prototype into `prototype/`, fills in the three required `.md`
   files, optionally adds `NOTES.md`.
2. **Design reads `DIVERGENCE_LOG.md`** end to end, checks for any past
   entries that touch this surface or the same data sources, and
   addresses them in the package (so they don't repeat).
3. **Design hands the folder path to Jacob**, who passes it to Code.
4. **Code reads the package in this order**: `NOTES.md` (intent) →
   `DATA_PRIMER.md` (data contract) → `prototype/` (ground truth) →
   `UX_CHECKLIST.md` (line-item parity) → `DEGRADATION.md` (states).
5. **Code raises back any blockers** — missing operator fields, internal
   ambiguity, prototype states that don't match the spec — *before*
   shipping. Don't resolve silently.
6. **Code ships**, verifies against `UX_CHECKLIST.md` line by line.
7. **Either side spots drift later** → append to `DIVERGENCE_LOG.md`,
   queue resolution.

---

## Part 6 — Anti-patterns

These are the failure modes this protocol exists to prevent. If you
catch yourself doing any of them, stop.

- **Spec-without-prototype.** Words describing a state that isn't
  rendered anywhere. Render it.
- **Prototype-without-data-primer.** A beautiful card with no
  declaration of what fields it reads. Code will guess; the guess will
  be wrong on at least one card per package.
- **"Code will figure out the empty state."** Code will, and it will
  be wrong, because empty-state design is a UX decision not an engineering
  one.
- **Silent field invention.** Either side adding a field to the
  operator feed without going through the rebuild repo's contract.
- **Editing a shipped package.** Ship `_v2/` instead. Code may already
  have started.
- **Fixing drift without logging it.** The log is how we stop the same
  miss from happening twice. No log entry = no learning.

---

## Part 7 — One rule above all others

*(Inherited from the repo `CLAUDE.md`, restated here because it
constrains design choices too.)*

The dashboard is a **thin operator surface**, not a second source of
truth. It reads one file (`data/operator-feed.json`). It does not
invent trading logic, reach into legacy pipeline artifacts, or create
ad-hoc JSON contracts. If Design wants a number that doesn't exist on
the feed, the fix belongs upstream in
`scripts/push-operator-feed.py` and the rebuild's contract doc — flag
it in `NOTES.md` and we'll route it to Codex.

---

*Living document. Both sides may propose edits via PR or by raising
back through Jacob. Canonical source: `_design_handoff/HANDOFF_PROTOCOL.md`
in `~/claude/claw-dashboard`. Last revised: 2026-04-19 (rev 2 —
canonical-location note, DEGRADATION ownership clarification, `Changes
since vN` requirement for revision packages).*
