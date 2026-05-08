# Guided T1 — Kickoff Plan

**Date:** 2026-05-08
**From:** Claude
**For:** Codex + Jacob
**Status:** Draft. Awaiting Jacob review and Codex contract sign-off before any code lands.

## Verdict

T1 is not one PR. It's ~9 small dependent PRs across two phases:

- **T1.0 — private-state foundation** (5 PRs). Land the auth-aware private store, scope resolver, and dashboard helper rewrite *before* any write path exists.
- **T1.1–T1.4 — write paths** (4 PRs). Questionnaire persistence → match proposal generation → match acceptance/decline → disclosure acceptance + consent ledger. Each PR closes one or two ledger rows.

Other T1 obligations (broker retry commands, exit-action surface, mandate-fit decision for entry zero, marketing review, anonymization standard, audit_visibility default, library breadth, etc.) are *separate sub-streams* that depend on T1.0 but don't have to wait for T1.4. Those PRs follow once the write-path scaffolding is real.

The first safe slice is **T1.0a — architecture lock**: a doc PR that nails the storage *seam* (not just provider), scope shape, schema, and dev/prod posture. No app code. Codex + Jacob sign off, then implementation begins in T1.0b.

## Architecture constraints that override everything below

Per Jacob/Codex 2026-05-08, restated in full because they are non-negotiable:

1. **Vires must migrate off git-backed runtime/user data. T1 is a migration constraint, not a future cleanup.** Every T1 design choice is evaluated against "would this become rework once the database migration lands?" If yes, it doesn't ship.
2. **Git holds public/static/versioned content only.** Strategy library definitions, questionnaire templates, disclosure templates, schema docs, synthetic/non-user fixtures. Nothing else.
3. **Git holds zero mutable/private user state.** No questionnaire answers, match proposals, accept_match state, disclosure consent, enrollments, broker/account state, user events, private Lab strategy state, telemetry/ops aggregates. Ever.
4. **The dashboard never writes to the store.** Writes go through Codex's command service over HTTP. The dashboard imports no DB driver. This preserves the existing ownership boundary (Codex owns runtime/contracts; Claude owns UX) and keeps the migration boundary clean — if Postgres is ever swapped, only Codex's runtime changes.
5. **The helper API contract is the read seam.** Function signatures in `lib/guided-data-source.server.ts` stay stable across the filesystem→DB migration. Server components don't know what backs the store. Migration optionality is enforced at the function-signature level.
6. **No file-path-coupled abstractions in the rewrite.** The current helper internally builds JSON file paths via `path.join(scope, ...)`. The rewrite must remove file-path semantics from the abstraction layer — paths can stay inside the *filesystem implementation* of the store adapter, but they don't leak into the helper API or call sites. Otherwise the DB cutover becomes a refactor instead of an implementation swap.

## 1. Current state map

### Public/static reads (kept as-is in T1)

`lib/guided-data-source.server.ts` exposes three public reads:
- `readStrategyLibrary()` ← `data/guided/strategy_library.json`
- `readQuestionnaire()` ← `data/guided/questionnaire.json`
- `readDisclosureVersion(id)` ← `data/guided/disclosures/{id}.json`

These are schema-versioned curated content. They stay in git, stay public, no T1 changes. The three matching API routes (`/api/guided/strategy-library`, `/api/guided/questionnaire`, `/api/guided/disclosures/[id]`) keep their current shape.

### User-state reads (T1 rewires under the helper)

Same helper exposes four user-state reads — all currently file-system-backed via `GUIDED_LOCAL_REBUILD_PATH`:
- `readGuidedMatchProposalView(proposalId, scope)` ← `views/{scope}/proposals/{proposalId}/guided_match_proposal_view.json`
- `readGuidedEnrollment(enrollmentId, scope)` ← `enrollments/{scope}/{enrollmentId}.json`
- `readGuidedEnrollmentView(enrollmentId, scope)` ← `views/{scope}/{enrollmentId}/guided_enrollment_view.json`
- `readEnrollmentEventsView(enrollmentId, scope)` ← `views/{scope}/{enrollmentId}/enrollment_events_view.json`

All four take `scope: GuidedScope = PHASE_6_2_INTERNAL_SCOPE` where `GuidedScope = { user_id, account_id, strategy_group_id }` and the constant is `(jacob, paper_main, default)`. Returns `null` from `resolveUserStateRoot()` when env unset → callers either throw `GuidedUserStateUnavailableError` (API) or render labeled `MockFallbackBadge` (preview pages).

User-state HTTP routes were intentionally removed in PR #5. Preview pages call helpers directly inside server components. T1 does NOT re-add public-shaped user-state HTTP routes — the access pattern stays "auth-scoped server component reads from store."

### Preview write/navigation gaps (T1 closes)

From `CLAUDE_AUDIT1_VISUAL_WALK_2026-05-07.md`:

