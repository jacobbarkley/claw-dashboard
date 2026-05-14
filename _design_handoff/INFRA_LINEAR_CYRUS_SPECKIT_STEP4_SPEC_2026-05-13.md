# INFRA — Linear + Cyrus + Spec Kit + OpenClaw Digest Step 4

**Date:** 2026-05-13
**Owner:** Claude (lead) + Codex (review) + OpenClaw (digest cron owner)
**Time-box:** 2 days hard cap
**Tracks acceleration plan:** Step 4 of 5 (final slice)
**Depends on:** Steps 1-3 landing (autonomous smoke + RLS + auth). Step 4 can begin in parallel with Step 3 build for the non-Cyrus pieces.

## Goal

Retire the bespoke ticketing/orchestration loop (TICKET-*.md in OpenClaw-s-Brain + queue.md + manual handoff chats) and replace it with industry-standard tooling:

- **Linear** as the single ticketing surface — spec queue, status board, assignment.
- **GitHub Spec Kit** as the per-ticket spec format — requirements / design / tasks markdown sections, structured and machine-readable.
- **Cyrus** as the BYOK router that watches Linear, spawns agent worktrees on tickets, and reports back via PR.
- **OpenClaw daily digest cron** at 17:30 ET — composes a brief from Linear + recent PRs + state files, sends to Telegram, appends to a markdown daily log (Obsidian-bound later via HOUSEKEEPING work).

After Step 4, the 6-hour Jacob-roundtrip per slice is dead. Spec is the contract, not the conversation. Jacob files a Linear ticket; an agent picks it up; a PR shows up for review; the daily digest tells him what happened.

## Requirements (acceptance criteria)

### 4a — Linear + Spec Kit baseline

1. Linear workspace `vires` exists with Jacob as workspace owner.
2. Two Linear projects exist: `claw-dashboard` (frontend/UX) and `vires-numeris` (backend/trading core). Optional third project `infra` for cross-cutting work.
3. A custom "Spec Kit Ticket" issue template exists in Linear with sections: **Requirements**, **Design**, **Tasks**, **Acceptance criteria**, **Open questions**.
4. GitHub Spec Kit CLI is installed locally for Jacob (`pipx install specify-cli && specify init --here --ai claude-code` inside each repo). Each repo gains a `.specify/` directory with templates.
5. `LINEAR_API_KEY` is in OpenClaw env (for the digest cron) and in any agent that needs to read tickets.

### 4b — OpenClaw daily digest cron

6. A cron entry on Jacob's WSL fires `openclaw digest` at 17:30 ET on weekdays (skip weekends).
7. The digest reads: Linear tickets created/closed/updated in the last 24h, recent PRs across `claw-dashboard` + `vires-numeris` + `OpenClaw-s-Brain` + `youtube-content`, OpenClaw inbox, recent state-file changes in trading-bot.
8. Output: (a) Telegram message to claude-claw topic with the 3-5 most-important items, (b) full digest appended to `~/.openclaw/workspace/daily/<YYYY-MM-DD>.md` (Obsidian-bound by later HOUSEKEEPING work).
9. Telegram brief format: terse, mobile-readable, no unnecessary headers. Match OpenClaw's existing message style.

### 4c — Cyrus routing (optional, defer if fighty)

10. Cyrus self-hosted somewhere always-on (WSL service for the spike, VPS for durability).
11. Linear ticket state `triaged` + label `cyrus:claude` → Cyrus spawns Claude Code worktree on `claw-dashboard`.
12. Linear ticket state `triaged` + label `cyrus:codex` → Cyrus spawns Codex worktree on `vires-numeris`.
13. Worktree completes work, opens PR, comments back to Linear ticket with PR URL.
14. One demonstrated end-to-end Cyrus run (any small ticket, any agent) proves the path.

### Across all three sub-slices

15. **Zero production changes during the spike.** Linear + Cyrus + digest are operational tools, not product behavior.
16. **No secrets through chat.** `LINEAR_API_KEY`, Cyrus tokens, etc. all land via bootstrap script.

