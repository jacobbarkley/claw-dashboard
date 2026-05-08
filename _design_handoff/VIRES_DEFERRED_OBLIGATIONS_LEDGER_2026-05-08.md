# Vires Deferred Obligations Ledger

**Date:** 2026-05-08
**Status:** Durable handoff doc.
**Purpose:** Prevent intentionally temporary preview behavior from hardening into product behavior.

This ledger operationalizes the Product Map anti-pattern:

> Quiet deferral: anything pushed to "later" must land in a tier with a trigger condition.

Every future slice should check this file before scoping. If a slice touches a temporary behavior listed here, it must either close the obligation, carry it forward explicitly, or retier it with a reason.

## Ledger Rules

- **No "later" without a trigger.** Every deferral gets a tier and a condition that reopens it.
- **No silent finalization.** Preview-only behavior cannot become product behavior just because the UI works.
- **No source drift.** If an item depends on producer state, the producer/contract changes before the dashboard presents it as real.
- **No user-state in git.** User-specific Guided, Lab, broker, consent, proposal, and enrollment state must move to a private scoped store before non-internal use.
- **Closure needs evidence.** A code merge is not enough; each item names what proof closes it.

## Tier Key

- **T1 / pre-public:** Required before Guided or Lab can be treated as non-preview for Jacob/internal use beyond the current sanity walk.
- **T2 / post-internal hardening:** Required before broader private beta or repeated operator use.
- **T3 / public or live-readiness:** Required before public multi-tenant or live trading.
- **T_Q / queued lane:** Track this in the named later lane, but do not start it until prerequisites are real.

## Guided Obligations

