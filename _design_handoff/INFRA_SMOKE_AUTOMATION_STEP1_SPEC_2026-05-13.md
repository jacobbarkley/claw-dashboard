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
3. Playwright signs in as a seeded test user (`e2e+seed@…`) via an Auth.js `CredentialsProvider` bypass — no inbox polling, no magic-link redirect, no human in the loop.
4. Playwright walks the 5 Guided preview pages (`/active`, `/monitoring`, `/events`, `/match`, `/broker`) and captures one screenshot per page.
5. A single status check on the PR reflects pass/fail.
6. On fail: trace artifact attached, status red, OpenClaw escalates to Telegram.
7. On pass: status green, optional Argos diff gallery comment, Jacob can merge without ever opening the preview URL.
8. **Zero env-var rotation per PR.** Test account is seeded once, persists across PRs.
9. **Zero production env changes.** Bypass exists only in Vercel preview scope.

## Constraints

- **Security:** the bypass `CredentialsProvider` MUST be gated by `process.env.E2E_AUTH_BYPASS === "1"`, and `E2E_AUTH_BYPASS` MUST only be set in Vercel preview env scope. Never production.
- **Token discipline:**
  - `VERCEL_TOKEN` (if needed): scoped to `claw-dashboard` project, deployments + env-vars permissions only.
  - `E2E_AUTH_BYPASS_SECRET` (signed-token HMAC key): GitHub Secrets + Vercel preview env only.
- **Test account isolation:** seeded user uses a distinct email (e.g. `e2e+seed@vires.dev` or similar — Jacob picks). The email must be in `GUIDED_T1_SCOPE_EMAILS` on preview env only, OR the bypass provider can mint a session directly without the email needing to be on the allowlist (cleaner).
- **Argos optional:** if Argos CI wires in ≤30 minutes, include it. Otherwise ship without and revisit later. Don't let visual regression block the basic smoke.
- **Neon deferred:** the dashboard does not currently talk to a DB. Per-PR DB branching belongs in Step 2 when Supabase lands, not Step 1.

## Design notes

### Auth bypass shape

Add a conditional Auth.js provider in `lib/auth.server.ts`:

```ts
const providers = []

if (process.env.E2E_AUTH_BYPASS === "1") {
  providers.push(
    Credentials({
      id: "e2e-bypass",
      credentials: { token: { label: "E2E token" } },
      async authorize({ token }) {
        const verified = await verifyE2EBypassToken(
          token,
          process.env.E2E_AUTH_BYPASS_SECRET!,
        )
        if (!verified) return null
        return { id: verified.sub, email: verified.email }
      },
    }),
  )
}

providers.push(Resend({ /* existing */ }))
```

`verifyE2EBypassToken` verifies an HS256 JWT against `E2E_AUTH_BYPASS_SECRET` with short TTL (60s).

### Playwright shape

- `playwright.config.ts` with `globalSetup` that:
  1. Mints an E2E bypass JWT
  2. Hits `/api/auth/callback/credentials?token=…`
  3. Saves resulting cookies to `storageState.json`
- Test files in `e2e/guided-preview/*.spec.ts` reuse `storageState` so each test is signed in instantly.
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

1. **Pick test account email** (Jacob): seeded `e2e+seed@…` address. Decide if it lives in `GUIDED_T1_SCOPE_EMAILS` on preview or the bypass mints a session directly without that constraint.
2. **Generate `E2E_AUTH_BYPASS_SECRET`** (Jacob): 32+ char HMAC secret. Put in GitHub Secrets + Vercel preview env scope only.
3. **Add `CredentialsProvider` bypass** to `lib/auth.server.ts`, gated by `E2E_AUTH_BYPASS`.
4. **Write `verifyE2EBypassToken` helper** with short-TTL JWT verification.
5. **Install Playwright** as dev dep + scaffold `playwright.config.ts` + `globalSetup`.
6. **Write 5 spec files** for the preview pages. Assertions: page loads, real data or empty state renders, no MockFallbackBadge on production-path.
7. **Add GitHub Action** that waits for Vercel preview, runs Playwright, uploads artifacts on failure.
8. **Attempt Argos integration** (≤30 min): if longer, skip and document.
9. **Verify on PR #14's smoke** — this work doubles as the verification step for PR #14 itself, replacing the manual smoke loop Codex's tunnel needed.
10. **Document** the workflow in `docs/e2e-smoke.md`.

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
