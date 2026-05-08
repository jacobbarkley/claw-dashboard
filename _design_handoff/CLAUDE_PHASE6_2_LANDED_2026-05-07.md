# Phase 6.2 — Landed (dev-mode only)

**Date:** 2026-05-07
**From:** Claude
**For:** Codex + Jacob

All seven Guided surfaces (S1–S11) now read from real artifacts when the
environment is configured for it. User-state surfaces (S3, S5–S8, S9, S10,
S11) read from `GUIDED_LOCAL_REBUILD_PATH`; public/static surfaces (S4,
S1+S2) read from `data/guided/`. When user-state isn't available — Vercel
production today, or any environment without the env var set — preview
pages fall back to labeled mocks via `MockFallbackBadge`.

## Post-PR-review correction (2026-05-07)

**The four user-state HTTP API routes documented below were intentionally
removed during PR #5 review.** They were a public-shaped dev surface in
front of an internally-scoped, dev-only data path — and exposing
`(jacob, paper_main, default)`-scoped artifacts on a public-shaped URL with
no auth was the wrong shape for production-bound code. The dashboard's only
consumers of those reads are the five user-state preview pages
(`/vires/guided/preview/{match,broker,active,monitoring,events}`), which
now call the server helpers in `lib/guided-data-source.server.ts` directly
inside their server components. No HTTP indirection, no public surface, no
auth-shaped affordance promised before there is auth.

**What was removed:**
- `app/api/guided/match-proposal-view/[proposalId]/route.ts`
- `app/api/guided/enrollments/[enrollmentId]/route.ts`
- `app/api/guided/enrollment-views/[enrollmentId]/route.ts`
- `app/api/guided/enrollment-events/[enrollmentId]/route.ts`

**What was kept:**
- The three public/static API routes (`strategy-library`, `questionnaire`,
  `disclosures/[id]`) — these stay because their data is genuinely public,
  schema-versioned, and not user-scoped.
- All five user-state preview pages — they now read the helper directly.
- `GuidedUserStateUnavailableError` and `GuidedUnsafeIdError` — the helper
  still throws them; the preview pages now handle them inline (labeled
  mock fallback, 400-shaped abort, etc.) instead of HTTP 503 / 400.

**Where this means the docs below are stale:** "API path:" lines for S3,
S5–S8, S9, S10, S11; the route registration counts in the verification
section; the list in the "Audit 1 backend/plumbing" patch summary at the
end. Treat those as historical record of what shipped and was then
reverted, not current behavior. The preview-page wiring described
elsewhere in this doc still applies — the only thing that changed is the
helper is now a function call, not an HTTP fetch.

When a non-dev user-state store ships at T2/T3 and is gated by real auth,
the access shape we want is "server component reads from auth-scoped
store," not "any client GETs an unscoped HTTP endpoint." Removing the
routes now keeps the slice from baking that wrong shape into reviewer
muscle memory.

## Phase 6.2 architecture (locked)

- **Public/static reads** (`resolvePublicStaticRoot()`): `GUIDED_LOCAL_REBUILD_PATH` wins in local dev when set, then falls back to `GUIDED_DATA_DIR` (default `data/guided`). Always returns a path.
- **User-state reads** (`resolveUserStateRoot()`): `GUIDED_LOCAL_REBUILD_PATH` only. Never falls back to `data/guided/` — by design. Returns `null` when unset and callers either 503 (API) or fall back to labeled mock (preview).
- Production preview: labeled mock fallback until a real non-git private store is decided (T2/T3).
- Internal scope hardcoded at `(jacob, paper_main, default)` for now; multi-tenant scope routing is T2/T3 work.
- No user-state in dashboard git. Hard rule.

## Route swap report

