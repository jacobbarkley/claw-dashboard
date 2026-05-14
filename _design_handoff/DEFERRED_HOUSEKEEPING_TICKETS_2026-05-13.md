# Deferred Housekeeping Tickets — 2026-05-13

Three durable tickets captured during the acceleration-plan setup session. Each has a clear trigger, owner, and acceptance criteria so it can be picked up out-of-context.

---

## HOUSEKEEPING-001: YouTube Story Agent — Vires Narrative Expansion

**Trigger:** Available now. Low priority; can run any quiet window.
**Owner:** OpenClaw (already runs the nightly cron at `~/claude/youtube-content/agent/run-story-agent.sh`).
**Suggested cadence:** Apply once, observe 3-5 nightly runs, tune if needed.

### Problem

The story agent runs reliably (64 scripts generated, last SCRIPT-064 on 2026-05-12) but its source list is 100% trading-side. All five open narrative threads in `~/claude/youtube-content/story-arc.md` are trading stories. The biggest 6 weeks of Vires Capital product work — dashboard PRs, Guided/Lab build, vires-numeris backend, the 2026-05-13 acceleration plan, the agent-collaboration meta-arc — is invisible to it.

The agent's narrative engine is well-architected; the narrowness lives in two files only.

### Changes — additive, no removals

**File 1: `~/claude/youtube-content/agent/story-agent.md`**

1. **Identity (line 4)** — reframe from "OpenClaw trading pipeline journey" to:
   > "...mine the full Vires Capital build journey — Jacob building with Claude (UX/UI), Codex (backend), OpenClaw (ops). The journey now spans four tracks: trading bot rebuild, Vires Capital product (Guided + Lab + Advanced), dashboard UX work, and the agent-collaboration meta-arc."

2. **Primary sources (lines 10-14)** — add to the "MUST read" list:
   - `~/claude/claw-dashboard` git log — last 50 commits (dashboard PRs, Step 1/2/3 work)
   - `~/claude/claw-dashboard/_design_handoff/` — recent specs, primers, audits (44 docs)
   - `~/.claude/projects/-home-jacobbarkley/memory/` — recent files (cross-session decisions, plans, feedback)
   - `gh pr list --repo jacobbarkley/vires-numeris --limit 20` — Codex's backend work (no local clone)
   - `gh pr list --repo jacobbarkley/claw-dashboard --state merged --limit 30` — merged PR narratives

3. **Promote claude-inbox.md** from secondary to primary source.

4. **Story Types table (lines 33-43)** — add three new rows:
   | Type | Description | Target Length | Why It Works |
   |------|-------------|---------------|--------------|
   | AGENT_COLLAB | How Claude + Codex + OpenClaw + I solved X | 10-14 min | Nobody else has multi-agent collaboration stories |
   | PRODUCT_BUILD | Vires/Guided/Lab UI feature, design decision, UX iteration | 10-14 min | Non-trading product work, fills the trading-fatigue gap |
   | ACCELERATION | Strategic pivot: replacing bespoke infra with industry standards (WorkOS, Supabase, Linear) | 12-15 min | Build-less-integrate-more thesis, high-search content |

5. **Content Selection (line 28)** — add scoring criterion (e):
   > "(e) cross-track relevance — bonus weight for stories connecting multiple workstreams (trading + dashboard + agents)."

**File 2: `~/claude/youtube-content/agent/run-story-agent.sh`**

The inline `TASK_PROMPT` (lines 50-70) hardcodes "Read the last 50 git commits from ~/claude/OpenClaw-s-Brain." Add two parallel reads:

```
2. Read the last 50 git commits from each:
   - ~/claude/OpenClaw-s-Brain (git log --oneline -50)
   - ~/claude/claw-dashboard (git log --oneline -50)
3. Run gh pr list against jacobbarkley/vires-numeris (limit 20) and jacobbarkley/claw-dashboard (state merged, limit 30) for PR narratives
```

### Acceptance criteria

