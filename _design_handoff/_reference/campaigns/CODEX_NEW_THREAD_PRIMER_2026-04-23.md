# Codex — new project handoff (2026-04-23)

You are picking up Vires / OpenClaw backend work from an older Codex project
that got laggy after two weeks and had a broken WSL / pytest environment.
The code is fine; the previous project just accumulated cruft and the local
verification loop stopped working — which caused three shippable bugs to
escape review in the last 48 hours. Treat this file as the canonical entry
point for the new project.

Jacob will point the new thread here. After you've read it, the two
`CLAUDE.md` files (one in each repo) auto-load on every session — they are
the detailed session primers; this file is the map above both of them.

---

## Environment sanity — RUN FIRST, BEFORE WRITING ANY CODE

The previous project's fatal problem was assuming the environment worked.
These three commands must all come back green. Do not skip.

```bash
# 1. Linux shell reachable from Windows?
wsl.exe -d Ubuntu-24.04 -- bash -lc "echo ok && uname -a"

# 2. Python env actually importable?
wsl.exe -d Ubuntu-24.04 -- bash -lc "cd ~/.openclaw/workspace/trading-bot && \
  PYTHONPATH=src .venv-rebuild/bin/python3 -c \
  'from openclaw_core.services.strategy_bank import StrategyBankRuntime; print(\"import ok\")'"

# 3. pytest actually runs?
wsl.exe -d Ubuntu-24.04 -- bash -lc "cd ~/.openclaw/workspace/trading-bot && \
  PYTHONPATH=src .venv-rebuild/bin/python3 -m pytest tests/openclaw_core/test_strategy_bank.py -q"
# Expected: 31 passed on 8c1e532 or post-merge main
```

If any fail, STOP and fix the environment before touching code. Do not
route around a broken environment by asking Claude to run your pytest for
you — that's exactly what let bugs 3/4/5 ship in the old project.

SSH keypair is already provisioned: `~/.ssh/id_ed25519_claude` is
registered on the `jacobbarkley` GitHub account and works for push from
Linux. HTTPS push is a hazard (see Git discipline) — prefer SSH.

---

## Repos (canonical)

| Role | Remote | Linux path | UNC path | Session primer |
|---|---|---|---|---|
| Trading bot | `git@github.com:jacobbarkley/vires-numeris.git` | `/home/jacobbarkley/.openclaw/workspace/trading-bot` | `\\wsl.localhost\Ubuntu-24.04\home\jacobbarkley\.openclaw\workspace\trading-bot` | `CLAUDE.md` at repo root |
| Dashboard | `git@github.com:jacobbarkley/claw-dashboard.git` | `/home/jacobbarkley/claude/claw-dashboard` | `\\wsl.localhost\Ubuntu-24.04\home\jacobbarkley\claude\claw-dashboard` | `CLAUDE.md` at repo root |

Dashboard live URL: `https://claw-dashboard-kappa.vercel.app` — auto-deploys
on push to `main`. (The `claw-dashboard.vercel.app` namespace was taken so
Vercel assigned the `-kappa` suffix.)

Both `CLAUDE.md` files auto-load per session. Read them once at thread
start; they define ownership boundaries and data flow.

---

## Directory map — where things live

### Trading bot (`~/.openclaw/workspace/trading-bot`)

- `src/openclaw_core/` — **your lane**, the typed rebuild core
  - `services/strategy_bank.py` — strategy bank runtime (your hottest file)
  - `services/promotion_readiness.py` — 9-gate scorecard producer
  - `cli/strategy_bank.py` — `refresh-passport-v2` CLI entry point