| Surface | Today | T1 target |
|---|---|---|
| S1+S2 Complete | Buttons navigate; no persistence | Save-on-each-answer; resume on return |
| S3 Continue | Navigates to S4 | POSTs `accept_match` |
| S3 Decline | Restarts questionnaire | POSTs `decline_match` with reason; offers next-best/no-match |
| S3 Maybe later | Returns to index | Persists `questionnaire_in_progress` snapshot |
| S4 Accept | Navigates to S5 | POSTs `accept_disclosure` → writes consent ledger → starts enrollment |
| S5–S8 buttons | Jump between snapshots | POST broker recheck/retry commands; advance only on real producer state |
| S9 holdings | Display only | Display only at T1; exit-action surface lands as a separate T1 sub-stream |
| S11 events | Static read | Static read at T1; live updates are T2 (`GUIDED-T2-LIVE-EVENT-UPDATES`) |

## 2. T1.0 architecture proposal

### 2.0 Architecture at a glance

```
[ Browser ]
    │ user action (e.g. Continue on S3) — NO direct call to Codex,
    │ NO Codex auth material in the client bundle
    ▼
[ Next.js route handler / server action / server component ]  ←── claw-dashboard
    │ "use server" / app/api/* boundary
    │ resolveCurrentScope()
    │
    ├── reads ──▶ [ lib/guided-data-source.server.ts (stable API) ]
    │                 │
    │                 ▼
    │            [ GuidedReadStore interface ]
    │            ├── FilesystemGuidedReadStore  (dev/preview, JSON files)
    │            └── GuidedProjectionReadStore  (HTTP to Codex projection endpoint)
    │
    └── writes ─▶ [ lib/guided-commands.server.ts ] ←── server-only file
                      │ imports `server-only`; never reaches the client bundle
                      │ POST /commands/<name>
                      ▼
─────────── HTTP boundary ───────────────────────────────
                      │
[ Codex command / projection service ]  ←── runtime repo (e.g. trading-bot)
    │  owns: command handlers, projection writes, idempotency,
    │        DB driver, schema migrations, store-specific code
    ▼
[ Codex-owned DB adapter ]
    ▼
[ Postgres — or future store ]
```

**The dashboard side of this diagram contains zero database knowledge.** No `pg`, no `@vercel/postgres`, no Drizzle, no Prisma, no SQLAlchemy, no schema-row types. Postgres lives entirely beyond the HTTP boundary. If Postgres is swapped for any other store, only the lower half of the diagram changes — `claw-dashboard/` doesn't compile differently.

**The browser never calls Codex directly.** All Guided write paths go: browser → dashboard route handler / server action → `lib/guided-commands.server.ts` → Codex. `CODEX_COMMAND_BASE_URL` and any service auth material are server-only env vars, never `NEXT_PUBLIC_*`.

### 2.1 The storage seam (most important architectural decision)

The seam decision matters more than the provider decision. Get the seam right and the provider can change in T2/T3 without dashboard rework. Get the seam wrong and we re-do helper internals every time storage moves.

**Three seams, each owned by one boundary:**

#### Read seam — typed projections through `lib/guided-data-source.server.ts`

The helper's exported function signatures are the contract. They stay identical from Phase 6.2 forward:

```ts
readGuidedMatchProposalView(proposalId, scope) → Promise<GuidedMatchProposalView>
readGuidedEnrollment(enrollmentId, scope) → Promise<GuidedEnrollment>
readGuidedEnrollmentView(enrollmentId, scope) → Promise<GuidedEnrollmentView>
readEnrollmentEventsView(enrollmentId, scope) → Promise<EnrollmentEventsView>
```

Internally, the helper delegates to a `GuidedReadStore` interface with two implementations, **both dashboard-local but neither carries DB knowledge**:
- `FilesystemGuidedReadStore` — reads JSON via `GUIDED_LOCAL_REBUILD_PATH`. Dev/preview only.
- `GuidedProjectionReadStore` — HTTPs to a typed projection endpoint owned by Codex's command/projection service. Used in production and in dev whenever a Codex service is reachable. Knows nothing about Postgres or any other store; it knows the HTTP contract for typed projections.

The `GuidedReadStore` interface methods take `(id, scope)` and return typed projections. **No path strings, no SQL fragments, no DB driver types, no schema-row types** appear in the interface or in either implementation. The Postgres adapter (or whatever store backs the projections) lives entirely inside Codex's service, behind the HTTP boundary. Server components never see the implementation. Either store implementation can be swapped without touching call sites.

#### Write seam — Codex command service (HTTP), no dashboard DB writes

The dashboard never executes writes against the store. Period. Write paths are implemented as a **server-only** thin client `lib/guided-commands.server.ts` that POSTs to Codex's command service:

```ts
// lib/guided-commands.server.ts
import "server-only"

submitQuestionnaire(answers, scope) → Promise<{ proposal_id }>
acceptMatch(proposalId, scope, idempotencyKey) → Promise<{ enrollment_id }>
declineMatch(proposalId, scope, reason) → Promise<void>
acceptDisclosure(proposalId, disclosureVersionId, attestation, idempotencyKey) → Promise<void>
saveQuestionnaireProgress(answers, scope) → Promise<void>
```

Each function POSTs JSON to `${CODEX_COMMAND_BASE_URL}/commands/<name>` with auth headers.

