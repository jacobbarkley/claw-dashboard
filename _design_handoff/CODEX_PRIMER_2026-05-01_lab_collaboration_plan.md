# Codex primer — Research Lab collaboration plan after Ape Wisdom

**Date:** 2026-05-01  
**From:** Codex, per Jacob's request  
**For:** Claude + future Codex sessions  
**Scope:** How Codex and Claude should split work after the first app-originated
idea -> spec -> implementation -> job -> campaign loop.

## Current baseline

The first full app-originated loop is real:

```text
Idea -> Talon-drafted spec -> Jacob approval -> manual Codex implementation
-> registered strategy -> Lab job -> result/candidate -> campaign rollup
```

The run was Ape Wisdom:

- Trading-bot backend implementation landed at `01bb6a4`.
- Dashboard job-page redesign landed at `a905253a`.
- The Ape Wisdom run produced a real result and a real Trade Atlas artifact.
- The result is honestly weak: one ASML trade, strategy `-0.83%`, SPY `+0.73%`,
  readiness `BLOCKED`.

This should be read as a successful pipeline proof and a weak strategy-evidence
run, not as a failed product.

## What Claude just shipped

Claude redesigned the Lab job page around operator truth:

1. Header: idea title, job id, back-to-idea.
2. Run Anatomy: config window, tradeable window, trades executed, benchmark
   window, with gold chips for narrowed windows and mismatch.
3. Trade Atlas: strategy curve, SPY benchmark, ASML trade lane.
4. Verdict Explained: plain-language readiness explanation with the failing
   gate promoted out of the buried scorecard.
5. Strategy vs Benchmark leaderboard.
6. Details disclosure: collapsed full scorecard and promote controls.

This order is intentional. Once the page explains what actually ran, Trade
Atlas should be the immediate visual answer.

## Core lesson from Ape Wisdom

The run exposed a spec/intelligence gap, not just a UI gap.

Ape Wisdom v1 was based on a seeded 2026-04-14 attention artifact. The campaign
had a configured window of `2026-01-07 -> 2026-04-30`, but the strategy only had
fresh usable evidence after the seed date. It therefore produced one trade and
could not be fairly judged as a mature historical edge.

Talon must learn this class of mistake:

- If required data is only seeded/current, label the run as a plumbing/proof run.
- Do not imply a full historical backtest unless historical data exists.
- Always separate config window, fresh usable tape, tradeable window,
  benchmark window, evaluated trading days, and trade count.
- Always define the evidence threshold before implementation.
- If expected trade count is below readiness floor, ask for broader universe,
  longer window, more data, or an explicit "plumbing smoke" label.

## Ownership split

Codex leads:

- Backend contracts and source-of-truth artifacts.
- Research Lab runners, projections, rollups, and mirrors.
- Talon lessons, exemplars, data-readiness rules, and experiment-plan contract.
- Strategy implementation and registration.
- Verification that produced artifacts are accurate.

Claude leads:

- Vires Lab UI/UX and operator-readable screens.
- Visual hierarchy, copy, page layout, and interaction design.
- Dashboard-side rendering of landed artifacts.
- UX review of Codex contracts before they become operator surfaces.

Short version:

```text
Codex makes the system true.
Claude makes the truth readable, beautiful, and hard to misunderstand.
```

## Bridge frequency

Use fewer, sharper bridge points.

Codex -> Claude handoff is required when:

- A new artifact contract is introduced or changed.
- A field changes meaning.
- A backend result could be misread by an operator.
- A new UI surface needs to render backend truth.
- Codex wants a dashboard review before push.

Claude -> Codex handoff is required when:

- UI needs data that does not exist yet.
- UI copy would require inventing trading semantics.
- A screen surfaces a confusing or contradictory run.
- A user action writes a governed request.
- A design decision affects campaign/passport/promotion meaning.

No bridge is required for:

- Pure visual polish against stable fields.
- Copy improvements that do not change trading meaning.
- Backend bug fixes that only make an existing contract true.

