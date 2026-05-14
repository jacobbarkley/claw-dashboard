# INFRA — Supabase RLS Spike Step 2

**Date:** 2026-05-13
**Owner:** Codex (backend lead) + Claude (frontend assist)
**Time-box:** 2 days hard cap
**Tracks acceleration plan:** Step 2 of 5

## Goal

Prove the Supabase + RLS pattern works end-to-end on a single enrollment row, so we can retire the bespoke HTTP projection adapter (`lib/guided-read-store.projection.server.ts`) and stop carrying our own request-ID echo / scope-authority enforcement / error-envelope decoding code. Industry-standard auth-keyed row-level security replaces a hand-rolled scope resolver.

This is a **pattern spike**, not a full migration. One table, one row written from Python, one row read from the dashboard. The proof we want is: identity A cannot read identity B's row, identity A can read identity A's row, and the policy lives in SQL — not in TypeScript.

If the spike works, the rest of the projection surfaces become a mechanical rollout. If the spike surfaces friction (Supabase JWT secret ergonomics, RLS policy edge cases, supabase-py async story), we know before we've sunk a week into wholesale migration.

## Requirements (acceptance criteria)

1. A new Supabase project (`vires-rls-spike`) on free tier exists, with credentials in Vercel + GitHub Secrets via bootstrap script (no chat-pasted secrets).
2. One table `guided_enrollment_spike` exists in Supabase with RLS enabled. The schema and policy live in a migration file in `vires-numeris` (not the dashboard).
3. RLS policy keys off `auth.jwt() ->> 'sub'` — **not** Supabase's built-in `auth.uid()`. The `sub` claim is the email address during the spike, and will become the WorkOS user ID in Step 3 with no policy change.
4. A Python writer in `vires-numeris` writes a Jacob-scoped row using the Supabase service role key.
5. The dashboard has a new read path `lib/guided-read-store.supabase.server.ts` that mints an HS256 JWT signed with the Supabase JWT secret, with the authenticated user's email as `sub`, and reads via the supabase-js client.
6. A feature flag `GUIDED_READ_STORE=supabase|projection` toggles which read store the active enrollment page uses. Default = `projection`. Preview deploy sets `supabase` so the smoke covers it.
7. Two RLS proof tests pass:
   - **isolation:** mint a JWT for `notjacob@example.com`, query the Jacob-owned row, assert zero rows returned.
   - **happy path:** mint a JWT for `jacobbarkley95@gmail.com`, query the same row, assert one row returned with the expected payload.
8. The Step 1 autonomous smoke continues to pass against the supabase-backed preview. (Currently asserts `GuidedSurfaceErrorState` — once Supabase serves the row, the active-enrollment spec asserts on real seeded fields instead.)
9. **Zero production env changes.** Supabase project is wired to Vercel Preview scope only during the spike.

## Out of scope for Step 2 (deferred to Steps 3/4 or beyond)

- **WorkOS-issued JWTs.** Spike uses our own HS256 JWT minted from the Auth.js session. Step 3 swaps the issuer to WorkOS; the RLS policy doesn't change because `sub` stays the user identifier.
- **All other projection surfaces.** Monitoring, events, match, broker stay on the projection adapter. Only `active` proves the pattern.
- **Production cutover.** Production still reads the projection adapter. The Supabase env vars are Preview-only.
- **Schema design for the full enrollment shape.** The spike row uses a `payload jsonb` column. Step 5 (or wherever the rollout lands) designs the actual typed columns.
- **Migration tooling.** One hand-applied SQL file is fine for the spike. Adopt a migration tool (sqitch / supabase-cli migrations / atlas) when the rollout starts.
- **Connection pooling, observability, retries.** Default supabase-js + supabase-py behavior is sufficient at spike traffic levels.

## Constraints

