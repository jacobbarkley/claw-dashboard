# E2E Smoke Automation

Step 1 of the 2026-05-13 acceleration plan replaces the manual PR smoke loop (Jacob opens preview URL, signs in via magic link, eyeballs pages) with an autonomous GitHub Action.

## How it works

1. Developer opens a PR. Vercel auto-builds a preview deploy on the PR's branch.
2. Vercel emits a `deployment_status` event when the preview reaches `success`.
3. `.github/workflows/e2e-smoke.yml` triggers on that event, filtered to `environment == Preview`.
4. The workflow:
   - Reads the preview URL straight from `github.event.deployment_status.environment_url` — no Vercel API call, no per-PR env-var rotation.
   - Installs deps (cached) + Playwright Chromium (cached).
   - Runs `playwright/globalSetup.ts`, which:
     - Mints an HS256 JWT for `jacobbarkley95+e2e@gmail.com` signed with `E2E_AUTH_BYPASS_SECRET` (issuer `e2e-playwright`, audience `claw-dashboard-e2e`, 60s TTL)
     - POSTs the token to `/api/e2e/auth` on the preview deploy
     - The route delegates to Auth.js `signIn("e2e-bypass", ...)` against the conditional Credentials provider in `lib/auth.server.ts` (mounted only when `E2E_AUTH_BYPASS=1` on Preview env)
     - Saves resulting session cookie to `playwright/.auth/storageState.json`
   - Runs the 5 specs in `e2e/guided-preview/`, each reusing the saved storage state.
   - Posts pass/fail status check on the PR. Uploads HTML report + traces on failure.

## Required env

| Where | Var | Value | Scope |
|---|---|---|---|
| GitHub Secrets (`claw-dashboard`) | `E2E_AUTH_BYPASS_SECRET` | ≥32 char random | repo-wide |
| Vercel project (`claw-dashboard`) | `E2E_AUTH_BYPASS_SECRET` | same value as GitHub Secret | **Preview only** |
| Vercel project | `E2E_AUTH_BYPASS` | `1` | **Preview only** |
| Vercel project | `AUTH_ALLOWED_EMAILS` | includes `jacobbarkley95+e2e@gmail.com` | **Preview only** (production keeps its own list) |
| Vercel project | `GUIDED_T1_SCOPE_EMAILS` | includes `jacobbarkley95+e2e@gmail.com` | **Preview only** |

Production scope MUST NOT have `E2E_AUTH_BYPASS=1` or `E2E_AUTH_BYPASS_SECRET`. If either appears on Production, the bypass provider mounts and the bypass route accepts tokens — a security regression.

## What the smoke currently asserts

While `CODEX_PROJECTION_BASE_URL` stays unset on Preview (current state — Step 2 retires the projection adapter entirely in favor of Supabase), all 5 preview pages should render the `GuidedSurfaceErrorState` titled **"Guided state service is not configured"**. The specs assert that surface plus the absence of `MockFallbackBadge` on the page.

When Step 2 lands and Supabase replaces the projection adapter, the specs evolve to assert on real seeded data instead of the error state.

## Adding a new spec

1. Create `e2e/<surface>/<name>.spec.ts`.
2. Import `{ expect, test } from "@playwright/test"`.
3. Use `page.goto("/your/route")` — `baseURL` is configured globally.
4. Storage state is reused from globalSetup; the test starts already signed in as the seeded user.
5. Push the branch. CI runs automatically on Vercel preview deployment.

## Local development

You can run Playwright locally against a dev server (`npm run dev`) by setting `PLAYWRIGHT_BASE_URL=http://localhost:3000` and `E2E_AUTH_BYPASS=1` + `E2E_AUTH_BYPASS_SECRET=<32+ char>` in your shell. Then `npx playwright test`.

## Out of scope (future iterations)

- **Argos visual regression** — deferred. When wired, the specs gain `argosScreenshot(page, name)` calls and the workflow runs `npx @argos-ci/cli upload` after tests with `ARGOS_TOKEN` in env. Step 1 ships without visual diff for time-box reasons; we add it once the smoke proves stable.
- **Neon per-PR database branching** — Step 2 concern. The dashboard does not currently talk to a database; once Supabase lands, this workflow gains a step that creates a Neon branch and injects `DATABASE_URL`.
- **OpenClaw Telegram escalation** — Step 4. For now, GitHub's native PR/check notifications cover failed smoke; OpenClaw daily digest wraps everything into the morning brief.
