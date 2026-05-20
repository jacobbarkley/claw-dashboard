# Architecture: Private User-State Store (T1)

**Created:** 2026-05-20
**Closes:** `DATA-T1-PRIVATE-STORE-DECISION` ledger row (VIR-25)
**Status:** Retroactive write-up. The decision was made and shipped via Step 2 of the acceleration plan (2026-05-13/14). This doc captures the closure-evidence the ledger required.

## Decision

**Private store choice: Supabase Postgres with row-level security (RLS), routed via PostgREST.** Per-row authorization runs off a short-TTL JWT minted from the authenticated session; `(jwt ->> 'sub')` is the RLS pivot.

## Why Supabase

Three constraints, one choice that fits all three:

1. **Postgres native.** All our state shapes are relational — proposals, enrollments, decline records, consent attestations. We want SQL-grade queries, not key-value gymnastics. Supabase = Postgres + free tier + managed.
2. **RLS instead of bespoke auth in code.** The single hardest part of multi-tenant user state is "did this request actually own this row." Postgres RLS expresses that as a policy on the table, not a check scattered through API routes. Less drift surface.
3. **JWT-based per-row auth without rolling our own session store.** Supabase's PostgREST consumes a Bearer JWT (signed with the project's HS256 secret today) and exposes `jwt ->> 'sub'` to RLS policies. Our existing Auth.js session already carries the subject we need.

**Considered alternatives:**
- **Vercel Postgres / Neon direct.** Doable, but we'd hand-roll RLS-equivalent in route handlers (drift surface) or layer something like PostGraphile (more infra). Free tier comparable; less out-of-the-box safety.
- **Custom service in `vires-numeris`.** Would mean Codex's runtime owning user-state writes directly. Decided against: keeps the surface area in two repos coordinated, but the network hop is unavoidable either way, and Supabase gives us RLS for free.
- **Filesystem (current dev-only `GUIDED_LOCAL_REBUILD_PATH`).** Single-machine, no auth, no multi-user. Useful as dev fallback only.

## Env plan

Environment variables required for the Supabase path:

| Variable | Scope | Source | Notes |
|---|---|---|---|
| `SUPABASE_URL` | server-side | Vercel env (Preview + Production) | Project URL |
| `SUPABASE_ANON_KEY` | server-side | Vercel env | PostgREST API gate; per-row auth comes from JWT, not this key |
| `SUPABASE_JWT_SECRET` | server-side | Vercel env | Legacy HS256 — used to mint short-TTL JWTs in `lib/guided-supabase-jwt.server.ts` |
| `SUPABASE_DB_URL` | server-side (migrations only) | GitHub Secret (vires-numeris migration workflow only); not present in Vercel request-time env. | Direct Postgres URL for the migration runner; not used at request time |
| `GUIDED_READ_STORE` | server-side | Vercel env (`supabase` on Preview) | Selects between filesystem / projection-HTTP / Supabase read stores |

**Secrets are server-only.** Never `NEXT_PUBLIC_*` prefixed. The anon key is server-side too even though it's "public" in Supabase parlance — we don't expose it to browsers because per-row auth needs the JWT, and the JWT minting must stay server-side.

**Architectural debt — legacy HS256.** Supabase's new asymmetric JWT signing keys (ECC P-256) require minter-side signing infrastructure we don't have yet. When Supabase eventually deprecates the legacy HS256 key, the minter at `lib/guided-supabase-jwt.server.ts` will break. Migration targets:
- Supabase Auth as the issuer (cleaner, but couples to their auth product), or
- Hand-rolled ES256 with proper key management (more code, more flexibility).

Tracked in `docs/supabase-rls-spike.md` and the `GUIDED-T1-HARDCODED-SCOPE-REMOVAL` T2 sub.

## Auth + scope resolver

T1 ships a single internal scope:

```ts
// lib/guided-scope.server.ts
const T1_INTERNAL_SCOPE: GuidedScope = {
  user_id: "jacob",
  account_id: "paper_main",
  strategy_group_id: "default",
}
```

Mapping is `GUIDED_T1_SCOPE_EMAILS` (env, comma-separated) → `T1_INTERNAL_SCOPE`. Anything else throws `UnknownScopeIdentityError`.

**Two separate envs by design:**
- `AUTH_ALLOWED_EMAILS` (in `lib/auth.server.ts`) — who can sign in.
- `GUIDED_T1_SCOPE_EMAILS` (in `lib/guided-scope.server.ts`) — who maps to the internal Guided scope.

A test address that's allowed to sign in but not on the Guided scope list surfaces `UnknownScopeIdentityError` — preview pages render labeled mock fallback rather than inheriting Jacob's scope. **This split prevents an auth-only test email from accidentally inheriting Jacob's Guided identity.**

T2 replaces the static map with multi-tenant scope routing. Tracked in `GUIDED-T1-HARDCODED-SCOPE-REMOVAL` T2 sub.