## Out of scope for Step 4

- **Linear paid features beyond the spike.** Initiatives, cycles, custom views, roadmap — adopt as need emerges, not as part of the spike.
- **SLA tracking / time logs / automation rules in Linear** — defer.
- **Multi-user Linear** — Jacob is the only human user; agents act as bots/integrations, not human seats.
- **Migration of historical TICKET-*.md / queue.md content.** That's HOUSEKEEPING-003 in `DEFERRED_HOUSEKEEPING_TICKETS_2026-05-13.md` — runs after Step 4 lands.
- **Cyrus production-grade deployment.** VPS migration is post-spike. WSL hosting is fine for proving the pattern.
- **Devin / Factory / other agent platforms.** Cyrus is BYOK and self-hostable; we don't want vendor lock for the agent layer.
- **Obsidian vault integration of the daily digest.** Captured in HOUSEKEEPING-Obsidian (still to scope). The digest writes to `~/.openclaw/workspace/daily/` for now; Obsidian sync follows.

## Constraints

- **Linear is the single ticket source of truth post-Step 4.** TICKET-*.md + queue.md become read-only archives (HOUSEKEEPING-003 migrates content).
- **Spec Kit format is mandatory** for new tickets that ask an agent to do non-trivial work. Trivial tickets ("fix typo on page X") don't need the full template.
- **Cyrus runs as `jacobbarkley` user on WSL** for the spike. SSH keys + gh CLI auth + Anthropic/OpenAI API keys live in that user's env. No service-account split yet.
- **Daily digest is OpenClaw-owned.** Don't fork the cron logic across agents. OpenClaw composes; everyone else writes raw data.
- **Telegram brief stays under 1000 chars.** Anything longer goes to the markdown daily log.
- **Cyrus must not auto-merge.** PR review/merge stays with Jacob (or Claude/Codex under the agent-auto-merge rule for routine doc-only). Cyrus opens PRs only.

## Design notes

### Linear workspace shape

```
Workspace: vires
├── Project: claw-dashboard
│   ├── Teams: jacob (owner)
│   ├── Labels: cyrus:claude, spec:ux, spec:backend, priority:hi, priority:lo
│   └── States: backlog → triaged → in-progress → in-review → done
├── Project: vires-numeris
│   ├── Labels: cyrus:codex, spec:backend, priority:hi, priority:lo
│   └── States: same
└── Project: infra (cross-cutting, e.g. acceleration plan)
    └── Labels: cyrus:claude, cyrus:codex
```

### Spec Kit Linear issue template

```markdown
## Requirements
What does "done" look like? Specific, testable.

## Design
How are we going to do it? File paths, data shapes, sequence.

## Tasks
- [ ] Dependency-ordered checklist

## Acceptance criteria
- [ ] How we know it's done

## Open questions
For Codex/Claude/Jacob to answer before build starts.

---
**Repo:** claw-dashboard | vires-numeris | other
**Agent:** cyrus:claude | cyrus:codex | manual
**Priority:** hi | lo
**Time-box:** N hours/days
```

### Cyrus deployment shape (spike-grade)

```
WSL: jacobbarkley user
├── cyrus daemon (systemd --user)
│   ├── Watches Linear API for triaged + cyrus:* labels
│   ├── On trigger: git worktree add ~/cyrus-worktrees/<ticket-id> <branch>
│   ├── Spawns: claude --print < spec.md  OR  codex run < spec.md
│   ├── Agent makes changes in worktree, commits, pushes branch
│   └── Cyrus opens PR via gh, comments on Linear ticket with PR URL
```

### OpenClaw daily digest cron

```bash
# crontab -e (jacobbarkley user)
30 17 * * 1-5 /home/jacobbarkley/.openclaw/bin/digest-daily.sh
```

`digest-daily.sh` invokes `openclaw digest --since 24h --output telegram+markdown`. Implementation lives in OpenClaw plugins. Reads:

