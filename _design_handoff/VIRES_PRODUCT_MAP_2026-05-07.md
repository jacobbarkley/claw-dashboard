# Vires Product Map

**Date:** 2026-05-07
**Status:** Durable handoff doc — represents the locked product taxonomy and sequencing principle as of 2026-05-07.
**Owners:** Jacob (product direction), Codex (backend / contracts / runtime), Claude (UX / dashboard / handoff narrative).

This doc captures **what Vires is being built into**, the five product lanes that make it up, and **the order they have to land** so the system stays trustworthy from internal preview through to public launch and eventual live trading.

It is meant to be referenced by every future build session — anything proposed for one lane should be checked against the sequencing principle below before scoping.

## The five product lanes

### 1. Guided Mode

Consumer-facing curated product. Users answer a short questionnaire, get matched to a curated `strategy_library` entry, accept disclosure, connect a paper broker account, and run paper trading against a *bench-validated, version-snapshotted* strategy.

- **Authoritative artifacts:** `strategy_library.v1`, `guided_match_proposal.v1`, `guided_enrollment.v1`, `disclosure_version.v1`, `notification_intent.v1`, `enrollment_events_view.v1`, `guided_enrollment_view.v1`.
- **Hard rules:** one enrollment = one library strategy; library entries must be `ACTIVE` (post-admission gate) before they appear publicly; all reads scoped through `ScopeTriple (user_id × account_id × strategy_group_id)`; user-state stays out of git-backed dashboard data.
- **Key sub-flows (deferred but designed):** decline flow, "maybe later" persistence, `request_re_questionnaire`, `request_rematch`, broker `RETRYABLE / ACTION_REQUIRED / INELIGIBLE` paths, `support_intervention` break-glass, `acknowledge_notice` / `reaffirm_consent`.
- **Where the line stays loud:** "ACTIVE enrollment ≠ ACTIVE library entry"; CANDIDATE library entries are visibly non-public; broker-pending is never enrollment success.

### 2. Advanced / Lab

Power-user authoring product. Talon-assisted spec drafting, packet-based experiment authoring, bench/campaign submission, and an explicitly *unbenchmarked* paper sandbox lane for in-flight experimentation.

- **Authoritative artifacts:** `advanced_sandbox_assignment.v1`, `sandbox_observation_bundle.v1`, packet contracts (research, spec, idea), bench/campaign contracts, `strategy_bank` / passport.
- **Hard rules:** **sandbox can execute on paper; sandbox history can inform bench; only bench can promote; only promoted strategies can enter Guided or live by default.** Sandbox status is `UNBENCHMARKED_TEMPLATE`, never "validated." Sandbox never gets a passport role or strategy-bank promotion directly.
- **Vocabulary discipline:** "enrollment" = Guided. "Sandbox / assignment" = Advanced. Different nouns across UI, contracts, code, routes, tables.
- **Promotion path:** sandbox → optional `sandbox_observation_bundle` attachment → bench/campaign submission → bench owns decisive verdict → if PASS, eligible for `strategy_library` curation.

### 3. Strategy Generation

How new candidate strategies enter the bench in the first place. Two parallel tracks, each produces strategies that compete through the same bench gauntlet.

- **Hybrid-curated track (today):** human-authored or Talon-assisted strategies, drafted via the Lab packet workflow, validated against the bench. `q076b_*` campaigns are the pattern.
- **Future autonomous-generation track:** LLM-assisted matcher v2 / Talon-as-strategy-author / autonomous experiment proposers. Behind a hard gate — does not ship until the hybrid-curated track produces a stable cadence of validated strategies AND Lab earns trust through Audit 1+ rigor.
- **Hard rule:** evidence tiering stays a typology, never a strength score. `BENCH_MULTI_ERA / SHADOW_FORWARD_OBSERVED / PAPER_FORWARD_PROMOTED / LIVE_OBSERVED / PAPER_FORWARD_SANDBOX` all answer different questions and are never collapsed.
- **Why two tracks:** every new strategy carries the regulatory-defensibility burden of "how did this come to be?" Hybrid-curated has a deterministic, auditable path. Autonomous generation does not — until it earns one.

### 4. Data Platform

Infrastructure substrate everything else stands on. Today this is a hybrid of git-backed public/static artifacts (strategy library, questionnaire, disclosures), local rebuild state for user-state during dev (`GUIDED_LOCAL_REBUILD_PATH`), and operator-feed JSON for the trading dashboard. Long-term it becomes a multi-tenant database with scoped per-user state, a non-git private store for user-specific records, and an event-sourced audit ledger.

- **Today (Phase 6.2):** public/static in `data/guided/`, user-state read-only via dev env override, no production user-state store.
- **Pre-public migration (T1+):** database for user/account/enrollment/proposal/event records; broker token vault; consent ledger; data retention/right-to-delete posture compliant with multi-tenant law; anonymization standard before any aggregate goes to a queryable surface.
- **Hard rule:** **no user-specific regulated/private state in git-backed artifacts** (PII, secrets, broker refs, consent events, per-user account state). Public/static/versioned state CAN live in git — strategy library definitions, disclosure templates, schema docs, curated copy, non-user fixtures, properly-anonymized aggregates.
- **The migration is the unblock for everything else.** Until it's done, Guided cannot reach public users; Advanced cannot host non-Jacob authors; Strategy Generation has no place to durably attribute provenance per user; Live Trading Readiness cannot consider live trading.

### 5. Live Trading Readiness

The set of legal, broker, monitoring, risk, consent, and audit rails that must be real before any user (including Jacob) routes real capital through any of this. Live unlock is the *latest possible* gate, not the next one.

