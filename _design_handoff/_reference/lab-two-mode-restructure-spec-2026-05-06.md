---
name: Lab two-mode restructure spec (2026-05-06)
description: Restructure Lab from 3 modes (guided/standard/advanced) to 2 modes (guided/advanced). Guided = robo-advisor on-ramp via questionnaire, paper-first, free. Advanced = current Lab + Talon path, cleaned up, paid tier. Non-custodial, broker-connected. Spec is a brainstorm draft, not yet handed to Codex.
type: project
originSessionId: b290cf04-5bf5-4d1d-ad6a-3420b24dedad
---
**Status:** Brainstorm doc captured 2026-05-06 after a prior conversation thread was lost. Shared with Codex; Codex's review captured below ("Codex review and architecture refinements"). Numbers, schemas, sequencing — all still open. The intent is direction-setting, not committed architecture.

## Codex dialog and architecture refinements (2026-05-06, four rounds)

Captured here so they don't get lost. Full dialog is in `~/claude/claw-dashboard/_design_handoff/CLAUDE_REVIEW_2026-05-06_lab_two_mode_response_to_codex.md`.

### Three-bucket sorting (Codex Round 4)

The 12 Round 3 additions sort into three buckets — this prevents the "build everything as v1 product scope" failure mode:

- **Adopt now as architecture (in v1 contracts):** `guided_match_proposal`, library lifecycle, disclosure materiality, notifications, retention posture, sandbox provenance filtering, cold-start evidence honesty.
- **Add to schema now, defer runtime (contract supports, v1 doesn't expose):** multi-strategy enrollment, cross-strategy capital governance, broker concurrency.
- **Add to launch checklist/process (not contract decisions):** disclosure empirical validation, legal review timing. Operator monitoring aggregation is *both* — contract definition is architecture, building/deploying is launch-readiness.

### Canonical lines (Codex Round 4)

```text
guided_match_proposal -> guided_enrollment -> monitored promoted strategy

advanced template/spec -> sandbox_assignment -> optional sandbox_observation_bundle -> bench submission -> possible promotion
```

### Standing principle (wall phrase, refined Codex Round 3)

> **Sandbox can execute on paper; sandbox history can inform bench; only bench can promote; only promoted strategies can enter guided or live by default.**

The "by default" is doing critical work. v1 strict, future graduation is a deliberate product/legal decision, not an accident of the schema. Treat as a constraint on every downstream design decision.

### Vocabulary rule (Codex Round 3)

"Enrollment" = guided. "Sandbox" / "assignment" = advanced. Enforced across UI, contracts, code, routes, tables. Mental model protection partly enforced by the type system.

### Load-bearing distinction (Codex Round 1, adopted)

> Advanced creates and validates strategies. Guided allocates a user to an already-curated strategy product on paper.

That sentence is the architecture. Everything below serves it.

### Final artifact shape (post Round 4)

- `strategy_library.v1` — consumer-facing curated layer. Only entries backed by real promotion evidence. Validates against registry/passport/manifest truth, links via `backing_strategy_id`. Consumer copy evolves independently from backing strategy code. Library entry has its own state machine: `ACTIVE` (eligible for matching), `PAUSED` (product-reasons freeze, e.g., regulatory inquiry, marketing freeze, copy update), `DEPRECATED` (no new matches but existing enrollments may continue), `RETIRED` (hidden from new users, exit/upgrade path needed). Library entry mutations need their own classification rule parallel to disclosure materiality.
- `guided_match_proposal.v1` — pre-acceptance state. Captures match rationale: questionnaire version, matcher version, library candidates considered and rejected, why winner was chosen. State machine: `PENDING_ACCEPTANCE`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `SUPERSEDED`. On accept, becomes an enrollment. Re-questionnaire creates a new proposal that supersedes prior ones. Codex cited `store.py:49` (governed campaign/nomination/approval queues) as precedent. Audit trail starts here, not at enrollment.
- `guided_enrollment.v1` — consumer-facing user-strategy relationship. **Singular**: one enrollment = one library strategy (corrected from Round 3 hedge — multi-strategy is N enrollments + future per-user allocation layer, NOT a list-of-strategies inside one enrollment). Bench-backed, version-snapshotted, paper first then live. Scoped via existing ScopeTriple (`user_id × account_id × strategy_group_id`) plus `broker_adapter`, `broker_connection_id`, `broker_account_ref`, `environment: PAPER|LIVE`, `library_entry_id`. Path/key scope validated against payload scope. Failure mode: `ACCEPTED_PENDING_BROKER` for partially-failed enrollment when broker paper account creation fails post-acceptance.
- `advanced_sandbox_assignment.v1` — power-user template experimentation. **Loud** UNBENCHMARKED_TEMPLATE status, paper-only, no passport role, no strategy-bank promotion, no live lane, no "validated" language. Carries per-assignment max paper capital / notional limits. To graduate, must go through bench/campaign/passport like everything else.
- `sandbox_observation_bundle` — exportable from sandbox for bench-submission attachment as supplemental forward evidence. Bench reconstructs from raw trade log + assignment config + code/version refs + canonical market data + broker paper fills. If not re-derivable, marked unverified supplemental evidence (narrative not scored).
- `disclosure_version` — immutable, append-only versions. Each carries `change_classification: MATERIAL | COSMETIC`. Material forces re-acceptance from existing enrollees; cosmetic logs an audit event without user interruption. Independent consent-validity-window concept may also be required for periodic re-confirmation regardless of change.
- `notification_intent` / `user_action_required` — durable events emitted by rebuild core. Dashboard / app service owns delivery adapters (in-app, email, push). Core does not become a mail/push provider.
- `guided_operator_monitoring.v1` — own contract, NOT `operator-feed.json`. Per-strategy aggregated views across all enrolled users (collective signal, aggregate paper P&L, strategy-level health KPIs). `operator-feed.json` may surface top-level summary projections later.
- `strategy_bank` / passport — unchanged. Only validated promotions.

Each artifact carries: evidence freshness fields (`last_evaluated_at`, `data_window_end`); idempotency key on consent/acceptance actions scoped `(user × action × proposal_id × device-or-session-token)`; PII/secrets separation discipline (refs, not raw tokens or unnecessary user data).

### Evidence tiering (the sharpest unlock — refined Round 4)

Never flatten into one "performance" blob. Always carry the tier explicitly to UI. **Tiers are a type label, not a strength score** — comparing tiers requires judgment, the system never tries to enforce a linear ordering (BENCH_MULTI_ERA and LIVE_OBSERVED have orthogonal strengths).

- `BACKTEST` — synthetic historical run on canned data
- `SHADOW_FORWARD_OBSERVED` — rebuild's shadow mode (renamed from SHADOW_OBSERVED in Round 4): live-time decision observation, real-time market data, no broker fills. Stronger than backtest (real-time signal context), weaker than paper (no execution truth).
- `BENCH_MULTI_ERA` — bench's formal multi-regime evaluation
- `PAPER_FORWARD_SANDBOX` — unbenchmarked sandbox paper run
- `PAPER_FORWARD_PROMOTED` — paper run of a promoted/validated strategy (guided enrollment paper period)
- `LIVE_OBSERVED` — real money in market

Each evidence record also carries `last_evaluated_at` and `data_window_end` for freshness — a stale BACKTEST is meaningfully weaker than a fresh one, and tier alone doesn't capture this.

This is the design choice that prevents the system from ever flattening into a "we promise good returns" pitch. First-class principle, not implementation detail.

### State machines (Codex Round 3 + Claude Round 3 extensions)

**Backing-strategy state for enrollments:**
`UPGRADE_AVAILABLE`, `UNDER_REVIEW` (Claude addition: anomaly detected, freezes new enrollments, existing continue), `DEPRECATED`, `FORCED_EXIT_PENDING`, `NO_LONGER_SUPPORTED`.

**Library entry state:**
`ACTIVE`, `DEPRECATED`, `RETIRED`. Independent of backing-strategy state.

**Disclosure version state:**
Each version carries `change_classification: MATERIAL | COSMETIC`. Material change forces re-acceptance.

### Required primitives and constraints (post Round 4)

**Kill switch / exit policy clarity:** Three explicit choices, contract enforces selection, never left to UI copy:
- `pause` — existing positions stay, no new entries
- `stop_hold_to_close` — terminate state, positions close per strategy rules
- `stop_liquidate` — terminate state, close all positions immediately

User-initiated and system-initiated may have different defaults. Different audit requirements for each.

**Per-sandbox-assignment capital limits** (notional / paper capital max). Power-user freedom needs blast-radius controls.

**Notification ownership split (Codex Round 4):**
- Rebuild core emits durable `notification_intent` / `user_action_required` events.
- Dashboard / app owns delivery adapters (in-app, email, push).
- Core does not become a mail/push provider.

**Operator monitoring aggregation layer** — `guided_operator_monitoring.v1` (own contract). Per-strategy view across all enrolled users. `operator-feed.json` may show top-level summary projections later.

**Data retention / right-to-delete posture** — finalization waits for counsel, but contract plan adds `retention_class`, `delete_behavior`, "contains broker/user data?" flags now.

**PII/secrets separation (Codex Round 4 — hard constraint):**
- Contracts hold refs (user_id, account_id, broker_connection_id), never raw OAuth tokens, API keys, or unnecessary PII.
- **Existing `push-dashboard-data.sh -> GitHub -> Vercel` pattern is fundamentally incompatible with multi-tenant.** No user PII can live in git-backed artifacts once N users land. Concrete blocking constraint on the multi-tenant migration plan, not soft guidance.

**Account capability gate (Codex Round 4):**
- Pre-enrollment validation: paper/live, asset class, fractional shares, options approval, crypto availability, cash/margin constraints.
- **Runtime invariant** (Claude extension): broker capabilities can change after enrollment (options approval revoked, account moved cash<->margin, broker drops crypto). Continuous verification, with state transitions when capability is lost. Never auto-liquidate from capability loss alone.

**Idempotent acceptance (Codex Round 4):**
- All consent/acceptance/state-change actions carry stable idempotency keys.
- Key scope: `(user × action × proposal_id × device-or-session-token)`. Cross-device retries safe; cross-device intentional duplicate actions still possible.

### Copy boundary (Codex Round 3)

Sandbox UI says "paper experiment" or "your test configuration." Never "strategy product," "recommended," or "validated." Connects directly to the personalized-advice legal flag.

### Versioning rule (Codex Round 2)

Enrollments snapshot exact backing version: `library_entry_id`, `library_entry_version`, `backing_record_id`, `execution_manifest_id`, `strategy_parameters_hash`, `matcher_version`, `disclosure_version`. Mirrors existing `strategy_bank` (`record_id`, `variant_id`, `supersedes_record_id`, append-only selection events) and `execution_manifest` (`manifest_id`, `deployment_config_id`, source evidence) patterns. No implicit material upgrades. New backing version surfaces `UPGRADE_AVAILABLE`; user must explicitly accept.

### Validator origin (Codex Round 2)

Canonical contracts live in trading-bot rebuild repo, dashboard mirrors. Same pattern as `research_lab` contracts. Dashboard owns UI/API handlers and TypeScript read models, but contract origin is rebuild core.

### Matcher posture (Codex Round 1)

- Rules-first, deterministic, versioned I/O. "questionnaire v1 + matcher v1 → library item X because tags Y matched." Auditable.
- Talon does NOT choose the consumer's strategy in v1. Talon stays in advanced authoring; could be a why-this-fits explainer on top of a rules-based match in v2.
- Rules-first is probably also the better legal posture (cleaner publisher-exemption story than LLM-driven personalization).

### Existing bench archetypes that seed both library and templates

regime-aware momentum, post-earnings drift, defensive value/pullback, BTC managed exposure, BTC momentum/tactical overlay. Library and templates are not greenfield.

### Critical legal flag (Codex Round 1)

> Biggest risk: accidentally making guided look like personalized financial advice before legal/disclosure/product boundaries are ready.

Bumps the legal-conversation timing. Personalized advice is a separate regulatory threshold from custody and from paper-vs-live, and it triggers earlier. The legal conversation belongs **before guided MVP launches publicly to App Store users**, not just before live trading. Disclosure surface design is partly UX, partly legal-defensibility infrastructure.

### Open items (post Round 4)

Resolved Round 4:
- ~~`match_proposal` precedent~~ — mirror governed requests/nomination/approval patterns (`store.py:49`)
- ~~Notification primitive ownership~~ — rebuild emits events, dashboard/app owns delivery
- ~~Operator monitoring aggregation contract~~ — own contract `guided_operator_monitoring.v1`
- ~~`SHADOW_OBSERVED` tier decision~~ — own tier, renamed `SHADOW_FORWARD_OBSERVED`
- ~~Sandbox provenance filtering approach~~ — re-derive from raw log; non-re-derivable cases marked unverified narrative evidence

Still open, queued for Codex Round 5 (or for design-pass after architecture lock):

- Sandbox lifecycle — auto-expire vs persistent? Sandbox-to-bench-submission conversion path or always re-author?
- `UPGRADE_AVAILABLE` acceptance contract — exact fields enrollment captures at the consent event for defensibility
- Enrollment audit trail schema — disclosure version shown, what user clicked through, when (separate from version snapshot)
- Disclosure empirical validation — process item; usability test that real users grasp drawdown headline + paper/live distinction + "not guaranteed" language
- Cold-start evidence honesty per library entry — disclosure surface must reflect which evidence tiers are populated, with explicit "0 days observed"
- v1 product surface for multi-strategy — schema is singular (one enrollment = one strategy); does v1 expose enrollment in multiple strategies, or single only?
- Cross-strategy capital governance — per-user allocation layer above per-enrollment limits when multi-strategy goes live
- Broker concurrency at runtime — subaccounts vs account-level coordinator vs explicit netting/conflict rules when multi-strategy ships
- Time-decay of evidence (Claude Round 4) — `last_evaluated_at` and `data_window_end` semantics on every evidence record
- Disclosure consent expiry (Claude Round 4) — periodic re-confirmation independent of disclosure version change; schema may need consent-validity-window
- Test/ops/tooling sequencing (Claude Round 4) — 7+ contracts can't ship simultaneously; which v1 MVP requires vs schema-defined-but-deferred
- Library entry mutation classification (Claude Round 4) — backing_strategy_id change is material, friendly_name is debatable, coverage_tags is silent
- Match-decline UX (Claude Round 4) — schema has DECLINED state, product behavior undefined (re-questionnaire, next-best entry, prompt for what was wrong?)
- Data retention / right-to-delete finalization — waits for counsel; contract plan carries flags now

### Citations to verify before implementation

Codex's reply cites `strategy_bank.py:1`, `execution_manifest.py:1`, `research-lab-contracts.ts:1`, `models.py:1`, `paths.py:1`. Plausible since Codex owns the rebuild repo, but worth a quick verify when this lands in implementation.

## Vision

Lab today is functionally one product (strategy authoring) presented as three undifferentiated modes. The restructure collapses to **two products** that share a backend but feel like distinct app surfaces:

- **Guided mode** = robo-advisor on-ramp. New users answer a financial-advisor-style questionnaire, the system matches them to a strategy from a curated library, paper-trading begins immediately. Friendly names, plain-English thesis, no `regime_aware_momentum::stop_5_target_15`-style technical surface.
- **Advanced mode** = current strategy-authoring path, cleaned up, gated behind a paid tier. Talon synthesis, Strategy Authoring Context Packet, ideas-page walkthroughs all continue.

Lab also gets repositioned in the app IA — no longer the buried third tab in Bench. Guided becomes the front door for new users.

## What stays the same (explicitly)

This restructure is **additive, not destructive.** Do not delete or replace:

- Talon strategy synthesis + clarification flow (commit `bbd93bc1`)
- Strategy Authoring Context Packet build (Codex backend pending — see strategy-authoring-context-packet-pivot-2026-05-04.md)
- Operator walkthroughs (paused, resume when fixture suite green)
- Existing Lab idea form, strategy-id alignment work, status transitions, equity-swarm graph
- Bench leaderboard, campaigns, promotion workflow
- All current backend artifact contracts (`research_lab.equity_swarm.v1`, candidate.v1, result.v1, etc.)

## Two modes — quick comparison

|  | Guided | Advanced |
|---|---|---|
| **Audience** | New users, broad consumer | Power users, builders, researchers |
| **Primary action** | Questionnaire → matched strategy | Author/template a strategy |
| **Pricing** | Free (paper) / paid (live) | Paid tier (paper + live) |
| **Strategy source** | Curated library | User-authored or template |
| **Visibility** | Friendly name + plain-English thesis + drawdown headline | Full technical surface |
| **Status** | New build | Cleanup of existing |

## Guided mode flow

1. **Questionnaire** — financial-advisor-style, deterministic mapping initially (Talon optional later):
   - Risk profile (conservative / balanced / risk-on)
   - Drawdown tolerance, asked separately ("how would you feel about a -20% month?") — people over-report risk tolerance until they see the number
   - Asset class preference (ETFs / stocks / crypto)
   - Time horizon (months / years / retirement)
   - Capital + cadence (lump sum vs recurring contributions)
2. **Match** to a strategy from the curated library based on coverage tags
3. **Preview** — friendly name, one-paragraph thesis, max historical drawdown as headline number, asset class, holding period, optional "show technical details" expansion
4. **Connect broker** — paper account first, OAuth where available, non-custodial always
5. **Run paper** — user sees performance vs benchmark; live unlock requires paid tier + (eventually) approved live launch

## Advanced mode additions

Existing Lab flow continues. Two additions:

1. **Templates** — archetype-based strategy starters (momentum, mean-reversion, breakout, regime overlay are illustrative, not the canonical list). User picks a template, supplies whatever universe they want (any number of tickers, any asset class the template supports), tunes parameters. This is the unlock for the lower-friction "I have something specific I want traded for me" path without forcing full strategy authoring. Templates are an *additional entry point*, not a replacement for Talon synthesis. Specific archetypes, parameter surfaces, and constraints are open for design.
2. **Cleanup** — friendliness pass + repositioning per the queued Claude Design review (lab-redesign-thread-2026-04-27.md)

## Strategy library — load-bearing new component

Without this, guided mode doesn't exist.

**Per-strategy schema (sketch — fields and names all open):**
- `friendly_name` — consumer-facing (something like "Steady Tide", not `regime_aware_momentum`)
- `thesis_plaintext` — one paragraph, jargon-free
- `risk_tier`
- `asset_class`
- `holding_period`
- `capital_floor` — minimum to deploy meaningfully
- `max_historical_drawdown` — headline disclosure number
- `coverage_tags` — consumed by matching engine
- `backing_strategy_id` — link to actual strategy in registry
- `bench_record` — must have passed bench gauntlet

**Coverage framing — open, do not lock yet.** The right framing is probably "cover meaningful combinations of risk × asset class × horizon" rather than "ship N strategies." But what dimensions matter, what cells need coverage at launch, and how many strategies that implies — all to be decided after audits and conversations with all parties (Jacob, Codex, OpenClaw). Treat any specific count or matrix shape elsewhere in this doc as illustrative, not committed.

**Inclusion criteria — also open.** Direction: bench-validated, multiple regime exposures, drawdown verified, plain-English thesis written. Specific thresholds and gauntlet shape TBD.

## Matching engine

- **v1: deterministic rules.** Questionnaire answers → coverage tags → filter → rank. No LLM. Easier to defend, debug, disclose.
- **v2 (deferred): LLM-assisted matching** if rules produce awkward edge cases. Talon could be re-used here.
- **Blending: parked.** Single-strategy match for v1. Revisit after launch.

## Disclosure surface

Non-negotiable. "Show, don't obfuscate."

Every guided user sees about their matched strategy:
1. Friendly name + thesis paragraph
2. **Max historical drawdown as the headline number**, not annualized return — drawdown leads (this also pre-defends against angry-user lawsuits: they saw the worst case before they signed up)
3. Asset class, holding period, typical trade frequency
4. "Show technical details" expansion for the curious — actual strategy ID, params, full backtest

Required additionally (legal-driven):
- Past performance disclosure boilerplate
- Risk language per asset class
- Paper vs live distinction made unambiguous

## Broker connection

**Non-custodial. Always.** Funds stay in user's brokerage account.

- **Alpaca:** OAuth available, smoothest. Launch broker.
- **Robinhood:** no public retail API; partnership program exists, approval is real work. Scope early, don't block v1.
- **Plaid:** evaluate as aggregation layer for multi-broker support — open whether it covers trade execution or only data.
- **API key fallback:** only if OAuth not available. Plan to phase out.

## Paper-first launch posture

**MVP launches paper-only.** Live trading enabled later, after:
- Strategy library has a defensible coverage matrix
- RIA / legal conversation completed (securities lawyer, not just general counsel)
- Disclosure surface reviewed by counsel
- (Likely) per-user paper history minimum before live unlock

Paper-first buys: real user feedback, real strategy track records under live market data, time for legal, a clean live-launch story. **Set a public horizon for live launch** so users know it's coming, not vaporware.

## Pricing (placeholder — direction only)

- Free: paper-only guided
- Paid tier 1: live guided + paper Lab access
- Paid tier 2: live Lab/advanced, multiple concurrent strategies, advanced features

No ads. Subscription-based. Tier specifics deferred.

## Legal posture

Deferred — Jacob will engage a securities attorney before live launch, not before. Paper-first MVP buys the runway to handle this properly. Two things to keep in mind so the architecture doesn't paint into a corner:
- Non-custodial avoids the worst regulatory bucket (custody) but doesn't automatically clear the personalized-advice / RIA question.
- Disclosure surface design (drawdown headline, plain-English thesis, paper/live distinction) is partly a UX choice and partly a future legal-defensibility choice. Worth designing it right the first time.

Not a topic to dwell on now — flagged so the brainstorm doesn't accidentally make decisions that are expensive to undo.

## IA / repositioning

The "Lab is buried under Bench" concern dissolves once guided mode exists — guided becomes the new-user front door. Open question for design pass:
- Does Lab stay nested under Bench with guided promoted to its own app-shell surface?
- Or does the whole Lab concept get re-skinned (guided as default landing, advanced as deep section)?

Defer to queued Claude Design review.

## Open items — all on the table for brainstorming

Nothing here is decided. Listing so they don't get lost.

1. Strategy library — coverage dimensions, what's worth covering at launch, how many strategies that implies. No locked numbers.
2. Matching engine — deterministic rules vs LLM-assisted; does Talon belong here at all
3. Friendly naming convention — who writes names + theses, what voice
4. Disclosure surface UI — what users see at preview, what lives behind "show technical details"
5. Template archetypes for advanced mode — what families, what parameters
6. How Talon ideas-page work composes with templates (probably fine, worth confirming)
7. IA placement — Lab nested under Bench vs promoted to its own surface
8. Onboarding UX — questionnaire → match → broker connect flow design + ownership
9. Broker connection — Alpaca first is uncontroversial; Plaid evaluation, Robinhood scoping
10. Paper-first horizon — how long, what triggers the live unlock
11. Pricing tier specifics — defer
12. Blending — parked, revisit trigger TBD
13. Legal — deferred to securities attorney, not on the brainstorming agenda

## Sequencing — brainstorm sketch only

Not a build plan. A "if we did this, roughly in what order would the dependencies fall out" sketch. Real sequencing happens after the brainstorm settles.

- Continued brainstorming with Codex (and OpenClaw on doctrine)
- Direction-setting on the open items above
- Strategy library shape — once direction agreed, then schema, then first entries from existing bench-passed strategies as proof of pipeline
- Matching engine — only meaningful once the library has shape
- Questionnaire UI + disclosure surface — design work that can begin in parallel once the library framing exists
- Broker connection — Alpaca paper first, OAuth flow
- End-to-end guided MVP walkthrough on paper
- Expand, iterate, eventually approach live launch posture

Advanced mode template work runs in parallel and is independent of the guided MVP path. Existing Talon / Strategy Authoring Context Packet work continues unblocked regardless.

## Origin

Conversation 2026-05-06. Earlier thread with OpenClaw was lost when the page closed; reconstructed from Jacob's Wispr-saved messages. Both threads from 2026-04-27 (lab-redesign-thread) and 2026-05-04 (strategy-authoring-context-packet-pivot) compose with this — this is the bigger product reframe those threads were converging toward.
