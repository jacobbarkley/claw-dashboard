# Codex — new thread primer (2026-04-23)

You are picking up Vires / OpenClaw backend work from an older Codex thread
that became laggy and had a broken local environment. The code is fine;
the previous thread just accumulated cruft and verification failures. Treat
this as the canonical handoff for continuing.

---

## The honest current state (NOT what the old primer said)

The previous primer was written mid-bug-fix and is now stale. Updated status:

- **Bug 5 is CLOSED.** `codex/bug5-test-isolation-readiness @ 8c1e532` ran
  `31 passed in 1.55s` on Claude's Linux side on 2026-04-23, with zero stray
  pushes to dashboard main during the test run.
- **Passport v2 is feature-complete end-to-end.** §11 frontend + §12 backend
  both closed. All 5 bugs from the 2026-04-22 shipping sprint are closed.
- **The paper-monitoring threshold contract + code is landed.** Values below
  are already wired in `strategy_bank.py`. Not an open question.
- **Your immediate priority is not a coding task.** It's the operational
  merges + one sanity-check refresh cycle. See "Task order" below.

---

## Repos (canonical)

Both repos are git-tracked. Git remotes:

- **Trading bot** — `git@github.com:jacobbarkley/vires-numeris.git`
  - Local (Linux): `/home/jacobbarkley/.openclaw/workspace/trading-bot`
  - Local (UNC):   `\\wsl.localhost\Ubuntu-24.04\home\jacobbarkley\.openclaw\workspace\trading-bot`
  - Session primer: `CLAUDE.md` at repo root — auto-loaded every session.
    **Read it.** Ownership boundaries are defined there, not here.

- **Dashboard** — `git@github.com:jacobbarkley/claw-dashboard.git`
  - Local (Linux): `/home/jacobbarkley/claude/claw-dashboard`
  - Local (UNC):   `\\wsl.localhost\Ubuntu-24.04\home\jacobbarkley\claude\claw-dashboard`
  - Session primer: `CLAUDE.md` at repo root — auto-loaded.
  - Live: `https://claw-dashboard-kappa.vercel.app` (auto-deploys on push to main).

---

## Lane boundaries (hard rules)

From the two `CLAUDE.md` files:

**You own (Codex):**
- `trading-bot/src/openclaw_core/` — the typed core. Everything under this directory.
- `claw-dashboard/scripts/push-operator-feed.py` — the operator feed producer that lives in the dashboard repo but is yours.
- Trading-bot architecture docs under `docs/architecture-rebuild/`.

**Claude owns:**
- `claw-dashboard/components/vires/` — all Vires design-system UI.
- `claw-dashboard/app/` — Next.js App Router pages.
- Mobile UX polish, Vercel live surface.

**OpenClaw owns:**
- Telegram gateway, cron orchestration, message delivery.

Do not cross lanes. If you need a UI field surfaced that doesn't exist,
add it to the operator-feed contract, not to a component.

---

## Branch landscape — what's on origin right now

```
trading-bot origin:
  main                                          3327036
  codex/bug5-test-isolation-readiness           8c1e532  ← READY TO MERGE
  codex/promotion-readiness-passports           e3ebc16  ← already merged via 9acdc25/07da58e etc.
  codex/strategy-bank-schema-alignment          9acdc25  ← merged
  codex/passport-historical-backfill            07da58e  ← merged
```

**`bug5-test-isolation-readiness` is the one unmerged branch that matters.**
31 tests passing on Linux. Merge it to main, verify main still pytest-green,
then delete the branch.

---

## Environment sanity checks — DO THESE FIRST

**Every new thread runs these three before writing a line of code.** The old
thread's fatal problem was assuming the environment worked.

```bash
# 1. Linux shell reachable?
wsl.exe -d Ubuntu-24.04 -- bash -lc "echo ok && uname -a"

# 2. Python env importable?
wsl.exe -d Ubuntu-24.04 -- bash -lc "cd ~/.openclaw/workspace/trading-bot && \
  PYTHONPATH=src .venv-rebuild/bin/python3 -c \
  'from openclaw_core.services.strategy_bank import StrategyBankRuntime; print(\"import ok\")'"

# 3. pytest actually runs?
wsl.exe -d Ubuntu-24.04 -- bash -lc "cd ~/.openclaw/workspace/trading-bot && \
  PYTHONPATH=src .venv-rebuild/bin/python3 -m pytest tests/openclaw_core/test_strategy_bank.py -q"
# Expected: 31 passed (on 8c1e532 or post-merge main)
```

