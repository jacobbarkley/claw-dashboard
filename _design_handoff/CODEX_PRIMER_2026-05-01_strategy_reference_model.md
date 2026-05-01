# Codex Primer — Strategy reference model for new ideas

**Date:** 2026-05-01
**From:** Claude (Opus 4.7), per Jacob's request
**For:** Codex
**Scope:** Replace the binary "use registered strategy / + new strategy
(code pending)" toggle on the new-idea form with a single, honest model:
**every idea writes new code, optionally derived from one or two reference
strategies.** Backend contract change required. UI change is small once
the contract is firm.

---

## §1 — The reframe (Jacob's words, lightly cleaned)

> Each new idea is going to be a new piece of code. If it's based off a
> strategy, it should be able to just take that and make some deltas to
> it instead of having to rebuild from scratch. For example, if I wanted
> to make a new strategy off regime-aware momentum where I upgraded to
> 8 stocks instead of 6, I would do "new strategy" but I should be able
> to **reference** the regime-aware momentum strategy.

Translation:

- The current chip toggle (`use registered strategy` XOR `+ new strategy
  (code pending)`) is hiding the truth that every idea is its own code.
- The honest variable isn't "are we using an existing strategy?" — it's
  **"what are we starting from?"**
- Lineage is data we want anyway: future grouping, strategy family
  trees, "which ideas derived from regime-aware momentum?" filters all
  fall out for free.

What this means downstream:

- **There is no fast lane for "run an existing strategy as-is."** That
  flow stops being an idea. It becomes a campaign config on the
  existing strategy. We need to confirm this is OK with you (see §7).
- **Every idea holds until its code lands.** Today, picking a
  registered strategy makes an idea immediately submittable. Under the
  new model, the implementation gate applies universally. Slower, but
  more honest — an idea without code-to-write is just a re-run.

---

## §2 — Contract change

### What's added

A new field on `IdeaV2` (or call it `IdeaV3` if you want a clean
schema bump — your call):

```ts
/**
 * Strategies this idea derives from. Purely informational + lineage —
 * does NOT drive routing. routing still flows through strategy_ref.
 *
 * Cardinality: 0–2.
 *   0 = blank-slate idea, no parent
 *   1 = single-parent delta (the common case — "regime-aware momentum
 *       but with 8 stocks")
 *   2 = combination idea ("regime-aware momentum + sentiment overlay")
 *
 * Each entry MUST resolve to a registered strategy_id in
 * backtest/bench/strategy_registry.json. This is a hard constraint;
 * we don't reference unregistered or pending strategies as parents.
 */
reference_strategies?: ReferenceStrategy[] | null

interface ReferenceStrategy {
  strategy_id: string  // Registry join key
  /** Optional one-liner: what we're keeping vs what we're changing.
   *  Free-form, max ~280 chars. Surfaced to Talon as draft seed. */
  delta_note?: string | null
}
```

### What dies

The old `code_pending` flag (already deprecated in v2 in favor of
`strategy_ref.kind`). And conceptually, the binary "I'm using strategy
X" pattern. But `strategy_ref` itself stays — it's the right shape for
"what is THIS idea's strategy" (NONE → SPEC_PENDING → REGISTERED).

### What stays the same

- `strategy_ref: StrategyRefV2` — still the routing pointer. New ideas
  start at `kind: "NONE"`, move to `SPEC_PENDING` once the operator (or
  Talon) drafts a spec, and become `REGISTERED` once the implementation
  loop lands a preset.
- `strategy_family` — derive from `strategy_ref.strategy_id` once
  registered, same as today.

So the relationship is:

```
strategy_ref          → "this idea's eventual strategy" (one pointer, evolves)
reference_strategies  → "what this idea derives from"  (0–2 immutable refs)
```

---

## §3 — Migration

Existing ideas in the data store fall into three buckets after coercion:

1. **v1 with `strategy_id` set, `code_pending: false`** — coerced to
   `strategy_ref.kind = REGISTERED`. Under the new model, these are
   "running an existing strategy as-is." See §7 — we may want to
   either (a) auto-promote them to a self-reference
   (`reference_strategies = [{ strategy_id }]`, `strategy_ref.kind = NONE`)
   so they land in the implementation queue, or (b) leave them as
   REGISTERED and let them be the last cohort that bypasses the new
   gate. Your call — I lean toward (b) for now to avoid retroactively
   breaking the autopilot pickup flow.

2. **v1 with `code_pending: true`** — already coerced to
   `SPEC_PENDING` or `NONE`. These line up perfectly with the new
   model (`reference_strategies = []`).

3. **v2 ideas already written under the current shape** — a handful at
   most. Add `reference_strategies = null` and move on; the field is
   optional.

No data rewrite required. The new field is optional on read, populated
on write going forward.

---

## §4 — Routing impact

This is the part to walk through carefully — touchpoints I can find
from a grep:

- `app/api/research/ideas/route.ts` (POST) — add
  `reference_strategies` parsing + validation (each `strategy_id` must
  exist in the registry).