- Linear: `gh api /api/graphql` against Linear's GraphQL with the saved API key. Filter on `updatedAt > now() - 24h`.
- PRs: `gh pr list --repo jacobbarkley/<repo> --state all --search "updated:>=<24h ago>"` for each tracked repo.
- OpenClaw inbox: `~/.openclaw/workspace/claude-inbox.md` recent entries.
- Trading state: spot-check `state/rebuild_latest/eod_summary.json` for KPI delta.

### Env vars

| Where | Var | Value | Scope |
|---|---|---|---|
| OpenClaw config | `LINEAR_API_KEY` | from Linear → Settings → API → Personal API Keys | local |
| GitHub Secrets (claw-dashboard) | `LINEAR_API_KEY` | same | repo-wide (for any GHA that needs it) |
| GitHub Secrets (vires-numeris) | `LINEAR_API_KEY` | same | repo-wide |
| Cyrus config | `LINEAR_API_KEY` | same | local |
| Cyrus config | `ANTHROPIC_API_KEY` | for Claude Code agents | local |
| Cyrus config | `OPENAI_API_KEY` | for Codex agents | local |
| Cyrus config | `GITHUB_TOKEN` | gh CLI token, repo + PR scopes | local |

`LINEAR_API_KEY` is reused across all four locations — single rotation rotates everywhere.

## Tasks (dependency-ordered)

### 4a — Linear + Spec Kit baseline

1. **Provision Linear workspace** (Jacob, ~10 min): sign up at linear.app, create `vires` workspace, create projects (`claw-dashboard`, `vires-numeris`, optional `infra`).
2. **Generate Linear API key** (Jacob): Settings → API → Personal API Keys → create with read/write scope.
3. **Bootstrap script** (Claude): `scripts/bootstrap-linear-env.sh` reads `LINEAR_API_KEY` from temp file, writes to OpenClaw env + GitHub Secrets on both repos.
4. **Create Spec Kit issue template** (Jacob via Linear UI, or Claude via Linear API): one template per project that drops the markdown template above into new issues.
5. **Install Spec Kit CLI** (Jacob, ~5 min): `pipx install specify-cli` then `cd ~/claude/claw-dashboard && specify init --here --ai claude-code` and same for `vires-numeris` once it's clonable locally.
6. **Documentation** (Claude): `docs/linear-workflow.md` — how tickets flow, what goes in each Spec Kit section, when to use Cyrus labels.

### 4b — OpenClaw daily digest cron

7. **Digest plugin** (OpenClaw): implement `openclaw digest --since 24h --output telegram+markdown`. Reads Linear (GraphQL), PRs (`gh`), inbox, trading state. Composes terse Telegram brief + verbose markdown daily log.
8. **Cron entry** (OpenClaw): `crontab -e` with `30 17 * * 1-5 /home/jacobbarkley/.openclaw/bin/digest-daily.sh`. Wrapped in a runner script with lock + log (same pattern as YouTube story agent).
9. **First successful digest** (validation): trigger manually, verify Telegram delivery + markdown file written.

### 4c — Cyrus routing (deferable)

10. **Install Cyrus** (Claude): clone Cyrus repo, install per their README on WSL.
11. **Cyrus config** (Claude): set Linear API key + Anthropic + OpenAI + GitHub tokens. Configure label → agent routing.
12. **Systemd user service** (Claude): `~/.config/systemd/user/cyrus.service` so it survives reboots when WSL is running.
13. **Test ticket** (Jacob + Claude): file a small test ticket in Linear with label `cyrus:claude`, watch Cyrus spawn a worktree, verify PR opens.

## Risk + abort

