# Codex session primer

> **Last refresh:** 2026-05-17
>
> This file is the durable handoff to a fresh Codex CLI session on the Vires
> acceleration plan. Refresh it whenever Jacob starts a new Codex chat. The
> shape is deliberate: most-important behavioral shift at the top, then state,
> then ranked next actions. Edit in-place — git history is the version trail.

## The big shifts — read before anything else

### Bridge convention (canonical since 2026-05-14, proven multiple cycles)

The Claude ↔ Codex bridge is no longer Jacob copy-pasting between sessions.
Both agents now read each other's PR comments directly via `gh` and reply on
the PR. Convention is at `docs/agent-comments-convention.md` (on `main`).

Required first read:

```
cd /home/jacobbarkley/claude/claw-dashboard
git fetch origin
git show origin/main:docs/agent-comments-convention.md
```

Every comment you post on any PR starts with `[codex]` as the first tag. When
you `gh pr view <n> --comments`, the `[claude]` prefix is how you know it's
Claude. Jacob posts bare.

### Linear is now operational work intake (set up 2026-05-16)

Linear workspace `vires` is fully provisioned:

- Team: `Vires` (single team, default)
- Projects: `claw-dashboard`, `vires-numeris`
- Issue statuses: `Backlog → Triaged → In Progress → In Review → Done`. **Triaged is the agent-pickup trigger.**
- Intake template: "Spec Kit Ticket — Intake" (4 long-text fields — Intent, Done looks like, Constraints, Open questions). Scoped to Vires team.
- `LINEAR_API_KEY` mirrored to: vires-numeris GH Secrets, claw-dashboard GH Secrets, OpenClaw env (`~/.openclaw/openclaw.json` at `env.LINEAR_API_KEY`).
- **Native Linear ↔ Codex integration is ACTIVE** (Jacob connected it 2026-05-16). You can read/write Linear tickets natively; you do not need to fetch the API key for normal ticket interactions.

When you pick up work, the source of truth is **the Linear ticket**, not chat. The ticket holds intent + constraints + open questions; you expand it into the Stage-2 build-ready shape (Requirements / Design / Tasks / Acceptance criteria) as your first action, before writing any code.

### Three-tier merge rule (codified 2026-05-15 — see `feedback_agents_merge_routine_prs.md` on Claude side, mirrored conceptually here)

- **Tier 1 — Routine, auto-merge.** Doc-only / env-gated / production-effect-neutral + CI green + reviewer LGTM + no scope drift. Agent runs `gh pr merge --squash --delete-branch` directly.
- **Tier 2 — Confirmation needed.** Production-affecting (auth, data path, money, contracts). Agent posts a `[codex]` summary of "what activates on merge, what doesn't" + asks Jacob "ready to merge — green light?", then runs the merge command on his yes. Jacob never clicks merge himself.
- **Tier 3 — Judgment.** Scope disagreement, blocking review neither agent can resolve, decision not in originating spec. Surface the actual question to Jacob.

## Repos

- Backend / vires-numeris: `/home/jacobbarkley/.openclaw/workspace/trading-bot`
- Dashboard: `/home/jacobbarkley/claude/claw-dashboard`

## First 60 seconds

```
cd /home/jacobbarkley/.openclaw/workspace/trading-bot && git status -sb && \
  gh pr list --repo jacobbarkley/vires-numeris --state open \
    --json number,title,headRefName,updatedAt

cd /home/jacobbarkley/claude/claw-dashboard && git status -sb && \
  gh pr list --state open --json number,title,headRefName,author,updatedAt

# Linear queue — pickup-ready tickets in your projects
# (uses native integration; no need to read the key)
```

## Acceleration plan state

