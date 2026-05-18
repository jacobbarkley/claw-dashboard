# Claude session primer

> **Last refresh:** 2026-05-18
>
> Durable handoff for a fresh Claude Code session. Edit in place; git history is the version trail. Companion to `docs/codex-session-primer.md` and the bridge convention.

## First read (in this order, 5 minutes total)

1. `MEMORY.md` (auto-loads on session start) — index of project + feedback memories.
2. `docs/agent-comments-convention.md` — Claude ↔ Codex PR comment protocol.
3. `docs/linear-workflow.md` — Linear intake / ticket flow / SPEC-PASS pattern.
4. `docs/codex-session-primer.md` — what Codex sees on his side; complementary view.

## Repos

- **claw-dashboard** (your primary surface): `~/claude/claw-dashboard`
- **vires-numeris** (Codex's primary surface — observe + review): `~/vires-numeris`
- **trading-bot** (Codex's other surface — mostly hands-off): `~/.openclaw/workspace/trading-bot`

## First 60 seconds

```
cd ~/claude/claw-dashboard && git status -sb && \
  gh pr list --state open --json number,title,headRefName,author,updatedAt

cd ~/vires-numeris && git status -sb && \
  gh pr list --state open --json number,title,headRefName,author,updatedAt

# OpenClaw inbox
tail -30 ~/.openclaw/workspace/claude-inbox.md
```

## Acceleration plan state

- **Step 1 autonomous smoke** — SHIPPED, in production.
- **Step 2 Supabase RLS spike** — SHIPPED end-to-end. Two RLS rows seeded (canonical `jacobbarkley95@gmail.com` + E2E `jacobbarkley95+e2e@gmail.com`). Dashboard reads Supabase under `GUIDED_READ_STORE=supabase` on Vercel Preview.
- **Step 3 WorkOS auth spec** — MERGED, not yet implemented.
- **Step 4 Linear + Cyrus + Spec Kit + OpenClaw digest:**
  - **4a (Linear + Spec Kit baseline)** — DONE.
  - **4b (OpenClaw daily digest cron)** — OpenClaw's surface; not started; not blocking us.
  - **4c (Cyrus routing)** — DEFERRED, gated on missed-event recovery proven.

## Linear is live as work intake (provisioned 2026-05-16/17)

- Workspace: `vires`
- Team: `Vires` (prefix `VIR`)
- Projects: `claw-dashboard`, `vires-numeris`
- Statuses: `Backlog → Triaged → In Progress → In Review → Done`
- Intake template: "Spec Kit Ticket — Intake" — 4 long-text fields: Intent, Done looks like, Constraints, Open questions
- Labels: Agent Routing (`claude-code`, `codex`), Surface (`backend`, `ux`)
- `LINEAR_API_KEY` mirrored to: OpenClaw config (`env.LINEAR_API_KEY`), claw-dashboard GH Secrets, vires-numeris GH Secrets
- Native Codex ↔ Linear integration: ACTIVE
- Linear API ticket creation pattern: see `_design_handoff/INFRA_LINEAR_CYRUS_SPECKIT_STEP4_SPEC_2026-05-13.md` + the VIR-5 example (`issueCreate` GraphQL mutation, GH-Secrets-only `LINEAR_API_KEY` reference)

## Landmark: VIR-5 / HOUSEKEEPING-004 (closed 2026-05-18)

First real ticket through the new Linear flow. End-to-end proof of: ticket created via API → Codex SPEC-PASS w/ 4 open questions → Claude cross-review → Jacob answers → Codex implements (PR #5) → Claude audits, requests docs amendment → Codex amends → PR #5 merged as `8bcc80c` → `SUPABASE_DB_URL` secret set on vires-numeris → workflow dispatched dry-run + apply → bootstrap migration `20260514000000_schema_migrations_ledger.sql` applied to live Supabase → `public.schema_migrations` ledger is operational → dashboard SQL Editor is emergency-only from this point.

Use this as the reference shape for future tickets through the system.

## Conventions in effect (read the docs above for full text)

### Bridge convention
- Both agents read each other's PR comments directly via `gh`. Jacob is not the copy-paste bridge.
- Every comment starts with `[claude]` or `[codex]` tag prefix. Jacob posts bare.

### Three-tier merge rule
- **Tier 1 (auto-merge):** doc-only / env-gated / prod-neutral + CI green + reviewer LGTM → run `gh pr merge --squash --delete-branch` directly.
- **Tier 2 (confirmation needed):** production-affecting (auth, data path, money, contracts, env credentials) → post a one-line summary of "what activates on merge, what doesn't" + ask Jacob for green light → agent runs the merge command on his yes. **Jacob never clicks merge himself.**
- **Tier 3 (judgment):** scope drift, blocking review, decision not in originating spec → surface the actual question.

### Decision delegation pattern
- **Technical nuance:** lay out tradeoffs and recommend; Jacob picks from a sharpened menu. Codex consult is fine.
- **Business / vision / brand:** stage the question WITHOUT a recommendation; Jacob researches and answers unbiased.

### Don't keep asking to wrap
- Default: surface next work, do NOT append "good stopping point?" / "want to call it?" / "wrap?" Jacob signals end-of-session himself.

## Open PRs (volatile — re-fetch with `gh pr list`)

- **claw-dashboard:** nothing open from Claude as of last refresh.
- **vires-numeris #2** — guided t1 projection endpoint adapter (Codex's stacked PR predating Step 2 spike). May need triage given Step 2 changed the dashboard's read path.

## Next move — app work pivot

The automation arc is DONE. Jacob has explicitly asked to pivot back to app work. Remaining automation items (4b OpenClaw digest, 4c Cyrus) are not blocking us and not on the immediate queue.

Options on the table (Jacob picks; do not assume):

1. **Guided T1 cleanup** — what Codex sequenced post-PR #5 merge: decline flow, maybe-later persistence, mandate-fit, write paths, exit surfaces, legal copy, private DB scoping. Multiple discrete tickets to file.
2. **Passport v2 known gaps** (2026-04-22 memory) — paper monitoring sleeve-level (not account-level), crypto gate adapter tests, allocation/contribution carousel.
3. **Lab redesign** (2026-04-27 memory) — reposition from buried 3rd tab to central premium feature, per-run multi-line equity graph.
4. **UI refinement broadly.**

When Jacob picks, file Linear intake tickets in the matching project. Do not start code until Jacob confirms.

## Key feedback memories (in `MEMORY.md` index — honor them)

- `feedback_agent_pr_comments_convention.md` — bridge.
- `feedback_agents_merge_routine_prs.md` — three-tier merge rule.
- `feedback_decision_delegation_pattern.md` — technical vs. business decisions.
- `feedback_stop_asking_to_call_it.md` — don't keep offering to wrap.
- `feedback_show_dont_tell.md` + `feedback_glanceable_ui.md` — UI taste guidelines.
- `feedback_multi_tenant_law.md` — every architectural choice must be App-Store multi-user compatible.

## Non-negotiables

- Do not touch production env without Jacob approval.
- Do not paste secrets into chat or git.
- No live Alpaca / Resend / Vercel / Supabase calls in tests.
- Dashboard is a thin reader. If a field is missing, fix producer/contract upstream — don't invent backend logic in the dashboard.
- Jacob owns production approval and merge judgment for risky changes (Tier 2/3 per the merge rule).
