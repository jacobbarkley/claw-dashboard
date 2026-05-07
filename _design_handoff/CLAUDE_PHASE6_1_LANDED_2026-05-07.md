# Phase 6.1 — Landed

**Date:** 2026-05-07
**From:** Claude
**For:** Codex + Jacob

Public/static Guided artifacts now flow end-to-end from `bootstrap_entry_zero` → `data/guided/*` (committed snapshot) → shared read helper → `/api/guided/*` route handlers + S4/S1+S2 preview pages. User-state surfaces (S3, S5–S11) remain on labeled mocks pending Phase 6.2.

## Route swap report (per Codex's after-each-route protocol)

### S4 Disclosure
- **Preview route URL:** `/vires/guided/preview/disclosure`
- **API path:** `GET /api/guided/disclosures/[id]`
- **Source artifact path:** `data/guided/disclosures/{id}.json`
- **Schema:** `disclosure_version.v1`
- **Mock fallback:** labeled, fires only when bootstrap snapshot is missing (returns `MOCK_DISCLOSURE_STEADY_TIDE_V1`).

### S1 + S2 Questionnaire
- **Preview route URL:** `/vires/guided/preview/questionnaire`
- **API path:** `GET /api/guided/questionnaire`
- **Source artifact path:** `data/guided/questionnaire.json`
- **Schema:** `questionnaire.v1`
- **Mock fallback:** labeled, fires only when bootstrap snapshot is missing (returns `MOCK_QUESTIONNAIRE_V1`).

### Strategy library (shared helper, used today by S4)
- **API path:** `GET /api/guided/strategy-library`
- **Source artifact path:** `data/guided/strategy_library.json`
- **Schema:** `strategy_library.v1`
- **Used by:** S4 disclosure page (resolves `library_entry_id="steady_tide_internal"` for the disclosure surface). Will be the canonical entry-list source for future surfaces.

## What landed

```
data/guided/                                          (NEW — bootstrap committed)
├── strategy_library.json                             (PUBLIC)
├── questionnaire.json                                (PUBLIC)
└── disclosures/disc_steady_tide_v1.json              (PUBLIC)

lib/guided-data-source.server.ts                      (NEW — shared read helper)
  - GUIDED_DATA_DIR (default "data/guided", resolved from process.cwd())
  - GUIDED_LOCAL_REBUILD_PATH (dev-only opt-in)
  - readStrategyLibrary / readQuestionnaire / readDisclosureVersion
  - GuidedArtifactMissingError + GuidedArtifactInvalidError
  - schema_version validated on read
  - disclosure_version_id validated against [a-zA-Z0-9_.-] (no path traversal)

app/api/guided/strategy-library/route.ts              (NEW)
app/api/guided/questionnaire/route.ts                 (NEW)
app/api/guided/disclosures/[id]/route.ts              (NEW)
  - All return 404 on missing artifact, 400/502 on schema mismatch
  - runtime="nodejs", dynamic="force-dynamic"

components/vires/guided/types.ts                      (PATCH)
  - Added `StrategyLibrary` container type to mirror models/guided.py:328

components/vires/guided/shared.tsx                    (PATCH)
  - Added `MockFallbackBadge` component for explicit fallback labeling

app/vires/guided/preview/disclosure/page.tsx          (PATCH)
app/vires/guided/preview/questionnaire/page.tsx       (PATCH)
  - Now read via shared helper. Fall back to mock when snapshot missing,
    with visible MockFallbackBadge.
```

## Bootstrap snapshot regeneration

Codex's durable mirror landed: `scripts/push-guided-data.py` + `scripts/push-guided-data.sh`. The original one-shot at `/tmp/bootstrap_guided_snapshot.py` is superseded.

To regenerate the public/static snapshot:
```bash
cd ~/claude/claw-dashboard
bash scripts/push-guided-data.sh                          # local refresh only
GUIDED_COMMIT_AND_PUSH=1 bash scripts/push-guided-data.sh  # refresh + commit + push
```

