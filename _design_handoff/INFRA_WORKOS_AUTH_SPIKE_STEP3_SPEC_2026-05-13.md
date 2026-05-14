# INFRA — WorkOS Auth Spike Step 3

**Date:** 2026-05-13
**Owner:** Claude (lead) + Codex (review)
**Time-box:** 2 days hard cap
**Tracks acceleration plan:** Step 3 of 5
**Depends on:** Step 2 (Supabase RLS spike) — JWT shape decisions inherit from Step 2.

## Goal

Replace the Auth.js v5 + Resend + Upstash adapter + custom JWT minting stack with WorkOS AuthKit, while keeping the RLS pattern proven in Step 2 unchanged. WorkOS issues the JWT whose `sub` claim drives Supabase row-level security; we no longer maintain our own magic-link issuer, our own session cookie, or our own user identity store.

This is a **drop-in spike**: prove WorkOS can sign Jacob in, the dashboard reads its `sub` from the WorkOS access token, the Supabase RLS policy authorizes correctly off that `sub`, and the autonomous smoke still passes. If it works, future steps deprecate `lib/auth.server.ts` and the Upstash adapter; if it doesn't, we know which assumption broke before we've sunk a week into wholesale migration.

## Why WorkOS

- **1M MAU free** — the entire foreseeable Vires user base fits in the free tier.
- **Native Organizations** — multi-tenant primitive built in. We aren't going to use it during the spike, but it's there when Vires grows past single-tenant. No re-architecture later.
- **JWT Templates** — claims are configurable, so `sub` can be the stable WorkOS user ID and Step 2's RLS policy keeps working without change.
- **Magic links built-in** — we no longer maintain the Resend integration ourselves.
- **SSO/SAML/OAuth on the upgrade path** — we don't pay for it now, but the day a customer wants it, it's a config change in WorkOS, not a rebuild.

## Requirements (acceptance criteria)

1. A WorkOS organization (`vires-spike`) exists with AuthKit enabled and Jacob's email allowlisted.
2. WorkOS env vars are wired into Vercel + GitHub Secrets via a bootstrap script — no chat-pasted secrets.
3. A new `lib/auth-workos.server.ts` exposes `auth()`, `signIn()`, `signOut()` with the same return shape as the current `lib/auth.server.ts` (`{ guidedEmail }` accessor preserved).
4. New routes `/auth/sign-in`, `/auth/callback`, `/auth/sign-out` per the WorkOS Next.js App Router pattern. The current `/signin` and `/signin/verify` routes are deprecated and redirect to the WorkOS routes.
5. The scope resolver `lib/guided-scope.server.ts` reads identity from the WorkOS access token instead of the Auth.js session. The `GUIDED_T1_SCOPE_EMAILS` env mapping continues to work — just keyed off the WorkOS user's email claim.
6. The Step 2 Supabase RLS JWT minter (`lib/guided-supabase-jwt.server.ts`) now derives its `sub` from the WorkOS access token. The RLS policy in Supabase **does not change** — that's the whole point.
7. The E2E bypass route `/api/e2e/auth` still works for the autonomous smoke. Either: (a) WorkOS supports user impersonation in test mode and we use that, or (b) we keep our own HS256 bypass route but issue a session cookie WorkOS recognizes. Decision is one of the open questions for Codex.
8. A feature flag `AUTH_PROVIDER=workos|authjs` toggles which auth stack the app uses. Default = `authjs` until cutover PR. Preview deploy sets `workos` so the smoke covers it.
9. The Step 1 autonomous smoke continues to pass against the WorkOS-backed preview, exercising both the magic-link flow (via the bypass route) and the RLS read path (which now sources its identity from WorkOS instead of Auth.js).
10. **Zero production env changes during the spike.** Production stays on Auth.js. The WorkOS env vars are Preview-only.

## Out of scope for Step 3 (deferred to later)

