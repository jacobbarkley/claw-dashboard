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
- **JWT Templates with stable `sub`** — WorkOS issues tokens with `sub = stable WorkOS user ID`. Reserved claims like `sub` cannot be customized (per WorkOS docs), but the WorkOS user ID is a stable opaque identifier that fits Step 2's RLS policy after a one-time row re-seed. Email is carried as a separate claim. ([Source](https://workos.com/docs/authkit/jwt-templates))
- **Magic links built-in** — we no longer maintain the Resend integration ourselves.
- **SSO/SAML/OAuth on the upgrade path** — we don't pay for it now, but the day a customer wants it, it's a config change in WorkOS, not a rebuild.

## Requirements (acceptance criteria)

1. A WorkOS organization (`vires-spike`) exists with AuthKit enabled and Jacob's email allowlisted.
2. WorkOS env vars are wired into Vercel + GitHub Secrets via a bootstrap script — no chat-pasted secrets.
3. A new `lib/auth-workos.server.ts` exposes `auth()`, `signIn()`, `signOut()` with the same return shape as the current `lib/auth.server.ts` (`{ guidedEmail }` accessor preserved).
4. New routes `/auth/sign-in`, `/auth/callback`, `/auth/sign-out` per the WorkOS Next.js App Router pattern. The current `/signin` and `/signin/verify` routes are deprecated and redirect to the WorkOS routes.
5. The scope resolver `lib/guided-scope.server.ts` reads identity from the WorkOS access token instead of the Auth.js session. The `GUIDED_T1_SCOPE_EMAILS` env mapping continues to work — keyed off the WorkOS user's `email` claim (NOT `sub`; email is a separate WorkOS claim).
6. The Step 2 Supabase RLS JWT minter (`lib/guided-supabase-jwt.server.ts`) is updated to derive `sub` from `session.sub` (WorkOS user ID) instead of `session.email`. The Supabase RLS policy SQL **does not change** — only the `user_sub` value in the spike row gets re-seeded (separate explicit task) to match the new identity. Email is still carried in `session.email` for scope mapping.
7. The E2E bypass route `/api/e2e/auth` keeps working under WorkOS via **Option B (HS256 bypass + auth-factory shim)**. WorkOS impersonation is admin/support flow, not a clean programmatic CI path, so we keep our own bypass — the factory synthesizes the same `GuidedAuthSession` shape for the bypass token. ([Source](https://workos.com/docs/authkit/impersonation))
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
- **RLS policy is frozen.** Step 2's policy is `(select auth.jwt() ->> 'sub') = user_sub`. The policy SQL is byte-for-byte unchanged across the Step 2 → Step 3 transition. What changes is the `user_sub` *value* in the seeded row, and the *value* of `sub` in minted Supabase JWTs — both swap from Jacob's email to Jacob's WorkOS user ID.
- **WorkOS `sub` is reserved.** WorkOS JWT Templates cannot set reserved keys, including `sub`. WorkOS issues `sub = stable user ID` (opaque). We cannot configure email-as-sub, so we don't try. Email is carried in a separate claim and read via `session.email` for scope mapping; `session.sub` (user ID) feeds Supabase RLS.
- **Session pattern: sealed sessions** (WorkOS recommended). The server unseals/authenticates the session cookie to get access-token claims as needed. Keeps session lifecycle/refresh semantics inside WorkOS rather than rebuilding them. ([Source](https://workos.com/docs/reference/authkit/authentication))
- **No secrets through chat.** All credentials land via `scripts/bootstrap-workos-env.sh`.
- **Preview-scoped feature flag.** `AUTH_PROVIDER=workos` is set on Vercel Preview only. Production stays on `authjs` until the cutover PR.
- **Agent identity is orthogonal.** Linear/Cyrus/Codex/Claude don't authenticate as WorkOS human users. They act as GitHub/Linear app identities or backend service actors. When agents later appear in Vires audit trails, model them as `actor_type=agent|system` with their own IDs. Do not route agent automation through WorkOS user auth.

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

The minter function signature is unchanged:

```ts
export async function mintSupabaseJwt(userSub: string): Promise<string> {
  // userSub = whatever identity the caller passes
}
```

In Step 2 the caller was `mintSupabaseJwt(session.email)` (Auth.js carries email as identity). In Step 3 the caller becomes:

```ts
const session = await getGuidedAuthSession()        // unchanged interface
const supabaseJwt = await mintSupabaseJwt(session.sub) // WorkOS user ID, not email
```

`session.email` is still available on the session — it's just routed to scope mapping (`GUIDED_T1_SCOPE_EMAILS`) instead of to Supabase. The Supabase RLS policy SQL is byte-for-byte identical; what changes is the *value* feeding `sub`.

The Step 2 spike row gets a one-time re-seed: `update guided_enrollment_spike set user_sub = '<jacob_workos_user_id>' where user_sub = 'jacobbarkley95@gmail.com'`. After that, the row matches WorkOS-minted tokens and RLS authorizes correctly. This is a dedicated task (see Tasks below) because the re-seed depends on knowing Jacob's WorkOS user ID, which requires Jacob's first WorkOS sign-in.

### Routes

WorkOS Next.js App Router pattern:

- `app/auth/sign-in/route.ts` — redirects to WorkOS hosted sign-in
- `app/auth/callback/route.ts` — exchanges authorization code for sealed session, sets cookie, redirects to original `?return_to=`
- `app/auth/sign-out/route.ts` — clears session cookie, redirects to home

The current `/signin` and `/signin/verify` routes redirect to `/auth/sign-in` when `AUTH_PROVIDER=workos`. After cutover, they're deleted.

### E2E bypass — Option B locked in

The autonomous smoke depends on `/api/e2e/auth` minting a session cookie that the dashboard recognizes. Codex's review concluded WorkOS impersonation is admin/support flow (Dashboard-redirect, per-env-enable) and not a clean programmatic CI path. Keep our HS256 bypass.

**Implementation:** the bypass route mints an HS256 token as today. A small adapter `lib/auth-factory.server.ts::authenticateFromBypassToken()` accepts the HS256 token and synthesizes a `GuidedAuthSession` for the request. The session cookie is our own (gated by `E2E_AUTH_BYPASS=1`, only on Preview), not WorkOS's. The factory hides which session source is active from the rest of the app.

WorkOS impersonation is kept on the roadmap as a later admin/support feature, not the smoke path.

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

1. **Provision WorkOS organization** (Jacob, ~10 min): sign up at workos.com, create `vires-spike` org, enable AuthKit, allowlist Jacob's email. No JWT Template customization needed — WorkOS issues `sub = user ID` + `email` claim by default, which is what we want.
2. **Bootstrap script** (Claude): `scripts/bootstrap-workos-env.sh` reads from temp file, writes to Vercel Preview + GitHub Secrets, deletes temp file.
3. **Install `@workos-inc/node`** (Claude): add dep + lockfile update.
4. **`lib/auth-workos.server.ts`** (Claude): WorkOS session interface using sealed-session pattern, `auth()` / `signIn()` / `signOut()` matching the current shape. `session.sub` = WorkOS user ID; `session.email` = email claim.
5. **Auth routes** (Claude): `/auth/sign-in`, `/auth/callback`, `/auth/sign-out` per WorkOS Next.js App Router pattern.
6. **Factory `lib/auth-factory.server.ts`** (Claude): single switch point between Auth.js and WorkOS based on `AUTH_PROVIDER`. Exposes `getGuidedAuthSession()` returning `{ email, sub }` regardless of underlying provider, and `authenticateFromBypassToken()` for the E2E shim.
7. **Rewire callers** (Claude): every import of `getGuidedAuthSession` moves from `lib/auth.server.ts` to `lib/auth-factory.server.ts`. The Auth.js export is preserved (still used when the flag is off).
8. **Scope resolver update** (Claude): `lib/guided-scope.server.ts` reads `session.email` from the factory; identity source unchanged from its perspective. (Importantly: scope mapping reads email, not sub.)
9. **Supabase minter call update** (Claude): the active-enrollment page calls `mintSupabaseJwt(session.sub)` instead of `session.email`. Single-line change.
10. **Re-seed Step 2 spike row** (Codex, one-shot): after Jacob signs in once via WorkOS on Preview, capture his WorkOS user ID from the session, then run `python -m vires_numeris.cli supabase-spike-write` with the new identity (or one-shot SQL update). Required for RLS to authorize the WorkOS-issued JWT against the spike row.
11. **E2E bypass adaptation** (Claude): implement Option B — `authenticateFromBypassToken()` synthesizes a `GuidedAuthSession` from the HS256 token. The bypass token now carries both email and a stable test-user sub.
12. **Feature flag** (Claude): `AUTH_PROVIDER` env read at request time in the factory.
13. **Smoke spec update** (Claude): when `AUTH_PROVIDER=workos` on preview, the smoke runs through the WorkOS sign-in flow (or bypass). No assertion changes — same pages, same shapes.
14. **Documentation** (Claude): `docs/workos-auth-spike.md` — how it works, how to flip the flag, how the bypass works under WorkOS, how the cutover PR will deprecate Auth.js.

## Risk + abort

- **Day 2 no green** → narrow the spike to "WorkOS can sign Jacob in and the RLS read works"; defer the bypass adaptation. The autonomous smoke goes red on the WorkOS-preview path until bypass is solved, but the rest of the smoke (against Auth.js-preview) is unaffected.
- **Re-seed timing chicken-and-egg** → Step 2 row uses email-as-sub. Until re-seeded with WorkOS user ID, the Preview WorkOS-flagged path returns zero rows. Mitigation: re-seed runs immediately after Jacob's first WorkOS sign-in. The narrow window is acceptable for a spike — production isn't affected.
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

## Codex review decisions (2026-05-13)

Full review on PR #20. Decisions baked into the spec above:

1. **Impersonation availability** → **Option B locked in**. WorkOS impersonation is admin/support flow (Dashboard-redirect, per-env-enable), not a clean programmatic CI path. Keep our HS256 bypass + auth-factory shim. ([Source](https://workos.com/docs/authkit/impersonation))
2. **Sealed session vs raw JWT** → sealed session (WorkOS recommended). Keeps session lifecycle/refresh inside WorkOS. ([Source](https://workos.com/docs/reference/authkit/authentication))
3. **JWT Template `sub` value** → reserved claim, cannot be customized. `sub = WorkOS user ID`. Step 2 spike row gets re-seeded with WorkOS user ID after Jacob's first sign-in. Email carried in separate claim for scope mapping. ([Source](https://workos.com/docs/authkit/jwt-templates))
4. **Hosted vs embedded UI** → hosted for spike and likely first cutover. Goal is deleting auth plumbing, not spending another slice on login aesthetics.
5. **Step 4 agent identity** → orthogonal to WorkOS user auth. Agents act as GitHub/Linear app identities or backend service actors. If they appear in audit trails, model as `actor_type=agent|system` with their own IDs.

## Out-of-band: what Jacob needs to do

1. Sign up for WorkOS at workos.com (free tier).
2. Create organization `vires-spike`, enable AuthKit, allowlist Jacob's email. **No JWT Template configuration needed** — WorkOS defaults issue `sub = user ID` + `email` claim, which is exactly what we want.
3. Copy API key, Client ID, and a freshly-minted cookie password (≥32 char random) into a temp file.
4. Run `bash scripts/bootstrap-workos-env.sh /path/to/temp-file`.
5. After Step 3 build PR ships and `AUTH_PROVIDER=workos` is on Preview: sign in once at the Preview URL with magic link, then ping Codex with the resulting WorkOS user ID (visible in the session or via WorkOS Dashboard) so the spike row can be re-seeded.