- `app/api/research/ideas/[id]/transitions/route.ts` — the READY gate
  today checks `strategy_ref.kind !== "REGISTERED"`. Under the new
  model, the gate becomes "spec is APPROVED + preset is registered"
  rather than "strategy_ref is already pointing at a preset." I think
  this gate is already correct (it's just a stricter `kind` check),
  but worth confirming.
- `app/api/research/specs/draft-with-talon/route.ts` — Talon should
  read `reference_strategies` and inject the parents' specs into its
  prompt as the seed. This is the big payoff — instead of starting
  from a blank thesis, Talon starts from "regime-aware momentum, but
  the operator wants these deltas." Much higher first-draft quality.
- `app/api/research/ideas/[id]/promotion/route.ts` — the
  `kind === "REGISTERED"` check stays valid; ideas can still promote
  once their own strategy lands.
- Autopilot pickup (your side, in trading-bot) — confirm the queue
  reader keys off `strategy_ref` not `reference_strategies`. The
  references are seed data for Talon, not a routing target.

---

## §5 — UI side (Claude will build, no dependency on you)

Once the contract is firm, the new-idea form changes:

- **Remove** the `Strategy mode` chip toggle and the `Strategy`
  dropdown (the registered-strategy picker), and the `Code-pending
  capture` gold panel.
- **Add** a new `Reference strategies (optional)` row: a chip-add
  picker that selects 0–2 registered strategies from the registry,
  each with an optional `delta note` textarea ("changing universe to
  top-8-by-volume", "swapping the exit rule").
- **Implicit code-pending**: every new idea is implicitly
  `strategy_ref.kind = NONE`. The form no longer asks the operator to
  choose; the model decides.
- The "Held until the strategy is written" gold panel becomes the
  default state for *every* new idea (relaxed copy: "This idea will
  enter the implementation queue once submitted. It can't run until
  the delta-code lands.").

The "Use registered strategy" semantics survive only as the lineage
edge — picking a reference is no longer "I'm using this," it's "I'm
starting from this."

---

## §6 — What this unlocks long-term

Stating these so we don't accidentally design them out:

- **Strategy family trees.** `reference_strategies` is a graph edge.
  Eventually we render a "regime-aware momentum lineage" view: every
  idea, spec, preset, and passport that traces back to that root.
- **Sort/filter by lineage.** "Show me all ideas derived from
  apewisdom_meme_velocity" becomes a one-line query.
- **Talon learns by family.** When Talon drafts a spec, it can pull
  exemplars from sibling ideas in the same lineage — "here's what
  worked for the last delta on regime-aware momentum, here's what
  didn't."
- **Combination ideas are a real shape.** Two parents = explicit
  acknowledgment that we're crossing strategies. The data model
  stops papering over it.

---

## §7 — Open questions for you

1. **Schema bump?** Add `reference_strategies` to `IdeaV2`, or cut a
   v3 to keep v2's shape stable for any consumers already pinned?
   I'm fine either way — you know better what's reading v2 today.

2. **Do "run existing strategy on a new universe" flows still go
   through the idea form?** My read: no. That's a campaign config on
   an existing `strategy_ref.kind === REGISTERED` strategy, not an
   idea. The idea form is for "I'm writing new code." If you agree,
   we should make sure the campaign-spawn UI can take a registered
   strategy + new universe/era directly, without round-tripping
   through ideas. (May already be possible — I haven't traced it.)

3. **Existing REGISTERED ideas** (migration bucket 1 in §3) — leave
   them as the last cohort that bypasses the implementation gate, or
   auto-promote them to self-reference + reset `strategy_ref.kind` to
   NONE? I lean leave-them-alone; you may have a stronger view if
   the autopilot pickup or campaign spawn assumes they exist.

4. **Two-reference ceiling** — is `0–2` the right cap, or should we
   allow N? My instinct is 2, because anything beyond that starts to
   look like a meta-strategy and the operator should think harder
   about what they're doing. But if you have a use case for 3+, say so.

5. **Validation surface** — do reference `strategy_id` values get
   validated at write time (POST /api/research/ideas) or also on read
   (in case the registry changes underneath us)? I'd default to
   write-time only and let stale references show a "registry miss"
   chip on read, similar to how we treat stale era refs.

---

## §8 — Sequencing

This is a contract-first change. Suggested order:

1. **You:** add `reference_strategies` to `IdeaV2` (or cut v3),
   wire validation into POST /api/research/ideas, plumb the field
   through the loaders, decide migration policy on existing
   REGISTERED ideas. Update Talon's draft-with-talon prompt to
   inject parent specs as seed.
2. **Me:** rebuild the new-idea form (chip-add reference picker, drop
   the strategy-mode toggle, relaxed code-pending copy).
3. **Together:** spot-check that the autopilot pickup and campaign
   spawn flows still route correctly.

Estimated UI work after contract lands: half a day. Most of the
existing form survives — Title / Thesis / Sleeve / Tags / Spec
expander / Status / Promotion all stay as-is. Only the strategy-mode
+ strategy-dropdown block is replaced.

---

If anything here doesn't match your model of how `strategy_ref` is
flowing today, say so — I worked from the contract file + a grep over
the dashboard side, not from your trading-bot internals. Push back on
§4 and §7.1/7.3 hardest if you see something I'm missing.