- **Day 2 no green** → narrow to 4a + 4b. Cyrus is the optional bit; Linear + Spec Kit + OpenClaw digest alone already retire most of the bespoke loop. Ship those, defer Cyrus to HOUSEKEEPING.
- **Cyrus self-host friction** → fall back to Linear's native AI integrations (Linear Asks, Sequence assignments) and manual ticket-to-agent handoff. Even without Cyrus, the spec discipline is the win.
- **Linear free tier limits** ($8 Plus needed for some integrations?) → eat the $8/mo; the workflow ROI dwarfs the cost.
- **OpenClaw digest noisy** (>5 items in Telegram brief) → tune the priority filter, push more to the markdown daily log.
- **Telegram delivery flaky** (it's been before) → markdown daily log is the source of truth; Telegram is the notification surface.

## Linked obligations

- Closes **HOUSEKEEPING-003 trigger** — Linear migration starts after this slice lands (per ticket file in `_design_handoff/`).
- Enables Step 4 of acceleration plan to retire the manual-spec-kickoff loop.
- Unblocks future closure of `LAB-TQ-EXISTING-TALON-WORK-INTEGRATION` (branch archaeology becomes a Linear ticket, not a chat).
- Sets up Obsidian integration scoping pass (markdown daily log → vault sync).

## Definition of done

- [ ] Linear `vires` workspace exists with at least 2 projects
- [ ] Spec Kit issue template wired in Linear
- [ ] Spec Kit CLI installed in claw-dashboard (vires-numeris when local clone exists)
- [ ] `LINEAR_API_KEY` in OpenClaw env + GitHub Secrets via bootstrap script
- [ ] OpenClaw digest cron firing at 17:30 ET weekdays, Telegram + markdown working
- [ ] Cyrus running OR explicit deferral logged with reason (4c skipped is fine if fighty)
- [ ] If Cyrus runs: one end-to-end test ticket → PR
- [ ] `docs/linear-workflow.md` documents the spec contract
- [ ] No new tickets filed as TICKET-*.md or queue.md after the Linear cutover date

## Open questions for Codex

1. **Cyrus self-host stability on WSL.** Cyrus needs to be always-on to catch Linear webhooks. WSL is only on when Jacob's PC is on. Acceptable for spike, but: does Cyrus support webhook replay (catch up on missed events), or does it need to poll? If poll-only, fine for spike; if webhook-only and replay isn't supported, we'll miss events.
2. **Spec Kit + Linear issue template overlap.** Spec Kit's CLI creates markdown files in the repo. Linear's issue body holds the same content. Source of truth conflict: do we keep specs in Linear (operational) and let Spec Kit format the export, or do we keep specs in the repo (versioned) and embed Linear ticket as the operational tracker?
3. **Agent identity in Linear.** When Cyrus opens a PR, the PR comment back to Linear is made by... whose API key? Recommendation: use a dedicated `cyrus-bot` Linear seat (free for bots). Confirm Linear's bot-seat semantics — if bots cost a seat, this changes the calculus.
4. **OpenClaw digest content scoring.** With 4 repos + Linear + trading state + inbox, the digest could be overwhelming. What's the priority filter? Suggested: critical state changes > merged PRs > new Linear tickets > inbox > open PRs. Codex weigh in.
5. **Cyrus and the auto-merge rule.** The agent-auto-merge feedback says Claude/Codex merge routine doc-only PRs themselves. Cyrus spawns Claude or Codex sessions. Does the rule transitively apply? Recommendation: yes, agents merge their own routine PRs even when spawned by Cyrus; Cyrus surfaces ones that need Jacob's judgment.

## Out-of-band: what Jacob needs to do

1. Sign up for Linear at linear.app (free tier or $8 Plus, free is enough to start).
2. Create workspace `vires`, projects `claw-dashboard` + `vires-numeris` (+ optional `infra`).
3. Settings → API → Personal API Keys → generate a key with read/write scope.
4. Drop the key into a temp file:
   ```
   LINEAR_API_KEY=<paste>
   ```
5. Run `bash scripts/bootstrap-linear-env.sh ~/linear-spike-secrets.txt`.
6. Install Spec Kit CLI: `pipx install specify-cli`.
7. Run `cd ~/claude/claw-dashboard && specify init --here --ai claude-code`.

(Vires-numeris Spec Kit init waits until you have a local clone of that repo, or Codex runs it from his end.)

Cyrus install and OpenClaw digest cron implementation are agent work — Jacob just needs to file the first test Linear ticket once Cyrus is up.
