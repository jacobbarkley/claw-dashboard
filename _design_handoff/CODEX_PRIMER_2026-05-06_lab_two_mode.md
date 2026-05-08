# Codex primer - Lab two-mode restructure (brainstorm)

**Date:** 2026-05-06
**From:** Claude, capturing a brainstorm with Jacob
**For:** Codex
**Scope:** Direction-setting brainstorm on collapsing the Lab from three modes (guided / standard / advanced) to two (guided / advanced). Not a locked spec. The intent of this doc is to align on direction and surface what still needs deciding, so the next brainstorm session has shared ground.

## TL;DR

- Lab today is functionally one product (strategy authoring) wearing three undifferentiated mode labels. Collapse to two products that share a backend but feel like distinct surfaces.
- **Guided mode** = robo-advisor on-ramp. Questionnaire -> matched strategy from a curated library -> paper trading. Friendly names, plain-English thesis. Free for paper.
- **Advanced mode** = the Lab you and Claude have been building. Strategy authoring via Talon, Strategy Authoring Context Packet, ideas-page walkthroughs, the works. Cleaned up, paywalled. Adds a templates entry point.
- This is **additive**. Nothing currently in flight gets deleted or replaced. Talon synthesis, the packet pivot, the walkthrough harness, equity swarm, bench/passport/promotion - all continue.
- Non-custodial. Funds stay in the user's own brokerage.
- Paper-first MVP. Live trading lives behind a future paid tier and a real legal conversation, not on the immediate roadmap.

## Your in-flight work continues unblocked

Calling this out first so it is unambiguous. None of the following is at risk:

- Talon strategy synthesis + clarification flow (`bbd93bc1` branch state)
- Strategy Authoring Context Packet build - the backend wishlist from
  `strategy-authoring-context-packet-pivot-2026-05-04` is still the priority
  for advanced mode quality
- Operator walkthroughs (paused per the 2026-05-04 pivot, resume when fixture
  suite is green)
- Existing Lab idea form, strategy-id alignment, status transitions
- Equity swarm (`research_lab.equity_swarm.v1`) and Trade Atlas
- Bench leaderboard / campaigns / passport promotion
- All current artifact contracts (`candidate.v1`, `result.v1`, etc.)
- Packet authoring walkthrough harness (`CODEX_PRIMER_2026-05-04_packet_walkthrough_harness.md`)

Guided mode is **net-new on top**. It does not retire any of the above.

## Why now

Two threads converge here:

1. **`lab-redesign-thread-2026-04-27`** flagged that Lab feels buried as a third Bench tab and reads engineer-y to consumer users. The repositioning question was open.
2. **2026-05-04 walkthrough** surfaced that Talon synthesis quality (not UI polish) is the real bottleneck for the advanced authoring path, leading to the packet pivot.

Both threads were converging toward a bigger product reframe: the authoring path is the power-user product, and consumer users need a different on-ramp entirely. This doc captures that reframe.

## The two modes

### Guided mode (new)

Audience: new users, broad consumer App Store install base.

Flow:

```text
questionnaire -> match -> preview -> connect broker (paper) -> run
```

Questionnaire is financial-advisor style. Direction (not locked):

- risk profile (conservative / balanced / risk-on)
- drawdown tolerance, asked separately from risk profile
- asset class preference
- time horizon
- capital + cadence (lump sum vs recurring)

Initial implementation can be deterministic mapping. Talon could enter later if rules produce awkward edges, but rules-first is easier to defend, debug, and disclose.

Match returns a single strategy from a curated library (blending parked for v1).

Preview is the **disclosure surface** - friendly name, one-paragraph plain-English thesis, **max historical drawdown as the headline number** (not annualized return), asset class, holding period. "Show technical details" expansion exposes the actual `backing_strategy_id`, params, full backtest for the curious user.

Broker connection: paper account first, OAuth where supported, non-custodial always.

### Advanced mode (cleanup of existing)

Audience: power users, builders, researchers. Paid tier.

Two additions on top of what exists today:

1. **Templates** - archetype-based strategy starters. User picks a template, supplies whatever universe they want (any number of tickers, any asset class the template supports), tunes parameters. Lower-friction entry point than full Talon synthesis. Templates do not replace Talon synthesis; they are an additional way in. Specific archetype list and parameter surfaces are open for design.
2. **Cleanup pass** - friendliness + repositioning per the queued Claude Design review.

Everything currently being built for the authoring path - Talon, packet retrieval, clarification, section confidence, fixture suite - serves advanced mode. Keep going.

## Strategy library (load-bearing new artifact)

Without this, guided mode does not exist. Treat the schema as a sketch, not a spec.

Per-strategy fields, illustrative:

- `friendly_name` - consumer-facing
- `thesis_plaintext` - one paragraph, jargon-free
- `risk_tier`
- `asset_class`
- `holding_period`
- `capital_floor`
- `max_historical_drawdown` - the headline disclosure number
- `coverage_tags` - consumed by matching engine
- `backing_strategy_id` - link to the actual strategy in the registry
- `bench_record` - must have passed bench

**Coverage framing is open.** "Cover meaningful combinations of risk x asset x horizon" is roughly the right shape, but what dimensions matter, what cells need coverage at launch, and how many strategies that implies are all to be decided after audits and conversations. Do not lock numbers yet.

Inclusion criteria are also open. Direction: bench-validated, multiple regime exposures, drawdown verified, plain-English thesis written and reviewed.

