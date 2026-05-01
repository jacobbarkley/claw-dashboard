# Codex Primer — Closing the implementation loop in-app

**Date:** 2026-04-30
**From:** Claude (Opus 4.7), per Jacob's request
**For:** Codex
**Scope:** Where the Lab end-to-end loop stands today, what's blocking
single-user-in-app autonomy, and the three options Jacob and Claude
walked. Jacob is leaning toward **option 2 (hybrid: Talon-drafted PR,
human merge, runtime write-back)** but explicitly wants alignment with
you before we commit.

This is a brief, not a spec. Jacob wants to expand it with you in the
room.

---

## §1 — One-week goal (Jacob's words)

> "I'm really hoping within a week we might have built a run that's the
> way I'm seeing now, with multi-users yet just with me as the sole
> user, but with full idea generation, implementation, and promotion
> to Autonomous Paper, all within the app."

So: **single-user end-to-end loop, in app, in ~1 week.**
- Idea → spec (Talon-drafted, operator-revised, approved) ✅ shipped
- Spec → registered strategy module → smoke job → 🚧 the gap
- Smoke pass → promotion to AUTONOMOUS_PAPER (existing checkpoint-05
  flow) → live paper trading

After that:
- Cloud Design pass to beautify the UI (separate effort, Claude leads).
- Multi-user implementation (App Store path).
- YouTube marketing (build-in-public).

---

## §2 — Multi-tenant law (this is non-negotiable now)

Jacob explicitly elevated this from "consideration" to "law" on 2026-04-30:

> "Take this as law… long term I'm hoping to be able to fully launch
> this app to the App Store and have multiple users."

Every architectural choice between now and then must be compatible with
that. Anti-patterns to actively avoid even if more work upfront:
- GitHub-as-database for hot state (doesn't scale past 1 writer; OK for
  audit log only).
- Filesystem-bundled-into-build for mutable data.
- Hardcoded user/account/strategy_group IDs in code paths.
- UI flows that assume one operator.
- Auth-free endpoints that trust the client's scope claim.

**Already in place that scales:** `ScopeTriple` (user_id/account_id/
strategy_group_id) isolation, versioned schemas, well-abstracted `load*`
server functions in `lib/research-lab-*.server.ts`. The shape is right;
the persistence backend is what eventually swaps.

**Still missing for multi-tenant:** real datastore behind the loaders,
auth + request-scoped tenant context, per-tenant rate limiting, isolated
strategy namespaces inside trading-bot. Not blocking the 1-week goal,
but anything we build this week needs to not paint that corner.

---

## §3 — Where we are today

### §3.1 — Spec authoring (shipped, working)

Phase D-impl + Talon drafting + Talon revision are all live and
behaviorally verified end-to-end against a real strategy:

- **Ape Wisdom** (`spec_01KQG8T24H2BDA83JECC2BDA83`, v3) was just
  approved by Jacob at 2026-05-01T03:29:27 UTC. State: `APPROVED`.
- A queue entry was written:
  `data/research_lab/jacob/paper_main/default/spec_implementation_queue/spec_01KQG8T24H2BDA83JECC2BDA83.yaml`
  with `state: QUEUED`, `attempts: 0`, `claimed_at: null`.
- Schema: `research_lab.spec_implementation_queue.v1` (definition in
  `lib/research-lab-contracts.ts:215`).

### §3.2 — Talon spec drafting (shipped)

Per `CODEX_PRIMER_2026-04-30_talon_spec_drafting.md`. Two endpoints:
- `POST /api/research/specs/draft-with-talon` — initial draft from a
  thesis, with PASS/WARN/BLOCKED data-readiness verdict.
- `POST /api/research/specs/[id]/revise-with-talon` (propose-only) +
  `POST /api/research/specs/[id]/apply-talon-revision` (explicit Apply).
  Multi-turn chat with cumulative-proposal carry-forward.

### §3.3 — Optimistic UI (shipped today)

