# Codex Priority Queue — Research Lab / Idea Factory

**Date:** 2026-05-01
**Status:** Living queue. Update as new build lessons surface.
**Standing review rule:** Codex should continue spawning Claude-style review/audit passes for meaningful backend or contract work before finalizing, especially around Talon, StrategySpec, worker queues, promotion, and multi-tenant boundaries.

## Active Queue

1. **Talon Draft v2 durable jobs** — Upstash live job state, scoped polling, validation/repair loop, cancellation, final GitHub audit/spec persistence.
2. **Keep current Talon sync path stable as bridge** — only break/fix; no major new investment.
3. **Strategy reference model UI rollout** — build picker behind flag; wait for trading-bot `reference_strategies` compatibility before broad production writes.
4. **Trading-bot `reference_strategies` compatibility** — land Pydantic/model ingestion patch so dashboard ideas round-trip cleanly.
5. **Direct campaign launcher for existing registered strategies** — preserve "run existing strategy as-is" outside the idea/spec path.
6. **Phase E manual implementation loop visibility** — claim/finish lifecycle for approved specs, queue state surfaced in UI.
7. **Operator-draft experiment-plan seed** — operator-authored specs should start with a valid-ish empty plan template, not `experiment_plan: null`.
8. **Talon quality loop** — lessons file, exemplar library, known-good/known-bad strategy pairs, continuous prompt improvement from failed runs.
9. **Experiment-plan contract polish** — era selection, evidence thresholds, decisive verdict rules, submit/approve validation placement.
10. **SGOV runtime bank behavior** — trading-bot sells SGOV to fund buys before refusing insufficient cash; SGOV excluded from strategy risk/sizing.
11. **SGOV strategy-only sleeve history** — operator feed emits strategy-only history or per-symbol history so stocks charts can exclude SGOV honestly.
12. **Ape Wisdom / app-originated strategy follow-through** — rerun with better era/window clarity, inspect result, decide if plumbing-only or strategy-improvable.
13. **Job page polish follow-ups** — keep improving run anatomy, verdict explanation, and Trade Atlas placement.
14. **Campaign-level Trade Atlas** — decide headline variant/winner/top-N behavior, then mount atlas on campaign detail.
15. **Worker automation / cron drain** — remove manual "Codex drains worker" pattern for single-user app flow.
16. **Promotion to Autonomous Paper in-app flow** — make campaign → passport/playbook → autonomous paper explicit and operator-friendly.
17. **Vercel AI Gateway migration** — observability, provider routing/failover, cost tracking after durable Talon jobs are stable.
18. **Cloud Design / visual refinement pass** — after the loop works, beautify the full Idea → Spec → Job → Campaign → Passport flow.
19. **Multi-user architecture pass** — auth, tenancy, namespace hardening, user-scoped jobs/artifacts.
20. **Marketing/demo readiness** — once single-user loop is real, prep the YouTube/product walkthrough path.

## Current Top Item

Move **Talon Draft v2 durable jobs** to the top until the idea-generation loop is reliable. The sync endpoint stays alive as a bridge, but durable jobs are the product-quality path.