- [ ] Next 3 nightly runs produce at least one non-trading-primary story OR explicit reasoning in the log why trading remained the best choice that night.
- [ ] No regression: scripts still hit the 8+ min target, story-arc.md updates remain coherent, brand voice unchanged.
- [ ] `gh` calls in the run prompt succeed inside the cron environment (gh auth is set up for jacobbarkley user; the cron runs as same user).

### Risks + mitigation

- **Scope-creep wobble for a few runs** while the agent figures out broader sources. Mitigation: 1-script-per-run budget still holds.
- **Token cost increase** from larger source pool. Mitigation: model is `claude-sonnet-4-6`; cost increase per run is small. Re-evaluate after 1 week.
- **Trading stories crowded out** if cross-track stories score higher. Mitigation: trading remains 1 of 4 tracks, scoring criterion (e) is a *bonus*, not a discount on single-track stories.

### Out of scope

- Linear ticket integration (depends on HOUSEKEEPING-003).
- Obsidian vault delivery (separate scoping pass — both this and Obsidian will pull from the same content stream, design together later).

---

## HOUSEKEEPING-002: claw-dashboard → vires-dashboard rename

**Trigger:** After Step 4 of the 2026-05-13 acceleration plan lands (Linear + Cyrus + Spec Kit complete, quiet window for refactor).
**Owner:** Claude (initiate) + Codex (cross-repo coordinate). Jacob approves the cutover.

### Problem

Repo is named `claw-dashboard` from the early operator-surface era. Project is now Vires Capital. Name has drifted; should match the rest of the lexicon (`vires-numeris` backend, "Vires" product).

### Cascade — every place that references the old name

**GitHub:**
- Rename `jacobbarkley/claw-dashboard` → `jacobbarkley/vires-dashboard` (GitHub forwards the old URL automatically, but explicit redirect doc helps).

**Vercel:**
- Vercel project name (separate from repo name). Current preview URL pattern is `claw-dashboard-kappa.vercel.app`. Decide: rename project + accept URL change, OR keep project slug and only rename internal label.
- Project ID `prj_nQk5SBKkxvMniAdjFsM7xqwxavCr` stays — env vars + integrations keyed off ID, not name.

**Local clones:**
- `~/claude/claw-dashboard/` → `~/claude/vires-dashboard/`
- Update `~/.claude/settings.json` PostToolUse hook reference.
- Update any user-defined aliases or shortcuts.

**Cross-repo references:**
- `vires-numeris` likely has URL references in docs, contracts, env defaults — grep for `claw-dashboard` in that repo.
- `~/.openclaw/workspace/trading-bot/` — `scripts/push-operator-feed.py` writes into the dashboard, references path.
- `~/claude/OpenClaw-s-Brain` — TICKET-*.md may reference the dashboard URL.
- `~/claude/youtube-content` — agent prompt references dashboard paths (HOUSEKEEPING-001 updates touch this too).

**Documentation:**
- `CLAUDE.md` in claw-dashboard.
- All `_design_handoff/*.md` references.
- Memory files in `~/.claude/projects/-home-jacobbarkley/memory/` — grep for `claw-dashboard`.

**CI:**
- `.github/workflows/e2e-smoke.yml` — generic, no rename impact.
- Any GitHub Secrets pointing at `claw-dashboard` repo (e.g. `ARGOS_TOKEN`) — re-bind to new repo name; GitHub usually handles this automatically but verify.

### Acceptance criteria

- [ ] Repo renamed on GitHub; old URL redirects.
- [ ] Local clone renamed; hook still fires on edits.
- [ ] Vercel preview URL works (whether changed or kept).
- [ ] Production deploy still resolves at the canonical URL.
- [ ] Grep for `claw-dashboard` across `~/claude/` + `~/.openclaw/` returns only historical/archived references.
- [ ] Cron jobs that push dashboard data still succeed for 1 full week post-rename.

### Risks + mitigation

- **Hooks break silently** — PostToolUse hook path change. Mitigation: test hook manually after path rename before assuming it works.
- **CI integrations re-key on repo name** — GitHub usually handles this but Argos / WorkOS / Supabase / Vercel may not. Mitigation: audit each integration's repo binding before flipping the rename.
- **Bookmarked preview URLs break** — Jacob's bookmarks pointing at `claw-dashboard-*.vercel.app`. Mitigation: decide whether to keep Vercel slug or accept the break.