State transitions (`submit-for-approval`, `approve`, `send-back`, Talon
Apply) used to call `router.refresh()` and wait ~60–90s for the Vercel
rebuild to re-bundle `data/`. Now they read the persisted entity from
the API response and swap local state immediately. Cross-page hand-off
(spec-edit → idea page) uses `sessionStorage["spec-update:{id}"]` as a
one-shot bridge.

This is a pure client-render layer — datastore-agnostic. It does not
fix the underlying GitHub-as-DB lag; it just hides it for the operator's
own actions. **When we swap persistence in option 2, this code keeps
working unchanged.**

### §3.4 — Trading-bot side (partial)

You already shipped:
`src/openclaw_core/research_lab/dashboard_spec_queue.py` —
`DashboardSpecImplementationQueue` with `list_queue_entries`,
`read_queue_entry`, validators, scope path helpers. Tests at
`tests/openclaw_core/test_research_lab_dashboard_spec_queue.py`.

What does **not** exist yet:
- No `bin/` script that calls `list_queue_entries()` on a schedule.
- No code-generation step (spec YAML → strategy module Python file).
- No write-back path. The dashboard has no endpoint to transition the
  queue entry through `CLAIMED → IMPLEMENTING → REGISTERED` / `FAILED`,
  and trading-bot has no committer that would call one.

So: **the queue file is just sitting there.** Discovery infrastructure
is dormant.

---

## §4 — The three options Jacob walked

### Option 1 — Status quo + visibility (~1 day)

Codex (you-the-human/agent) keeps doing implementation manually. We add
operator-facing visibility on the queue: queue age timer, "claimed by
Codex at X" label once you write `claimed_at`, "implementation started"
when you write `implementation_started_at`, etc.

- **Pros:** Cheapest. No autonomy decision. Doesn't paint multi-tenant
  corners since it changes nothing.
- **Cons:** Doesn't move toward in-app loop. The 1-week goal slips.

### Option 2 — Hybrid: Talon-drafted PR + human merge + runtime write-back (~3–5 days)

Talon Implementor reads the approved spec, generates the Python strategy
module + tests, opens a draft PR against `trading-bot`. A human
(initially you, eventually each user reviewing their own) reviews,
runs tests, merges. A trading-bot watcher (webhook or polled) detects
the merged PR touching `strategies/`, transitions the queue entry to
`REGISTERED`, and writes back to the dashboard repo.

- **Pros:** Code-into-runtime stays human-gated, which matches the
  live-trading-gate principle already in memory. **Multi-tenant compatible
  shape** — the gate becomes "user reviews their own PR" later. Real
  scope swap path: when the dashboard moves to a real DB, the queue
  state writes go DB-side instead of GitHub-commit-side; trading-bot
  side is unaffected.
- **Cons:** Most moving parts. Requires LLM-driven code generation that
  produces mergeable strategy modules. Requires a trading-bot watcher.
  Requires a write-back endpoint on the dashboard.

### Option 3 — Full Talon Implementor (~1.5 weeks, larger autonomy decision)

Talon generates code, runs tests in CI, auto-merges on green, registers
the strategy. Pure automation.

- **Pros:** Fully autonomous loop.
- **Cons:** Multi-tenant **does not** want this — random users' AI-drafted
  code shouldn't auto-merge into a shared trading runtime. Tangles with
  live-trading-gate. Requires real test isolation + sandboxed code
  execution. Big trust model shift.

---

## §5 — Jacob's lean: option 2, with parallel end-to-end testing

Direct quote: "I might want to go with option two now before we proceed.
But I also want to be able to keep testing end-to-end to catch anything
else further down downstream that we need to start queuing up and
specking out to build as well."

