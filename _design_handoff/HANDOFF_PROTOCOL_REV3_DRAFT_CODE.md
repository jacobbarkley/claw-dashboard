# Handoff Protocol — Rev 3 Amendment (Code's draft)

**Status:** Draft for three-way reconciliation. Design is drafting in
parallel. Jacob merges both into the canonical
`HANDOFF_PROTOCOL.md` rev 3.

**Scope of amendment:** Introduce a two-tier handoff structure
(Express vs Full), the bidirectional tier-trigger criteria, the
refusal path, and tier-miscall logging. Other parts of the rev 2
protocol stand unchanged.

---

## Motivating problem

The Tracked Assets package (rev 2's first end-to-end run) was
appropriately rigorous for that surface — divergence-log entry,
disputed positions/intent split, deferred contract dependency. But
applying the same five-file treatment to typical card-level work is
overkill, and an over-ceremony protocol gets cut corners or skipped
entirely. The amendment right-sizes by tiering by *semantic weight*,
not by surface count.

The non-goal: weakening the anti-drift content. The five-file format
isn't what protected us on Tracked Assets — the **"Does NOT show"
column, the field-level primer, and explicit empty/error specs**
were. Those primitives must survive into the express lane intact;
only their packaging changes.

---

## New Part 1.5 — Tier selection

Two handoff tiers. Design picks the tier when assembling. Code can
refuse a tier choice during review (see Refusal path below).

### Express lane

A single file: `CHANGES.md`, plus the prototype itself (which can
be the entire current design project as a zip if multiple surfaces
moved together). No separate `DATA_PRIMER`, `UX_CHECKLIST`,
`DEGRADATION`, `NOTES`.

`CHANGES.md` is structured — three required sections per surface
touched, regardless of how small the change feels. If a change
doesn't have enough semantic weight to fill these three sections
meaningfully, it probably doesn't need a handoff at all (Design
edits the prototype, Jacob ships it directly to Code with a chat
message, no package needed).

**Required sections in `CHANGES.md` (per surface touched):**

```markdown
## <surface name>

### What changed
One paragraph. Visual, copy, data, interaction — name what moved.

### Shows / Does NOT show
For any element where intent is non-obvious or could plausibly
read multiple ways:
- **<element>** shows: <thing>. Does NOT show: <other plausible thing>.

### Data fields touched
For any element that newly reads, stops reading, or changes which
field it reads:
- `<element>` reads `<exact JSON path>` — <one-line semantic>.
```

Optional fourth section per surface: **States** — only required
when a new empty / loading / error state is introduced. Spec the
UX intent per state (Design owns), Code reports back failure-mode
signals during review (carries from rev 2).

### Full package

Unchanged from rev 2. Five files: `prototype/`, `DATA_PRIMER.md`,
`UX_CHECKLIST.md`, `DEGRADATION.md`, `NOTES.md` (required for v2+).

Use when triggers fire (below).

---

## New Part 1.6 — Tier triggers

**Full package is required when any of these are true:**

1. The surface appears in `DIVERGENCE_LOG.md` (current or past
   entry — the log is the institutional memory of where drift
   already cost us, repeating the express lane on those surfaces
   invites re-drift).
2. The change touches a data semantic that has been disputed,
   structurally ambiguous, or carries a positions-vs-intent /
   user-vs-market split.
3. The change introduces multiple new states (≥2 of empty /
   loading / error / staleness / variant-by-mode) that need
   explicit specs.
