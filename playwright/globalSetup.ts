// Playwright global setup — mints an HS256 bypass token, exchanges it for an
// Auth.js session cookie via /api/e2e/auth, and saves storage state to
// playwright/.auth/storageState.json. Every spec then loads that storage
// state via playwright.config.ts and starts each test signed in.
//
// Required env:
//   - PLAYWRIGHT_BASE_URL — the Vercel preview deploy URL
//   - E2E_AUTH_BYPASS_SECRET — same value as the Vercel Preview env scope
//     for /api/e2e/auth verification. Must be >= 32 chars.

import fs from "node:fs/promises"
import path from "node:path"

import { request } from "@playwright/test"
import { SignJWT } from "jose"

const STORAGE_STATE = path.resolve("playwright/.auth/storageState.json")
const SEEDED_E2E_EMAIL = "jacobbarkley95+e2e@gmail.com"
const BYPASS_TOKEN_TTL_SECONDS = 60

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL
  const secret = process.env.E2E_AUTH_BYPASS_SECRET

  if (!baseURL || baseURL.length === 0) {
    throw new Error("PLAYWRIGHT_BASE_URL is required in globalSetup")
  }
  if (!secret || secret.length === 0) {
    throw new Error("E2E_AUTH_BYPASS_SECRET is required in globalSetup")
  }
  if (secret.length < 32) {
    throw new Error("E2E_AUTH_BYPASS_SECRET must be at least 32 characters")
  }

  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({ email: SEEDED_E2E_EMAIL })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("e2e-playwright")
    .setAudience("claw-dashboard-e2e")
    .setIssuedAt(now)
    .setExpirationTime(now + BYPASS_TOKEN_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret))

  await fs.mkdir(path.dirname(STORAGE_STATE), { recursive: true })

  const ctx = await request.newContext({ baseURL })
  const res = await ctx.post("/api/e2e/auth", { data: { token } })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(
      `E2E auth bypass failed: ${res.status()} ${body.slice(0, 500)} — confirm E2E_AUTH_BYPASS=1 + E2E_AUTH_BYPASS_SECRET match on Vercel Preview scope`,
    )
  }
  await ctx.storageState({ path: STORAGE_STATE })
  await ctx.dispose()
}