- `tests/openclaw_core/` — pytest suite; `conftest.py` has the autouse
  fixture that blocks test-side-effect git pushes (don't remove)
- `state/rebuild_latest/` — runtime artifacts (JSON). Read-only from your
  perspective in most flows; `strategy_bank.json`, `active_strategy.json`
  etc. live here
- `state/rebuild_history/strategy_promotion_events.jsonl` — audit trail
- `backtest/bench/manifests/*.execution_manifest.json` — strategy manifests
- `backtest/experiments/<exp>/results/<run>/validation_report.json` — gate
  scoring per variant
- `docs/architecture-rebuild/` — 29+ architecture docs
  - `13-operator-feed-contract.md` — authoritative operator-feed contract
  - `28-operator-morning-checklist.md` — operator preflight summary
- `bin/rebuild_shadow_daily_cron.sh` — cron wrapper (phases: PREMARKET / INTRADAY)
- `.venv-rebuild/` — the venv pytest and CLI run under
- `prompts/thesis_engine_v1.md` — the single LLM prompt

### Dashboard (`~/claude/claw-dashboard`)

- `components/vires/` — **Claude's lane**, Vires design-system UI
- `app/` — Next.js App Router; `app/vires/*` routes, `app/api/trading/route.ts`
- `scripts/push-operator-feed.py` — **your lane** — operator-feed producer
  that lives in the dashboard repo for deployment reasons but is yours
- `scripts/push-operator-feed.sh` — wrapper (commit + push)
- `scripts/pull-bench-data.py` — dev-side bench mirror refresh
- `scripts/prepare-production-operator-feed.sh` — canonical feed rebuild
  (must produce `source_context.mode = "canonical"`)
- `data/operator-feed.json` — single data artifact the frontend reads
- `data/bench/` — bench index + per-run leaderboards + campaign manifests
  - `data/bench/campaigns/campaign_registry.json`
  - `data/bench/campaigns/*.campaign_manifest.json`
- `data/tickets.json`, `data/queue.json` — OpenClaw ticket + queue feed
- `_design_handoff/` — see Reference docs ledger below
- `.githooks/pre-commit` — mojibake guard (activated by `npm install`)

### Other workspaces on this machine

- `~/claude/vires-handoff/design_handoff_vires_capital/` — extracted
  prototype zip; reference for Vires v3 catch-up
- `~/claude/OpenClaw-s-Brain` — Obsidian notes vault (git-tracked)
- `~/claude/obsidian-staging/` — staging area for vault sync
- `~/claude/youtube-content/` — YouTube story agent + content pipeline

---

## Reference docs ledger

Every handoff contract and primer you might need, by topic. All paths
relative to `~/claude/claw-dashboard/` unless noted.

### Active handoff root

- `_design_handoff/HANDOFF_PROTOCOL.md` — high-level collaboration protocol
- `_design_handoff/HANDOFF_PROTOCOL_REV3_DRAFT_CODE.md` — rev3 draft
- `_design_handoff/DIVERGENCE_LOG.md` — running log of Codex/Claude divergences
- `_design_handoff/_reference/operator-feed.json` — reference feed snapshot

### Campaigns + passport contracts (`_design_handoff/_reference/campaigns/`)

- `PASSPORT_V2_SPEC_2026-04-21.md` — the canonical passport v2 spec (§11
  is the build plan; §12 is the paper-monitoring threshold section)
- `PRIMER_v2_campaign_contract.md` — backend campaign-manifest v2 contract
- `32-bench-campaigns-contract.md` — bench↔campaign glue contract
- `CODEX_BUGS_2026-04-22.md` — canonical bug ledger (append, don't duplicate)
- `CODEX_PRIMER_2026-04-21_passport_v2_backend_first_pass.md`
- `CODEX_PRIMER_promotion_workflow_2026-04-21.md`
- `PAPER_MONITORING_THRESHOLDS_PROPOSAL_2026-04-22.md`
- `CODEX_IMPLEMENTATION_RECOMMENDATION_paper_monitoring_thresholds_2026-04-22.md`
- `DATA_PRIMER.md`, `DEGRADATION.md`, `NOTES.md`, `UX_CHECKLIST.md`
- `campaign_registry.json`,
  `stocks_ai_wall_street_aggressive.campaign_manifest.json`,
  `stocks_etf_replacement_momentum.campaign_manifest.json` — examples

### Topic primers (`_design_handoff/CODEX_PRIMER_*.md`)

- `CODEX_PRIMER_2026-04-19_allocation_history.md`
- `CODEX_PRIMER_2026-04-20_bench_campaigns.md`
- `CODEX_PRIMER_2026-04-20_bench_sync_and_era_status.md`
- `CODEX_PRIMER_2026-04-20_promoted_passport_era_data.md`
- `CODEX_PRIMER_2026-04-20_sleeve_equity_history.md`
- `CODEX_PRIMER_2026-04-21_campaigns_v2_backend_landed.md`
- `CODEX_PRIMER_2026-04-21_crypto_era_verdicts.md`

### Vires prototype reference

- `_design_handoff/vires_capital/` — prototype files
- `~/claude/vires-handoff/design_handoff_vires_capital/HANDOFF_2026-04-21.md`
  is the router for the v3 prototype

### Crypto tracked-assets

- `_design_handoff/2026-04-19_crypto_tracked_assets/` — spec folder

### Trading-bot docs (on the other repo)

- `docs/architecture-rebuild/13-operator-feed-contract.md` — authoritative
  contract for the single artifact both surfaces share
- `docs/architecture-rebuild/28-operator-morning-checklist.md`
- All 29 architecture-rebuild docs

---

## Lane boundaries — hard rules

From the two `CLAUDE.md` files:

- **You (Codex) own:** `trading-bot/src/openclaw_core/` entirely,
  `claw-dashboard/scripts/push-operator-feed.py`, trading-bot architecture
  docs. The operator-feed contract is yours.
- **Claude owns:** `claw-dashboard/components/vires/` and `claw-dashboard/app/`
  (Next.js App Router pages + UI). Mobile polish. Vercel live surface.
- **OpenClaw owns:** Telegram gateway, cron orchestration, message delivery.

Do not cross lanes. If a UI field you want to surface doesn't exist yet, add
it to the operator-feed contract and re-emit — don't edit a component.

The dashboard has exactly one rule that supersedes everything: it is a
**thin operator surface, not a second source of truth.** It reads
`data/operator-feed.json` via `/api/trading`. No ad hoc JSON contracts,
no legacy-pipeline artifact coupling, no invented trading logic.

---

## Current state of play (2026-04-23)

### What's done

- **Passport v2 is feature-complete end-to-end.** §11 frontend + §12
  backend both closed. All 5 bugs from the 2026-04-22 shipping sprint
  closed.
- **Paper-monitoring threshold contract + code is landed** on trading-bot
  main `3327036`:
  - Stocks: target 21 days, ±4.0%, 5-day window, asymmetric downside
  - Crypto: target 14 days, ±10.0%, 5-day window, asymmetric downside
  - Options: TBD until an options strategy hits paper
  - Full context: `PAPER_MONITORING_THRESHOLDS_PROPOSAL_2026-04-22.md` +
    implementation recommendation in the same folder
- **Dashboard main** at `b209ad4` — bench mirror refreshed post-bug5-8c1e532
  (commit `39f6937`), this primer committed (`b209ad4`)
- **Campaign lineage strip, baseline comparison, parameter stability,
  trade-history carousel, paper-monitoring card, interactive scrubbing**
  are all genuinely live
- **Operator confirm endpoint** `/api/passport/workflow` is live with dual
  mode (direct WSL CLI + governed request-file fallback)

### What's pending

- **Bug 5 is CLOSED on branch `codex/bug5-test-isolation-readiness`
  (`8c1e532`) but NOT yet merged to trading-bot main.** 31 tests passing
  on Linux. Priority 2 for this thread is merging it.
- **Crypto gate adapter is code-complete but NOT wired into the producer
  path.** Stocks flow through the strategy bank; crypto campaigns still
  render empty-state readiness scorecards on the dashboard. Closes when
  you wire `promotion_readiness.py` crypto adapter into the producer.
- **Paper monitoring is account-level, not sleeve-level.** Works today
  because only stocks has a paper slot. Will start answering the wrong
  question the moment crypto joins paper. Needs a cash-aware sleeve NAV
  producer.
- **TradeHistoryCard** on the passport returns `null` when rows are
  empty — should render an honest empty state. (Claude-side; listed so
  you know it's a known template gap.)

### What's not in scope

- **No live capital.** Still in `AUTONOMOUS_PAPER`. Checkpoint 05 is still
  accumulating. Do not propose a live transition.
- **No new strategies.** The strategy bank has what it needs. Research
  campaigns are paused while the workflow surface stabilizes.
- **No new dashboard UI work.** That's Claude's lane. You surface fields
  via the operator-feed contract when asked.

---

## Task order for this new thread

### Priority 1 — environment sanity
The three commands at the top of this file. Do not skip.

### Priority 2 — merge Bug 5 branch to main

```bash
cd ~/.openclaw/workspace/trading-bot
git fetch origin
git checkout main
git merge --ff-only origin/codex/bug5-test-isolation-readiness \
  || git merge origin/codex/bug5-test-isolation-readiness
PYTHONPATH=src .venv-rebuild/bin/python3 -m pytest tests/openclaw_core/test_strategy_bank.py -q
# expect: 31 passed
git push origin main
git ls-remote origin refs/heads/main  # verify new SHA matches HEAD
# delete the merged branch (local + remote) once clean
```

### Priority 3 — operational refresh on trading-bot

```bash
cd ~/.openclaw/workspace/trading-bot
PYTHONPATH=src .venv-rebuild/bin/python3 -m openclaw_core.cli.strategy_bank \
  refresh-passport-v2 --actor codex --note "post-bug5-merge refresh"
```

### Priority 4 — mirror to dashboard

```bash
cd ~/claude/claw-dashboard
python3 scripts/pull-bench-data.py
git add data/bench/
git diff --cached --stat   # VERIFY only bench data is staged
git commit -m "data: refresh bench mirror post-bug5-merge"
git push
git ls-remote origin refs/heads/main   # verify push landed
```

### Priority 5 — opportunistic items

- First real operator-confirmed promotion is the first live test of
  `paper_monitoring` populating. Watch that flow.
- Crypto gate adapter → producer wiring (unblocks crypto readiness UI).
- Options paper-monitoring thresholds (defer until an options strategy
  hits paper).

---

## Git + review discipline

### Push verification ritual

```bash
git commit ...                                         # see SHA echoed
git push ...                                           # wait for output
git ls-remote origin refs/heads/<branch>               # must match HEAD
# OR: git fetch origin && git rev-parse origin/<branch>
```

HTTPS pushes silently failed twice on 2026-04-22 in the old project —
`git push` exited 0 but the remote SHA didn't move. Fix SSH first if
broken; HTTPS is a hazard.

### Minimum review bar (not the aspiration — the floor)

The old project had reviews that came back "clean, no findings" and then
shipped broken code. Three examples from 48 hours ago:

- Bug 4: duplicate `_crypto_comparison_entry_for_manifest` across two
  merged branches. Caught by:
  `grep -n "^def " src/openclaw_core/services/strategy_bank.py | sort | uniq -d -w 60`
- `9889f8a`: `IndentationError` at `strategy_bank.py:2083`. Caught by:
  `python3 -c "from openclaw_core.services.strategy_bank import StrategyBankRuntime"`
- Bug 3: silent Alpaca `{}` returns on transient failures. Caught only by
  watching real production commits.

The new minimum bar:

1. **Import smoke** for every touched module
2. **pytest** on the closest relevant test file, full output
3. **grep** the diff for duplicate `def` definitions
4. Only claim "review clean" after 1–3 pass

Ship less, ship verified.

---

## Known hazards from the last project

1. **Don't stage dirty worktree crud into your commits.** Run
   `git diff --cached --stat` before every commit. The old project
   accidentally reverted three files in one commit because stale
   working-tree state got swept in. Fresh worktrees per slice via
   `git worktree add` are cheap.

2. **Don't do multi-branch merges without an immediate pytest pass.**
   Bug 4 happened because three branches merged in quick succession and
   nobody ran pytest between them.

3. **Don't swallow API errors as empty state.** Bug 3 was
   `fetch_recent_orders_map` silently returning `{}` on Alpaca hiccups.
   Pattern: if creds are present AND the call returned something that
   isn't a valid result, raise. Apply to every `alpaca_*_request` call.

4. **Don't claim "Claude review clean" without the minimum bar above.**
   Visual inspection is not a review.

5. **Don't assume pushes landed.** Especially on HTTPS. Verify against
   remote SHA every time.

6. **Test pollution into production repos.** The conftest autouse fixture
   at `tests/openclaw_core/conftest.py` patches the operator-feed push
   path under pytest. Do not remove it. If a new CLI path writes to git as
   a side effect, add it to that fixture.

---

## Claude collaboration pattern

Claude (Opus 4.7, typically separate sessions per surface) owns frontend +
UX and acts as a Linux runtime verification backstop when your WSL is
flaky. What works:

- **Before push** — spawn Claude as a subagent to review the diff.
  Minimum bar from your end: import smoke + pytest passed. Claude's pass
  catches architecture / contract drift / regressions your review missed.
- **After push** — if you can't run pytest locally, Claude runs it on the
  real Linux side and relays the failure tail. You fix from there.
- **Bug ledger** — append to
  `_design_handoff/_reference/campaigns/CODEX_BUGS_*.md`, don't duplicate.

Claude does not touch `src/openclaw_core/`. You do not touch
`components/vires/`. This rule held cleanly through the whole passport-v2
sprint; keep it.

---

## Definition of done for this handoff thread

1. Environment sanity checks all green.
2. `codex/bug5-test-isolation-readiness` merged to trading-bot main.
3. Trading-bot main's pytest still green (31 passed) post-merge.
4. One clean `refresh-passport-v2` + `pull-bench-data.py` cycle with
   the expected artifact changes.
5. Dashboard main updated with the fresh bench mirror.
6. All git pushes above verified against remote SHA.
7. No stray commits to dashboard main from test runs.

When all seven hold, this thread's main obligation is complete. Next real
work is opportunistic — whatever Jacob or Claude surfaces.
