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
- **Private by default:** user-created Lab strategies are private to the user. Validation does not equal permission. See the cross-lane principle below.
- **Vocabulary discipline:** "enrollment" = Guided. "Sandbox / assignment" = Advanced. Different nouns across UI, contracts, code, routes, tables.
- **Promotion path:** sandbox → optional `sandbox_observation_bundle` attachment → bench/campaign submission → bench owns decisive verdict → if PASS, eligible for `strategy_library` curation **only via the contribution lane** for user-authored strategies.

### 3. Strategy Generation

How new candidate strategies enter the bench in the first place. Two parallel tracks, each produces strategies that compete through the same bench gauntlet.

- **Hybrid-curated track (today):** human-authored or Talon-assisted strategies, drafted via the Lab packet workflow, validated against the bench. `q076b_*` campaigns are the pattern. User-authored strategies enter the curated track only via the contribution lane (see cross-lane principle below) — never silently from a private Lab assignment.
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

## Cross-lane principle: Lab strategy ownership and reuse

**User-created Lab strategies are PRIVATE BY DEFAULT. Validation does not equal permission.**

A user strategy being bench-passed, promoted, or evidence-rich does not automatically grant Vires the right to:
- use it in Guided
- expose it to Talon as a reference
- train or tune on it
- create derivative strategies from it
- market it
- distribute it to other users

### Allowed by default (no explicit consent needed)

- Store and process the strategy for the user's own Lab workflow
- Run backtests / bench / paper monitoring for that user
- Show the user their own results
- Use operational metadata needed to provide support, security, or compliance

Anything broader requires an explicit contribution / license flow.

### Future contribution lane

A user strategy moves through these states only with explicit consent at each step:

```
PRIVATE
  → CONTRIBUTED_FOR_REVIEW   (user submits for potential broader use)
  → LICENSED_REFERENCE       (terms agreed; Vires/Talon may reference)
  → GUIDED_LIBRARY_CANDIDATE (admission gate begins)
  → GUIDED_LIBRARY_ACTIVE    (post-admission, public-facing)
```

Each transition is a deliberate user-driven act, not an automatic consequence of bench performance.

### Contribution flow questions (explicit, per user, per strategy)

- Can Vires use this in Guided?
- Can Talon reference it (as inspiration / template / training input)?
- Can Vires create derivatives from it?
- Is attribution anonymous, credited by name, or company-only?
- Is compensation none, bounty, revenue share, or custom?
- Can the user revoke future use?
- What happens to already-enrolled users if the user revokes permission?

### Talon reference set rule

Talon may reference **only**:
- Company-owned strategies
- Public / template strategies
- Explicitly licensed user strategies (post-`LICENSED_REFERENCE`)
- Properly anonymized aggregate lessons

Talon **must not** browse private user strategies as inspiration, training input, or context.

### Guided rule

Using a user-created strategy in Guided requires the strongest possible consent path:
- Operator approval
- Legal review
- Evidence packaging
- Disclosure packaging
- Stable admission through the library entry lifecycle (`GUIDED_LIBRARY_CANDIDATE` → `GUIDED_LIBRARY_ACTIVE`)

Guided **must not** consume private Lab strategies directly. The contribution lane is the only path in.

### Trust copy principle

> **Your Lab strategies are private unless you submit them.**

This must eventually become visible product language — surfaced in onboarding, in Lab UI, on the contribution flow itself — not buried in a terms-of-service clause.

### Why this matters

The single biggest trust failure mode for an AI-assisted strategy lab is the user thinking "I'm experimenting privately" while the system silently uses their work for training, marketing, derivatives, or other users' Guided matches. That failure mode is regulatory exposure (consent / data rights), reputational damage (trust collapse), and product damage (users stop using Lab once they suspect they're being mined).

Private-by-default is the simple rule that prevents all three. Validation does not equal permission. Bench-passing a strategy does not consent to its use in Guided. Building an LLM context for Talon does not include private user strategies. Aggregating across users requires a real anonymization standard before a single number reaches a queryable surface.

## The sequencing principle

> **Guided first to honest internal paper MVP; Advanced/Lab next with the same audit rigor; Strategy Generation hybrid-curated until Lab earns trust; database/user-state migration before public multi-tenant; live trading only after legal, broker, monitoring, risk, consent, and audit rails are real.**

Concretely, this means:

1. **Guided ships first to internal/preview paper.** That's the smallest vertical slice we've been building. It validates the contract surface, the read/write split, the projection layer, the multi-tenant scoping primitive, and the UX honesty disciplines (CANDIDATE vs ACTIVE, evidence tiering, mandate-fit, no hidden lanes). Until this is real, nothing else has a foundation to stand on.