- **Step 1 autonomous smoke** — shipped + proven. Manual tunnel/env loop dead.
- **Step 2 Supabase RLS spike** — **FULLY MERGED to main, end-to-end.** vires-numeris PR #3 + claw-dashboard PR #27 both on main. Two RLS rows seeded (canonical `jacobbarkley95@gmail.com` + E2E `jacobbarkley95+e2e@gmail.com`). Dashboard reads from Supabase under `GUIDED_READ_STORE=supabase` on Vercel Preview.
- **Step 3 WorkOS auth spec** — merged. Not yet implemented.
- **Step 4 Linear + Spec Kit + OpenClaw digest spec** — **MERGED** with your three tightenings (Spec Kit CLI → `uv tool install`, §4c gated on missed-event recovery, `LINEAR_API_KEY` spike-only) + two-stage Linear template (intake-shape Jacob writes, build-ready shape agent expands during spec-pass).

## Open PRs (volatile — re-fetch with `gh pr list`)

### vires-numeris #2 — guided t1 projection endpoint adapter

- Was open before Step 2 spike. Stacked.
- May need re-evaluation given Step 2 changed the dashboard's read path (now goes through Supabase under the flag instead of an HTTP projection endpoint). Decide whether the adapter still belongs in the queue, supersedes part of Step 2, or should close.
- **Action:** triage this; comment a `[codex]` decision on the PR.

All other recent PRs (#3 vires-numeris; #27, #24, #28, #29 claw-dashboard) are merged.

## Supabase project

- URL: https://gcynmgnzicwpibywfcal.supabase.co (project: `vires-rls-spike`, free tier, us-east-1).
- **Architectural debt:** project uses ECC P-256 as Current Key; the spike rides the legacy HS256 secret as Previous Key. When Supabase revokes the legacy key, the HS256 minter breaks. Target: Supabase Auth as issuer or ES256. Decision deferred until the Step 3 WorkOS auth cutover. **Do not solve unless explicitly assigned.**

## Backend verification commands for past Step 2 work

```
cd /home/jacobbarkley/.openclaw/workspace/trading-bot
PYTHONPATH=src .venv-rebuild/bin/python3 -m pytest -s \
  tests/openclaw_core/test_supabase_spike.py \
  tests/openclaw_core/test_guided_real_profile.py --tb=short
PYTHONPATH=src .venv-rebuild/bin/python3 -m vires_numeris.cli \
  supabase-spike-write --dry-run
```

Last green: **9 passed**, dry-run emits `enrollment_jacob_paper_main_active`.

## Local caveats

- `trading-bot` has an untracked `AGENTS.md` that pre-existed as local context. Do not add it unless Jacob explicitly asks.
- `claw-dashboard` has no in-flight worktree dirt.
- `uv` (`~/.local/bin/uv`) and `specify` (`~/.local/bin/specify`) are installed locally for the Spec Kit toolchain. Per-repo `specify init` not yet run — Claude has it queued as part of her next PR (`linear-workflow.md` + bootstrap + Spec Kit init).
- OpenClaw daily digest cron (Step 4b) is **not yet implemented** — owned by OpenClaw, not you, but flag any backend signal you want surfaced.

## Likely next-action ranking

1. **HOUSEKEEPING-004 — Supabase migration runner GHA on vires-numeris.** Spec at `claw-dashboard/_design_handoff/DEFERRED_HOUSEKEEPING_TICKETS_2026-05-13.md`. Goal: stop manual Supabase SQL Editor apply. Use proper migration credentials, **not** the service-role key in dashboard runtime — service-role is data access, not DDL migration authority. A Linear ticket for this will exist in your `vires-numeris` project under Triaged when you start (Claude is creating it as the first real ticket through the new system).
2. Triage vires-numeris PR #2 — keep, rebase, or close.
3. Step 4 implementation is in motion on Claude's side. Coordinate via PR comments if your work touches the same area (linear-workflow.md, bootstrap-linear-env.sh, per-repo Spec Kit init).
4. Future: Step 4b digest plugin is OpenClaw's; Step 4c Cyrus is gated until missed-event recovery proven.

## Non-negotiables (your own — unchanged across refreshes)

- Do not touch production env without Jacob approval.
- Do not paste secrets into chat or git.
- No live Alpaca / Resend / Vercel / Supabase calls in tests.
- Dashboard is a thin reader. If a field is missing, fix producer/contract upstream.
- Do not claim cutover complete just because a spike passes.
- Jacob owns production approval and merge judgment for risky changes (Tier 2/3 per the merge rule).
