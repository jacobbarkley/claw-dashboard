# AGENTS.md — claw-dashboard

Agent-neutral primer. Anything stricter or session-specific lives in
`CLAUDE.md` (Claude sessions) or in `_design_handoff/*` (cross-agent
durable handoffs).

## What this repo is

The Vercel-hosted operator surface for the ClawBoy / Vires trading
system. Next.js + Tailwind + shadcn/ui. Auto-deploys on push to `main`.

Live URL: https://claw-dashboard-kappa.vercel.app

This is a **thin operator surface, not a second source of truth.**
It reads `data/operator-feed.json` (and `data/guided/*` for the Guided
slice) via `/api/*` route handlers. It does not invent trading logic
or create ad hoc JSON contracts.

## Ownership boundaries

- **Claude (Opus)** — visual / UX work, especially `components/vires/`,
  `components/trading-dashboard.tsx`, `app/globals.css`, and the
  `_design_handoff/` narrative.
- **Codex** — backend contracts and runtime under
  `~/.openclaw/workspace/trading-bot/`, the operator-feed and Guided
  data producers (`scripts/push-operator-feed.py`,
  `scripts/push-guided-data.py`), and the dashboard's runtime contract
  mirrors when contract shape changes.
- **OpenClaw** — Telegram gateway, cron orchestration, message delivery.

When you need a new field surfaced on a UI surface, the fix usually
belongs in the producer / contract, not in page-local logic here. Add
it to the upstream contract first, then wire the dashboard.

## How to test locally

```bash
# typecheck
npx tsc --noEmit -p .

# production build
npm run build

# dev server (with Guided user-state reads if rebuild is on disk)
export GUIDED_LOCAL_REBUILD_PATH=$HOME/.openclaw/workspace/trading-bot/state/rebuild_latest/guided
npm run dev
```

`GUIDED_LOCAL_REBUILD_PATH` is **dev-only**. It must never be set in
production environments. User-state Guided artifacts live under that
path; the dashboard has no production private store yet.

## Where to find docs

- `CLAUDE.md` — session primer for Claude sessions in this repo.
- `_design_handoff/VIRES_PRODUCT_MAP_2026-05-07.md` — the five product
  lanes (Guided / Advanced+Lab / Strategy Generation / Data Platform /
  Live Trading Readiness) and the sequencing principle.
- `_design_handoff/CLAUDE_PHASE6_*` — Guided Phase 6 wiring + Audit 1
  notes.
- `_design_handoff/HANDOFF_PROTOCOL.md` — design handoff package format.
- `docs/architecture-rebuild/` (in trading-bot, not here) — backend
  architecture, operator feed contract, mode/promotion policy.

## Standing principles (apply across agents)

- **No second source of truth.** The dashboard reads producer artifacts;
  it does not invent contracts.
- **No UI-invented trading semantics.** If a surface needs data the
  contract doesn't carry, fix the contract upstream — don't simulate
  it in a component.
- **PII / secrets stay out of git.** No user-specific regulated state
  in `data/` or anywhere else committed. Public/static curated content
  (strategy library definitions, disclosure templates, schema docs,
  non-user fixtures) is fine.
- **Evidence is a typology, not a strength score.** Never collapse
  multi-axis evidence into a single performance number — applies to UI,
  marketing, App Store description, landing page copy.
- **Vocabulary discipline.** "Enrollment" = Guided. "Sandbox /
  assignment" = Advanced. Different concept families, different state
  machines, different words across UI / contracts / code / routes / tables.
- **Validation does not equal permission.** User-created Lab strategies
  are private by default; broader use requires the explicit contribution
  / license flow described in the product map.
- **No quiet deferral.** If a slice ships preview, mock, single-tenant,
  non-persistent, or otherwise non-final behavior, update
  `_design_handoff/VIRES_DEFERRED_OBLIGATIONS_LEDGER_2026-05-08.md`
  with the tier, trigger, and closure evidence before merging.
- **Audits are hard events, not optional.** Each audit checkpoint
  produces a writable handoff in `_design_handoff/`. Skipping one means
  the next inherits its findings as already-overdue.

## Risky actions

Same posture as `CLAUDE.md`. Reversible local actions (edits, tests)
are fine; anything affecting `main`, the deployed Vercel app, the live
operator feed, or shared producer state warrants explicit confirmation
before acting. No `--no-verify`, no force pushes to main, no skipping
hooks.