| ID | Tier | Temporary state today | Final intended state | Trigger | Closure evidence |
| --- | --- | --- | --- | --- | --- |
| GUIDED-T1-QUESTIONNAIRE-PERSISTENCE | T1 | Questionnaire answers live in React state only. The completion screen says preview-only and nothing persists. | Persist in-progress questionnaire state in a private scoped store, with resume and maybe-later semantics. | Before any user is expected to leave and return to Guided, or before recommendations are treated as durable. | `questionnaire_in_progress.v1` or equivalent exists outside git; maybe-later resumes; tests prove no user-state in `data/`. |
| GUIDED-T1-MATCH-PROPOSAL-WRITE | T1 | "See match" and S3 match proposal use fixed preview artifacts/fallbacks. Answers do not generate a durable proposal. | Questionnaire submission generates a scoped `guided_match_proposal.v1` plus composed `guided_match_proposal_view.v1`. | Before multiple Guided strategies or answer-dependent matching is presented as real. | Runtime command writes proposal/view; dashboard reads it; malformed proposal rejected at read boundary; tests cover no-match and multi-candidate cases. |
| GUIDED-T1-MATCH-ACCEPTANCE-WRITE | T1 | S3 Continue only navigates to disclosure. It does not POST `accept_match`. | Continue runs an authenticated/scoped `accept_match` command and refreshes user-state projection. | Before "Continue" is framed as using Guided rather than preview navigation. | Command endpoint/service exists; idempotency key enforced; proposal state changes; events emitted; UI handles success/failure. |
| GUIDED-T1-DISCLOSURE-ENROLLMENT-WRITE | T1 | S4 Accept only navigates to broker preview after checkbox attestation. | Accept records disclosure acceptance/consent and starts an enrollment in `ACCEPTED_PENDING_BROKER`. | Before broker setup or enrollment is treated as real. | Consent ledger/private store write exists; disclosure version pinned; enrollment artifact/projection generated; replay is idempotent. |
| GUIDED-T1-DECLINE-REMATCH-FLOW | T1 | Decline restarts the questionnaire; Maybe later returns to index. | Decline captures why the match failed, can re-questionnaire/rematch/next-best, and never traps the user in one forced strategy. | Before a real first match is offered to a user. | Decline reason artifact/command exists; UI offers next-best/no-match; `request_rematch`/`request_re_questionnaire` provenance is persisted. |
| GUIDED-T1-NO-SUITABLE-MATCH | T1 | The preview can always show Steady Tide because there is one candidate fixture. | Matcher can say "no suitable match yet" when answers do not fit any admitted strategy. | Before strategy library expands beyond the current single CANDIDATE. | Matcher returns explicit no-match result; UI renders no-match; tests cover incompatible answers without falling back to Steady Tide. |
| GUIDED-T1-STRATEGY-LIBRARY-BREADTH | T1 | `data/guided/strategy_library.json` has one CANDIDATE entry, `steady_tide_internal`, backed by `regime_aware_momentum::stop_5_target_15`. | Guided has multiple admitted/promoted strategies with suitability tags, exclusions, disclosures, and evidence typed separately. | Before answer-dependent matching is marketed or relied on. | At least two/three eligible entries pass admission gates; matcher ranks eligible entries; CANDIDATE remains visibly non-public. |
| GUIDED-T1-MANDATE-FIT-ENTRY-ZERO | T1 | Entry zero is a CANDIDATE plumbing seed; mandate-fit is visible but not a final admission decision. | Decide whether `regime_aware_momentum::stop_5_target_15` belongs in Guided, and under what mandate/risk disclosure. | Before Steady Tide appears as ACTIVE/admitted or becomes a default recommendation. | Admission gates have operator/legal/evidence decisions; docs record decision; UI copies no longer rely on CANDIDATE preview caveats. |
| GUIDED-T1-EXIT-ACTION-SURFACE | T1 | Enrollment state machine includes pause/stop variants, but no user-facing exit-action surface exists. | User can pause, stop-hold-to-close, or stop-liquidate with explicit consequences and audit events. | Before an ACTIVE Guided enrollment is real. | Commands and UI exist; events emitted; monitoring reflects pending/complete exit actions; tests cover each state. |
| GUIDED-T1-AUDIT-VISIBILITY-DEFAULT | T1 | User-facing events filter internal-only visibility; operator-only event view is deferred. | Lock defaults for `audit_visibility`, user-visible event history, and operator-only event/audit surfaces. | Before real user events or support interventions exist. | Policy documented; user and operator surfaces tested; internal-only events do not leak to user-facing views. |
| GUIDED-T1-LEGAL-DISCLOSURE-CONSENT | T1 | Disclosure copy is a preview seed; legal validation and reaffirmation workflow are not complete. | Disclosure templates, required copy, consent expiry/reaffirmation, and legal review are production-ready. | Before non-preview consent is accepted. | Legal-reviewed copy/version; consent expiry/reaffirmation behavior; durable consent ledger; disclosure IDs immutable. |
| GUIDED-T1-PRIVATE-USER-STATE-STORE | T1/T2 | Production user-state falls back to labeled mocks because `GUIDED_LOCAL_REBUILD_PATH` is dev-only. | Authenticated private store for proposal, enrollment, event, consent, broker, and questionnaire state. | Before production Guided stores any real user state or supports non-Jacob users. | Private store chosen; auth/scope resolver exists; no user-state HTTP routes without auth; no user-state committed to git. |
| GUIDED-T2-NOTIFICATION-DELIVERY | T2 | `notification_intent` exists in the model/runtime, but no in-app/email/push adapter delivers it. | Delivery adapters and user-visible notification center for Guided intents. | Before users depend on Guided for broker/action/risk notices. | Adapter isolation tests; delivery opt-in; retry/de-dupe; no live external calls in tests. |
| GUIDED-T2-LIVE-EVENT-UPDATES | T2 | Event history reads once per page render. No polling/SSE. | Live-updating event feed where user expectations require it. | Before Guided is used as an active monitoring surface. | Polling/SSE/refresh strategy implemented; stale-state UI; load and error handling verified. |
| GUIDED-T2-HOMEPAGE-RIBBON | T2 | PR #6 added a compact nav pill. The richer guided ribbon/summary is deferred. | Trading homepage shows current Guided summary and entry/re-run affordances without overclaiming. | When Guided has persisted enrollment state or re-run onboarding command. | Ribbon designed with T1 flows; no overlap/overflow on mobile; re-run command supersedes prior proposal/enrollment correctly. |
| GUIDED-T2-MULTI-ENROLLMENT-ALLOCATION | T2/T3 | Current framing is one enrollment at a time. "First strategy" language has no real multi-enrollment path. | Per-user allocation layer supports multiple enrollments/strategies intentionally. | Before UI suggests "add another strategy" or multi-strategy Guided management. | Allocation model exists; conflicts/risk budget handled; monitoring aggregates per strategy; copy avoids implying unsupported multi-enrollment. |
| GUIDED-T3-LIVE-SWAP-PATH | T3 | Guided cannot swap live strategies. Preview/paper surfaces stop well before live replacement. | A governed path can replace or resize live daily strategy allocations only after all live-readiness rails pass. | Before any "make this live" or "replace my live strategy" affordance exists. | Legal, broker, monitoring, risk, consent, and audit rails pass; operator confirmation required; rollback/demotion path tested. |