### Out of scope

- `~/.openclaw/workspace/` directory rename. Even though OpenClaw no longer runs trading, the path is referenced by too many crons and scripts; rename cost exceeds value. Document as historical artifact.

---

## HOUSEKEEPING-003: Linear migration — ticket consolidation

**Trigger:** When Step 4 of the acceleration plan provisions Linear (Linear workspace + Cyrus wired + Jacob's API key in OpenClaw env).
**Owner:** Codex (lifecycle owner of OpenClaw-s-Brain TICKET-*.md) + Claude (deferred-obligations ledger row links).

### Problem

Multiple ticket sources today:
1. **`~/claude/OpenClaw-s-Brain/TICKET-*.md`** — the canonical legacy ticketing flow. Tickets get parsed by `scripts/parse-tickets.py` into `data/tickets.json` for dashboard display.
2. **`~/.claude/projects/-home-jacobbarkley/memory/queue.md`** + **`~/claude/claw-dashboard/data/queue.json`** — backlog queue surfaced in dashboard.
3. **`~/claude/claw-dashboard/_design_handoff/VIRES_DEFERRED_OBLIGATIONS_LEDGER.md`** — design-state ledger (different shape than tickets).
4. **GitHub Issues** — barely used, but technically present.

This is too many sources. Future operators won't know which one to file against.

### Target end state

- **Linear** — single source-of-truth for action items (tickets). Spec Kit format for richer specs.
- **Deferred Obligations Ledger** — stays as design-state artifact (different shape), but each row gets a linked Linear ticket for execution tracking. Ledger row IDs (e.g. `GUIDED-T1-PRIVATE-USER-STATE-STORE`) appear as Linear ticket fields, so an operator can search either way.
- **TICKET-*.md + queue.md** — archived to `_archive/` directories with a redirect note. Not retired immediately; the dashboard reads from `tickets.json` until that surface is replaced.

### Migration tasks

1. **Triage existing TICKET-*.md** — categorize each as (a) still active → create Linear ticket, (b) blocked → create + park, (c) completed → mark archived in OpenClaw-s-Brain.
2. **Triage queue.md** — same buckets.
3. **Map each open ledger row** to a Linear ticket; add a `ledger_row_id` custom field in Linear or use the ID prefix in the ticket title.
4. **Update `scripts/parse-tickets.py`** — either teach it to read Linear API, or freeze it and replace the dashboard's tickets surface with a Linear embed.
5. **Update CLAUDE.md** + relevant memory files to point at Linear instead of TICKET-*.md.
6. **Cyrus integration** — confirm Cyrus can act on Linear tickets to spawn agent worktrees (this is the Step 4 win).

### Acceptance criteria

- [ ] All active TICKET-*.md content lives in Linear.
- [ ] Queue.md is empty or archived.
- [ ] Deferred-obligations ledger rows have Linear ticket links.
- [ ] Dashboard tickets surface either reads from Linear or is explicitly retired with a redirect.
- [ ] Cyrus is wired and demonstrated to act on at least one Linear ticket end-to-end.

### Risks + mitigation

- **Mid-migration drift** — if TICKET-*.md and Linear are both writable, they desync. Mitigation: pick a cutover date; after that, TICKET-*.md is read-only.
- **Linear API quota** — free tier has limits. Mitigation: 1 user, low write volume; quota is not a real concern at Vires scale.
- **Dashboard tickets surface** breaks if `parse-tickets.py` isn't updated. Mitigation: keep `tickets.json` writable from a one-shot Linear export until the surface is replaced.

### Out of scope

- Linear *team* features (assignees beyond Jacob/agents). Spike is single-user.
- SLA tracking, time logs, automation rules. Add later if a need emerges.

---

## Where to find this file

Filed under `_design_handoff/` in `claw-dashboard` alongside the acceleration plan specs. Any agent looking for "what's deferred" should find it here.