The script:
- emits only `data/guided/strategy_library.json`, `data/guided/questionnaire.json`, `data/guided/disclosures/*.json`
- refuses to write `proposals/`, `enrollments/`, or `views/` (user-state never enters dashboard git)
- commit/push is opt-in via `GUIDED_COMMIT_AND_PUSH=1`

## Verification

- `npx tsc --noEmit -p .` — clean (exit 0)
- `npx next build` — clean. New routes register as `ƒ /api/guided/disclosures/[id]`, `ƒ /api/guided/questionnaire`, `ƒ /api/guided/strategy-library`. S4 + S1+S2 preview routes flipped from `○` static to `ƒ` dynamic (expected — they read at request time).
- Smoke: schema_version checks pass against the committed snapshot for all three artifacts.

## Friction surfaced

### F2 — Admission gate booleans default false in canonical bootstrap

**Resolved (Codex 2026-05-07):** intentional. `admission.disclosed`, `evidence_typed`, `mandate_stated` mean *operator/admission gate cleared*, not *artifact present*. CANDIDATE entry zero correctly keeps all admission gates false until a real admission workflow clears them. Mock will be aligned during Phase 6.2.

### F3 — Public/static retention vs dashboard cwd

**Resolved (Codex 2026-05-07):** relative `GUIDED_DATA_DIR` resolving from `process.cwd()` is acceptable. In any unusual runtime where cwd may not be repo root, use absolute `GUIDED_DATA_DIR`. No code change required.

## What is still mocked (Phase 6.2 scope, blocked on Codex's mirror)

- **S3 match preview** (proposal view = user-state)
- **S5–S8 broker flow** (enrollment = user-state)
- **S9 ACTIVE enrollment** (enrollment view = user-state)
- **S10 paper monitoring** (same view, different fields)
- **S11 unified events** (events view = user-state)

These continue rendering against the existing mocks (`MOCK_MATCH_PROPOSAL`, `MOCK_ENROLLMENT_*`, `MOCK_EVENTS`, `MOCK_ENROLLMENT_VIEW_*`). Their preview routes remain `○` static (no read-time work). The `Internal Preview · Stage 2` banner continues to ride them.

When Codex's mirror lands and writes user-state to a path the dashboard can consume (or exposes a thin read API for it), Phase 6.2 swaps these one route at a time using the same helper pattern.

## Standing rules honored

- Dashboard remains a thin operator surface — no UI-invented trading semantics.
- No real broker calls.
- No public navigation. Internal preview banners ride every Guided surface.
- PII/secrets separation: only public/static state committed in git. No proposals, enrollments, or views.

## Phase 6.2 path shape (Codex 2026-05-07)

Local/internal-first, no production user-state store yet:

- **trading-bot side:** seeds `state/rebuild_latest/guided/{proposals,enrollments,views}/...` with real artifacts during local/internal runs.
- **dashboard side:** route handlers read those via `GUIDED_LOCAL_REBUILD_PATH` (the dev-only opt-in).
- **No user-state in dashboard git.** Confirmed standing rule.
- **Vercel/public preview:** continues with labeled mock fallback or missing-state handling. The "real non-git private store" decision (per multi-tenant law) is deferred to T2/T3.

This means Phase 6.2 wiring is dev-mode only — Vercel previews continue to render the mock-fallback path until a private store lands. The dashboard stays honest about that via the `MockFallbackBadge` already shipped.

## Next session

Holding S3/S5/S9/S10/S11 wiring until Codex lands the user-state seed/read shape. When ready, swap order:

1. S3 match preview (uses `guided_match_proposal_view.v1` composed read)
2. S5–S8 broker (one enrollment read, four UI states)
3. S9 ACTIVE
4. S10 monitoring
5. S11 events

Helper extension Phase 6.2 will add to `lib/guided-data-source.server.ts`:
- separate user-state resolver that reads ONLY from `GUIDED_LOCAL_REBUILD_PATH` (never falls back to `data/guided/` — different data class, different store)
- `readGuidedMatchProposalView(scope, proposal_id)`
- `readGuidedEnrollmentView(scope, enrollment_id)`
- `readEnrollmentEventsView(scope, enrollment_id)`
- `readGuidedEnrollment(scope, enrollment_id)`

Audit 0.5 stays the gate before any of these go live.
