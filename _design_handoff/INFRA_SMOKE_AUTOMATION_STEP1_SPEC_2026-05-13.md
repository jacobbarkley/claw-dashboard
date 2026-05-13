# INFRA — Smoke Automation Step 1

**Date:** 2026-05-13
**Owner:** Claude (lead) + Codex (assist)
**Time-box:** 2 days hard cap
**Tracks acceleration plan:** Step 1 of 5

## Goal

Replace the manual PR smoke loop (Jacob opens URL, signs in via magic link, eyeballs pages) with an autonomous GitHub Action that signs in as a seeded test user, walks the Guided preview surfaces on the Vercel preview deploy, captures screenshots + Playwright traces, and posts a single pass/fail status check + diff comment to the PR.

This is the prerequisite for the rest of the acceleration plan — Steps 2/3/4 each ship as PRs that pass this smoke before Jacob even sees them.

## Requirements (acceptance criteria)

1. A GitHub Action triggers on `pull_request` against `main`.
2. The action waits for the Vercel preview deployment to reach `success`.
3. Playwright signs in as a seeded test user via a dedicated server-only `/api/e2e/auth` route gated by `E2E_AUTH_BYPASS=1` — no inbox polling, no magic-link redirect, no CSRF/form-POST fight with Auth.js Credentials, no token in URL query string.
4. Playwright walks the 5 Guided preview pages (`/active`, `/monitoring`, `/events`, `/match`, `/broker`) and captures one screenshot per page.
5. A single status check on the PR reflects pass/fail.
6. On fail: trace artifact attached, status red.
7. On pass: status green, optional Argos diff gallery comment, no human needs to open the preview URL.
8. **Zero env-var rotation per PR.** Test account is seeded once, persists across PRs.
9. **Zero production env changes.** Bypass route + secret exist only in Vercel preview scope.

## Out of scope for Step 1 (deferred to Step 4)

- OpenClaw escalation of failed smoke to Telegram. Step 4 wires the daily digest + escalation pipeline; Step 1 just produces the GitHub status check + artifact and lets GitHub's own notifications cover the immediate signal.

## Constraints

- **Security:** the bypass `CredentialsProvider` MUST be gated by `process.env.E2E_AUTH_BYPASS === "1"`, and `E2E_AUTH_BYPASS` MUST only be set in Vercel preview env scope. Never production.
- **Token discipline:**
  - `VERCEL_TOKEN` (if needed): scoped to `claw-dashboard` project, deployments + env-vars permissions only.
  - `E2E_AUTH_BYPASS_SECRET` (signed-token HMAC key): GitHub Secrets + Vercel preview env only.
- **Test account isolation:** seeded user is `jacobbarkley95+e2e@gmail.com`. The email MUST be present in both `AUTH_ALLOWED_EMAILS` and `GUIDED_T1_SCOPE_EMAILS` on Vercel **Preview scope only**. This is the simplest path — `resolveCurrentScope()` in `lib/guided-scope.server.ts` derives scope from `session.email` via env-mapping; adding the seeded email to that mapping in Preview means no code changes to the scope resolver. (Alternative if this env discipline becomes annoying later: bypass JWT carries a scope claim, resolver checks for it first. Defer that refactor.)
- **Argos optional:** if Argos CI wires in ≤30 minutes, include it. Otherwise ship without and revisit later. Don't let visual regression block the basic smoke.
- **Neon deferred:** the dashboard does not currently talk to a DB. Per-PR DB branching belongs in Step 2 when Supabase lands, not Step 1.

## Design notes

### Auth bypass shape

**Use a dedicated server-only `/api/e2e/auth` route gated by `E2E_AUTH_BYPASS=1`** — not the Credentials provider sign-in callback. Auth.js Credentials sign-in is CSRF/form-POST shaped and a query-string GET callback would either fail or leak the bypass token into logs/URL history. The dedicated route is simpler, narrower, and explicit about purpose.

`app/api/e2e/auth/route.ts`:

```ts
// Server-only E2E auth bypass for Playwright smoke runs. Refuses to mount
// unless E2E_AUTH_BYPASS=1, which is set only on Vercel preview scope.
import "server-only"

import { NextResponse } from "next/server"
import { jwtVerify } from "jose"

import { setGuidedAuthSession } from "@/lib/auth.server" // helper that wraps Auth.js session-cookie write

export async function POST(req: Request) {
  if (process.env.E2E_AUTH_BYPASS !== "1") {
    return NextResponse.json({ error: "not enabled" }, { status: 404 })
  }
  const { token } = await req.json()
  const secret = process.env.E2E_AUTH_BYPASS_SECRET
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 })
  }
  let payload: { email: string }
  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: "e2e-playwright",
      audience: "claw-dashboard-e2e",
      // jose enforces exp/iat
    })
    payload = verified.payload as { email: string }
  } catch {
    return NextResponse.json({ error: "invalid token" }, { status: 401 })
  }
  await setGuidedAuthSession({ email: payload.email })
  return NextResponse.json({ ok: true })
}
```