## Data Platform Obligations

| ID | Tier | Temporary state today | Final intended state | Trigger | Closure evidence |
| --- | --- | --- | --- | --- | --- |
| DATA-T1-PRIVATE-STORE-DECISION | T1/T2 | Public/static Guided artifacts live in git; private state has only dev-local rebuild reads. | Chosen private store and scope model for user/account/proposal/enrollment/event/consent records. | Before real Guided writes or public multi-tenant planning. | Architecture note, env plan, auth/scope resolver, retention/delete behavior, migration plan. |
| DATA-T1-RESEARCH-LAB-GIT-STATE-CLASSIFICATION | T1 | Some `data/research_lab/jacob/paper_main/default/*` artifacts predate this slice and may look user-specific. | Classify which Lab artifacts may remain public/static fixtures and which must move to private state. | Before Lab/Advanced resumes as a serious lane. | Classification doc; any private/stateful artifacts moved or redacted; fixtures clearly marked synthetic/public. |

## Advanced / Lab Obligations

| ID | Tier | Temporary state today | Final intended state | Trigger | Closure evidence |
| --- | --- | --- | --- | --- | --- |
| LAB-T1-EXISTING-TALON-WORK-INTEGRATION | T_Q / Lab Phase 0 | Talon/idea-generation packet work exists on PRs/test branches, not production `main`. | Lab Phase 0 starts from branch archaeology and contract reconciliation, not a blank-slate rebuild. | When Advanced/Lab work resumes after Guided T1 gate. | Branch map reviewed (`codex/lab-talon-reference-builder`, `claude/lab-redesign-idea-detail-controls`, `codex/strategy-authoring-contract-v1`, `test/packet-authoring-walkthrough`, `test/lab-redesign-talon-pipeline`); keep/drop list documented. |
| LAB-T1-SANDBOX-VS-ENROLLMENT-WALL | T_Q / Lab Phase 0 | Product map states the wall phrase, but Lab productionization has not rerun the full audit gauntlet. | UI/contracts/routes/tables consistently use sandbox/assignment for Lab and enrollment for Guided. | Before any non-internal user touches Lab. | Audit verifies vocabulary in code/docs; no sandbox can receive passport role or Guided/live admission directly. |
| LAB-T1-PRIVATE-BY-DEFAULT-CONTRIBUTION | T_Q / Lab Phase 0 | Private-by-default principle is captured, but contribution/license flow is not built. | User-created strategies remain private unless a deliberate contribution/license flow grants broader use. | Before user-created Lab strategy can be referenced by Talon, matching, marketing, aggregation, or other users. | Contribution contract; consent UI; attribution/provenance ledger; anonymization standard before aggregates. |

## Strategy Generation Obligations

| ID | Tier | Temporary state today | Final intended state | Trigger | Closure evidence |
| --- | --- | --- | --- | --- | --- |
| STRATGEN-T2-HYBRID-CURATED-GATE | T_Q / after Lab earns trust | Strategy generation is hybrid-curated/Talon-assisted only; autonomous generation is gated. | Autonomous generation tracks unlock only after Lab passes later audits with provenance/evidence integrity. | Stable cadence of validated hybrid-curated strategies and Audit 2+ with no recurring honesty findings. | Audit record; provenance tests; no evidence-tier flattening; generated strategies cannot bypass bench/promotion. |

## How To Update This Ledger

For any new temporary behavior, add a row before the PR merges. Use this shape:

```md
| AREA-TIER-SHORT-NAME | T1/T2/T3/T_Q | Temporary state | Final state | Trigger | Closure evidence |
```

When closing an obligation:

1. Keep the row.
2. Add `CLOSED YYYY-MM-DD` to the ID or temporary-state cell.
3. Link the PR/commit/handoff that proves closure.
4. If the item was intentionally abandoned, mark `SUPERSEDED` and name the replacement decision.

## Sources Swept

- `_design_handoff/VIRES_PRODUCT_MAP_2026-05-07.md`
- `_design_handoff/CLAUDE_AUDIT1_UX_HONESTY_2026-05-07.md`
- `_design_handoff/CLAUDE_AUDIT1_VISUAL_WALK_2026-05-07.md`
- `_design_handoff/CLAUDE_PHASE6_2_LANDED_2026-05-07.md`
- `_design_handoff/CLAUDE_PHASE6_READINESS_2026-05-07.md`
- `components/vires/guided/*`
- `app/vires/guided/*`
- `data/guided/*`
- `lib/guided-data-source.server.ts`