If any of these fail, **stop and fix the environment before touching code.**
Do not route around it by asking Claude to be your terminal — that's what
made the old thread ship three bugs (duplicate function, syntax error,
silent Alpaca empties) that local pytest would have caught.

---

## Review discipline (the minimum bar, not the aspiration)

The old thread had reviews that came back "clean, no findings" and then
shipped broken code. Three examples from the last 24 hours:

- Bug 4: duplicate `_crypto_comparison_entry_for_manifest` across two
  merged branches. A `grep -n "^def " src/openclaw_core/services/strategy_bank.py | sort | uniq -d -w 60`
  would have caught it.
- `9889f8a`: an `IndentationError` at `strategy_bank.py:2083`. A single
  `python3 -c "from openclaw_core.services.strategy_bank import StrategyBankRuntime"`
  would have caught it.
- Bug 3: silent Alpaca `{}` returns on transient failures. Caught by
  watching real production commits, not by any review.

**Minimum review bar from now on:**

1. Import smoke — `python3 -c "from <module> import <symbol>"` for every
   touched module.
2. `pytest` on the closest relevant test file, full output.
3. `grep` the diff for duplicate definitions of any new function.
4. Only claim "review clean" after steps 1-3 pass.

Ship less, but ship verified.

---

## Git push discipline (what actually went wrong)

Your SSH on the previous desktop was broken, so you were pushing via HTTPS.
HTTPS pushes silently failed twice on 2026-04-22: `git push` exited 0, but
the remote SHA didn't move.

**The ritual from now on:**

```bash
# 1. Never parallelize commit + push
git commit ...      # complete this, see the SHA echoed back
git push ...        # wait for output

# 2. Verify the remote actually moved
git ls-remote origin refs/heads/<your-branch>
# OR
git fetch origin && git rev-parse origin/<your-branch>
# Must match HEAD.

# 3. If mismatch, the push failed — don't claim "pushed".
```

If your SSH is fixable in the new environment, **fix it first.** SSH
setup: keypair at `~/.ssh/id_ed25519_claude` is already registered to
GitHub under jacobbarkley's account and works for push from Linux.
Point `core.sshCommand` or the `url.ssh://git@github.com/.insteadOf`
rewrite at that key. HTTPS push is a hazard.

---

## Paper monitoring — contract already locked + wired

Not an open design question. Already in code at `strategy_bank.py` as of
`3327036` + the fallback refinement in `8c1e532`. Reference only:

| Sleeve  | target_days | threshold_pct | window_days | direction  |
|---------|------------:|--------------:|------------:|------------|
| Stocks  |          21 |          4.0% |           5 | asymmetric |
| Crypto  |          14 |         10.0% |           5 | asymmetric |
| Options |         TBD |           TBD |         TBD | deferred   |

- Direction = asymmetric downside demotion only. Over-performance doesn't
  demote.
- `AT_RISK` = half-threshold symmetric warning, no streak requirement.
- `COMPLETED` beats `AT_RISK` once `elapsed_days >= target_days` closes cleanly.
- The runtime wiring is verified by test
  `test_strategy_bank_refresh_passport_v2_applies_crypto_defaults_for_confirming_record`.

Full context: `_design_handoff/_reference/campaigns/PAPER_MONITORING_THRESHOLDS_PROPOSAL_2026-04-22.md`
and `CODEX_IMPLEMENTATION_RECOMMENDATION_paper_monitoring_thresholds_2026-04-22.md`.

---

## Task order for this new thread

**Priority 1 — sanity-check environment** (the three commands above). Do not
skip. If they don't all pass, STOP and fix environment.

**Priority 2 — merge Bug 5 branch to main.**

```bash
cd ~/.openclaw/workspace/trading-bot
git fetch origin
git checkout main
git merge --ff-only origin/codex/bug5-test-isolation-readiness \
  || git merge origin/codex/bug5-test-isolation-readiness  # if FF not possible, resolve
PYTHONPATH=src .venv-rebuild/bin/python3 -m pytest tests/openclaw_core/test_strategy_bank.py -q
# expect: 31 passed
git push origin main
git ls-remote origin refs/heads/main  # verify new SHA
# then delete the merged branch (local + remote) once clean
```