So we're proposing:
- **In parallel track 1:** You manually implement Ape Wisdom the
  current way (status-quo path) so we get one full end-to-end run
  to surface downstream gaps (smoke job runner, promotion gating,
  AUTONOMOUS_PAPER toggle UX, anything we don't know yet).
- **In parallel track 2:** We design and start building option 2 so
  the *next* approved spec is our first automated implementation.

Track 1 = de-risk what's downstream of the queue. Track 2 = automate
the queue itself.

---

## §6 — Open questions for you

These are the ones Jacob and I couldn't answer without your input:

1. **Where should Talon Implementor live?** Dashboard side (extends
   existing Talon infra; needs a GitHub PAT with `trading-bot` write
   scope) or trading-bot side (new bin script with its own LLM client;
   keeps the "dashboard publishes specs, trading-bot subscribes" boundary
   clean)? My instinct says trading-bot side. Yours?

2. **What's the spec → code contract?** Given a `StrategySpecV1`
   (`signal_logic`, `entry_rules`, `exit_rules`, `universe`, `risk_model`,
   `sweep_params`, `required_data`), what subset of strategy module
   shapes do we need to support v1? Any one of:
   - Single-leg long-only with per-symbol entry/exit
   - Multi-leg (overlay, hedge)
   - Options-aware (Q-044 territory)
   I think v1 should be **single-leg long-only equity only** — Ape
   Wisdom fits. Options/hedges are v2. Agree?

3. **Write-back endpoint shape.** I'd add three endpoints on the
   dashboard:
   - `POST /api/research/specs/[id]/queue/claim` (Codex/Talon claims)
   - `POST /api/research/specs/[id]/queue/finish` (REGISTERED on success,
     FAILED on error)
   These would commit-and-push the queue YAML the same way the approve
   endpoint does today. Spec gets `state: APPROVED → IMPLEMENTING → REGISTERED`
   in lockstep. Sound right?

4. **PR-merge → REGISTERED trigger.** GitHub webhook to a Vercel
   function on dashboard side? Or a poll loop on trading-bot side that
   walks recent commits? Webhook is faster and cheaper but adds a
   public Vercel endpoint. Poll is simpler but laggy. I lean webhook.

5. **Multi-tenant strategy namespace.** When user N approves a spec,
   their strategy module needs to land in an isolated namespace
   (`trading-bot/src/openclaw_core/strategies/users/{user_id}/...`?)
   so user A's code can't shadow user B's. v1 is single-user (Jacob)
   so this can be deferred — but the v1 shape should be one that
   multi-tenant scoping cleanly extends. Suggest we reserve the path
   structure now even if everything goes under `users/jacob/` for v1.

6. **Smoke job after registration.** Post-registration, who runs the
   first lab job to validate the strategy compiles + produces sane
   metrics? I assume that's a separate cron-driven flow you'd already
   have planned — but want to confirm there's no contract gap there.

---

## §7 — Existing timeline (for context)

- **2026-04-07 → 2026-04-14:** Audit-and-rebuild cutover. Legacy
  16-agent pipeline killed, rebuild runtime is sole runtime.
- **2026-04-15:** Day-1 cleanup. Native broker snapshot, KPI purity
  fix, broker_reconciler disabled. Zero legacy deps remain.
- **2026-04-16 → 2026-04-22:** Vires v3 catch-up, passport v2 spec,
  campaign promotion workflow, swipe nav, etc. (UX-heavy work.)
- **2026-04-27:** Lab redesign thread — repositioning Lab as central
  premium feature.
- **2026-04-29:** Phase E brief — spec lifecycle endpoints
  (POST/PATCH/approve, queue write).
- **2026-04-30:** Phase D-impl ships (spec authoring thread + edit
  surface, behind `vires.lab.spec_authoring`). Talon drafting +
  revision endpoints land. Catalog v2026-04-30.2 tightens
  false-BLOCKED behavior.
- **2026-04-30 (evening):** First real strategy (Ape Wisdom) drafted
  by Talon, refined across multi-turn chat, submitted, approved.
- **2026-04-30 (late):** Optimistic UI lands so state transitions
  feel instant despite GitHub-as-DB lag. Multi-tenant law saved
  to memory.
- **NOW:** Queue entry written, awaiting implementor.

---

## §8 — What I'd like from you in our next session

Pick a direction on §6.1 (where Implementor lives), agree on §6.2
(spec → code v1 surface), and we can scope option 2 into a real plan
with task breakdown. Aim is to have option 2 designed by end-of-day so
you can implement Ape Wisdom manually overnight, and we kick off
option 2 build tomorrow with everything we learned from the manual
implementation.

— Claude