- **Required rails:**
  - **Legal:** RIA / personalized-advice boundary settled with counsel; disclosure surface reviewed for securities-law adequacy; T_Q items closed (consent expiry cadence, anonymization k-threshold, data retention/delete posture).
  - **Broker:** real OAuth-mediated capability checks beyond paper; broker-side approval for live execution; `broker_capability_lost` runtime detection; capital-controls and circuit-breakers wired.
  - **Monitoring:** `guided_operator_monitoring.v1` aggregating per-strategy state across enrolled users; live-deviation alerts; intraday human-in-the-loop checkpoints; incident dashboards.
  - **Risk:** position-sizing rules tested against drawdown floors; explicit blast-radius caps per user; per-strategy `max_paper_capital` and `max_live_capital` carried in contract.
  - **Consent:** per-user re-acceptance for the live-capital transition; audit ledger of *who consented to what* with idempotency; reaffirmation cadence honored.
  - **Audit:** every command/event emission traceable; `audit_visibility=USER_VISIBLE` default for operator interventions; support_intervention treated as break-glass with audit gravity.
- **Hard rule:** **live unlock requires all six.** Skipping one unlocks none.

## The sequencing principle

> **Guided first to honest internal paper MVP; Advanced/Lab next with the same audit rigor; Strategy Generation hybrid-curated until Lab earns trust; database/user-state migration before public multi-tenant; live trading only after legal, broker, monitoring, risk, consent, and audit rails are real.**

Concretely, this means:

1. **Guided ships first to internal/preview paper.** That's the smallest vertical slice we've been building. It validates the contract surface, the read/write split, the projection layer, the multi-tenant scoping primitive, and the UX honesty disciplines (CANDIDATE vs ACTIVE, evidence tiering, mandate-fit, no hidden lanes). Until this is real, nothing else has a foundation to stand on.

2. **Advanced / Lab unlocks next, with the same audit rigor.** Phase 0 → freeze handshake → mocked Stage 2 → backend Phase 1–5 → Audit 0.5 → wired Phase 6 → Audit 1 — Lab gets the same gauntlet Guided just walked. Sandbox-vs-enrollment vocabulary discipline must be loud across UI, contracts, code, routes, tables before any non-internal user touches Lab. The wall phrase ("sandbox can execute on paper; only bench can promote") is the standing principle.

3. **Strategy Generation stays hybrid-curated until Lab earns trust.** Autonomous-generation tracks (LLM matcher v2, Talon-as-author, autonomous experiment proposers) are gated behind a stable cadence of *validated* hybrid-curated strategies. Lab earning trust = Audit 2+ pass with no recurring honesty findings, no evidence-tier flattening, no provenance contamination of bench. Premature autonomy creates regulatory exposure we can't defend.

4. **Database / user-state migration before any public multi-tenant launch.** Today's `GUIDED_LOCAL_REBUILD_PATH` pattern is dev-only by design. Per the multi-tenant law, no user-specific regulated state in git. The DB lands before non-internal users; the broker token vault, consent ledger, retention rules, and anonymization standard all land with it. Vercel's preview surface continues with labeled mock fallback in the meantime — that's correct production behavior, not a gap.

5. **Live trading only after the six readiness rails are real.** Legal, broker, monitoring, risk, consent, audit. Each of those is its own sub-program. Live unlock is the latest possible gate. The architecture supports it (mode taxonomy includes `LIVE_AUTONOMOUS`), but the architecture supporting something is not the same as the system being ready for it.

## Anti-patterns to actively avoid

These were named explicitly during the architecture dialog with Codex and remain operative:

- **Quiet deferral.** Anything pushed to "later" must land in a tier above (T1 / T2 / T3 / T_Q) with a trigger condition. No "we'll see."
- **Audit avoidance.** Each audit checkpoint is a hard event. If skipped, the next checkpoint inherits the prior one's findings as already-overdue.
- **Tier inflation.** Items don't get demoted between tiers without an explicit reason. T0 items don't quietly slide to T1 because the slice is taking longer than expected.
- **Evidence flattening.** No surface — UI, marketing, App Store description, landing page — can lead with a single performance number. Evidence is typology, never strength score.
- **Vocabulary collision.** "Enrollment" is Guided only. "Sandbox / assignment" is Advanced only. The same word in two state machines means a confused contract.
- **Skipping the bench.** Sandbox can execute on paper; sandbox history can inform bench; only bench can promote; only promoted strategies can enter Guided or live by default.

## What this map is not

- It is **not** a roadmap with dates. Sequencing is principled, not calendared.
- It is **not** a finished list of contracts. Contracts evolve; this map is the lane structure within which contracts live.
- It is **not** a substitute for the per-phase handoff docs. Each phase (Phase 0 freeze, Stage 2 mocks, Phase 6.x wiring, Audits 0.5/1/2/...) has its own durable handoff. This doc binds them together.

## When to consult this map

- **Before scoping new work:** which lane does the work live in? Does it respect the sequencing principle?
- **When something feels out of order:** is this premature? Is it pulling forward a lane that doesn't yet have its prerequisites?
- **When a contract change is proposed:** which lane owns it? What does the lane's hard rule say about the change?
- **When a UX or product question arises:** does this collapse the wall phrase, blur a vocabulary distinction, or flatten evidence?

## Living document

This is a durable handoff. Update it when:
- A new lane lands or an existing lane is renamed/restructured.
- The sequencing principle changes (i.e., the order of unlocks shifts because of regulatory, product, or technical pressure).
- A hard rule is amended (rare; should require explicit cross-team agreement).

Don't update it lightly — these are the load-bearing structural commitments.