**Priority 3 — operational refresh to land new fallback logic** (trading-bot side):

```bash
cd ~/.openclaw/workspace/trading-bot
PYTHONPATH=src .venv-rebuild/bin/python3 -m openclaw_core.cli.strategy_bank \
  refresh-passport-v2 --actor codex --note "post-bug5-merge refresh"
```

**Priority 4 — mirror to dashboard** (dashboard side):

```bash
cd ~/claude/claw-dashboard
python3 scripts/pull-bench-data.py
git add data/bench/
git diff --cached --stat   # VERIFY only bench data is staged, not dirty worktree crud
git commit -m "data: refresh bench mirror post-bug5-merge"
git push
git ls-remote origin refs/heads/main   # verify push landed
```

**Priority 5 — open items in your lane** (not urgent, but the natural queue):

- First real operator-confirmed promotion will be the first live test of
  `paper_monitoring` populating. Watch what happens on that flow.
- Options paper monitoring thresholds — TBD, defer until an options
  strategy hits paper.

---

## Things to watch that bit the last thread

1. **Don't stage dirty worktree crud into your commits.** Use
   `git diff --cached --stat` before every commit. The old thread
   accidentally reverted three files in one commit because stale
   working-tree state got swept in. Alternatively, use fresh worktrees
   for each slice — `git worktree add` is cheap.

2. **Don't do multi-branch merges without an immediate pytest pass.**
   Bug 4 (duplicate `_crypto_comparison_entry_for_manifest`) happened
   because three branches merged in quick succession and nobody ran
   pytest in between.

3. **Don't swallow API errors as empty state.** Bug 3 was
   `fetch_recent_orders_map` silently returning `{}` on Alpaca hiccups.
   Pattern: if creds are present AND the call returned something that
   isn't a valid result, raise — let the caller decide. Apply to every
   `alpaca_*_request` call.

4. **Do not claim "Claude review clean" without the minimum bar.**
   If your review agent didn't run an import smoke and a pytest pass,
   it's not a review — it's visual inspection. Upgrade.

5. **Do not assume pushes landed.** Especially on HTTPS. See git push
   discipline above.

6. **Test pollution into production repos.** The conftest autouse
   fixture at `tests/openclaw_core/conftest.py` patches the operator-feed
   push path under pytest. Don't remove it. If a new CLI path writes to
   git as a side effect, add it to that fixture.

---

## Claude's role in the new thread

Claude (Opus 4.7, separate sessions per surface) owns frontend + UX and
serves as the Linux runtime verification backstop when your WSL is flaky.
The collaboration pattern that works:

- **Before push** — spawn Claude as a subagent to review the diff. Minimum
  bar from your end: import smoke + pytest passed. Claude's pass catches
  architecture / contract drift / regression risks your review missed.
- **After push** — if you can't run pytest locally, Claude runs it on the
  real Linux side and relays failure tails. You fix from there.
- **Hand-off docs** — the `_design_handoff/_reference/campaigns/CODEX_BUGS_*.md`
  file is the canonical bug ledger. Add to it, don't duplicate it.

Claude does not touch `src/openclaw_core/`. You do not touch
`components/vires/`. This rule has held cleanly for the whole passport-v2
sprint; keep it.

---

## What's NOT on the list

- Live capital. Still in `AUTONOMOUS_PAPER`. Do not propose a live
  transition — checkpoint 05 is still accumulating.
- New strategy work. The strategy bank has what it needs. Research
  campaigns are on hold while the workflow surface stabilizes.
- New UI work on the dashboard. That's Claude's lane and Claude's
  backlog. You surface fields via the operator-feed contract when
  asked; you don't edit components.

---

## Definition of done for this handoff thread

1. Environment sanity checks all green.
2. `codex/bug5-test-isolation-readiness` merged to trading-bot main.
3. Trading-bot main's pytest still green (31 passed) post-merge.
4. One clean `refresh-passport-v2` + `pull-bench-data.py` cycle with
   the expected artifact changes (nothing surprising).
5. Dashboard main updated with the fresh bench mirror.
6. All git pushes above verified against remote SHA.
7. No stray commits to dashboard main from test runs.

If all seven hold, this thread's main obligation is complete. Next
real work is opportunistic — whatever surfaces from Jacob or Claude.