- **Organizations / multi-tenant rollout.** Single-org spike. Jacob is the only user.
- **SSO / SAML / OAuth providers.** Magic-link only, same as today.
- **User migration tooling.** Only Jacob exists; migration = "Jacob signs in once with WorkOS." No back-fill from Upstash needed.
- **Deprecation of `lib/auth.server.ts`.** That happens in the cutover PR after the spike proves out, not in the spike itself.
- **Deprecation of the Upstash adapter.** Same — cutover removes the Upstash dependency; spike runs the two stacks in parallel.
- **AuthKit theming.** WorkOS's hosted sign-in screen is fine for the spike. Custom-branded sign-in is a follow-up.

## Constraints

- **No production change.** The cutover from Auth.js to WorkOS is a separate PR after the spike succeeds. During the spike, production routes use Auth.js; preview routes use WorkOS.
- **RLS policy is frozen.** Step 2's policy is `auth.jwt() ->> 'sub' = user_sub`. The WorkOS access token's `sub` MUST be the same identifier we used in Step 2 (Jacob's email during the spike, WorkOS user ID once we cut over fully). If WorkOS won't let us put email in `sub`, we use the WorkOS user ID and re-seed the spike row's `user_sub` column.
- **JWT Template alignment.** WorkOS JWT Template configured to issue tokens with: `sub` = user ID, `email` = email claim, `aud: "authenticated"`, `role: "authenticated"`. Same shape Supabase expects.
- **No secrets through chat.** All credentials land via `scripts/bootstrap-workos-env.sh`.
- **Preview-scoped feature flag.** `AUTH_PROVIDER=workos` is set on Vercel Preview only. Production stays on `authjs` until the cutover PR.

## Design notes

### Stack swap shape

`lib/auth-workos.server.ts` exposes the same interface that the rest of the app already calls:

```ts
import "server-only"

import { WorkOS } from "@workos-inc/node"
import { cookies } from "next/headers"

const workos = new WorkOS(process.env.WORKOS_API_KEY)

export interface WorkOSAuthSession {
  email: string
  sub: string
  accessToken: string
}

export async function auth(): Promise<WorkOSAuthSession | null> {
  const sessionCookie = (await cookies()).get("wos-session")?.value
  if (!sessionCookie) return null
  const session = await workos.userManagement.loadSealedSession({
    sessionData: sessionCookie,
    cookiePassword: process.env.WORKOS_COOKIE_PASSWORD!,
  })
  const authResult = await session.authenticate()
  if (!authResult.authenticated) return null
  return {
    email: authResult.user.email.toLowerCase(),
    sub: authResult.user.id,
    accessToken: authResult.accessToken,
  }
}
```

The dashboard pages don't care which stack they're on — they call a thin `getGuidedAuthSession()` that delegates to either Auth.js or WorkOS based on `AUTH_PROVIDER`.

### Factory wiring

`lib/auth-factory.server.ts`:

```ts
export async function getGuidedAuthSession(): Promise<GuidedAuthSession | null> {
  if (process.env.AUTH_PROVIDER === "workos") {
    const s = await workosAuth()
    return s ? { email: s.email } : null
  }
  const s = await authjsAuth()
  if (!s) return null
  const email = s.guidedEmail ?? s.user?.email
  return email ? { email: email.toLowerCase() } : null
}
```

Every caller of `getGuidedAuthSession()` from `lib/auth.server.ts` is rewired to import from `lib/auth-factory.server.ts`. The factory is the only place that branches on `AUTH_PROVIDER`.

### Supabase JWT minter — what changes

In Step 2 the minter was:

```ts
export async function mintSupabaseJwt(userSub: string): Promise<string> {
  // userSub = email from Auth.js session
}
```

In Step 3 the caller becomes:

```ts
const session = await getGuidedAuthSession() // unchanged interface
const supabaseJwt = await mintSupabaseJwt(session.email)
```

Same code. The change is upstream: `session.email` now comes from WorkOS access token instead of Auth.js JWT. The Supabase policy SQL is byte-for-byte identical.

### Routes

WorkOS Next.js App Router pattern:

- `app/auth/sign-in/route.ts` — redirects to WorkOS hosted sign-in
- `app/auth/callback/route.ts` — exchanges authorization code for sealed session, sets cookie, redirects to original `?return_to=`
- `app/auth/sign-out/route.ts` — clears session cookie, redirects to home

The current `/signin` and `/signin/verify` routes redirect to `/auth/sign-in` when `AUTH_PROVIDER=workos`. After cutover, they're deleted.

### E2E bypass — the tricky bit

The autonomous smoke depends on `/api/e2e/auth` minting a session cookie that the dashboard recognizes. With WorkOS, two options:

**Option A — WorkOS impersonation API.** WorkOS supports administrative user impersonation in test mode. The bypass route exchanges its HS256 verification token for a WorkOS access token via the impersonation API, then sets the WorkOS session cookie.

**Option B — Keep our HS256 bypass + adapter shim.** The bypass route mints an HS256 token as today. A small adapter `lib/auth-factory.server.ts::authenticateFromBypassToken()` accepts the HS256 token and synthesizes a `WorkOSAuthSession` for the request. The session cookie is our own, not WorkOS's; only the bypass route sets it.

Recommendation: **Option A** if WorkOS impersonation is available on the free tier (need to confirm). Otherwise B.

### Env vars

| Where | Var | Value | Scope |
|---|---|---|---|
| Vercel project | `WORKOS_API_KEY` | from WorkOS dashboard | Preview only |
| Vercel project | `WORKOS_CLIENT_ID` | from WorkOS dashboard | Preview only |
| Vercel project | `WORKOS_COOKIE_PASSWORD` | random ≥32 char | Preview only |
| Vercel project | `WORKOS_REDIRECT_URI` | `${preview-url}/auth/callback` | Preview only |
| Vercel project | `AUTH_PROVIDER` | `workos` | Preview only |
| GitHub Secrets | `WORKOS_API_KEY` | same | repo-wide (for any worker that needs it) |

Production keeps `AUTH_PROVIDER` unset (defaults to `authjs`). No production change.

## Tasks (dependency-ordered)

1. **Provision WorkOS organization** (Jacob, ~10 min): sign up, create `vires-spike` org, enable AuthKit, allowlist Jacob's email, configure JWT Template per the constraint above.
2. **Bootstrap script** (Claude): `scripts/bootstrap-workos-env.sh` reads from temp file, writes to Vercel Preview + GitHub Secrets, deletes temp file.
3. **Install `@workos-inc/node`** (Claude): add dep + lockfile update.
4. **`lib/auth-workos.server.ts`** (Claude): WorkOS session interface, `auth()` / `signIn()` / `signOut()` matching the current shape.
5. **Auth routes** (Claude): `/auth/sign-in`, `/auth/callback`, `/auth/sign-out` per WorkOS pattern.
6. **Factory `lib/auth-factory.server.ts`** (Claude): single switch point between Auth.js and WorkOS based on `AUTH_PROVIDER`.
7. **Rewire callers** (Claude): every import of `getGuidedAuthSession` moves from `lib/auth.server.ts` to `lib/auth-factory.server.ts`. The Auth.js export is preserved (still used when the flag is off).
8. **Scope resolver update** (Claude): `lib/guided-scope.server.ts` calls the factory; identity source unchanged from its perspective.
9. **E2E bypass adaptation** (Claude): pick Option A or B based on Codex review, implement.
10. **Feature flag** (Claude): `AUTH_PROVIDER` env read at request time in the factory.
11. **Smoke spec update** (Claude): when `AUTH_PROVIDER=workos` on preview, the smoke runs through the WorkOS sign-in flow (or bypass). No assertion changes — same pages, same shapes.
12. **Documentation** (Claude): `docs/workos-auth-spike.md` — how it works, how to flip the flag, how the bypass works under WorkOS, how the cutover PR will deprecate Auth.js.

## Risk + abort

- **Day 2 no green** → narrow the spike to "WorkOS can sign Jacob in and the RLS read works"; defer the bypass adaptation. The autonomous smoke goes red on the WorkOS-preview path until bypass is solved, but the rest of the smoke (against Auth.js-preview) is unaffected.
- **WorkOS impersonation unavailable on free tier** → fall back to Option B (HS256 bypass + adapter shim). Small extra code path, no blocker.
- **JWT Template can't put email in custom claim** → use WorkOS user ID as `sub`, re-seed the Step 2 spike row's `user_sub` column to match. One SQL update, no policy change.
- **Cookie domain / SameSite friction on Vercel preview URLs** → WorkOS supports custom cookie config; document the setting and move on.
- **AuthKit hosted sign-in branding looks rough** → ignore for spike; theming is post-cutover.

## Linked obligations

- Unblocks closure of `GUIDED-T1-HARDCODED-SCOPE-REMOVAL` T2 sub-decision (WorkOS provides multi-tenant identity routing).
- Unblocks closure of `AUTH-T2-DEDICATED-AUTH-REDIS` (Auth.js + Upstash deprecated → no dedicated Redis needed).
- Sets up the path for Step 4 Linear/Cyrus integration where worktree routing wants an authoritative user identity.

## Definition of done

- [ ] WorkOS org provisioned, env vars wired via bootstrap script
- [ ] `@workos-inc/node` installed, `lib/auth-workos.server.ts` shipped
- [ ] Auth routes shipped at `/auth/sign-in`, `/auth/callback`, `/auth/sign-out`
- [ ] Factory + flag wired; every `getGuidedAuthSession` caller goes through the factory
- [ ] Bypass route works under `AUTH_PROVIDER=workos`
- [ ] Step 1 autonomous smoke green on WorkOS-flagged preview
- [ ] Step 2 RLS read path works with WorkOS-issued JWTs (sub claim threads through)
- [ ] `docs/workos-auth-spike.md` exists
- [ ] Step 4 ticket (`INFRA_LINEAR_CYRUS_SPECKIT`) is drafted as the next slice

## Open questions for Codex

1. **Impersonation availability**: is WorkOS impersonation API on the free tier? If yes, Option A. If no, Option B with the adapter shim. Codex confirm before we cut code.
2. **Sealed session vs. raw JWT**: WorkOS's recommended pattern uses a sealed encrypted session cookie that's unsealed server-side to yield a JWT. Do we keep the sealed-session pattern or use WorkOS as a pure OIDC provider with the dashboard managing its own cookie? Sealed is simpler; pure OIDC is more portable.
3. **JWT Template `sub` value**: can we put email in `sub`, or is it locked to user ID? If locked, the Step 2 spike row needs re-seeding with WorkOS user ID. Confirm before we run the WorkOS provisioning step so we don't have to redo it.
4. **AuthKit hosted UI vs. embedded UI**: hosted is one redirect, no UI work. Embedded is more code but custom-branded. Spike: hosted. Cutover: TBD. Confirm hosted is OK for spike.
5. **Step 4 implication**: when Linear+Cyrus lands, agent worktrees need an identity to act on. Does the agent run as a WorkOS service-account user, or is the agent identity orthogonal to user auth? Probably orthogonal, but worth confirming the model now.

## Out-of-band: what Jacob needs to do

1. Sign up for WorkOS at workos.com (free tier).
2. Create organization `vires-spike`, enable AuthKit, allowlist Jacob's email.
3. Configure JWT Template per the constraint (sub, email, aud, role claims).
4. Copy API key, Client ID, and a freshly-minted cookie password into a temp file.
5. Run `bash scripts/bootstrap-workos-env.sh /path/to/temp-file`.

Codex reviews the open questions before Jacob provisions, in case the WorkOS account setup choices depend on Codex's answers (especially question 3 on `sub` claim).