## Retention / delete behavior

Every persisted artifact carries a `RetentionPolicy` (defined in `components/vires/guided/types.ts`):

```ts
interface RetentionPolicy {
  retention_class: RetentionClass
  delete_behavior: DeleteBehavior
  contains_user_data: boolean
  contains_broker_data: boolean
  contains_regulated_data: boolean
}

type RetentionClass =
  | "PUBLIC_STATIC"
  | "USER_STATE"
  | "CONSENT_RECORD"
  | "BROKER_REFERENCE"
  | "ANONYMIZED_AGGREGATE"

type DeleteBehavior = "DELETE" | "TOMBSTONE" | "RETAIN_FOR_AUDIT" | "ANONYMIZE"
```

Current postures by record kind:

| Kind | Retention class | Delete behavior |
|---|---|---|
| `guided_decline_record.v1` | `USER_STATE` | `TOMBSTONE` (contains regulated data) |
| `guided_enrollment.v1` | `USER_STATE` | `RETAIN_FOR_AUDIT` |
| `disclosure_acceptance_snapshot` | `CONSENT_RECORD` | `RETAIN_FOR_AUDIT` |
| `guided_match_proposal.v1` | `USER_STATE` | `TOMBSTONE` |
| `strategy_library_entry.v1` | `PUBLIC_STATIC` | `RETAIN_FOR_AUDIT` |

`TOMBSTONE` means soft-delete with content nulled but row id retained — necessary for replay-idempotency on commands (a re-fire after a delete must not create a duplicate). `RETAIN_FOR_AUDIT` is for records we cannot delete without breaking the consent/audit chain.

Implementation: tombstoning logic lives runtime-side (Codex's surface). Dashboard reads filter out tombstoned rows.

## Migration plan

Migrations are managed by `scripts/supabase_migrate.py` (in `vires-numeris`), which:
- Reads `.sql` files from `supabase/migrations/` in lexicographic order.
- Tracks applied migrations in `public.schema_migrations` (created by `20260514000000_schema_migrations_ledger.sql`).
- Supports `validate` (parse + dry-run plan) and `apply --dry-run` / `apply` (execute).

The runner is invoked from `.github/workflows/supabase-migrate.yml` (validates on PRs touching migrations/runner files; applies only via manual workflow_dispatch apply).

Current migrations:
1. `20260514000000_schema_migrations_ledger.sql` — the migrations ledger table itself.
2. `20260514010000_guided_enrollment_spike.sql` — the Step 2 RLS spike table `public.guided_enrollment_spike`.

The migration runner was VIR-5 / HOUSEKEEPING-004 work. Closure ticket merged 2026-05-18 (PR #5).

## T1 vs T2 boundary

| Concern | T1 (today) | T2 (future) |
|---|---|---|
| Scope mapping | Static `GUIDED_T1_SCOPE_EMAILS` → single internal scope | Multi-tenant scope routing; scope resolved from authenticated session identity |
| JWT signing key | Legacy HS256 (Supabase project secret) | ES256 or Supabase Auth as issuer |
| RLS policies | Single-tenant (`(jwt ->> 'sub') = user_sub`) | Multi-tenant with proper org/account hierarchy |
| Audit trail | `RETAIN_FOR_AUDIT` rows accumulate forever in T1 | Retention policy enforcement with periodic compaction |
| Read paths | `GuidedReadStore` triad (filesystem / projection / supabase) | Single Supabase read path; legacy stores retired |

**Closure mechanism for this row:** This document, plus the migrated tables + the active read store (`lib/guided-read-store.supabase.server.ts`), satisfy the closure evidence:
- ✅ Architecture note (this doc)
- ✅ Env plan (above)
- ✅ Auth/scope resolver (`lib/guided-scope.server.ts` + `lib/guided-supabase-jwt.server.ts`)
- ✅ Retention/delete behavior (`RetentionPolicy` contract)
- ✅ Migration plan (`scripts/supabase_migrate.py` + workflow)

## Related references

- `lib/guided-read-store.supabase.server.ts` — current read implementation
- `lib/guided-supabase-jwt.server.ts` — JWT minter
- `lib/guided-scope.server.ts` — scope resolver
- `docs/supabase-rls-spike.md` — Step 2 spike rationale + smoke checklist
- `_design_handoff/INFRA_SMOKE_AUTOMATION_STEP1_SPEC_2026-05-13.md` — preceding Step 1 spec
- `_design_handoff/INFRA_LINEAR_CYRUS_SPECKIT_STEP4_SPEC_2026-05-13.md` — Step 4 spec
- vires-numeris `supabase/migrations/` — migration source files
- vires-numeris `scripts/supabase_migrate.py` — migration runner
- vires-numeris `.github/workflows/supabase-migrate.yml` — CI invocation