**Server-only is non-negotiable, enforced four ways:**
- The file imports `server-only` at the top — Next.js fails the build if any client component imports from it.
- The `.server.ts` suffix is a coding-convention signal to humans and grep that this code never goes to the browser.
- Browser/client components never call Codex directly. UI submits to dashboard route handlers (`app/api/guided/*/route.ts`) or server actions (`"use server"` functions). Only those server-side handlers import from `lib/guided-commands.server.ts`.
- `CODEX_COMMAND_BASE_URL` and any service auth material (JWT signing key / shared secret / mTLS cert) are **server-only env vars**. Never `NEXT_PUBLIC_*`. Never inlined into the client bundle.

The dashboard imports zero DB drivers. This is the single most important rule for migration optionality — it makes the database an implementation detail of Codex's runtime, invisible to everything in `claw-dashboard/`.

Why writes can't live in the dashboard:
- Codex owns the runtime; runtime owns projections; if dashboard wrote, projections would be a second source of truth
- DB credential management would land in Vercel env, scattered across Next.js route handlers — wrong blast radius
- Provider migration (Postgres → anything else) becomes a Codex-only change instead of a cross-repo refactor

#### Scope seam — `resolveCurrentScope()` (server-only)

`PHASE_6_2_INTERNAL_SCOPE` constant is removed. Replaced by `resolveCurrentScope(): Promise<GuidedScope>` in `lib/guided-scope.server.ts`. Reads from authenticated session. Throws on unauthenticated. Returns the same `GuidedScope` shape (`user_id`, `account_id`, `strategy_group_id`) so existing call sites change minimally.

Server components and route handlers call `resolveCurrentScope()` once at request entry and pass the resolved scope to read helpers and command client functions. Scope leaves request entry as a typed object, never as a path string.

### 2.2 Storage provider choice (sub-decision under the seam)

**Recommended:** managed Postgres (Neon or Supabase). Pick during T1.0a. **Once the seam is right, the provider is reversible.**

Rationale:
- Consent ledger needs ACID + replay-idempotency. Document stores fight this.
- Codex's runtime already produces JSON artifacts with stable schemas — relational tables map cleanly.
- Vercel-native integrations exist for both Neon and Supabase; auth integration is straightforward.
- The ledger row `DATA-T1-PRIVATE-STORE-DECISION` (in `_design_handoff/VIRES_DEFERRED_OBLIGATIONS_LEDGER.md`) and the AGENTS.md "no user-state in git" rule require a non-git private store; managed Postgres is **this plan's recommended implementation** because consent / enrollment / idempotency map cleanly to relational constraints. Neither the ledger nor AGENTS.md mandates Postgres specifically — the seam tolerates a non-Postgres choice without dashboard rework.
- Branching (Neon especially) gives us cheap dev DBs that mirror prod schema.

Not chosen:
- Vercel KV / Redis — wrong shape for relational consent/enrollment data.
- MongoDB / Firestore — schema flexibility we don't need; weaker on idempotency primitives.
- DynamoDB — operational overhead vs. value at this scale.

**Open decision for Jacob/Codex:** Neon vs Supabase. Neon = smaller surface, branch-per-PR friendly. Supabase = bundles auth + RLS, more batteries-included. Lean Neon for separation-of-concerns (auth as its own decision), but either works.

### 2.3 Scope resolver

Today: `PHASE_6_2_INTERNAL_SCOPE = { user_id: "jacob", account_id: "paper_main", strategy_group_id: "default" }` — exported constant.

T1: `resolveCurrentScope(): Promise<GuidedScope>` — single function in `lib/guided-scope.server.ts` (new file). Reads from authenticated session/JWT. Throws `UnauthenticatedError` when no session.

Shape stays identical (`user_id`, `account_id`, `strategy_group_id`) so the helper API contract is preserved and call sites change minimally:

```ts
// before
const view = await readGuidedEnrollmentView(id)  // uses default scope

// after
const scope = await resolveCurrentScope()
const view = await readGuidedEnrollmentView(id, scope)
```