### S3 Match preview
- **Preview route URL:** `/vires/guided/preview/match`
- **API path:** `GET /api/guided/match-proposal-view/[proposalId]`
- **Source artifact path:** `views/jacob/paper_main/default/proposals/proposal_entry_zero_preview/guided_match_proposal_view.json`
- **Schema:** `guided_match_proposal_view.v1`
- **Render:** `MatchProposalSurfaceFromView` wrapper consumes the composed view (Codex's Audit 0.5 patch)
- **Fallback:** labeled, `MOCK_MATCH_PROPOSAL_VIEW`

### S5–S8 Broker flow
- **Preview route URL:** `/vires/guided/preview/broker`
- **API path:** `GET /api/guided/enrollments/[enrollmentId]`
- **Source artifact paths (4 reads in parallel):**
  - `enrollments/jacob/paper_main/default/enrollment_entry_zero_pending_broker.json` — ACCEPTED_PENDING_BROKER
  - `enrollments/jacob/paper_main/default/enrollment_entry_zero_broker_retryable.json` — BROKER_RETRYABLE
  - `enrollments/jacob/paper_main/default/enrollment_entry_zero_broker_action_required.json` — BROKER_ACTION_REQUIRED
  - `enrollments/jacob/paper_main/default/enrollment_entry_zero_broker_ineligible.json` — BROKER_INELIGIBLE
- **Schema:** `guided_enrollment.v1`
- **Fallback:** labeled, `MOCK_ENROLLMENT_*` fixtures

### S9 ACTIVE enrollment
- **Preview route URL:** `/vires/guided/preview/active`
- **API path:** `GET /api/guided/enrollment-views/[enrollmentId]`
- **Source artifact path:** `views/jacob/paper_main/default/enrollment_entry_zero_active/guided_enrollment_view.json`
- **Schema:** `guided_enrollment_view.v1`
- **Fallback:** labeled, `MOCK_ENROLLMENT_VIEW_ACTIVE`

### S10 Paper monitoring
- **Preview route URL:** `/vires/guided/preview/monitoring`
- **API path:** `GET /api/guided/enrollment-views/[enrollmentId]` (same as S9)
- **Source artifact path:** same enrollment view as S9, different sub-fields rendered
- **Fallback:** labeled, `MOCK_ENROLLMENT_VIEW_ACTIVE`

### S11 Unified events
- **Preview route URL:** `/vires/guided/preview/events`
- **API path:** `GET /api/guided/enrollment-events/[enrollmentId]`
- **Source artifact path:** `views/jacob/paper_main/default/enrollment_entry_zero_active/enrollment_events_view.json`
- **Schema:** `enrollment_events_view.v1`
- **Lane coverage:** all 7 (broker_confirmation / cash_management / manual_action / portfolio_action / strategy_execution / support_intervention / system) verified in live-read smoke.
- **Fallback:** labeled, `MOCK_EVENTS_VIEW`

## What landed

```
lib/guided-data-source.server.ts                      (PATCH)
  + readGuidedMatchProposalView(proposalId, scope?)
  + readGuidedEnrollment(enrollmentId, scope?)
  + readGuidedEnrollmentView(enrollmentId, scope?)
  + readEnrollmentEventsView(enrollmentId, scope?)
  + GuidedUserStateUnavailableError (thrown when GUIDED_LOCAL_REBUILD_PATH unset)
  + PHASE_6_2_INTERNAL_SCOPE constant ((jacob, paper_main, default))
  + scopePath / assertSafeId helpers
  + readJsonAt / readPublicStaticArtifact / readUserStateArtifact split

app/api/guided/match-proposal-view/[proposalId]/route.ts   (NEW)
app/api/guided/enrollments/[enrollmentId]/route.ts         (NEW)
app/api/guided/enrollment-views/[enrollmentId]/route.ts    (NEW)
app/api/guided/enrollment-events/[enrollmentId]/route.ts   (NEW)
  - All 503 when GUIDED_LOCAL_REBUILD_PATH unset
  - 404 on missing artifact, 502 on schema mismatch, 400 on invalid id
  - runtime="nodejs", dynamic="force-dynamic"

app/vires/guided/preview/match/page.tsx                (PATCH — wired to live read + labeled fallback)
app/vires/guided/preview/broker/page.tsx               (PATCH — 4 parallel enrollment reads + labeled fallback)
app/vires/guided/preview/active/page.tsx               (PATCH — wired to live read + labeled fallback)
app/vires/guided/preview/monitoring/page.tsx           (PATCH — wired to live read + labeled fallback)
app/vires/guided/preview/events/page.tsx               (PATCH — wired to live read + labeled fallback)
```

## Verification

- `npx tsc --noEmit -p .` — clean (exit 0)
- `npm run build` — clean. All 7 Guided preview routes register as `ƒ` (dynamic, expected — they read at request time). All 7 `/api/guided/*` routes register as `ƒ`.
- **Live-read smoke** (`GUIDED_LOCAL_REBUILD_PATH=...` against Codex's seed):
  - 7 reads pass schema_version checks
  - S11 all 7 source lanes present in canonical events view

```
OK S3 view: guided_match_proposal_view.v1
OK S5 pending: guided_enrollment.v1
OK S6 retry: guided_enrollment.v1
OK S7 action: guided_enrollment.v1
OK S8 inelig: guided_enrollment.v1
OK S9/S10 view: guided_enrollment_view.v1
OK S11 events: enrollment_events_view.v1
OK S11 all 7 source lanes present
```

## How to run

```bash
# Dev (live reads against rebuild state):
export GUIDED_LOCAL_REBUILD_PATH=/home/jacobbarkley/.openclaw/workspace/trading-bot/state/rebuild_latest/guided
npm run dev

# Regenerate seed:
cd ~/.openclaw/workspace/trading-bot
PYTHONPATH=src .venv-rebuild/bin/python3 bin/rebuild_guided.py seed-phase6-internal --generated-at 2026-05-07T15:30:00+00:00

# Production preview (Vercel): GUIDED_LOCAL_REBUILD_PATH unset → labeled mock fallback
```

## Friction notes

### F4 — STATE_CHANGE actor_type drift — CLOSED 2026-05-07

Canonical: `STATE_CHANGE / source=system` carries `actor_type=SYSTEM`. Mock previously had `actor_type=USER`. Codex closed during Audit 1 plumbing pass: mock STATE_CHANGE event now uses `actor_type=SYSTEM` + `actor_id=guided_runtime` (`mocks.ts:561-564`). Verified on disk.

### F5 — Hardcoded scope as deliberate choice

`PHASE_6_2_INTERNAL_SCOPE = (jacob, paper_main, default)` is hardcoded in the helper. Route handlers accept only the leaf id (proposalId / enrollmentId), no scope params. This is a deliberate single-tenant simplification for Phase 6.2 internal mode. Multi-tenant scope routing — whether via URL params, session, or header — lands at T2/T3 when the production private store decision lands.

### F6 — Mock admission gates drift — CLOSED 2026-05-07

Canonical CANDIDATE bootstrap: `admission.{promoted, disclosed, evidence_typed, mandate_stated, broker_capability_checked, operator_approved}` all `false`. Mock previously had `disclosed/evidence_typed/mandate_stated = true`. Codex closed during Audit 1 plumbing pass: mock now has all six gates `false`-by-default (`mocks.ts:156-165`). Verified on disk.

## Mock fixtures still load-bearing

Mocks aren't dead code — they back the labeled fallback path that fires in any environment without `GUIDED_LOCAL_REBUILD_PATH`. That includes Vercel production previews until a private store decision lands. The `MockFallbackBadge` makes this honest visually. When the private store ships at T2/T3, the fallback path goes to a missing-state UI instead.

## Phase 6.2 scope locked

- ✅ S3 match preview — composed view fetch
- ✅ S5–S8 broker — 4-state enrollment fetch
- ✅ S9 ACTIVE — enrollment view fetch
- ✅ S10 monitoring — same fetch as S9
- ✅ S11 events — events view fetch with 7-lane coverage
- All routes labeled-fallback to mocks when seed unavailable
- Type-check clean, build clean, live-read smoke clean

## Audit 1 — backend/plumbing PASS (Codex 2026-05-07)

Codex reviewed Phase 6.2 and gave Audit 1 backend/plumbing PASS, with three patches landed directly to tighten the boundary:

1. **`GuidedUnsafeIdError` added** in `lib/guided-data-source.server.ts:56-64`. Replaces the previous pattern of routing unsafe IDs through `GuidedArtifactInvalidError` (which then 502'd). Unsafe IDs are now a client error, not a server error.
2. **All 5 Guided dynamic API routes updated** to catch `GuidedUnsafeIdError` first and return 400 with `{error, field, value, reason}`. Affects `/api/guided/disclosures/[id]`, `/api/guided/match-proposal-view/[proposalId]`, `/api/guided/enrollments/[enrollmentId]`, `/api/guided/enrollment-views/[enrollmentId]`, `/api/guided/enrollment-events/[enrollmentId]`.
3. **F4 + F6 mock drift closed** in `mocks.ts` per the canonical bootstrap shapes.

Codex's verification:
- `npx tsc --noEmit -p .` clean
- focused Guided ESLint clean
- `npm run build` clean
- `GUIDED_LOCAL_REBUILD_PATH=...` live dev: all 7 preview pages render without `MockFallbackBadge`, all Guided APIs return expected schema_versions
- env unset: user-state APIs return 503, user-state previews show labeled `MockFallbackBadge`, public/static APIs still return 200
- invalid dynamic IDs return 400 across all Guided dynamic API routes

**Note:** full repo `npm run lint` is still red on pre-existing unrelated files. The Guided slice itself is clean.

## Next: Audit 1 — UX honesty pass

Backend/plumbing is PASS. The remaining Audit 1 work is the UX honesty review — Claude can do the supporting code-level pass; visual judgment is Jacob's call against `next dev`. Items to validate:
- CANDIDATE library entry vs ACTIVE enrollment two-status copy (no over-claim)
- Cold-start evidence honesty (zero-day paper observed surfaces correctly, "Internal preview" banner everywhere)
- 5-axis evidence display (no flattening into single performance number)
- Event history completeness (all 7 lanes, distinct rendering, `support_intervention` visually separated)
- Mandate-fit communication (TACTICAL_PARTIAL labeled clearly, "not a full equity allocator" copy reaches the user)
- Mobile layout against the surface widths the slice currently uses