4. The change has a deferred contract dependency on Codex (a
   needed field that doesn't exist on the operator feed yet).
5. Either party flags pre-emptively for any reason.

**If none of the above fire → express lane is correct.**

The trigger list is conservative on purpose. False positives
(unnecessary full packages) are cheaper than false negatives
(express lane on a surface that needed the full treatment). If
unsure, default to full.

---

## New Part 1.7 — Refusal path

Code reviews the express-lane `CHANGES.md` first. If Code identifies
that the change matches one or more triggers in Part 1.6, Code
replies with a **tier refusal**, structured as:

```
**Tier refusal — needs full package**
**Triggered by:** <numbered trigger from Part 1.6>
**Specifics:** <one paragraph naming the surface, the trigger
condition, and what content the express lane is missing>
**Requested:** full package per Part 2 of the protocol.
```

Refusal is **not adversarial** — it's tier correction. Design
re-packages with no Resolution required, no commit attempted from
the express version. The original `CHANGES.md` content can usually
be lifted into `NOTES.md` of the full package, so the work isn't
wasted.

Code's refusal must be issued *before* implementation starts. Once
Code has begun shipping against an express-lane drop, the choice is
made and any drift surfacing later goes through the standard
divergence log.

---

## New Part 3.5 — Tier-miscall logging

`DIVERGENCE_LOG.md` is extended to carry tier-miscall entries
alongside drift entries. Two reasons for one file: the calibration
data lives in the same place as the drift data, and over time the
correlation between miscalls and drift becomes legible (e.g.
"every miscalled express on the assistant panel produced drift").

Entries get an explicit **Type** field so the two are separable:

```
### YYYY-MM-DD — <feature or surface> — <one-line summary>

**Type:** drift | tier-miscall
**Prototype intent:** (drift only) what the design specified
**Shipped state:** (drift only) what landed
**Tier chosen:** (tier-miscall only) Express
**Tier needed:** (tier-miscall only) Full
**Trigger missed:** (tier-miscall only) <which Part 1.6 trigger
should have fired but didn't>
**Which is correct + why:** the truth + reasoning
**Resolution:** commit SHA, "queued for handoff <N>", or
"re-packaged as full" (tier-miscall)
**Lesson:** (optional) generalizable rule
```

Tier-miscalls don't always need a Lesson line. Many will be
one-offs. The pattern matters more than the individual entry —
once we see three miscalls citing the same trigger condition, the
trigger criteria themselves get tightened.

**A re-tier-up mid-implementation** (Code starts on express,
discovers ambiguity that should have triggered full) is logged as
a tier-miscall, then handled as Code's choice: continue with
clarifying questions, or formally request re-packaging. Both are
acceptable. The log captures it either way.

---

## Updates to existing parts (rev 2 → rev 3)

### Part 4 — Roles and responsibilities

Add to **Claude Design owns:**
- Choosing the handoff tier per Part 1.6 triggers
- For full packages, all rev 2 contents
- For express lane, structured `CHANGES.md` with required sections

Add to **Claude Code owns:**
- Honoring the tier choice if triggers don't fire
- Refusing the tier choice (per Part 1.7) if triggers do fire
- Appending tier-miscalls to `DIVERGENCE_LOG.md`

### Part 5 — Practical workflow

Replace step 1 with:

> **Design selects the tier** per Part 1.6 triggers, then assembles:
> - **Express:** `CHANGES.md` + prototype (or full project zip).
> - **Full:** the five-file package per Part 2.

Insert new step between current 4 and 5:

> **Code reviews tier choice first.** If express lane was chosen
> but a Part 1.6 trigger fires, Code issues a tier refusal per
> Part 1.7 *before* implementation starts. Otherwise proceeds.

### Part 6 — Anti-patterns

Add three:

- **Express lane with vague `CHANGES.md`.** "Polished a few cards"
  is not a handoff. Required sections must carry real content.
- **Skipping the protocol entirely for "small" changes.** If a
  change has any semantic weight at all, it goes through one of
  the two tiers. The "no package needed" exit is reserved for
  trivial edits with no data, intent, or state implications.
- **Silent tier upgrade.** If Code starts implementing express and
  realizes mid-stream that full was needed, log the tier-miscall.
  Don't pretend it was full all along.

### Part 7 — One rule above all others

Unchanged.

---

## Open questions for reconciliation

Things I've left ambiguous deliberately, expecting Design's draft
or Jacob's ratification to resolve:

1. **Zip-of-current-project vs prototype-folder for express lane.**
   I left "prototype itself" in the express lane spec without
   forcing Design to ship the full project zip every time. The
   zip is heavier on Code's diffing work (no `Changes since v1`
   section to lean on). Design may have a stronger preference.
   Lean: support both, let Design choose per drop.

2. **Refusal SLA.** Should there be an expectation on how quickly
   Code refuses (e.g. before any implementation work)? My draft
   says "before implementation starts" but that's a soft gate.
   Could be tighter.

3. **Tier-miscall threshold for tightening triggers.** I wrote
   "three miscalls citing the same trigger." Arbitrary —
   Jacob/Design may want a different number or a different
   trigger-tightening process.

4. **Whether the full Part 2 stays unchanged or also gets a
   light edit.** Rev 2's `NOTES.md`-required-for-v2+ rule
   probably wants a parallel rule for express → full upgrade
   packages. Out of scope for this draft, flagging it.

---

*End of Code's rev 3 draft. Ready for Jacob to merge against
Design's draft.*