- **Service role discipline:** the `SUPABASE_SERVICE_ROLE_KEY` lives in `vires-numeris` only — never in the dashboard. The dashboard signs its own short-TTL HS256 JWT from `SUPABASE_JWT_SECRET` and uses the anon key. If the dashboard ever needs service-role power, that's a red flag — service role bypasses RLS, which defeats the point.
- **JWT shape locked to be WorkOS-portable:** `sub` is the user identifier (email for spike, WorkOS user ID for Step 3). `aud: "authenticated"` (Supabase convention). `role: "authenticated"`. TTL 60s. The policy reads `auth.jwt() ->> 'sub'`, never `auth.uid()`.
- **No secrets through chat.** Per the rotation-debt feedback rule, all secrets land via bootstrap script: `bash scripts/bootstrap-supabase-env.sh` reads from a temp file or prompts interactively, writes to `vercel env add` + `gh secret set`, never echoes the values.
- **Free tier is enough.** Spike DB stays under 500 MB and 50 MB egress. If we blow past either, the spike is doing too much.
- **Preview deploys only.** Production stays on the projection adapter until the rollout PR explicitly flips it.

## Design notes

### JWT minting (dashboard side)

`lib/guided-supabase-jwt.server.ts`:

```ts
import "server-only"

import { SignJWT } from "jose"

export async function mintSupabaseJwt(userSub: string): Promise<string> {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) throw new Error("SUPABASE_JWT_SECRET missing")
  return await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userSub)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(secret))
}
```

### Read path (dashboard side)

`lib/guided-read-store.supabase.server.ts` exposes the same interface as `lib/guided-read-store.projection.server.ts` — `getActiveEnrollment(scope)` returns the same `GuidedActiveEnrollmentView` shape. The active-enrollment page calls a factory:

```ts
function getReadStore() {
  return process.env.GUIDED_READ_STORE === "supabase"
    ? supabaseReadStore
    : projectionReadStore
}
```

Same return shape both sides → page-level code doesn't branch.

### Write path (Python side)

`vires-numeris/src/vires_numeris/stores/supabase_spike.py`:

```python
from supabase import create_client

def write_jacob_spike_row(payload: dict) -> None:
    client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],  # bypasses RLS — trusted backend only
    )
    client.table("guided_enrollment_spike").upsert({
        "user_sub": "jacobbarkley95@gmail.com",
        "scope_id": "jacob_paper_main_default",
        "payload": payload,
    }).execute()
```

A CLI entry point `python -m vires_numeris.cli supabase-spike-write` lets us re-seed the row on demand.

### Schema + RLS policy

```sql
-- vires-numeris/migrations/2026-05-14_guided_enrollment_spike.sql

create table public.guided_enrollment_spike (
  id uuid primary key default gen_random_uuid(),
  user_sub text not null,
  scope_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.guided_enrollment_spike (user_sub);

alter table public.guided_enrollment_spike enable row level security;

create policy "read_own_rows"
  on public.guided_enrollment_spike
  for select
  using (auth.jwt() ->> 'sub' = user_sub);

-- No insert/update/delete policy: only service_role can write, which bypasses RLS by design.
```

### Env vars

| Where | Var | Value | Scope |
|---|---|---|---|
| Vercel project (`claw-dashboard`) | `SUPABASE_URL` | from Supabase project settings | Preview only |
| Vercel project | `SUPABASE_ANON_KEY` | from Supabase project settings | Preview only |
| Vercel project | `SUPABASE_JWT_SECRET` | from Supabase project settings (Authentication → JWT Settings) | Preview only |
| Vercel project | `GUIDED_READ_STORE` | `supabase` | Preview only |
| GitHub Secrets (`vires-numeris`) | `SUPABASE_URL` | same | repo-wide |
| GitHub Secrets (`vires-numeris`) | `SUPABASE_SERVICE_ROLE_KEY` | from Supabase project settings | repo-wide |
| GitHub Secrets (`vires-numeris`) | `SUPABASE_JWT_SECRET` | same | repo-wide |

Production scope on Vercel keeps `GUIDED_READ_STORE` unset (defaults to `projection`). No production change.

## Tasks (dependency-ordered)

