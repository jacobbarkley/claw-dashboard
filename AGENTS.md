# Claw Dashboard - Codex Session Primer

This file is loaded automatically by Codex sessions in this repo. Keep it
short, current, and pointed at the durable source-of-truth docs.

Last updated: 2026-05-02

## What this is

The Vercel-hosted Vires Capital / ClawBoy operator surface. It is a Next.js,
Tailwind, and shadcn/ui app for reviewing trading state, research-lab work,
bench runs, promoted strategies, and operator-facing decision surfaces.

This app is a thin operator surface, not a second trading system. It displays
source-of-truth artifacts produced elsewhere; it must not invent trading logic,
promotion semantics, or ad hoc JSON contracts in page-local code.

## First files to read

Before meaningful work, read:

- `CLAUDE.md` - standing dashboard primer and ownership boundaries
- `_design_handoff/HANDOFF_PROTOCOL.md` - design-to-code handoff rules
- `_design_handoff/DIVERGENCE_LOG.md` - known drift patterns to avoid
- `_design_handoff/CODEX_PRIORITY_QUEUE_2026-05-01.md` - current Research Lab
  priority queue

For task-specific work, read the relevant `_design_handoff/CODEX_PRIMER_*.md`
or feature handoff folder. Do not bulk-load the whole folder; pick the primer
that matches the surface or contract being changed.

## Setup

Use this repo as a separate Codex project from `trading-bot`.

Recommended setup command:

```bash
npm install
```

Common commands:

```bash
npm run lint
npm run build
npm run dev
```

`npm install` runs the `prepare` script, which activates `.githooks/`.

## Source-of-truth boundary

The trading dashboard reads one operator-feed artifact:

```text
data/operator-feed.json
  -> app/api/trading/route.ts
  -> dashboard/UI components
```

If the UI needs a field that does not exist, do not derive it from nearby
fields just to make the page work. Update the producer and contract together:

- producer: `scripts/push-operator-feed.py` in this repo
- contract: `docs/architecture-rebuild/13-operator-feed-contract.md` in the
  `trading-bot` repo

The trusted phase-1 feed sections are `source_context`, `account`, `positions`,
`pipeline_status`, and `operator`. Legacy continuity sections such as `kpis`,
`daily_performance`, `equity_curve`, `watchlist`, `exit_candidates`, `options`,
`hedges`, and `bps` are transitional unless the contract says otherwise.

## Ownership boundaries

Claude / design owns primary visual and UX direction, especially the main
operator surfaces and `components/trading-dashboard.tsx`.

Codex owns backend contracts, source-of-truth plumbing, producer scripts,
Research Lab runners/projections/rollups, durable job state, and verification
that rendered UI truth matches emitted artifacts.

Do not make visual changes to `components/trading-dashboard.tsx` from a Codex
session unless Jacob explicitly asks for that UI work or a handoff calls for it.
When a design handoff exists, match the prototype and its state specs; do not
improvise semantics.

## Handoff discipline

For any `_design_handoff/` package, read its:

- `DATA_PRIMER.md` for exact source fields and meanings
- `UX_CHECKLIST.md` for what each element shows and does not show
- `DEGRADATION.md` for empty, loading, stale, and error states
- `NOTES.md` when present

If a package is ambiguous, missing degradation behavior, or names a field that
does not exist, flag that before shipping. Append `DIVERGENCE_LOG.md` when
implementation drift or a reusable handoff lesson is discovered.

## Trading and research safety rules

- Do not create a second dashboard truth or alternate JSON contract.
- Do not couple frontend pages directly to legacy trading-state artifacts.
- Do not silently ship production with preview/demo feed data; production feeds
  must have `source_context.mode = "canonical"`.
- Do not change trading logic, promotion logic, approval semantics, or mode
  semantics inside the dashboard.
- Contract changes must include data plumbing in the same slice. Do not ship
  structure-only fields that render as null because the producer was not wired.
- For Research Lab or bench work, state sleeve coverage explicitly:
  STOCKS / OPTIONS / CRYPTO. Mark out-of-scope sleeves clearly.
- Tests must not make live external calls to Vercel, GitHub, AI providers,
  brokers, Telegram, Discord, or other services. Mock or fixture those paths.

## Current product focus

The active product track is the Vires Research Lab / Idea Factory:

- Unified Spec Builder v2
- durable Talon draft jobs
- strategy reference model
- job and campaign result truth surfaces
- promotion/passport/operator-loop clarity

Use `_design_handoff/CODEX_PRIORITY_QUEUE_2026-05-01.md` for ordering unless
Jacob gives a newer priority.
