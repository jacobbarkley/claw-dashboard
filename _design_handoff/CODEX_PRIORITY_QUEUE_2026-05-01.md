# Codex Priority Queue — Research Lab / Idea Factory

**Date:** 2026-05-01
**Status:** Living queue. Update as new build lessons surface.
**Standing review rule:** Codex should continue spawning Claude-style review/audit passes for meaningful backend or contract work before finalizing, especially around Talon, StrategySpec, worker queues, promotion, and multi-tenant boundaries.

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

Move **Unified Spec Builder v2 contract + UX slice** to the top. This is intentionally a short alignment/design slice before heavy implementation: it defines what the durable Talon job must carry, what the operator chooses directly, what Talon clarifies, and what the backend validates. Durable jobs remain the product-quality execution path, but they should be built around this builder contract rather than around the brittle "raw thesis → perfect spec" shape.

## Builder Mode Direction

The product should stop presenting "AI-made spec" and "operator-authored spec" as two separate worlds. The operator builds one idea through a guided workspace; the system collects structured fields, bounded choices, and plain-language notes; Talon/programmatic normalization turns that into the canonical StrategySpec + ExperimentPlan; deterministic validators decide whether it is runnable, incomplete, blocked, or needs clarification.

Beginner / intermediate / advanced modes are a UI layer over the same contract: beginner shows more guidance and recommended defaults, intermediate is compact with editable assumptions, advanced exposes more knobs such as sweep ranges, era sets, benchmark modes, and data requirements.