1. **Provision Supabase project** (Jacob, ~5 min): create `vires-rls-spike` on free tier, copy URL + anon key + JWT secret + service role key to a one-time temp file.
2. **Bootstrap script** (Claude): `scripts/bootstrap-supabase-env.sh` reads from temp file, writes to Vercel preview env + `vires-numeris` GitHub Secrets, then deletes the temp file. Runs on Jacob's machine, secrets never visible to Claude.
3. **Migration file** (Codex): SQL above committed to `vires-numeris/migrations/`. Codex applies it once against the spike DB.
4. **Python writer + CLI** (Codex): `vires_numeris.stores.supabase_spike` + CLI entry. Seeds one Jacob row.
5. **JWT minter + supabase read store** (Claude): `lib/guided-supabase-jwt.server.ts` + `lib/guided-read-store.supabase.server.ts` + factory wired into the active-enrollment page.
6. **Feature flag** (Claude): `GUIDED_READ_STORE` env read at request time; factory picks store.
7. **RLS proof tests** (Codex): a `pytest` test in `vires-numeris` that mints two JWTs, queries through supabase-py with each, asserts isolation. Runs in CI on `vires-numeris` PRs.
8. **Smoke spec update** (Claude): when `GUIDED_READ_STORE=supabase` on preview, the `e2e/guided-preview/active.spec.ts` asserts on the seeded payload (e.g., "Steady Tide") instead of the configured-error state. Other 4 surfaces still assert the error state until their projection counterparts migrate.
9. **Documentation** (Claude): `docs/supabase-rls-spike.md` — how it works, how to re-seed, how to flip the flag, how to invalidate the spike.

## Risk + abort

- **Day 2 no green** → scope down: drop the smoke-spec update (Task 8), keep the RLS proof tests (Task 7) as the only proof. The spike doesn't need to be visible in the dashboard to be valid; SQL-level isolation tests are the real evidence.
- **supabase-py async/sync friction** → use sync client for the spike; revisit async at rollout time.
- **JWT secret rotation surprise** → document that rotating `SUPABASE_JWT_SECRET` requires simultaneous Vercel + `vires-numeris` env update. Add a check to the bootstrap script that asserts the two match before continuing.
- **Free tier quota hit during spike** → fall back to a single-row table with `truncate before insert`. Spike is one row at a time.

## Linked obligations

- Closes **none** directly, but is the prerequisite for closing `DATA-T1-PRIVATE-STORE-DECISION` (records Supabase as the private store choice) once the rollout PR lands.
- Unblocks: Step 3 WorkOS spike (reuses the JWT pattern, swaps issuer).
- Unblocks: future closure of `GUIDED-T1-PRIVATE-USER-STATE-STORE` for the read path.

## Definition of done

- [ ] Supabase project provisioned, env vars wired via bootstrap script
- [ ] Migration applied, table + policy live in spike DB
- [ ] Python writer seeded one Jacob row
- [ ] Dashboard active-enrollment page reads the row when `GUIDED_READ_STORE=supabase` on preview
- [ ] RLS proof tests in `vires-numeris` CI pass (isolation + happy path)
- [ ] Step 1 autonomous smoke still green on the supabase-backed preview
- [ ] `docs/supabase-rls-spike.md` exists
- [ ] Step 3 ticket (`INFRA_WORKOS_AUTH_SPIKE`) is drafted in `_design_handoff/` as the next slice

## Open questions for Codex

1. **supabase-py version**: v1 (sync) or v2 (async-first)? v2 is the current line but might pull more deps. Recommendation: v2 sync mode for spike; revisit if friction.
2. **Migration tooling**: hand-applied SQL is fine for the spike, but should Step 2 also stand up a migration tool (sqitch / atlas / supabase-cli) so it's ready for rollout? Or defer the tooling pick to the rollout PR?
3. **Service role exposure surface**: `SUPABASE_SERVICE_ROLE_KEY` will live in `vires-numeris` GitHub Secrets. Should we additionally restrict its blast radius via a Supabase database role with column-level grants, or is the spike too small to warrant that?
4. **Anon key in client bundle**: supabase-js anon key is safe to expose to the browser, but we're using supabase-js server-side only during the spike. Confirm we want to keep it server-side for now to keep the surface minimal.
5. **RLS policy semantics for the missing-row case**: when identity A queries identity B's row, RLS returns zero rows rather than 403. The dashboard's `not-found` UI handles this. Codex confirm this is the intended UX (vs. surfacing "unauthorized" explicitly).

## Out-of-band: what Jacob needs to do

1. Create Supabase project at supabase.com (free tier, ~5 min).
2. Copy URL + anon key + JWT secret + service role key into a temp file (one-time, deleted after bootstrap script runs).
3. Run `bash scripts/bootstrap-supabase-env.sh /path/to/temp-file` — script handles the rest.

That's it. Codex owns the SQL + Python writer + RLS tests. Claude owns the JWT mint + supabase read store + feature flag + smoke spec.
