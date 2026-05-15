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
3. A custom "Spec Kit Ticket" issue template exists in Linear in **two stages**:
   - **Intake shape** (what Jacob fills out when creating the ticket): four fields — Intent / problem, Done looks like, Constraints, Open questions. No file paths, data shapes, or sequence — those are for the agent to add.
   - **Build-ready shape** (what the spec-pass agent expands the ticket into before code starts): Requirements, Design, Tasks, Acceptance criteria, Open questions. Becomes the snapshot exported to `.specify/specs/<ticket>/` in the implementation PR.

   Template text is in §"Design notes → Spec Kit Linear issue template" below.
4. GitHub Spec Kit CLI is installed locally for Jacob. Per current Spec Kit docs (https://github.com/github/spec-kit, https://github.github.io/spec-kit/reference/core.html), install is:

   ```
   uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@<tag>
   ```

   Init inside each repo (Codex first, since the integration key is documented):

   ```
   specify init --here --integration codex --integration-options="--skills"
   ```

   For Claude-side init, run `specify version --features --json` to enumerate supported integration keys and pin the correct one, then run the equivalent `specify init --here --integration <claude-key>`. Each repo gains a `.specify/` directory with templates.
5. `LINEAR_API_KEY` is in OpenClaw env (for the digest cron) and in any agent that needs to read tickets.

### 4b — OpenClaw daily digest cron

6. A cron entry on Jacob's WSL fires `openclaw digest` at 17:30 ET on weekdays (skip weekends).
7. The digest reads: Linear tickets created/closed/updated in the last 24h, recent PRs across `claw-dashboard` + `vires-numeris` + `OpenClaw-s-Brain` + `youtube-content`, OpenClaw inbox, recent state-file changes in trading-bot.
8. Output: (a) Telegram message to claude-claw topic with the 3-5 most-important items, (b) full digest appended to `~/.openclaw/workspace/daily/<YYYY-MM-DD>.md` (Obsidian-bound by later HOUSEKEEPING work).
9. Telegram brief format: terse, mobile-readable, no unnecessary headers. Match OpenClaw's existing message style. Brief stays under 1000 chars; anything longer belongs in the markdown daily log.
10. Telegram brief ordering — "Needs Jacob" first, not chronology first:
    1. Production / security / account-risk blockers
    2. Failed CI / smoke / broken deploys
    3. PRs ready for Jacob merge or review
    4. Merged PRs and real shipped progress
    5. Linear tickets newly blocked / created
    6. Inbox + notes
    7. Open-PR drift (no recent activity)

### 4c — Cyrus routing (explicitly optional, gated on missed-event recovery)

**Gate before any 4c work starts:** Cyrus reacts to Linear webhooks. WSL is only powered on while Jacob's machine is on, so any Cyrus deployment on WSL will miss events. One of the following must be true before Cyrus becomes load-bearing:

- **(a) Documented polling/backfill mode in Cyrus.** Confirm in their docs that Cyrus can poll Linear on startup for `triaged + cyrus:* + no PR link` tickets it missed while offline, OR
- **(b) Our own reconciliation wrapper.** A 1-2 minute periodic job runs alongside Cyrus, scans Linear for `triaged + cyrus:* + no PR link` tickets older than N minutes, and re-enqueues them via the same trigger Cyrus uses.

If neither is easy, **ship 4a + 4b and defer 4c** — the workflow win is in Linear + Spec Kit + the digest cron, not in Cyrus specifically.

10. Cyrus self-hosted somewhere always-on (WSL service for the spike, VPS for durability).
11. Linear ticket state `triaged` + label `cyrus:claude` → Cyrus spawns Claude Code worktree on `claw-dashboard`.
12. Linear ticket state `triaged` + label `cyrus:codex` → Cyrus spawns Codex worktree on `vires-numeris`.
13. Worktree completes work, opens PR, comments back to Linear ticket with PR URL.
14. One demonstrated end-to-end Cyrus run (any small ticket, any agent) proves the path — including a re-enqueue test after a deliberate Cyrus restart, to prove the gate above.

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

Two stages so the intake friction stays low and the build-ready quality stays high. Jacob fills the first stage when creating the ticket; the spec-pass agent expands the ticket into the second stage as its first action, *before* writing any code.

**Stage 1 — Intake (Jacob writes when filing the ticket):**

```markdown
## Intent / problem
What's broken or missing? Plain English, no jargon required.

## Done looks like
What would you point at to say "yes, that fixed it"? Can be vague
("trading page feels less cramped") — the spec-pass agent will sharpen it.

## Constraints
Hard musts / must-nots. Deadlines, can't-break, must-look-like-X.
Leave blank if none.

## Open questions
What you're already unsure about. The agent will answer or ask back.

---
**Repo:** claw-dashboard | vires-numeris | other
**Agent:** cyrus:claude | cyrus:codex | manual
**Priority:** hi | lo
**Time-box:** N hours/days (estimate; agent may revise during spec-pass)
```

**Stage 2 — Build-ready (spec-pass agent expands the ticket into this before `in-progress`):**

```markdown
## Intent / problem
(carried over from intake, lightly clarified)

## Requirements
Specific, testable. Derived from intake's "Done looks like" + constraints.

## Design
File paths, data shapes, sequence. Agent's proposed implementation.

## Tasks
- [ ] Dependency-ordered checklist

## Acceptance criteria
- [ ] How we know it's done (each item testable / observable)

## Open questions
For Jacob to answer before build starts. When this list is empty, ticket
moves to `in-progress` and the agent starts coding.

## Cross-agent review (when applicable)
The other agent's `[claude]` / `[codex]` review of this spec-pass.
Captures critique, scope-risk flags, or LGTM. If there's a disagreement
neither agent can resolve, surface to Jacob explicitly.

---
**Repo / Agent / Priority / Time-box:** (carried over, agent may revise)
```

The Stage 2 expansion is what Spec Kit exports to `.specify/specs/<ticket>/` in the implementation PR, so the repo gets the versioned snapshot at the point work begins.

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

`LINEAR_API_KEY` reuse across all four locations is a **spike-only bootstrap**, not the durable credential model. One key is acceptable to prove 4a/4b end-to-end; after that, split credentials by surface:

- **Cyrus identity** should prefer a Linear OAuth/app credential (Cyrus self-host setup already expects a Linear OAuth app). That removes Cyrus comments from Jacob's personal-key trail.
- **OpenClaw digest** and **per-repo GHA jobs** should each get their own scoped API key (or app-token) once 4a/4b are working. One rotation surface is convenient; one key everywhere is a blast-radius problem.
- **During the spike**, if a real OAuth/app identity isn't easy, every comment Cyrus posts back to Linear or GitHub must carry a stable `[cyrus-bot]` prefix and the resulting "this looks like Jacob but is actually a bot" debt must be logged in the deferred-housekeeping ledger.

Do **not** purchase a separate human seat just to give bots an identity. Linear's free tier currently lists unlimited members plus API/webhook access; if bot-seat semantics turn out to cost a seat anyway, revisit at that point.

## Tasks (dependency-ordered)

### 4a — Linear + Spec Kit baseline

1. **Provision Linear workspace** (Jacob, ~10 min): sign up at linear.app, create `vires` workspace, create projects (`claw-dashboard`, `vires-numeris`, optional `infra`).
2. **Generate Linear API key** (Jacob): Settings → API → Personal API Keys → create with read/write scope.
3. **Bootstrap script** (Claude): `scripts/bootstrap-linear-env.sh` reads `LINEAR_API_KEY` from temp file, writes to OpenClaw env + GitHub Secrets on both repos.
4. **Create Spec Kit issue template** (Jacob via Linear UI, or Claude via Linear API): one template per project that drops the markdown template above into new issues.
5. **Install Spec Kit CLI** (Jacob, ~5 min):

   ```
   uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@<tag>
   ```

   Pick `<tag>` from the spec-kit releases page; pin it in `docs/linear-workflow.md` so re-installs are reproducible. Then per repo:

   ```
   cd ~/claude/claw-dashboard
   specify version --features --json   # enumerate supported integration keys
   specify init --here --integration codex --integration-options="--skills"   # for Codex worktrees
   specify init --here --integration <claude-key>                              # claude key from the version --features output
   ```

   Same for `vires-numeris` once it's clonable locally (Codex can run his half from his end).
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
- [ ] OpenClaw digest cron firing at 17:30 ET weekdays, Telegram + markdown working, Telegram brief ordered "Needs Jacob first" per §4b item 10
- [ ] Cyrus running OR explicit deferral logged with reason (4c skipped is fine if fighty)
- [ ] Cyrus path: §4c missed-event-recovery gate either documented as met (Cyrus polling/backfill confirmed in their docs) or covered by our own reconciliation wrapper
- [ ] If Cyrus runs: one end-to-end test ticket → PR, including a re-enqueue test after a deliberate Cyrus restart
- [ ] `docs/linear-workflow.md` documents the spec contract
- [ ] No new tickets filed as TICKET-*.md or queue.md after the Linear cutover date

## Codex resolutions (closed 2026-05-14)

These were the five open questions raised when the spec was opened. Codex answered them on PR #24 (https://github.com/jacobbarkley/claw-dashboard/pull/24#issuecomment-4455610230); the answers are folded back here so this doc stays canonical.

1. **Cyrus self-host stability on WSL → resolved by the §4c gate above.** Webhook replay is not confirmed in current public Cyrus docs (https://github.com/cyrusagents/cyrus, https://www.atcyrus.com/docs/how-cyrus-knows). Treat Cyrus as a spike, not the durable router. The §4c "missed event recovery" gate is the durable requirement.
2. **Spec Kit + Linear source of truth → Linear is operational, repo spec is the snapshot.** Linear issue owns current requirements / open questions / status. When a ticket becomes build-ready, the agent exports/creates the repo spec under `.specify/specs/...` (or `specs/...`) in the same PR that implements the ticket. The PR links back to Linear. No long-lived duplicate spec; code review still gets a versioned artifact.
3. **Agent identity in Linear → prefer Linear OAuth/app credential.** Cyrus's self-host setup already expects a Linear OAuth app, so use that path if it isn't fiddly. If it is fiddly, fall back to Jacob's personal key tagged with `[cyrus-bot]` prefix on every comment and log the debt — explicitly **not** a permanent state. Do not buy a separate human seat for bots.
4. **OpenClaw digest content scoring → "Needs Jacob" first, not chronology first.** Priority order: production/security/account-risk blockers > failed CI/smoke or broken deploys > PRs ready for Jacob merge/review > merged PRs and real shipped progress > Linear tickets newly blocked/created > inbox/notes > open-PR drift. Telegram = 3-5 item executive brief under 1000 chars. Markdown daily log carries the full trail.
5. **Cyrus and auto-merge → Cyrus never merges; spawned sessions may auto-merge under the existing rule.** Cyrus itself opens PRs only. A spawned Claude/Codex session may apply the existing agent-auto-merge rule once the PR is open and checks are green, and only for categories the rule already allows (doc-only / routine / production-effect-neutral). The PR / Linear comment must say "auto-merged by agent under rule X." Anything touching env, auth, private data, trading runtime, production deploys, or contract/data plumbing waits for Jacob.

## Out-of-band: what Jacob needs to do

1. Sign up for Linear at linear.app (free tier or $8 Plus, free is enough to start).
2. Create workspace `vires`, projects `claw-dashboard` + `vires-numeris` (+ optional `infra`).
3. Settings → API → Personal API Keys → generate a key with read/write scope.
4. Drop the key into a temp file:
   ```
   LINEAR_API_KEY=<paste>
   ```
5. Run `bash scripts/bootstrap-linear-env.sh ~/linear-spike-secrets.txt`.
6. Install Spec Kit CLI:

   ```
   uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@<tag>
   ```

   (Pick `<tag>` from https://github.com/github/spec-kit/releases — pinned in `docs/linear-workflow.md`.)
7. Inside `~/claude/claw-dashboard`:

   ```
   specify version --features --json    # see supported integration keys
   specify init --here --integration codex --integration-options="--skills"
   specify init --here --integration <claude-key>   # use whatever key the version --features output shows
   ```

(Vires-numeris Spec Kit init waits until you have a local clone of that repo, or Codex runs it from his end.)

Cyrus install and OpenClaw digest cron implementation are agent work — Jacob just needs to file the first test Linear ticket once Cyrus is up.