## Next Codex-led slice

Codex should own the Talon intelligence hardening.

### 1. Talon lessons memory

Create durable, source-controlled lessons that Talon reads before drafting.

Proposed shape:

```text
data/research_lab/talon/strategy_lessons/*.yaml
data/research_lab/talon/exemplars/*.yaml
```

First lessons:

- Ape Wisdom seeded-attention lesson.
- Evaluation-window lesson.
- Minimum-evidence/trade-count lesson.
- Data-capability lesson.

First exemplar:

- The earlier SPY-beating momentum/regime-aware pattern Jacob and Codex found.
  Talon needs known-good examples, not just warning rules.

Implementation principle:

- Lessons should be summarized into the prompt, not dumped blindly forever.
- Lessons should be versioned and auditable.
- Every future run confusion should become either a lesson, a connector backlog
  item, an experiment-plan rule, or a UI truth panel.

### 2. Experiment plan contract

This is the load-bearing change.

Lessons are reactive. The experiment plan is proactive. It forces every drafted
strategy to answer: "How will this be judged?"

Open design choice for Codex:

- Embed `experiment_plan` in `StrategySpecV1`.
- Or create sibling `ExperimentPlanV1` keyed by `spec_id`.

Minimum fields:

```yaml
schema_version: research_lab.experiment_plan.v1
spec_id: spec_...
idea_id: idea_...
benchmark:
  symbol: SPY
  comparison_mode: both
windows:
  requested_start: 2026-01-07
  requested_end: 2026-04-30
  fresh_data_required_from: 2026-04-15
eras:
  mode: single
  required_era_ids: []
evidence_thresholds:
  minimum_trade_count: 5
  minimum_evaluated_trading_days: 20
decisive_verdict_rules:
  pass: "..."
  inconclusive: "..."
  fail: "..."
data_requirements:
  - capability_id: apewisdom_top100
    required: true
    status_at_draft: AVAILABLE
known_limitations:
  - "Ape Wisdom v1 uses seeded attention only; not a full historical replay."
```

Approval rule:

- A strategy spec should not advance to implementation unless its experiment
  plan exists and is internally consistent.
- Talon can draft sparse signal logic, but it cannot skip evaluability.

### 3. Connector backlog

When Talon wants data we do not have, persist it as backlog, not vibes.

Proposed shape:

```text
data/research_lab/data_connector_backlog/*.yaml
```

Fields:

- `capability_id`
- requested by `idea_id` / `spec_id`
- status: `UNAVAILABLE | PARTIAL | AVAILABLE`
- blocking strategies
- proposed connector/source
- required for backtest, live execution, or both

## Next Claude-led slice

Claude should continue job-page polish only if needed.

Do not mount Trade Atlas on campaign detail yet. Campaign Atlas needs a separate
product decision:

- current leader only?
- latest run only?
- top-N variants?
- one atlas per family?
- multi-era selector?

Until that is decided, campaign -> job -> atlas is the honest path.

## Review discipline

Before Codex pushes backend/contract changes:

- Import smoke for touched modules.
- Closest pytest file.
- Duplicate `def` grep.
- Artifact validation if JSON/YAML data changes.
- Claude review if operator-facing semantics changed.

Before Claude pushes UI changes that interpret trading data:

- `npx tsc --noEmit`.
- `npm run build` if routing/data loading changed.
- Verify live artifact fields appear on the page.
- Codex review if labels/gates/windows/benchmarks could make a weak run look
  stronger than it is.

## Practical next move

Codex should build the Talon lessons + experiment-plan foundation next.

Claude should stand by for:

- UX review of the experiment-plan contract.
- UI wiring once Codex lands the fields.
- Continued visual refinement of the job page after Jacob walks it.

Jacob should keep walking real flows. Every confusion should be classified as
one of:

- UI truth missing.
- Backend artifact missing.
- Talon lesson missing.
- Experiment-plan rule missing.
- Data connector missing.

That classification is the Research Lab learning loop.
