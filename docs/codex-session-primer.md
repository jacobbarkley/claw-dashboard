# Codex session primer

> **Last refresh:** 2026-05-14
>
> This file is the durable handoff to a fresh Codex CLI session on the Vires
> acceleration plan. Refresh it whenever Jacob starts a new Codex chat. The
> shape is deliberate: most-important behavioral shift at the top, then state,
> then ranked next actions. Edit in-place rather than dating it — git history
> is the version trail.

## The big shift — read before anything else

The Claude ↔ Codex bridge is no longer Jacob copy-pasting between sessions.
Both agents now read each other's PR comments directly via `gh` and reply
on the PR. Convention is at `docs/agent-comments-convention.md` (added in
PR #28).

Required first read:

```
cd /home/jacobbarkley/claude/claw-dashboard
git fetch origin
git show origin/main:docs/agent-comments-convention.md 2>/dev/null || \
  git show origin/claude/agent-comments-convention:docs/agent-comments-convention.md
```

The rule that matters most: every comment you post on any PR starts with
`[codex]` as the first tag. Same in reverse — when you `gh pr view <n>
--comments`, the `[claude]` prefix is how you know it's Claude's voice and
not Jacob's. Jacob posts bare. No more chat-relay.

## Repos

- Backend / vires-numeris: `/home/jacobbarkley/.openclaw/workspace/trading-bot`
- Dashboard: `/home/jacobbarkley/claude/claw-dashboard`

## First 60 seconds

```
cd /home/jacobbarkley/.openclaw/workspace/trading-bot && git status -sb && \
  gh pr view 3 --repo jacobbarkley/vires-numeris \
    --json number,title,isDraft,mergeStateStatus,headRefName,baseRefName,comments

cd /home/jacobbarkley/claude/claw-dashboard && git status -sb && \
  gh pr list --state open --json number,title,headRefName,author,updatedAt
```

## Acceleration plan state

Refer to `_design_handoff/INFRA_*` for full specs. As of this refresh:

- **Step 1 autonomous smoke** — shipped + proven. Manual tunnel/env loop is
  dead.
- **Step 2 Supabase RLS spike** — backend (vires-numeris PR #3) proven end-
  to-end; dashboard half (claw-dashboard PR #27) open, awaiting Codex review.
- **Step 3 WorkOS auth spec** — merged with Codex's decisions.
- **Step 4 Linear + Cyrus + Spec Kit + OpenClaw digest spec** (claw-dashboard
  PR #24) — Claude folded the three tightening requests in commit `cb787db1`
  (Spec Kit CLI → `uv tool install`, §4c gated on missed-event recovery,
  `LINEAR_API_KEY` spike-only). Ready for re-review or merge.

## Open PRs and the action each wants from you

This list is volatile — re-fetch with `gh pr list` to confirm. At last
refresh:

### vires-numeris #3 — guided-supabase-rls-spike

- https://github.com/jacobbarkley/vires-numeris/pull/3
- Branch: `codex/guided-supabase-rls-spike`, base: `codex/guided-t1e-backend`
- Adds: `20260514010000_guided_enrollment_spike.sql`, `supabase>=2,<3`,
  `openclaw_core.stores.supabase_spike`, `supabase-spike-write` CLI, hermetic
  RLS proof tests.
- Live proof: comment-4447927930 (all 4 RLS legs verified by Claude).
- Seeded row: `user_sub=jacobbarkley95@gmail.com`,
  `scope_id=jacob_paper_main_default`,
  `enrollment_id=enrollment_jacob_paper_main_active`.
- **Action:** confirm mergeable from your side; self-merge if green.

### claw-dashboard #27 — Supabase RLS read store for Step 2 spike

- https://github.com/jacobbarkley/claw-dashboard/pull/27
- Branch: `claude/guided-supabase-read-store`
- Adds:
  - `@supabase/supabase-js` dep
  - `lib/guided-read-store.supabase.server.ts` — `SupabaseGuidedReadStore`;
    only `readGuidedEnrollmentView` is real, other 3 methods reject with
    `GuidedUserStateUnavailableError` so the other 4 preview specs keep
    passing untouched.
  - Factory flag in `lib/guided-data-source.server.ts` on
    `GUIDED_READ_STORE=supabase`.
  - `e2e/guided-preview/active.spec.ts` branches on the flag — asserts
    "Steady Tide" under the flag, configured-error otherwise.
  - `docs/supabase-rls-spike.md` (operator notes + HS256 → ES256 debt).
- `tsc` + lint clean locally. CI Preview will assert "Steady Tide" against
  Supabase end-to-end.
- **Action:** review. Post `[codex]` review comment(s) directly on the PR.

### claw-dashboard #24 — Step 4 spec

- https://github.com/jacobbarkley/claw-dashboard/pull/24
- Branch: `step4-linear-cyrus-speckit-spec`
- Tightenings landed in commit `cb787db1`. Codex's five answers folded into
  the doc as "Codex resolutions (closed 2026-05-14)".
- **Action:** re-review; approve/merge or post any remaining `[codex]` notes
  on the PR.

### claw-dashboard #28 — agent-comments-convention

- The bridge protocol itself.
- https://github.com/jacobbarkley/claw-dashboard/pull/28
- Branch: `claude/agent-comments-convention`
- **Action:** read it, follow it, post a `[codex]` LGTM (or request edits) on
  the PR. Doc-only; falls under the auto-merge rule once green.

### claw-dashboard #25 — JWT minter

- Already merged to main as `334e4725`.

## Supabase project

- URL: https://gcynmgnzicwpibywfcal.supabase.co (project: `vires-rls-spike`,
  free tier, us-east-1).
- **Architectural debt:** project uses ECC P-256 as Current Key; the spike
  rides the legacy HS256 secret as Previous Key. When Supabase revokes the
  legacy key, the HS256 minter breaks. Target: Supabase Auth as issuer or
  ES256. Decision deferred until the Step 3 WorkOS auth cutover. **Do not
  solve unless explicitly assigned.**

## Backend verification commands for PR #3

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

- `trading-bot` has an untracked `AGENTS.md` that pre-existed as local
  context. Do not add it unless Jacob explicitly asks.
- `claw-dashboard` has no in-flight worktree dirt — PR #24's tightenings are
  committed and pushed.

## Likely next-action ranking

1. Read `docs/agent-comments-convention.md` and start tagging your comments
   `[codex]`. This unblocks every subsequent step.
2. Review claw-dashboard PR #27 (Supabase read store, dashboard half). Post
   feedback directly on the PR.
3. Confirm claw-dashboard PR #24 tightenings address your three asks; LGTM
   or note remaining items on the PR.
4. Confirm vires-numeris PR #3 is mergeable from your side.
5. If asked for new work: **HOUSEKEEPING-004** — Supabase migration runner
   GitHub Action for vires-numeris. Spec at
   `claw-dashboard/_design_handoff/DEFERRED_HOUSEKEEPING_TICKETS_2026-05-13.md`.
   Goal: stop manual Supabase SQL Editor apply. Use proper migration
   credentials, not the service-role key in dashboard runtime. Service-role
   is data access, not DDL migration authority.
6. Step 4 implementation itself does not start until PR #24 is merged.

## Non-negotiables (Codex's own — unchanged across refreshes)

- Do not touch production env without Jacob approval.
- Do not paste secrets into chat or git.
- No live Alpaca / Resend / Vercel / Supabase calls in tests.
- Dashboard is a thin reader. If a field is missing, fix producer/contract
  upstream.
- Do not claim cutover complete just because a spike passes.
- Jacob owns production approval and merge judgment for risky changes.
