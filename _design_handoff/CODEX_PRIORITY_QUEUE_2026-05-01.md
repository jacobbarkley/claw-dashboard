# Codex Priority Queue — Research Lab / Idea Factory

**Date:** 2026-05-01
**Status:** Living queue. Update as new build lessons surface.
**Standing review rule:** Codex should continue spawning Claude-style review/audit passes for meaningful backend or contract work before finalizing, especially around Talon, StrategySpec, worker queues, promotion, and multi-tenant boundaries.

## Progress Reconciliation - 2026-05-02

The queue below is now partially landed:

- Items 1-2 are implemented enough for the first production slice: Unified
  Builder contract types, `builder_state`, durable Talon draft jobs, polling,
  cancellation, clarification answers, draft patching, Apply, persisted
  provenance, and beginner-mode UI exist on disk.
- Item 3 remains a bridge/stability rule; no major new current work expected.
- Item 4 now has a dashboard-side flag slice:
  `VIRES_LAB_STRATEGY_REFERENCES` exposes reference-strategy selection on
  idea create/edit for non-registered ideas. New flagged ideas write as new
  code work with optional 0-2 parent references; existing registered ideas are
  left alone.
- Item 5 is landed on the trading-bot side: `reference_strategies` and
  builder-state references are accepted by the Pydantic models and dashboard
  spec reader tests cover `experiment_plan` compatibility.
- Item 6 is already implemented at `/vires/bench/lab/run-strategy`.

Item 7 is now partially advanced: approved specs already create implementation
queue artifacts, and this reconciliation slice added a lifecycle endpoint for
`claim`, `start`, and `finish` plus richer queue metadata in the idea thread.
Remaining item-7 work is worker/drain automation and any operator-facing list
view Jacob wants beyond the per-idea thread. Item 8 is now landed for new
operator/manual spec drafts: the server seeds a valid-ish experiment-plan
template instead of persisting `experiment_plan: null`.

Item 9 is now partially advanced: Talon already injects indexed strategy
lessons/exemplars into the durable draft prompt, and this slice added
`/api/research/specs/talon-context` so an operator or worker can inspect the
loaded prompt context and record a new durable lesson after a failed/repaired
run. Remaining item-9 work is an automatic failed-run miner or a richer UI
for turning job outcomes into lessons.

## Active Queue

1. **Unified Spec Builder v2 contract + UX slice** — collapse "AI-made" vs "operator-authored" into one guided builder: structured choices, bounded dropdowns, plain-language notes, Talon clarification, deterministic validation, and a final normalized StrategySpec + ExperimentPlan.
2. **Talon Draft v2 durable jobs, adapted to the builder** — Upstash live job state, scoped polling, validation/repair loop, cancellation, final GitHub audit/spec persistence. This now carries builder decisions + open questions, not just a raw thesis prompt.
3. **Keep current Talon sync path stable as bridge** — only break/fix; no major new investment.
4. **Strategy reference model UI rollout** — build picker behind flag; wait for trading-bot `reference_strategies` compatibility before broad production writes.
5. **Trading-bot `reference_strategies` compatibility** — land Pydantic/model ingestion patch so dashboard ideas round-trip cleanly.
6. **Direct campaign launcher for existing registered strategies** — preserve "run existing strategy as-is" outside the idea/spec path.
7. **Phase E manual implementation loop visibility** — claim/finish lifecycle for approved specs, queue state surfaced in UI.
8. **Operator-draft experiment-plan seed** — operator-authored specs should start with a valid-ish empty plan template, not `experiment_plan: null`.
9. **Talon quality loop** — lessons file, exemplar library, known-good/known-bad strategy pairs, continuous prompt improvement from failed runs.
10. **Experiment-plan contract polish** — era selection, evidence thresholds, decisive verdict rules, submit/approve validation placement.
11. **SGOV runtime bank behavior** — trading-bot sells SGOV to fund buys before refusing insufficient cash; SGOV excluded from strategy risk/sizing.
12. **SGOV strategy-only sleeve history** — operator feed emits strategy-only history or per-symbol history so stocks charts can exclude SGOV honestly.
13. **Ape Wisdom / app-originated strategy follow-through** — rerun with better era/window clarity, inspect result, decide if plumbing-only or strategy-improvable.
14. **Job page polish follow-ups** — keep improving run anatomy, verdict explanation, and Trade Atlas placement.
15. **Campaign-level Trade Atlas** — decide headline variant/winner/top-N behavior, then mount atlas on campaign detail.
16. **Worker automation / cron drain** — remove manual "Codex drains worker" pattern for single-user app flow.
17. **Promotion to Autonomous Paper in-app flow** — make campaign → passport/playbook → autonomous paper explicit and operator-friendly.
18. **Vercel AI Gateway migration** — observability, provider routing/failover, cost tracking after durable Talon jobs are stable.
19. **Cloud Design / visual refinement pass** — after the loop works, beautify the full Idea → Spec → Job → Campaign → Passport flow.
20. **Multi-user architecture pass** — auth, tenancy, namespace hardening, user-scoped jobs/artifacts.
21. **Marketing/demo readiness** — once single-user loop is real, prep the YouTube/product walkthrough path.

## Current Top Item

Move **Experiment-plan contract polish** to the top now that operator-drafted
specs seed experiment-plan templates and Talon has an indexed lesson capture
surface. The next slice should tighten era selection, evidence thresholds,
decisive verdict rules, and submit/approve validation placement.

## Builder Mode Direction

The product should stop presenting "AI-made spec" and "operator-authored spec" as two separate worlds. The operator builds one idea through a guided workspace; the system collects structured fields, bounded choices, and plain-language notes; Talon/programmatic normalization turns that into the canonical StrategySpec + ExperimentPlan; deterministic validators decide whether it is runnable, incomplete, blocked, or needs clarification.

Beginner / intermediate / advanced modes are a UI layer over the same contract: beginner shows more guidance and recommended defaults, intermediate is compact with editable assumptions, advanced exposes more knobs such as sweep ranges, era sets, benchmark modes, and data requirements.