## Matching engine

- v1 deterministic rules. Questionnaire answers -> coverage tags -> filter library -> rank.
- v2 deferred. LLM-assisted matching only if rules produce edges that are awkward to defend. Talon could be reused.

Open question: does Talon belong in the matching engine at all, or only in advanced authoring? Worth a brainstorm.

## Templates in advanced mode

Templates are a separate surface from Talon-authored strategies. The user supplies whatever universe they want, picks a template archetype, tunes parameters. Examples of archetypes (illustrative, not canonical): momentum, mean-reversion, breakout, regime overlay. The actual list, parameter surfaces, validation, and how templates compose with existing strategy registry conventions are all open.

Templates need to compose cleanly with the Talon ideas-page path - probably fine, worth confirming when we get to it.

## Disclosure surface

The "show, do not obfuscate" principle. Non-negotiable in spirit, design open.

What every guided user sees:

1. Friendly name + thesis paragraph
2. Max historical drawdown as the headline
3. Asset class, holding period, typical trade frequency
4. "Show technical details" expansion - actual strategy id, params, backtest

Required additionally (legal-driven):

- Past performance disclosure
- Risk language per asset class
- Paper vs live distinction unambiguous

Designing this surface right the first time matters because it is partly UX, partly future legal-defensibility.

## Broker connection

Non-custodial. Funds stay in the user's brokerage account.

- **Alpaca** - OAuth, smoothest. Launch broker.
- **Robinhood** - no public retail API. Partnership program exists, approval is real work. Scope early, do not block v1.
- **Plaid** - evaluate as aggregation layer. Open whether it covers trade execution or only data.
- **API key fallback** - only if OAuth is unavailable. Plan to phase out.

## Paper-first launch posture

MVP launches paper-only. Live trading enabled later, after:

- Strategy library has a defensible coverage shape
- Disclosure surface reviewed
- Securities-attorney conversation completed
- Some per-user paper history before live unlock (form TBD)

Paper-first buys real user feedback, real strategy track records under live market data, time for legal, and a clean live-launch story. Public horizon for live launch should be set so users know it is coming, not vaporware.

## Pricing direction (placeholder)

Direction only, no specifics:

- Free: paper-only guided
- Paid tier 1: live guided + paper Lab access
- Paid tier 2: live Lab/advanced, multi-strategy, advanced features

No ads. Subscription-based. Defer specifics.

## Legal posture

Deferred. Jacob will engage a securities attorney before live launch, not before. Two things to keep in mind so architecture does not paint into a corner:

- Non-custodial avoids the worst regulatory bucket (custody) but does not automatically clear the personalized-advice / RIA question.
- Disclosure surface design carries future legal weight as well as UX weight.

Not a topic to dwell on now. Flagged so the brainstorm does not accidentally make decisions that are expensive to undo.

## IA / repositioning

The "Lab is buried under Bench" concern dissolves once guided mode exists, because guided becomes the new-user front door. Open question for design pass:

- Does Lab stay nested under Bench with guided promoted to its own app-shell surface?
- Or does the whole concept get re-skinned (guided as default landing, advanced as a deep section)?

Defer to queued Claude Design review.

## Open items - all on the table

Nothing here is decided. Listing so they do not get lost between sessions.

1. Strategy library coverage dimensions, what is worth covering at launch, count implied
2. Matching engine - deterministic rules vs LLM-assisted; does Talon belong here
3. Friendly naming convention - who writes names + theses, what voice
4. Disclosure surface UI - preview screen and "show technical details" expansion
5. Template archetype list and parameter surfaces for advanced mode
6. How Talon ideas-page work composes with templates
7. IA placement - Lab under Bench vs promoted to its own surface
8. Onboarding UX - questionnaire -> match -> broker connect ownership and design
9. Broker connection - Plaid evaluation, Robinhood scoping
10. Paper-first horizon and live unlock trigger
11. Pricing tier specifics (deferred)
12. Blending - parked, revisit trigger TBD
13. Legal - deferred to securities attorney, not on the brainstorming agenda

## Sequencing - brainstorm sketch only

Not a build plan. A "if we did this, roughly in what order would dependencies fall out" sketch.

- Continued brainstorming with Codex (and OpenClaw on doctrine)
- Direction-setting on the open items above
- Strategy library shape - schema, then first entries from existing bench-passed strategies as proof of pipeline
- Matching engine - meaningful only once the library has shape
- Questionnaire UI + disclosure surface - design work that can begin in parallel once the library framing exists
- Broker connection - Alpaca paper first, OAuth flow
- End-to-end guided MVP walkthrough on paper
- Expand, iterate, eventually approach live launch posture

Advanced mode template work runs in parallel and is independent of the guided MVP path. Talon and Strategy Authoring Context Packet work continue unblocked regardless.

## What we want from you next

Not a build request. A brainstorming partner read.

- Architecture sanity check on guided as a separate product on top of the existing backend.
- Where does this collide with anything you have planned that we have not seen?
- The matching-engine question (rules vs Talon) is the most interesting open one - first instinct?
- Strategy library schema - does the sketch above compose cleanly with the strategy registry, or does it need its own table / store?
- Templates in advanced mode - are there obvious archetypes already implied by the strategies on the bench, or is this genuinely greenfield?

Open to disagreeing with any framing in this doc. Treat it as a starting point, not a contract.
