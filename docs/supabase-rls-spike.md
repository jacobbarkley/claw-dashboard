# Supabase RLS spike — operator notes

The Step 2 spike from the 2026-05-13 acceleration plan routes the dashboard's
active-enrollment read through a Supabase Postgres table protected by row-
level security. This doc covers what's wired, how to flip it on or off, and
where the architectural debt lives.

## What is wired

- `lib/guided-read-store.supabase.server.ts` implements `GuidedReadStore`,
  but only `readGuidedEnrollmentView` is real. The other three methods reject
  with `GuidedUserStateUnavailableError`, which the four sibling preview
  pages render as the "Guided state service is not configured" empty state.
- `lib/guided-data-source.server.ts → resolveUserStateStore()` selects the
  Supabase store when `GUIDED_READ_STORE === "supabase"`. The previous
  projection / filesystem cascade is preserved as a fallthrough for other
  values of the flag.
- `lib/guided-supabase-jwt.server.ts` mints a 60s HS256 JWT signed with the
  legacy Supabase JWT secret. The session subject (Jacob's email today,
  WorkOS user id after Step 3) becomes the JWT `sub` claim, which RLS
  authorizes off.

## How to flip the flag

Preview (default for the spike):

```
GUIDED_READ_STORE=supabase
SUPABASE_URL=https://gcynmgnzicwpibywfcal.supabase.co
SUPABASE_ANON_KEY=<paste>
SUPABASE_JWT_SECRET=<paste — legacy HS256>
```

`scripts/bootstrap-supabase-env.sh` writes all four of these to Vercel
Preview in one shot and mirrors the secrets that vires-numeris needs to the
GitHub Secrets store on that repo.

To take the spike out of the path without removing credentials, set
`GUIDED_READ_STORE` to anything other than the literal string `supabase` (or
remove it). The factory falls back to the projection / filesystem cascade.

## The seeded row

There is exactly one row in `public.guided_enrollment_spike` today:

| column         | value                                                 |
| -------------- | ----------------------------------------------------- |
| user_sub       | `jacobbarkley95@gmail.com`                            |
| scope_id       | `jacob_paper_main_default`                            |
| enrollment_id  | `enrollment_jacob_paper_main_active`                  |
| payload        | full `GuidedEnrollmentView.model_dump(mode="json")`   |

Source artifact:
`/home/jacobbarkley/.openclaw/workspace/trading-bot/state/rebuild_latest/guided/views/jacob/paper_main/default/enrollment_jacob_paper_main_active/guided_enrollment_view.json`

To re-seed, run Codex's spike CLI from `~/vires-numeris` (see the PR #3
README on that repo). Re-seeding is idempotent on `(scope_id, enrollment_id)`.

## Where credentials live

- **Vercel Preview, claw-dashboard project**: `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `GUIDED_READ_STORE`.
- **GitHub Secrets, vires-numeris repo**: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`. The service-role key is
  intentionally not on the dashboard side — only the spike's writer
  (Codex's CLI / GHA seed job) needs it.

Local dev: do not export these in `.env.local` unless explicitly walking
through the spike. The default dev path uses the filesystem store against
`GUIDED_LOCAL_REBUILD_PATH` and does not need Supabase credentials.

## Architectural debt: HS256 → ES256 / Supabase Auth

The project's Supabase instance uses the new asymmetric JWT Signing Keys
(ECC P-256) as **Current Key**. The legacy HS256 secret remains as
**Previous Key** and is what PostgREST verifies our hand-rolled JWTs
against today. This works because Supabase still accepts tokens signed by
either key. It will not work forever — Supabase has put the legacy key on
a deprecation path, and when it is revoked, the HS256 minter in
`guided-supabase-jwt.server.ts` breaks.

Two viable migration targets, both deferred until after Step 3:

1. **Supabase Auth as the issuer.** WorkOS-authenticated users log into
   Supabase via the WorkOS SSO connector, and the dashboard hands their
   Supabase session JWT to PostgREST directly. Removes the hand-rolled
   minter entirely.
2. **Hand-rolled ES256.** Replace `mintSupabaseJwt` with a P-256 signer
   that uses the asymmetric Current Key. Keeps the spike-shape architecture
   but adds key management.

Track the work in the deferred obligations ledger and surface the decision
before/during the Step 3 (WorkOS auth) cutover, when the JWT subject is
about to change anyway.

## Other gaps the spike does not close

- Only `guided_enrollment_view` is on the supabase path. Match-proposal,
  enrollment, and events-view reads still go through the projection /
  filesystem cascade, or render the configured-error state under the
  supabase flag. Expanding coverage is a follow-up after Codex finishes the
  matching tables.
- The JWT subject is Jacob's email. After Step 3 lands, callers must pass
  the WorkOS user id and the seeded row's `user_sub` must be re-seeded to
  match — same minter, different input.
- No client-side cache. Each request mints a fresh JWT and opens a new
  PostgREST connection. Acceptable for the spike; revisit before any path
  that would hit this on every render.