2. **Advanced / Lab unlocks next, with the same audit rigor.** Phase 0 → freeze handshake → mocked Stage 2 → backend Phase 1–5 → Audit 0.5 → wired Phase 6 → Audit 1 — Lab gets the same gauntlet Guided just walked. Sandbox-vs-enrollment vocabulary discipline must be loud across UI, contracts, code, routes, tables before any non-internal user touches Lab. The wall phrase ("sandbox can execute on paper; only bench can promote") is the standing principle.

3. **Strategy Generation stays hybrid-curated until Lab earns trust.** Autonomous-generation tracks (LLM matcher v2, Talon-as-author, autonomous experiment proposers) are gated behind a stable cadence of *validated* hybrid-curated strategies. Lab earning trust = Audit 2+ pass with no recurring honesty findings, no evidence-tier flattening, no provenance contamination of bench. Premature autonomy creates regulatory exposure we can't defend.

4. **Database / user-state migration before any public multi-tenant launch.** Today's `GUIDED_LOCAL_REBUILD_PATH` pattern is dev-only by design. Per the multi-tenant law, no user-specific regulated state in git. The DB lands before non-internal users; the broker token vault, consent ledger, retention rules, and anonymization standard all land with it. Vercel's preview surface continues with labeled mock fallback in the meantime — that's correct production behavior, not a gap.

5. **Live trading only after the six readiness rails are real.** Legal, broker, monitoring, risk, consent, audit. Each of those is its own sub-program. Live unlock is the latest possible gate. The architecture supports it (mode taxonomy includes `LIVE_AUTONOMOUS`), but the architecture supporting something is not the same as the system being ready for it.

## Deferred obligations

The active ledger for temporary-but-intentional behavior is
`_design_handoff/VIRES_DEFERRED_OBLIGATIONS_LEDGER.md`.
Any future slice that ships preview, mock, single-tenant, non-persistent,
or otherwise non-final behavior must add or update a ledger row with a
tier, trigger, and closure evidence before merging.

## Anti-patterns to actively avoid

These were named explicitly during the architecture dialog with Codex and remain operative:

- **Quiet deferral.** Anything pushed to "later" must land in the deferred obligations ledger with a tier (T1 / T2 / T3 / T_Q), trigger condition, and closure evidence. No "we'll see."
- **Audit avoidance.** Each audit checkpoint is a hard event. If skipped, the next checkpoint inherits the prior one's findings as already-overdue.
- **Tier inflation.** Items don't get demoted between tiers without an explicit reason. T0 items don't quietly slide to T1 because the slice is taking longer than expected.
- **Evidence flattening.** No surface — UI, marketing, App Store description, landing page — can lead with a single performance number. Evidence is typology, never strength score.
- **Vocabulary collision.** "Enrollment" is Guided only. "Sandbox / assignment" is Advanced only. The same word in two state machines means a confused contract.
- **Skipping the bench.** Sandbox can execute on paper; sandbox history can inform bench; only bench can promote; only promoted strategies can enter Guided or live by default.
- **Silent reuse of user strategies.** Validation does not equal permission. A bench-passed user strategy is not consent to reference, train on, derive from, or distribute. Private-by-default; the contribution lane is the only path to broader use.

## What this map is not

- It is **not** a roadmap with dates. Sequencing is principled, not calendared.
- It is **not** a finished list of contracts. Contracts evolve; this map is the lane structure within which contracts live.
- It is **not** a substitute for the per-phase handoff docs. Each phase (Phase 0 freeze, Stage 2 mocks, Phase 6.x wiring, Audits 0.5/1/2/...) has its own durable handoff. This doc binds them together.

## When to consult this map

- **Before scoping new work:** which lane does the work live in? Does it respect the sequencing principle?
- **Before relying on preview behavior:** does the deferred obligations ledger say this is final, or is it still an open temporary state?
- **When something feels out of order:** is this premature? Is it pulling forward a lane that doesn't yet have its prerequisites?
- **When a contract change is proposed:** which lane owns it? What does the lane's hard rule say about the change?
- **When a UX or product question arises:** does this collapse the wall phrase, blur a vocabulary distinction, or flatten evidence?

## Living document

This is a durable handoff. Update it when:
- A new lane lands or an existing lane is renamed/restructured.
- The sequencing principle changes (i.e., the order of unlocks shifts because of regulatory, product, or technical pressure).
- A hard rule is amended (rare; should require explicit cross-team agreement).

Don't update it lightly — these are the load-bearing structural commitments.