For T1 internal use (Jacob only), auth can be:
- Option A: NextAuth.js with email magic link (Jacob's email seeded as the only allowed user)
- Option B: Vercel-deployed app-level password gate + signed cookie, then a single `account_id="jacob"` resolved from cookie

Option A is canonical and scales to T2; Option B is faster but throwaway. **Recommend A** — the goal of T1 is to lay the multi-tenant rails honestly, not to accumulate one more piece of throwaway scaffolding.

`PHASE_6_2_INTERNAL_SCOPE` constant gets removed from `lib/guided-data-source.server.ts` once the resolver lands. This closes `GUIDED-T1-HARDCODED-SCOPE-REMOVAL` (T1 sub).

### 2.4 Tables / records

Phase 6.2 filesystem layout maps to these tables (column lists are illustrative, not final):

| Table | Maps from | Primary key |
|---|---|---|
| `guided_match_proposals` | `views/{scope}/proposals/{proposalId}/...` | `(account_id, proposal_id)` |
| `guided_match_proposal_views` | composed view (denormalized projection materialized inside the Codex service) | `(account_id, proposal_id)` |
| `guided_enrollments` | `enrollments/{scope}/{enrollmentId}.json` | `(account_id, enrollment_id)` |
| `guided_enrollment_views` | `views/{scope}/{enrollmentId}/guided_enrollment_view.json` | `(account_id, enrollment_id)` |
| `guided_enrollment_events` | `views/{scope}/{enrollmentId}/enrollment_events_view.json` (one row per event, not whole-view JSON) | `(account_id, enrollment_id, event_id)` |

New tables that don't have a filesystem analog:

| Table | Purpose | Closes |
|---|---|---|
| `questionnaires_in_progress` | Save-on-each-answer; "maybe later" resume | `GUIDED-T1-QUESTIONNAIRE-PERSISTENCE` |
| `consent_ledger` | Disclosure acceptances with `idempotency_key`, `reaffirmation_due_at`, `consent_expires_at`, immutable disclosure_version_id | `GUIDED-T1-CONSENT-LEDGER-REAFFIRMATION` |
| `match_decline_reasons` | Decline rationale capture for `GUIDED-T1-DECLINE-REMATCH-FLOW` | `GUIDED-T1-DECLINE-REMATCH-FLOW` |

Primary keys above are illustrative as `(account_id, ...)`; final keys partition by the full scope tuple `(user_id, account_id, strategy_group_id, ...)` matching `GuidedScope`. All row-level access goes through the resolver — no path-traversal-style scope leakage.

### 2.5 Retention / delete / tombstone posture

T1 must define this per table — it's required closure evidence for `DATA-T1-PRIVATE-STORE-DECISION`. The migration cutover (T1.0e) cannot pass review without this matrix being implemented and tested.

| Class | Retention | Deletion behavior | Tombstone? |
|---|---|---|---|
| Public/static (library / questionnaire / disclosures) | Forever; in git | N/A — curated content | N/A |
| Questionnaire-in-progress | 30 days from last update | Auto-purge after retention; operator-initiated delete on user request via support intervention | No — pre-consent state, no audit obligation |
| Consent ledger | Forever (legal) | No row deletion. Reaffirmation/expiry creates SUPERSEDED rows; original consent row immutable. | Yes — every consent state change is a new immutable row pointing at the predecessor |
| Match proposals + views | Forever | No user-initiated deletion at T1; operator deletion via support intervention writes an audit row | Soft-delete flag, original row retained |
| Enrollments + enrollment views | Forever | Same as proposals | Same as proposals |
| Enrollment events | Append-only; forever | No deletion; visibility filtered via `audit_visibility` only | N/A — events are themselves the audit log |

**T1 scope (must ship):** the per-table posture above; an operator-initiated single-user deletion path that writes an audit row; tombstone semantics for consent + proposal/enrollment soft-deletes; tests that prove deletion behavior matches the matrix.

**T2/T3 scope (deferred):** full self-service account erasure ("delete my account" UI), multi-system propagation (e.g., notifying Codex's analytics/ops aggregates), regulatory-jurisdiction-aware retention rules. These require pipelines T1 doesn't ship — consent reaffirmation broadcasting, downstream notification, jurisdiction routing — and depend on `GUIDED-T1-LEGAL-COPY-REVIEWED` and `GUIDED-T1-ANONYMIZATION-STANDARD` landing first. Add a ledger row when T1.0e closes if the work feels imminent; otherwise it surfaces naturally during T2 planning.

The `MockFallbackBadge` runtime fallback is migration behavior, not retention behavior — covered separately in §2.10.

### 2.6 Local dev behavior

Two dev modes, both routed through the read seam (`GuidedReadStore` interface) and the write seam (command client → Codex command service):

- **Filesystem read mode (today's read behavior preserved).** `GUIDED_LOCAL_REBUILD_PATH=/path/to/rebuild_latest/guided` set → `FilesystemGuidedReadStore` is selected. Reads work as today. **Write commands have no local target** — calling them either throws `CommandServiceUnreachableError` or POSTs to a locally-running Codex command service (whichever is wired). Filesystem read mode is a *read* dev loop, not a *write* dev loop.

- **Projection read mode.** `CODEX_PROJECTION_BASE_URL=https://...` set (local Codex dev service or staging) → `GuidedProjectionReadStore` is selected. Reads go through Codex's projection HTTP endpoint. Writes go through the command client to the same Codex service. The dashboard never speaks to the underlying store directly, in any environment.

Selection precedence: if `CODEX_PROJECTION_BASE_URL` is set, projection mode wins; else filesystem mode if `GUIDED_LOCAL_REBUILD_PATH` is set; else preview mock mode (production current behavior, removed at T1.0e).

**The seam guarantee:** in either dev mode, server components call the same helper functions and command client functions. Switching modes is one env var. No code changes. The dashboard imports zero DB drivers in either case.

### 2.7 Production behavior

- All user-state reads/writes go through Codex's projection / command service endpoints, which are themselves backed by the private store. The dashboard never speaks to the underlying store directly — production parity with the seam guarantee from §2.1.
- Auth required for all user-state preview pages (server components throw to a sign-in redirect when scope unresolvable)
- `MockFallbackBadge` removed from production user-state paths once T1.0e lands; replaced with explicit "no enrollment yet" / "no proposal yet" empty-state UI
- Public/static APIs unchanged

### 2.8 What stays unchanged

- `lib/guided-data-source.server.ts` exports stay stable. Internal implementation rewires to delegate to a `GuidedReadStore` interface, but the function signatures and error classes don't change. Preview page imports don't have to be touched.
- `data/guided/*` stays in git. **Strategy library, questionnaire, disclosure templates only — public/static/versioned content.** No user-state, ever.
- The three public/static API routes stay (`strategy-library`, `questionnaire`, `disclosures/[id]`).
- Phase 6.2 filesystem read path stays available for dev (read-only) via `FilesystemGuidedReadStore`.
- Codex's runtime artifact format stays — the producer adapter writes the same typed projection shapes to DB rows instead of JSON files.

### 2.9 What stays in git vs what doesn't (per Jacob/Codex 2026-05-08)

**Stays in git** (`data/guided/`, `data/research_lab/`-pending-classification):
- Strategy library definitions
- Questionnaire templates
- Disclosure templates
- Schema docs
- Synthetic / non-user fixtures (e.g., `components/vires/guided/mocks.ts` for tests, after `MockFallbackBadge` paths are removed from production at T1.0e)

**Does NOT stay in git** (moves to private store at T1):
- Questionnaire answers (in-progress + submitted)
- Match proposals + match proposal views
- Accept-match state
- Disclosure consent records
- Enrollments + enrollment views + enrollment events
- Broker / account state
- User events (any `audit_visibility`)
- Private Lab strategy state
- Telemetry / ops aggregates

If a future PR proposes adding any of the second list to `data/`, the PR must be rejected on architectural grounds, not negotiated. The ledger row for that obligation is the appeal path.

### 2.10 Migration path from current preview fixtures

Current preview fixtures live in two places, with two distinct fates:

**`data/guided/*.json`** — public/static. Three files: `strategy_library.json`, `questionnaire.json`, `disclosures/disc_steady_tide_v1.json`. **Stay where they are.** Their content is curated and versioned. No migration needed.

**`components/vires/guided/mocks.ts`** — `MOCK_*` fixtures used by `MockFallbackBadge` paths in user-state preview pages when `GUIDED_LOCAL_REBUILD_PATH` is unset. **Two-stage migration:**

1. T1.0c through T1.0d: mocks remain load-bearing. The `MockFallbackBadge` rendering stays as production behavior because no private store is live yet.
2. T1.0e cutover: production `MockFallbackBadge` paths are replaced with explicit empty-state UI ("no enrollment yet", "no proposal yet"). Mock fixtures may stay in the file as **test fixtures only** — never as a runtime fallback. Closes `GUIDED-T1-PRODUCTION-MOCK-FALLBACK-REMOVAL`.

After T1.0e, the rule is: mocks in `mocks.ts` are imported only from test files. Any runtime import is a regression.

## 3. T1 PR sequence

Each PR is small, has a single owner, and has clear closure evidence. PR-T1.0a is doc-only; everything after touches code.

| PR | Owner | Closes (ledger) | Depends on |
|---|---|---|---|
| **T1.0a — Architecture lock** | Claude (this doc) | none yet | — |
| **T1.0b — DB schema + migrations + Codex command service skeleton** | Codex | none yet | T1.0a sign-off |
| **T1.0c — Read seam (`GuidedReadStore`) + write seam (command client) skeleton** | Claude | none yet | T1.0b deployed to dev |
| **T1.0d — Auth + scope resolver** | Claude (UI) + Codex (session contract) | `GUIDED-T1-HARDCODED-SCOPE-REMOVAL` (T1 sub) | T1.0c |
| **T1.0e — Production cutover (`GuidedProjectionReadStore` selected in prod, Codex projection endpoint live, MockFallbackBadge removed from prod)** | Both | `GUIDED-T1-PRIVATE-USER-STATE-STORE` (T1 sub), `DATA-T1-PRIVATE-STORE-DECISION` (T1 sub), `GUIDED-T1-PRODUCTION-MOCK-FALLBACK-REMOVAL` (T1 sub) | T1.0d |
| **T1.1 — Questionnaire persistence** | Codex (table + command + projection) + Claude (UI + new read helper) | `GUIDED-T1-QUESTIONNAIRE-PERSISTENCE` | T1.0e |
| **T1.2 — Match proposal write + fit threshold** | Codex (matcher + command + projection) + Claude (UI) | `GUIDED-T1-MATCH-PROPOSAL-WRITE`, `GUIDED-T1-MATCH-FIT-THRESHOLD`, `GUIDED-T1-NO-SUITABLE-MATCH` | T1.1 |
| **T1.3 — Match acceptance + decline-rematch** | Codex (commands + projection) + Claude (UI) | `GUIDED-T1-MATCH-ACCEPTANCE-WRITE`, `GUIDED-T1-DECLINE-REMATCH-FLOW` | T1.2 |
| **T1.4 — Disclosure acceptance + consent ledger** | Codex (commands + ledger table + projection) + Claude (UI) | `GUIDED-T1-DISCLOSURE-ENROLLMENT-WRITE`, `GUIDED-T1-CONSENT-LEDGER-REAFFIRMATION` | T1.3 |

**T1.0b specifics (Codex's foundation PR):**
- DB schema migrations (Postgres tables for proposals, enrollments, events, consent ledger, questionnaires-in-progress, decline reasons)
- Command service skeleton — HTTP endpoints exist but return 501 until each write-path PR fills them in
- Provider choice locked (Neon vs Supabase, picked per §6 open decisions)
- Migration tool chosen per Codex's runtime language

**Command contract guardrails (must be set in T1.0b, inherited by T1.1–T1.4):**
- **Authenticated scope on every command.** Codex's command service derives or verifies the scope tuple (`user_id`, `account_id`, `strategy_group_id`) from the authenticated handoff. Any scope passed in the request body must match the verified auth scope or the request is rejected. The dashboard's `lib/guided-commands.server.ts` may pass a scope object as a convenience for typed call sites, but the service treats body-scope as untrusted hint, not authority. Authentication shape per the §6 "auth → command service handoff" decision.
- **Replay/idempotency on irreversible commands.** Every command that mutates user-visible state (`accept_match`, `accept_disclosure`, `start_enrollment`, exit-action commands) requires a client-supplied `idempotency_key`. The service de-duplicates on **the verified auth scope tuple plus command plus idempotency_key** — i.e., `(user_id, account_id, strategy_group_id, command, idempotency_key)` — so a key replay across users or accounts cannot collide. Read-only-equivalent commands (`save_questionnaire_progress`) can opt out.
- **Request / correlation ID.** Every request carries `X-Request-ID` (per-call) and an optional `X-Correlation-ID` that links a user-visible flow across commands (e.g., questionnaire submit → match proposal → accept → enrollment). Both surface in events, audit rows, and Codex logs.
- **Typed error envelope.** All non-2xx responses share one shape: `{ error_code, error_message, retriable: bool, fields?: { [key]: string } }`. The dashboard renders by `error_code`, never by parsing `error_message`.
- **No live external API calls in tests.** Codex's command service test suite forbids real HTTP calls to brokers, Codex's own LLM-backed services, or any third party. Same rule for the dashboard's command client tests.

**T1.0c specifics (the slice that earns or breaks migration optionality):**
- New file `lib/guided-read-store.server.ts` defines the `GuidedReadStore` interface (typed methods, no path strings, no DB types in the surface).
- New file `lib/guided-read-store.filesystem.server.ts` implements `FilesystemGuidedReadStore` — moves the existing `path.join`/`readFile`/zod-validate logic out of `guided-data-source.server.ts` into this implementation. No behavior change in dev.
- `lib/guided-data-source.server.ts` retains its public exports unchanged; internals delegate to whichever `GuidedReadStore` the resolver picks.
- New file `lib/guided-commands.server.ts` defines the write seam — typed thin POST functions to the Codex command service. **Imports `server-only` at the top.** In T1.0c every command throws `CommandServiceUnreachableError` because the service base URL isn't wired yet; the *shape* lands here, the wiring lands in T1.0d.
- Optionally a stub `GuidedProjectionReadStore` lands in this PR but is never selected (no `CODEX_PROJECTION_BASE_URL` set in the dev loop yet). Final implementation lives in T1.0e once Codex's projection endpoint is real.
- No new behavior visible to users. tsc + build clean. Existing dev smoke (`GUIDED_LOCAL_REBUILD_PATH` set) still renders all 7 Guided preview routes without `MockFallbackBadge`.

Independent T1 sub-streams that can run in parallel once T1.0e lands:
- Broker retry commands → `GUIDED-T1-BROKER-RETRY-ACTION-COMMANDS`
- Exit-action surface → `GUIDED-T1-EXIT-ACTION-SURFACE`
- Audit visibility default → `GUIDED-T1-AUDIT-VISIBILITY-DEFAULT`
- Cash-reserve role on holdings → `GUIDED-T1-CASH-RESERVE-NOT-SYMBOL-HARDCODED`
- Library breadth + mandate-fit for entry zero → `GUIDED-T1-STRATEGY-LIBRARY-BREADTH`, `GUIDED-T1-MANDATE-FIT-ENTRY-ZERO`
- Marketing non-flattening review → `GUIDED-T1-MARKETING-NON-FLATTENING-REVIEW` (no dashboard code; legal/marketing process artifact)
- Disclosure usability validation → `GUIDED-T1-DISCLOSURE-USABILITY-VALIDATION`
- Legal copy review → `GUIDED-T1-LEGAL-COPY-REVIEWED`
- Anonymization standard → `GUIDED-T1-ANONYMIZATION-STANDARD`
- Questionnaire honesty fixes (asset class first-sleeve, capital cadence) → `GUIDED-T1-QUESTIONNAIRE-ASSET-CLASS-FIRST-SLEEVE`, `GUIDED-T1-QUESTIONNAIRE-CAPITAL-CADENCE`
- Seed external link discipline → `GUIDED-T1-SEED-EXTERNAL-LINK-CORRECTNESS`

These don't block the write-path PRs. They land when their owner has bandwidth and their dependency is real.

## 4. Owner split

### Claude (dashboard / UX)
- This kickoff plan
- T1.0c — read seam (`GuidedReadStore` interface + `FilesystemGuidedReadStore` impl) + write seam skeleton (`lib/guided-commands.server.ts`, server-only). Helper API contract preserved.
- T1.0d UI — sign-in surface, post-sign-in redirect, scope-aware error states; wires `CODEX_COMMAND_BASE_URL` into the command client
- T1.0e UI — `GuidedProjectionReadStore` impl (HTTP client to Codex's projection endpoint) + empty-state UI replaces `MockFallbackBadge` paths in production
- T1.1 UI — save-on-answer (calls command client), "maybe later" resume (reads via new helper); new helper `readQuestionnaireInProgress` lands here
- T1.2 UI — proposal-from-real-answers rendering, no-match surface, mismatched-answer rendering (already shipped, just point at real producer data)
- T1.3 UI — Continue/Decline POST + reason capture
- T1.4 UI — Accept POST + consent-pending state + enrollment landing
- Independent T1: exit-action surface UI, broker retry surface UI, library breadth UI, audit visibility surface

**Claude does NOT write to the store. Ever.** All write-path work is either UI calling the command client, or wiring the command client to point at Codex's service. No `pg`, no `@vercel/postgres`, no Drizzle, no Prisma in `claw-dashboard/`.

### Codex (producer / runtime / contracts / store)
- T1.0a sign-off (architecture decision agreement, especially the seam shape)
- T1.0b — DB schema + migrations + Postgres provider choice + command service skeleton (HTTP endpoints exist but return 501 until each write-path PR fills them in)
- T1.0d — session contract; how the command service authenticates dashboard requests
- T1.0e — runtime cutover from filesystem-write to DB-write; producer adapter; projection table population on a fresh DB
- T1.1 — `save_questionnaire_progress` command + `questionnaires_in_progress` table writes + `questionnaire_in_progress.v1` projection
- T1.2 — matcher with min-fit threshold + `submit_questionnaire` command + proposal generation; producer-driven `mismatched_answer_keys` content
- T1.3 — `accept_match` + `decline_match` commands; events emitted; projections refresh
- T1.4 — `accept_disclosure` + `start_enrollment` commands; consent ledger writes; idempotency; projection refresh
- Independent T1: broker retry/recheck commands, mandate-fit decision artifact, library breadth admission decisions, audit visibility producer defaults, holding-role/cash-reserve type, seed external link discipline

**Codex owns the entire write side end-to-end.** DB schema, command service, projection writes, idempotency, all of it. Dashboard's only role on the write side is "POST JSON to Codex with the right headers and re-render on success."

### Shared / cross-cutting
- T1.0a sign-off — Jacob is the deciding voice on Neon vs Supabase, NextAuth vs alt
- T1.0e cutover gate — Jacob confirms preview Vercel deploy works end-to-end before we flip prod
- Marketing/legal/disclosure usability — Jacob owns; Codex/Claude support with code/copy as needed
- Ledger updates — every PR's reviewer checks the closure-evidence column was added

### Out of scope for T1 entirely
- Live trading anything (`GUIDED-T3-LIVE-SWAP-PATH`)
- Multi-enrollment allocation (`GUIDED-T2-MULTI-ENROLLMENT-ALLOCATION`)
- Notification delivery (`GUIDED-T2-NOTIFICATION-DELIVERY`)
- Live event updates (`GUIDED-T2-LIVE-EVENT-UPDATES`)
- Homepage ribbon (`GUIDED-T2-HOMEPAGE-RIBBON`)
- Broker check granularity (`GUIDED-TQ-BROKER-CHECK-GRANULARITY`)
- Lab / Advanced anything
- Strategy generation gate work
- Crypto / options sleeve admission (separate sleeve gate work)

## 5. Recommended first PR — T1.0a (this doc)

**Shape:** doc-only PR adding this file at `_design_handoff/CLAUDE_T1_KICKOFF_PLAN_2026-05-08.md`. Branch `claude/t1-kickoff-plan`. No code, no migrations, no contract changes.

**Reviewers:**
- Codex — sign-off on (a) the **read seam, write seam, and scope seam** as defined in §2.1, (b) command-service shape and HTTP contract approach, (c) producer adapter ownership of the entire write side, (d) Postgres choice, (e) PR sequence dependencies, (f) the "filesystem mode keeps working in dev as a read-only loop" clause
- Jacob — sign-off on (a) Neon vs Supabase, (b) NextAuth vs alt, (c) the 9-PR cadence, (d) any T1 obligation Codex thinks should re-tier, (e) the architectural constraint section is captured correctly

**Merge criteria:**
- Codex review: PASS — explicitly confirming the dashboard never imports a DB driver and never writes to the store
- Jacob review: PASS
- No code changes proposed in this PR (anyone can request schema-design tweaks; those go into T1.0b's PR description, not into this doc)
- **No ledger closure on this PR.** T1.0a records architecture; it does not deliver provider/env/retention/migration evidence. If Jacob picks a provider on this PR, the choice is recorded in the PR thread/body, not in the ledger's closure-evidence column. The actual `DATA-T1-PRIVATE-STORE-DECISION` row updates when T1.0b lands migrations (provider + tool decision evidence) and again when T1.0e lands the production cutover (retention + multi-tenant scope evidence).

After merge, T1.0b (Codex schema PR + command service skeleton) opens against `main`.

## 6. Open decisions for Jacob

Pick before T1.0b begins:

1. **Postgres provider:** Neon (recommended) vs Supabase
2. **Auth:** NextAuth.js (recommended) vs Vercel password gate + cookie
3. **Dev DB mirror posture:** Neon-branch-per-PR (recommended) vs single shared dev DB
4. **Migration tool (Codex's runtime only):** picked by Codex based on the runtime repo's language. If the command/projection service lives in `trading-bot/` (Python), the menu is **Alembic / SQLAlchemy / raw SQL migrations**. If a TS-side service is split out, the menu is **Drizzle / Prisma / raw SQL**. The dashboard has no opinion and uses none of these.
5. **Command service transport:** HTTP REST against Codex's runtime (recommended for migration optionality) vs server-action-style via shared TypeScript client (faster but couples deployment topology)
6. **Re-tier check:** does any T1 obligation feel out of place at T1 once this plan is read in full? (E.g., should `GUIDED-T1-LEGAL-COPY-REVIEWED` be hard-blocking pre-T1.4, or run in parallel?)
7. **Auth → command service handoff:** does Codex want a JWT it validates, a shared signing secret, or mTLS for the dashboard→runtime POST?

**Removed from the open-decisions list:** the "Producer adapter direction" question (runtime-writes-DB-directly vs JSON-snapshotter) is no longer open. Per the architectural constraint above, the producer must own writes against the DB; a JSON-snapshotter intermediate would re-introduce file-path-coupled runtime behavior.

## 7. What this kickoff plan deliberately does not do

- Not a contract spec. Each write-path PR will carry its own contract addition (e.g., the exact zod schema for `accept_match` request/response). T1.0a only locks the architecture.
- Not a migration script. T1.0b owns the actual SQL.
- Not a UI proposal for sign-in or empty-states. Each UI PR designs its surface against the audit principles.
- Not a re-audit. Audit 2 fires after T1.4 lands.
- Not a marketing/legal/usability plan. Those run as parallel sub-streams once T1.0e is real.

## 8. Verification posture

For every code-bearing T1 PR, the verification baseline is:
- `npx tsc --noEmit -p .` clean
- `npm run build` clean
- Live-read smoke (filesystem mode in dev, DB mode after T1.0c) — all 7 Guided preview routes render without `MockFallbackBadge` when scope is resolvable
- Closure-evidence column of any closed ledger row points to the merged PR/commit

For T1.0a (this doc): no build runs because it's doc-only. Cross-link integrity is the only check — every ledger row referenced in the closure-evidence column should resolve to a real ID in `_design_handoff/VIRES_DEFERRED_OBLIGATIONS_LEDGER.md`.

## 9. Ledger interaction summary

Closed by T1.0e: `GUIDED-T1-PRIVATE-USER-STATE-STORE` (T1 sub), `DATA-T1-PRIVATE-STORE-DECISION` (T1 sub), `GUIDED-T1-HARDCODED-SCOPE-REMOVAL` (T1 sub), `GUIDED-T1-PRODUCTION-MOCK-FALLBACK-REMOVAL` (T1 sub) — four obligations close in one cutover PR.

Closed by T1.1–T1.4 (in order): `GUIDED-T1-QUESTIONNAIRE-PERSISTENCE`, `GUIDED-T1-MATCH-PROPOSAL-WRITE`, `GUIDED-T1-MATCH-FIT-THRESHOLD`, `GUIDED-T1-NO-SUITABLE-MATCH`, `GUIDED-T1-MATCH-ACCEPTANCE-WRITE`, `GUIDED-T1-DECLINE-REMATCH-FLOW`, `GUIDED-T1-DISCLOSURE-ENROLLMENT-WRITE`, `GUIDED-T1-CONSENT-LEDGER-REAFFIRMATION`.

That's 12 ledger rows closed in 9 PRs, leaving the parallel sub-streams (broker retry, exit-action surface, audit visibility default, cash-reserve role, library breadth, mandate-fit, marketing review, disclosure usability, legal copy, anonymization, questionnaire honesty, seed external link) to close on their own cadence under T1.

## 10. Where to push back

If any of the following feel wrong, flag before T1.0a merges:

- The **seam separation** (§2.1) — could be challenged if Codex believes dashboard-side writes are operationally simpler in some cases, but the migration-optionality argument is the harder constraint and overrides convenience
- The "T1.0 first, write paths after" sequencing — could be inverted only if a real auth-aware DB already existed, which it doesn't
- The "doc PR before any code" gate — could be skipped only if Codex and Jacob are confident in chat-based alignment, but this doc protocol matches every prior Guided audit/phase doc
- The 9-PR cadence — could be merged into fewer PRs if reviewers are willing to absorb larger diffs, but each merge is a place to roll back if something's wrong
- The Postgres assumption — could be challenged with a concrete reason, but the alternatives are weaker on the constraints that matter (idempotency, audit retention, schema versioning); note that the seam tolerates a non-Postgres choice without rework
- The auth recommendation — Vercel password gate is faster but accumulates throwaway scaffolding; NextAuth is the canonical T2 path and worth landing now
- The "dashboard never imports a DB driver" rule — only push back with a concrete migration-optionality argument *for* coupling, since the default is decoupling