The token is HS256, short TTL (60s), with `iss`/`aud` claims so an arbitrary signed JWT can't fool the route. The session-cookie write reuses whatever helper `lib/auth.server.ts` already exposes for Auth.js session creation (or adds one — Auth.js's Edge-compatible JWT session model makes this a small wrapper).

### Playwright shape

- `playwright.config.ts` with `globalSetup` that:
  1. Mints an E2E bypass JWT signed with `E2E_AUTH_BYPASS_SECRET` (claims: `email`, `iss: "e2e-playwright"`, `aud: "claw-dashboard-e2e"`, `exp: +60s`)
  2. POSTs `{ token }` to `${PLAYWRIGHT_BASE_URL}/api/e2e/auth`
  3. Saves the resulting session cookie via `request.storageState({ path: "storageState.json" })`
- Test files in `e2e/guided-preview/*.spec.ts` set `use.storageState = "storageState.json"` so each test starts signed in.
- One spec per preview page; each asserts that the page renders real data OR the expected empty state (per Codex's PR #14 + production reality).

### GitHub Action shape

```yaml
on: pull_request
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: zentered/vercel-preview-url@v1
        id: preview
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          PLAYWRIGHT_BASE_URL: ${{ steps.preview.outputs.preview_url }}
          E2E_AUTH_BYPASS_SECRET: ${{ secrets.E2E_AUTH_BYPASS_SECRET }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          path: playwright-report/
```

If Argos easy: add `@argos-ci/playwright` integration. If not: skip and ship.

## Tasks (dependency-ordered)

1. **Test account email locked** (Jacob, done): `jacobbarkley95+e2e@gmail.com`.
2. **`E2E_AUTH_BYPASS_SECRET` generated** (Jacob, done): in GitHub Secrets + Vercel preview env scope.
3. **Add seeded email to Preview env** (Jacob): `jacobbarkley95+e2e@gmail.com` to BOTH `AUTH_ALLOWED_EMAILS` and `GUIDED_T1_SCOPE_EMAILS` env vars on Vercel **Preview scope only**.
4. **Add `/api/e2e/auth` route handler** with HS256 verification + Auth.js session-cookie write, gated by `E2E_AUTH_BYPASS === "1"`.
5. **Set `E2E_AUTH_BYPASS=1`** on Vercel **Preview scope only** so the route mounts.
6. **Install Playwright** as dev dep + scaffold `playwright.config.ts` + `globalSetup` that POSTs to `/api/e2e/auth` and stores cookies.
7. **Write 5 spec files** for the preview pages. Assertions: page loads, real data or empty state renders, no MockFallbackBadge on production-path.
8. **Add GitHub Action** that waits for Vercel preview, runs Playwright, uploads artifacts on failure.
9. **Attempt Argos integration** (≤30 min): if longer, skip and document.
10. **Verify on PR #14's smoke** — this work doubles as the verification step for PR #14 itself, replacing the manual smoke loop Codex's tunnel needed.
11. **Document** the workflow in `docs/e2e-smoke.md`.

## Risk + abort

- Day 2 no green → scope down: drop Argos (if attempted), drop 4 of 5 preview specs, keep just `/preview/active` passing. Land that PR. Add the other 4 surfaces incrementally afterward.
- If Vercel preview URL detection is unreliable (deployment-in-progress race conditions), fall back to polling Vercel API instead of relying on the deployment_status event.
- If Auth.js `CredentialsProvider` interferes with the existing magic-link provider, gate the entire provider block conditionally instead of just adding to the array.

## Linked obligations

- Closes **none** in the ledger directly.
- Unblocks: all Steps 2/3/4 of the acceleration plan (they each ship as PRs that pass this smoke before review).
- Vestigialates: the manual smoke loop used for PR #13 + #14 (smoke-against-new-IDs becomes the maiden voyage of this automation, per earlier conversation with Jacob).

## Definition of done

- [ ] PR opens on `claw-dashboard` with the smoke automation wired
- [ ] PR's own GitHub Action passes (it smokes itself)
- [ ] Jacob can see a single status check + screenshot artifact in the PR UI
- [ ] Codex re-spins or simulates the projection backend long enough for the smoke to walk the 5 surfaces; PR is green
- [ ] `docs/e2e-smoke.md` exists with a 1-paragraph "how it works" + "how to add a new spec"
- [ ] Step 2 ticket (`INFRA_SUPABASE_RLS_SPIKE`) is drafted in `_design_handoff/` as the next slice
